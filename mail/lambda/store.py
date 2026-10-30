"""The mail system's state: one DynamoDB table and one S3 bucket (spec section 6).

| Item          | Key                                   | What                                  |
|---------------|---------------------------------------|---------------------------------------|
| Alias         | ALIAS#<local> / ALIAS                 | state, name, note, counts, first_from |
| Message       | MSG#<local> / <iso>#<message id>      | the index row of one message in or out|
| Reverse alias | REPLY#<token> / REPLY                 | the (alias, external) pair it stands for |
| Pair          | PAIR#<sha256 of [alias, external]> / PAIR | the one token for that pair       |

The pair item is written with a condition, so two invocations handling the first two messages
from one correspondent at once still agree on one token. The clients are injectable so the
tests run on fakes; boto3 is imported only when a real client is needed.
"""

import hashlib
import json
from datetime import datetime, timedelta, timezone
from typing import Callable, Optional

from mailkit import PROTECTED, mint_token

STATES = ("forward", "archive", "block")


class ProtectedAlias(Exception):
    """A protected alias (postmaster, abuse, dmarc, or one the owner listed) cannot be blocked."""


def alias_key(local: str) -> dict:
    return {"pk": f"ALIAS#{local}", "sk": "ALIAS"}


def message_sk(iso: str, message_id: str) -> str:
    return f"{iso}#{message_id}"


def pair_key(alias_local: str, external: str) -> dict:
    """Hashed, because both halves may contain "#": ("a#b", "c") and ("a", "b#c") must differ."""
    digest = hashlib.sha256(json.dumps([alias_local, external]).encode()).hexdigest()
    return {"pk": f"PAIR#{digest}", "sk": "PAIR"}


def _conditional_failed(error: Exception) -> bool:
    return getattr(error, "response", {}).get("Error", {}).get("Code") == "ConditionalCheckFailedException"


