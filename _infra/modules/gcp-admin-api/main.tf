# The admin API: the Cloud Run service behind https://admin.csarko.sh that
# collects the site's numbers (lib-visits in BigQuery, Search Console, YouTube, GitHub,
# Hacker News, PageSpeed Insights, Hosting) for the dashboard, the secrets it
# reads them with, the Firestore database it keeps its daily snapshots in, and
# the Cloud Scheduler job that takes them. Design: docs/superpowers/specs/
# 2026-10-12-admin-dashboard-design.md, Part 2 (approved 2026-10-12).
#
# The Finance page (spec 2026-10-29-finance-admin-page-design.md, sections 6 and
# 11) adds the Modal job: a Cloud Run job, csarko-finance-modal
# (admin/finance-modal), run by a second Scheduler job ten minutes before the
# snapshot, with its two secrets; the fal and Stripe secrets the service reads; and the film
# ledgers bucket the service lists.
#
# Everything here sits inside the free tiers at one reader: Cloud Run's two
# million requests a month and the job's one short run a day, Firestore's free
# (default) database, the two Scheduler jobs of three free, and the bucket's
# few KB. Secret Manager is the one that steps past its free tier: six free
# active versions, and the seven secrets below plus gcp-visits' one carry eight
# or more (the three seeded ones hold two each until the `unset` version is
# disabled), at $0.06 a version-month past six. The budget at the end is the
# alarm if that ever stops being a few cents.

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
# carries project-wide editor. Every permission is read or write of its own
# data: the Firestore snapshots, the secrets (each granted on the secret
# itself, below, not project-wide), the public site's Hosting releases for
# the "last deploy" check, the billing export dataset and the film ledgers
# bucket. The Modal job runs as this account too: it writes one path of the
# same snapshot document and reads two of the same secrets, so a second
# account would hold the same two roles.
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

# ---- the billing export (the Finance page) -------------------------------------------

# Cloud Billing's standard usage cost export, which Google writes into this
# dataset as the table gcp_billing_export_v1_<billing account id with
# underscores> (BILLING_TABLE below). Design: docs/superpowers/specs/
# 2026-10-29-finance-admin-page-design.md, section 6.
#
# Created by hand on 2026-10-29, because the export had to be switched on in the
# console that day and wants its dataset first:
#
#   bq mk --dataset --location=US \
#     --description "Cloud Billing standard usage cost export (enabled 2026-10-29)" \
#     csarko-sh:billing
#
# then imported into this state (`terraform import
# module.gcp_admin_api.google_bigquery_dataset.billing projects/csarko-sh/datasets/billing`)
# rather than recreated. The export setting itself has no Terraform resource and
# stays console-only (Billing > Billing export). The table is Google's: Terraform
# never declares it, and the dataset refuses to take it along on a destroy.
# The BigQuery API is enabled by gcp-visits, which waits on this whole module,
# so this resource cannot depend on it; the dataset exists, so the API is on.
resource "google_bigquery_dataset" "billing" {
  project     = var.project_id
  dataset_id  = "billing"
  location    = "US"
  description = "Cloud Billing standard usage cost export (enabled 2026-10-29)"

  delete_contents_on_destroy = false
}

# Read-only on this one dataset. The project-wide roles/bigquery.jobUser the
# queries also need is already granted in gcp-visits (its `reader` binding, for
# the visits queries), so it is not repeated here: one binding, one owner.
resource "google_bigquery_dataset_iam_member" "admin_reads_billing" {
  project    = var.project_id
  dataset_id = google_bigquery_dataset.billing.dataset_id
  role       = "roles/bigquery.dataViewer"
  member     = "serviceAccount:${google_service_account.admin.email}"
}

# The snapshot job's identity. For the snapshot it holds no role: the service
# is public (allUsers may invoke it), so the OIDC token Scheduler signs with
# this account is not for Cloud Run's IAM but for the handler, which accepts a
# snapshot request only when the token's email is this one (SNAPSHOT_INVOKER
# below). Its one role is run.invoker on the Modal job (below), which it
# starts through the Cloud Run Jobs API with an OAuth token.
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
#
# The service's secrets (var.secret_ids) and the Modal job's (var.job_secret_ids)
# are one set here: the same containers, the same reader.
locals {
  all_secret_ids = merge(var.secret_ids, var.job_secret_ids)
}

