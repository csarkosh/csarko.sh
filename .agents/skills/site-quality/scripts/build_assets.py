#!/usr/bin/env python3
"""
build_assets.py — deterministically build the site's hashed static assets.

Sources (in .agents/skills/site-quality/assets/):
  portrait-source.jpg     the full-resolution portrait
  fonts/*.woff2           self-hosted variable fonts (latin subset)

Outputs (in public/):
  assets/portrait-<w>.<hash>.{avif,webp,jpg}   w = 240, 360, 480, 720
  assets/<font>.<hash>.woff2
  portrait.jpg                                 stable 720px URL for JSON-LD / sharing

Every file in public/assets/ is named by the first 8 hex chars of its SHA-256, so
firebase.json can cache that directory for a year (immutable) without ever
serving a stale file. The HTML references are rewritten between generated
markers in every public/*.html that contains them:

  <!-- generated:head -->  …  <!-- /generated:head -->          font preload
  /* generated:fonts */    …  /* /generated:fonts */            @font-face rules
  <!-- generated:portrait --> … <!-- /generated:portrait -->    <picture> markup

Never hand-edit inside the markers; re-run this script. Stale hashed files are
deleted. Requires Pillow with WebP and AVIF support (`pip install Pillow`).
"""

import hashlib
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
    big = source.resize((720, round(720 * ratio)), Image.Resampling.LANCZOS)
    (PUBLIC / "portrait.jpg").write_bytes(encode(big, "jpg"))

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

    # ---- remove stale hashed files
    for f in OUT.iterdir():
        if f.name not in keep:
            f.unlink()

    # ---- rewrite generated blocks in every page that has them
    # index.html uses relative paths (so the file:// preview works); 404.html is
    # served for missing URLs at any depth, so its paths must be root-relative.
    for page in sorted(PUBLIC.glob("*.html")):
        prefix = "/" if page.name == "404.html" else ""
        blocks = {
            (r"<!-- generated:head -->", r"<!-- /generated:head -->"): "\n" + preloads(prefix) + "\n  ",
            (r"/\* generated:fonts \*/", r"/\* /generated:fonts \*/"): "\n" + font_faces(prefix) + "\n    ",
            (r"<!-- generated:portrait -->", r"<!-- /generated:portrait -->"): "\n        " + picture(prefix) + "\n        ",
        }
        html = page.read_text(encoding="utf-8")
        before = html
        for (start, end), body in blocks.items():
            html = re.sub(f"({start})(.*?)({end})", lambda m: m.group(1) + body + m.group(3), html, flags=re.S)
        if html != before:
            page.write_text(html, encoding="utf-8")
            print(f"rewrote generated blocks in public/{page.name}")

    for name in sorted(keep):
        size = (OUT / name).stat().st_size
        print(f"  assets/{name:44} {size:>7,} B")
    print(f"  portrait.jpg{'':39} {(PUBLIC / 'portrait.jpg').stat().st_size:>7,} B")
    return 0


if __name__ == "__main__":
    sys.exit(main())
