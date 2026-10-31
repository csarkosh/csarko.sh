#!/usr/bin/env bash
#
# donate/deploy.sh: build donate.csarko.sh (donate/build.mjs) and publish it to the Firebase
# Hosting site csarko-sh-donate, then prove it is live. The build fetches the current prices
# from the prices bucket and refuses to run without them, so this script cannot ship a page
# that has no prices.
#
# Usage:
#   donate/deploy.sh
#
# Exit status is non-zero if the build or a guard fails, the deploy fails, a page is not served
# byte for byte on the default URL, or the prices object is not readable cross-origin.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
die() { echo "error: $*" >&2; exit 1; }

[[ $# -eq 0 ]] || die "unknown argument: $1 (expected nothing)"
command -v terraform >/dev/null || die "terraform is not installed"
command -v npx >/dev/null || die "npx not found"
command -v node >/dev/null || die "node not found"

[[ -d _infra/.terraform ]] || terraform -chdir=_infra init -input=false >/dev/null
tf() { terraform -chdir=_infra output -raw "$1"; }
PROJECT="$(tf gcp_project_id)"
SITE="$(tf donate_hosting_site_id)"
DEFAULT_URL="$(tf donate_hosting_default_url)"
SITE_URL="$(tf donate_site_url)"
BUCKET="$(tf donate_prices_bucket)"

grep -q "\"site\": \"$SITE\"" firebase.json || die "firebase.json has no hosting entry for site \"$SITE\" (Terraform's donate_hosting_site_id)"
echo "→ project  $PROJECT"
echo "→ site     $SITE"
echo "→ prices   gs://$BUCKET/prices.json"

# Never --prices: the live object is the only source a deploy may use.
node donate/build.mjs

# The site's own guards: no email address or phone number, no em-dash, no script but JSON data and the module app.js.
PAGES=()
while IFS= read -r page; do PAGES+=("$page"); done < <(find donate/public -name '*.html' | sort)
[[ ${#PAGES[@]} -gt 0 ]] || die "the build produced no donate pages"
if grep -nEio 'mailto:[^"]*|[a-z0-9._%+-]+@[a-z0-9-]+\.[a-z]{2,}' "${PAGES[@]}" | grep -v '@font-face\|@media\|@2x'; then
  die "a donate page contains an email address; refusing to deploy"
fi
if grep -nE '\+?1?[ .-]?\(?[0-9]{3}\)?[ .-][0-9]{3}[ .-][0-9]{4}' "${PAGES[@]}"; then
  die "a donate page contains a phone number; refusing to deploy"
fi
if grep -n $'\xe2\x80\x94' "${PAGES[@]}"; then die "a donate page contains an em-dash; refusing to deploy"; fi
if grep -noE '<script\b[^>]*>?' "${PAGES[@]}" | grep -vE '<script type="application/(ld\+)?json"[^>]*>$|<script type="module" src="/app\.js">$'; then
  die "a donate page carries a script other than a JSON type (application/json, application/ld+json) or src=\"/app.js\"; refusing to deploy"
fi
echo

npx -y firebase-tools deploy --only "hosting:$SITE" --project "$PROJECT" --non-interactive

serves_local() { # serves_local <base url> <path> <local file>
  local got want
  want="$(shasum -a 256 "$3" | cut -d' ' -f1)"
  got="$(curl -fsSL --compressed -m 20 -H 'Cache-Control: no-cache' "$1$2" | shasum -a 256 | cut -d' ' -f1)" || return 1
  [[ "$got" == "$want" ]]
}
verify() {
  local url="$1" file rel path i
  for file in donate/public/index.html donate/public/*/index.html donate/public/icon.svg donate/public/app.js; do
    rel="${file#donate/public/}"
    case "$rel" in
      index.html) path="/" ;;
      */index.html) path="/${rel%/index.html}" ;;
      *) path="/$rel" ;;
    esac
    for i in 1 2 3 4 5 6; do
      if serves_local "$url" "$path" "$file"; then echo "✓ $url$path serves $file"; continue 2; fi
      sleep 5
    done
    echo "✗ $url$path does not serve $file (yet)"
    return 1
  done
}
prices_cors() {
  local head
  head="$(curl -sI -m 20 -H "Origin: $SITE_URL" "https://storage.googleapis.com/$BUCKET/prices.json?check=$(date +%s)")" || return 1
  grep -qE '^HTTP/[0-9.]+ 200' <<<"$head" || { echo "✗ prices.json did not answer 200"; return 1; }
  grep -qi '^access-control-allow-origin:' <<<"$head" || { echo "✗ prices.json sent no access-control-allow-origin for $SITE_URL (a false negative looks like this when a plain fetch primed the cache; the remedy is gcloud storage objects update gs://$BUCKET/prices.json --cache-control=no-cache)"; return 1; }
  echo "✓ prices.json answers 200 with access-control-allow-origin for $SITE_URL"
}

echo
verify "$DEFAULT_URL" || die "the deploy did not land on $DEFAULT_URL"
prices_cors || die "the prices object is not readable from $SITE_URL"
verify "$SITE_URL" || echo "  (the custom domain may still be propagating or its certificate may still be issuing; check \`terraform -chdir=_infra output donate_custom_domain_state\`)"
