# csarko.sh on lib-visits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move csarko.sh's analytics from GoatCounter to lib-visits: a Cloud Run collector behind a Hosting rewrite of `/v`, rows in BigQuery through Log Analytics, the site loading `visits.min.js` and `vitals.min.js`, and the admin dashboard reading BigQuery, with GoatCounter's history backfilled.

**Architecture:** Terraform adds a `gcp-visits` module (service, secret, log bucket, sink, linked dataset, history dataset, reader grants). The site generator derives the tags and the CSP from `site.json` as it does now, with a `visits` provider. The admin API gains a BigQuery-backed `collectors/visits.mjs` running saved SQL under `admin/api/queries/`, and the five GoatCounter queries, `kpis`, `snapshot` and `health` read it; history from GoatCounter lives in a plain dataset and is merged in code. The cutover is one ordered deploy.

**Tech Stack:** Terraform (google, google-beta), Firebase Hosting rewrites, Python (`build_assets.py`, `check.py`), Node 22 (`docs_lib.mjs`, the admin API with `@google-cloud/bigquery`), BigQuery SQL over a Log Analytics `_AllLogs` view, `bq` CLI for the backfill.

**Spec:** `docs/superpowers/specs/2026-10-15-visits-wiring-design.md` (the library's own spec and wire format: `~/Projects/lib-visits/docs/superpowers/specs/2026-10-15-lib-visits-design.md`, `~/Projects/lib-visits/spec/SPEC.md`; the library is at tag `v0.1.0`).

## Global Constraints

- Everything here lives in csarko.sh; `lib-visits` is consumed by tag `v0.1.0` and never edited from here. The vendored client files are the tag's `client/dist/visits.min.js` (3,068 B) and `vitals.min.js` (995 B).
- `site.json` is the one source: `build_assets.py` derives the tags and the CSP from it, `check.py` derives its allowlist from it. Never hand-edit a `generated:` block or the CSP line in `firebase.json`.
- Page copy rules: no em-dashes anywhere (docs, comments, SQL, commit messages); no email address or phone number in `public/` or `docs/` (deploy.sh refuses).
- Site quality: Lighthouse 100/100/100 and Performance ≥ 95; the script budget is `BUDGET_SCRIPTS = 10_000` bytes a page (`check.py:58`), and the two scripts total 4,063 B; every `<script src>` carries `defer` or `async`; `data-read-end` appears exactly once on a doc page.
- Event names are stable identifiers: `out-linkedin`, `out-github`, `out-substack`, `out-youtube`, `nav-film`, `nav-games`, `nav-research`, `play-<slug>`, `watch-<slug>`, and the synthesised `read-<slug>`.
- Terraform owns every resource's shape; deploy scripts own only images. The GCP project is `csarko-sh`, region `us-west1`, Firebase Hosting site `csarko-sh`; the admin API service is `csarko-admin` with service account `csarko-admin@csarko-sh.iam.gserviceaccount.com`; Firestore and Secret Manager are already enabled.
- The admin API answers `UpstreamError` as 502 and everything else as 500; every part failure is `errors: { part: message }`, every missing credential `notConfigured: { part: ENV }`; the hint key for visits is `visits` with env `VISITS_DATASET`.
- Admin pages: no third-party script; `check.py --admin` and `admin/deploy.sh` must pass.
- The machine is small: no full test suites in the background; targeted runs only; `nice` on anything that compiles or screenshots.

## Review Focus

1. A `view` whose `s.visit` is absent (no address resolved) must still count as one visit by its `id`, never be dropped: pinned in Task 8's collector test.
2. A query window that reaches before the cutover must add GoatCounter's history without double counting the overlap hour: pinned in Task 8 (`history` merge test with an overlapping day).
3. `check.py` must fail a page whose analytics tag points at a hash other than the vendored file's, and pass the 404 page, which carries the core tag but no vitals tag is still fine: pinned in Task 5.
4. The Hosting rewrite must not shadow a real file or the research redirects: `/v` with `cleanUrls` and the `/docs` redirects; pinned in Task 7 by a `firebase.json` test and in Task 13 by the live check.
5. `referrers` rows must still classify into the seven groups when the referrer is a bare host (no scheme): pinned in Task 9.

---

### Task 1: Terraform module `gcp-visits`

**Files:**
- Create: `_infra/modules/gcp-visits/main.tf`, `_infra/modules/gcp-visits/variables.tf`, `_infra/modules/gcp-visits/outputs.tf`
- Modify: `_infra/main.tf` (after `module "gcp_admin_api"`, lines 131-157), `_infra/outputs.tf` (append)

**Interfaces:**
- Consumes: `module.gcp_admin_api.service_account_email` (exists: `outputs.tf` of that module).
- Produces: outputs `visits_service_name` (`csarko-visits`), `visits_service_url`, `visits_dataset` (`csarko_visits`), `visits_history_dataset` (`csarko_history`), `visits_secret_id` (`visits-secret`); env on `csarko-admin` is Task 9's.

- [ ] **Step 1: Write `variables.tf`**

```hcl
variable "project_id" { type = string }
variable "region" { type = string }

variable "image" {
  description = "The collector's image. The deploy script owns it after the first apply; this default only lets the service exist."
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "origins" {
  description = "The sites allowed to post beacons, as origins."
  type        = list(string)
}

variable "trusted_proxies" {
  description = "How many proxies sit in front of the service (Firebase Hosting's rewrite plus Cloud Run's frontend). Confirmed once with --log-ip; see the deploy notes."
  type        = number
  default     = 1
}

variable "retention_days" {
  description = "How long the rows stay in the log bucket. Two years, so a year reads against the one before."
  type        = number
  default     = 730
}

variable "reader_service_account_email" {
  description = "The admin API's service account, which reads the datasets."
  type        = string
}
```

- [ ] **Step 2: Write `main.tf`**

```hcl
# The lib-visits collector for csarko.sh: one Cloud Run service behind a
# Hosting rewrite of /v, its rows into a Log Analytics bucket read as BigQuery,
# and a plain dataset beside it for GoatCounter's history.

terraform {
  required_providers {
    google      = { source = "hashicorp/google" }
    google-beta = { source = "hashicorp/google-beta" }
  }
}

resource "google_project_service" "apis" {
  for_each           = toset(["run.googleapis.com", "logging.googleapis.com", "bigquery.googleapis.com", "secretmanager.googleapis.com", "artifactregistry.googleapis.com", "cloudbuild.googleapis.com"])
  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

# ---- the service ----------------------------------------------------------------

resource "google_service_account" "visits" {
  project      = var.project_id
  account_id   = "csarko-visits"
  display_name = "csarko.sh visits collector"
}

# The hash secret: created empty here, its one version added by hand
# (`gcloud secrets versions add visits-secret --data-file=-`), as the admin
# API's secrets are. Cloud Run refuses a revision whose secret has no version.
resource "google_secret_manager_secret" "visits" {
  project   = var.project_id
  secret_id = "visits-secret"
  replication {
    auto {}
  }
  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_iam_member" "visits_reads" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.visits.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.visits.email}"
}

resource "google_cloud_run_v2_service" "visits" {
  project             = var.project_id
  location            = var.region
  name                = "csarko-visits"
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = false

  template {
    service_account = google_service_account.visits.email
    timeout         = "10s"
    max_instance_request_concurrency = 200
    scaling {
      min_instance_count = 0
      max_instance_count = 3
    }
    containers {
      image = var.image
      args  = ["serve", "--trusted-proxies", tostring(var.trusted_proxies)]
      ports {
        container_port = 8080
      }
      resources {
        cpu_idle = true
        limits = {
          cpu    = "1"
          memory = "128Mi"
        }
      }
      env {
        name  = "VISITS_ORIGINS"
        value = join(",", var.origins)
      }
      env {
        name  = "VISITS_SINK"
        value = "stdout"
      }
      env {
        name = "VISITS_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.visits.secret_id
            version = "latest"
          }
        }
      }
      startup_probe {
        http_get {
          path = "/healthcheck"
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
      client,
      client_version,
    ]
  }

  depends_on = [google_project_service.apis, google_secret_manager_secret_iam_member.visits_reads]
}

resource "google_cloud_run_v2_service_iam_member" "public" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.visits.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# ---- where the rows live ---------------------------------------------------------

# Its own bucket: Log Analytics, once on, cannot be turned off, and the rows'
# retention is their own. Every line the collector writes carries `v: 1`.
resource "google_logging_project_bucket_config" "visits" {
  project          = var.project_id
  location         = "global"
  bucket_id        = "csarko-visits"
  retention_days   = var.retention_days
  enable_analytics = true
  description      = "csarko.sh visits: one row an event from the lib-visits collector."
}

resource "google_logging_project_sink" "visits" {
  project     = var.project_id
  name        = "csarko-visits"
  destination = "logging.googleapis.com/projects/${var.project_id}/locations/global/buckets/${google_logging_project_bucket_config.visits.bucket_id}"
  filter      = "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${google_cloud_run_v2_service.visits.name}\" AND jsonPayload.v=1"
}

# The rows need not also sit in _Default, and the service's successful request
# entries say nothing a row does not.
resource "google_logging_project_exclusion" "visits_duplicates" {
  project     = var.project_id
  name        = "csarko-visits-duplicates"
  description = "Visits rows live in their own bucket; successful beacon requests are counted there."
  filter      = <<-EOT
    resource.type="cloud_run_revision" AND resource.labels.service_name="${google_cloud_run_v2_service.visits.name}" AND (
      jsonPayload.v=1 OR (
        logName="projects/${var.project_id}/logs/run.googleapis.com%2Frequests"
        AND httpRequest.status<400
      )
    )
  EOT
}

resource "google_logging_linked_dataset" "visits" {
  parent      = "projects/${var.project_id}"
  location    = "global"
  link_id     = "csarko_visits"
  bucket      = google_logging_project_bucket_config.visits.id
  description = "csarko.sh visits, as a dataset."
}

# GoatCounter's history: a linked dataset is read-only, so the backfill goes
# into a plain dataset beside it. One table, hourly counts per path and referrer.
resource "google_bigquery_dataset" "history" {
  project     = var.project_id
  dataset_id  = "csarko_history"
  location    = "US"
  description = "Analytics history from before lib-visits: GoatCounter's hourly counts."
  depends_on  = [google_project_service.apis]
}

resource "google_bigquery_table" "goatcounter_history" {
  project             = var.project_id
  dataset_id          = google_bigquery_dataset.history.dataset_id
  table_id            = "goatcounter_history"
  deletion_protection = false
  schema = jsonencode([
    { name = "hour", type = "TIMESTAMP", mode = "REQUIRED" },
    { name = "path", type = "STRING", mode = "REQUIRED" },
    { name = "title", type = "STRING", mode = "NULLABLE" },
    { name = "event", type = "BOOL", mode = "REQUIRED" },
    { name = "ref", type = "STRING", mode = "NULLABLE" },
    { name = "visits", type = "INT64", mode = "REQUIRED" },
  ])
}

# ---- the reader ------------------------------------------------------------------

resource "google_project_iam_member" "reader" {
  for_each = toset(["roles/bigquery.jobUser", "roles/logging.viewAccessor"])
  project  = var.project_id
  role     = each.value
  member   = "serviceAccount:${var.reader_service_account_email}"
}

resource "google_bigquery_dataset_iam_member" "reader_visits" {
  project    = var.project_id
  dataset_id = google_logging_linked_dataset.visits.link_id
  role       = "roles/bigquery.dataViewer"
  member     = "serviceAccount:${var.reader_service_account_email}"
}

resource "google_bigquery_dataset_iam_member" "reader_history" {
  project    = var.project_id
  dataset_id = google_bigquery_dataset.history.dataset_id
  role       = "roles/bigquery.dataViewer"
  member     = "serviceAccount:${var.reader_service_account_email}"
}
```

- [ ] **Step 3: Write `outputs.tf`**

```hcl
output "service_name" { value = google_cloud_run_v2_service.visits.name }
output "service_url" { value = google_cloud_run_v2_service.visits.uri }
output "service_account_email" { value = google_service_account.visits.email }
output "secret_id" { value = google_secret_manager_secret.visits.secret_id }
output "dataset" { value = google_logging_linked_dataset.visits.link_id }
output "history_dataset" { value = google_bigquery_dataset.history.dataset_id }
output "history_table" { value = google_bigquery_table.goatcounter_history.table_id }
```

- [ ] **Step 4: Wire the root**

Append to `_infra/main.tf` after the `gcp_admin_api` module block:
```hcl
module "gcp_visits" {
  source = "./modules/gcp-visits"

  project_id                   = var.gcp_project_id
  region                       = var.gcp_region
  origins                      = ["https://${var.domain_name}"]
  reader_service_account_email = module.gcp_admin_api.service_account_email

  providers = {
    google      = google
    google-beta = google-beta
  }
}
```
Append to `_infra/outputs.tf`:
```hcl
output "visits_service_name" { value = module.gcp_visits.service_name }
output "visits_service_url" { value = module.gcp_visits.service_url }
output "visits_secret_id" { value = module.gcp_visits.secret_id }
output "visits_dataset" { value = module.gcp_visits.dataset }
output "visits_history_dataset" { value = module.gcp_visits.history_dataset }
```

- [ ] **Step 5: Validate and plan**

Run: `terraform -chdir=_infra init -input=false >/dev/null && terraform -chdir=_infra validate && terraform -chdir=_infra plan -input=false 2>&1 | grep -E "Plan:|Error" `
Expected: `Plan: 14 to add, 0 to change, 0 to destroy.` (apis ×6, SA, secret, secret IAM, service, invoker, bucket, sink, exclusion, linked dataset, dataset, table, reader ×2, dataset IAM ×2 = more than 14; read the number the plan prints and confirm every added resource is in this module and nothing is changed or destroyed outside it).

- [ ] **Step 6: Commit**

```bash
git add _infra/modules/gcp-visits _infra/main.tf _infra/outputs.tf
git commit -m "infra: the csarko-visits collector, its bucket, datasets and reader grants

A gcp-visits module in the shape of the game's telemetry one: Cloud Run
behind a Hosting rewrite, rows into a Log Analytics bucket linked as
BigQuery, a plain dataset for GoatCounter's history, and the admin
API's account as the reader."
```

---

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

### Task 3: Apply, the secret, the first deploy, the proxy depth

**Files:**
- Modify: `docs/superpowers/specs/2026-10-15-visits-wiring-design.md` (an "As built" line with the proxy depth), `_infra/main.tf` (only if the depth differs from 1)

This task runs commands against the project; each step's output is read before the next.

- [ ] **Step 1: Create the secret and the service**

```bash
terraform -chdir=_infra apply -input=false -target=module.gcp_visits.google_secret_manager_secret.visits -auto-approve
openssl rand -hex 32 | gcloud secrets versions add visits-secret --project csarko-sh --data-file=-
terraform -chdir=_infra apply -input=false
terraform -chdir=_infra apply -refresh-only -input=false -auto-approve   # targeted applies do not write root outputs
terraform -chdir=_infra output visits_service_url
```
Expected: the full apply adds everything else; the URL prints.

- [ ] **Step 2: Deploy the image**

Run: `cd ~/Projects/lib-visits && git checkout -q v0.1.0 && cd ~/Projects/csarko.sh && visits/deploy.sh`
Expected: the two ✓ lines. (Return lib-visits to `main` afterwards: `git -C ~/Projects/lib-visits checkout -q main`.)

- [ ] **Step 3: Confirm the proxy depth once**

The beacon from the browser goes through Hosting's rewrite only after Task 13; before that, confirm the depth against the `run.app` URL, where one proxy (Cloud Run's frontend) sits in front:

