# The admin API: the Cloud Run service behind https://admin.csarko.sh that
# collects the site's numbers (lib-visits in BigQuery, Search Console, YouTube, GitHub,
# Hacker News, PageSpeed Insights, Hosting) for the dashboard, the secrets it
# reads them with, the Firestore database it keeps its daily snapshots in, and
# the Cloud Scheduler job that takes them. Design: docs/superpowers/specs/
# 2026-10-12-admin-dashboard-design.md, Part 2 (approved 2026-10-12).
#
# Everything here sits inside the free tiers at one reader: Cloud Run's two
# million requests a month, Secret Manager's six active versions (the four
# secrets below and gcp-visits' one), Firestore's free (default) database, and three Scheduler
# jobs. The budget at the end is the alarm if that ever stops being true.

terraform {
  required_providers {
    google = {
      source = "hashicorp/google"
      # google.billing: the budget's own provider, which names a project to
      # bill the call to (the root's main.tf says why).
      configuration_aliases = [google.billing]
    }
    google-beta = {
      source = "hashicorp/google-beta"
    }
  }
}

# ---- the APIs -------------------------------------------------------------------

# cloudbuild and artifactregistry are for `gcloud run deploy --source`, which
# builds the image with Cloud Build and keeps it in Artifact Registry; iam for
# the service accounts; youtube and pagespeedonline are the two Google APIs the
# collectors call with a key. firebasehosting (the last-deploy check) and
# searchconsole are already on. Never disabled on destroy: a disabled API
# takes every resource behind it with it.
resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "cloudscheduler.googleapis.com",
    "firestore.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "iam.googleapis.com",
    "youtube.googleapis.com",
    "pagespeedonline.googleapis.com",
  ])

  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

# ---- identities -------------------------------------------------------------------

# Its own identity rather than the default compute service account, which
# carries project-wide editor. Three permissions, all read or write of its own
# data: the Firestore snapshots, the four secrets (each granted on the secret
# itself, below, not project-wide), and the public site's Hosting releases for
# the "last deploy" check.
resource "google_service_account" "admin" {
  project      = var.project_id
  account_id   = "csarko-admin"
  display_name = "csarko.sh admin API"

  depends_on = [google_project_service.apis["iam.googleapis.com"]]
}

resource "google_project_iam_member" "admin" {
  for_each = toset([
    "roles/datastore.user",
    "roles/firebasehosting.viewer",
  ])

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.admin.email}"
}

# The snapshot job's identity. It holds no role at all: the service is public
# (allUsers may invoke it), so the OIDC token Scheduler signs with this account
# is not for Cloud Run's IAM but for the handler, which accepts a snapshot
# request only when the token's email is this one (SNAPSHOT_INVOKER below).
resource "google_service_account" "scheduler" {
  project      = var.project_id
  account_id   = "csarko-admin-scheduler"
  display_name = "csarko.sh admin snapshot scheduler"

  depends_on = [google_project_service.apis["iam.googleapis.com"]]
}

# ---- the secrets ------------------------------------------------------------------

# Containers only. A value is added as a version by hand:
#
#   gcloud secrets versions add admin-token --project=csarko-sh --data-file=-
#
# so the values never enter Terraform's config, plan or state. Cloud Run reads
# `latest`, so a rotation is a new version plus a redeploy. Automatic
# replication: Google picks the regions, which is the free option and the only
# one that needs no decision.
resource "google_secret_manager_secret" "this" {
  for_each = var.secret_ids

  project   = var.project_id
  secret_id = each.key

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis["secretmanager.googleapis.com"]]
}

resource "google_secret_manager_secret_iam_member" "admin_reads" {
  for_each = var.secret_ids

  project   = var.project_id
  secret_id = google_secret_manager_secret.this[each.key].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.admin.email}"
}

# ---- the snapshots ------------------------------------------------------------------

# The project's default database, which is the one the free quota applies to
# ("exactly one free database per project", and no free quota for a named
# one). It holds one small document a day plus the hand-entered counts, so it
# never leaves that quota. The region is the service's own: the free quota is
# the same in every location, a single region is priced below the nam5
# multi-region past it, and the reads stay in one region. Cyrus's dashboard
# is the only client, so multi-region durability buys nothing here.
resource "google_firestore_database" "snapshots" {
  project     = var.project_id
  name        = "(default)"
  location_id = var.region
  type        = "FIRESTORE_NATIVE"

  # Snapshots are re-derivable (every collector can be run again for a range)
  # but the manual series are not, so the database refuses to be destroyed.
  delete_protection_state = "DELETE_PROTECTION_ENABLED"
  deletion_policy         = "ABANDON"

  depends_on = [google_project_service.apis["firestore.googleapis.com"]]
}

