"""The pure half of the mail Lambda: recipients, policy, header rewriting, tokens.
Run with `python3 -m unittest discover -s mail/test -v` from the repository root."""

import email
import email.policy
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "lambda"))

from mailkit import Recipient, build_forward, parse_recipient, policy, summary  # noqa: E402

FIX = {p.stem: p.read_bytes() for p in (HERE / "fixtures").glob("*.eml")}
OK = {"spam": "PASS", "virus": "PASS", "spf": "PASS", "dkim": "PASS", "dmarc": "PASS"}


def parse(raw):
    return email.message_from_bytes(raw, policy=email.policy.default)


def payloads(message):
    return [part.get_payload() for part in message.walk() if not part.is_multipart()]


class ParseRecipient(unittest.TestCase):
    def test_alias_is_lowercased(self):
        self.assertEqual(parse_recipient("Alias@CSARKO.SH", "csarko.sh"), Recipient("alias", "alias", "csarko.sh"))

    def test_subdomain_alias_maps_to_base_domain(self):
        self.assertEqual(parse_recipient("hello@test.csarko.sh", "csarko.sh"), Recipient("alias", "hello", "csarko.sh"))

    def test_reverse_alias_keeps_its_domain(self):
        self.assertEqual(
            parse_recipient("reply.abc234def567@test.csarko.sh", "csarko.sh"),
            Recipient("reverse", "abc234def567", "test.csarko.sh"),
        )

    def test_foreign_domain_is_none(self):
        self.assertIsNone(parse_recipient("x@notcsarko.sh", "csarko.sh"))

    def test_reply_prefix_without_a_token_is_an_alias(self):
        self.assertEqual(parse_recipient("reply.later@csarko.sh", "csarko.sh"), Recipient("alias", "reply.later", "csarko.sh"))


class Policy(unittest.TestCase):
    OK = {"spam": "PASS", "virus": "PASS", "spf": "PASS", "dkim": "PASS", "dmarc": "PASS"}

    def test_block_drops_even_clean_mail(self):
        self.assertEqual(policy("block", self.OK, None), ("drop", None))

    def test_virus_drops_before_spam(self):
        self.assertEqual(policy("forward", {**self.OK, "virus": "FAIL", "spam": "FAIL"}, None), ("drop", "virus"))

    def test_spam_archives(self):
        self.assertEqual(policy("forward", {**self.OK, "spam": "FAIL"}, None), ("archive", "spam"))

    def test_dmarc_fail_with_reject_archives(self):
        self.assertEqual(policy("forward", {**self.OK, "dmarc": "FAIL"}, "reject"), ("archive", "spam"))

    def test_dmarc_fail_with_none_forwards(self):
        self.assertEqual(policy("forward", {**self.OK, "dmarc": "FAIL"}, "none"), ("forward", None))

    def test_archive_state(self):
        self.assertEqual(policy("archive", self.OK, None), ("archive", None))

    def test_gray_verdict_forwards(self):
        self.assertEqual(policy("forward", {**self.OK, "spam": "GRAY"}, None), ("forward", None))


class Summary(unittest.TestCase):
    def test_plain(self):
        s = summary(FIX["plain"])
        self.assertEqual((s["from"], s["from_name"], s["subject"]), ("ada@example.com", "Ada Example", "Hello there"))
        self.assertEqual(s["size"], len(FIX["plain"]))
        self.assertEqual((s["message_id"], s["to"]), ("<plain-1@example.com>", ["hello@csarko.sh"]))
        self.assertIsNone(s["reply_to"])

    def test_reply_to_is_bare_lowercase(self):
        self.assertEqual(summary(FIX["reply-to"])["reply_to"], "list-bounces@example.com")

    def test_no_display_name(self):
        s = summary(FIX["html-attachment"])
        self.assertEqual((s["from"], s["from_name"]), ("bob@example.com", ""))
        self.assertEqual(s["to"], ["hello@csarko.sh", "other@example.org"])


class BuildForward(unittest.TestCase):
    ARGS = dict(
        alias_local="hello",
        base_domain="csarko.sh",
        owner="owner@example.net",
        reverse_alias="reply.abc234def567@csarko.sh",
        verdicts=OK,
    )

    def test_from_is_alias_with_via_name(self):
        m = parse(build_forward(FIX["plain"], **self.ARGS))
        self.assertEqual(m["From"], '"Ada Example via csarko.sh" <hello@csarko.sh>')

    def test_no_display_name_uses_address(self):
        m = parse(build_forward(FIX["html-attachment"], **self.ARGS))
        self.assertEqual(m["From"], '"bob@example.com via csarko.sh" <hello@csarko.sh>')

    def test_reply_to_is_reverse_alias_and_original_kept(self):
        m = parse(build_forward(FIX["reply-to"], **self.ARGS))
        self.assertEqual(m["Reply-To"], "reply.abc234def567@csarko.sh")
        self.assertEqual(m["X-Original-Reply-To"], "list-bounces@example.com")
        self.assertEqual(len(m.get_all("Reply-To")), 1)

    def test_stripped_and_added_headers(self):
        m = parse(build_forward(FIX["plain"], **self.ARGS))
        for h in ("Return-Path", "DKIM-Signature", "Received", "Authentication-Results"):
            self.assertIsNone(m[h], h)
        self.assertEqual(m["To"], "owner@example.net")
        self.assertEqual(m["X-Original-From"], '"Ada Example" <ada@example.com>')
        self.assertEqual(m["X-Original-To"], "hello@csarko.sh")
        self.assertEqual(m["X-Alias"], "hello")
        self.assertEqual(m["X-SES-Verdicts"], "spam=PASS virus=PASS spf=PASS dkim=PASS dmarc=PASS")
        self.assertIsNone(m["X-Original-Reply-To"])

    def test_thread_headers_and_body_untouched(self):
        orig, m = parse(FIX["reply-to"]), parse(build_forward(FIX["reply-to"], **self.ARGS))
        for h in ("Message-ID", "In-Reply-To", "References", "Date", "Subject"):
            self.assertEqual(m[h], orig[h], h)
        self.assertEqual(m.get_payload(), orig.get_payload())

    def test_attachment_bytes_identical(self):
        raw = FIX["html-attachment"]
        out = build_forward(raw, **self.ARGS)
        self.assertTrue(out.endswith(raw[raw.index(b"\n\n"):]))
        self.assertEqual(payloads(parse(out)), payloads(parse(raw)))

    def test_crlf_message(self):
        raw = FIX["plain"].replace(b"\n", b"\r\n")
        out = build_forward(raw, **self.ARGS)
        self.assertNotIn(b"\r\r", out)
        self.assertNotIn(b"Received:", out)
        self.assertEqual(parse(out)["From"], '"Ada Example via csarko.sh" <hello@csarko.sh>')
        self.assertTrue(out.endswith(raw[raw.index(b"\r\n\r\n"):]))

    def test_non_ascii_display_name_is_encoded(self):
        raw = FIX["plain"].replace(b'"Ada Example"', b"=?utf-8?q?Ad=C3=A1?=")
        out = build_forward(raw, **self.ARGS)
        out.decode("ascii")  # headers we write stay 7-bit
        self.assertEqual(parse(out)["From"].addresses[0].display_name, "Adá via csarko.sh")


if __name__ == "__main__":
    unittest.main()
