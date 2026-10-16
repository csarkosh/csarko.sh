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
  project  = var.project_id
  location = var.region
  name     = "csarko-visits"
  # Reachable at its run.app URL as well as through the Hosting rewrite (a rewrite needs
  # "all" ingress). A direct caller can forge X-Forwarded-For at the depth the service
  # trusts; that shapes only the daily visit hash and the courtesy rate limit, never a
  # row's content, so it is accepted rather than fronted with a load balancer.
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = false

  template {
    service_account                  = google_service_account.visits.email
    timeout                          = "10s"
    max_instance_request_concurrency = 200
    scaling {
      min_instance_count = 0
      max_instance_count = 3
    }
    containers {
      image = var.image
      args  = concat(["serve", "--trusted-proxies", tostring(var.trusted_proxies)], length(var.ignore_ips) > 0 ? ["--ignore-ips", join(",", var.ignore_ips)] : [], flatten([for a in var.apps : ["--app", a]]))
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
    # visits/deploy.sh owns the image and, through `gcloud run deploy
    # --source`, stamps `build_config`, `client` and `client_version`;
    # `scaling` is the service-level block the API reports with zeroed fields
    # (template.scaling holds the instance counts). Same reasons as the admin
    # API's service.
    ignore_changes = [
      template[0].containers[0].image,
      build_config,
      scaling,
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
  filter      = "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${google_cloud_run_v2_service.visits.name}\" AND (jsonPayload.v=1 OR jsonPayload.v=2)"
}

# The rows need not also sit in _Default, and the service's successful request
# entries say nothing a row does not.
resource "google_logging_project_exclusion" "visits_duplicates" {
  project     = var.project_id
  name        = "csarko-visits-duplicates"
  description = "Visits rows live in their own bucket; successful beacon requests are counted there."
  filter      = <<-EOT
    resource.type="cloud_run_revision" AND resource.labels.service_name="${google_cloud_run_v2_service.visits.name}" AND (
      jsonPayload.v=1 OR jsonPayload.v=2 OR (
        logName="projects/${var.project_id}/logs/run.googleapis.com%2Frequests"
        AND httpRequest.status<400
      )
    )
  EOT
}

resource "google_logging_linked_dataset" "visits" {
  parent      = "projects/${var.project_id}"
  location    = "global"
  link_id     = var.dataset
  bucket      = google_logging_project_bucket_config.visits.id
  description = "csarko.sh visits, as a dataset."
}

# GoatCounter's history: a linked dataset is read-only, so the backfill goes
# into a plain dataset beside it. One table, hourly counts per path and referrer.
resource "google_bigquery_dataset" "history" {
  project     = var.project_id
  dataset_id  = var.history_dataset
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