```bash
URL="$(terraform -chdir=_infra output -raw visits_service_url)"
gcloud run services update csarko-visits --region us-west1 --project csarko-sh --args="serve,--trusted-proxies,1,--log-ip" --quiet
curl -s -o /dev/null -H "Origin: https://csarko.sh" -d '{"v":1,"n":"view","id":"depth-check","p":"/depth-check"}' "$URL/v"
gcloud logging read 'resource.labels.service_name="csarko-visits" AND textPayload:"visits: request from"' --project csarko-sh --freshness=5m --limit 1 --format='value(textPayload)'
curl -s https://api.ipify.org; echo
gcloud run services update csarko-visits --region us-west1 --project csarko-sh --args="serve,--trusted-proxies,1" --quiet
```
Expected: the logged address equals this machine's public address. If it reads an internal address, the depth is wrong: set `trusted_proxies` in `_infra/main.tf`'s module call to the value that makes them match, `terraform apply`, and repeat. After Task 13, repeat the check once through `https://csarko.sh/v` (Hosting adds a hop); the final value goes into the spec's "As built" line and Terraform.

Note: `gcloud run services update --args` makes a revision Terraform will see as drift on `args`; the final `terraform apply` in this step restores the Terraform-owned args, so run it last.

- [ ] **Step 4: Record and commit**

Append to the wiring spec: `## As built\n\n- 2026-10-xx: `--trusted-proxies` is N behind Hosting (confirmed with `--log-ip`).`

```bash
git add docs/superpowers/specs/2026-10-15-visits-wiring-design.md _infra/main.tf
git commit -m "infra: csarko-visits is live; the proxy depth is recorded"
```

---

### Task 4: The site generator: `site.json`, the vendored scripts, `build_assets.py`

**Files:**
- Modify: `.agents/skills/site-quality/site.json`, `.agents/skills/site-quality/scripts/build_assets.py:9-28,79-83,254-279`
- Create: `.agents/skills/site-quality/assets/vendor/visits.min.js`, `.agents/skills/site-quality/assets/vendor/vitals.min.js`
- Delete: `.agents/skills/site-quality/assets/vendor/goatcounter-count.js`, `.agents/skills/site-quality/assets/engage.js`

**Interfaces:**
- Produces: `site.json` `{ "analytics": { "provider": "visits", "endpoint": "/v" } }`; the generated analytics block on every page:
  ```html
  <script defer src="{prefix}assets/visits.<hash>.js" data-visits="/v"></script>
  <script defer src="{prefix}assets/vitals.<hash>.js"></script>
  ```
  (`defer` keeps the order, so vitals finds `window.visits`); CSP `script-src 'self'; connect-src 'self'; img-src 'self'`.

- [ ] **Step 1: Vendor the two files with a provenance line**

```bash
LIB=~/Projects/lib-visits; git -C "$LIB" checkout -q v0.1.0
for f in visits vitals; do
  { printf '// lib-visits v0.1.0 (GPL-3.0-only), client/dist/%s.min.js, sha256 %s\n' "$f" "$(shasum -a 256 "$LIB/client/dist/$f.min.js" | cut -c1-64)"; cat "$LIB/client/dist/$f.min.js"; echo; } > .agents/skills/site-quality/assets/vendor/$f.min.js
done
git -C "$LIB" checkout -q main
git rm -q .agents/skills/site-quality/assets/vendor/goatcounter-count.js .agents/skills/site-quality/assets/engage.js
```
`strip_comments` (`build_assets.py:114`) drops the `//` line before hashing, so the served file is byte-identical to the tag's.

- [ ] **Step 2: `site.json`**

```json
{
  "analytics": {
    "provider": "visits",
    "endpoint": "/v"
  }
}
```

- [ ] **Step 3: `build_assets.py`**

Replace lines 79-83 (`analytics_origin`) with:
```python
def analytics():
    """The analytics config, or None when `provider` is null: `{"endpoint": "/v"}` for lib-visits."""
    a = CONFIG.get("analytics") or {}
    if a.get("provider") == "visits" and a.get("endpoint"):
        return {"endpoint": a["endpoint"]}
    return None
```
Replace lines 254-270 (the analytics block, from the `# ---- analytics` comment through the `analytics(prefix, slug)` function) with:
```python
    # ---- analytics: lib-visits, self-hosted, the beacon to the same origin (/v is a Hosting
    # rewrite to the collector), so the page makes no third-party request. The vendored
    # copies carry a provenance line that strip_comments drops before hashing, so the served
    # bytes are the tag's.
    conf = analytics()
    core = vitals = None
    if conf:
        core = write_hashed("visits", "js", strip_comments((SRC / "vendor/visits.min.js").read_bytes()), keep)
        vitals = write_hashed("vitals", "js", strip_comments((SRC / "vendor/vitals.min.js").read_bytes()), keep)

    def analytics_block(prefix, slug):
        if not core:
            return ""
        return (
            f'\n  <script defer src="{prefix}assets/{core}" data-visits="{conf["endpoint"]}"></script>'
            f'\n  <script defer src="{prefix}assets/{vitals}"></script>\n  '
        )
```
Replace lines 273-279 (the CSP directives) with:
```python
    directives = {k: list(v) for k, v in CSP}
    if conf:
        directives["script-src"].append("'self'")
    csp = "; ".join(k if not v else f"{k} {' '.join(v)}" for k, v in directives.items())
```
(keep whatever the current join expression is if it differs; only the `if origin:` block changes). In the blocks dict (line ~312) rename the call to `analytics_block(prefix, slug)`. Update the docstring lines 9, 15 and 28 to name `vendor/visits.min.js` and `vendor/vitals.min.js` and drop `engage.js`.

- [ ] **Step 4: Generate and look**

Run: `nice -n 10 .agents/skills/site-quality/scripts/generate-assets.sh 2>&1 | tail -3 && grep -n "visits\.\|vitals\.\|goatcounter" public/index.html public/404.html | head && grep -o 'script-src[^;]*; connect-src[^;]*; img-src[^;]*' firebase.json`
Expected: two tags per page with hashes, no `goatcounter` anywhere in `public/*.html`, and `script-src 'self'; connect-src 'self'; img-src 'self'`. (`check.py` will fail until Task 5 rewrites its analytics checks; that is expected here. The research pages still carry `data-goatcounter-click` until Task 6.)

