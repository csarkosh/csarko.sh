#!/usr/bin/env python3
"""
check.py — fail loudly if csarko.sh regresses on SEO, performance, accessibility,
security headers, or layout.

Usage:
  check.py                        static checks on public/ and firebase.json (offline, a few seconds)
  check.py --live [URL]           + the deployed site: headers, caching, 404, robots, sitemap, www
  check.py --lighthouse [URL]     + Lighthouse: SEO, Accessibility, Best Practices 100; Performance >= 95
  check.py --observatory [HOST]   + Mozilla HTTP Observatory: grade must be A+

Exit status is non-zero if any check FAILs. WARNs are printed but don't fail.
The rules each check protects are explained in .agents/skills/site-quality/SKILL.md.
"""

import base64
import hashlib
import html as htmllib
import json
import re
import struct
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET  # parses only the repo's own sitemap.xml
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
PUBLIC = ROOT / "public"
SKILL = ROOT / ".agents/skills/site-quality"
SITE = "https://csarko.sh"
CANONICAL = SITE + "/"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

# Third-party origins the pages may use, per CSP directive. Empty means the site
# is fully first-party. Anything added here must also appear in the same
# directive of firebase.json's Content-Security-Policy (checked below).
THIRD_PARTY = {
    "script-src": [],
    "connect-src": [],
    "img-src": [],
}

# Performance budgets (bytes).
BUDGET_HTML = 50_000
BUDGET_FONTS = 100_000
BUDGET_PORTRAIT_AVIF_480 = 25_000
BUDGET_ANY_PORTRAIT = 90_000
BUDGET_SCRIPTS = 10_000  # all JavaScript the page loads, first- and third-party (third-party measured live)

REQUIRED_HEADERS = {
    "Content-Security-Policy": lambda v: bool(v),
    "X-Content-Type-Options": lambda v: v == "nosniff",
    "X-Frame-Options": lambda v: v == "DENY",
    "Referrer-Policy": lambda v: v in ("strict-origin-when-cross-origin", "strict-origin", "same-origin", "no-referrer"),
    "Permissions-Policy": lambda v: all(f"{x}=()" in v for x in ("camera", "microphone", "geolocation")),
    "Cross-Origin-Opener-Policy": lambda v: v == "same-origin",
}

failures, warnings = [], []


def fail(msg):
    failures.append(msg)
    print(f"  FAIL  {msg}")


def warn(msg):
    warnings.append(msg)
    print(f"  WARN  {msg}")


def ok(msg):
    print(f"  ok    {msg}")


def check(cond, msg):
    (ok if cond else fail)(msg)


class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.meta, self.links, self.imgs, self.sources, self.anchors = {}, [], [], [], []
        self.scripts, self.ids, self.headings, self.jsonld = [], {}, [], []
        self.title = self.lang = self.first_body_child = None
        self.pictures = 0
        self._in_body = self._in_title = self._in_script = False
        self._script_attrs, self._buf = None, ""

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if "id" in a:
            self.ids[a["id"]] = a
        if self._in_body and self.first_body_child is None:
            self.first_body_child = (tag, a)
        if tag == "body":
            self._in_body = True
        elif tag == "html":
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
        elif tag == "source":
            self.sources.append(a)
        elif tag == "picture":
            self.pictures += 1
        elif tag == "a":
            self.anchors.append(a)
        elif re.fullmatch(r"h[1-6]", tag):
            self.headings.append(int(tag[1]))
        elif tag == "script":
            self._in_script, self._script_attrs, self._buf = True, a, ""

    def handle_endtag(self, tag):
        if tag == "title" and self._in_title:
            self.title, self._in_title = self._buf.strip(), False
        elif tag == "script" and self._in_script:
            if self._script_attrs.get("type") == "application/ld+json":
                self.jsonld.append(self._buf)
            else:
                self.scripts.append((self._script_attrs, self._buf))
            self._in_script = False

    def handle_data(self, data):
        if self._in_title or self._in_script:
            self._buf += data


def parse(path):
    page = Page()
    text = path.read_text(encoding="utf-8")
    page.feed(text)
    return page, text


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
    """Map a same-site URL (absolute, root-relative or relative) to a file in public/; None if third-party."""
    if url.startswith(SITE):
        url = url[len(SITE):]
    elif re.match(r"^(?:[a-z]+:|//)", url):
        return None
    rel = url.split("#")[0].split("?")[0].lstrip("/")
    return PUBLIC / (rel or "index.html")


