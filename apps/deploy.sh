#!/usr/bin/env bash
#
# apps/deploy.sh: build apps.csarko.sh (apps/build.mjs) and publish it to the Firebase Hosting
# site csarko-sh-apps, then prove it is live. Run it after an app's README changes or it
# releases, so its page carries the new content and the new download buttons.
#
# Usage:
#   apps/deploy.sh
#
# Exit status is non-zero if the build or a guard fails, the deploy fails, a page is not served
# byte for byte, or "/" stops redirecting to https://csarko.sh/projects.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
die() { echo "error: $*" >&2; exit 1; }

[[ $# -eq 0 ]] || die "unknown argument: $1 (expected nothing)"
command -v terraform >/dev/null || die "terraform is not installed"
command -v npx >/dev/null || die "npx not found"

[[ -d _infra/.terraform ]] || terraform -chdir=_infra init -input=false >/dev/null
tf() { terraform -chdir=_infra output -raw "$1"; }
PROJECT="$(tf gcp_project_id)"
SITE="$(tf apps_hosting_site_id)"
DEFAULT_URL="$(tf apps_hosting_default_url)"
SITE_URL="$(tf apps_site_url)"

grep -q "\"site\": \"$SITE\"" firebase.json || die "firebase.json has no hosting entry for site \"$SITE\" (Terraform's apps_hosting_site_id)"
echo "→ project  $PROJECT"
echo "→ site     $SITE"

node apps/build.mjs

# The site's own guards: no email address or phone number, no em-dash, no script.
PAGES=(apps/public/*/index.html apps/public/404.html)
if grep -nEio 'mailto:[^"]*|[a-z0-9._%+-]+@[a-z0-9-]+\.[a-z]{2,}' "${PAGES[@]}" | grep -v '@font-face\|@media\|@2x'; then
  die "an apps page contains an email address — refusing to deploy"
fi
if grep -nE '\+?1?[ .-]?\(?[0-9]{3}\)?[ .-][0-9]{3}[ .-][0-9]{4}' "${PAGES[@]}"; then
  die "an apps page contains a phone number — refusing to deploy"
fi
if grep -n '—' "${PAGES[@]}"; then die "an apps page contains an em-dash — refusing to deploy"; fi
if grep -nE '<script\b' "${PAGES[@]}" | grep -v 'application/ld+json'; then
  die "an apps page carries a script; the CSP allows none from this host — refusing to deploy"
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
  local url="$1" page slug i
  for page in apps/public/*/index.html; do
    slug="$(basename "$(dirname "$page")")"
    for i in 1 2 3 4 5 6; do
      if serves_local "$url" "/$slug" "$page"; then echo "✓ $url/$slug serves $page"; continue 2; fi
      sleep 5
    done
    echo "✗ $url/$slug does not serve $page (yet)"
    return 1
  done
  local where
  where="$(curl -s -o /dev/null -m 20 -w '%{http_code} %{redirect_url}' "$url/")"
  [[ "$where" == "301 https://csarko.sh/projects" ]] && echo "✓ $url/ redirects to https://csarko.sh/projects" || { echo "✗ $url/ answered $where"; return 1; }
}

echo
verify "$DEFAULT_URL" || die "the deploy did not land on $DEFAULT_URL"
verify "$SITE_URL" || echo "  (the custom domain may still be propagating or its certificate may still be issuing — check \`terraform -chdir=_infra output apps_custom_domain_state\`)"