- [ ] **Step 5: Commit**

```bash
git add .agents/skills/site-quality/site.json .agents/skills/site-quality/scripts/build_assets.py .agents/skills/site-quality/assets/vendor public/assets public/*.html public/research public/games public/film firebase.json
git commit -m "site: lib-visits replaces count.js and engage.js

site.json names the provider and the endpoint; build_assets vendors
the tag's two scripts, writes their tags on every page and derives a
CSP with no third-party origin."
```

---

### Task 5: `check.py`'s analytics checks

**Files:**
- Modify: `.agents/skills/site-quality/scripts/check.py:40-51` (config and `THIRD_PARTY`), `:955-1001` (`analytics_checks`), `:994-996`

**Interfaces:**
- Consumes: `site.json` as above; `strip_comments` at `check.py:949`.

- [ ] **Step 1: Config and allowlist**

Replace lines 40-51 so that `ANALYTICS` is the config (`{"endpoint": "/v"}` or `None`) and `THIRD_PARTY = {"script-src": [], "connect-src": [], "img-src": []}` (no origins: the beacon is same-origin). Keep the variable names the rest of the file reads (`THIRD_PARTY`, used at 494-497 and 660-662).

- [ ] **Step 2: Rewrite `analytics_checks(pages)`**

```python
def analytics_checks(pages):
    """Every page carries the two lib-visits tags, with the vendored files' hashes, and nothing else."""
    if not ANALYTICS:
        for page in pages:
            check("data-visits" not in page.html, f"{page.name}: analytics is off but a visits tag is present")
        return
    def want(stem):
        data = strip_comments((SKILL / f"assets/vendor/{stem}.min.js").read_bytes())
        return f"{stem}.{hashlib.sha256(data).hexdigest()[:8]}.js"
    want_core, want_vitals = want("visits"), want("vitals")
    for page in pages:
        prefix = "" if page.path.name == "index.html" and page.path.parent == PUBLIC else "/"
        scripts = re.findall(r"<script\b([^>]*)>", page.html)
        core = [s for s in scripts if "data-visits=" in s]
        check(len(core) == 1, f"{page.name}: one visits tag expected, found {len(core)}")
        if core:
            check(f'data-visits="{ANALYTICS["endpoint"]}"' in core[0], f"{page.name}: the visits tag's endpoint is not {ANALYTICS['endpoint']}")
            check(f'src="{prefix}assets/{want_core}"' in core[0], f"{page.name}: the visits tag's hash is not the vendored file's ({want_core}): stale build")
            check(" defer" in core[0], f"{page.name}: the visits tag is not deferred")
        vitals = [s for s in scripts if f"assets/{want_vitals}" in s]
        check(len(vitals) == 1, f"{page.name}: one vitals tag expected, found {len(vitals)}")
        if vitals:
            check(" defer" in vitals[0], f"{page.name}: the vitals tag is not deferred")
        others = [s for s in scripts if "data-visits=" not in s and f"assets/{want_vitals}" not in s]
        check(not others, f"{page.name}: scripts besides the two visits tags: {others}")
        if page.path.parent == PUBLIC / "research" and page.path.name != "index.html":
            check(page.html.count(" data-read-end") == 1, f"{page.name}: one data-read-end marker expected")
    csp = csp_from_config()
    check(csp.get("script-src") == ["'self'"], "script-src is not exactly 'self'")
    check(csp.get("connect-src") == ["'self'"], "connect-src is not exactly 'self'")
    check(csp.get("img-src") == ["'self'"], "img-src is not exactly 'self'")
```
Adapt the names `page.html`, `page.name`, `page.path`, `PUBLIC`, `SKILL`, `check`, `csp_from_config`, `hashlib`, `re` to what the file already uses (read the surrounding functions); the logic above is the contract.

- [ ] **Step 3: Run the checks**

Run: `nice -n 10 python3 .agents/skills/site-quality/scripts/check.py 2>&1 | tail -5`
Expected: `✓ site checks passed` (plus the known title-length warnings). Then prove it fails on a stale hash: `sed -i '' 's/assets\/visits\./assets\/visits.x/' public/404.html && python3 .agents/skills/site-quality/scripts/check.py 2>&1 | grep -c "stale build"; git checkout public/404.html`
Expected: `1`.

- [ ] **Step 4: Commit**

```bash
git add .agents/skills/site-quality/scripts/check.py
git commit -m "site-quality: the checks know lib-visits

The allowlist has no third-party origin; every page carries the two
tags with the vendored hashes, deferred, and nothing else; the CSP is
'self' on every script, connect and img directive."
```

---

### Task 6: The event attributes and the regenerated pages

**Files:**
- Modify: `public/index.html` (12 occurrences, lines 342-344, 359, 363, 367, 371, 407, 498-501), `.agents/skills/site-quality/scripts/docs_lib.mjs:757-768,927,1006`, `.agents/skills/site-quality/tests/docs_lib.test.mjs:427,428,434,591`

- [ ] **Step 1: Rename the attribute everywhere**

```bash
sed -i '' 's/data-goatcounter-click=/data-visits-event=/g' public/index.html .agents/skills/site-quality/scripts/docs_lib.mjs .agents/skills/site-quality/tests/docs_lib.test.mjs
grep -rn "goatcounter" public/index.html .agents/skills/site-quality/scripts/docs_lib.mjs .agents/skills/site-quality/tests/docs_lib.test.mjs
```
Expected: the grep prints only the comment at `docs_lib.mjs:757`; rewrite that comment to say `data-visits-event` and that lib-visits binds it.

- [ ] **Step 2: Tests, regenerate, check**

Run: `cd .agents/skills/site-quality && nice -n 10 node --test tests/ 2>&1 | grep -E "^# (pass|fail)"; cd ../../.. && nice -n 10 .agents/skills/site-quality/scripts/generate-assets.sh >/dev/null && nice -n 10 python3 .agents/skills/site-quality/scripts/check.py 2>&1 | tail -1 && grep -rc "data-goatcounter" public | grep -v ":0" | head`
Expected: tests pass, checks pass, no page carries `data-goatcounter`.

- [ ] **Step 3: Commit**

```bash
git add public .agents/skills/site-quality/scripts/docs_lib.mjs .agents/skills/site-quality/tests/docs_lib.test.mjs
git commit -m "site: the tracked clicks carry data-visits-event

The names are unchanged: out-linkedin, nav-film, play-<slug>,
watch-<slug>. The read-<slug> event is the leave beacon's reached-the-end
fact now, synthesised by the dashboard's query."
```

---

### Task 7: The Hosting rewrite and the AGENTS.md section

