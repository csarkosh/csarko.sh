#!/usr/bin/env python3
"""compose.py: the bare door's picture, donate.csarko.sh's root, from the project pictures.

    python3 -I donate/scripts/compose.py

Five tilted cards fanned left to right on the site's dark field: the two film posters at the
ends, cropped to 4:5, and the three apps between them (MacStats' gauges, Arkos IDE's centre
window, lib-visits' journey), each cropped to a window of its most recognisable part. Every card
has a 1px border and a soft shadow; the accent shows only as a faint glow behind the fan. No words
are drawn here (the words inside the screenshots are their own). Nothing is random: every crop,
size, centre and angle is a constant below, so the same sources give the same bytes.

The picture is drawn at SCALE times its size and brought down with LANCZOS, so the tilted edges
come out smooth. Writes .agents/skills/site-quality/assets/donate/body-of-work.png, 1920 by 1080.
"""

import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / ".agents/skills/site-quality/assets"
OUT = ASSETS / "donate/body-of-work.png"

# The picture, in final pixels, and the supersampling factor it is drawn at.
WIDTH, HEIGHT = 1920, 1080
SCALE = 2

# The site's palette (public/index.html, dark theme).
BG = (10, 11, 14)          # --bg #0a0b0e
SURFACE = (17, 19, 24)     # --surface #111318, under a transparent screenshot
BORDER = (31, 36, 48)      # the border colour #1f2430
ACCENT = (125, 211, 192)   # --accent #7dd3c0

# The accent's glow behind the fan: its centre, its radii (an ellipse), its peak opacity and
# the spacing of the grid it is worked out on.
GLOW_CENTER = (960, 560)
GLOW_RADII = (900, 420)
GLOW_ALPHA = 0.22
GLOW_STEP = 8

# A card's corner radius and border width, and its shadow: offset, blur radius, opacity.
CARD_RADIUS = 10
BORDER_WIDTH = 1
SHADOW_OFFSET = (0, 22)
SHADOW_BLUR = 26
SHADOW_ALPHA = 0.70

# The cards, back to front. Each: the source (under ASSETS), the crop box in the source's own
# pixels (left, top, right, bottom), the card's width (its height follows the crop's shape), its
# centre on the picture and its angle in degrees (positive turns it anticlockwise). They zigzag
# across the field, high and low, so a neighbour covers only a corner; the posters lie over the
# two side apps' outer edges and Arkos IDE over their inner corners.
CARDS = [
    {   # MacStats, 4:3, the menu bar's readings over the CPU gauges.
        "source": "apps/app-macstats.png",
        "crop": (16, 0, 696, 510),
        "width": 480,
        "center": (648, 392),
        "angle": 4.0,
    },
    {   # lib-visits, 3:2, the journey's window: title bar, its first three steps and their arrows.
        "source": "apps/lib-visits-dark.png",
        "crop": (92, 48, 1313, 862),
        "width": 520,
        "center": (1296, 404),
        "angle": -4.0,
    },
    {   # The Last Trail, 4:5, her face and the radio's green light.
        "source": "films/the-last-trail.jpg",
        "crop": (0, 40, 720, 940),
        "width": 360,
        "center": (232, 596),
        "angle": 7.0,
    },
    {   # Who is standing in my hallway?, 4:5, the face over the phone's light.
        "source": "films/who-is-standing-in-my-hallway.jpg",
        "crop": (90, 60, 990, 1185),
        "width": 360,
        "center": (1688, 596),
        "angle": -7.0,
    },
    {   # Arkos IDE, 16:10, the hero's centre window above its label, in front.
        "source": "apps/ide-arkos.png",
        "crop": (516, 76, 1283, 550),
        "width": 640,
        "center": (962, 640),
        "angle": -1.5,
    },
]


