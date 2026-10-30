"""The pure half of the mail Lambda: no AWS calls, no I/O.

Which alias a recipient is, what the policy does with a message, and how a forward and a
reverse-alias reply are rebuilt. Design: docs/superpowers/specs/2026-10-30-email-aliases-design.md,
section 5. The Lambda loads this as a flat module (`import mailkit`), so the folder it lives in
is not a package.
"""

import re
from dataclasses import dataclass
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
