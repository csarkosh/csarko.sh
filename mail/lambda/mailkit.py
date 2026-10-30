"""The pure half of the mail Lambda: no AWS calls, no I/O.

Which alias a recipient is, what the policy does with a message, and how a forward and a
reverse-alias reply are rebuilt. Design: docs/superpowers/specs/2026-10-30-email-aliases-design.md,
section 5. The Lambda loads this as a flat module (`import mailkit`), so the folder it lives in
is not a package.
"""

import email.errors
import email.header
import email.policy
import email.utils
import re
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from email.parser import BytesHeaderParser
from typing import Literal, Optional

# RFC 2142 names plus the DMARC report sink: these can never be blocked (spec section 7).
PROTECTED = frozenset({"postmaster", "abuse", "dmarc"})

# A reverse alias's local part: "reply." and 12 characters of the lower-case base32 alphabet.
_REVERSE = re.compile(r"^reply\.([a-z2-7]{12})$")

Action = Literal["drop", "archive", "forward"]


@dataclass(frozen=True)
class Recipient:
    kind: Literal["alias", "reverse"]
    local: str  # the alias's local part, or the token for a reverse alias
    domain: str  # the base domain for an alias; the address's own domain for a reverse alias


def parse_recipient(address: str, base_domain: str) -> Optional[Recipient]:
    """Classify an envelope recipient. None when it is not at the base domain or a subdomain."""
    address = address.strip().lower()
    base_domain = base_domain.lower()
    local, sep, domain = address.rpartition("@")
    if not sep or not local:
        return None
    if domain != base_domain and not domain.endswith("." + base_domain):
        return None
    token = _REVERSE.match(local)
    if token:
        return Recipient("reverse", token.group(1), domain)
    return Recipient("alias", local, base_domain)


def policy(state: str, verdicts: dict, dmarc_policy: Optional[str]) -> tuple:
    """What happens to a message for an alias in `state`, given SES's verdicts.

    Returns (action, flag). The order is the spec's: a blocked alias drops everything, a virus
    drops, spam (or a DMARC failure the sender's own policy says to reject) is archived and
    flagged, an archive alias stores, a forward alias forwards.
    """
    if state == "block":
        return "drop", None
    if verdicts.get("virus") == "FAIL":
        return "drop", "virus"
    if verdicts.get("spam") == "FAIL" or (verdicts.get("dmarc") == "FAIL" and dmarc_policy == "reject"):
        return "archive", "spam"
    if state == "archive":
        return "archive", None
    return "forward", None


# ---------------------------------------------------------------------------------------------
# Headers, at the byte level. A forward changes a handful of header lines and nothing else, so
# the header block is split into lines and rejoined, and the body (every MIME part, every
# boundary, every attachment byte) is passed through exactly as it arrived.

# Headers a forward drops: the original route and the signatures that would fail after the
# From change (spec section 5.1, step 4), plus the receipt headers SES itself added.
_FORWARD_DROP = ("return-path", "dkim-signature", "received", "authentication-results", "received-spf", "sender",
                 # The headers a forward writes itself: an incoming copy would sit beside ours.
                 "x-alias")
_FORWARD_DROP_PREFIXES = ("arc-", "x-ses-", "x-original-")

# Any line break, the way the stdlib parser (and every mail client) sees one. Splitting a CRLF
# header block on CRLF alone would let a lone LF hide a header inside the previous one's value.
_EOL = re.compile(rb"\r\n|\r|\n")
_CONTROL = re.compile(r"[\x00-\x1f\x7f]+")
_MSGID = re.compile(rb"<[^<>\s]+>")


def _clean(text: str) -> str:
    """Text safe to put in a header we write: control characters (CR and LF above all) become spaces."""
    return _CONTROL.sub(" ", text).strip()


