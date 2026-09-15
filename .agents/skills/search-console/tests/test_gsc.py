"""Tests for gsc.py's pure helpers. No network, no credentials.

Run: python3 -B -m unittest discover -s .agents/skills/search-console/tests
"""

import importlib.util
import tempfile
import unittest
from pathlib import Path

_spec = importlib.util.spec_from_file_location("gsc", Path(__file__).resolve().parents[1] / "scripts/gsc.py")
gsc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gsc)

SITEMAP = """<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://csarko.sh/</loc></url>
  <url><loc>https://csarko.sh/docs</loc><lastmod>2026-09-15</lastmod></url>
  <url><loc>  https://csarko.sh/docs/no-visible-pop-in  </loc></url>
</urlset>
"""


def status(**fields):
    base = {"verdict": "PASS", "coverageState": "Submitted and indexed",
            "pageFetchState": "SUCCESSFUL", "robotsTxtState": "ALLOWED",
            "indexingState": "INDEXING_ALLOWED"}
    base.update(fields)
    return base


def result(**fields):
    return {"inspectionResult": {"indexStatusResult": status(**fields),
                                 "inspectionResultLink": "https://search.google.com/u/0/x"}}


class SitemapParsing(unittest.TestCase):
    def test_reads_every_loc_in_order_and_trims(self):
        self.assertEqual(gsc.sitemap_locs(SITEMAP), [
            "https://csarko.sh/",
            "https://csarko.sh/docs",
            "https://csarko.sh/docs/no-visible-pop-in",
        ])

    def test_empty_sitemap_has_no_locs(self):
        empty = '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>'
        self.assertEqual(gsc.sitemap_locs(empty), [])


class PropertyResolution(unittest.TestCase):
    def test_explicit_wins_over_environment(self):
        prop, how = gsc.resolve_property("sc-domain:a.com", "sc-domain:b.com", ["https://c.com/"])
        self.assertEqual((prop, how), ("sc-domain:a.com", "--property"))

    def test_environment_wins_over_the_sitemap(self):
        prop, how = gsc.resolve_property(None, "sc-domain:b.com", ["https://c.com/"])
        self.assertEqual((prop, how), ("sc-domain:b.com", "$GSC_PROPERTY"))

    def test_derived_from_the_sitemap_host(self):
        prop, how = gsc.resolve_property(None, None, gsc.sitemap_locs(SITEMAP))
        self.assertEqual(prop, "sc-domain:csarko.sh")
        self.assertIn("assumed", how)

    def test_nothing_to_resolve_is_a_failure(self):
        with self.assertRaises(gsc.Failure) as caught:
            gsc.resolve_property(None, None, [])
        self.assertIn("--property", str(caught.exception))

    def test_url_prefix_and_bare_host_forms(self):
        self.assertEqual(gsc.normalize_property("https://example.com"), "https://example.com/")
        self.assertEqual(gsc.normalize_property("https://example.com/"), "https://example.com/")
        self.assertEqual(gsc.normalize_property("example.com"), "sc-domain:example.com")
        self.assertEqual(gsc.normalize_property("sc-domain:example.com/"), "sc-domain:example.com")
        self.assertIsNone(gsc.normalize_property("  "))


class PropertyEncoding(unittest.TestCase):
    def test_domain_property_colon_is_encoded(self):
        self.assertEqual(gsc.encode_property("sc-domain:csarko.sh"), "sc-domain%3Acsarko.sh")

    def test_url_prefix_property_slashes_are_encoded(self):
        self.assertEqual(gsc.encode_property("https://example.com/"), "https%3A%2F%2Fexample.com%2F")

    def test_project_slug_follows_the_host(self):
        self.assertEqual(gsc.project_slug("sc-domain:csarko.sh"), "csarko-sh")
        self.assertEqual(gsc.project_slug("https://example.com/"), "example-com")


