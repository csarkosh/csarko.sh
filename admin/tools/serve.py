#!/usr/bin/env python3
"""admin/preview.sh's local server: admin/public as Python's http.server serves it, with
Cache-Control: no-cache on every answer, as admin.csarko.sh sends (firebase.json). Without it the
browser keeps a module it fetched earlier and runs it beside a newer one that imports from it
(2026-11-21: a cached charts.js under a page.js that wanted its new export)."""
import argparse
import functools
import http.server

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

parser = argparse.ArgumentParser()
parser.add_argument("port", type=int)
parser.add_argument("--directory", required=True)
parser.add_argument("--bind", default="127.0.0.1")
args = parser.parse_args()
http.server.ThreadingHTTPServer((args.bind, args.port), functools.partial(NoCache, directory=args.directory)).serve_forever()
