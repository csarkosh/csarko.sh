"""The Lambda handler end to end, on the in-memory table, bucket and SES. Run with
`python3 -m unittest discover -s mail/test -v` from the repository root."""

import email
import email.policy
import json
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "lambda"))
sys.path.insert(0, str(HERE))

import inbound  # noqa: E402
from fakes import FakeS3, FakeSES, FakeSNS, FakeTable  # noqa: E402
from inbound import Settings, handler  # noqa: E402
from store import Store  # noqa: E402

NOW = datetime(2026, 10, 30, 12, 0, 0, tzinfo=timezone.utc)
OK = {"spam": "PASS", "virus": "PASS", "spf": "PASS", "dkim": "PASS", "dmarc": "PASS"}
FIX = {p.stem: p.read_bytes() for p in (HERE / "fixtures").glob("*.eml")}
OWNER = "owner@example.net"


def parse(raw):
    return email.message_from_bytes(raw, policy=email.policy.default)


def ses_event(message_id, source, recipients, verdicts, dmarc_policy=None):
    """The payload SES's Lambda action delivers (the message itself is in S3)."""
    receipt = {
        "recipients": recipients,
        "spamVerdict": {"status": verdicts["spam"]},
        "virusVerdict": {"status": verdicts["virus"]},
        "spfVerdict": {"status": verdicts["spf"]},
        "dkimVerdict": {"status": verdicts["dkim"]},
        "dmarcVerdict": {"status": verdicts["dmarc"]},
        "action": {"type": "Lambda", "invocationType": "Event"},
    }
    if dmarc_policy:
        receipt["dmarcPolicy"] = dmarc_policy
    return {"Records": [{"eventSource": "aws:ses", "eventVersion": "1.0", "ses": {
        "mail": {"messageId": message_id, "source": source, "destination": recipients, "timestamp": NOW.isoformat()},
        "receipt": receipt,
    }}]}


class Base(unittest.TestCase):
    RAW = "plain"

    def setUp(self):
        self.table, self.s3, self.ses, self.sns = FakeTable(), FakeS3(), FakeSES(), FakeSNS()
        self.store = Store("mail", "csarko-sh-mail", dynamodb=self.table, s3=self.s3, now=lambda: NOW)
        self.settings = Settings(domain="csarko.sh", owner=OWNER, bucket="csarko-sh-mail", table="mail",
                                 config_set="mail", retention_days=365, events_topic="arn:aws:sns:us-east-2:1:mail-events")
        inbound._deps = (self.store, self.ses, self.sns, self.settings)
        self.logs = []
        inbound._log = self.logs.append

    def tearDown(self):
        inbound._deps = None
        inbound._log = inbound._print_log

    def deliver(self, message_id, source, recipients, verdicts=OK, raw=None, **kw):
        self.s3.objects[f"raw/{message_id}"] = raw if raw is not None else FIX[self.RAW]
        return handler(ses_event(message_id, source, recipients, verdicts, **kw), None)


