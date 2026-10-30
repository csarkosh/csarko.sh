"""The pure half of the mail Lambda: recipients, policy, header rewriting, tokens.
Run with `python3 -m unittest discover -s mail/test -v` from the repository root."""

import email
import email.policy
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "lambda"))

from mailkit import Recipient, build_forward, build_reply, is_owner, mint_token, parse_recipient, policy, summary  # noqa: E402

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


class Tokens(unittest.TestCase):
    def test_shape(self):
        t = mint_token()
        self.assertRegex(t, r"^[a-z2-7]{12}$")
        self.assertNotEqual(t, mint_token())

    def test_a_minted_token_parses_as_a_reverse_alias(self):
        t = mint_token()
        self.assertEqual(parse_recipient(f"reply.{t}@csarko.sh", "csarko.sh"), Recipient("reverse", t, "csarko.sh"))


class IsOwner(unittest.TestCase):
    MAIL = {"source": "owner@example.net"}
    PASS = {"dmarcVerdict": {"status": "PASS"}}

    def test_all_three_conditions(self):
        self.assertTrue(is_owner(self.MAIL, self.PASS, FIX["gmail-reply"], "owner@example.net"))

    def test_case_does_not_matter(self):
        self.assertTrue(is_owner({"source": "Owner@Example.NET"}, self.PASS, FIX["gmail-reply"], "OWNER@example.net"))

    def test_dmarc_fail_is_not_owner(self):
        self.assertFalse(is_owner(self.MAIL, {"dmarcVerdict": {"status": "FAIL"}}, FIX["gmail-reply"], "owner@example.net"))

    def test_missing_dmarc_verdict_is_not_owner(self):
        self.assertFalse(is_owner(self.MAIL, {}, FIX["gmail-reply"], "owner@example.net"))

    def test_envelope_mismatch_is_not_owner(self):
        self.assertFalse(is_owner({"source": "bounce@example.com"}, self.PASS, FIX["gmail-reply"], "owner@example.net"))

    def test_header_mismatch_is_not_owner(self):
        self.assertFalse(is_owner(self.MAIL, self.PASS, FIX["plain"], "owner@example.net"))


class BuildReply(unittest.TestCase):
    def built(self, name=None):
        raw = build_reply(FIX["gmail-reply"], alias_local="hello", domain="csarko.sh", alias_name=name, external="ada@example.com")
        return raw, parse(raw)

    def test_from_and_to(self):
        _, m = self.built()
        self.assertEqual((m["From"], m["To"]), ("hello@csarko.sh", "ada@example.com"))
        self.assertEqual(self.built("Tips")[1]["From"], "Tips <hello@csarko.sh>")

    def test_gmail_headers_gone(self):
        raw, m = self.built()
        leaked = [k for k in m.keys() if k.lower().startswith(("x-", "received", "dkim", "return-path", "cc", "bcc", "reply-to"))]
        self.assertEqual(leaked, [])
        self.assertTrue(m["Message-ID"].endswith("@csarko.sh>"))
        header_block = raw[: raw.index(b"\n\n")]
        for needle in (b"owner@example.net", b"gmail", b"google", b"friend@example.org"):
            self.assertNotIn(needle, header_block.lower())

    def test_thread_and_body_kept(self):
        orig = parse(FIX["gmail-reply"])
        raw, m = self.built()
        for h in ("Subject", "In-Reply-To", "References", "Content-Type"):
            self.assertEqual(m[h], orig[h], h)
        self.assertEqual(m["Date"], "Fri, 30 Oct 2026 19:10:00 +0000")  # the same instant, in UTC
        self.assertEqual(payloads(m), payloads(orig))
        src = FIX["gmail-reply"]
        self.assertTrue(raw.endswith(src[src.index(b"\n\n"):]))

    def test_each_reply_gets_its_own_message_id(self):
        self.assertNotEqual(self.built()[1]["Message-ID"], self.built()[1]["Message-ID"])


