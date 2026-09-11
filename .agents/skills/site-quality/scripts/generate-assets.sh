#!/usr/bin/env bash
#
# generate-assets.sh — rebuild every generated asset in public/, deterministically.
#
# 1. build_assets.py: hashed portraits (AVIF/WebP/JPEG × 4 widths), hashed fonts,
#    public/portrait.jpg, and the <!-- generated:… --> blocks in public/*.html.
# 2. This script: favicons and the link-preview card, rendered with headless Chrome.
#
# Sources live in .agents/skills/site-quality/assets/; outputs land in public/:
#   favicon.svg            copied as-is (modern browsers)
#   favicon.ico            48×48 (legacy browsers, and Google Search results)
#   favicon-96x96.png      96×96 (Google Search wants a multiple of 48px)
#   apple-touch-icon.png   180×180 (iOS home screen)
#   og-image.jpg           1200×630 link preview for LinkedIn, Slack, X, iMessage
#
# Re-run after changing the name, title, tagline, photo, fonts, or theme colors.
# To change the photo, replace assets/portrait-source.jpg first.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
ASSETS="$ROOT/.agents/skills/site-quality/assets"
PUBLIC="$ROOT/public"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
TMP="$(mktemp -d /tmp/csarko-sh-assets.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

[[ -x "$CHROME" ]] || { echo "error: Google Chrome not found at $CHROME" >&2; exit 1; }
command -v sips >/dev/null || { echo "error: sips not found (macOS only)" >&2; exit 1; }

shot() { # shot <width> <height> <url> <out.png>   (transparent background, so icon corners stay clear)
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files \
    --default-background-color=00000000 \
    --force-device-scale-factor=1 --virtual-time-budget=3000 \
    --window-size="$1,$2" --screenshot="$4" "$3" 2>/dev/null
}

python3 "$ROOT/.agents/skills/site-quality/scripts/build_assets.py"
echo

# Favicons: render the SVG large, then downscale. Headless Chrome won't size a
# window below ~500px, so rendering at 512 and resampling is also the only way
# to get small sizes out of it.
cp "$ASSETS/favicon.svg" "$PUBLIC/favicon.svg"
cat > "$TMP/favicon.html" <<EOF
<!doctype html><html><body style="margin:0;background:transparent">
<img src="file://$ASSETS/favicon.svg" width="512" height="512" style="display:block">
</body></html>
EOF
shot 512 512 "file://$TMP/favicon.html" "$TMP/favicon-512.png"
sips -z 180 180 "$TMP/favicon-512.png" --out "$PUBLIC/apple-touch-icon.png" >/dev/null
sips -z 96 96 "$TMP/favicon-512.png" --out "$PUBLIC/favicon-96x96.png" >/dev/null
sips -z 48 48 "$TMP/favicon-512.png" --out "$TMP/favicon-48.png" >/dev/null
sips -s format ico "$TMP/favicon-48.png" --out "$PUBLIC/favicon.ico" >/dev/null

# Link-preview card
shot 1200 630 "file://$ASSETS/og-image.html" "$TMP/og-image.png"
sips -s format jpeg -s formatOptions 85 "$TMP/og-image.png" --out "$PUBLIC/og-image.jpg" >/dev/null

for f in favicon.svg favicon.ico favicon-96x96.png apple-touch-icon.png og-image.jpg; do
  printf "%-22s %s\n" "$f" "$(sips -g pixelWidth -g pixelHeight "$PUBLIC/$f" 2>/dev/null | awk '/pixel/ {printf "%s ", $2}')$(stat -f '(%z bytes)' "$PUBLIC/$f")"
done