class Forward(Base):
    def test_new_alias_is_created_and_forwarded(self):
        out = self.deliver("m1", "ada@example.com", ["Hello@csarko.sh"])
        self.assertEqual(out["results"][0], {"recipient": "Hello@csarko.sh", "action": "forward", "flag": None, "sent": True})
        sent = self.ses.calls[0]
        self.assertEqual((sent["FromEmailAddress"], sent["Destination"]["ToAddresses"]), ("hello@csarko.sh", [OWNER]))
        self.assertEqual(sent["ConfigurationSetName"], "mail")
        token = self.store.token_for("hello", "ada@example.com")
        self.assertEqual(parse(sent["Content"]["Raw"]["Data"])["Reply-To"], f"reply.{token}@csarko.sh")
        self.assertEqual(self.store.get_alias("hello")["count"], 1)
        row = self.store.message_by_id("m1")
        self.assertTrue(row["forwarded"])
        self.assertEqual((row["direction"], row["s3_key"], row["verdicts"]), ("in", "raw/m1", OK))

    def test_trial_subdomain_reverse_alias_uses_that_domain(self):
        self.deliver("m2", "ada@example.com", ["hello@test.csarko.sh"])
        self.assertTrue(parse(self.ses.calls[0]["Content"]["Raw"]["Data"])["Reply-To"].endswith("@test.csarko.sh"))
        self.assertEqual(self.ses.calls[0]["FromEmailAddress"], "hello@csarko.sh")

    def test_send_failure_leaves_row_unforwarded(self):
        self.ses.fail_with("MessageRejected")
        out = self.deliver("m3", "ada@example.com", ["hello@csarko.sh"])
        self.assertFalse(out["results"][0]["sent"])
        row = self.store.message_by_id("m3")
        self.assertFalse(row["forwarded"])
        self.assertIn("MessageRejected", row["error"])

    def test_a_large_message_ses_refuses_is_kept_not_retried(self):
        self.ses.fail_with("MessageRejected")
        raw = FIX["plain"] + b"x" * (39 * 1024 * 1024)
        out = self.deliver("m3b", "ada@example.com", ["hello@csarko.sh"], raw=raw)  # no exception escapes
        self.assertEqual(out["results"][0]["action"], "forward")
        self.assertIn("raw/m3b", self.s3.objects)

    def test_forward_is_recorded_even_when_the_id_index_lags(self):
        # A global secondary index is eventually consistent: right after the write it may not
        # return the row yet. The handler must not depend on reading its own write through it.
        real_query = self.table.query
        self.table.query = lambda **kw: {"Items": []} if kw.get("IndexName") == "by-id" else real_query(**kw)
        self.deliver("m3c", "ada@example.com", ["hello@csarko.sh"])
        self.table.query = real_query
        self.assertTrue(self.store.message_by_id("m3c")["forwarded"])

    def test_ses_error_text_never_carries_an_address(self):
        # SES's sandbox refusal names the unverified identities, the owner among them.
        self.ses.fail_with("MessageRejected", f"Email address is not verified. The following identities failed the check in region US-EAST-2: {OWNER}, ada@example.com")
        self.deliver("m3d", "ada@example.com", ["hello@csarko.sh"])
        row = self.store.message_by_id("m3d")
        self.assertIn("MessageRejected", row["error"])
        for text in (row["error"], json.dumps(self.logs)):
            self.assertNotIn(OWNER, text)
            self.assertNotIn("ada@example.com", text)
        self.ses.fail_with("MessageRejected", f"identities failed the check: {OWNER}")
        handler({"action": "forward", "message_id": "m3d"}, None)
        self.assertNotIn(OWNER, json.dumps(self.logs))

    def test_foreign_recipients_are_ignored(self):
        out = self.deliver("m8", "ada@example.com", ["someone@example.org", "hello@csarko.sh"])
        self.assertEqual([r["recipient"] for r in out["results"]], ["hello@csarko.sh"])

    def test_logs_never_carry_the_owner_or_the_subject(self):
        self.deliver("m9", "ada@example.com", ["hello@csarko.sh"])
        text = json.dumps(self.logs)
        self.assertNotIn(OWNER, text)
        self.assertNotIn("Hello there", text)
        self.assertIn('"action": "forward"', text)