def origin(url):
    m = re.match(r"^(?:https?:)?//([^/]+)", url)
    return f"https://{m.group(1)}" if m else None


def srcset_urls(value):
    return [part.strip().split()[0] for part in (value or "").split(",") if part.strip()]


def css_of(html):
    return "\n".join(re.findall(r"<style>(.*?)</style>", html, re.S))


def one(page, key):
    vals = page.meta.get(key, [])
    if len(vals) != 1:
        fail(f"<meta {key}> should appear exactly once (found {len(vals)})")
        return None
    return vals[0]


def csp_from_config():
    cfg = json.load(open(ROOT / "firebase.json"))
    blocks = cfg["hosting"].get("headers", [])
    catch_all = {h["key"]: h["value"] for b in blocks if b.get("source") == "**" for h in b["headers"]}
    return blocks, catch_all


def parse_csp(value):
    return {d.split()[0]: d.split()[1:] for d in (x.strip() for x in (value or "").split(";")) if d}


# --------------------------------------------------------------------------- SEO

def seo_checks(page):
    print("SEO (index.html)")
    if not page.title:
        fail("missing <title>")
    else:
        (ok if 30 <= len(page.title) <= 65 else warn)(f"title is {len(page.title)} chars (30–65 shows in full)")
    desc = one(page, "description")
    if desc is not None:
        (ok if 70 <= len(desc) <= 160 else warn)(f"meta description is {len(desc)} chars (70–160)")
    check(page.lang, f'html lang="{page.lang}"')

    canon = [l.get("href") for l in page.links if l.get("rel") == "canonical"]
    check(canon == [CANONICAL], f"canonical {canon}")

    for key in ("og:title", "og:description", "og:type", "og:site_name", "og:image:alt",
                "twitter:title", "twitter:description", "twitter:image:alt"):
        one(page, key)
    if one(page, "og:url") not in (None, CANONICAL):
        fail(f"og:url must equal the canonical URL {CANONICAL}")
    if one(page, "twitter:card") not in (None, "summary_large_image"):
        warn("twitter:card is not summary_large_image")
    og_image = one(page, "og:image")
    if og_image:
        path = local_path(og_image)
        if not og_image.startswith("https://") or not path or not path.exists():
            fail(f"og:image {og_image} must be an absolute https URL to a file in public/")
        else:
            size = image_size(path)
            declared = (page.meta.get("og:image:width", ["?"])[0], page.meta.get("og:image:height", ["?"])[0])
            if size and declared != (str(size[0]), str(size[1])):
                fail(f"og:image is {size[0]}×{size[1]} but og:image:width/height say {declared[0]}×{declared[1]}")
            elif size and (size[0] < 1200 or abs(size[0] / size[1] - 1.91) > 0.05):
                warn(f"og:image is {size[0]}×{size[1]}; link previews want 1200×630")
            else:
                ok(f"og:image {size[0]}×{size[1]}")
        if page.meta.get("twitter:image", [None])[0] != og_image:
            fail("twitter:image should match og:image")

    if len(page.jsonld) != 1:
        fail(f"expected one application/ld+json block, found {len(page.jsonld)}")
    else:
        try:
            data = json.loads(page.jsonld[0])
            person = next((n for n in data.get("@graph", [data]) if n.get("@type") == "Person"), None)
            if not person:
                fail("JSON-LD has no Person")
            else:
                missing = [f for f in ("name", "url", "image", "jobTitle", "sameAs") if not person.get(f)]
                img = local_path(person.get("image", ""))
                if missing:
                    fail(f"JSON-LD Person is missing {missing}")
                elif person.get("url") != CANONICAL:
                    fail("JSON-LD Person.url must equal the canonical URL")
                elif img and not img.exists():
                    fail(f"JSON-LD Person.image {person.get('image')} does not exist in public/")
                else:
                    ok(f"JSON-LD Person ({len(person['sameAs'])} sameAs profiles)")
        except json.JSONDecodeError as e:
            fail(f"JSON-LD does not parse: {e}")

    icons = [l for l in page.links if l.get("rel") in ("icon", "apple-touch-icon")]
    bad = [l.get("href") for l in icons
           if l.get("href", "").startswith("data:") or not (local_path(l.get("href", "")) or Path("/nope")).exists()]
    check(icons and not bad, f"favicons are files in public/ {bad or ''}")

    if page.headings.count(1) != 1:
        fail(f"expected exactly one <h1>, found {page.headings.count(1)}")
    elif any(cur > prev + 1 for prev, cur in zip(page.headings, page.headings[1:])):
        fail("heading levels skip (e.g. h2 → h4)")
    else:
        ok(f"one h1, {len(page.headings)} headings, no skipped levels")

    robots = PUBLIC / "robots.txt"
    text = robots.read_text() if robots.exists() else ""
    check(text and not re.search(r"^Disallow:\s*/\s*$", text, re.M) and f"Sitemap: {SITE}/sitemap.xml" in text,
          "robots.txt allows crawling and names the sitemap")
    try:
        locs = [e.text for e in ET.parse(PUBLIC / "sitemap.xml").getroot().iter("{http://www.sitemaps.org/schemas/sitemap/0.9}loc")]
        check(CANONICAL in locs, f"sitemap.xml lists {locs}")
    except (OSError, ET.ParseError) as e:
        fail(f"sitemap.xml missing or invalid: {e}")


