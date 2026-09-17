#!/usr/bin/env python3
"""
build_assets.py — deterministically build the site's hashed static assets.

Sources (in .agents/skills/site-quality/assets/):
  portrait-source.jpg     the full-resolution portrait
  films/<slug>.jpg        one poster per film in docs/films/, portrait (9:16)
  fonts/*.woff2           self-hosted variable fonts (latin subset)

Outputs (in public/):
  assets/portrait-<w>.<hash>.{avif,webp,jpg}   w = 240, 360, 480, 720
  assets/film-<slug>-<w>.<hash>.{avif,webp,jpg}   w = 200, 240, 400, 480
  assets/<font>.<hash>.woff2
  portrait.jpg                                 stable 720px URL for JSON-LD / sharing
  film/<slug>.jpg                              stable 720px poster, cited by the film's VideoObject

Every file in public/assets/ is named by the first 8 hex chars of its SHA-256, so
firebase.json can cache that directory for a year (immutable) without ever
serving a stale file. The HTML references are rewritten between generated
markers in every public/*.html, public/research/*.html and public/games/*.html that has them:

  <!-- generated:head -->  …  <!-- /generated:head -->          font preload
  /* generated:fonts */    …  /* /generated:fonts */            @font-face rules
  <!-- generated:portrait --> … <!-- /generated:portrait -->    <picture> markup
  <!-- generated:film-poster:<slug> --> … <!-- /… -->           a film's poster <picture>
  <!-- generated:analytics --> … <!-- /generated:analytics -->  analytics <script>

It also writes the Content-Security-Policy in firebase.json from CSP below plus
whatever analytics needs, so the page, the policy and check.py's allowlist all
derive from site.json and can't drift apart.

Never hand-edit inside the markers; re-run this script. Stale hashed files are
deleted. Requires Pillow with WebP and AVIF support (`pip install Pillow`).
"""

import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
SRC = ROOT / ".agents/skills/site-quality/assets"
PUBLIC = ROOT / "public"
OUT = PUBLIC / "assets"

WIDTHS = (240, 360, 480, 720)
# Rendered size: 230px wide on desktop, a 120px circle at <=640px viewports.
SIZES = "(max-width: 640px) 120px, 230px"
FALLBACK_WIDTH = 480
# A film poster is 240px wide in its card, 200px once the card stacks on a phone, so these are
# those two sizes and their 2x. FILM_DIR mirrors docs_lib.mjs, which builds the pages.
FILM_DIR = "film"
FILM_WIDTHS = (200, 240, 400, 480)
FILM_SIZES = "(max-width: 640px) 200px, 240px"
FILM_FALLBACK_WIDTH = 240
# What the stable poster (and the portrait) are written at: big enough to share, small enough to commit.
STABLE_WIDTH = 720
CONFIG = json.loads((ROOT / ".agents/skills/site-quality/site.json").read_text())

# The site's Content-Security-Policy, before analytics. Order is preserved.
CSP = [
    ("default-src", ["'none'"]),
    ("script-src", []),
    ("connect-src", ["'self'"]),  # Lighthouse's robots.txt audit fetches from inside the page
    ("img-src", ["'self'"]),
    ("font-src", ["'self'"]),
    ("style-src", ["'self'", "'unsafe-inline'"]),
    ("base-uri", ["'none'"]),
    ("form-action", ["'none'"]),
    ("frame-ancestors", ["'none'"]),
    ("upgrade-insecure-requests", []),
]
VALUELESS = {"upgrade-insecure-requests"}


def analytics_origin():
    a = CONFIG.get("analytics") or {}
    if a.get("provider") == "goatcounter" and a.get("code"):
        return f"https://{a['code']}.goatcounter.com"
    return None
FONTS = {
    # file stem: (family, weight range, preload?)
    "inter-latin-var": ("Inter", "400 700", True),
    "jetbrains-mono-latin-var": ("JetBrains Mono", "400 500", False),
}