class FinalReview(Base):
    """Findings of the whole-branch review (2026-10-30)."""

    def test_a_message_too_large_to_forward_is_recorded_not_sent(self):
        limit, inbound.MAX_FORWARD_BYTES = inbound.MAX_FORWARD_BYTES, 1000
        try:
            out = self.deliver("big1", "ada@example.com", ["hello@csarko.sh"], raw=FIX["plain"] + b"x" * 2000)
        finally:
            inbound.MAX_FORWARD_BYTES = limit
        self.assertFalse(out["results"][0]["sent"])
        self.assertEqual(self.ses.calls, [])
        self.assertIn("too large to forward", self.store.message_by_id("big1")["error"])
        self.assertEqual(len(self.sns.published), 1)  # the owner hears about it

    def test_the_forward_limit_leaves_room_under_the_lambdas_memory(self):
        self.assertLessEqual(inbound.MAX_FORWARD_BYTES, 30 * 1024 * 1024)

    def test_a_recipient_that_fails_is_recorded_and_the_rest_continue(self):
        out = self.deliver("u1", "ada@example.com", ["jos\u00e9@csarko.sh", "hello@csarko.sh"])
        self.assertEqual([r["action"] for r in out["results"]], ["error", "forward"])
        self.assertTrue(out["results"][1]["sent"])
        rows = [r for r in self.table.items.values() if r.get("message_id") == "u1" and "error" in (r.get("flags") or [])]
        self.assertEqual(len(rows), 1)
        self.assertNotIn(OWNER, json.dumps(self.sns.published))
        self.assertEqual(len(self.sns.published), 1)

    def test_a_failed_reply_tells_the_owner(self):
        token = self.store.token_for("hello", "ada@example.com")
        self.ses.fail_with("MessageRejected", "Email address is not verified: ada@example.com")
        self.deliver("rf1", OWNER, [f"reply.{token}@csarko.sh"], raw=FIX["gmail-reply"])
        self.assertEqual(len(self.sns.published), 1)
        note = self.sns.published[0]
        self.assertEqual(note["TopicArn"], "arn:aws:sns:us-east-2:1:mail-events")
        self.assertIn("hello@csarko.sh", note["Message"])
        self.assertIn("MessageRejected", note["Message"])
        self.assertNotIn("ada@example.com", note["Message"])

    def test_a_blocked_alias_stores_nothing(self):
        self.store.set_state("spammy", "block")
        self.deliver("b1", "x@example.com", ["spammy@csarko.sh"])
        self.assertNotIn("raw/b1", self.s3.objects)

    def test_raw_is_kept_while_any_recipient_still_points_at_it(self):
        self.store.set_state("spammy", "block")
        self.deliver("b2", "x@example.com", ["spammy@csarko.sh", "hello@csarko.sh"])
        self.assertIn("raw/b2", self.s3.objects)
        self.assertEqual(self.store.message_by_id("b2")["s3_key"], "raw/b2")

    def test_raw_is_kept_when_a_reply_and_an_alias_share_a_message(self):
        token = self.store.token_for("hello", "ada@example.com")
        self.deliver("rb1", OWNER, [f"reply.{token}@csarko.sh", "notes@csarko.sh"], raw=FIX["gmail-reply"])
        self.assertIn("raw/rb1", self.s3.objects)  # notes@ forwarded it and its row points here


class PolicyPaths(Base):
    def test_blocked_alias_drops_and_counts(self):
        self.store.ensure_alias("spammy", "x@example.com")
        self.store.set_state("spammy", "block")
        out = self.deliver("m4", "x@example.com", ["spammy@csarko.sh"])
        self.assertEqual(out["results"][0]["action"], "drop")
        self.assertEqual(self.ses.calls, [])
        self.assertIsNone(self.store.message_by_id("m4"))
        self.assertEqual(self.store.get_alias("spammy")["count_blocked"], 1)

    def test_a_protected_alias_in_block_state_still_forwards(self):
        self.table.seed({"pk": "ALIAS#postmaster", "sk": "ALIAS", "local": "postmaster", "state": "block", "protected": True,
                         "count": 0, "count_blocked": 0})
        out = self.deliver("m4b", "x@example.com", ["postmaster@csarko.sh"])
        self.assertEqual(out["results"][0]["action"], "forward")

    def test_virus_deletes_raw(self):
        self.deliver("m5", "x@example.com", ["hello@csarko.sh"], {**OK, "virus": "FAIL"})
        self.assertNotIn("raw/m5", self.s3.objects)
        self.assertIsNone(self.store.message_by_id("m5"))

    def test_spam_archives(self):
        out = self.deliver("m6", "x@example.com", ["hello@csarko.sh"], {**OK, "spam": "FAIL"})
        self.assertEqual(out["results"][0]["action"], "archive")
        self.assertEqual(self.store.message_by_id("m6")["flags"], ["spam"])
        self.assertEqual(self.ses.calls, [])

    def test_dmarc_reject_policy_archives(self):
        out = self.deliver("m6b", "x@example.com", ["hello@csarko.sh"], {**OK, "dmarc": "FAIL"}, dmarc_policy="reject")
        self.assertEqual((out["results"][0]["action"], out["results"][0]["flag"]), ("archive", "spam"))

    def test_archive_alias_stores_without_forwarding(self):
        self.store.set_state("dmarc", "archive")
        out = self.deliver("m6c", "reports@example.com", ["dmarc@csarko.sh"])
        self.assertEqual(out["results"][0]["action"], "archive")
        self.assertFalse(self.store.message_by_id("m6c")["forwarded"])