**Files:**
- Modify: `firebase.json` (the `csarko-sh` entry: add `rewrites` between `redirects` and `headers`), `AGENTS.md` (the "Analytics" section and the "Where to look" table's GoatCounter rows)
- Create: `.agents/skills/site-quality/tests/firebase.test.mjs`

- [ ] **Step 1: The test first**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const fb = JSON.parse(readFileSync(new URL("../../../../firebase.json", import.meta.url), "utf8"));
const site = fb.hosting.find((h) => h.public === "public");

test("the site rewrites /v to the visits collector and nothing else", () => {
  assert.deepEqual(site.rewrites, [{ source: "/v", run: { serviceId: "csarko-visits", region: "us-west1" } }]);
});

test("the research redirects and clean URLs are untouched", () => {
  assert.equal(site.cleanUrls, true);
  assert.ok(site.redirects.some((r) => r.source === "/docs/:slug*" && r.destination === "/research/:slug" && r.type === 301));
});

test("no public file would shadow the beacon path", () => {
  for (const name of ["v", "v.html", "v/index.html"]) {
    assert.throws(() => readFileSync(new URL(`../../../../public/${name}`, import.meta.url)), `public/${name} exists`);
  }
});
```

Run: `cd .agents/skills/site-quality && node --test tests/firebase.test.mjs 2>&1 | grep -E "^# (pass|fail)"`
Expected: `# fail 1` (no rewrites yet).

- [ ] **Step 2: Add the rewrite**

In `firebase.json`, inside the `csarko-sh` hosting entry, after `"redirects": [...]`:
```json
    "rewrites": [
      { "source": "/v", "run": { "serviceId": "csarko-visits", "region": "us-west1" } }
    ],
```

- [ ] **Step 3: AGENTS.md**

Rewrite the "Analytics: how GoatCounter is wired in" section as "Analytics: how lib-visits is wired in": the provider and endpoint in `site.json`; the two vendored scripts from tag `v0.1.0` and how to bump them (Task 4 step 1's command); the beacon's same-origin `/v` rewrite to Cloud Run `csarko-visits` (Terraform `gcp-visits`, image by `visits/deploy.sh`); rows in `csarko_visits` (BigQuery, via Log Analytics) and GoatCounter's history in `csarko_history`; the events list unchanged but `read-<slug>` now derived from `leave.re`; no cookies, the only storage the visitor's `#visits-off`; set `provider` to `null` to turn it all off. In "Where to look", the GoatCounter row becomes the admin dashboard (`https://admin.csarko.sh/csarko.sh/`) with BigQuery behind it, and the "Search Console is connected to agents; GoatCounter is not" paragraph becomes: BigQuery is readable from the command line with `bq query --project_id=csarko-sh` over `csarko_visits._AllLogs` (the SQL in `admin/api/queries/`). Record the date: *(moved from GoatCounter 2026-10-xx after its 2026-10-15 outage)*.

- [ ] **Step 4: Run the tests and the checks, commit**

Run: `cd .agents/skills/site-quality && node --test tests/ 2>&1 | grep -E "^# (pass|fail)"; cd ../../.. && python3 .agents/skills/site-quality/scripts/check.py 2>&1 | tail -1`
Expected: pass, pass.

```bash
git add firebase.json AGENTS.md .agents/skills/site-quality/tests/firebase.test.mjs
git commit -m "hosting: /v rewrites to the visits collector

Same-origin beacons: no CORS, no preflight, no third-party origin in
the CSP. AGENTS.md says how analytics is wired now."
```

---

### Task 8: The admin API's BigQuery collector and the saved SQL

**Files:**
- Create: `admin/api/src/collectors/visits.mjs`, `admin/api/queries/visits.sql`, `admin/api/queries/pages.sql`, `admin/api/queries/referrers.sql`, `admin/api/queries/events.sql`, `admin/api/queries/audience.sql`, `admin/api/queries/history-visits.sql`, `admin/api/queries/history-pages.sql`, `admin/api/queries/history-referrers.sql`, `admin/api/queries/history-events.sql`, `admin/api/test/visits.test.mjs`, `admin/api/test/fixtures/visits-rows.json`
- Modify: `admin/api/package.json` (add `"@google-cloud/bigquery": "9.2.0"`), `admin/api/Dockerfile` (add `COPY queries ./queries` after `COPY src ./src`)

**Interfaces:**
- Produces: `createVisits({ bigquery, projectId, dataset, historyDataset, historyUntil, cache, now, log, queriesDir })` returning `{ configured, visits(range), pages(range), referrers(range), events(range), audience(range) }` where `range` is `hourlyRange`'s object (`start`, `end`, `prevStart`, `prevEnd` hour stamps). Shapes:
  - `visits(range)` → `{ current: { visits, perDay: [{ day, visits }] }, previous: { visits, perDay } }`
  - `pages(range)` → `[{ path, title, visitors, engagedMedian, reached }]` (reached a 0 to 1 share or null)
  - `referrers(range)` → `{ referrers: [{ name, visitors }] (name "" for direct), campaigns: [{ campaign, visitors }], paths: [{ from, to, visitors }] }`
  - `events(range)` → `{ rows: [{ name, visitors }], homeVisitors }` (current window only; callers pass a previous-window range for deltas)
  - `audience(range)` → `{ countries, sizes, browsers, systems, languages, themes, viewports, touch, timezones }`, each `[{ name, visitors }]`
  - History is merged inside `visits`, `pages`, `referrers`, `events` when `range.start < historyUntil`.

- [ ] **Step 1: The SQL files**

Every live file reads `` `csarko-sh.csarko_visits._AllLogs` `` and the collector rewrites project and dataset; every history file reads `` `csarko-sh.csarko_history.goatcounter_history` ``. Parameters are strings; the SQL casts with `TIMESTAMP()`.

`queries/visits.sql`:
```sql
-- Visits a day for the current window [start, end) and the previous one [prev_start, start).
-- A visit is the collector's daily hash; a row without one (no address resolved) counts by its page id.
WITH views AS (
  SELECT
    DATE(timestamp) AS day,
    IF(timestamp >= TIMESTAMP(@start), 'current', 'previous') AS window,
    COALESCE(JSON_VALUE(json_payload.s.visit), JSON_VALUE(json_payload.id)) AS visit
  FROM `csarko-sh.csarko_visits._AllLogs`
  WHERE timestamp >= TIMESTAMP(@prev_start) AND timestamp < TIMESTAMP(@end)
    AND JSON_VALUE(json_payload.n) = 'view'
    AND IFNULL(JSON_VALUE(json_payload.s.bot), 'false') != 'true'
)
SELECT window, day, COUNT(DISTINCT visit) AS visits
FROM views
GROUP BY window, day
ORDER BY day
```

`queries/pages.sql`:
```sql
-- Pages by visitors in [start, end), with the engaged time and the share that reached the end
-- from each page load's last leave.
WITH views AS (
  SELECT
    JSON_VALUE(json_payload.id) AS id,
    JSON_VALUE(json_payload.p) AS path,
    JSON_VALUE(json_payload.t) AS title,
    COALESCE(JSON_VALUE(json_payload.s.visit), JSON_VALUE(json_payload.id)) AS visit
  FROM `csarko-sh.csarko_visits._AllLogs`
  WHERE timestamp >= TIMESTAMP(@start) AND timestamp < TIMESTAMP(@end)
    AND JSON_VALUE(json_payload.n) = 'view'
    AND IFNULL(JSON_VALUE(json_payload.s.bot), 'false') != 'true'
),
leaves AS (
  SELECT
    JSON_VALUE(json_payload.id) AS id,
    ARRAY_AGG(STRUCT(
      SAFE_CAST(JSON_VALUE(json_payload.e) AS INT64) AS e,
      JSON_VALUE(json_payload.re) = 'true' AS re
    ) ORDER BY timestamp DESC LIMIT 1)[OFFSET(0)] AS last
  FROM `csarko-sh.csarko_visits._AllLogs`
  WHERE timestamp >= TIMESTAMP(@start) AND timestamp < TIMESTAMP(@end)
    AND JSON_VALUE(json_payload.n) = 'leave'
  GROUP BY id
)
SELECT
  v.path,
  ANY_VALUE(v.title) AS title,
  COUNT(DISTINCT v.visit) AS visitors,
  APPROX_QUANTILES(l.last.e, 2)[OFFSET(1)] AS engaged_median,
  SAFE_DIVIDE(COUNTIF(l.last.re), COUNTIF(l.id IS NOT NULL)) AS reached
FROM views v
LEFT JOIN leaves l USING (id)
GROUP BY v.path
ORDER BY visitors DESC
LIMIT 200
```

`queries/referrers.sql`:
```sql
-- Where visits came from in [start, end): external hosts and direct, the campaign tags, and the
-- site's own edges (the previous page to this one).
WITH views AS (
  SELECT
    JSON_VALUE(json_payload.p) AS path,
    COALESCE(JSON_VALUE(json_payload.s.visit), JSON_VALUE(json_payload.id)) AS visit,
    JSON_VALUE(json_payload.s.rk) AS rk,
    JSON_VALUE(json_payload.s.rh) AS rh,
    JSON_VALUE(json_payload.s.rp) AS rp,
    COALESCE(JSON_VALUE(json_payload.cr), JSON_VALUE(json_payload.us)) AS campaign
  FROM `csarko-sh.csarko_visits._AllLogs`
  WHERE timestamp >= TIMESTAMP(@start) AND timestamp < TIMESTAMP(@end)
    AND JSON_VALUE(json_payload.n) = 'view'
    AND IFNULL(JSON_VALUE(json_payload.s.bot), 'false') != 'true'
)
SELECT 'referrer' AS kind, IF(rk = 'direct', '', IFNULL(rh, '')) AS name, '' AS target, COUNT(DISTINCT visit) AS visitors
FROM views WHERE rk IN ('direct', 'external') GROUP BY name
UNION ALL
SELECT 'campaign', campaign, '', COUNT(DISTINCT visit) FROM views WHERE campaign IS NOT NULL GROUP BY campaign
UNION ALL
SELECT 'internal', rp, path, COUNT(DISTINCT visit) FROM views WHERE rk = 'internal' AND rp IS NOT NULL GROUP BY rp, path
ORDER BY visitors DESC
```

`queries/events.sql`:
```sql
-- Named clicks, outbound links by host, docs read to the end (from the leave beacon), and the
-- home page's visitors, in [start, end).
WITH base AS (
  SELECT json_payload AS j, COALESCE(JSON_VALUE(json_payload.s.visit), JSON_VALUE(json_payload.id)) AS visit
  FROM `csarko-sh.csarko_visits._AllLogs`
  WHERE timestamp >= TIMESTAMP(@start) AND timestamp < TIMESTAMP(@end)
    AND IFNULL(JSON_VALUE(json_payload.s.bot), 'false') != 'true'
)
SELECT name, COUNT(DISTINCT visit) AS visitors FROM (
  SELECT JSON_VALUE(j.ev) AS name, visit FROM base
  WHERE JSON_VALUE(j.n) = 'click' AND JSON_VALUE(j.ev) IS NOT NULL
  UNION ALL
  SELECT CONCAT('link-', REGEXP_EXTRACT(JSON_VALUE(j.u), r'^https?://([^/]+)')), visit FROM base
  WHERE JSON_VALUE(j.n) = 'click' AND JSON_VALUE(j.ev) IS NULL AND JSON_VALUE(j.u) IS NOT NULL
  UNION ALL
  SELECT CONCAT('read-', REGEXP_EXTRACT(JSON_VALUE(j.p), r'^/research/([^/]+)$')), visit FROM base
  WHERE JSON_VALUE(j.n) = 'leave' AND JSON_VALUE(j.re) = 'true' AND REGEXP_CONTAINS(JSON_VALUE(j.p), r'^/research/[^/]+$')
  UNION ALL
  SELECT '(home)', visit FROM base WHERE JSON_VALUE(j.n) = 'view' AND JSON_VALUE(j.p) = '/'
)
WHERE name IS NOT NULL
GROUP BY name
ORDER BY visitors DESC
```

`queries/audience.sql`:
```sql
-- Who the visitors are, by dimension, in [start, end).
WITH views AS (
  SELECT
    COALESCE(JSON_VALUE(json_payload.s.visit), JSON_VALUE(json_payload.id)) AS visit,
    JSON_VALUE(json_payload.s.cc) AS country,
    JSON_VALUE(json_payload.sw) AS size,
    JSON_VALUE(json_payload.s.bn) AS browser,
    JSON_VALUE(json_payload.s.os) AS system,
    COALESCE(JSON_VALUE(json_payload.lg), JSON_VALUE(json_payload.s.lg)) AS language,
    JSON_VALUE(json_payload.th) AS theme,
    CASE
      WHEN SAFE_CAST(JSON_VALUE(json_payload.vw) AS INT64) < 400 THEN 'under 400'
      WHEN SAFE_CAST(JSON_VALUE(json_payload.vw) AS INT64) < 800 THEN '400 to 799'
      WHEN SAFE_CAST(JSON_VALUE(json_payload.vw) AS INT64) < 1200 THEN '800 to 1199'
      WHEN SAFE_CAST(JSON_VALUE(json_payload.vw) AS INT64) IS NOT NULL THEN '1200 and up'
    END AS viewport,
    IF(JSON_VALUE(json_payload.tp) = 'true', 'touch', 'pointer') AS touch,
    JSON_VALUE(json_payload.tz) AS timezone
  FROM `csarko-sh.csarko_visits._AllLogs`
  WHERE timestamp >= TIMESTAMP(@start) AND timestamp < TIMESTAMP(@end)
    AND JSON_VALUE(json_payload.n) = 'view'
    AND IFNULL(JSON_VALUE(json_payload.s.bot), 'false') != 'true'
)
SELECT dim, name, COUNT(DISTINCT visit) AS visitors FROM (
  SELECT 'countries' AS dim, country AS name, visit FROM views
  UNION ALL SELECT 'sizes', size, visit FROM views
  UNION ALL SELECT 'browsers', browser, visit FROM views
  UNION ALL SELECT 'systems', system, visit FROM views
  UNION ALL SELECT 'languages', language, visit FROM views
  UNION ALL SELECT 'themes', theme, visit FROM views
  UNION ALL SELECT 'viewports', viewport, visit FROM views
  UNION ALL SELECT 'touch', touch, visit FROM views
  UNION ALL SELECT 'timezones', timezone, visit FROM views
)
WHERE name IS NOT NULL AND name != ''
GROUP BY dim, name
ORDER BY dim, visitors DESC
```

`queries/history-visits.sql`:
```sql
-- GoatCounter's visits a day in [start, end), for the window's part before the cutover.
SELECT IF(hour >= TIMESTAMP(@start), 'current', 'previous') AS window, DATE(hour) AS day, SUM(visits) AS visits
FROM `csarko-sh.csarko_history.goatcounter_history`
WHERE hour >= TIMESTAMP(@prev_start) AND hour < TIMESTAMP(@end) AND NOT event
GROUP BY window, day
ORDER BY day
```
`queries/history-pages.sql`:
```sql
SELECT path, ANY_VALUE(title) AS title, SUM(visits) AS visitors
FROM `csarko-sh.csarko_history.goatcounter_history`
WHERE hour >= TIMESTAMP(@start) AND hour < TIMESTAMP(@end) AND NOT event
GROUP BY path ORDER BY visitors DESC LIMIT 200
```
`queries/history-referrers.sql`:
```sql
SELECT 'referrer' AS kind, IFNULL(ref, '') AS name, '' AS target, SUM(visits) AS visitors
FROM `csarko-sh.csarko_history.goatcounter_history`
WHERE hour >= TIMESTAMP(@start) AND hour < TIMESTAMP(@end) AND NOT event
GROUP BY name ORDER BY visitors DESC
```
`queries/history-events.sql`:
```sql
SELECT REGEXP_REPLACE(path, r'^/', '') AS name, SUM(visits) AS visitors
FROM `csarko-sh.csarko_history.goatcounter_history`
WHERE hour >= TIMESTAMP(@start) AND hour < TIMESTAMP(@end) AND event
GROUP BY name ORDER BY visitors DESC
```

- [ ] **Step 2: The collector**

`admin/api/src/collectors/visits.mjs`:
```js
/**
 * The site's own analytics: lib-visits rows in BigQuery through Log Analytics
 * (`csarko_visits._AllLogs`), and GoatCounter's history in `csarko_history`
 * for windows that reach before the cutover. Each query is a saved SQL file
 * under `queries/`, with `@start`, `@end`, `@prev_start`, `@prev_end` as
 * string parameters the SQL casts to TIMESTAMP; one job a query, cached five
 * minutes by name and window. History rows are merged in code (summed by
 * day, path or name), since the two datasets are in different locations.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { UpstreamError } from "../http.mjs";

const LIVE_TABLE = /`csarko-sh\.csarko_visits\._AllLogs`/g;
const HISTORY_TABLE = /`csarko-sh\.csarko_history\.goatcounter_history`/g;

export function createVisits({ bigquery, projectId, dataset, historyDataset, historyUntil, cache, now = Date.now, log = console, ttlMs = 300_000, queriesDir = join(process.cwd(), "queries") }) {
  const sqlOf = (name) => {
    const sql = readFileSync(join(queriesDir, `${name}.sql`), "utf8");
    return sql.replace(LIVE_TABLE, `\`${projectId}.${dataset}._AllLogs\``).replace(HISTORY_TABLE, `\`${projectId}.${historyDataset}.goatcounter_history\``);
  };

  async function run(name, params) {
    const key = `visits:${name}:${JSON.stringify(params)}`;
    return cache.get(key, ttlMs, async () => {
      try {
        const [rows] = await bigquery.query({ query: sqlOf(name), params, useLegacySql: false });
        return rows.map(plainRow);
      } catch (error) {
        throw new UpstreamError(`BigQuery ${name} failed: ${error?.message ?? error}`, { cause: error });
      }
    });
  }

  const wantsHistory = (range) => Boolean(historyDataset && historyUntil && range.prevStart < historyUntil);
  const win = (range) => ({ start: range.start, end: range.end, prev_start: range.prevStart, prev_end: range.prevEnd });

  return {
    get configured() {
      return Boolean(bigquery && dataset);
    },

    async visits(range) {
      const live = await run("visits", win(range));
      const rows = wantsHistory(range) ? [...live, ...(await run("history-visits", win(range)))] : live;
      const shape = (window) => {
        const byDay = new Map();
        for (const r of rows) if (r.window === window) byDay.set(r.day, (byDay.get(r.day) ?? 0) + Number(r.visits));
        const perDay = [...byDay.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([day, visits]) => ({ day, visits, pageviews: null }));
        return { visits: perDay.reduce((n, d) => n + d.visits, 0), pageviews: null, perDay };
      };
      return { current: shape("current"), previous: shape("previous") };
    },

    async pages(range) {
      const live = await run("pages", { start: range.start, end: range.end });
      const rows = live.map((r) => ({ path: r.path, title: r.title ?? "", visitors: Number(r.visitors), pageviews: null, engagedMedian: r.engaged_median === null || r.engaged_median === undefined ? null : Number(r.engaged_median), reached: r.reached === null || r.reached === undefined ? null : Number(r.reached) }));
      if (!wantsHistory(range)) return rows;
      const history = await run("history-pages", { start: range.start, end: range.end });
      return sumBy([...rows, ...history.map((r) => ({ path: r.path, title: r.title ?? "", visitors: Number(r.visitors), pageviews: null, engagedMedian: null, reached: null }))], "path", "visitors");
    },

    async referrers(range) {
      const live = await run("referrers", { start: range.start, end: range.end });
      const all = wantsHistory(range) ? [...live, ...(await run("history-referrers", { start: range.start, end: range.end }))] : live;
      const of = (kind) => all.filter((r) => r.kind === kind);
      return {
        referrers: sumBy(of("referrer").map((r) => ({ name: r.name ?? "", visitors: Number(r.visitors) })), "name", "visitors"),
        campaigns: of("campaign").map((r) => ({ campaign: r.name, visitors: Number(r.visitors) })),
        paths: of("internal").map((r) => ({ from: r.name, to: r.target, visitors: Number(r.visitors) })),
      };
    },

    async events(range) {
      const live = await run("events", { start: range.start, end: range.end });
      const all = wantsHistory(range) ? [...live, ...(await run("history-events", { start: range.start, end: range.end }))] : live;
      const rows = sumBy(all.map((r) => ({ name: r.name, visitors: Number(r.visitors) })), "name", "visitors");
      const home = rows.find((r) => r.name === "(home)");
      return { rows: rows.filter((r) => r.name !== "(home)"), homeVisitors: home ? home.visitors : 0 };
    },

    async audience(range) {
      const rows = await run("audience", { start: range.start, end: range.end });
      const out = { countries: [], sizes: [], browsers: [], systems: [], languages: [], themes: [], viewports: [], touch: [], timezones: [] };
      for (const r of rows) if (out[r.dim]) out[r.dim].push({ name: String(r.name), visitors: Number(r.visitors) });
      return out;
    },
  };
}

