"""The mail Lambda: SES hands it each message after storing the raw copy in S3.

Two kinds of event:
- SES's receipt-rule event: for each envelope recipient at the domain, apply the alias policy
  (forward, archive, drop) or, for a reverse alias, send the owner's reply out as the alias.
- {"action": "forward", "message_id": "<SES id>"}: re-run the forward of a stored message (the
  `mail forward` command invokes this, since the skill never holds the owner's address).

Design: docs/superpowers/specs/2026-10-30-email-aliases-design.md, section 5. A failure to send
is recorded on the message's index row and never raised, so SES's async retries cannot turn one
refused send into duplicate forwards; the raw message is always in S3 to try again.
"""

import json
import os
import re
from dataclasses import dataclass
from typing import Optional

from mailkit import PROTECTED, build_forward, build_reply, is_owner, parse_recipient, policy, summary
from store import Store


@dataclass(frozen=True)
class Settings:
    domain: str
    owner: str
    bucket: str
    table: str
    config_set: str
    retention_days: int = 365
    events_topic: Optional[str] = None  # the SNS topic the owner subscribes to


# The largest message the Lambda will build a forward for. A forward holds a few copies of the
# message and botocore base64-encodes it, so 30 MB stays well inside the function's 1 GB; a
# larger one is kept in S3, marked, and the owner is told.
MAX_FORWARD_BYTES = 30 * 1024 * 1024

_deps = None


def deps():
    """(store, sesv2 client, sns client, settings), built once per container from the environment."""
    global _deps
    if _deps is None:
        import boto3

        settings = Settings(
            domain=os.environ["MAIL_DOMAIN"],
            owner=os.environ["MAIL_OWNER"],
            bucket=os.environ["MAIL_BUCKET"],
            table=os.environ["MAIL_TABLE"],
            config_set=os.environ["MAIL_CONFIG_SET"],
            retention_days=int(os.environ.get("MAIL_RETENTION_DAYS", "365")),
            events_topic=os.environ.get("MAIL_EVENTS_TOPIC") or None,
        )
        store = Store(settings.table, settings.bucket, retention_days=settings.retention_days)
        _deps = (store, boto3.client("sesv2"), boto3.client("sns"), settings)
    return _deps


def _print_log(record: dict) -> None:
    print(json.dumps(record, sort_keys=True))


# One JSON line per decision: ids, alias, action, flag, sent, error. Never an address of the
# owner's and never a subject or a body.
_log = _print_log


def send(ses, raw: bytes, *, from_address: str, to: list, config_set: str) -> str:
    response = ses.send_email(
        FromEmailAddress=from_address,
        Destination={"ToAddresses": list(to)},
        Content={"Raw": {"Data": raw}},
        ConfigurationSetName=config_set,
    )
    return response["MessageId"]


_ADDRESS = re.compile(r"[^\s<>(),;:\"']+@[^\s<>(),;:\"']+")


def _error_text(error: Exception) -> str:
    """The error for the index row and the log, with every address redacted: SES's sandbox
    refusal names the unverified identities, and the owner is one of them."""
    detail = getattr(error, "response", {}).get("Error", {})
    text = f"{detail['Code']}: {detail.get('Message', '')}" if detail.get("Code") else f"{type(error).__name__}: {error}"
    return _ADDRESS.sub("<address>", text).strip()


def notify(sns, settings, subject: str, text: str) -> None:
    """Tell the owner something went wrong, through the topic they subscribe to. Never raises:
    a failed notice must not turn into a retried (and duplicated) message."""
    if not settings.events_topic:
        return
    try:
        sns.publish(TopicArn=settings.events_topic, Subject=subject[:100], Message=text)
    except Exception as failure:
        _log({"notify_error": _error_text(failure)})


def _verdicts(receipt: dict) -> dict:
    keys = {"spam": "spamVerdict", "virus": "virusVerdict", "spf": "spfVerdict", "dkim": "dkimVerdict", "dmarc": "dmarcVerdict"}
    return {short: (receipt.get(long) or {}).get("status", "NONE") for short, long in keys.items()}