# ---- the images ------------------------------------------------------------------

# `gcloud run deploy --source` pushes to a repository of exactly this name in
# the service's region, and creates it without any policy if it is missing.
# Declaring it here instead gives it the cleanup policies: a build is a few
# MB on top of a shared base layer and the free tier is 500 MB, so this is
# tidiness, not the bill. KEEP beats DELETE, so the five newest images are
# never collected: redeploying an older one is the rollback path.
resource "google_artifact_registry_repository" "source_deploy" {
  project       = var.project_id
  location      = var.region
  repository_id = "cloud-run-source-deploy"
  format        = "DOCKER"
  description   = "Images `gcloud run deploy --source` builds for the admin API."

  cleanup_policies {
    id     = "keep-recent"
    action = "KEEP"

    most_recent_versions {
      keep_count = 5
    }
  }

  cleanup_policies {
    id     = "delete-untagged"
    action = "DELETE"

    condition {
      tag_state  = "UNTAGGED"
      older_than = "604800s" # 7 days
    }
  }

  cleanup_policies {
    id     = "delete-old"
    action = "DELETE"

    condition {
      older_than = "2592000s" # 30 days
    }
  }

  depends_on = [google_project_service.apis["artifactregistry.googleapis.com"]]
}

# ---- the service ------------------------------------------------------------------

resource "google_cloud_run_v2_service" "admin" {
  project  = var.project_id
  location = var.region
  name     = "csarko-admin"

  deletion_protection = false
  ingress             = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.admin.email

    scaling {
      min_instance_count = 0
      # A cost ceiling: one instance serves one reader, and two bound what a
      # flood of guesses at the token could ever bill.
      max_instance_count = 2
    }

    # The slowest request is a collector's fan-out to a few third-party APIs,
    # or the snapshot running them all; both finish well inside a minute.
    timeout = "60s"

    max_instance_request_concurrency = 80

    containers {
      image = var.image

      ports {
        container_port = 8080
      }

      # CPU only while a request is in flight (request-based billing), which is
      # the shape the free tier counts in and the only one Cloud Run accepts
      # under 512Mi: "always allocated" CPU needs 512Mi and bills idle time.
      resources {
        cpu_idle = true
        limits = {
          cpu    = "1"
          memory = "256Mi"
        }
      }

      # The secrets, read at `latest` so a rotation is a new version and a
      # redeploy. Cloud Run refuses a revision whose secret has no version,
      # so on the very first apply the versions are added between the
      # secrets' creation and the service's: a targeted apply of the secrets,
      # the four `gcloud secrets versions add` commands, then the full apply
      # (AGENTS.md, "Infrastructure").
      dynamic "env" {
        for_each = var.secret_ids
        content {
          name = env.value
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.this[env.key].secret_id
              version = "latest"
            }
          }
        }
      }

      # The visits rows (the collector's linked dataset), GoatCounter's
      # backfilled hours, and the instant the dashboard switches from the
      # second to the first.
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

      env {
        name  = "GSC_PROPERTY"
        value = var.gsc_property
      }

      env {
        name  = "SITE_URL"
        value = var.site_url
      }

      env {
        name  = "SITEMAP_URL"
        value = var.sitemap_url
      }

      env {
        name  = "YOUTUBE_HANDLE"
        value = var.youtube_handle
      }

      # Every public repository of the account, found by listing it (Cyrus,
      # 2026-10-13); the public listing can only name public ones, so a
      # private repo's traffic stays nobody's business (2026-10-12).
      env {
        name  = "GITHUB_OWNER"
        value = var.github_owner
      }

      env {
        name  = "HOSTING_SITE"
        value = var.hosting_site_id
      }

      env {
        name  = "ALLOWED_ORIGINS"
        value = join(",", var.allowed_origins)
      }

      # The one identity whose OIDC token may trigger a snapshot.
      env {
        name  = "SNAPSHOT_INVOKER"
        value = google_service_account.scheduler.email
      }

      # The admin routes' readers, and the Firebase project whose ID tokens
      # prove them (admin/api/src/auth.mjs). No readers, no admin routes.
      env {
        name  = "ADMIN_EMAILS"
        value = join(",", var.admin_emails)
      }

      env {
        name  = "FIREBASE_PROJECT"
        value = var.project_id
      }

      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = var.project_id
      }
    }
  }

  lifecycle {
    # Terraform owns the shape of this service; `gcloud run deploy --source
    # admin/api` owns the image. The service is created with Google's hello
    # image so the first apply has something to run before any image of ours
    # exists, and from then on every deploy replaces it; without this, every
    # apply would put the hello image back and roll the API off the air.
    #
    # `scaling` is the service-level block (not template.scaling, which holds
    # the instance counts); the API reports it with zeroed fields the config
    # never declares. `client` and `client_version` are stamped by whichever
    # tool last deployed, which is gcloud, deliberately. `deletion_protection`
    # is turned on by `gcloud run deploy` and off here; left to Terraform the
    # two would flip it on every apply and deploy, so the live value wins.
    # `build_config` is the build ID and source upload that `--source`
    # stamps on the service at every deploy.
    # The sibling repo (game-dayhike) found each of these the hard way.
    ignore_changes = [
      template[0].containers[0].image,
      build_config,
      scaling,
      client,
      client_version,
      deletion_protection,
    ]
  }

  depends_on = [
    google_project_service.apis["run.googleapis.com"],
    google_secret_manager_secret_iam_member.admin_reads,
    google_project_iam_member.admin,
  ]
}

