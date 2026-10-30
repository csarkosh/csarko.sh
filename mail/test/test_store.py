"""The table and the bucket, against in-memory fakes. Run with
`python3 -m unittest discover -s mail/test -v` from the repository root."""

import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "lambda"))
sys.path.insert(0, str(HERE))

from fakes import FakeS3, FakeTable  # noqa: E402
from store import ProtectedAlias, Store, alias_key, message_sk, pair_key  # noqa: E402

NOW = datetime(2026, 10, 30, 12, 0, 0, tzinfo=timezone.utc)
OK = {"spam": "PASS", "virus": "PASS", "spf": "PASS", "dkim": "PASS", "dmarc": "PASS"}
SUMMARY = {"from": "ada@example.com", "from_name": "Ada", "to": ["hello@csarko.sh"], "subject": "Hi",
           "date": "Thu, 30 Oct 2026 12:00:00 +0000", "message_id": "<m1@example.com>", "size": 120, "reply_to": None}


class Base(unittest.TestCase):
    def setUp(self):
        self.table, self.s3 = FakeTable(), FakeS3()
        self.store = Store("mail", "csarko-sh-mail", dynamodb=self.table, s3=self.s3, now=lambda: NOW)


class Keys(unittest.TestCase):
    def test_helpers(self):
        self.assertEqual(alias_key("hello"), {"pk": "ALIAS#hello", "sk": "ALIAS"})
        self.assertEqual(message_sk("2026-10-30T12:00:00+00:00", "m1"), "2026-10-30T12:00:00+00:00#m1")
        self.assertEqual(pair_key("hello", "ada@example.com"), {"pk": "PAIR#hello#ada@example.com", "sk": "PAIR"})


class EnsureAlias(Base):
    def test_creates_then_returns_existing(self):
        a = self.store.ensure_alias("hello", "ada@example.com")
        b = self.store.ensure_alias("hello", "bob@example.com")
        self.assertEqual(a["first_from"], "ada@example.com")
        self.assertEqual(b, a)  # the second writer lost the conditional put and got the row

    def test_new_row_shape(self):
        a = self.store.ensure_alias("hello", "ada@example.com")
        self.assertEqual((a["state"], a["count"], a["count_blocked"], a["protected"]), ("forward", 0, 0, False))
        self.assertEqual((a["created"], a["last_seen"]), ("2026-10-30T12:00:00+00:00",) * 2)

    def test_rfc2142_names_are_born_protected(self):
        self.assertTrue(self.store.ensure_alias("postmaster", "x@example.com")["protected"])

    def test_bump(self):
        self.store.ensure_alias("hello", "ada@example.com")
        self.store.bump("hello", blocked=False)
        self.store.bump("hello", blocked=True)
        row = self.store.get_alias("hello")
        self.assertEqual((row["count"], row["count_blocked"]), (1, 1))
        self.assertIsNone(self.store.get_alias("nobody"))


class SetState(Base):
    def test_block_protected_raises(self):
        self.table.seed({"pk": "ALIAS#postmaster", "sk": "ALIAS", "local": "postmaster", "state": "forward", "protected": True})
        with self.assertRaises(ProtectedAlias):
            self.store.set_state("postmaster", "block")
        self.assertEqual(self.store.get_alias("postmaster")["state"], "forward")

    def test_block_protected_name_even_without_the_flag(self):
        self.table.seed({"pk": "ALIAS#abuse", "sk": "ALIAS", "local": "abuse", "state": "forward"})
        with self.assertRaises(ProtectedAlias):
            self.store.set_state("abuse", "block")

    def test_block_normal(self):
        self.store.ensure_alias("spammy", "x@example.com")
        self.assertEqual(self.store.set_state("spammy", "block")["state"], "block")

    def test_name_and_note(self):
        row = self.store.set_state("tips", "forward", name="Tips", note="Stripe support")
        self.assertEqual((row["state"], row["name"], row["note"]), ("forward", "Tips", "Stripe support"))

    def test_unknown_state_refused(self):
        with self.assertRaises(ValueError):
            self.store.set_state("hello", "delete")


class Tokens(Base):
    def test_same_pair_same_token(self):
        self.assertEqual(self.store.token_for("hello", "ada@example.com"), self.store.token_for("hello", "ada@example.com"))

    def test_different_pair_different_token(self):
        self.assertNotEqual(self.store.token_for("hello", "ada@example.com"), self.store.token_for("hello", "bob@example.com"))

    def test_pair_for_round_trip(self):
        t = self.store.token_for("hello", "ada@example.com")
        self.assertEqual(self.store.pair_for(t), ("hello", "ada@example.com"))
        self.assertIsNone(self.store.pair_for("nosuchtoken22"))

    def test_concurrent_first_messages_share_one_token(self):
        # Another invocation wins the pair between our read and our write: our read saw nothing.
        winner = "winnerabcdef"
        self.table.seed({"pk": f"REPLY#{winner}", "sk": "REPLY", "alias": "hello", "external": "ada@example.com"})
        self.table.seed({**pair_key("hello", "ada@example.com"), "token": winner})
        real_get = self.table.get_item
        stale = {"left": 1}

        def get_item(Key, ConsistentRead=False):
            if Key["pk"].startswith("PAIR#") and stale["left"]:
                stale["left"] -= 1
                return {}
            return real_get(Key, ConsistentRead)

        self.table.get_item = get_item
        self.assertEqual(self.store.token_for("hello", "ada@example.com"), winner)
        replies = [k for k in self.table.items if k[0].startswith("REPLY#")]
        self.assertEqual(replies, [(f"REPLY#{winner}", "REPLY")])  # the loser cleaned up its token


class Index(Base):
    def test_message_by_id_and_expiry(self):
        self.store.index_message("hello", "m1", direction="in", summary=SUMMARY, s3_key="raw/m1", verdicts=OK, forwarded=True, flags=[])
        row = self.store.message_by_id("m1")
        self.assertEqual((row["pk"], row["sk"]), ("MSG#hello", "2026-10-30T12:00:00+00:00#m1"))
        self.assertEqual(row["expires"], int(NOW.timestamp()) + 365 * 86400)
        self.assertEqual((row["from"], row["subject"], row["s3_key"]), ("ada@example.com", "Hi", "raw/m1"))
        self.assertNotIn("reply_to", row)  # None values are left out

    def test_mark_forwarded(self):
        self.store.index_message("hello", "m1", direction="in", summary=SUMMARY, s3_key="raw/m1", verdicts=OK, forwarded=False, flags=[])
        sk = self.store.message_by_id("m1")["sk"]
        self.store.mark_forwarded("hello", sk, False, "MessageRejected: too big")
        self.assertEqual(self.store.message_by_id("m1")["error"], "MessageRejected: too big")
        self.store.mark_forwarded("hello", sk, True, None)
        row = self.store.message_by_id("m1")
        self.assertTrue(row["forwarded"])
        self.assertNotIn("error", row)

    def test_unknown_id(self):
        self.assertIsNone(self.store.message_by_id("nope"))


class Objects(Base):
    def test_raw_and_sent(self):
        self.s3.objects["raw/m1"] = b"hello"
        self.assertEqual(self.store.read_raw("raw/m1"), b"hello")
        self.store.delete_raw("raw/m1")
        self.assertNotIn("raw/m1", self.s3.objects)
        self.assertEqual(self.store.write_sent("abc", b"out"), "sent/abc")
        self.assertEqual(self.s3.objects["sent/abc"], b"out")


if __name__ == "__main__":
    unittest.main()