/** Rows with the same `key` folded into one, their `field` summed, highest first. */
export function sumBy(rows, key, field) {
  const map = new Map();
  for (const r of rows) {
    const k = r[key];
    const seen = map.get(k);
    if (seen) seen[field] += r[field];
    else map.set(k, { ...r });
  }
  return [...map.values()].sort((a, b) => b[field] - a[field]);
}

/** BigQuery wraps dates, timestamps and big numbers in objects with `value`; the API wants plain values. */
export function plainRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) out[k] = v !== null && typeof v === "object" && "value" in v ? v.value : v;
  return out;
}
```

- [ ] **Step 3: The test, with a fake BigQuery**

`admin/api/test/fixtures/visits-rows.json`:
```json
{
  "visits": [
    { "window": "previous", "day": { "value": "2026-10-10" }, "visits": 3 },
    { "window": "current", "day": { "value": "2026-10-14" }, "visits": 5 },
    { "window": "current", "day": { "value": "2026-10-15" }, "visits": 2 }
  ],
  "history-visits": [
    { "window": "previous", "day": { "value": "2026-10-09" }, "visits": 4 },
    { "window": "current", "day": { "value": "2026-10-14" }, "visits": 1 }
  ],
  "pages": [
    { "path": "/", "title": "Home", "visitors": 6, "engaged_median": 12, "reached": null },
    { "path": "/research/a", "title": "A", "visitors": 2, "engaged_median": 90, "reached": 0.5 }
  ],
  "history-pages": [{ "path": "/", "title": "Home", "visitors": 10 }],
  "referrers": [
    { "kind": "referrer", "name": "", "target": "", "visitors": 4 },
    { "kind": "referrer", "name": "google.com", "target": "", "visitors": 3 },
    { "kind": "campaign", "name": "substack", "target": "", "visitors": 1 },
    { "kind": "internal", "name": "/", "target": "/games", "visitors": 2 }
  ],
  "history-referrers": [{ "kind": "referrer", "name": "google.com", "target": "", "visitors": 7 }],
  "events": [
    { "name": "out-github", "visitors": 2 },
    { "name": "read-a", "visitors": 1 },
    { "name": "(home)", "visitors": 6 }
  ],
  "history-events": [{ "name": "out-github", "visitors": 3 }],
  "audience": [
    { "dim": "countries", "name": "US", "visitors": 5 },
    { "dim": "themes", "name": "dark", "visitors": 4 },
    { "dim": "touch", "name": "pointer", "visitors": 6 }
  ]
}
```

`admin/api/test/visits.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createCache } from "../src/cache.mjs";
import { createVisits, sumBy, plainRow } from "../src/collectors/visits.mjs";
import { UpstreamError } from "../src/http.mjs";

const rows = JSON.parse(readFileSync(new URL("./fixtures/visits-rows.json", import.meta.url), "utf8"));
const queriesDir = new URL("../queries/", import.meta.url).pathname;

function fake(calls = []) {
  return {
    async query({ query, params }) {
      const name = Object.keys(rows).find((n) => query.includes(n === "visits" || n === "pages" || n === "referrers" || n === "events" || n === "audience" ? "_AllLogs" : "goatcounter_history") && query.includes(`-- ${n}`) || false);
      throw new Error("use the name header");
    },
  };
}

// Each saved SQL file starts with a comment; the fake matches on the rewritten table and the
// file's first line, so a test knows which file ran.
function fakeBigQuery(calls = []) {
  const first = (name) => readFileSync(`${queriesDir}${name}.sql`, "utf8").split("\n")[0];
  return {
    async query({ query, params }) {
      const name = Object.keys(rows).find((n) => query.startsWith(first(n)));
      if (!name) throw new Error(`no fixture for query starting ${query.slice(0, 60)}`);
      assert.ok(query.includes("`p.d._AllLogs`") || query.includes("`p.h.goatcounter_history`"), "tables rewritten");
      calls.push({ name, params });
      return [rows[name]];
    },
  };
}

const range = { start: "2026-10-13T00:00:00Z", end: "2026-10-16T00:00:00Z", prevStart: "2026-10-10T00:00:00Z", prevEnd: "2026-10-13T00:00:00Z" };
const make = (opts = {}) => {
  const calls = [];
  const v = createVisits({ bigquery: fakeBigQuery(calls), projectId: "p", dataset: "d", historyDataset: "h", historyUntil: "2026-10-14T00:00:00Z", cache: createCache(), queriesDir, ...opts });
  return { v, calls };
};

test("visits sums live and history rows by day and window, and a row without a visit still counts", async () => {
  const { v, calls } = make();
  const r = await v.visits(range);
  assert.deepEqual(r.current.perDay, [{ day: "2026-10-14", visits: 6, pageviews: null }, { day: "2026-10-15", visits: 2, pageviews: null }]);
  assert.equal(r.current.visits, 8);
  assert.deepEqual(r.previous.perDay.map((d) => d.day), ["2026-10-09", "2026-10-10"]);
  assert.deepEqual(calls.map((c) => c.name), ["visits", "history-visits"]);
  assert.deepEqual(calls[0].params, { start: range.start, end: range.end, prev_start: range.prevStart, prev_end: range.prevEnd });
});

