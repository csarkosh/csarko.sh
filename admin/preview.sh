#!/usr/bin/env bash
#
# preview.sh: look at the admin pages locally, with the sample data, before anything deploys.
#
#   admin/preview.sh               build, serve admin/public on http://localhost:8788, open
#                                  /?preview and /csarko.sh/?preview in Chrome
#   admin/preview.sh --shots       desktop (1440) and phone (390) screenshots of every page, dark
#                                  and light, in /tmp/csarko-sh-admin-preview/
#   admin/preview.sh --lighthouse  Lighthouse (performance, accessibility, best practices) on both
#                                  pages, once per theme, the way site-quality's check.py runs it
#   admin/preview.sh --stop        stop a server started without flags
#   admin/preview.sh --shots --page finance
#                                  one page only (index, csarko-sh, ide-arkos or finance), for
#                                  --shots and --lighthouse
#
# Flags combine. --shots and --lighthouse alone do not open Chrome. The pages follow the
# system colour scheme and have no toggle, so each theme is forced with Chrome's
# --blink-settings=preferredColorScheme (0 = dark, 1 = light), as the site's preview does.
# The phone shots use the site preview's iframe trick (headless Chrome lays a window out
# at ~500px even when asked for 390), with a longer virtual time budget because the framed
# page fetches its data before it has anything to show. Both are taken with reduced motion
# forced: virtual time does not carry a Web Animation to its end, so a card's content would be
# caught part way into its fade in; with every motion duration at 0 the shots show what the page
# settles on. Its motion is check.py --admin's to drive, in real time.

set -euo pipefail

ADMIN="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PUBLIC="$ADMIN/public"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
OUT="/tmp/csarko-sh-admin-preview"
PORT=8788
SHOT_PORT=8789
PIDFILE="$OUT/server.pid"
PAGES=("|/?preview" "csarko-sh-|/csarko.sh/?preview" "ide-arkos-|/ide-arkos/?preview" "finance-|/finance/?preview")     # <file prefix>|<path>
# A page named as an argument (`--page finance`, the file prefix without its dash, or `index`)
# narrows --shots and --lighthouse to that page.

die() { echo "error: $*" >&2; exit 1; }
mkdir -p "$OUT"

SERVE=1; STOP=0; SHOTS=0; LIGHTHOUSE=0; ONLY=""
while (( $# )); do
  case "$1" in
    --shots) SHOTS=1; SERVE=0 ;;
    --lighthouse) LIGHTHOUSE=1; SERVE=0 ;;
    --stop) STOP=1; SERVE=0 ;;
    --page) shift; ONLY="${1:-}"; [[ -n "$ONLY" ]] || die "--page needs a name (index, csarko-sh, ide-arkos, finance)" ;;
    *) die "unknown argument: $1" ;;
  esac
  shift
