#!/usr/bin/env python3
"""
seo_check.py — fail loudly if public/ has lost anything search or link previews rely on.

Usage:
  seo_check.py                       static checks on public/ (fast, offline)
  seo_check.py --live [URL]          also check the deployed site: robots.txt, sitemap,
                                     og:image, favicons, www redirect (default https://csarko.sh)
  seo_check.py --lighthouse [URL]    also run Lighthouse; fail if SEO or Accessibility < 100

Exit status is non-zero if any check FAILs. WARNs are printed but don't fail.
"""

import json
import re
import struct
import subprocess
import sys
import urllib.request
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
PUBLIC = ROOT / "public"
SITE = "https://csarko.sh"
CANONICAL = SITE + "/"

failures, warnings = [], []


def fail(msg):
    failures.append(msg)
    print(f"  FAIL  {msg}")


def warn(msg):
    warnings.append(msg)
    print(f"  WARN  {msg}")


def ok(msg):
    print(f"  ok    {msg}")


class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.meta, self.links, self.imgs, self.anchors, self.ids = {}, [], [], [], set()
        self.headings, self.jsonld, self.title, self.lang = [], [], None, None
        self._in_title = self._in_jsonld = False
        self._buf = ""

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if "id" in a:
            self.ids.add(a["id"])
        if tag == "html":
            self.lang = a.get("lang")
        elif tag == "title":
            self._in_title, self._buf = True, ""
        elif tag == "meta":
            key = a.get("property") or a.get("name")
            if key:
                self.meta.setdefault(key, []).append(a.get("content", ""))
        elif tag == "link":
            self.links.append(a)
        elif tag == "img":
            self.imgs.append(a)
        elif tag == "a":
            self.anchors.append(a)
        elif re.fullmatch(r"h[1-6]", tag):
            self.headings.append(int(tag[1]))
        elif tag == "script" and a.get("type") == "application/ld+json":
            self._in_jsonld, self._buf = True, ""

    def handle_endtag(self, tag):
        if tag == "title" and self._in_title:
            self.title, self._in_title = self._buf.strip(), False
        elif tag == "script" and self._in_jsonld:
            self.jsonld.append(self._buf)
            self._in_jsonld = False

    def handle_data(self, data):
        if self._in_title or self._in_jsonld:
            self._buf += data


def image_size(path):
    data = path.read_bytes()
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return struct.unpack(">II", data[16:24])
    if data[:2] == b"\xff\xd8":
        i = 2
        while i < len(data):
            marker, length = data[i + 1], struct.unpack(">H", data[i + 2:i + 4])[0]
            if 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC):
                h, w = struct.unpack(">HH", data[i + 5:i + 9])
                return w, h
            i += 2 + length
    return None


def local_path(url):
    """Map a site URL or relative href to a file in public/, or None if external."""
    if url.startswith(SITE):
        url = url[len(SITE):]
    elif re.match(r"^[a-z]+:", url):
        return None
    rel = url.split("#")[0].split("?")[0].lstrip("/")
    return PUBLIC / (rel or "index.html")


def one(page, key):
    vals = page.meta.get(key, [])
    if len(vals) != 1:
        fail(f"<meta {key}> should appear exactly once (found {len(vals)})")
        return None
    return vals[0]


