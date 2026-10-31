#!/usr/bin/env python3
"""pictures.py: a donate door's picture, landscape, as hashed AVIF, WebP and JPEG.

    python3 -I donate/pictures.py --source <png|jpg> [--dark <png>] [--focus-y 0.3] --out <dir> --stem <door>

Every picture comes out landscape, at 640 and 1280 pixels wide, as <stem>-<w>.<hash8>.<ext> (and
<stem>-dark-<w>.<hash8>.<ext> for --dark). A source wider than tall (an app's hero, often near
3:1) keeps its own shape, the height following the width. A source taller than wide (a film's
poster) is cropped to 16:9 with the crop's centre at --focus-y of its height, clamped to the
picture, and is refused without one. A transparent source stays transparent in the AVIF and WebP,
so the page's frame colour shows through in either theme; the JPEG, which has no transparency, is
laid on that colour instead (--surface-2 of the variant's theme, as build_assets.py lays an app
preview). A --dark source must be the same shape as the light one. Sources are turned upright by
their EXIF orientation first. Encoding is build_assets.py's. Prints, as JSON, the srcset entries the
page uses and the 1280-wide picture's size:

    {"sets": {"light": {"avif": ["<file> 640w", ...], "webp": [...], "jpg": [...]}, "dark": {...}},
     "width": 1280, "height": 720}
"""

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / ".agents/skills/site-quality/scripts"))

from PIL import Image, ImageOps  # noqa: E402

from build_assets import encode, short_hash  # noqa: E402

WIDTHS = (640, 1280)
# The crop a portrait gets.
FRAME = (16, 9)
FORMATS = ("avif", "webp", "jpg")
# The JPEG's ground: --surface-2 in the dark and the light theme (public/index.html).
GROUND = {"dark": "#161922", "light": "#eef0f4"}


class PictureError(Exception):
    pass


def landscape(image: Image.Image, focus_y) -> Image.Image:
    """The source as a landscape RGBA picture: a portrait cropped to 16:9 around focus_y, a
    landscape source as it is."""
    image = ImageOps.exif_transpose(image).convert("RGBA")
    w, h = image.size
    if h <= w:
        return image
    if focus_y is None:
        raise PictureError(f"the source is {w}x{h}, taller than wide: give --focus-y for its 16:9 crop")
    ch = round(w * FRAME[1] / FRAME[0])
    top = min(max(round(focus_y * h - ch / 2), 0), h - ch)
    return image.crop((0, top, w, top + ch))


def height_at(image: Image.Image, w: int) -> int:
    return round(w * image.height / image.width)


def write_set(image: Image.Image, stem: str, out: Path, ground: str) -> dict:
    sets = {fmt: [] for fmt in FORMATS}
    for w in WIDTHS:
        resized = image.resize((w, height_at(image, w)), Image.Resampling.LANCZOS)
        flat = Image.alpha_composite(Image.new("RGBA", resized.size, ground), resized).convert("RGB")
        opaque = resized.getchannel("A").getextrema()[0] == 255
        for fmt in FORMATS:
            data = encode(flat if fmt == "jpg" or opaque else resized, fmt)
            name = f"{stem}-{w}.{short_hash(data)}.{fmt}"
            (out / name).write_bytes(data)
            sets[fmt].append(f"{name} {w}w")
    return sets


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="A donate door's landscape picture.")
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--dark", type=Path)
    parser.add_argument("--focus-y", type=float)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--stem", required=True)
    args = parser.parse_args(argv)
    try:
        if args.focus_y is not None and not 0 <= args.focus_y <= 1:
            raise PictureError(f"--focus-y is a fraction of the height, 0 to 1, not {args.focus_y}")
        args.out.mkdir(parents=True, exist_ok=True)
        variants = [("light", args.source, args.stem)] + ([("dark", args.dark, f"{args.stem}-dark")] if args.dark else [])
        sets, heights = {}, set()
        for variant, path, stem in variants:
            if not path.is_file():
                raise PictureError(f"no picture at {path}")
            with Image.open(path) as source:
                picture = landscape(source, args.focus_y)
            heights.add(height_at(picture, WIDTHS[-1]))
            sets[variant] = write_set(picture, stem, args.out, GROUND[variant])
        if len(heights) > 1:
            raise PictureError(f"--dark is not the shape of --source ({sorted(heights)} high at {WIDTHS[-1]} wide)")
    except PictureError as e:
        print(f"pictures.py: {e}", file=sys.stderr)
        return 1
    print(json.dumps({"sets": sets, "width": WIDTHS[-1], "height": heights.pop()}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