resource "google_secret_manager_secret" "this" {
  for_each = local.all_secret_ids

  project   = var.project_id
  secret_id = each.key

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis["secretmanager.googleapis.com"]]
}

resource "google_secret_manager_secret_iam_member" "admin_reads" {
  for_each = local.all_secret_ids

  project   = var.project_id
  secret_id = google_secret_manager_secret.this[each.key].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.admin.email}"
}

# The Finance page's secrets (2026-10-30) are seeded with the literal `unset`,
# so the service and the job can be created in the same apply as the secrets
# (Cloud Run refuses a revision whose secret has no version) and the page says
# "Not configured" until a real value is added by hand, as a new version. The
# four original secrets predate this and have hand-added versions only. After
# the real version exists, `gcloud secrets versions disable 1 --secret=<id>`
# stops the seed counting as an active version; `enabled` is ignored here so
# that is not drift.
resource "google_secret_manager_secret_version" "seed" {
  for_each = var.seeded_secret_ids

  secret      = google_secret_manager_secret.this[each.key].id
  secret_data = "unset"

  lifecycle {
    ignore_changes = [enabled]
  }
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

      # The Finance page (spec 2026-10-29-finance-admin-page-design.md): where
      # the billing export lands, and the AWS role the costs collector assumes.
      # BILLING_TABLE is empty until billing_account_id is set, so the API can
      # say the export is not configured instead of querying a table that is
      # not there.
      env {
        name  = "BILLING_DATASET"
        value = google_bigquery_dataset.billing.dataset_id
      }
      env {
        name  = "BILLING_TABLE"
        value = var.billing_account_id != "" ? "gcp_billing_export_v1_${replace(var.billing_account_id, "-", "_")}" : ""
      }

      # No AWS key anywhere: the service asks the metadata server for a Google
      # ID token for its own service account with AWS_COST_AUDIENCE as the
      # audience and trades it to STS (AssumeRoleWithWebIdentity) for an hour of
      # the role, whose trust policy names exactly that audience and this
      # account's unique id (modules/aws-costs).
      env {
        name  = "AWS_COST_ROLE_ARN"
        value = var.aws_cost_role_arn
      }
      env {
        name  = "AWS_COST_AUDIENCE"
        value = var.aws_cost_audience
      }

      # The film ledgers (spec section 11): the private bucket the pipeline syncs
      # <film>/ledger.json into, read here with objectViewer (below).
      env {
        name  = "FILM_LEDGERS_BUCKET"
        value = google_storage_bucket.film_ledgers.name
      }

      # The Modal part is the job's, not the service's: this says the job exists,
      # so the API reports Modal from the snapshot instead of "not configured"
      # (whether the token itself is set, the job says in the snapshot).
      env {
        name  = "MODAL_CONFIGURED"
        value = "1"
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
    google_secret_manager_secret_version.seed,
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

# ---- the Modal job (the Finance page) -----------------------------------------------

# Modal has no REST billing endpoint; its workspace billing report is in its
# Python SDK only. So the Finance page's Modal part comes from a Cloud Run
# *job* in Python (admin/finance-modal), run once a day, which writes the
# report for the last 60 days and 13 months into the day's snapshot document
# at the one path `finance.modal` and nothing else. It runs as the service's
# own account (the Firestore role and the secrets' reader, above). The two
# Modal secrets reach it as environment; everything else is the project and
# the plan's included credits.
resource "google_cloud_run_v2_job" "finance_modal" {
  project  = var.project_id
  location = var.region
  name     = "csarko-finance-modal"

  deletion_protection = false

  template {
    task_count = 1

    template {
      service_account = google_service_account.admin.email

      # Thirteen monthly report calls, paced for Modal's rate limit, and one
      # Firestore write: a minute or two. Ten minutes is the ceiling, and one
      # retry covers a cold start or a rate-limit day.
      timeout     = "600s"
      max_retries = 1

      containers {
        image = var.job_image

        resources {
          limits = {
            cpu    = "1"
            memory = "512Mi"
          }
        }

        dynamic "env" {
          for_each = var.job_secret_ids
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

        env {
          name  = "GOOGLE_CLOUD_PROJECT"
          value = var.project_id
        }

        # Written into the snapshot as `credits`: the plan's included monthly
        # credits, which the API subtracts from the gross to get what is charged.
        env {
          name  = "MODAL_CREDITS_USD"
          value = tostring(var.modal_credits_usd)
        }
      }
    }
  }

  lifecycle {
    # As the service: Terraform owns the shape, `gcloud run jobs deploy --source
    # admin/finance-modal` owns the image. Created with Google's sample job
    # image so the first apply has something to run; `client`,
    # `client_version` and `deletion_protection` are stamped by gcloud at each
    # deploy, as on the service.
    ignore_changes = [
      template[0].template[0].containers[0].image,
      client,
      client_version,
      deletion_protection,
    ]
  }

  depends_on = [
    google_project_service.apis["run.googleapis.com"],
    google_secret_manager_secret_iam_member.admin_reads,
    google_secret_manager_secret_version.seed,
    google_project_iam_member.admin,
  ]
}

# Scheduler starts the job through the Cloud Run Jobs API, so here the token is
# OAuth (a Google API wants an access token, not an ID token) and Cloud Run's
# IAM does the checking: the scheduler account needs run.invoker on this job.
resource "google_cloud_run_v2_job_iam_member" "scheduler_runs_finance_modal" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_job.finance_modal.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.scheduler.email}"
}

# 05:50 New York, ten minutes before the snapshot, so the API's run reads a
# fresh Modal part from the day's document rather than yesterday's.
resource "google_cloud_scheduler_job" "finance_modal" {
  project     = var.project_id
  region      = var.region
  name        = "csarko-finance-modal"
  description = "Starts the Modal billing job, which writes finance.modal into the day's snapshot."
  schedule    = var.finance_modal_schedule
  time_zone   = var.snapshot_time_zone

  # The run call returns at once with an operation; the job's own timeout
  # bounds the work. One retry covers a transient refusal from the API.
  attempt_deadline = "60s"

  retry_config {
    retry_count = 1
  }

  http_target {
    http_method = "POST"
    uri         = "https://run.googleapis.com/v2/projects/${var.project_id}/locations/${var.region}/jobs/${google_cloud_run_v2_job.finance_modal.name}:run"

    oauth_token {
      service_account_email = google_service_account.scheduler.email
    }
  }

  depends_on = [
    google_project_service_identity.scheduler,
    google_cloud_run_v2_job_iam_member.scheduler_runs_finance_modal,
  ]
}

# ---- the film ledgers (the Finance page) --------------------------------------------

# The film pipeline (~/Projects/film-generation, on the external SSD) prices
# every paid call before it is made and writes it to the film's ledger; its
# `tools/cinema/ledger-sync.sh` copies the ledgers alone into this bucket, and
# the Finance page's Films card reads them. The layout is one object a film:
#
#   gs://csarko-sh-film-ledgers/<film>/ledger.json
#
# Private in every way a bucket can be: uniform bucket-level access (no object
# ACLs), public access prevention enforced, and the only reader beyond the
# project's owner is the admin service account (below). Versioned, because a
# sync is an overwrite and a ledger is the only record of what a film cost;
# the noncurrent versions are capped so a daily sync of eight ledgers never
# grows past a few hundred small objects. Same region as everything else.
resource "google_storage_bucket" "film_ledgers" {
  project  = var.project_id
  name     = var.film_ledgers_bucket
  location = var.region

  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false

  versioning {
    enabled = true
  }

  lifecycle_rule {
    action {
      type = "Delete"
    }
    condition {
      num_newer_versions = 30
      with_state         = "ARCHIVED"
    }
  }
}

resource "google_storage_bucket_iam_member" "admin_reads_ledgers" {
  bucket = google_storage_bucket.film_ledgers.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.admin.email}"
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