def static_checks():
    print("static checks: public/")
    html = (PUBLIC / "index.html").read_text(encoding="utf-8")
    page = Page()
    page.feed(html)

    # Title and description
    if not page.title:
        fail("missing <title>")
    elif not 30 <= len(page.title) <= 65:
        warn(f"<title> is {len(page.title)} chars; 30–65 shows in full in results")
    else:
        ok(f"title ({len(page.title)} chars): {page.title}")
    desc = one(page, "description")
    if desc is not None:
        (ok if 70 <= len(desc) <= 160 else warn)(f"meta description is {len(desc)} chars (aim for 70–160)")

    if page.lang:
        ok(f'html lang="{page.lang}"')
    else:
        fail("<html> has no lang attribute")

    # Canonical
    canon = [l.get("href") for l in page.links if l.get("rel") == "canonical"]
    if canon != [CANONICAL]:
        fail(f'expected exactly one <link rel="canonical" href="{CANONICAL}">, found {canon}')
    else:
        ok(f"canonical {CANONICAL}")

    # Open Graph + Twitter
    for key in ("og:title", "og:description", "og:type", "og:site_name", "og:image:alt", "twitter:title", "twitter:description", "twitter:image:alt"):
        one(page, key)
    if one(page, "og:url") not in (None, CANONICAL):
        fail(f"og:url must equal the canonical URL {CANONICAL}")
    if one(page, "twitter:card") not in (None, "summary_large_image"):
        warn("twitter:card is not summary_large_image")
    og_image = one(page, "og:image")
    if og_image:
        if not og_image.startswith("https://"):
            fail("og:image must be an absolute https URL")
        path = local_path(og_image)
        if not path or not path.exists():
            fail(f"og:image {og_image} does not exist in public/")
        else:
            size = image_size(path)
            declared = (page.meta.get("og:image:width", ["?"])[0], page.meta.get("og:image:height", ["?"])[0])
            if size and declared != (str(size[0]), str(size[1])):
                fail(f"og:image is {size[0]}×{size[1]} but og:image:width/height say {declared[0]}×{declared[1]}")
            elif size and (size[0] < 1200 or abs(size[0] / size[1] - 1.91) > 0.05):
                warn(f"og:image is {size[0]}×{size[1]}; link previews want 1200×630 (1.91:1)")
            else:
                ok(f"og:image {path.name} {size[0]}×{size[1]}")
        if page.meta.get("twitter:image", [None])[0] != og_image:
            fail("twitter:image should match og:image")

    # Structured data
    if len(page.jsonld) != 1:
        fail(f"expected one application/ld+json block, found {len(page.jsonld)}")
    else:
        try:
            data = json.loads(page.jsonld[0])
            nodes = data.get("@graph", [data])
            person = next((n for n in nodes if n.get("@type") == "Person"), None)
            if not person:
                fail("JSON-LD has no Person")
            else:
                for field in ("name", "url", "image", "jobTitle", "sameAs"):
                    if not person.get(field):
                        fail(f"JSON-LD Person is missing {field}")
                if person.get("url") != CANONICAL:
                    fail("JSON-LD Person.url must equal the canonical URL")
                img = local_path(person.get("image", ""))
                if img and not img.exists():
                    fail(f"JSON-LD Person.image {person.get('image')} does not exist in public/")
                ok(f"JSON-LD Person ({len(person.get('sameAs', []))} sameAs profiles)")
        except json.JSONDecodeError as e:
            fail(f"JSON-LD does not parse: {e}")

    # Favicons: Google Search needs a crawlable file, not a data: URI
    icons = [l for l in page.links if l.get("rel") in ("icon", "apple-touch-icon")]
    if not icons:
        fail("no favicon links")
    for l in icons:
        href = l.get("href", "")
        if href.startswith("data:"):
            fail("a favicon is a data: URI — Google Search only shows favicons served as files")
        elif not local_path(href) or not local_path(href).exists():
            fail(f"favicon {href} does not exist in public/")
    if not any(l.get("rel") == "apple-touch-icon" for l in icons):
        warn("no apple-touch-icon")
    if icons and not failures:
        ok(f"{len(icons)} favicon links resolve to files")

    # Headings
    if page.headings.count(1) != 1:
        fail(f"expected exactly one <h1>, found {page.headings.count(1)}")
    for prev, cur in zip(page.headings, page.headings[1:]):
        if cur > prev + 1:
            fail(f"heading level jumps from h{prev} to h{cur}")
            break
    else:
        ok(f"one h1, {len(page.headings)} headings, no skipped levels")

    # Images
    for img in page.imgs:
        src = img.get("src", "")
        if img.get("alt") is None:
            fail(f"<img src={src}> has no alt attribute")
        if not (img.get("width") and img.get("height")):
            warn(f"<img src={src}> has no width/height (layout shift)")
        p = local_path(src)
        if p and not p.exists():
            fail(f"<img src={src}> does not exist in public/")
    ok(f"{len(page.imgs)} images checked")

    # Links
    for a in page.anchors:
        href = a.get("href", "")
        if href.startswith("#") and href[1:] and href[1:] not in page.ids:
            fail(f"in-page link {href} has no matching id")
        if a.get("target") == "_blank" and "noopener" not in (a.get("rel") or ""):
            fail(f'{href} opens a new tab without rel="noopener"')
    ok(f"{len(page.anchors)} links checked")

    # Every file the page references must exist (ignoring HTML comments)
    for ref in re.findall(r'(?:href|src)="([^"#?][^"]*)"|url\("([^"]+)"\)', re.sub(r"<!--.*?-->", "", html, flags=re.S)):
        target = ref[0] or ref[1]
        p = local_path(target)
        if p and not p.exists():
            fail(f"referenced file {target} is missing from public/")

    # robots.txt and sitemap.xml
    robots = PUBLIC / "robots.txt"
    if not robots.exists():
        fail("public/robots.txt is missing")
    else:
        text = robots.read_text()
        if re.search(r"^Disallow:\s*/\s*$", text, re.M):
            fail("robots.txt disallows the whole site")
        if f"Sitemap: {SITE}/sitemap.xml" not in text:
            fail("robots.txt does not point at the sitemap")
        else:
            ok("robots.txt allows crawling and names the sitemap")
    sitemap = PUBLIC / "sitemap.xml"
    if not sitemap.exists():
        fail("public/sitemap.xml is missing")
    else:
        try:
            locs = [e.text for e in ET.parse(sitemap).getroot().iter("{http://www.sitemaps.org/schemas/sitemap/0.9}loc")]
            if CANONICAL not in locs:
                fail(f"sitemap.xml does not list {CANONICAL}")
            else:
                ok(f"sitemap.xml lists {len(locs)} URL(s)")
        except ET.ParseError as e:
            fail(f"sitemap.xml does not parse: {e}")