def _split(raw: bytes):
    """Split a message into (headers, eol, body). Each header is [name, value_bytes], where the
    value keeps its leading space and its folding; a line with no colon is kept as [None, line]."""
    ends = [(raw.find(sep), sep) for sep in (b"\r\n\r\n", b"\n\n") if raw.find(sep) >= 0]
    if ends:
        index, sep = min(ends)
        block, body = raw[:index], raw[index:]
        eol = b"\r\n" if sep.startswith(b"\r\n") else b"\n"
    else:
        block, body, eol = raw, b"", (b"\r\n" if b"\r\n" in raw else b"\n")
    headers = []
    for line in _EOL.split(block):
        if line[:1] in (b" ", b"\t") and headers:
            headers[-1][1] += eol + line
            continue
        name, colon, value = line.partition(b":")
        if colon and name and b" " not in name.strip():
            headers.append([name.decode("ascii", "replace").strip(), value])
        else:
            headers.append([None, line])
    return headers, eol, body


def _join(headers, eol: bytes, body: bytes) -> bytes:
    lines = [value if name is None else name.encode("ascii") + b":" + value for name, value in headers]
    return eol.join(lines) + body


def _values(raw: bytes, name: str) -> list:
    """Every value of one header, decoded from RFC 2047 and cleaned of control characters.

    The permissive compat32 parser is used on purpose: the default policy raises while merely
    reading an address header whose display name decodes to a line break, which would crash
    the Lambda on one hostile message."""
    message = BytesHeaderParser(policy=email.policy.compat32).parsebytes(raw)
    out = []
    for value in message.get_all(name) or []:
        try:
            text = str(email.header.make_header(email.header.decode_header(str(value))))
        except (UnicodeError, ValueError, LookupError, email.errors.HeaderParseError):
            text = str(value)
        out.append(_clean(text))
    return out


def _address(values: list) -> tuple:
    """(display name, lower-cased address) of the first address in the first value."""
    pairs = email.utils.getaddresses(values[:1]) if values else []
    name, addr = pairs[0] if pairs else ("", "")
    return _clean(name), addr.lower()


def _addresses(values: list) -> list:
    return [addr.lower() for _, addr in email.utils.getaddresses(values) if addr]


def summary(raw: bytes) -> dict:
    """The fields the message index keeps (spec section 6)."""
    name, addr = _address(_values(raw, "From"))
    reply_to = _values(raw, "Reply-To")

    def first(header):
        found = _values(raw, header)
        return found[0] if found else ""

    return {
        "from": addr,
        "from_name": name,
        "to": _addresses(_values(raw, "To")),
        "subject": first("Subject"),
        "date": first("Date"),
        "message_id": first("Message-ID"),
        "size": len(raw),
        "reply_to": _address(reply_to)[1] or None if reply_to else None,
    }


def _raw_value(headers, name: str) -> Optional[bytes]:
    for n, value in headers:
        if n is not None and n.lower() == name:
            return value.strip()
    return None


def _header(name: str, value: str):
    return [name, b" " + value.encode("ascii")]


def build_forward(raw: bytes, *, alias_local: str, base_domain: str, owner: str, reverse_alias: str, verdicts: dict) -> bytes:
    """The message the owner receives: From is the alias (so DKIM and DMARC pass at the owner's
    provider), Reply-To is the reverse alias, To is the owner, and the original sender and route
    are kept only in X- headers. Every other header and the whole body are untouched."""
    headers, eol, body = _split(raw)
    name, addr = _address(_values(raw, "From"))
    original_from = _raw_value(headers, "from")
    original_to = _raw_value(headers, "to")
    original_reply_to = _raw_value(headers, "reply-to")

    kept = []
    for n, value in headers:
        lower = (n or "").lower()
        if n is not None and (lower in _FORWARD_DROP or lower.startswith(_FORWARD_DROP_PREFIXES)):
            continue
        if lower in ("from", "to", "reply-to"):
            continue
        kept.append([n, value])

    display = f"{_clean(name) or _clean(addr)} via {base_domain}"
    added = [
        _header("From", email.utils.formataddr((display, f"{alias_local}@{base_domain}"), charset="utf-8")),
        _header("To", owner),
        _header("Reply-To", reverse_alias),
        _header("X-Alias", alias_local),
        _header("X-SES-Verdicts", " ".join(f"{k}={verdicts.get(k, 'NONE')}" for k in ("spam", "virus", "spf", "dkim", "dmarc"))),
    ]
    if original_from is not None:
        added.append(["X-Original-From", b" " + original_from])
    if original_to is not None:
        added.append(["X-Original-To", b" " + original_to])
    if original_reply_to is not None:
        added.append(["X-Original-Reply-To", b" " + original_reply_to])
    return _join(added + kept, eol, body)