test("history is not queried when the window starts after the cutover", async () => {
  const { v, calls } = make({ historyUntil: "2026-10-01T00:00:00Z" });
  await v.visits(range);
  assert.deepEqual(calls.map((c) => c.name), ["visits"]);
});

test("pages merge history by path and keep engaged time and reached share from live rows", async () => {
  const { v } = make();
  const r = await v.pages(range);
  assert.deepEqual(r[0], { path: "/", title: "Home", visitors: 16, pageviews: null, engagedMedian: 12, reached: null });
  assert.equal(r[1].reached, 0.5);
});

test("referrers split into referrers (direct as empty name), campaigns and internal paths", async () => {
  const { v } = make();
  const r = await v.referrers(range);
  assert.deepEqual(r.referrers, [{ name: "google.com", visitors: 10 }, { name: "", visitors: 4 }]);
  assert.deepEqual(r.campaigns, [{ campaign: "substack", visitors: 1 }]);
  assert.deepEqual(r.paths, [{ from: "/", to: "/games", visitors: 2 }]);
});

test("events fold history and lift the home-page visitors out of the rows", async () => {
  const { v } = make();
  const r = await v.events(range);
  assert.deepEqual(r.rows, [{ name: "out-github", visitors: 5 }, { name: "read-a", visitors: 1 }]);
  assert.equal(r.homeVisitors, 6);
});

test("audience groups by dimension", async () => {
  const { v } = make();
  const r = await v.audience(range);
  assert.deepEqual(r.themes, [{ name: "dark", visitors: 4 }]);
  assert.deepEqual(r.sizes, []);
});

test("a BigQuery failure is an upstream error, and the same window is cached", async () => {
  const { v, calls } = make();
  await v.audience(range);
  await v.audience(range);
  assert.equal(calls.filter((c) => c.name === "audience").length, 1);
  const broken = createVisits({ bigquery: { async query() { throw new Error("quota"); } }, projectId: "p", dataset: "d", historyDataset: "h", historyUntil: null, cache: createCache(), queriesDir });
  await assert.rejects(broken.audience(range), (e) => e instanceof UpstreamError && /BigQuery audience failed: quota/.test(e.message));
});

test("sumBy and plainRow", () => {
  assert.deepEqual(sumBy([{ k: "a", n: 1 }, { k: "b", n: 5 }, { k: "a", n: 2 }], "k", "n"), [{ k: "b", n: 5 }, { k: "a", n: 3 }]);
  assert.deepEqual(plainRow({ day: { value: "2026-10-14" }, n: 2, s: null }), { day: "2026-10-14", n: 2, s: null });
});
```
Delete the first `fake()` helper in that file (it is a leftover sketch; only `fakeBigQuery` is used). For the first-line match to work, give every SQL file a distinct first comment line (the ones above are distinct; `history-pages.sql`, `history-referrers.sql` and `history-events.sql` need one added: `-- GoatCounter's pages ...`, `-- GoatCounter's referrers ...`, `-- GoatCounter's events ...`).

- [ ] **Step 4: Install, run, commit**

Run: `cd admin/api && npm install @google-cloud/bigquery@9.2.0 --save-exact 2>&1 | tail -1 && node --test test/visits.test.mjs 2>&1 | grep -E "^# (pass|fail)"`
Expected: `# pass 8`.

Add `COPY queries ./queries` to the Dockerfile after `COPY src ./src`.

```bash
git add admin/api/package.json admin/api/package-lock.json admin/api/Dockerfile admin/api/src/collectors/visits.mjs admin/api/queries admin/api/test/visits.test.mjs admin/api/test/fixtures/visits-rows.json
git commit -m "admin API: a BigQuery collector for the site's visits

Saved SQL over csarko_visits._AllLogs, one job a query, cached five
minutes by window; GoatCounter's history from csarko_history merged by
day, path or name when the window reaches before the cutover."
```

---

### Task 9: The queries read the collector; GoatCounter leaves the API