# ------------------------------------------------------------------- performance

def resource_refs(page, html):
    """(kind, url) for everything the page makes the browser load."""
    refs = []
    for l in page.links:
        if l.get("rel") in ("stylesheet", "preload", "modulepreload", "icon", "apple-touch-icon", "manifest"):
            refs.append(("link", l.get("href", "")))
    for i in page.imgs:
        refs += [("img", i.get("src", ""))] + [("img", u) for u in srcset_urls(i.get("srcset"))]
    for s in page.sources:
        refs += [("img", u) for u in srcset_urls(s.get("srcset"))]
    for attrs, _ in page.scripts:
        if attrs.get("src"):
            refs.append(("script", attrs["src"]))
    refs += [("font", u) for u in re.findall(r'url\("([^"]+)"\)', css_of(html))]
    return [(k, u) for k, u in refs if u and not u.startswith(("data:", "#"))]


def performance_checks(page, html, name):
    print(f"performance ({name})")
    size = len(html.encode())
    check(size <= BUDGET_HTML, f"HTML {size:,} B (budget {BUDGET_HTML:,})")

    refs = resource_refs(page, html)
    missing = [u for _, u in refs if (p := local_path(u)) is not None and not p.exists()]
    check(not missing, f"every referenced file exists {missing or ''}")
    allowed = {o for origins in THIRD_PARTY.values() for o in origins}
    third_party = sorted({u for _, u in refs if local_path(u) is None})
    stray = [u for u in third_party if origin(u) not in allowed]
    check(not stray, f"third-party resources beyond the allowlist: {stray or 'none'}")

    css = css_of(html)
    font_files = {p for u in re.findall(r'url\("([^"]+\.woff2)"\)', css) if (p := local_path(u))}
    font_bytes = sum(p.stat().st_size for p in font_files if p.exists())
    check(font_bytes <= BUDGET_FONTS, f"fonts {font_bytes:,} B (budget {BUDGET_FONTS:,})")
    web_families = re.findall(r'@font-face\s*\{[^}]*font-family:\s*"([^"]+)"[^}]*url\(', css)
    if len(web_families) != css.count("font-display: swap"):
        fail("every web @font-face needs font-display: swap")
    # Layout shift guard: each web font needs a metric-matched fallback face,
    # listed right after it in the font stack, or the swap re-wraps text.
    for fam in web_families:
        fb = re.search(r'@font-face\s*\{[^}]*font-family:\s*"' + re.escape(fam) + r' Fallback"[^}]*size-adjust', css)
        stack = re.search(r'"' + re.escape(fam) + r'",\s*"' + re.escape(fam) + r' Fallback"', css)
        check(fb and stack, f'"{fam}" has a metric-matched "{fam} Fallback" next in its font stack (prevents font-swap layout shift)')
    for src in sorted((SKILL / "assets/fonts").glob("*.woff2")):
        expected = f"{src.stem}.{hashlib.sha256(src.read_bytes()).hexdigest()[:8]}.woff2"
        if font_files and expected not in {p.name for p in font_files}:
            fail(f"{name} references a stale build of {src.name} — run generate-assets.sh")

    js = 0
    for attrs, body in page.scripts:
        if attrs.get("src"):
            if not ({"async", "defer"} & set(attrs)) and attrs.get("type") != "module":
                fail(f"<script src={attrs['src']}> blocks rendering — add defer or async")
            p = local_path(attrs["src"])
            js += p.stat().st_size if p and p.exists() else 0
        else:
            js += len(body.encode())
    check(js <= BUDGET_SCRIPTS, f"first-party JavaScript {js:,} B (budget {BUDGET_SCRIPTS:,}; third-party is measured with --live)")

    if name != "index.html":
        return

    # The hero portrait is the Largest Contentful Paint element.
    if page.pictures < 1 or not page.imgs:
        fail("the hero portrait must be a <picture> — run generate-assets.sh")
        return
    img = page.imgs[0]
    types = {s.get("type") for s in page.sources}
    check({"image/avif", "image/webp"} <= types, f"portrait offers AVIF and WebP ({sorted(t for t in types if t)})")
    lacking = [a for a in ("srcset", "sizes", "width", "height") if not img.get(a)]
    check(not lacking, f"portrait <img> has srcset, sizes, width, height {lacking or ''}")
    check(img.get("fetchpriority") == "high" and img.get("loading") != "lazy",
          'portrait is fetchpriority="high" and not lazy-loaded')
    variants = [p for _, u in refs if (p := local_path(u)) and p.name.startswith("portrait-") and p.exists()]
    too_big = [p.name for p in variants if p.stat().st_size > BUDGET_ANY_PORTRAIT]
    check(not too_big, f"every portrait variant ≤ {BUDGET_ANY_PORTRAIT:,} B {too_big or ''}")
    avif480 = [p for p in variants if re.fullmatch(r"portrait-480\.[0-9a-f]{8}\.avif", p.name)]
    if avif480:
        s = avif480[0].stat().st_size
        check(s <= BUDGET_PORTRAIT_AVIF_480, f"480w AVIF portrait {s:,} B (budget {BUDGET_PORTRAIT_AVIF_480:,})")
    else:
        fail("no 480w AVIF portrait (desktop 2x) — run generate-assets.sh")
    check(not re.search(r"\.(?:hero|hero-text|portrait)\b[^{]*\{[^}]*animation", css), "no animation above the fold")

    # Hashed assets: immutable caching is only safe if every name matches its content.
    bad = [f.name for f in sorted((PUBLIC / "assets").glob("*"))
           if not (m := re.fullmatch(r"(.+)\.([0-9a-f]{8})\.([a-z0-9]+)", f.name))
           or hashlib.sha256(f.read_bytes()).hexdigest()[:8] != m.group(2)]
    check(not bad, f"public/assets/ names match content hashes {bad or ''}")
    referenced = set()
    for other in PUBLIC.glob("*.html"):
        referenced |= set(re.findall(r"assets/([A-Za-z0-9._-]+)", other.read_text(encoding="utf-8")))
    unused = sorted(f.name for f in (PUBLIC / "assets").glob("*") if f.name not in referenced)
    (warn if unused else ok)(f"unreferenced files in public/assets/: {unused or 'none'}")