class Store:
    def __init__(self, table_name: str, bucket: str, *, dynamodb=None, s3=None, retention_days: int = 365,
                 now: Optional[Callable[[], datetime]] = None):
        if dynamodb is None or s3 is None:
            import boto3  # present in the Lambda runtime; not needed by the tests

            dynamodb = dynamodb if dynamodb is not None else boto3.resource("dynamodb").Table(table_name)
            s3 = s3 if s3 is not None else boto3.client("s3")
        self.table, self.s3, self.bucket = dynamodb, s3, bucket
        self.retention = timedelta(days=retention_days)
        self.now = now or (lambda: datetime.now(timezone.utc))

    def _iso(self) -> str:
        return self.now().isoformat(timespec="seconds")

    # -- aliases ---------------------------------------------------------------------------------
    def get_alias(self, local: str) -> Optional[dict]:
        return self.table.get_item(Key=alias_key(local), ConsistentRead=True).get("Item")

    def ensure_alias(self, local: str, first_from: str) -> dict:
        """The alias row, created on the first message to it (state forward)."""
        now = self._iso()
        row = {**alias_key(local), "local": local, "state": "forward", "created": now, "first_from": first_from,
               "last_seen": now, "count": 0, "count_blocked": 0, "protected": local in PROTECTED}
        try:
            self.table.put_item(Item=row, ConditionExpression="attribute_not_exists(pk)")
            return row
        except Exception as error:  # botocore ClientError
            if not _conditional_failed(error):
                raise
            return self.get_alias(local)

    def bump(self, local: str, *, blocked: bool) -> None:
        self.table.update_item(
            Key=alias_key(local),
            UpdateExpression="ADD #c :one SET last_seen = :now",
            ExpressionAttributeNames={"#c": "count_blocked" if blocked else "count"},
            ExpressionAttributeValues={":one": 1, ":now": self._iso()},
        )

    def set_state(self, local: str, state: str, *, name: Optional[str] = None, note: Optional[str] = None) -> dict:
        if state not in STATES:
            raise ValueError(f"state must be one of {', '.join(STATES)}: {state!r}")
        row = self.ensure_alias(local, "")
        if state == "block" and (row.get("protected") or local in PROTECTED):
            raise ProtectedAlias(local)
        sets, values = ["#s = :s"], {":s": state}
        if name is not None:
            sets.append("#n = :n")
            values[":n"] = name
        if note is not None:
            sets.append("note = :note")
            values[":note"] = note
        names = {"#s": "state", **({"#n": "name"} if name is not None else {})}
        return self.table.update_item(
            Key=alias_key(local),
            UpdateExpression="SET " + ", ".join(sets),
            ExpressionAttributeNames=names,
            ExpressionAttributeValues=values,
            ReturnValues="ALL_NEW",
        )["Attributes"]

    # -- the message index -----------------------------------------------------------------------
    def index_message(self, local: str, message_id: str, *, direction: str, summary: dict, s3_key: str,
                      verdicts: Optional[dict], forwarded: bool, flags: list) -> None:
        now = self.now()
        iso = now.isoformat(timespec="seconds")
        item = {
            "pk": f"MSG#{local}", "sk": message_sk(iso, message_id), "message_id": message_id, "alias": local,
            "direction": direction, "s3_key": s3_key, "forwarded": forwarded, "flags": list(flags),
            "received": iso, "expires": int((now + self.retention).timestamp()),
            **{k: v for k, v in summary.items() if k != "message_id"},
            "header_message_id": summary.get("message_id"),
            "verdicts": verdicts,
        }
        self.table.put_item(Item={k: v for k, v in item.items() if v is not None})

    def mark_forwarded(self, local: str, sk: str, forwarded: bool, error: Optional[str]) -> None:
        if error is None:
            self.table.update_item(Key={"pk": f"MSG#{local}", "sk": sk}, UpdateExpression="SET forwarded = :f REMOVE #e",
                                   ExpressionAttributeNames={"#e": "error"}, ExpressionAttributeValues={":f": forwarded})
        else:
            self.table.update_item(Key={"pk": f"MSG#{local}", "sk": sk}, UpdateExpression="SET forwarded = :f, #e = :e",
                                   ExpressionAttributeNames={"#e": "error"}, ExpressionAttributeValues={":f": forwarded, ":e": error})

    def message_by_id(self, message_id: str) -> Optional[dict]:
        rows = self.table.query(IndexName="by-id", KeyConditionExpression="message_id = :id",
                                ExpressionAttributeValues={":id": message_id})["Items"]
        return rows[0] if rows else None

    # -- reverse aliases -------------------------------------------------------------------------
    def token_for(self, alias_local: str, external: str) -> str:
        """The one token for (alias, external): reused when it exists, minted when it does not."""
        existing = self.table.get_item(Key=pair_key(alias_local, external), ConsistentRead=True).get("Item")
        if existing and self._token_matches(existing["token"], alias_local, external):
            return existing["token"]
        now = self._iso()
        for _ in range(3):
            token = mint_token()
            try:
                self.table.put_item(Item={"pk": f"REPLY#{token}", "sk": "REPLY", "token": token, "alias": alias_local,
                                          "external": external, "created": now, "last_used": now},
                                    ConditionExpression="attribute_not_exists(pk)")
                break
            except Exception as error:
                if not _conditional_failed(error):
                    raise
        else:
            raise RuntimeError("could not mint a unique reverse-alias token")
        pair = {**pair_key(alias_local, external), "token": token, "created": now}
        if existing:
            # A pair item whose token stands for some other pair is not trusted: replace it.
            self.table.put_item(Item=pair)
            return token
        try:
            self.table.put_item(Item=pair, ConditionExpression="attribute_not_exists(pk)")
            return token
        except Exception as error:
            if not _conditional_failed(error):
                raise
            # Another invocation claimed the pair first: use its token and drop ours.
            self.table.delete_item(Key={"pk": f"REPLY#{token}", "sk": "REPLY"})
            return self.table.get_item(Key=pair_key(alias_local, external), ConsistentRead=True)["Item"]["token"]

    def _token_matches(self, token: str, alias_local: str, external: str) -> bool:
        item = self.table.get_item(Key={"pk": f"REPLY#{token}", "sk": "REPLY"}, ConsistentRead=True).get("Item")
        return bool(item) and item.get("alias") == alias_local and item.get("external") == external

    def pair_for(self, token: str) -> Optional[tuple]:
        item = self.table.get_item(Key={"pk": f"REPLY#{token}", "sk": "REPLY"}, ConsistentRead=True).get("Item")
        if not item:
            return None
        self.table.update_item(Key={"pk": f"REPLY#{token}", "sk": "REPLY"}, UpdateExpression="SET last_used = :now",
                               ExpressionAttributeValues={":now": self._iso()})
        return item["alias"], item["external"]

    # -- the bucket ------------------------------------------------------------------------------
    def read_raw(self, key: str) -> bytes:
        return self.s3.get_object(Bucket=self.bucket, Key=key)["Body"].read()

    def delete_raw(self, key: str) -> None:
        self.s3.delete_object(Bucket=self.bucket, Key=key)

    def write_sent(self, message_id: str, raw: bytes) -> str:
        key = f"sent/{message_id}"
        self.s3.put_object(Bucket=self.bucket, Key=key, Body=raw)
        return key