class Reverse(Base):
    RAW = "gmail-reply"

    def setUp(self):
        super().setUp()
        self.token = self.store.token_for("hello", "ada@example.com")

    def test_owner_reply_goes_out_as_alias(self):
        out = self.deliver("r1", OWNER, [f"reply.{self.token}@csarko.sh"])
        self.assertTrue(out["results"][0]["sent"])
        sent = self.ses.calls[0]
        self.assertEqual((sent["FromEmailAddress"], sent["Destination"]["ToAddresses"]), ("hello@csarko.sh", ["ada@example.com"]))
        body = sent["Content"]["Raw"]["Data"]
        self.assertNotIn(OWNER.encode(), body[: body.index(b"\n\n")])
        mid = self.ses.message_ids[0]
        row = self.store.message_by_id(mid)
        self.assertEqual((row["direction"], row["alias"], row["s3_key"]), ("out", "hello", f"sent/{mid}"))
        self.assertIn(f"sent/{mid}", self.s3.objects)

    def test_alias_display_name_is_used(self):
        self.store.set_state("hello", "forward", name="Hello Desk")
        self.deliver("r1b", OWNER, [f"reply.{self.token}@csarko.sh"])
        self.assertEqual(parse(self.ses.calls[0]["Content"]["Raw"]["Data"])["From"], "Hello Desk <hello@csarko.sh>")

    def test_forged_envelope_with_dmarc_fail_is_misuse(self):
        out = self.deliver("r2", OWNER, [f"reply.{self.token}@csarko.sh"], {**OK, "dmarc": "FAIL"})
        self.assertEqual((out["results"][0]["action"], out["results"][0]["flag"]), ("archive", "misuse"))
        self.assertEqual(self.ses.calls, [])
        self.assertEqual(self.store.message_by_id("r2")["flags"], ["misuse"])

    def test_stranger_using_a_real_token_is_misuse(self):
        out = self.deliver("r2b", "ada@example.com", [f"reply.{self.token}@csarko.sh"], raw=FIX["plain"])
        self.assertEqual(out["results"][0]["flag"], "misuse")
        self.assertEqual(self.ses.calls, [])

    def test_unknown_token_is_misuse(self):
        out = self.deliver("r3", OWNER, ["reply.zzzzzzzzzzzz@csarko.sh"])
        self.assertEqual(out["results"][0]["flag"], "misuse")
        self.assertEqual(self.ses.calls, [])
        self.assertEqual(self.store.message_by_id("r3")["alias"], "unknown-reverse")


class DirectForward(Base):
    def test_reforward_by_id(self):
        self.ses.fail_with("MessageRejected")
        self.deliver("m7", "ada@example.com", ["hello@test.csarko.sh"])
        self.ses.fail_with(None)
        out = handler({"action": "forward", "message_id": "m7"}, None)
        self.assertEqual(out, {"message_id": "m7", "sent": True, "error": None})
        row = self.store.message_by_id("m7")
        self.assertTrue(row["forwarded"])
        self.assertNotIn("error", row)
        self.assertTrue(parse(self.ses.calls[0]["Content"]["Raw"]["Data"])["Reply-To"].endswith("@test.csarko.sh"))

    def test_reforward_unknown_id(self):
        self.assertEqual(handler({"action": "forward", "message_id": "nope"}, None),
                         {"message_id": "nope", "sent": False, "error": "no such message"})

    def test_unknown_event_raises(self):
        with self.assertRaises(ValueError):
            handler({"hello": 1}, None)


if __name__ == "__main__":
    unittest.main()