# ----------------------------------------------------------------- accessibility

def accessibility_checks(page, name):
    print(f"accessibility ({name})")
    no_alt = [i.get("src") for i in page.imgs if i.get("alt") is None]
    check(not no_alt, f"every image has alt {no_alt or ''}")
    broken = [a.get("href") for a in page.anchors if a.get("href", "").startswith("#") and a["href"][1:] and a["href"][1:] not in page.ids]
    check(not broken, f"in-page links resolve {broken or ''}")
    unsafe = [a.get("href") for a in page.anchors if a.get("target") == "_blank" and "noopener" not in (a.get("rel") or "")]
    check(not unsafe, f'new-tab links have rel="noopener" {unsafe or ""}')
    if name != "index.html":
        return
    tag, attrs = page.first_body_child or (None, {})
    if tag != "a" or "skip-link" not in attrs.get("class", ""):
        fail("the first element in <body> must be the skip link (a.skip-link)")
    else:
        target = attrs.get("href", "")[1:]
        if target not in page.ids:
            fail(f"skip link points at #{target}, which doesn't exist")
        else:
            check(page.ids[target].get("tabindex") == "-1", f'skip link → #{target} (tabindex="-1" so focus moves)')


# ---------------------------------------------------------------------- security

def security_checks(pages):
    print("security headers (firebase.json)")
    blocks, catch_all = csp_from_config()
    for key, good in REQUIRED_HEADERS.items():
        check(key in catch_all and good(catch_all[key]), f"{key}: {catch_all.get(key, 'missing')[:90]}")
    csp = parse_csp(catch_all.get("Content-Security-Policy"))
    for directive, want in (("default-src", "'none'"), ("frame-ancestors", "'none'"), ("base-uri", "'none'"), ("form-action", "'none'")):
        check(want in csp.get(directive, []), f"CSP {directive} {want}")
    if any("'unsafe-eval'" in v for v in csp.values()):
        fail("CSP must not allow 'unsafe-eval'")
    # Lighthouse's robots.txt audit fetches /robots.txt from inside the page;
    # without connect-src 'self' the CSP blocks it and SEO drops to 92.
    check("'self'" in csp.get("connect-src", []), "CSP connect-src 'self' (Lighthouse's robots.txt audit needs it)")
    if "'unsafe-inline'" in csp.get("script-src", []):
        fail("CSP script-src must not allow 'unsafe-inline'")
    for directive, origins in THIRD_PARTY.items():
        for o in origins:
            check(o in csp.get(directive, []), f"CSP {directive} allows allowlisted {o}")
    for name, (page, html) in pages.items():
        for attrs, body in page.scripts:
            if attrs.get("src"):
                o = origin(attrs["src"])
                if o and o not in csp.get("script-src", []):
                    fail(f"{name}: {attrs['src']} is blocked by CSP script-src")
                if o and "'self'" in csp.get("script-src", []) and local_path(attrs["src"]) is not None:
                    pass
            elif body.strip():
                h = "'sha256-" + base64.b64encode(hashlib.sha256(body.encode()).digest()).decode() + "'"
                check(h in csp.get("script-src", []), f"{name}: inline <script> allowed by CSP hash {h}")
        if page.imgs and "'self'" not in csp.get("img-src", []):
            fail("CSP img-src must allow 'self'")
    immutable = [b for b in blocks if b.get("source") == "/assets/**"]
    check(immutable and "immutable" in json.dumps(immutable), "/assets/** is cached immutably (names are content hashes)")


