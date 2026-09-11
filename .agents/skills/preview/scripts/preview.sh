#!/usr/bin/env bash
#
# preview.sh — look at the local site before it goes anywhere.
#
# Usage:
#   preview.sh            open public/index.html in Chrome (file://)
#   preview.sh --serve    serve public/ on http://localhost:4173 and open it
#   preview.sh --stop     stop a server started with --serve
#   preview.sh --shots    write desktop + mobile screenshots to /tmp/csarko-sh-preview/
#
# Flags combine, e.g. `preview.sh --shots` alone does not open Chrome.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
PUBLIC="$ROOT/public"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
OUT="/tmp/csarko-sh-preview"
PORT=4173
PIDFILE="$OUT/server.pid"

die() { echo "error: $*" >&2; exit 1; }
[[ -f "$PUBLIC/index.html" ]] || die "$PUBLIC/index.html is missing"
mkdir -p "$OUT"

SERVE=0; STOP=0; SHOTS=0
for arg in "$@"; do
  case "$arg" in
    --serve) SERVE=1 ;;
    --stop) STOP=1 ;;
    --shots) SHOTS=1 ;;
    *) die "unknown argument: $arg" ;;
  esac
done

if (( STOP )); then
  if [[ -f "$PIDFILE" ]] && kill "$(cat "$PIDFILE")" 2>/dev/null; then
    echo "stopped server $(cat "$PIDFILE")"
  else
    echo "no running preview server"
  fi
  rm -f "$PIDFILE"
  exit 0
fi

if (( SHOTS )); then
  [[ -x "$CHROME" ]] || die "Google Chrome not found at $CHROME"
  URL="file://$PUBLIC/index.html"
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --virtual-time-budget=4000 \
    --window-size=1440,4000 --screenshot="$OUT/desktop.png" "$URL" 2>/dev/null
  # Headless Chrome won't size a window below ~500px, so a 390px "phone" is
  # rendered inside an iframe of that width and the frame is screenshotted.
  cat > "$OUT/mobile-frame.html" <<EOF
<!doctype html><html><body style="margin:0;background:#333">
<iframe src="$URL" style="width:390px;height:6000px;border:0;display:block"></iframe>
</body></html>
EOF
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files \
    --virtual-time-budget=4000 --window-size=600,6000 \
    --screenshot="$OUT/mobile.png" "file://$OUT/mobile-frame.html" 2>/dev/null
  echo "$OUT/desktop.png"
  echo "$OUT/mobile.png   (the page is the left 390px; the grey strip is the frame)"
fi

# Every preview also runs the static SEO checks, so a broken tag shows up while
# you're still looking at the change rather than at deploy time.
echo
"$ROOT/.agents/skills/seo/scripts/seo_check.py" || echo "(fix the SEO failures above before deploying — see .agents/skills/seo/SKILL.md)"
echo

if (( SERVE )); then
  if [[ -f "$PIDFILE" ]] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
    echo "server already running (pid $(cat "$PIDFILE"))"
  else
    nohup python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$PUBLIC" >"$OUT/server.log" 2>&1 &
    echo $! > "$PIDFILE"
    echo "serving $PUBLIC on http://localhost:$PORT (pid $!) — stop with --stop"
  fi
  open -a "Google Chrome" "http://localhost:$PORT/"
elif (( ! SHOTS )); then
  open -a "Google Chrome" "$PUBLIC/index.html"
  echo "opened $PUBLIC/index.html in Chrome"
fi
