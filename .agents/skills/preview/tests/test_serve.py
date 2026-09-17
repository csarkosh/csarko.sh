"""Tests for serve.py's routing. Run: python3 -m unittest discover -s .agents/skills/preview/tests"""

import importlib.util
import tempfile
import unittest
from pathlib import Path

_spec = importlib.util.spec_from_file_location("serve", Path(__file__).resolve().parents[1] / "scripts/serve.py")
serve = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(serve)


class Route(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.public = Path(self.tmp.name).resolve()
        (self.public / "research").mkdir()
        for rel in ("index.html", "404.html", "research/index.html", "research/a.html", "favicon.svg"):
            (self.public / rel).write_text(rel)

    def tearDown(self):
        self.tmp.cleanup()

    def route(self, path):
        return serve.route(self.public, path, serve.load_redirects())

    def test_serves_clean_urls_and_files(self):
        self.assertEqual(self.route("/"), (200, self.public / "index.html"))
        self.assertEqual(self.route("/research"), (200, self.public / "research/index.html"))
        self.assertEqual(self.route("/research/a?utm=x"), (200, self.public / "research/a.html"))
        self.assertEqual(self.route("/favicon.svg"), (200, self.public / "favicon.svg"))

    def test_redirects_like_firebase(self):
        self.assertEqual(self.route("/research/"), (301, "/research"))
        self.assertEqual(self.route("/research/?q=1"), (301, "/research?q=1"))
        self.assertEqual(self.route("/research/a.html"), (301, "/research/a"))
        self.assertEqual(self.route("/research/index.html"), (301, "/research"))
        self.assertEqual(self.route("/index.html"), (301, "/"))

    def test_old_docs_urls_follow_firebase_json_to_research(self):
        self.assertEqual(self.route("/docs"), (301, "/research"))
        self.assertEqual(self.route("/docs/a"), (301, "/research/a"))
        self.assertEqual(self.route("/docs/a?utm=x"), (301, "/research/a?utm=x"))
        self.assertEqual(self.route("/docsx"), (404, self.public / "404.html"))

    def test_missing_and_outside_paths_get_the_404_page(self):
        self.assertEqual(self.route("/nope"), (404, self.public / "404.html"))
        self.assertEqual(self.route("/../../etc/passwd"), (404, self.public / "404.html"))

    def test_collapses_leading_slashes_and_backslashes_before_routing(self):
        # "//evil.com/" and "/\evil.com/" are protocol-relative in a browser's eyes: an
        # unqualified Location header built from them would redirect off-site.
        self.assertEqual(self.route("//evil.com/"), (301, "/evil.com"))
        self.assertEqual(self.route("/\\evil.com/"), (301, "/evil.com"))


if __name__ == "__main__":
    unittest.main()
