"""Tests for check.py's page helpers. Run: python3 -m unittest discover -s .agents/skills/site-quality/tests"""

import importlib.util
import tempfile
import unittest
from pathlib import Path

_spec = importlib.util.spec_from_file_location("check", Path(__file__).resolve().parents[1] / "scripts/check.py")
check = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(check)


def site(files):
    """A throwaway public/ with the given {relative path: text} files."""
    tmp = tempfile.TemporaryDirectory()
    root = Path(tmp.name)
    for rel, text in files.items():
        (root / rel).parent.mkdir(parents=True, exist_ok=True)
        (root / rel).write_text(text, encoding="utf-8")
    return tmp, root


def doc(published):
    return f'<meta property="article:published_time" content="{published}" />'


class PageKindAndCanonical(unittest.TestCase):
    def test_kinds(self):
        self.assertEqual(check.page_kind("index.html"), "home")
        self.assertEqual(check.page_kind("404.html"), "404")
        self.assertEqual(check.page_kind("research/index.html"), "docs-index")
        self.assertEqual(check.page_kind("research/shader-looks.html"), "doc")

    def test_canonical_urls_follow_clean_urls(self):
        self.assertEqual(check.canonical_for("index.html"), "https://csarko.sh/")
        self.assertEqual(check.canonical_for("research/index.html"), "https://csarko.sh/research")
        self.assertEqual(check.canonical_for("research/shader-looks.html"), "https://csarko.sh/research/shader-looks")


class ResolveInternal(unittest.TestCase):
    def setUp(self):
        self.tmp, self.public = site({"index.html": "", "research/index.html": "", "research/a.html": "", "favicon.svg": ""})

    def tearDown(self):
        self.tmp.cleanup()

    def resolve(self, href):
        return check.resolve_internal(href, self.public)

    def test_resolves_clean_urls(self):
        self.assertEqual(self.resolve("/"), (self.public / "index.html", None))
        self.assertEqual(self.resolve("/research"), (self.public / "research/index.html", None))
        self.assertEqual(self.resolve("/research/a#section"), (self.public / "research/a.html", None))
        self.assertEqual(self.resolve("/favicon.svg"), (self.public / "favicon.svg", None))

    def test_flags_redirects_and_missing_files(self):
        self.assertEqual(self.resolve("/research/"), (None, "has a trailing slash (Firebase redirects it)"))
        self.assertEqual(self.resolve("/research/a.html"), (None, "ends in .html (Firebase redirects it to the clean URL)"))
        self.assertEqual(self.resolve("/research/missing"), (None, "does not resolve to a file in public/"))


class BlankGenerated(unittest.TestCase):
    def test_empties_only_the_blocks_build_assets_fills(self):
        text = ('<!-- generated:head -->\n  <link rel="preload" />\n  <!-- /generated:head -->'
                '/* generated:fonts */@font-face { }/* /generated:fonts */'
                '<!-- generated:analytics --><script></script><!-- /generated:analytics -->'
                '<!-- generated:docs --><section></section><!-- /generated:docs -->')
        self.assertEqual(check.blank_generated(text),
                         '<!-- generated:head --><!-- /generated:head -->'
                         '/* generated:fonts *//* /generated:fonts */'
                         '<!-- generated:analytics --><!-- /generated:analytics -->'
                         '<!-- generated:docs --><section></section><!-- /generated:docs -->')


class Pages(unittest.TestCase):
    def test_newest_doc_is_latest_then_smallest_slug(self):
        tmp, public = site({"research/index.html": doc("2027-01-01"), "research/a.html": doc("2026-01-01"),
                            "research/d.html": doc("2026-03-01"), "research/b.html": doc("2026-03-01")})
        with tmp:
            self.assertEqual(check.newest_doc(public), "research/b.html")

    def test_newest_doc_without_docs(self):
        tmp, public = site({"index.html": ""})
        with tmp:
            self.assertIsNone(check.newest_doc(public))

    def test_indexable_pages(self):
        tmp, public = site({"index.html": "", "404.html": "", "research/index.html": "", "research/a.html": ""})
        with tmp:
            self.assertEqual(check.indexable_pages(public), ["index.html", "research/a.html", "research/index.html"])


def crumbs(*items):
    """A breadcrumb nav from (name, href) pairs; href None makes it the current-page crumb."""
    li = "".join(f'<li><span aria-current="page">{name}</span></li>' if href is None
                 else f'<li><a href="{href}">{name}</a></li>' for name, href in items)
    return f'<nav class="crumbs" aria-label="Breadcrumb"><div class="wrap"><ol>{li}</ol></div></nav>'


def crumb_graph(*items):
    """The BreadcrumbList the same trail should produce, from (name, absolute URL) pairs."""
    return [{"@type": "BreadcrumbList",
             "itemListElement": [{"name": n, "item": u} for n, u in items]}]


class Breadcrumbs(unittest.TestCase):
    """The visible trail and the BreadcrumbList are one array in docs_lib.mjs; this is the net
    for a later change that pulls them apart."""

    URL = "https://csarko.sh/research/a"
    SHOWN = (("Home", "/"), ("Research", "/research"), ("A doc", None))
    LISTED = (("Home", "https://csarko.sh/"), ("Research", "https://csarko.sh/research"), ("A doc", URL))

    def failures_for(self, html, listed=LISTED, kind="doc", canonical=URL):
        check.failures.clear()
        check.breadcrumb_checks(html, crumb_graph(*listed), kind, canonical)
        return check.failures

    def test_a_matching_trail_passes(self):
        self.assertEqual(self.failures_for(crumbs(*self.SHOWN)), [])

    def test_renaming_a_section_in_only_one_place_fails(self):
        shown = (("Home", "/"), ("Docs", "/research"), ("A doc", None))
        self.assertRegex(self.failures_for(crumbs(*shown))[0], r"breadcrumb reads .* but its BreadcrumbList says")

    def test_a_last_crumb_that_links_to_itself_fails(self):
        shown = (("Home", "/"), ("Research", "/research"), ("A doc", "/research/a"))
        self.assertRegex(self.failures_for(crumbs(*shown))[0], r"must not link back to it")

    def test_a_crumb_pointing_nowhere_fails(self):
        shown = (("Home", "/"), ("Research", "/nowhere"), ("A doc", None))
        listed = (("Home", "https://csarko.sh/"), ("Research", "https://csarko.sh/nowhere"), ("A doc", self.URL))
        self.assertRegex(self.failures_for(crumbs(*shown), listed)[0], r"do not resolve in public/")

    def test_a_trail_ending_somewhere_other_than_this_page_fails(self):
        listed = (("Home", "https://csarko.sh/"), ("Research", "https://csarko.sh/research"), ("A doc", "https://csarko.sh/research/b"))
        self.assertRegex(self.failures_for(crumbs(*self.SHOWN), listed)[0], r"not this page's canonical")

    def test_a_missing_trail_fails_and_the_home_page_must_not_have_one(self):
        self.assertRegex(self.failures_for("<body></body>")[0], r"no <nav class=\"crumbs\"")
        self.assertEqual(self.failures_for("<body></body>", kind="home", canonical="https://csarko.sh/"), [])
        self.assertTrue(self.failures_for(crumbs(*self.SHOWN), kind="home", canonical="https://csarko.sh/"))


if __name__ == "__main__":
    unittest.main()