class SitemapSource(unittest.TestCase):
    def test_explicit_https_url(self):
        self.assertEqual(gsc.resolve_sitemap_source("https://x.com/sitemap.xml", "/tmp"),
                         ("url", "https://x.com/sitemap.xml"))

    def test_explicit_local_file(self):
        self.assertEqual(gsc.resolve_sitemap_source("some/sitemap.xml", "/tmp"), ("file", "some/sitemap.xml"))

    def test_defaults_to_public_sitemap_in_the_working_directory(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "public/sitemap.xml"
            path.parent.mkdir(parents=True)
            path.write_text(SITEMAP, encoding="utf-8")
            self.assertEqual(gsc.resolve_sitemap_source(None, tmp), ("file", str(path)))

    def test_no_sitemap_anywhere_is_a_failure(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(gsc.Failure) as caught:
                gsc.resolve_sitemap_source(None, tmp)
            self.assertIn("--sitemap", str(caught.exception))

    def test_feed_url_prefers_the_url_that_was_given(self):
        self.assertEqual(gsc.feed_url("url", "https://x.com/sm.xml", "sc-domain:x.com"), "https://x.com/sm.xml")

    def test_feed_url_derived_from_the_property(self):
        self.assertEqual(gsc.feed_url("file", "public/sitemap.xml", "sc-domain:csarko.sh"),
                         "https://csarko.sh/sitemap.xml")
        self.assertEqual(gsc.feed_url("file", "public/sitemap.xml", "https://example.com/"),
                         "https://example.com/sitemap.xml")


class Canonical(unittest.TestCase):
    def test_mismatch_when_google_picked_another_url(self):
        self.assertTrue(gsc.canonical_mismatch(
            status(googleCanonical="https://csarko.sh/docs/a", userCanonical="https://csarko.sh/docs/b")))

    def test_no_mismatch_when_they_agree_modulo_trailing_slash(self):
        self.assertFalse(gsc.canonical_mismatch(
            status(googleCanonical="https://csarko.sh/", userCanonical="https://csarko.sh")))

    def test_no_mismatch_when_either_is_missing(self):
        self.assertFalse(gsc.canonical_mismatch(status(googleCanonical="https://csarko.sh/")))
        self.assertFalse(gsc.canonical_mismatch(status()))


class ExitCodeRule(unittest.TestCase):
    def test_not_indexed_yet_is_not_a_failure(self):
        for state in ("Discovered - currently not indexed", "Crawled - currently not indexed"):
            fresh = status(verdict="NEUTRAL", coverageState=state, pageFetchState="PAGE_FETCH_STATE_UNSPECIFIED")
            self.assertIsNone(gsc.index_problem(fresh), state)
            self.assertFalse(gsc.is_indexed(fresh))

    def test_indexed_page_is_clean(self):
        self.assertIsNone(gsc.index_problem(status()))
        self.assertTrue(gsc.is_indexed(status()))
        self.assertTrue(gsc.is_indexed(status(verdict="PARTIAL")))

    def test_fetch_failure_is_a_failure(self):
        self.assertEqual(gsc.index_problem(status(pageFetchState="NOT_FOUND")), "page fetch NOT_FOUND")

    def test_blocked_by_robots_is_a_failure(self):
        self.assertEqual(gsc.index_problem(status(robotsTxtState="DISALLOWED")), "robots.txt DISALLOWED")

    def test_noindex_is_a_failure(self):
        self.assertEqual(gsc.index_problem(status(indexingState="BLOCKED_BY_META_TAG")),
                         "indexing BLOCKED_BY_META_TAG")


class Formatting(unittest.TestCase):
    def test_index_row_fields(self):
        row = gsc.index_row("https://csarko.sh/docs/a", result(lastCrawlTime="2026-09-14T10:02:31Z"))
        self.assertEqual(row, ["/docs/a", "PASS", "Submitted and indexed", "2026-09-14", ""])

    def test_index_row_marks_a_canonical_mismatch_and_a_missing_crawl(self):
        row = gsc.index_row("https://csarko.sh/", result(
            googleCanonical="https://csarko.sh/other", userCanonical="https://csarko.sh/"))
        self.assertEqual(row[0], "/")
        self.assertEqual(row[3], "-")
        self.assertEqual(row[4], "canonical mismatch")

    def test_index_row_survives_an_empty_response(self):
        self.assertEqual(gsc.index_row("https://csarko.sh/", {}), ["/", "-", "-", "-", ""])

    def test_render_table_pads_columns_and_underlines_headers(self):
        lines = gsc.render_table(["PATH", "N"], [["/", 1], ["/docs/long", 22]])
        self.assertEqual(lines[0], "  PATH        N")
        self.assertEqual(lines[1], "  ----------  --")
        self.assertEqual(lines[2], "  /           1")
        self.assertEqual(lines[3], "  /docs/long  22")

    def test_percentages_and_dates(self):
        self.assertEqual(gsc.pct(0.1234), "12.3%")
        self.assertEqual(gsc.pct(None), "0.0%")
        self.assertEqual(gsc.as_date("2026-09-14T10:02:31Z"), "2026-09-14")
        self.assertEqual(gsc.as_date(None), "-")


class ErrorClassification(unittest.TestCase):
    def test_missing_scope(self):
        msg = gsc.classify_api_error(403, '{"error":{"status":"ACCESS_TOKEN_SCOPE_INSUFFICIENT"}}')
        self.assertIn("scope", msg)
        self.assertNotIn("Add user", msg)

    def test_service_account_not_added_to_the_property(self):
        msg = gsc.classify_api_error(403, "User does not have sufficient permission for site")
        self.assertIn("Add user", msg)
        self.assertIn("Full", msg)

    def test_wrong_property_spelling(self):
        self.assertIn("sc-domain:", gsc.classify_api_error(404, "not found"))

    def test_quota_and_bad_key(self):
        self.assertIn("2,000", gsc.classify_api_error(429, "quota"))
        self.assertIn("--rotate", gsc.classify_api_error(401, "unauthorized"))

    def test_unknown_status_still_reports_something(self):
        self.assertIn("HTTP 500", gsc.classify_api_error(500, "boom"))

    def test_missing_key_message_points_at_setup(self):
        msg = gsc.missing_key_message("/nope/gsc-sa.json")
        self.assertIn("setup.sh", msg)
        self.assertIn("Full", msg)
        self.assertIn("/nope/gsc-sa.json", msg)


class KeyPath(unittest.TestCase):
    def test_explicit_beats_environment_beats_default(self):
        self.assertEqual(gsc.key_path("/a/k.json", "/b/k.json", "proj"), Path("/a/k.json"))
        self.assertEqual(gsc.key_path(None, "/b/k.json", "proj"), Path("/b/k.json"))
        self.assertEqual(gsc.key_path(None, None, "csarko-sh"),
                         Path.home() / ".config/csarko-sh/gsc-sa.json")


class ArgParsing(unittest.TestCase):
    def test_defaults(self):
        command, opts = gsc.parse_args(["perf"])
        self.assertEqual(command, "perf")
        self.assertEqual(opts["days"], 28)
        self.assertFalse(opts["json"])

    def test_flags(self):
        _, opts = gsc.parse_args(["index", "--json", "--property", "sc-domain:x.com", "--days", "7"])
        self.assertTrue(opts["json"])
        self.assertEqual(opts["property"], "sc-domain:x.com")
        self.assertEqual(opts["days"], 7)

    def test_bad_input(self):
        for argv in ([], ["--json"], ["nope"], ["perf", "--days"], ["perf", "--wat"], ["perf", "--days", "x"]):
            with self.assertRaises(gsc.Failure, msg=str(argv)):
                gsc.parse_args(argv)


if __name__ == "__main__":
    unittest.main()
