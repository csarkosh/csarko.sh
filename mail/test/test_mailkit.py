"""The pure half of the mail Lambda: recipients, policy, header rewriting, tokens.
Run with `python3 -m unittest discover -s mail/test -v` from the repository root."""

import email
import email.policy
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "lambda"))

from mailkit import Recipient, parse_recipient, policy  # noqa: E402


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


if __name__ == "__main__":
    unittest.main()
