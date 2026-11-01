### Task 2: `visits/deploy.sh`

**Files:**
- Create: `visits/deploy.sh`, `visits/README.md`

**Interfaces:**
- Consumes: Terraform outputs `gcp_project_id`, `visits_service_name`, `visits_service_url`.
- Produces: the deployed image on `csarko-visits`, built by Cloud Build from the lib-visits checkout at `VISITS_TAG`.

- [ ] **Step 1: Write the script**

```bash
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
```

`visits/README.md`:
```markdown
# visits/

csarko.sh's deployment of [lib-visits](https://github.com/csarkosh/lib-visits): the
collector behind `https://csarko.sh/v`. Terraform (`_infra/modules/gcp-visits`) owns the
service, its secret, the log bucket and the datasets; `deploy.sh` owns the image, built by
Cloud Build from the library checkout at `VISITS_TAG`; `backfill.mjs` loaded GoatCounter's
history once. The site's tags and CSP come from `site.json` (`provider: visits`), and the
dashboard reads the `csarko_visits` and `csarko_history` datasets.

Proxy depth: the service runs with `--trusted-proxies <n>` from Terraform; `<n>` was
confirmed with `--log-ip` on first deploy (see the "As built" note in the wiring spec).
```

- [ ] **Step 2: Make it executable and dry-run its guards**

Run: `chmod +x visits/deploy.sh && VISITS_TAG=v9.9.9 visits/deploy.sh; echo "exit $?"`
Expected: `error: no tag v9.9.9 in /Users/csarko/Projects/lib-visits` (after Terraform's outputs exist, Task 3; before that it dies on the missing output, which is also fine for this check).

- [ ] **Step 3: Commit**

```bash
git add visits/deploy.sh visits/README.md
git commit -m "visits: the collector's deploy script

Builds lib-visits at a tag in Cloud Build and deploys the image to
csarko-visits; refuses a dirty or wrong checkout; checks the health
route and one beacon."
```

---

