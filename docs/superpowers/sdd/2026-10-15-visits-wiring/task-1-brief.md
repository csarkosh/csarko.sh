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
  # Only the two the admin module does not already own; run, secretmanager, artifactregistry
  # and cloudbuild are enabled there, and one project service must have one owner.
  for_each           = toset(["logging.googleapis.com", "bigquery.googleapis.com"])
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
Expected: a plan that adds only this module's resources (apis ×2, SA, secret, secret IAM, service, invoker, bucket, sink, exclusion, linked dataset, dataset, table, reader ×2, dataset IAM ×2 = more than 14; read the number the plan prints and confirm every added resource is in this module and nothing is changed or destroyed outside it).

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