# Public: the handler checks the bearer token itself (constant time, against
# ADMIN_TOKEN), and answers 401 to everyone else. Cloud Run IAM would need the
# browser to hold a Google identity, which is the sign-in the design dropped.
resource "google_cloud_run_v2_service_iam_member" "public" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.admin.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# ---- the daily snapshot ------------------------------------------------------------

# Cloud Scheduler signs the job's OIDC token through its own service agent,
# which the API's enablement creates lazily; asking for it here, and making
# the job wait for it, keeps the first apply from racing it. Cloud Scheduler
# no longer needs an App Engine app in the project (the requirement was
# dropped; its docs do not mention App Engine any more), and this project has
# none, so nothing here creates one.
resource "google_project_service_identity" "scheduler" {
  provider = google-beta

  project = var.project_id
  service = "cloudscheduler.googleapis.com"

  depends_on = [google_project_service.apis["cloudscheduler.googleapis.com"]]
}

# 06:00 New York, every day: after midnight Pacific, when Search Console's
# previous day is complete, and before Cyrus looks.
resource "google_cloud_scheduler_job" "snapshot" {
  project     = var.project_id
  region      = var.region
  name        = "csarko-admin-snapshot"
  description = "Runs every collector once and writes the day's snapshot to Firestore."
  schedule    = var.snapshot_schedule
  time_zone   = var.snapshot_time_zone

  # Longer than the service's own timeout, so a slow snapshot fails on its
  # own terms rather than Scheduler's; one retry covers a cold-start hiccup
  # without re-running a snapshot that is already stored for the day.
  attempt_deadline = "120s"

  retry_config {
    retry_count = 1
  }

  http_target {
    http_method = "POST"
    uri         = "${google_cloud_run_v2_service.admin.uri}/admin/snapshot"

    oidc_token {
      service_account_email = google_service_account.scheduler.email
      audience              = google_cloud_run_v2_service.admin.uri
    }
  }

  depends_on = [google_project_service_identity.scheduler]
}

# ---- the budget ------------------------------------------------------------------

# An alert, not a limit, as the sibling repo's: a budget emails the billing
# account's administrators as spending crosses each threshold and stops
# nothing. The stops are the instance ceiling and the handler's rate limit.
#
# Off unless billing_account_id is set. Unfiltered, so it covers the whole
# project: Hosting for both sites, Cloud Run, Firestore, Secret Manager and
# Scheduler all have free tiers an ordinary month never leaves, so a $5 alert
# means a spike or a leak worth looking at, whichever service it came from.

resource "google_project_service" "billingbudgets" {
  count = var.billing_account_id != "" ? 1 : 0

  project            = var.project_id
  service            = "billingbudgets.googleapis.com"
  disable_on_destroy = false
}

data "google_project" "this" {
  count      = var.billing_account_id != "" ? 1 : 0
  project_id = var.project_id
}

resource "google_billing_budget" "project" {
  count    = var.billing_account_id != "" ? 1 : 0
  provider = google.billing

  billing_account = var.billing_account_id
  display_name    = "csarko-sh"

  budget_filter {
    projects        = ["projects/${data.google_project.this[0].number}"]
    calendar_period = "MONTH"
  }

  amount {
    specified_amount {
      currency_code = "USD"
      units         = tostring(var.monthly_budget_usd)
    }
  }

  threshold_rules {
    threshold_percent = 0.5
  }

  threshold_rules {
    threshold_percent = 1.0
  }

  threshold_rules {
    threshold_percent = 1.0
    spend_basis       = "FORECASTED_SPEND"
  }

  depends_on = [google_project_service.billingbudgets]
}
