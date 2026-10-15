#!/usr/bin/env bash
#
# visits/deploy.sh: build lib-visits at a tag with Cloud Build and deploy the
# image to the csarko-visits Cloud Run service. Terraform owns everything about
# the service but its image; this script owns the image.
#
# Usage:
#   visits/deploy.sh              build and deploy VISITS_TAG from ~/Projects/lib-visits
#   VISITS_TAG=v0.2.0 visits/deploy.sh
#
# The build runs in Cloud Build, not on this machine.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
die() { echo "error: $*" >&2; exit 1; }

VISITS_TAG="${VISITS_TAG:-v0.1.0}"
LIB="${VISITS_LIB:-$HOME/Projects/lib-visits}"

command -v terraform >/dev/null || die "terraform is not installed"
command -v gcloud >/dev/null || die "gcloud not found"
[[ -d "$LIB/.git" ]] || die "no lib-visits checkout at $LIB (set VISITS_LIB)"

[[ -d _infra/.terraform ]] || terraform -chdir=_infra init -input=false >/dev/null
tf() { terraform -chdir=_infra output -raw "$1"; }
PROJECT="$(tf gcp_project_id)"
SERVICE="$(tf visits_service_name)"
URL="$(tf visits_service_url)"
REGION="us-west1"

# The checkout must be exactly the tag, and clean, so the image is the tag.
git -C "$LIB" diff --quiet && git -C "$LIB" diff --cached --quiet || die "$LIB has uncommitted changes"
AT="$(git -C "$LIB" rev-parse HEAD)"
WANT="$(git -C "$LIB" rev-parse "$VISITS_TAG^{commit}" 2>/dev/null)" || die "no tag $VISITS_TAG in $LIB"
[[ "$AT" == "$WANT" ]] || die "$LIB is at $(git -C "$LIB" rev-parse --short HEAD), not $VISITS_TAG; check out the tag first"

echo "→ project  $PROJECT"
echo "→ service  $SERVICE"
echo "→ source   $LIB at $VISITS_TAG"

gcloud run deploy "$SERVICE" --source "$LIB" --region "$REGION" --project "$PROJECT" --quiet

echo "→ checking $URL/healthcheck"
curl -fsS "$URL/healthcheck" >/dev/null && echo "✓ $SERVICE answers /healthcheck"
code="$(curl -s -o /dev/null -w '%{http_code}' -H "Origin: https://csarko.sh" -d '{"v":1,"n":"view","id":"deploy-check","p":"/deploy-check"}' "$URL/v")"
[[ "$code" == "204" ]] && echo "✓ $SERVICE takes a beacon from https://csarko.sh (204)" || die "beacon to $URL/v answered $code"
