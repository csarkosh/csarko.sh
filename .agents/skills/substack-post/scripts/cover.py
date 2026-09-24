#!/usr/bin/env python3
"""Render a Substack post's 1456x1048 cover card.

    cover.py "<post title>" <out.jpg>

Fills ../assets/cover.html, screenshots it with headless Chrome (found where
generate-assets.sh finds it) and converts it to JPEG with sips. macOS only, like the
site's other generated images.
"""

import html
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

SKILL = Path(__file__).resolve().parents[1]
FONTS = SKILL.parent / "site-quality/assets/fonts"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__.strip())
    title, out = sys.argv[1], Path(sys.argv[2]).resolve()
    if not Path(CHROME).exists():
        sys.exit(f"error: Google Chrome not found at {CHROME}")
    if not shutil.which("sips"):
        sys.exit("error: sips not found (macOS only)")

    page = (SKILL / "assets/cover.html").read_text(encoding="utf-8")
    page = page.replace("{{FONTS}}", FONTS.as_uri()).replace("{{TITLE}}", html.escape(title))
    with tempfile.TemporaryDirectory() as tmp:
        src, png = Path(tmp) / "cover.html", Path(tmp) / "cover.png"
        src.write_text(page, encoding="utf-8")
        subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
                        "--allow-file-access-from-files", "--force-device-scale-factor=1",
                        "--virtual-time-budget=3000", "--window-size=1456,1048",
                        f"--screenshot={png}", src.as_uri()],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        out.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "88", str(png), "--out", str(out)],
                       check=True, stdout=subprocess.DEVNULL)
    print(out)


if __name__ == "__main__":
    main()
