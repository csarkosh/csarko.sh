#!/usr/bin/env python3
"""
serve.py — serve public/ on localhost the way Firebase Hosting routes it
(cleanUrls: true, trailingSlash: false, and firebase.json's redirects), so root-relative links
and /research work locally.

Usage:
  serve.py [--port 4173] [--dir public]

  /                      index.html
  /research              research/index.html
  /research/x            research/x.html
  /docs, /docs/x         301 to /research, /research/x (firebase.json "redirects")
  /research/ and /x.html 301 to the clean URL
  anything else          404.html, status 404

Headers are not Firebase's (no CSP); check.py --live covers those on the real site.
"""

import argparse
import http.server
import json
import mimetypes
import re
from pathlib import Path
from urllib.parse import unquote, urlsplit

for _type, _ext in (("font/woff2", ".woff2"), ("image/avif", ".avif"), ("image/webp", ".webp")):
    mimetypes.add_type(_type, _ext)


FIREBASE_JSON = Path(__file__).resolve().parents[4] / "firebase.json"


def load_redirects(config=FIREBASE_JSON):
    """firebase.json's hosting.redirects as (pattern, destination) pairs. Only the source syntax
    this site uses is supported: literal segments, ":name" for one segment, ":name*" for the rest."""
    pairs = []
    for r in json.loads(Path(config).read_text()).get("hosting", {}).get("redirects", []):
        parts = []
        for seg in r["source"].split("/"):
            m = re.fullmatch(r":(\w+)(\*?)", seg)
            parts.append(re.escape(seg) if not m else f"(?P<{m[1]}>.*)" if m[2] else f"(?P<{m[1]}>[^/]+)")
        pairs.append((re.compile("/".join(parts)), r["destination"]))
    return pairs


def route(public, raw_path, redirects=()):
    """(200, file) | (301, location) | (404, public/404.html) for a request path. Configured
    redirects come first, as on Firebase, then its clean-URL rules."""
    # A path starting "//" or "/\" is protocol-relative to a browser (it becomes the network
    # path reference //host/...), so an unqualified Location built from it would redirect
    # off-site. Collapse before anything else touches the path.
    raw_path = raw_path.replace("\\", "/")
    if raw_path.startswith("/"):
        raw_path = "/" + raw_path.lstrip("/")
    parts = urlsplit(raw_path)
    path = unquote(parts.path) or "/"
    query = f"?{parts.query}" if parts.query else ""
    for pattern, destination in redirects:
        if m := pattern.fullmatch(path):
            return 301, re.sub(r":(\w+)", lambda g: m[g[1]], destination) + query
    if path != "/" and path.endswith("/"):
        return 301, path.rstrip("/") + query
    if path.endswith(".html"):
        clean = path[:-len(".html")]
        if clean.endswith("/index"):
            clean = clean[:-len("/index")]
        return 301, (clean or "/") + query
    root = Path(public).resolve()
    rel = path.lstrip("/")
    candidates = [root / "index.html"] if not rel else [root / rel, root / f"{rel}.html", root / rel / "index.html"]
    for candidate in candidates:
        candidate = candidate.resolve()
        if candidate.is_file() and candidate.is_relative_to(root):
            return 200, candidate
    return 404, root / "404.html"


class Handler(http.server.BaseHTTPRequestHandler):
    public = Path("public")
    redirects = ()

    def do_GET(self):
        self.respond(send_body=True)

    def do_HEAD(self):
        self.respond(send_body=False)

    def respond(self, send_body):
        status, target = route(self.public, self.path, self.redirects)
        if status == 301:
            self.send_response(301)
            self.send_header("Location", target)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        body = target.read_bytes() if target.is_file() else b"Not found"
        ctype = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype in ("application/javascript", "image/svg+xml", "application/xml"):
            ctype += "; charset=utf-8"
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        if send_body:
            self.wfile.write(body)


def main():
    parser = argparse.ArgumentParser(description="Serve public/ with Firebase-style clean URLs.")
    parser.add_argument("--port", type=int, default=4173)
    parser.add_argument("--dir", default=str(Path(__file__).resolve().parents[4] / "public"))
    args = parser.parse_args()
    Handler.public = Path(args.dir)
    Handler.redirects = load_redirects()
    server = http.server.ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"serving {args.dir} on http://localhost:{args.port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
