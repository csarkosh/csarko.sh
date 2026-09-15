#!/usr/bin/env bash
#
# deploy.sh — publish public/ to Firebase Hosting and prove it is live.
#
# Every identifier (project, site, URLs) is read from Terraform outputs rather
# than written down here, so a deploy can never target a stale project.
#
# Usage:
#   deploy.sh              deploy to the live site, then verify both URLs
#   deploy.sh --preview    deploy to a temporary preview channel (expires in 7d)
#
# Exit status is non-zero if a guard fails (privacy, config, site quality), the deploy
# fails, the site's own web.app URL does not serve the exact home page, docs index and
# newest doc that were just deployed, or the live checks fail afterwards.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
cd "$ROOT"

die() { echo "error: $*" >&2; exit 1; }

MODE="live"
case "${1:-}" in
  "") ;;
  --preview) MODE="preview" ;;
  *) die "unknown argument: $1 (expected --preview or nothing)" ;;
esac

command -v terraform >/dev/null || die "terraform is not installed"
command -v npx >/dev/null || die "npx not found — install Node 20 or later"
[[ -f public/index.html ]] || die "public/index.html is missing"

# Privacy guard. Cyrus does not want his email address or phone number on the
# public site (spam). Links go to LinkedIn, GitHub and Substack instead.
# Docs are scanned too, in their Markdown source and as built pages.
shopt -s nullglob
SCAN=(public/*.html public/docs/*.html content/docs/*.md)
shopt -u nullglob
if grep -nEio 'mailto:[^"]*|[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}' "${SCAN[@]}"; then
  die "the site or a doc contains an email address — refusing to deploy"
fi
if grep -nEo '\+1[ .-]?[0-9]{3}[ .-]?[0-9]{3}[ .-]?[0-9]{4}|\(?[0-9]{3}\)?[ .-][0-9]{3}-[0-9]{4}' "${SCAN[@]}"; then
  die "the site or a doc contains what looks like a phone number — refusing to deploy"
fi

# Quality gate: SEO, performance budgets, accessibility, security headers, the
# 404 page and phone layout. See .agents/skills/site-quality/SKILL.md.
.agents/skills/site-quality/scripts/check.py || die "site checks failed — fix them (see the site-quality skill) before deploying"
echo

[[ -d _infra/.terraform ]] || terraform -chdir=_infra init -input=false >/dev/null
tf() { terraform -chdir=_infra output -raw "$1"; }
PROJECT="$(tf gcp_project_id)"
SITE="$(tf hosting_site_id)"
DEFAULT_URL="$(tf hosting_default_url)"
SITE_URL="$(tf site_url)"

grep -q "\"site\": \"$SITE\"" firebase.json || die "firebase.json hosting.site is not \"$SITE\" (Terraform's hosting_site_id)"
grep -q "\"default\": \"$PROJECT\"" .firebaserc || die ".firebaserc default is not \"$PROJECT\" (Terraform's gcp_project_id)"

echo "→ project  $PROJECT"
echo "→ site     $SITE"

if [[ "$MODE" == "preview" ]]; then
  npx -y firebase-tools hosting:channel:deploy preview --expires 7d --project "$PROJECT" --non-interactive
  echo
  echo "✓ preview channel deployed (the URL is printed above; it expires in 7 days)"
  exit 0
fi

npx -y firebase-tools deploy --only hosting --project "$PROJECT" --non-interactive

# Pages to prove live: the home page, the docs index and the newest doc, each against its local file.
NEWEST="$(.agents/skills/site-quality/scripts/check.py --newest-doc)"
VERIFY=("/|public/index.html")
[[ -f public/docs/index.html ]] && VERIFY+=("/docs|public/docs/index.html")
[[ -n "$NEWEST" ]] && VERIFY+=("/${NEWEST%.html}|public/$NEWEST")

serves_local() { # serves_local <base url> <path> <local file>
  local got want
  want="$(shasum -a 256 "$3" | cut -d' ' -f1)"
  got="$(curl -fsSL --compressed -m 20 -H 'Cache-Control: no-cache' "$1$2" | shasum -a 256 | cut -d' ' -f1)" || return 1
  [[ "$got" == "$want" ]]
}

verify() { # verify <base url>: every page in VERIFY serves its local file
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
}

echo
verify "$DEFAULT_URL" || die "the deploy did not land on $DEFAULT_URL"
verify "$SITE_URL" || echo "  (the custom domain may still be propagating or its certificate may still be issuing — check \`terraform -chdir=_infra output hosting_custom_domain_state\`)"

echo
.agents/skills/site-quality/scripts/check.py --live "$SITE_URL" || die "the deploy landed, but live checks failed — see above"