def not_found_checks():
    path = PUBLIC / "404.html"
    print("404 page")
    if not path.exists():
        fail("public/404.html is missing (Firebase would serve its own off-brand page)")
        return None
    page, html = parse(path)
    check("noindex" in " ".join(page.meta.get("robots", [])), '404.html has <meta name="robots" content="noindex">')
    check(not any(l.get("rel") == "canonical" for l in page.links), "404.html has no canonical")
    relative = [u for _, u in resource_refs(page, html) if not re.match(r"^(?:/|[a-z]+:)", u)]
    check(not relative, f"404.html uses root-relative paths only (served at any depth) {relative or ''}")
    check(any(a.get("href") == "/" for a in page.anchors), "404.html links home")
    return page, html


# ------------------------------------------------------------------------ layout

LAYOUT_WIDTHS = (320, 360, 390, 768, 1440)


def layout_checks():
    print("layout (headless Chrome)")
    if not Path(CHROME).exists():
        warn("Google Chrome not found — layout checks skipped")
        return
    with tempfile.TemporaryDirectory() as tmp:
        harness = Path(tmp) / "layout.html"
        harness.write_text("""<!doctype html><html><body><pre id="result">pending</pre><script>
const widths = %s, out = {}; let pending = widths.length;
for (const w of widths) {
  const f = document.createElement('iframe');
  f.style.cssText = `width:${w}px;height:800px;border:0`;
  f.src = %s;
  f.onload = () => setTimeout(() => {
    const d = f.contentDocument, links = [...d.querySelectorAll('.nav ul a')];
    const wm = d.querySelector('.wordmark').getBoundingClientRect();
    const first = links[0] && links[0].getBoundingClientRect();
    out[w] = {
      hidden: links.filter(a => { const r = a.getBoundingClientRect(); return r.width === 0 || r.right > w; }).map(a => a.getAttribute('aria-label') || a.textContent),
      navOneLine: new Set(links.map(a => Math.round(a.getBoundingClientRect().top))).size === 1,
      gap: first ? Math.round(first.left - wm.right) : null,
      overflowX: d.documentElement.scrollWidth > d.documentElement.clientWidth,
      buttonsOverflow: [...d.querySelectorAll('.btn')].some(b => b.getBoundingClientRect().right > w),
      skipLinkHidden: d.querySelector('.skip-link').getBoundingClientRect().bottom <= 0,
    };
    if (--pending === 0) document.getElementById('result').textContent = JSON.stringify(out);
  }, 300);
  document.body.appendChild(f);
}
</script></body></html>""" % (json.dumps(list(LAYOUT_WIDTHS)), json.dumps((PUBLIC / "index.html").as_uri())))
        dom = subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--allow-file-access-from-files",
                              "--virtual-time-budget=8000", "--dump-dom", harness.as_uri()],
                             capture_output=True, text=True, timeout=120).stdout
    m = re.search(r'<pre id="result">(.*?)</pre>', dom, re.S)
    try:
        data = json.loads(htmllib.unescape(m.group(1)))
    except (AttributeError, json.JSONDecodeError):
        warn("layout harness produced no result — checks skipped")
        return
    for w, r in data.items():
        problems = []
        if r["hidden"]:
            problems.append(f"nav links hidden or cut off: {r['hidden']}")
        if not r["navOneLine"]:
            problems.append("nav wraps onto two lines")
        if r["gap"] is not None and r["gap"] < 8:
            problems.append(f"nav is only {r['gap']}px from the wordmark")
        if r["overflowX"]:
            problems.append("page scrolls horizontally")
        if r["buttonsOverflow"]:
            problems.append("a button runs off the screen")
        if not r["skipLinkHidden"]:
            problems.append("skip link is visible without keyboard focus")
        check(not problems, f"{w}px: {'; '.join(problems) or 'all nav links visible on one line, no overflow'}")