def handler(event: dict, context) -> dict:
    if event.get("action") == "forward" and event.get("message_id"):
        return _reforward(event["message_id"])
    records = event.get("Records") or []
    if not records or records[0].get("eventSource") != "aws:ses":
        raise ValueError("not an SES receipt event or a forward action")
    store, ses, sns, settings = deps()
    record = records[0]["ses"]
    mail, receipt = record["mail"], record["receipt"]
    message_id = mail["messageId"]
    key = f"raw/{message_id}"
    raw = store.read_raw(key)
    verdicts = _verdicts(receipt)
    info = summary(raw)
    results = []
    keep_raw = False  # true once any recipient's index row points at the raw copy
    for address in receipt.get("recipients") or mail.get("destination") or []:
        recipient = parse_recipient(address, settings.domain)
        if recipient is None:
            continue
        try:
            if recipient.kind == "reverse":
                result, keeps = _reverse(store, ses, sns, settings, recipient, mail, receipt, raw, key, info, verdicts, message_id)
            else:
                result, keeps = _alias(store, ses, sns, settings, recipient, raw, key, info, verdicts, message_id,
                                       receipt.get("dmarcPolicy"), address)
        except Exception as failure:
            # One recipient that cannot be handled (a hostile header, an address the mail
            # libraries refuse) is recorded and reported; the others still go through, and the
            # invocation does not fail, so SES does not retry and duplicate them.
            result, keeps = _failed(store, sns, settings, recipient, address, key, info, verdicts, message_id, failure), True
        keep_raw = keep_raw or keeps
        result = {"recipient": address, **result}
        _log({"message_id": message_id, **{k: v for k, v in result.items() if k != "recipient"},
              "alias": recipient.local if recipient.kind == "alias" else "reverse"})
        results.append(result)
    if not keep_raw:
        store.delete_raw(key)  # dropped by every recipient, or a reply already sent: store nothing
    return {"message_id": message_id, "results": results}


def _failed(store, sns, settings, recipient, address, key, info, verdicts, message_id, failure) -> dict:
    error = _error_text(failure)
    local = recipient.local if recipient.kind == "alias" else "unknown-reverse"
    try:
        sk = store.index_message(local, message_id, direction="in", summary=info, s3_key=key, verdicts=verdicts,
                                 forwarded=False, flags=["error"])
        store.mark_forwarded(local, sk, False, error)
    except Exception as again:
        _log({"message_id": message_id, "index_error": _error_text(again)})
    notify(sns, settings, "Mail could not be handled",
           f"A message (id {message_id}) to an address at {settings.domain} could not be handled: {error}. "
           "The raw copy is kept in S3.")
    return {"action": "error", "flag": "error", "sent": False}


def _alias(store, ses, sns, settings, recipient, raw, key, info, verdicts, message_id, dmarc_policy, address):
    """Returns (result, whether an index row now points at the raw copy)."""
    local = recipient.local
    row = store.ensure_alias(local, info["from"])
    state = row.get("state", "forward")
    if state == "block" and (row.get("protected") or local in PROTECTED):
        state = "forward"  # a protected alias is never blocked, whatever its row says
    action, flag = policy(state, verdicts, dmarc_policy)
    store.bump(local, blocked=(action == "drop"))
    if action == "drop":
        return {"action": "drop", "flag": flag, "sent": False}, False
    rcpt_domain = address.rpartition("@")[2].lower()
    sk = store.index_message(local, message_id, direction="in", summary={**info, "rcpt_domain": rcpt_domain}, s3_key=key,
                             verdicts=verdicts, forwarded=False, flags=[flag] if flag else [])
    if action == "archive":
        return {"action": "archive", "flag": flag, "sent": False}, True
    sent, _ = _forward(store, ses, sns, settings, local, rcpt_domain, raw, info, verdicts, sk, message_id)
    return {"action": "forward", "flag": None, "sent": sent}, True


