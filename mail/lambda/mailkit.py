"""The pure half of the mail Lambda: no AWS calls, no I/O.

Which alias a recipient is, what the policy does with a message, and how a forward and a
reverse-alias reply are rebuilt. Design: docs/superpowers/specs/2026-10-30-email-aliases-design.md,
section 5. The Lambda loads this as a flat module (`import mailkit`), so the folder it lives in
is not a package.
"""

import email.policy
import email.utils
import re
import secrets
import uuid
from dataclasses import dataclass
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
_FORWARD_DROP = ("return-path", "dkim-signature", "received", "authentication-results", "received-spf", "sender")
_FORWARD_DROP_PREFIXES = ("arc-", "x-ses-")


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
    for line in block.split(eol):
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


def _parsed_headers(raw: bytes):
    return BytesHeaderParser(policy=email.policy.default).parsebytes(raw)


def _address(header) -> tuple:
    """(display name, lower-cased address) of the first address in an address header."""
    if header is None:
        return "", ""
    try:
        first = header.addresses[0]
        return first.display_name or "", first.addr_spec.lower()
    except (AttributeError, IndexError, TypeError):
        name, addr = email.utils.parseaddr(str(header))
        return name, addr.lower()


def _addresses(header) -> list:
    if header is None:
        return []
    try:
        return [a.addr_spec.lower() for a in header.addresses]
    except (AttributeError, TypeError):
        return [addr.lower() for _, addr in email.utils.getaddresses([str(header)]) if addr]


def summary(raw: bytes) -> dict:
    """The fields the message index keeps (spec section 6)."""
    h = _parsed_headers(raw)
    name, addr = _address(h["From"])
    reply_to = _address(h["Reply-To"])[1] if h["Reply-To"] is not None else None
    return {
        "from": addr,
        "from_name": name,
        "to": _addresses(h["To"]),
        "subject": str(h["Subject"] or ""),
        "date": str(h["Date"] or ""),
        "message_id": str(h["Message-ID"] or "").strip(),
        "size": len(raw),
        "reply_to": reply_to or None,
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
    name, addr = _address(_parsed_headers(raw)["From"])
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

    display = f"{name or addr} via {base_domain}"
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
    header = _address(_parsed_headers(raw)["From"])[1]
    dmarc = (receipt.get("dmarcVerdict") or {}).get("status")
    return envelope == owner and header == owner and dmarc == "PASS"


def build_reply(raw: bytes, *, alias_local: str, domain: str, alias_name: Optional[str], external: str) -> bytes:
    """The message the stranger receives when the owner replies to a reverse alias: rebuilt from
    an allow-list of headers, so nothing of the owner's mailbox (Received, X-Google-*, X-Gm-*,
    DKIM, Cc, the original Message-ID) survives. The body is passed through byte for byte."""
    headers, eol, body = _split(raw)
    kept = [[n, value] for n, value in headers if n is not None and n.lower() in _REPLY_KEEP]
    sender = f"{alias_local}@{domain}"
    added = [
        _header("From", email.utils.formataddr((alias_name, sender), charset="utf-8") if alias_name else sender),
        _header("To", external),
        _header("Message-ID", f"<{uuid.uuid4().hex}@{domain}>"),
    ]
    return _join(added + kept, eol, body)