# -------------------------------------------------------------------------- live

def fetch(url):
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *a, **k):
            return None

    req = urllib.request.Request(url, headers={"User-Agent": "csarko-sh-site-check", "Accept-Encoding": "identity"})
    try:
        with urllib.request.build_opener(NoRedirect).open(req, timeout=15) as r:
            return r.status, {k.lower(): v for k, v in r.headers.items()}, r.read()
    except urllib.error.HTTPError as e:
        return e.code, {k.lower(): v for k, v in e.headers.items()}, e.read()
    except (urllib.error.URLError, OSError) as e:
        return 0, {"location": f"unreachable: {getattr(e, 'reason', e)}"}, b""


def live_checks(base):
    print(f"live: {base}")
    _, catch_all = csp_from_config()
    status, headers, body = fetch(base + "/")
    check(status == 200, f"/ -> {status}")
    for key, good in REQUIRED_HEADERS.items():
        v = headers.get(key.lower())
        check(v and good(v), f"header {key}: {(v or 'missing')[:70]}")
    check(headers.get("content-security-policy") == catch_all.get("Content-Security-Policy"), "live CSP matches firebase.json")
    check("max-age" in headers.get("strict-transport-security", ""), "Strict-Transport-Security present")
    if body != (PUBLIC / "index.html").read_bytes():
        warn("live index.html differs from public/index.html (not deployed yet?)")

    live_page = Page()
    live_page.feed(body.decode("utf-8", "replace"))
    third_js = 0
    for attrs, _ in live_page.scripts:
        if attrs.get("src") and local_path(attrs["src"]) is None:
            s, _, js = fetch(attrs["src"] if attrs["src"].startswith("http") else "https:" + attrs["src"])
            third_js += len(js)
    check(third_js <= BUDGET_SCRIPTS, f"third-party JavaScript {third_js:,} B (budget {BUDGET_SCRIPTS:,})")

    for path, want in (("/robots.txt", "text/plain"), ("/sitemap.xml", "xml"), ("/og-image.jpg", "image/jpeg"),
                       ("/portrait.jpg", "image/jpeg"), ("/favicon.ico", "image"), ("/apple-touch-icon.png", "image/png")):
        s, h, _ = fetch(base + path)
        check(s == 200 and want in h.get("content-type", ""), f"{path} -> {s} {h.get('content-type', '')}")
    asset = next(iter(sorted((PUBLIC / "assets").glob("*.avif"))), None)
    if asset:
        s, h, _ = fetch(f"{base}/assets/{asset.name}")
        check(s == 200 and "immutable" in h.get("cache-control", ""), f"/assets/{asset.name} -> {s}, {h.get('cache-control')}")

    s, h, body = fetch(base + "/some/missing/page")
    check(s == 404 and b"Page not found" in body and b"noindex" in body, f"missing page -> {s} with the custom 404 page")
    s, h, _ = fetch("http://" + base.split("://", 1)[1] + "/")
    check(s in (301, 308) and h.get("location", "").startswith("https://"), f"http:// -> {s} {h.get('location', '')}")
    s, h, _ = fetch("https://www." + base.split("://", 1)[1] + "/some/path?x=1")
    if s in (301, 308) and h.get("location") == base + "/some/path?x=1":
        ok(f"www -> {s} {h['location']}")
    else:
        warn(f"www does not redirect correctly ({s} {h.get('location', '')})")