def _forward(store, ses, sns, settings, local, rcpt_domain, raw, info, verdicts, sk, message_id):
    """Send one stored message to the owner and record the outcome on its index row."""
    if len(raw) > MAX_FORWARD_BYTES:
        error = f"too large to forward ({len(raw) // (1024 * 1024)} MB); read it with the mail skill"
        store.mark_forwarded(local, sk, False, error)
        notify(sns, settings, f"Mail to {local}@{settings.domain} was not forwarded",
               f"Message {message_id} to {local}@{settings.domain} was not forwarded: {error}.")
        return False, error
    token = store.token_for(local, info["from"])
    forward = build_forward(raw, alias_local=local, base_domain=settings.domain, owner=settings.owner,
                            reverse_alias=f"reply.{token}@{rcpt_domain}", verdicts=verdicts)
    try:
        send(ses, forward, from_address=f"{local}@{settings.domain}", to=[settings.owner], config_set=settings.config_set)
        error = None
    except Exception as failure:  # botocore ClientError above all: recorded, never raised
        error = _error_text(failure)
    store.mark_forwarded(local, sk, error is None, error)
    if error is not None:
        notify(sns, settings, f"Mail to {local}@{settings.domain} was not forwarded",
               f"Message {message_id} to {local}@{settings.domain} was not forwarded: {error}. "
               "It is kept; the mail skill's forward command tries again.")
    return error is None, error


def _reverse(store, ses, sns, settings, recipient, mail, receipt, raw, key, info, verdicts, message_id):
    """Returns (result, whether an index row now points at the raw copy)."""
    pair = store.pair_for(recipient.local)
    if pair is None or not is_owner(mail, receipt, raw, settings.owner):
        alias = pair[0] if pair else "unknown-reverse"
        store.index_message(alias, message_id, direction="in", summary=info, s3_key=key, verdicts=verdicts,
                            forwarded=False, flags=["misuse"])
        return {"action": "archive", "flag": "misuse", "sent": False}, True
    alias_local, external = pair
    alias_row = store.get_alias(alias_local) or {}
    reply = build_reply(raw, alias_local=alias_local, domain=settings.domain, alias_name=alias_row.get("name"),
                        external=external)
    try:
        sent_id = send(ses, reply, from_address=f"{alias_local}@{settings.domain}", to=[external],
                       config_set=settings.config_set)
    except Exception as failure:
        store.index_message(alias_local, message_id, direction="in", summary=info, s3_key=key, verdicts=verdicts,
                            forwarded=False, flags=["reply-failed"])
        error = _error_text(failure)
        _log({"message_id": message_id, "alias": alias_local, "error": error})
        notify(sns, settings, f"Your reply as {alias_local}@{settings.domain} was not sent",
               f"Your reply as {alias_local}@{settings.domain} (message {message_id}) was not sent: {error}.")
        return {"action": "reply", "flag": "reply-failed", "sent": False}, True
    sent_key = store.write_sent(sent_id, reply)
    store.index_message(alias_local, sent_id, direction="out", summary=summary(reply), s3_key=sent_key, verdicts=None,
                        forwarded=True, flags=[])
    # The owner's own message, with the owner's headers, is not kept (the handler deletes the
    # raw copy once no recipient's row points at it).
    return {"action": "reply", "flag": None, "sent": True}, False


def _reforward(message_id: str) -> dict:
    store, ses, sns, settings = deps()
    row = store.message_by_id(message_id)
    if row is None or row.get("direction") != "in":
        return {"message_id": message_id, "sent": False, "error": "no such message"}
    raw = store.read_raw(row["s3_key"])
    info = summary(raw)
    sent, error = _forward(store, ses, sns, settings, row["alias"], row.get("rcpt_domain", settings.domain), raw, info,
                           row.get("verdicts") or {}, row["sk"], message_id)
    _log({"message_id": message_id, "alias": row["alias"], "action": "reforward", "sent": sent, "error": error})
    return {"message_id": message_id, "sent": sent, "error": error}