# ---------------------------------------------------------------------------------------------
# Reverse aliases (spec section 5.2).

_TOKEN_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567"

# The only headers of the owner's reply that survive into the message the stranger receives.
_REPLY_KEEP = ("subject", "in-reply-to", "references", "date", "mime-version", "content-type", "content-transfer-encoding")


def mint_token() -> str:
    """12 characters of the lower-case base32 alphabet: 60 bits, never guessed."""
    return "".join(secrets.choice(_TOKEN_ALPHABET) for _ in range(12))


def is_owner(mail: dict, receipt: dict, raw: bytes, owner: str) -> bool:
    """Only the owner may send through a reverse alias: the SMTP envelope sender and the From
    header must both be the owner's address, and SES must have found the message DMARC-aligned
    for the owner's domain (Gmail signs everything it sends, so its own replies always pass)."""
    owner = owner.strip().lower()
    envelope = str(mail.get("source", "")).strip().lower()
    froms = _values(raw, "From")
    if len(froms) != 1 or len(_addresses(froms)) != 1:
        return False  # SES's DMARC check and our parser must be reading the same, single From
    header = _addresses(froms)[0]
    dmarc = (receipt.get("dmarcVerdict") or {}).get("status")
    return envelope == owner and header == owner and dmarc == "PASS"


def _utc_date(value: bytes) -> str:
    """The Date in UTC, so the stranger does not learn the owner's time zone."""
    try:
        when = email.utils.parsedate_to_datetime(value.decode("ascii", "replace").strip())
        if when.tzinfo is None:
            raise ValueError
    except (TypeError, ValueError):
        when = datetime.now(timezone.utc)
    return email.utils.format_datetime(when.astimezone(timezone.utc))


def build_reply(raw: bytes, *, alias_local: str, domain: str, alias_name: Optional[str], external: str) -> bytes:
    """The message the stranger receives when the owner replies to a reverse alias: rebuilt from
    an allow-list of headers, so nothing of the owner's mailbox (Received, X-Google-*, X-Gm-*,
    DKIM, Cc, the original Message-ID) survives. The body is passed through byte for byte."""
    headers, eol, body = _split(raw)
    own = _MSGID.search(_raw_value(headers, "message-id") or b"")
    own_domain = own.group(0)[1:-1].rpartition(b"@")[2].lower() if own else None
    kept = []
    for n, value in headers:
        lower = (n or "").lower()
        if lower not in _REPLY_KEEP:
            continue
        if lower in ("in-reply-to", "references"):
            # The owner's provider's own Message-IDs (an earlier reply of theirs) name the
            # provider and never reached the stranger; keep only the IDs the thread shares.
            ids = [i for i in _MSGID.findall(value) if i[1:-1].rpartition(b"@")[2].lower() != own_domain]
            if ids:
                kept.append([n, b" " + (eol + b" ").join(ids)])
            continue
        if lower == "date":
            kept.append(_header("Date", _utc_date(value)))
            continue
        kept.append([n, value])
    sender = f"{alias_local}@{domain}"
    added = [
        _header("From", email.utils.formataddr((_clean(alias_name), sender), charset="utf-8") if alias_name else sender),
        _header("To", external),
        _header("Message-ID", f"<{uuid.uuid4().hex}@{domain}>"),
    ]
    return _join(added + kept, eol, body)
