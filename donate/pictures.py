#!/usr/bin/env python3
"""pictures.py: a donate door's picture, landscape, as hashed AVIF, WebP and JPEG.

    python3 -I donate/pictures.py --source <png|jpg> [--dark <png>] [--focus-y 0.3] --out <dir> --stem <door>

Every picture comes out 16:9, at 640 and 1280 pixels wide, as <stem>-<w>.<hash8>.<ext> (and
<stem>-dark-<w>.<hash8>.<ext> for --dark). A source taller than wide (a film's poster) is cropped
to 16:9 with the crop's centre at --focus-y of its height, clamped to the picture, and is refused
without one. A landscape source of another shape (an app's hero, often wider than 16:9) is fitted
whole inside the 16:9 frame and the rest left transparent, so the page's frame colour shows
around it in either theme; the JPEG, which has no transparency, is laid on that colour instead
(--surface-2 of the variant's theme, as build_assets.py lays an app preview). Encoding is
build_assets.py's. Prints, as JSON, the srcset entries the page uses:

    {"sets": {"light": {"avif": ["<file> 640w", ...], "webp": [...], "jpg": [...]}, "dark": {...}},
     "width": 1280, "height": 720}
"""

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / ".agents/skills/site-quality/scripts"))

from PIL import Image  # noqa: E402

from build_assets import encode, short_hash  # noqa: E402

WIDTHS = (640, 1280)
FRAME = (16, 9)
FORMATS = ("avif", "webp", "jpg")
# The JPEG's ground: --surface-2 in the dark and the light theme (public/index.html).
GROUND = {"dark": "#161922", "light": "#eef0f4"}


class PictureError(Exception):
    pass


def landscape(image: Image.Image, focus_y) -> Image.Image:
    """The source as a 16:9 RGBA picture: a portrait cropped around focus_y, anything else fitted."""
    image = image.convert("RGBA")
    w, h = image.size
    if h > w:
        if focus_y is None:
            raise PictureError(f"the source is {w}x{h}, taller than wide: give --focus-y for its 16:9 crop")
        ch = round(w * FRAME[1] / FRAME[0])
        top = min(max(round(focus_y * h - ch / 2), 0), h - ch)
        return image.crop((0, top, w, top + ch))
    if w * FRAME[1] == h * FRAME[0]:
        return image
    # Fit the whole source in the frame, centred, at the source's own scale.
    fw, fh = (w, round(w * FRAME[1] / FRAME[0])) if w * FRAME[1] > h * FRAME[0] else (round(h * FRAME[0] / FRAME[1]), h)
    frame = Image.new("RGBA", (fw, fh), (0, 0, 0, 0))
    frame.paste(image, ((fw - w) // 2, (fh - h) // 2))
    return frame


def write_set(image: Image.Image, stem: str, out: Path, ground: str) -> dict:
    sets = {fmt: [] for fmt in FORMATS}
    for w in WIDTHS:
        resized = image.resize((w, round(w * FRAME[1] / FRAME[0])), Image.Resampling.LANCZOS)
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
        sets = {}
        for variant, path, stem in variants:
            if not path.is_file():
                raise PictureError(f"no picture at {path}")
            with Image.open(path) as source:
                sets[variant] = write_set(landscape(source, args.focus_y), stem, args.out, GROUND[variant])
    except PictureError as e:
        print(f"pictures.py: {e}", file=sys.stderr)
        return 1
    print(json.dumps({"sets": sets, "width": WIDTHS[-1], "height": WIDTHS[-1] * FRAME[1] // FRAME[0]}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
