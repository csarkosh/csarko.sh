#!/usr/bin/env bash
#
# preview.sh — look at the local site before it goes anywhere.
#
# Usage:
#   preview.sh            open public/index.html in Chrome (file://)
#   preview.sh --serve    serve public/ on http://localhost:4173 (Firebase-style clean URLs) and open it
#   preview.sh --stop     stop a server started with --serve
#   preview.sh --shots    write desktop + mobile screenshots, dark and light, of the home page and
#                         the newest doc, to /tmp/csarko-sh-preview/
#
# Flags combine, e.g. `preview.sh --shots` alone does not open Chrome.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
PUBLIC="$ROOT/public"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
OUT="/tmp/csarko-sh-preview"
PORT=4173
PIDFILE="$OUT/server.pid"
SERVE_PY="$ROOT/.agents/skills/preview/scripts/serve.py"
CHECK="$ROOT/.agents/skills/site-quality/scripts/check.py"

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
  # Shots load pages over HTTP from serve.py, which routes like Firebase, so root-relative
  # fonts and links (the docs pages use only those) resolve as they do in production.
  SHOT_PORT=4174
  python3 "$SERVE_PY" --port "$SHOT_PORT" --dir "$PUBLIC" >"$OUT/shots-server.log" 2>&1 &
  SHOT_PID=$!
  trap 'kill "$SHOT_PID" 2>/dev/null || true' EXIT
  for _ in $(seq 50); do curl -fs -o /dev/null "http://localhost:$SHOT_PORT/" && break; sleep 0.1; done

  NEWEST="$("$CHECK" --newest-doc)"
  SHOTS_LIST=("|/")                                   # <file prefix>|<path>
  [[ -n "$NEWEST" ]] && SHOTS_LIST+=("doc-|/${NEWEST%.html}")

  for entry in "${SHOTS_LIST[@]}"; do
    prefix="${entry%%|*}"
    URL="http://localhost:$SHOT_PORT${entry#*|}"
    # Headless Chrome won't size a window below ~500px, so a 390px "phone" is
    # rendered inside an iframe of that width and the frame is screenshotted.
    cat > "$OUT/${prefix}mobile-frame.html" <<EOF
<!doctype html><html><body style="margin:0;background:#333">
<iframe src="$URL" style="width:390px;height:6000px;border:0;display:block"></iframe>
</body></html>
EOF
    # The page follows the system color scheme, so shoot both themes explicitly
    # (headless Chrome otherwise inherits this Mac's setting). 0 = dark, 1 = light.
    for theme in dark light; do
      scheme=$([[ $theme == dark ]] && echo 0 || echo 1)
      suffix=$([[ $theme == dark ]] && echo "" || echo "-light")
      "$CHROME" --headless=new --disable-gpu --hide-scrollbars --virtual-time-budget=4000 \
        --blink-settings=preferredColorScheme=$scheme \
        --window-size=1440,4000 --screenshot="$OUT/${prefix}desktop$suffix.png" "$URL" 2>/dev/null
      "$CHROME" --headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files \
        --blink-settings=preferredColorScheme=$scheme \
        --virtual-time-budget=4000 --window-size=600,6000 \
        --screenshot="$OUT/${prefix}mobile$suffix.png" "file://$OUT/${prefix}mobile-frame.html" 2>/dev/null
    done
    echo "$OUT/${prefix}desktop.png   $OUT/${prefix}desktop-light.png"
    echo "$OUT/${prefix}mobile.png    $OUT/${prefix}mobile-light.png   (the page is the left 390px; the grey strip is the frame)"
  done
  kill "$SHOT_PID" 2>/dev/null || true
  wait "$SHOT_PID" 2>/dev/null || true
  trap - EXIT
fi

# Every preview also runs the static site checks (SEO, performance budgets,
# accessibility, security headers, layout), so a regression shows up while
# you're still looking at the change rather than at deploy time.
echo
"$CHECK" || echo "(fix the failures above before deploying — see .agents/skills/site-quality/SKILL.md)"
echo

if (( SERVE )); then
  if [[ -f "$PIDFILE" ]] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
    echo "server already running (pid $(cat "$PIDFILE"))"
  else
    nohup python3 "$SERVE_PY" --port "$PORT" --dir "$PUBLIC" >"$OUT/server.log" 2>&1 &
    echo $! > "$PIDFILE"
    echo "serving $PUBLIC on http://localhost:$PORT (pid $!) — stop with --stop"
  fi
  open -a "Google Chrome" "http://localhost:$PORT/"
elif (( ! SHOTS )); then
  open -a "Google Chrome" "$PUBLIC/index.html"
  echo "opened $PUBLIC/index.html in Chrome (links to /docs need --serve)"
fi