def lighthouse(url):
    print(f"lighthouse: {url}")
    out = "/tmp/csarko-sh-lighthouse.json"
    subprocess.run(["npx", "-y", "lighthouse@12", url, "--quiet", "--chrome-flags=--headless=new",
                    "--only-categories=seo,accessibility,performance,best-practices",
                    "--output=json", f"--output-path={out}"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        report = json.load(open(out))
    except (OSError, json.JSONDecodeError):
        fail("Lighthouse did not produce a report")
        return
    for key, cat in report["categories"].items():
        score, floor = round(cat["score"] * 100), (95 if key == "performance" else 100)
        check(score >= floor, f"{cat['title']} {score} (must be ≥ {floor})")
        if score < floor:
            for ref in cat["auditRefs"]:
                au = report["audits"][ref["id"]]
                if au.get("score") is not None and au["score"] < 1 and ref.get("weight", 0) > 0:
                    print(f"          ↳ {au['title']} {au.get('displayValue', '')}")
    a = report["audits"]
    cls = a["cumulative-layout-shift"].get("numericValue", 0)
    check(cls <= 0.05, f"Cumulative Layout Shift {cls:.3f} (must be ≤ 0.05)")
    print(f"        LCP {a['largest-contentful-paint'].get('displayValue')} · CLS {a['cumulative-layout-shift'].get('displayValue')} · TBT {a['total-blocking-time'].get('displayValue')}")


def observatory(host):
    print(f"mozilla observatory: {host}")
    req = urllib.request.Request(f"https://observatory-api.mdn.mozilla.net/api/v2/scan?host={host}", method="POST",
                                 headers={"User-Agent": "csarko-sh-site-check"})
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            result = json.load(r)
    except (urllib.error.URLError, OSError, json.JSONDecodeError) as e:
        fail(f"Observatory scan failed: {e}")
        return
    check(result.get("grade") == "A+", f"grade {result.get('grade')} (score {result.get('score')}) {result.get('details_url', '')}")


def main(argv):
    pages = {"index.html": parse(PUBLIC / "index.html")}
    page, html = pages["index.html"]
    seo_checks(page)
    performance_checks(page, html, "index.html")
    accessibility_checks(page, "index.html")
    nf = not_found_checks()
    if nf:
        pages["404.html"] = nf
        performance_checks(*nf, "404.html")
        accessibility_checks(nf[0], "404.html")
    security_checks(pages)
    layout_checks()

    def arg(flag, default):
        i = argv.index(flag)
        return argv[i + 1] if len(argv) > i + 1 and not argv[i + 1].startswith("--") else default

    if "--live" in argv:
        live_checks(arg("--live", SITE))
    if "--lighthouse" in argv:
        lighthouse(arg("--lighthouse", SITE))
    if "--observatory" in argv:
        observatory(arg("--observatory", SITE.split("://", 1)[1]))
    print()
    if failures:
        print(f"✗ {len(failures)} check(s) failed, {len(warnings)} warning(s)")
        return 1
    print(f"✓ site checks passed ({len(warnings)} warning(s))")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