**Files:**
- Modify: `admin/api/src/queries.mjs` (the five query functions, `requireGc`, `notFoundOf`, `health`, `kpis`, `snapshot`, the imports at 17-20, the `createQueries` signature at 80), `admin/api/src/config.mjs:67`, `admin/api/src/server.mjs:20,39-50,71`, `admin/api/test/queries.test.mjs`, `admin/api/test/app.test.mjs:17,79`, `admin/api/test/http.test.mjs:41-57`, `admin/api/.env.local.example:6`
- Delete: `admin/api/src/collectors/goatcounter.mjs`, `admin/api/test/goatcounter.test.mjs`, `admin/api/test/fixtures/goatcounter-*.json` (keep `goatcounter-toprefs.json` only if `test/referrers.test.mjs` needs it; otherwise convert that test's rows inline)

**Interfaces:**
- Consumes: `createVisits` from Task 8.
- Produces, on the wire (CONTRACT.md updates in Task 11): `visits` as before; `pages.rows` gain `engagedMedian` and `reached`; `referrers` gains `paths: [{ from, to, visitors }]`; `events` as before; `audience` gains `themes`, `viewports`, `touch`, `timezones`; the hint key `visits` / env `VISITS_DATASET`.

- [ ] **Step 1: Config and server**

`config.mjs:67` becomes:
```js
    visits: { dataset: text(env.VISITS_DATASET, ""), historyDataset: text(env.VISITS_HISTORY_DATASET, ""), historyUntil: text(env.VISITS_HISTORY_UNTIL, "") || null },
```
`server.mjs`: replace the goatcounter import with `import { BigQuery } from "@google-cloud/bigquery"; import { createVisits } from "./collectors/visits.mjs";`; in `createQueries({...})` replace `gc: createGoatCounter(...)` with
```js
    visits: createVisits({ bigquery: config.visits.dataset ? new BigQuery({ projectId: config.projectId }) : null, projectId: config.projectId, dataset: config.visits.dataset, historyDataset: config.visits.historyDataset, historyUntil: config.visits.historyUntil, cache, log }),
```
and in the `unconfigured` list replace the GOATCOUNTER line with `!config.visits.dataset && "VISITS_DATASET"`.

- [ ] **Step 2: `queries.mjs`**

Imports: drop `gcMap`; keep `groupReferrers`, `pathsOf`/`normalizePath`, `assessHealth`, time helpers. Signature: `createQueries({ visits, gsc, youtube, github, hn, psi, uptime, hosting, sitemap, store, config, now = Date.now, log })`.

Replace `requireGc` with:
```js
  const requireVisits = () => (visits.configured ? null : { notConfigured: { visits: "VISITS_DATASET" } });
```
Replace `notFoundOf(hits, h)` with:
```js
  async function notFoundOf(rows, h) {
    const paths = await sitemapPaths(h);
    if (paths === null) return null;
    return rows.filter((r) => r.visitors > 0 && !paths.has(normalizePath(r.path))).map((r) => ({ path: r.path, visitors: r.visitors }));
  }
```
The five queries:
```js
    async visits(days) {
      const range = hourlyRange(days, now());
      const empty = requireVisits();
      if (empty) return { days, from: range.start, to: range.end, current: null, previous: null, ...empty };
      const { current, previous } = await visits.visits(range);
      return { days, from: range.start, to: range.end, current, previous };
    },

    async pages(days) {
      const empty = requireVisits();
      if (empty) return { rows: null, ...empty };
      const range = hourlyRange(days, now());
      const h = hints();
      const [rows, paths] = await Promise.all([visits.pages(range), sitemapPaths(h)]);
      return withHints({ rows: rows.map((r) => ({ ...r, inSitemap: paths === null ? null : paths.has(normalizePath(r.path)) })) }, h);
    },

    async referrers(days) {
      const empty = requireVisits();
      if (empty) return { groups: null, rows: null, campaigns: null, paths: null, ...empty };
      const range = hourlyRange(days, now());
      const r = await visits.referrers(range);
      return { ...groupReferrers(r.referrers.map((x) => ({ name: x.name, count: x.visitors }))), campaigns: r.campaigns, paths: r.paths };
    },

    async events(days) {
      const empty = requireVisits();
      if (empty) return { rows: null, outboundRate: null, ...empty };
      const range = hourlyRange(days, now());
      const e = await visits.events(range);
      const rows = e.rows.map((r) => ({ name: r.name, kind: eventKindOf(r.name), visitors: r.visitors }));
      const outbound = rows.filter((r) => r.kind === "out").reduce((n, r) => n + r.visitors, 0);
      return { rows, outboundRate: e.homeVisitors > 0 ? outbound / e.homeVisitors : null };
    },

    async audience(days) {
      const empty = requireVisits();
      if (empty) return { countries: null, sizes: null, browsers: null, systems: null, languages: null, themes: null, viewports: null, touch: null, timezones: null, ...empty };
      return visits.audience(hourlyRange(days, now()));
    },
```
Add near the top of the file (it was in the GoatCounter module):
```js
const EVENT_KINDS = ["out", "play", "watch", "read", "nav"];
/** The kind of an event name from its prefix: `out-github` is an outbound click, `read-<slug>` a read to the end. */
export function eventKindOf(name) {
  const prefix = String(name).split("-")[0];
  return EVENT_KINDS.includes(prefix) ? prefix : "other";
}
const outboundOf = (rows) => rows.filter((r) => eventKindOf(r.name) === "out").reduce((n, r) => n + r.visitors, 0);
```
`health`: the `hits` part becomes `part(h, "visits", "VISITS_DATASET", visits.configured, () => visits.pages(range))` and `const notFound = hits === null ? null : await notFoundOf(hits, h);` stays (rows now).
`kpis`: the `visits` part becomes
```js
        part(h, "visits", "VISITS_DATASET", visits.configured, async () => {
          const { current, previous } = await visits.visits(range);
          return { value: current.visits, prev: previous.visits };
        }),
        part(h, "outbound", "VISITS_DATASET", visits.configured, async () => {
          const prevRange = { ...range, start: range.prevStart, end: range.prevEnd, prevStart: range.prevStart, prevEnd: range.prevStart };
          const [cur, prev] = await Promise.all([visits.events(range), visits.events(prevRange)]);
          return { value: outboundOf(cur.rows), prev: outboundOf(prev.rows) };
        }),
```
`snapshot`: `total` becomes `part(h, "visits", "VISITS_DATASET", visits.configured, () => visits.visits(range))` and `hits` becomes `part(h, "events", "VISITS_DATASET", visits.configured, () => visits.events(range))`; the doc fields: `visits7: total === null ? null : total.current.visits`, `outbound7: hits === null ? null : outboundOf(hits.rows)`.

- [ ] **Step 3: Tests**

`test/queries.test.mjs`: replace the GoatCounter fake and fixtures with a fake `visits` collector returning the shapes from Task 8's interfaces (`configured: true`; `visits()` → `{ current: { visits: 181, perDay: [...] }, previous: ... }`, `pages()` → rows incl. `/docs/old-slug` and `/wp-login.php` so the 404 logic keeps its cases, `referrers()`, `events()` with `out-linkedin 18`, `out-github 12`, `play-dayhike 9`, `read-stylized-shader-looks 6`, `watch-who-is-standing-in-my-hallway 4`, `signup 1` and `homeVisitors: 120`, `audience()`); keep every existing assertion's meaning (`events` kinds and the outbound rate `30 / 120`, `notFound` from the sitemap, the kpi and snapshot `notConfigured` hint names now `visits`, `events`, `outbound` with env `VISITS_DATASET`). Add a test that `eventKindOf("link-example.com")` is `other` and that `referrers().paths` passes through. `test/app.test.mjs:17,79`: the thrown `UpstreamError` message becomes `"BigQuery audience failed: quota"`. `test/http.test.mjs:41-57`: assert `config.visits.dataset` is `""` when unset and `"csarko_visits"` when `VISITS_DATASET` is set. `test/referrers.test.mjs`: if it reads `goatcounter-toprefs.json`, inline three rows instead and delete the fixture. Delete `test/goatcounter.test.mjs` and the other `goatcounter-*.json` fixtures. `.env.local.example`: replace the GOATCOUNTER lines with `VISITS_DATASET=csarko_visits`, `VISITS_HISTORY_DATASET=csarko_history`, `VISITS_HISTORY_UNTIL=2026-10-16T00:00:00Z`.

Run: `cd admin/api && npm test 2>&1 | grep -E "^# (pass|fail)|^not ok"`
Expected: all pass, no `not ok`. `grep -rn goatcounter admin/api/src admin/api/test` prints nothing.

- [ ] **Step 4: Commit**

```bash
git add -A admin/api/src admin/api/test admin/api/.env.local.example
git commit -m "admin API: the site's queries read BigQuery, GoatCounter leaves

visits, pages, referrers, events and audience come from the visits
collector, as do the KPI, the snapshot and the 404 list; pages carry
engaged time and the share read to the end, referrers the site's own
edges, audience the theme, viewport, touch and timezone."
```
(`git add -A` scoped to those three paths is the one place it is used, for the deletions; confirm `git status` shows nothing else staged.)

---

### Task 10: The dashboard page

**Files:**
- Modify: `admin/public/csarko.sh/page.js:38-40,54,73-107,110,288-305,310`

- [ ] **Step 1: Edits**

- Every `missing(x, 'goatcounter')` becomes `missing(x, 'visits')` (lines 54, 74, 81, 85, 90, 110, 290, 294 and in `healthCard`).
- `CARDS[0].sub` (line 310): `Visits ${rangeText(d)}, against ${previousText(d)}. A visit is one browser on one day; nothing is stored in it.`
- `pagesCard`: add two columns after `visitors`: `{ key: 'engagedMedian', label: 'Median engaged', num: true, render: (v) => isNum(v) ? \`${v}s\` : '' }` and `{ key: 'reached', label: 'Read to the end', num: true, render: (v) => isNum(v) ? pct(v) : '' }`.
- `referrersCard`: after the campaigns block add a folded table `folded('Paths through the site', table([{ key: 'from', label: 'From', render: mono }, { key: 'to', label: 'To', render: mono }, { key: 'visitors', label: 'Visitors', num: true }], refs.paths ?? [], 'No internal navigation in this range.'))` and include it in the returned array.
- `audienceCard`: `sections` gains `['themes', 'Theme'], ['viewports', 'Viewport'], ['touch', 'Input'], ['timezones', 'Timezones']`; the `folded` label becomes `'Countries, screen sizes, browsers, systems, languages, theme, viewport, input, timezones'`; `summary` adds `top('themes')`.
- `eventsCard`'s "Read to the end" note stays: the series name is unchanged.

- [ ] **Step 2: Preview and look**

Run: `nice -n 10 admin/preview.sh --shots 2>&1 | tail -2` then read `/tmp/csarko-sh-admin-preview/csarko-sh-desktop.png` and `csarko-sh-desktop-light.png` (the sample data source renders the cards; `admin/public/sample/` may need `engagedMedian`, `reached`, `paths`, `themes` etc. added to its JSON so the new lines show in the preview: add them).
Expected: the new columns and sections render in both themes; `python3 .agents/skills/site-quality/scripts/check.py --admin` passes.

- [ ] **Step 3: Commit**

```bash
git add admin/public/csarko.sh/page.js admin/public/sample
git commit -m "admin: the csarko.sh dashboard shows what lib-visits adds

Engaged time and the share read to the end on Pages, the site's own
paths on Referrers, theme, viewport, input and timezone on Audience."
```

---

### Task 11: Documentation

**Files:**
- Modify: `admin/api/README.md` (lines 4, 10, 30-32, 45, 95, 106, the Deploy section), `admin/README.md`, `admin/CONTRACT.md` (lines 18, 29, 83, 93, 106, 116, 125, 188), `README.md`, `.agents/skills/site-quality/SKILL.md`, `.agents/skills/substack-post/SKILL.md` (any GoatCounter mention), `AGENTS.md` (the admin section's GitHub/GoatCounter line and the "Where to look" table, if Task 7 left any)

- [ ] **Step 1: Edit**

Every GoatCounter mention becomes the lib-visits equivalent: the env rows `VISITS_DATASET` (`csarko_visits`), `VISITS_HISTORY_DATASET` (`csarko_history`), `VISITS_HISTORY_UNTIL` (the cutover instant); the dependency list adds `@google-cloud/bigquery`; the contract's `notConfigured.goatcounter` becomes `notConfigured.visits`; the new fields (`pages.rows[].engagedMedian`, `.reached`; `referrers.paths`; `audience.themes|viewports|touch|timezones`) are documented in CONTRACT.md; the admin API README's service-account note lists `bigquery.jobUser`, `logging.viewAccessor` and `dataViewer` on the two datasets. `grep -rni goatcounter admin README.md .agents AGENTS.md | grep -v "history\|backfill\|2026-10-15\|outage"` prints nothing (history mentions are allowed).

- [ ] **Step 2: Commit**

```bash
git add admin/api/README.md admin/README.md admin/CONTRACT.md README.md .agents/skills/site-quality/SKILL.md .agents/skills/substack-post/SKILL.md AGENTS.md
git commit -m "docs: analytics is lib-visits now, everywhere the docs said GoatCounter"
```

---

### Task 12: The backfill

**Files:**
- Create: `visits/backfill.mjs`, `visits/test/backfill.test.mjs`

**Interfaces:**
- Produces: `rowsOf(exportText) → [{ hour, path, title, event, ref, visits }]` for either export format; a run that loads them into `csarko_history.goatcounter_history`.

- [ ] **Step 1: The test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { rowsOf } from "../backfill.mjs";

test("the JSON export's hourly hit stats become rows, joined to paths and refs", () => {
  const lines = [
    JSON.stringify({ export_version: "1.0" }),
    JSON.stringify({ path: { id: 1, path: "/", title: "Home" } }),
    JSON.stringify({ path: { id: 2, path: "out-github", title: "", event: true } }),
    JSON.stringify({ ref: { id: 7, ref: "google.com" } }),
    JSON.stringify({ hit_stat: { hour: "2026-10-01T10:00:00Z", path_id: 1, ref_id: 7, count: 3 } }),
    JSON.stringify({ hit_stat: { hour: "2026-10-01T10:00:00Z", path_id: 1, ref_id: 0, count: 2 } }),
    JSON.stringify({ hit_stat: { hour: "2026-10-01T11:00:00Z", path_id: 2, ref_id: 0, count: 1 } }),
  ].join("\n");
  assert.deepEqual(rowsOf(lines), [
    { hour: "2026-10-01T10:00:00Z", path: "/", title: "Home", event: false, ref: "google.com", visits: 3 },
    { hour: "2026-10-01T10:00:00Z", path: "/", title: "Home", event: false, ref: "", visits: 2 },
    { hour: "2026-10-01T11:00:00Z", path: "out-github", title: "", event: true, ref: "", visits: 1 },
  ]);
});

test("the per-hit CSV export is reduced to hourly counts, bots dropped", () => {
  const csv = [
    "2,Path,Title,Event,UserAgent,Browser,System,Session,Bot,Referrer,Referrer scheme,Screen size,Location,FirstVisit,Date",
    '"/","Home","false","","Firefox 128","macOS","s1","0","https://google.com/","h","1920","US","1","2026-10-01 10:05:00"',
    '"/","Home","false","","Firefox 128","macOS","s2","0","https://google.com/","h","1920","US","1","2026-10-01 10:50:00"',
    '"/","Home","false","","bot","","s3","150","","","0","","1","2026-10-01 10:51:00"',
    '"out-github","","true","","Firefox 128","macOS","s1","0","","","1920","US","0","2026-10-01 11:00:00"',
  ].join("\n");
  assert.deepEqual(rowsOf(csv), [
    { hour: "2026-10-01T10:00:00Z", path: "/", title: "Home", event: false, ref: "google.com", visits: 2 },
    { hour: "2026-10-01T11:00:00Z", path: "out-github", title: "", event: true, ref: "", visits: 1 },
  ]);
});
```

- [ ] **Step 2: The script**

```js
#!/usr/bin/env node
// visits/backfill.mjs: GoatCounter's export into csarko_history.goatcounter_history, once.
//
//   node visits/backfill.mjs export.json.gz        # or export.csv.gz, or the uncompressed file
//   node visits/backfill.mjs export.json.gz --load # also runs bq load
//
// Either export format reduces to hourly counts per path and referrer, which is what the
// dashboard's trends need. Audience history is not carried over.

import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";

const PROJECT = "csarko-sh";
const TABLE = "csarko_history.goatcounter_history";

const hourOf = (stamp) => {
  const d = new Date(stamp.includes("T") ? stamp : `${stamp.replace(" ", "T")}Z`);
  d.setUTCMinutes(0, 0, 0);
  return d.toISOString().replace(".000Z", "Z");
};
const hostOf = (ref) => {
  const m = /^[a-z][a-z0-9+.-]*:\/\/([^/?#@]+@)?([^/?#:]+)/i.exec(ref);
  return (m ? m[2] : ref).replace(/^www\./, "").toLowerCase();
};

/** `[{ hour, path, title, event, ref, visits }]` from the JSON-lines or the CSV export. */
export function rowsOf(text) {
  const t = text.trimStart();
  return t.startsWith("{") ? fromJson(t) : fromCsv(t);
}

function fromJson(text) {
  const paths = new Map();
  const refs = new Map([[0, ""]]);
  const sums = new Map();
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const o = JSON.parse(line);
    if (o.path) paths.set(o.path.id, o.path);
    else if (o.ref) refs.set(o.ref.id, hostOf(o.ref.ref ?? ""));
    else if (o.hit_stat) {
      const h = o.hit_stat;
      const key = `${hourOf(h.hour)}\t${h.path_id}\t${h.ref_id ?? 0}`;
      sums.set(key, (sums.get(key) ?? 0) + Number(h.count));
    }
  }
  return [...sums.entries()].map(([key, visits]) => {
    const [hour, pathId, refId] = key.split("\t");
    const p = paths.get(Number(pathId)) ?? { path: `#${pathId}`, title: "" };
    return { hour, path: p.path, title: p.title ?? "", event: Boolean(p.event), ref: refs.get(Number(refId)) ?? "", visits };
  });
}

function fromCsv(text) {
  const [header, ...lines] = text.split("\n").filter((l) => l.trim());
  const cols = parseCsvLine(header);
  const idx = (name) => cols.indexOf(name);
  const sums = new Map();
  const meta = new Map();
  for (const line of lines) {
    const f = parseCsvLine(line);
    if (Number(f[idx("Bot")] ?? 0) > 0) continue;
    const hour = hourOf(f[idx("Date")]);
    const path = f[idx("Path")];
    const ref = hostOf(f[idx("Referrer")] ?? "");
    const key = `${hour}\t${path}\t${ref}`;
    sums.set(key, (sums.get(key) ?? 0) + 1);
    meta.set(path, { title: f[idx("Title")] ?? "", event: f[idx("Event")] === "true" });
  }
  return [...sums.entries()].map(([key, visits]) => {
    const [hour, path, ref] = key.split("\t");
    const m = meta.get(path);
    return { hour, path, title: m.title, event: m.event, ref, visits };
  });
}

function parseCsvLine(line) {
  const out = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const [file, flag] = process.argv.slice(2);
  if (!file) { console.error("usage: node visits/backfill.mjs <export file> [--load]"); process.exit(2); }
  let bytes = readFileSync(file);
  if (file.endsWith(".gz")) bytes = gunzipSync(bytes);
  const rows = rowsOf(bytes.toString("utf8"));
  const out = "/tmp/goatcounter-history.jsonl";
  writeFileSync(out, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  console.log(`${rows.length} rows, ${rows.reduce((n, r) => n + r.visits, 0)} visits, ${new Set(rows.map((r) => r.hour.slice(0, 10))).size} days -> ${out}`);
  if (flag === "--load") {
    execFileSync("bq", ["load", "--project_id", PROJECT, "--source_format=NEWLINE_DELIMITED_JSON", "--replace", TABLE, out], { stdio: "inherit" });
    console.log(`loaded into ${PROJECT}.${TABLE}`);
  }
}
```

Run: `node --test visits/test/ 2>&1 | grep -E "^# (pass|fail)"`
Expected: `# pass 2`.

- [ ] **Step 3: Export, inspect, load**

Through the API with the token in Secret Manager (GoatCounter's site may still be unreliable; retry until the export finishes):
```bash
TOKEN="$(gcloud secrets versions access latest --secret goatcounter-token --project csarko-sh)"
API=https://csarko.goatcounter.com/api/v0
id=$(curl -fsS -X POST "$API/export" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')
until curl -fsS "$API/export/$id" -H "Authorization: Bearer $TOKEN" | grep -q '"finished_at":"20'; do sleep 5; done
curl -fsS "$API/export/$id/download" -H "Authorization: Bearer $TOKEN" -o /tmp/goatcounter-export.gz
file /tmp/goatcounter-export.gz; gunzip -c /tmp/goatcounter-export.gz | head -c 400; echo
node visits/backfill.mjs /tmp/goatcounter-export.gz
```
Read the summary (rows, visits, days) against the GoatCounter dashboard's totals before loading. Then: `node visits/backfill.mjs /tmp/goatcounter-export.gz --load` and verify: `bq query --project_id=csarko-sh --use_legacy_sql=false 'SELECT DATE(hour) d, SUM(visits) v FROM csarko_history.goatcounter_history WHERE NOT event GROUP BY d ORDER BY d DESC LIMIT 5'`.
If the export has a shape neither parser expects (a field name differs), adapt `fromJson`/`fromCsv` to the real file and add the real first lines to the test; never guess.

- [ ] **Step 4: Commit**

```bash
git add visits/backfill.mjs visits/test/backfill.test.mjs
git commit -m "visits: GoatCounter's history, backfilled once

Either export format reduces to hourly counts per path and referrer,
loaded into csarko_history.goatcounter_history."
```

---

### Task 13: The cutover

**Files:**
- Modify: `.agents/skills/deploy/scripts/deploy.sh` (append a beacon check after the page verification), `_infra/main.tf:139` and `_infra/variables.tf` (`goatcounter_site`), `_infra/modules/gcp-admin-api/variables.tf:32,62-70`, `_infra/modules/gcp-admin-api/main.tf` (the `GOATCOUNTER_SITE` env, the "six secrets" comments, add `VISITS_DATASET`, `VISITS_HISTORY_DATASET`, `VISITS_HISTORY_UNTIL` envs), `docs/superpowers/specs/2026-10-15-visits-wiring-design.md` ("As built")

- [ ] **Step 1: The beacon check in `deploy.sh`**

After the `VERIFY` loop, add:
```bash
# The beacon route: one test event through the Hosting rewrite must be taken.
code="$(curl -s -o /dev/null -w '%{http_code}' -H "Origin: $SITE_URL" -H 'Content-Type: text/plain' -d '{"v":1,"n":"view","id":"deploy-check","p":"/deploy-check"}' "$SITE_URL/v")"
[[ "$code" == "204" ]] && echo "✓ $SITE_URL/v takes a beacon (204)" || die "$SITE_URL/v answered $code: is the rewrite deployed and csarko-visits up?"
```
(use the script's existing variable for the live URL; it may be named differently.)

- [ ] **Step 2: Terraform: the admin API's new env and GoatCounter's removal**

In `_infra/modules/gcp-admin-api/main.tf`, replace the `GOATCOUNTER_SITE` env block with three:
```hcl
      env {
        name  = "VISITS_DATASET"
        value = var.visits_dataset
      }
      env {
        name  = "VISITS_HISTORY_DATASET"
        value = var.visits_history_dataset
      }
      env {
        name  = "VISITS_HISTORY_UNTIL"
        value = var.visits_history_until
      }
```
Add the three variables to the module (`visits_dataset`, `visits_history_dataset` strings; `visits_history_until` string, the cutover instant in RFC 3339, e.g. `"2026-10-17T00:00:00Z"`, the day after the deploy), remove `goatcounter_site`, remove the `goatcounter-token` entry from `secret_ids`' default and fix the "six" comments to "five". In `_infra/main.tf` replace `goatcounter_site = var.goatcounter_site` with `visits_dataset = module.gcp_visits.dataset`, `visits_history_dataset = module.gcp_visits.history_dataset`, `visits_history_until = var.visits_history_until`; add `variable "visits_history_until"` to the root (`type = string`, no default) and set it in `terraform.tfvars`; delete `goatcounter_site` from `variables.tf`, `terraform.tfvars` and `terraform.tfvars.example`.

Run: `terraform -chdir=_infra plan -input=false 2>&1 | grep -E "Plan:|destroy"`
Expected: the `goatcounter-token` secret and its IAM member are destroyed, the admin service changes its env; nothing else destroyed.

- [ ] **Step 3: Deploy, in this order**

```bash
terraform -chdir=_infra apply -input=false                   # admin env, GoatCounter secret gone
nice -n 10 .agents/skills/site-quality/scripts/generate-assets.sh >/dev/null
nice -n 10 .agents/skills/deploy/scripts/deploy.sh           # the site: tags, CSP, the /v rewrite, the beacon check
gcloud run deploy csarko-admin --source admin/api --region us-west1 --project csarko-sh --quiet
nice -n 10 admin/deploy.sh
```
Then the proxy depth through Hosting (Task 3 step 3, against `https://csarko.sh/v` this time) and the first real row:
```bash
sleep 120; bq query --project_id=csarko-sh --use_legacy_sql=false "SELECT timestamp, JSON_VALUE(json_payload.p) p, JSON_VALUE(json_payload.s.visit) visit, JSON_VALUE(json_payload.s.bn) bn FROM csarko_visits._AllLogs ORDER BY timestamp DESC LIMIT 5"
```
Expected: rows within a few minutes, with `visit` populated (if `visit` is null on real visits, the proxy depth is wrong: fix per Task 3 and re-apply). Then open https://admin.csarko.sh/csarko.sh/ and confirm every card fills, and run `nice -n 10 python3 .agents/skills/site-quality/scripts/check.py --live --lighthouse --observatory` once: 100/100/100, Performance ≥ 95, Observatory A+.

- [ ] **Step 4: Record and commit**

Append to the spec's "As built": the cutover date, the history-until value, the proxy depth through Hosting, and the first-row check. Commit:
```bash
git add .agents/skills/deploy/scripts/deploy.sh _infra docs/superpowers/specs/2026-10-15-visits-wiring-design.md
git commit -m "cutover: csarko.sh counts with lib-visits

The site's beacons go to csarko.sh/v, the dashboard reads BigQuery,
GoatCounter's token and site leave Terraform; history before the
cutover comes from the backfilled table."
```
Push `master` and request indexing of nothing (no page content changed).

---

## Self-review

**Spec coverage.** §2 service, rows, reader, history dataset, budget untouched (Task 1), deploy script and proxy depth (Tasks 2, 3). §3 rewrite and CSP (Tasks 4, 7). §4 `site.json`, the vendored scripts, the tags, `engage.js` gone, the attribute rename, `check.py`, AGENTS.md (Tasks 4, 5, 6, 7). §5 the collector, the SQL, the queries, the KPI, the dashboard lines (Tasks 8, 9, 10). §6 the export and backfill, the ordered deploy, the verification, GoatCounter's removal (Tasks 12, 13). §7 out of scope: nothing built for it.

**Placeholders.** The proxy depth and the cutover date are measured in Tasks 3 and 13 and written into the spec's "As built"; `2026-10-xx` in AGENTS.md (Task 7) is replaced with the real date at Task 13.

**Type consistency.** `createVisits` returns the shapes Task 9 consumes (`visits.current.visits`, `pages` rows with `engagedMedian`/`reached`, `referrers.{referrers,campaigns,paths}`, `events.{rows,homeVisitors}`, `audience.*`); `groupReferrers` takes `{ name, count }` rows (`referrers.mjs:52-58`); `hourlyRange`'s `start/end/prevStart/prevEnd` map to the SQL's `@start/@end/@prev_start/@prev_end`; the dashboard reads `refs.paths`, `pages.rows[].engagedMedian`, `audience.themes` as Task 9 emits them.

**Review Focus.** (1) the `COALESCE(visit, id)` in every SQL and the Task 8 collector test's "row without a visit still counts" (the fixture rows carry no visit at all, so counts come through regardless). (2) Task 8's history test merges `2026-10-14` from both sources into 6. (3) Task 5 step 3's stale-hash proof; the 404 page carries both tags as every page does. (4) Task 7's `firebase.test.mjs`. (5) Task 9's referrers test with `google.com` as a bare host through `groupReferrers`.
