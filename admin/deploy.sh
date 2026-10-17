#!/usr/bin/env bash
#
# admin/deploy.sh: publish admin.csarko.sh (the shell, the csarko.sh dashboard and the
# Day Hike bundle) to the Firebase Hosting site csarko-sh-admin, and prove it is live.
#
# The Day Hike page is built in ~/Projects/game-dayhike (`npm run deploy:admin` there
# uploads it to gs://fps-csarko-downloads/admin/latest/ and then runs this script).
# Firebase Hosting has no partial deploys, so this one place assembles the whole site:
# the shell from admin/public, the bundle pulled from that bucket into the git-ignored
# admin/public/game-dayhike/. The API (admin/api) is deployed separately with
# `gcloud run deploy csarko-admin --source admin/api --region us-west1 --project csarko-sh`;
# Terraform owns everything about that service but its image.
#
# Usage:
#   admin/deploy.sh              build, pull the Day Hike bundle, check, deploy, verify
#   admin/deploy.sh --no-pull    skip the bucket (keep whatever admin/public/game-dayhike holds)
#
# Exit status is non-zero if a guard fails (privacy, the admin checks), the deploy fails,
# or the live site does not serve what was just deployed.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
die() { echo "error: $*" >&2; exit 1; }

PULL=1
case "${1:-}" in
  "") ;;
  --no-pull) PULL=0 ;;
  *) die "unknown argument: $1 (expected --no-pull or nothing)" ;;
esac

command -v terraform >/dev/null || die "terraform is not installed"
command -v npx >/dev/null || die "npx not found"
command -v gcloud >/dev/null || die "gcloud not found"

[[ -d _infra/.terraform ]] || terraform -chdir=_infra init -input=false >/dev/null
tf() { terraform -chdir=_infra output -raw "$1"; }
PROJECT="$(tf gcp_project_id)"
SITE="$(tf admin_hosting_site_id)"
DEFAULT_URL="$(tf admin_hosting_default_url)"
SITE_URL="$(tf admin_site_url)"
API_URL="$(tf admin_api_url)"
BUNDLE="gs://fps-csarko-downloads/admin/latest"

grep -q "\"site\": \"$SITE\"" firebase.json || die "firebase.json has no hosting entry for site \"$SITE\" (Terraform's admin_hosting_site_id)"

echo "→ project  $PROJECT"
echo "→ site     $SITE"

# The Day Hike bundle, as the game's repo last published it. Pulled before the build,
# since the build fills its page's generated blocks (the nav, the font preload) too.
if (( PULL )); then
  mkdir -p admin/public/game-dayhike
  gcloud storage rsync "$BUNDLE" admin/public/game-dayhike --recursive --delete-unmatched-destination-objects --project "$PROJECT" \
    || die "could not pull $BUNDLE (run \`npm run deploy:admin\` in ~/Projects/game-dayhike first)"
fi
[[ -f admin/public/game-dayhike/index.html ]] || echo "  (no Day Hike bundle in admin/public/game-dayhike; its page will 404 until one is published)"

# The shell's generated blocks (tokens, fonts, nav, the self-hosted Firebase Auth
# bundle), the csarko.sh API URL and the web API key the sign-in uses (public by design).
ADMIN_API_URL="$API_URL" ADMIN_FIREBASE_API_KEY="$(tf admin_web_api_key)" node admin/build.mjs

# Privacy guard, the same as the site's: no email address or phone number.
shopt -s nullglob
SCAN=(admin/public/*.html admin/public/csarko.sh/*.html admin/public/ide-arkos/*.html admin/public/*.js admin/public/csarko.sh/*.js admin/public/ide-arkos/*.js)
shopt -u nullglob
if grep -nEio 'mailto:[^"]*|[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}' "${SCAN[@]}"; then
  die "an admin page contains an email address — refusing to deploy"
fi

# Quality gate: the site's bar minus SEO (AGENTS.md "Admin pages").
.agents/skills/site-quality/scripts/check.py --admin || die "admin checks failed — fix them before deploying"
echo

npx -y firebase-tools deploy --only "hosting:$SITE" --project "$PROJECT" --non-interactive

# Prove it: the shell's pages serve their local files, robots refuses crawlers, and
# every app API still answers 401 to a tokenless request from the admin origin.
serves_local() { # serves_local <base url> <path> <local file>
  local got want
  want="$(shasum -a 256 "$3" | cut -d' ' -f1)"
  got="$(curl -fsSL --compressed -m 20 -H 'Cache-Control: no-cache' "$1$2" | shasum -a 256 | cut -d' ' -f1)" || return 1
  [[ "$got" == "$want" ]]
}
VERIFY=("/|admin/public/index.html" "/csarko.sh/|admin/public/csarko.sh/index.html" "/ide-arkos/|admin/public/ide-arkos/index.html")
[[ -f admin/public/game-dayhike/index.html ]] && VERIFY+=("/game-dayhike/|admin/public/game-dayhike/index.html")
verify() {
  local url="$1" entry path file i
  for entry in "${VERIFY[@]}"; do
    path="${entry%%|*}"; file="${entry#*|}"
    for i in 1 2 3 4 5 6; do
      if serves_local "$url" "$path" "$file"; then echo "✓ $url$path serves $file"; continue 2; fi
      sleep 5
    done
    echo "✗ $url$path does not serve $file (yet)"
    return 1
  done
  curl -fsSL -m 20 "$url/robots.txt" | grep -q '^Disallow: /$' && echo "✓ $url/robots.txt refuses crawlers" || { echo "✗ $url/robots.txt"; return 1; }
  curl -fsSI -m 20 "$url/" | grep -qi '^x-robots-tag: noindex' && echo "✓ $url sends X-Robots-Tag: noindex" || { echo "✗ $url X-Robots-Tag"; return 1; }
}

echo
verify "$DEFAULT_URL" || die "the deploy did not land on $DEFAULT_URL"
verify "$SITE_URL" || echo "  (the custom domain may still be propagating or its certificate may still be issuing — check \`terraform -chdir=_infra output admin_custom_domain_state\`)"

echo
node -e '
const apps = require("./admin/public/apps.json");
(async () => {
  let bad = 0;
  for (const app of apps) {
    const res = await fetch(`${app.api}/admin/kpis`, { headers: { origin: process.argv[1] } }).catch(() => null);
    const ok = res !== null && res.status === 401;
    console.log(`${ok ? "✓" : "✗"} ${app.name}: ${app.api}/admin/kpis answers ${res ? res.status : "nothing"} without a token`);
    if (!ok) bad++;
  }
  process.exit(bad ? 1 : 0);
})();
' "$SITE_URL" || die "an app API is not refusing tokenless requests — check it before using the dashboard"
