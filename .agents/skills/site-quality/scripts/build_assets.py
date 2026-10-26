#!/usr/bin/env python3
"""
build_assets.py — deterministically build the site's hashed static assets.

Sources (in .agents/skills/site-quality/assets/):
  portrait-source.jpg     the full-resolution portrait
  films/<slug>.jpg        one poster per film in docs/films/, portrait (9:16)
  apps/<slug>.png         one preview per game or app (docs/games/, docs/apps/) that names an alt, landscape;
  apps/<slug>-dark.png    optionally its dark-theme version;
  apps/<slug>-portrait.png, <slug>-portrait-dark.png
                          optionally a tall version, shown beside the card's text on a desktop
                          (the landscape one shows under the title on a phone)
  research/<slug>/<name>.{png,svg}   a doc's figures (docs/published/*-<slug>.md names them)
  reading.js              a doc page's own script: the rail's current section, and section reads
  fonts/*.woff2           self-hosted variable fonts (latin subset)
  vendor/visits.min.js, vendor/vitals.min.js   the lib-visits analytics scripts (see site.json)

Outputs (in public/):
  assets/portrait-<w>.<hash>.{avif,webp,jpg}   w = 240, 360, 480, 720
  assets/film-<slug>-<w>.<hash>.{avif,webp,jpg}   w = 200, 240, 400, 480
  assets/<font>.<hash>.woff2
  assets/visits.<hash>.js, assets/vitals.<hash>.js   (the vendored files without their provenance line)
  portrait.jpg                                 stable 720px URL for JSON-LD / sharing
  projects/<slug>.jpg                          stable 720px poster, cited by the film's VideoObject
  assets/app-<slug>[-dark]-<w>.<hash>.{avif,webp,jpg}   w = 360, 540, 720, 1080
  projects/<slug>.jpg                          stable 720px preview, the <img> before this runs
  assets/fig-<slug>-<name>-<w>.<hash>.{avif,webp,jpg}   w = 480, 720, 960, 1440 (no wider than the source)
  assets/fig-<slug>-<name>.<hash>.svg          an SVG figure, as it is
  research/figures/<slug>-<name>.{jpg,svg}     stable copy: the <img> before this runs, and the
                                               doc's share card when its first figure is a PNG
                                               (a JPEG cut to 1200x630 from the figure's middle)
  assets/reading.<hash>.js                     on doc pages only

Every file in public/assets/ is named by the first 8 hex chars of its SHA-256, so
firebase.json can cache that directory for a year (immutable) without ever
serving a stale file. The HTML references are rewritten between generated
markers in every public/*.html and every page under public/research and /projects that has them:

  <!-- generated:head -->  …  <!-- /generated:head -->          font preload
  /* generated:fonts */    …  /* /generated:fonts */            @font-face rules
  <!-- generated:portrait --> … <!-- /generated:portrait -->    <picture> markup
  <!-- generated:film-poster:<slug> --> … <!-- /… -->           a film's poster <picture>
  <!-- generated:app-preview:<slug> --> … <!-- /… -->           a game's or an app's preview <picture>
  <!-- generated:figure:<slug>/<name> --> … <!-- /… -->         a doc figure's <picture> (or <img>, an SVG)
  <!-- generated:analytics --> … <!-- /generated:analytics -->  analytics <script>s (visits.js, vitals.js)

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
# those two sizes and their 2x. PROJECTS_DIR mirrors docs_lib.mjs, which builds the page: a film's
# poster and a preview each have a stable copy there, by slug (the slugs are unique across kinds).
PROJECTS_DIR = "projects"
# Where those stable copies lived until /film and /apps became /projects (2026-10-26): emptied and
# removed, since firebase.json now 301s both paths.
LEGACY_DIRS = ("film", "apps")
FILM_WIDTHS = (200, 240, 400, 480)
FILM_SIZES = "(max-width: 640px) 200px, 240px"
FILM_FALLBACK_WIDTH = 240
# An app's preview is 360px wide beside its card's text, and the card's full width once it stacks
# on a phone (at most 640px less the page's and the card's padding).
APP_WIDTHS = (360, 540, 720, 1080)
APP_SIZES = "(max-width: 640px) calc(100vw - 94px), 360px"
# With a portrait version: the landscape one on a phone (under the title, full width), the
# portrait one beside the text in a 240px frame otherwise (PROJECTS_CSS in docs_lib.mjs).
PHONE = "(max-width: 640px)"
APP_SIZES_PHONE = "calc(100vw - 94px)"
APP_SIZES_PORTRAIT = "240px"
APP_WIDTHS_PORTRAIT = (240, 480, 720)
APP_FALLBACK_WIDTH = 360
# What the stable poster (and the portrait) are written at: big enough to share, small enough to commit.
STABLE_WIDTH = 720
# A doc's figure spans the reading measure (a doc's main is 72ch, about 720px) and the screen less
# the page's padding on a phone. Its stable copy is the share card's width.
FIGURE_WIDTHS = (480, 720, 960, 1440)
FIGURE_SIZES = "(max-width: 768px) calc(100vw - 48px), 720px"
OG_SIZE = (1200, 630)
DOCS_DIR = "research"
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


def analytics():
    """The analytics config, or None when `provider` is null: `{"endpoint": "/v"}` for lib-visits."""
    a = CONFIG.get("analytics") or {}
    if a.get("provider") == "visits" and a.get("endpoint"):
        return {"endpoint": a["endpoint"]}
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


def strip_comments(js: bytes) -> bytes:
    """Drop whole-line // comments from the vendored scripts before hashing, so the provenance
    line stays in the source and the served bytes are the tag's.
    check.py applies the same rule when it verifies the hash."""
    return b"".join(line for line in js.splitlines(keepends=True) if not line.lstrip().startswith(b"//"))


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


APP_BLOCK = re.compile(
    r"([ ]*)(<!-- generated:app-preview:([a-z0-9-]+) -->)(.*?)([ ]*)(<!-- /generated:app-preview:\3 -->)", re.S)

FIGURE_BLOCK = re.compile(
    r"(<!-- generated:figure:([a-z0-9-]+)/([a-z0-9-]+) -->)(.*?)(<!-- /generated:figure:\2/\3 -->)", re.S)


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
        (PUBLIC / PROJECTS_DIR).mkdir(parents=True, exist_ok=True)
        (PUBLIC / PROJECTS_DIR / f"{slug}.jpg").write_bytes(encode(stable, "jpg"))

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

    # ---- app previews, one per assets/apps/<slug>.png, with <slug>-dark.png for the dark theme
    #      and <slug>-portrait[-dark].png for the tall version beside the text
    app_srcsets: dict = {}
    app_fallback: dict = {}
    app_dir = SRC / "apps"
    for src_path in sorted(app_dir.glob("*.png")) if app_dir.is_dir() else []:
        name = src_path.stem
        if name.endswith("-dark") or name.endswith("-portrait"):
            continue
        slug = name
        app_srcsets[slug] = {}
        variants = (("light", src_path), ("dark", app_dir / f"{slug}-dark.png"), ("portrait-light", app_dir / f"{slug}-portrait.png"), ("portrait-dark", app_dir / f"{slug}-portrait-dark.png"))
        for variant, path in variants:
            if not path.exists():
                continue
            image = Image.open(path)
            # A transparent source (a window with its shadow) is laid on the card's own background,
            # --surface-2 in that theme, since JPEG has no transparency.
            if image.mode in ("RGBA", "LA", "P"):
                image = image.convert("RGBA")
                ground = Image.new("RGBA", image.size, "#161922" if variant.endswith("dark") else "#eef0f4")
                image = Image.alpha_composite(ground, image)
            image = image.convert("RGB")
            ratio = image.height / image.width
            app_srcsets[slug][variant] = {"avif": [], "webp": [], "jpg": []}
            stem = f"app-{slug}" + ("" if variant == "light" else f"-{variant}")
            for w in (APP_WIDTHS_PORTRAIT if variant.startswith("portrait") else APP_WIDTHS):
                resized = image.resize((w, round(w * ratio)), Image.Resampling.LANCZOS)
                for fmt in app_srcsets[slug][variant]:
                    hashed = write_hashed(f"{stem}-{w}", fmt, encode(resized, fmt), keep)
                    app_srcsets[slug][variant][fmt].append(f"assets/{hashed} {w}w")
                    if variant == "light" and fmt == "jpg" and w == APP_FALLBACK_WIDTH:
                        app_fallback[slug] = (hashed, w, round(w * ratio))
            if variant == "light":
                stable = image.resize((STABLE_WIDTH, round(STABLE_WIDTH * ratio)), Image.Resampling.LANCZOS)
                (PUBLIC / PROJECTS_DIR).mkdir(parents=True, exist_ok=True)
                (PUBLIC / PROJECTS_DIR / f"{slug}.jpg").write_bytes(encode(stable, "jpg"))
    # A project that is gone leaves its stable picture behind, which nothing would ever overwrite.
    for stale in sorted((PUBLIC / PROJECTS_DIR).glob("*.jpg")) if (PUBLIC / PROJECTS_DIR).is_dir() else []:
        if stale.stem not in film_srcsets and stale.stem not in app_srcsets:
            stale.unlink()
            print(f"removed public/{PROJECTS_DIR}/{stale.name}")
    for legacy in LEGACY_DIRS:
        for stale in sorted((PUBLIC / legacy).glob("*.jpg")) if (PUBLIC / legacy).is_dir() else []:
            stale.unlink()
            print(f"removed public/{legacy}/{stale.name}")
        if (PUBLIC / legacy).is_dir() and not any((PUBLIC / legacy).iterdir()):
            (PUBLIC / legacy).rmdir()

    def app_picture(slug, prefix, alt, indent):
        """An app's preview <picture>. With a portrait version it carries class="portrait" (the
        card's narrower frame on a desktop) and lists the landscape sources for a phone first,
        then the portrait ones; the dark theme's sources come before the light's each time, and
        the <img> is the one a browser without <picture> support or a phone-less query falls
        back to."""
        name, w, h = app_fallback[slug]
        sets = app_srcsets[slug]
        portrait = "portrait-light" in sets
        ss = lambda variant, fmt: ", ".join(prefix + s for s in sets[variant][fmt])
        lines = []
        def sources(variant, media, sizes, with_jpeg=False):
            if variant not in sets:
                return
            fmts = ("avif", "webp", "jpg") if with_jpeg else ("avif", "webp")
            for fmt in fmts:
                mime = "jpeg" if fmt == "jpg" else fmt
                lines.append(f'{indent}  <source{f" media={chr(34)}{media}{chr(34)}" if media else ""} type="image/{mime}" srcset="{ss(variant, fmt)}" sizes="{sizes}" />')
        if portrait:
            sources("dark", f"(prefers-color-scheme: dark) and {PHONE}", APP_SIZES_PHONE)
            sources("light", PHONE, APP_SIZES_PHONE, with_jpeg=True)
            sources("portrait-dark", "(prefers-color-scheme: dark)", APP_SIZES_PORTRAIT)
            sources("portrait-light", None, APP_SIZES_PORTRAIT)
            img_variant, sizes = "portrait-light", APP_SIZES_PORTRAIT
        else:
            sources("dark", "(prefers-color-scheme: dark)", APP_SIZES)
            sources("light", None, APP_SIZES)
            img_variant, sizes = "light", APP_SIZES
        # The <img>: the portrait light fallback when there is one (its first width is what a
        # desktop shows), else the landscape one.
        fallback = sets[img_variant]["jpg"][0].split(" ")[0] if portrait else f"assets/{name}"
        if portrait:
            fw = APP_WIDTHS_PORTRAIT[0]
            fh = round(fw * Image.open(app_dir / f"{slug}-portrait.png").height / Image.open(app_dir / f"{slug}-portrait.png").width)
        else:
            fw, fh = w, h
        return (
            f'{indent}<picture{" class=" + chr(34) + "portrait" + chr(34) if portrait else ""}>\n' + "\n".join(lines) + "\n"
            f'{indent}  <img src="{prefix}{fallback}" srcset="{ss(img_variant, "jpg")}" sizes="{sizes}" '
            f'width="{fw}" height="{fh}" alt="{alt}" loading="lazy" decoding="async" />\n'
            f'{indent}</picture>'
        )

    def app_block(m, prefix):
        indent, slug, inner = m.group(1), m.group(3), m.group(4)
        if slug not in app_fallback:
            return m.group(0)
        alt = re.search(r'alt="([^"]*)"', inner)
        return indent + m.group(2) + "\n" + app_picture(slug, prefix, alt.group(1) if alt else "", indent) + "\n" + indent + m.group(6)

    # ---- doc figures, one directory a doc: assets/research/<slug>/<name>.png or .svg
    figure_sets: dict = {}
    fig_root = SRC / "research"
    fig_out = PUBLIC / DOCS_DIR / "figures"
    stable_figures: set = set()
    for src_path in sorted(fig_root.glob("*/*")) if fig_root.is_dir() else []:
        slug, name, ext = src_path.parent.name, src_path.stem, src_path.suffix[1:]
        if ext not in ("png", "svg"):
            continue
        fig_out.mkdir(parents=True, exist_ok=True)
        key = f"{slug}/{name}"
        if ext == "svg":
            data = src_path.read_bytes()
            figure_sets[key] = {"svg": write_hashed(f"fig-{slug}-{name}", "svg", data, keep)}
            (fig_out / f"{slug}-{name}.svg").write_bytes(data)
            stable_figures.add(f"{slug}-{name}.svg")
            continue
        image = Image.open(src_path).convert("RGB")
        ratio = image.height / image.width
        widths = [w for w in FIGURE_WIDTHS if w <= image.width] or [image.width]
        sets = {"avif": [], "webp": [], "jpg": []}
        for w in widths:
            resized = image.resize((w, round(w * ratio)), Image.Resampling.LANCZOS)
            for fmt in sets:
                sets[fmt].append((write_hashed(f"fig-{slug}-{name}-{w}", fmt, encode(resized, fmt), keep), w))
        figure_sets[key] = sets
        # The stable copy is the share card's shape, 1200x630, cut from the middle of the figure.
        cover = max(OG_SIZE[0] / image.width, OG_SIZE[1] / image.height)
        scaled = image.resize((round(image.width * cover), round(image.height * cover)), Image.Resampling.LANCZOS)
        left, top = (scaled.width - OG_SIZE[0]) // 2, (scaled.height - OG_SIZE[1]) // 2
        stable = scaled.crop((left, top, left + OG_SIZE[0], top + OG_SIZE[1]))
        (fig_out / f"{slug}-{name}.jpg").write_bytes(encode(stable, "jpg"))
        stable_figures.add(f"{slug}-{name}.jpg")
    for stale in sorted(fig_out.iterdir()) if fig_out.is_dir() else []:
        if stale.name not in stable_figures:
            stale.unlink()
            print(f"removed public/{DOCS_DIR}/figures/{stale.name}")

    def figure_block(m, prefix):
        """A doc figure's markup. The alt text, size and loading come from the <img> being replaced,
        which build_docs.mjs wrote from the Markdown."""
        key, inner = f"{m.group(2)}/{m.group(3)}", m.group(4)
        if key not in figure_sets:
            return m.group(0)
        attr = lambda name: (re.search(f'{name}="([^"]*)"', inner) or [None, ""])[1]
        alt, width, height = attr("alt"), attr("width"), attr("height")
        lazy = ' loading="lazy"' if 'loading="lazy"' in inner else ""
        sets = figure_sets[key]
        if "svg" in sets:
            body = f'<img src="{prefix}assets/{sets["svg"]}" width="{width}" height="{height}" alt="{alt}"{lazy} decoding="async" />'
        else:
            ss = {fmt: ", ".join(f"{prefix}assets/{n} {w}w" for n, w in items) for fmt, items in sets.items()}
            fallback = next((n for n, w in sets["jpg"] if w == 720), sets["jpg"][-1][0])
            body = ("<picture>\n"
                    f'<source type="image/avif" srcset="{ss["avif"]}" sizes="{FIGURE_SIZES}" />\n'
                    f'<source type="image/webp" srcset="{ss["webp"]}" sizes="{FIGURE_SIZES}" />\n'
                    f'<img src="{prefix}assets/{fallback}" srcset="{ss["jpg"]}" sizes="{FIGURE_SIZES}" width="{width}" height="{height}" alt="{alt}"{lazy} decoding="async" />\n'
                    "</picture>")
        return m.group(1) + "\n" + body + "\n" + m.group(5)

    # ---- a doc page's own script, reading.js: whole-line comments stripped, like the vendored ones
    reading = write_hashed("reading", "js", strip_comments((SRC / "reading.js").read_bytes()), keep)

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

    # ---- analytics: lib-visits, self-hosted, the beacon to the same origin (/v is a Hosting
    # rewrite to the collector), so the page makes no third-party request. The vendored
    # copies carry a provenance line that strip_comments drops before hashing, so the served
    # bytes are the tag's.
    conf = analytics()
    core = vitals = None
    if conf:
        core = write_hashed("visits", "js", strip_comments((SRC / "vendor/visits.min.js").read_bytes()), keep)
        vitals = write_hashed("vitals", "js", strip_comments((SRC / "vendor/vitals.min.js").read_bytes()), keep)

    def analytics_block(prefix, slug):
        # A doc page also loads reading.js, after the visits script whose `visits.send` it calls.
        own = f'\n  <script defer src="{prefix}assets/{reading}"></script>' if slug else ""
        if not core:
            return own + "\n  " if own else ""
        return (
            f'\n  <script defer src="{prefix}assets/{core}" data-visits="{conf["endpoint"]}"></script>'
            f'\n  <script defer src="{prefix}assets/{vitals}"></script>{own}\n  '
        )

    # ---- Content-Security-Policy in firebase.json
    directives = {k: list(v) for k, v in CSP}
    if conf:
        directives["script-src"].append("'self'")
    csp = "; ".join(k if k in VALUELESS else f"{k} {' '.join(v)}" for k, v in directives.items() if v or k in VALUELESS)
    fb_path = ROOT / "firebase.json"
    fb = json.loads(fb_path.read_text())
    # The public site's entry: firebase.json lists two sites since admin.csarko.sh.
    hosting = fb["hosting"]
    site = next(h for h in hosting if h.get("public") == "public") if isinstance(hosting, list) else hosting
    for block in site["headers"]:
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
    # down under /research and /projects, so their paths must be root-relative.
    built = [q for d in ("research", PROJECTS_DIR) if (PUBLIC / d).is_dir()
             for q in sorted((PUBLIC / d).glob("*.html"))]
    for page in sorted(PUBLIC.glob("*.html")) + built:
        prefix = "" if page == PUBLIC / "index.html" else "/"
        # A doc page is public/research/<slug>.html; the research index and the other lists are not docs.
        slug = page.stem if page.parent == PUBLIC / "research" and page.name != "index.html" else None
        blocks = {
            (r"<!-- generated:head -->", r"<!-- /generated:head -->"): "\n" + preloads(prefix) + "\n  ",
            (r"/\* generated:fonts \*/", r"/\* /generated:fonts \*/"): "\n" + font_faces(prefix) + "\n    ",
            (r"<!-- generated:portrait -->", r"<!-- /generated:portrait -->"): "\n        " + picture(prefix) + "\n        ",
            (r"<!-- generated:analytics -->", r"<!-- /generated:analytics -->"): analytics_block(prefix, slug),
        }
        html = page.read_text(encoding="utf-8")
        before = html
        for (start, end), body in blocks.items():
            html = re.sub(f"({start})(.*?)({end})", lambda m: m.group(1) + body + m.group(3), html, flags=re.S)
        html = FILM_BLOCK.sub(lambda m: film_block(m, prefix, film_srcsets, film_picture), html)
        html = APP_BLOCK.sub(lambda m: app_block(m, prefix), html)
        html = FIGURE_BLOCK.sub(lambda m: figure_block(m, prefix), html)
        if html != before:
            page.write_text(html, encoding="utf-8")
            print(f"rewrote generated blocks in public/{page.relative_to(PUBLIC)}")

    for name in sorted(keep):
        size = (OUT / name).stat().st_size
        print(f"  assets/{name:44} {size:>7,} B")
    print(f"  portrait.jpg{'':39} {(PUBLIC / 'portrait.jpg').stat().st_size:>7,} B")
    for slug in sorted(film_srcsets):
        f = PUBLIC / PROJECTS_DIR / f"{slug}.jpg"
        print(f"  {PROJECTS_DIR}/{slug}.jpg{'':{max(1, 44 - len(PROJECTS_DIR) - len(slug) - 5)}} {f.stat().st_size:>7,} B")
    return 0


if __name__ == "__main__":
    sys.exit(main())