class Hardening(unittest.TestCase):
    """Findings of the automated security review of the first commits (2026-10-30)."""

    ARGS = BuildForward.ARGS

    def header_lines(self, raw):
        block = raw[: min(i for i in (raw.find(b"\r\n\r\n"), raw.find(b"\n\n")) if i >= 0)]
        return [line for line in block.replace(b"\r\n", b"\n").split(b"\n") if line[:1] not in (b" ", b"\t")]

    def test_line_break_in_decoded_display_name_cannot_inject_a_header(self):
        raw = FIX["plain"].replace(b'"Ada Example"', b"=?utf-8?q?Ada=0D=0ABcc=3A_victim=40example.org?=")
        out = build_forward(raw, **self.ARGS)
        names = [line.split(b":", 1)[0].lower() for line in self.header_lines(out)]
        self.assertNotIn(b"bcc", names)
        self.assertEqual(parse(out)["From"].addresses[0].addr_spec, "hello@csarko.sh")

    def test_lone_lf_in_a_crlf_header_block_cannot_hide_a_header(self):
        raw = FIX["plain"].replace(b"\n", b"\r\n").replace(b"Subject: Hello there\r\n", b"Subject: Hello there\nDKIM-Signature: v=1; d=evil.example\nX-Alias: admin\r\n")
        out = build_forward(raw, **self.ARGS)
        self.assertNotIn(b"evil.example", out[: out.index(b"\r\n\r\n")])
        self.assertEqual(parse(out).get_all("X-Alias"), ["hello"])
        self.assertNotIn(b"\n", out[: out.index(b"\r\n\r\n")].replace(b"\r\n", b""))

    def test_incoming_headers_cannot_spoof_ours(self):
        raw = FIX["plain"].replace(b"Subject:", b"X-Alias: admin\nX-Original-From: boss@example.com\nX-Original-To: ceo@csarko.sh\nX-Original-Reply-To: a@b.c\nX-SES-Verdicts: spam=PASS\nSubject:")
        m = parse(build_forward(raw, **self.ARGS))
        self.assertEqual(m.get_all("X-Alias"), ["hello"])
        self.assertEqual(m.get_all("X-Original-From"), ['"Ada Example" <ada@example.com>'])
        self.assertEqual(m.get_all("X-Original-To"), ["hello@csarko.sh"])
        self.assertIsNone(m["X-Original-Reply-To"])
        self.assertEqual(len(m.get_all("X-SES-Verdicts")), 1)

    def test_two_from_headers_are_not_the_owner(self):
        raw = FIX["gmail-reply"].replace(b"From: Owner <owner@example.net>", b"From: Owner <owner@example.net>\nFrom: Ada <ada@example.com>")
        self.assertFalse(is_owner({"source": "owner@example.net"}, {"dmarcVerdict": {"status": "PASS"}}, raw, "owner@example.net"))

    def test_a_from_with_two_addresses_is_not_the_owner(self):
        raw = FIX["gmail-reply"].replace(b"From: Owner <owner@example.net>", b"From: Owner <owner@example.net>, Ada <ada@example.com>")
        self.assertFalse(is_owner({"source": "owner@example.net"}, {"dmarcVerdict": {"status": "PASS"}}, raw, "owner@example.net"))

    def reply(self, raw):
        return parse(build_reply(raw, alias_local="hello", domain="csarko.sh", alias_name=None, external="ada@example.com"))

    def test_reply_drops_the_owners_own_message_ids_from_the_thread_headers(self):
        raw = FIX["gmail-reply"].replace(b"References: <root@example.com> <plain-1@example.com>",
                                         b"References: <root@example.com> <CAprev999@mail.gmail.com> <plain-1@example.com>")
        m = self.reply(raw)
        self.assertEqual(m["References"], "<root@example.com> <plain-1@example.com>")
        self.assertEqual(m["In-Reply-To"], "<plain-1@example.com>")

    def test_reply_to_the_owners_own_message_has_no_in_reply_to(self):
        raw = FIX["gmail-reply"].replace(b"In-Reply-To: <plain-1@example.com>", b"In-Reply-To: <CAprev999@mail.gmail.com>")
        self.assertIsNone(self.reply(raw)["In-Reply-To"])

    def test_reply_date_is_utc(self):
        self.assertEqual(self.reply(FIX["gmail-reply"])["Date"], "Fri, 30 Oct 2026 19:10:00 +0000")

    def test_reply_cannot_smuggle_a_header_through_a_lone_lf(self):
        raw = FIX["gmail-reply"].replace(b"\n", b"\r\n").replace(b"Subject: Re: Hello there\r\n", b"Subject: Re: Hello there\nBcc: victim@example.org\r\n")
        out = build_reply(raw, alias_local="hello", domain="csarko.sh", alias_name=None, external="ada@example.com")
        self.assertNotIn(b"victim@example.org", out[: out.index(b"\r\n\r\n")])


if __name__ == "__main__":
    unittest.main()