def fetch(url, method="GET"):
    req = urllib.request.Request(url, method=method, headers={"User-Agent": "csarko-sh-seo-check"})

    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            return None

    opener = urllib.request.build_opener(NoRedirect)
    try:
        with opener.open(req, timeout=15) as r:
            return r.status, dict(r.headers), r.read() if method == "GET" else b""
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), b""
    except (urllib.error.URLError, OSError) as e:
        # DNS failure, refused connection, or a TLS error such as a certificate
        # that hasn't issued yet — report it as status 0 rather than crashing.
        reason = getattr(e, "reason", e)
        return 0, {"Location": f"unreachable: {reason}"}, b""


def live_checks(base):
    print(f"live checks: {base}")
    for path, want in (("/", "text/html"), ("/robots.txt", "text/plain"), ("/sitemap.xml", "xml"),
                       ("/og-image.jpg", "image/jpeg"), ("/favicon.ico", "image"), ("/apple-touch-icon.png", "image/png")):
        status, headers, _ = fetch(base + path)
        ctype = headers.get("Content-Type", headers.get("content-type", ""))
        if status != 200 or want not in ctype:
            fail(f"{path} -> {status} {ctype}")
        else:
            ok(f"{path} -> 200 {ctype}")
    status, _, _ = fetch(base + "/definitely-not-a-page")
    (ok if status == 404 else fail)(f"unknown path returns {status} (want 404)")
    status, headers, _ = fetch("http://" + base.split("://", 1)[1] + "/")
    loc = headers.get("Location", headers.get("location", ""))
    (ok if status in (301, 308) and loc.startswith("https://") else fail)(f"http:// redirects to https:// ({status} {loc})")
    status, headers, _ = fetch("https://www." + base.split("://", 1)[1] + "/")
    loc = headers.get("Location", headers.get("location", ""))
    if status in (301, 308) and loc.rstrip("/") == base:
        ok(f"www redirects to {base} ({status})")
    else:
        warn(f"www.{base.split('://', 1)[1]} does not redirect yet ({status} {loc}); its certificate may still be issuing")


def lighthouse(url):
    print(f"lighthouse: {url}")
    out = "/tmp/csarko-sh-lighthouse.json"
    subprocess.run(["npx", "-y", "lighthouse@12", url, "--quiet", "--chrome-flags=--headless=new",
                    "--only-categories=seo,accessibility,performance,best-practices",
                    "--output=json", f"--output-path={out}"], check=False,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        report = json.load(open(out))
    except (OSError, json.JSONDecodeError):
        fail("Lighthouse did not produce a report")
        return
    for key, cat in report["categories"].items():
        score = round(cat["score"] * 100)
        if key in ("seo", "accessibility") and score < 100:
            fail(f"{cat['title']} {score} (must be 100)")
        elif score < 90:
            warn(f"{cat['title']} {score}")
        else:
            ok(f"{cat['title']} {score}")
    lcp = report["audits"]["largest-contentful-paint"].get("displayValue")
    print(f"        LCP {lcp} (Lighthouse's throttled mobile profile)")


def main(argv):
    static_checks()
    if "--live" in argv:
        i = argv.index("--live")
        live_checks(argv[i + 1] if len(argv) > i + 1 and not argv[i + 1].startswith("--") else SITE)
    if "--lighthouse" in argv:
        i = argv.index("--lighthouse")
        lighthouse(argv[i + 1] if len(argv) > i + 1 and not argv[i + 1].startswith("--") else SITE)
    print()
    if failures:
        print(f"✗ {len(failures)} SEO check(s) failed, {len(warnings)} warning(s)")
        return 1
    print(f"✓ SEO checks passed ({len(warnings)} warning(s))")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
