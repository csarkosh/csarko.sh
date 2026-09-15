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
        (self.public / "docs").mkdir()
        for rel in ("index.html", "404.html", "docs/index.html", "docs/a.html", "favicon.svg"):
            (self.public / rel).write_text(rel)

    def tearDown(self):
        self.tmp.cleanup()

    def route(self, path):
        return serve.route(self.public, path)

    def test_serves_clean_urls_and_files(self):
        self.assertEqual(self.route("/"), (200, self.public / "index.html"))
        self.assertEqual(self.route("/docs"), (200, self.public / "docs/index.html"))
        self.assertEqual(self.route("/docs/a?utm=x"), (200, self.public / "docs/a.html"))
        self.assertEqual(self.route("/favicon.svg"), (200, self.public / "favicon.svg"))

    def test_redirects_like_firebase(self):
        self.assertEqual(self.route("/docs/"), (301, "/docs"))
        self.assertEqual(self.route("/docs/?q=1"), (301, "/docs?q=1"))
        self.assertEqual(self.route("/docs/a.html"), (301, "/docs/a"))
        self.assertEqual(self.route("/docs/index.html"), (301, "/docs"))
        self.assertEqual(self.route("/index.html"), (301, "/"))

    def test_missing_and_outside_paths_get_the_404_page(self):
        self.assertEqual(self.route("/nope"), (404, self.public / "404.html"))
        self.assertEqual(self.route("/../../etc/passwd"), (404, self.public / "404.html"))


if __name__ == "__main__":
    unittest.main()