# Metric-matched fallbacks, used while the web fonts load, so the swap doesn't
# re-wrap text and shift the layout (it measured CLS 0.125 without these).
# Computed 2026-09-11 with fontTools from the woff2 files against the local
# fallback: size-adjust = letter-frequency-weighted average advance ratio;
# ascent/descent/line-gap = the web font's hhea metrics ÷ size-adjust. Inter's
# values match next/font's published Inter→Arial fallback. Recompute if the
# font files change.
FALLBACKS = {
    "Inter": ('local("Arial")', "107.35%", "90.24%", "22.47%", "0%"),
    "JetBrains Mono": ('local("Courier New")', "99.98%", "102.02%", "30.00%", "0%"),
}


def short_hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()[:8]


def write_hashed(stem: str, ext: str, data: bytes, keep: set) -> str:
    name = f"{stem}.{short_hash(data)}.{ext}"
    (OUT / name).write_bytes(data)
    keep.add(name)
    return name


def encode(img, fmt: str) -> bytes:
    import io

    buf = io.BytesIO()
    if fmt == "avif":
        img.save(buf, "AVIF", quality=60, speed=4)
    elif fmt == "webp":
        img.save(buf, "WEBP", quality=80, method=6)
    else:
        img.save(buf, "JPEG", quality=82, optimize=True, progressive=True)
    return buf.getvalue()


# A film poster's block, with the indentation of its opening marker, so the <picture> that replaces
# its contents lines up with the markup around it.
FILM_BLOCK = re.compile(
    r"([ ]*)(<!-- generated:film-poster:([a-z0-9-]+) -->)(.*?)([ ]*)(<!-- /generated:film-poster:\3 -->)", re.S)


def film_block(m, prefix, film_srcsets, film_picture):
    indent, slug, inner = m.group(1), m.group(3), m.group(4)
    # No source image for this slug: leave the page alone rather than drop the poster it already has.
    if slug not in film_srcsets:
        return m.group(0)
    alt = re.search(r'alt="([^"]*)"', inner)
    return (indent + m.group(2) + "\n"
            + film_picture(slug, prefix, alt.group(1) if alt else "", indent)
            + "\n" + indent + m.group(6))