def glow(size):
    """The field: --bg with a faint elliptical accent glow, fading to nothing at its rim."""
    w, h = size
    # The glow's opacity, worked out on a grid GLOW_STEP pixels apart and smoothed up to size.
    gw, gh = WIDTH // GLOW_STEP + 1, HEIGHT // GLOW_STEP + 1
    values = []
    for gy in range(gh):
        for gx in range(gw):
            dx = (gx * GLOW_STEP - GLOW_CENTER[0]) / GLOW_RADII[0]
            dy = (gy * GLOW_STEP - GLOW_CENTER[1]) / GLOW_RADII[1]
            fade = max(0.0, 1 - math.hypot(dx, dy)) ** 1.5
            values.append(round(255 * GLOW_ALPHA * fade))
    grid = Image.new("L", (gw, gh))
    grid.putdata(values)
    mask = grid.resize((w, h), Image.BICUBIC)
    field = Image.new("RGB", (w, h), BG)
    return Image.composite(Image.new("RGB", (w, h), ACCENT), field, mask)


def size_of(spec):
    """A card's size in final pixels: its width, and the height its crop's shape gives."""
    left, top, right, bottom = spec["crop"]
    return spec["width"], round(spec["width"] * (bottom - top) / (right - left))


def card(spec, scale):
    """One card, upright: the crop laid on --surface, resized, rounded, with its border."""
    w, h = (n * scale for n in size_of(spec))
    with Image.open(ASSETS / spec["source"]) as source:
        picture = source.convert("RGBA").crop(spec["crop"])
    picture = picture.resize((w, h), Image.LANCZOS)
    face = Image.new("RGBA", (w, h), SURFACE + (255,))
    face.alpha_composite(picture)
    radius, line = CARD_RADIUS * scale, BORDER_WIDTH * scale
    shape = Image.new("L", (w, h), 0)
    ImageDraw.Draw(shape).rounded_rectangle((0, 0, w - 1, h - 1), radius=radius, fill=255)
    ImageDraw.Draw(face).rounded_rectangle((0, 0, w - 1, h - 1), radius=radius, outline=BORDER + (255,), width=line)
    face.putalpha(shape)
    return face


def place(canvas, spec, scale):
    """Tilts a card, lays its shadow and then the card on the canvas, centred where it says."""
    tilted = card(spec, scale).rotate(spec["angle"], resample=Image.BICUBIC, expand=True)
    cx, cy = spec["center"][0] * scale, spec["center"][1] * scale
    left, top = cx - tilted.width // 2, cy - tilted.height // 2
    pad = SHADOW_BLUR * scale * 3
    alpha = Image.new("L", (tilted.width + 2 * pad, tilted.height + 2 * pad), 0)
    alpha.paste(tilted.getchannel("A"), (pad, pad))
    alpha = alpha.filter(ImageFilter.GaussianBlur(SHADOW_BLUR * scale))
    alpha = alpha.point(lambda v: round(v * SHADOW_ALPHA))
    shadow = Image.new("RGBA", alpha.size, (0, 0, 0, 0))
    shadow.putalpha(alpha)
    dx, dy = SHADOW_OFFSET[0] * scale, SHADOW_OFFSET[1] * scale
    _paste_clipped(canvas, shadow, left - pad + dx, top - pad + dy)
    _paste_clipped(canvas, tilted, left, top)


def _paste_clipped(canvas, layer, x, y):
    """alpha_composite refuses a layer that hangs off the canvas; clip it to the canvas first."""
    sx, sy = max(0, -x), max(0, -y)
    ex, ey = min(layer.width, canvas.width - x), min(layer.height, canvas.height - y)
    if ex <= sx or ey <= sy:
        return
    canvas.alpha_composite(layer.crop((sx, sy, ex, ey)), (x + sx, y + sy))


def compose():
    size = (WIDTH * SCALE, HEIGHT * SCALE)
    canvas = glow(size).convert("RGBA")
    for spec in CARDS:
        place(canvas, spec, SCALE)
    return canvas.convert("RGB").resize((WIDTH, HEIGHT), Image.LANCZOS)


def main():
    picture = compose()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    picture.save(OUT, optimize=True)
    print(f"{OUT.relative_to(ROOT)}: {picture.width}x{picture.height}, {OUT.stat().st_size} bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