done
if [[ -n "$ONLY" ]]; then
  kept=()
  for entry in "${PAGES[@]}"; do
    prefix="${entry%%|*}"
    [[ "${prefix%-}" == "$ONLY" || ( -z "$prefix" && "$ONLY" == index ) ]] && kept+=("$entry")
  done
  (( ${#kept[@]} )) || die "no page named $ONLY (index, csarko-sh, ide-arkos, finance)"
  PAGES=("${kept[@]}")
fi

if (( STOP )); then
  if [[ -f "$PIDFILE" ]] && kill "$(cat "$PIDFILE")" 2>/dev/null; then
    echo "stopped server $(cat "$PIDFILE")"
  else
    echo "no running admin preview server"
  fi
  rm -f "$PIDFILE"
  exit 0
fi

node "$ADMIN/build.mjs"

serve_bg() {   # serve_bg <port> → pid; waits until it answers
  python3 -m http.server "$1" --directory "$PUBLIC" --bind 127.0.0.1 >"$OUT/server-$1.log" 2>&1 &
  local pid=$!
  for _ in $(seq 50); do curl -fs -o /dev/null "http://localhost:$1/robots.txt" && break; sleep 0.1; done
  echo "$pid"
}

if (( SHOTS || LIGHTHOUSE )); then
  SHOT_PID="$(serve_bg "$SHOT_PORT")"
  trap 'kill "$SHOT_PID" 2>/dev/null || true' EXIT
fi

if (( SHOTS )); then
  [[ -x "$CHROME" ]] || die "Google Chrome not found at $CHROME"
  for entry in "${PAGES[@]}"; do
    prefix="${entry%%|*}"
    URL="http://localhost:$SHOT_PORT${entry#*|}"
    cat > "$OUT/${prefix}mobile-frame.html" <<EOF
<!doctype html><html><body style="margin:0;background:#333">
<iframe src="$URL" style="width:390px;height:7000px;border:0;display:block"></iframe>
</body></html>
EOF
    for theme in dark light; do
      scheme=$([[ $theme == dark ]] && echo 0 || echo 1)
      suffix=$([[ $theme == dark ]] && echo "" || echo "-light")
      "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-prefers-reduced-motion --virtual-time-budget=12000 \
        --blink-settings=preferredColorScheme=$scheme \
        --window-size=1440,5600 --screenshot="$OUT/${prefix}desktop$suffix.png" "$URL" 2>/dev/null \
        || echo "warning: Chrome exited $? on $URL ($theme desktop)"
      "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-prefers-reduced-motion --allow-file-access-from-files \
        --blink-settings=preferredColorScheme=$scheme \
        --virtual-time-budget=30000 --window-size=600,7000 \
        --screenshot="$OUT/${prefix}mobile$suffix.png" "file://$OUT/${prefix}mobile-frame.html" 2>/dev/null \
        || echo "warning: Chrome exited $? on $URL ($theme phone)"
    done
    echo "$OUT/${prefix}desktop.png   $OUT/${prefix}desktop-light.png"
    echo "$OUT/${prefix}mobile.png    $OUT/${prefix}mobile-light.png   (the page is the left 390px; the grey strip is the frame)"
  done
fi

if (( LIGHTHOUSE )); then
  for entry in "${PAGES[@]}"; do
    URL="http://localhost:$SHOT_PORT${entry#*|}"
    for theme in dark light; do
      scheme=$([[ $theme == dark ]] && echo 0 || echo 1)
      name="$(echo "${entry#*|}" | tr -c 'a-z0-9' '-' | sed 's/-*$//; s/^-*//')"
      report="$OUT/lighthouse-${name:-index}-$theme.json"
      echo "lighthouse ($theme theme): $URL"
      npx -y lighthouse@12 "$URL" --quiet \
        "--chrome-flags=--headless=new --blink-settings=preferredColorScheme=$scheme" \
        --only-categories=accessibility,performance,best-practices \
        --output=json "--output-path=$report" >/dev/null 2>&1 || true
      node -e '
        const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
        for (const [key, cat] of Object.entries(r.categories)) {
          const score = Math.round(cat.score * 100), floor = key === "performance" ? 95 : 100;
          console.log(`  ${score >= floor ? "ok  " : "FAIL"} ${cat.title} ${score} (must be >= ${floor})`);
          if (score < floor) for (const ref of cat.auditRefs) {
            const au = r.audits[ref.id];
            if (au.score !== null && au.score < 1 && ref.weight > 0) console.log(`        -> ${au.title} ${au.displayValue ?? ""}`);
          }
        }
        const a = r.audits;
        console.log(`        LCP ${a["largest-contentful-paint"].displayValue} · CLS ${a["cumulative-layout-shift"].displayValue} · TBT ${a["total-blocking-time"].displayValue}`);
      ' "$report" || echo "  FAIL Lighthouse did not produce a report"
    done
  done
fi

if (( SHOTS || LIGHTHOUSE )); then
  kill "$SHOT_PID" 2>/dev/null || true
  wait "$SHOT_PID" 2>/dev/null || true
  trap - EXIT
fi

if (( SERVE )); then
  if [[ -f "$PIDFILE" ]] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
    echo "server already running (pid $(cat "$PIDFILE"))"
  else
    nohup python3 -m http.server "$PORT" --directory "$PUBLIC" --bind 127.0.0.1 >"$OUT/server.log" 2>&1 &
    echo $! > "$PIDFILE"
    echo "serving $PUBLIC on http://localhost:$PORT (pid $!); stop with --stop"
  fi
  open -a "Google Chrome" "http://localhost:$PORT/?preview" "http://localhost:$PORT/csarko.sh/?preview" "http://localhost:$PORT/ide-arkos/?preview" "http://localhost:$PORT/finance/?preview"
fi