def main() -> int:
    try:
        from PIL import Image, features
    except ImportError:
        print("error: Pillow is required — pip install Pillow", file=sys.stderr)
        return 1
    for fmt in ("webp", "avif"):
        if not features.check(fmt):
            print(f"error: this Pillow build can't encode {fmt.upper()}", file=sys.stderr)
            return 1

    OUT.mkdir(parents=True, exist_ok=True)
    keep: set = set()

    # ---- portraits
    source = Image.open(SRC / "portrait-source.jpg").convert("RGB")
    ratio = source.height / source.width
    srcsets = {"avif": [], "webp": [], "jpg": []}
    fallback = None
    for w in WIDTHS:
        resized = source.resize((w, round(w * ratio)), Image.Resampling.LANCZOS)
        for fmt in srcsets:
            name = write_hashed(f"portrait-{w}", fmt, encode(resized, fmt), keep)
            srcsets[fmt].append(f"assets/{name} {w}w")
            if fmt == "jpg" and w == FALLBACK_WIDTH:
                fallback = (name, w, round(w * ratio))
    big = source.resize((STABLE_WIDTH, round(STABLE_WIDTH * ratio)), Image.Resampling.LANCZOS)
    (PUBLIC / "portrait.jpg").write_bytes(encode(big, "jpg"))

    # ---- film posters, one per docs/films/<slug>.md (the page builder writes the markers)
    film_srcsets: dict = {}
    film_fallback: dict = {}
    film_dir = SRC / "films"
    for src_path in sorted(film_dir.glob("*.jpg")) if film_dir.is_dir() else []:
        slug = src_path.stem
        poster = Image.open(src_path).convert("RGB")
        poster_ratio = poster.height / poster.width
        film_srcsets[slug] = {"avif": [], "webp": [], "jpg": []}
        for w in FILM_WIDTHS:
            resized = poster.resize((w, round(w * poster_ratio)), Image.Resampling.LANCZOS)
            for fmt in film_srcsets[slug]:
                name = write_hashed(f"film-{slug}-{w}", fmt, encode(resized, fmt), keep)
                film_srcsets[slug][fmt].append(f"assets/{name} {w}w")
                if fmt == "jpg" and w == FILM_FALLBACK_WIDTH:
                    film_fallback[slug] = (name, w, round(w * poster_ratio))
        stable = poster.resize((STABLE_WIDTH, round(STABLE_WIDTH * poster_ratio)), Image.Resampling.LANCZOS)
        (PUBLIC / FILM_DIR).mkdir(parents=True, exist_ok=True)
        (PUBLIC / FILM_DIR / f"{slug}.jpg").write_bytes(encode(stable, "jpg"))
    # A film that is gone leaves its stable poster behind, which nothing would ever overwrite.
    for stale_poster in sorted((PUBLIC / FILM_DIR).glob("*.jpg")) if (PUBLIC / FILM_DIR).is_dir() else []:
        if stale_poster.stem not in film_srcsets:
            stale_poster.unlink()
            print(f"removed public/{FILM_DIR}/{stale_poster.name}")

    def picture(prefix):
        ss = {fmt: ", ".join(prefix + s for s in items) for fmt, items in srcsets.items()}
        return (
            "<picture>\n"
            f'          <source type="image/avif" srcset="{ss["avif"]}" sizes="{SIZES}" />\n'
            f'          <source type="image/webp" srcset="{ss["webp"]}" sizes="{SIZES}" />\n'
            f'          <img src="{prefix}assets/{fallback[0]}" srcset="{ss["jpg"]}" sizes="{SIZES}" '
            f'width="{fallback[1]}" height="{fallback[2]}" alt="Portrait of Cyrus Sarkosh" fetchpriority="high" />\n'
            "        </picture>"
        )

    def film_picture(slug, prefix, alt, indent):
        """A film poster's <picture>. The alt text comes from the markup being replaced, which
        build_docs.mjs wrote from the film's front matter: one source of truth, carried across."""
        ss = {fmt: ", ".join(prefix + s for s in items) for fmt, items in film_srcsets[slug].items()}
        name, w, h = film_fallback[slug]
        return (
            f'{indent}<picture>\n'
            f'{indent}  <source type="image/avif" srcset="{ss["avif"]}" sizes="{FILM_SIZES}" />\n'
            f'{indent}  <source type="image/webp" srcset="{ss["webp"]}" sizes="{FILM_SIZES}" />\n'
            f'{indent}  <img src="{prefix}assets/{name}" srcset="{ss["jpg"]}" sizes="{FILM_SIZES}" '
            f'width="{w}" height="{h}" alt="{alt}" loading="lazy" decoding="async" />\n'
            f'{indent}</picture>'
        )

    # ---- fonts
    fonts = [(write_hashed(stem, "woff2", (SRC / "fonts" / f"{stem}.woff2").read_bytes(), keep), family, weights, preload)
             for stem, (family, weights, preload) in FONTS.items()]

    def font_faces(prefix):
        faces = [
            "    @font-face {\n"
            f'      font-family: "{family}"; font-style: normal; font-weight: {weights}; font-display: swap;\n'
            f'      src: url("{prefix}assets/{name}") format("woff2");\n'
            "    }"
            for name, family, weights, _ in fonts
        ]
        for family, (src, size, ascent, descent, gap) in FALLBACKS.items():
            faces.append(
                "    @font-face {\n"
                f'      font-family: "{family} Fallback"; src: {src};\n'
                f"      size-adjust: {size}; ascent-override: {ascent}; descent-override: {descent}; line-gap-override: {gap};\n"
                "    }"
            )
        return "\n".join(faces)

    def preloads(prefix):
        return "\n".join(f'  <link rel="preload" href="{prefix}assets/{name}" as="font" type="font/woff2" crossorigin />'
                          for name, _, _, preload in fonts if preload)

    # ---- analytics: GoatCounter's count.js, self-hosted so no third-party script loads
    origin = analytics_origin()
    counter = None
    if origin:
        counter = write_hashed("goatcounter-count", "js", (SRC / "vendor/goatcounter-count.js").read_bytes(), keep)

    def analytics(prefix):
        if not counter:
            return ""
        return f'\n  <script data-goatcounter="{origin}/count" async src="{prefix}assets/{counter}"></script>\n  '

    # ---- Content-Security-Policy in firebase.json
    directives = {k: list(v) for k, v in CSP}
    if origin:
        directives["script-src"].append("'self'")
        directives["connect-src"].append(origin)
        directives["img-src"].append(origin)  # count.js falls back to an image beacon
    csp = "; ".join(k if k in VALUELESS else f"{k} {' '.join(v)}" for k, v in directives.items() if v or k in VALUELESS)
    fb_path = ROOT / "firebase.json"
    fb = json.loads(fb_path.read_text())
    for block in fb["hosting"]["headers"]:
        if block.get("source") == "**":
            for h in block["headers"]:
                if h["key"] == "Content-Security-Policy" and h["value"] != csp:
                    h["value"] = csp
                    fb_path.write_text(json.dumps(fb, indent=2) + "\n")
                    print("rewrote Content-Security-Policy in firebase.json")

    # ---- remove stale hashed files
    for f in OUT.iterdir():
        if f.name not in keep:
            f.unlink()

    # ---- rewrite generated blocks in every page that has them
    # index.html uses relative paths (so the file:// preview works). 404.html is
    # served for missing URLs at any depth, and the built pages live a directory
    # down under /research, /games and /film, so their paths must be root-relative.
    built = [q for d in ("research", "games", FILM_DIR) if (PUBLIC / d).is_dir()
             for q in sorted((PUBLIC / d).glob("*.html"))]
    for page in sorted(PUBLIC.glob("*.html")) + built:
        prefix = "" if page == PUBLIC / "index.html" else "/"
        blocks = {
            (r"<!-- generated:head -->", r"<!-- /generated:head -->"): "\n" + preloads(prefix) + "\n  ",
            (r"/\* generated:fonts \*/", r"/\* /generated:fonts \*/"): "\n" + font_faces(prefix) + "\n    ",
            (r"<!-- generated:portrait -->", r"<!-- /generated:portrait -->"): "\n        " + picture(prefix) + "\n        ",
            (r"<!-- generated:analytics -->", r"<!-- /generated:analytics -->"): analytics(prefix),
        }
        html = page.read_text(encoding="utf-8")
        before = html
        for (start, end), body in blocks.items():
            html = re.sub(f"({start})(.*?)({end})", lambda m: m.group(1) + body + m.group(3), html, flags=re.S)
        html = FILM_BLOCK.sub(lambda m: film_block(m, prefix, film_srcsets, film_picture), html)
        if html != before:
            page.write_text(html, encoding="utf-8")
            print(f"rewrote generated blocks in public/{page.relative_to(PUBLIC)}")

    for name in sorted(keep):
        size = (OUT / name).stat().st_size
        print(f"  assets/{name:44} {size:>7,} B")
    print(f"  portrait.jpg{'':39} {(PUBLIC / 'portrait.jpg').stat().st_size:>7,} B")
    for slug in sorted(film_srcsets):
        f = PUBLIC / FILM_DIR / f"{slug}.jpg"
        print(f"  {FILM_DIR}/{slug}.jpg{'':{max(1, 44 - len(FILM_DIR) - len(slug) - 5)}} {f.stat().st_size:>7,} B")
    return 0


if __name__ == "__main__":
    sys.exit(main())
