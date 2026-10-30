variable "project_id" {
  description = "GCP project ID."
  type        = string
}

variable "region" {
  description = "Region for the Cloud Run service, the Cloud Scheduler job, the source-deploy image repository and the Firestore database."
  type        = string
}

variable "image" {
  description = "Container image to create the service with. `gcloud run deploy --source` owns it afterwards."
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "site_url" {
  description = "Public URL of the site the dashboard measures, no trailing slash."
  type        = string
}

variable "sitemap_url" {
  description = "The site's sitemap, for the pages and indexing queries."
  type        = string
}

variable "hosting_site_id" {
  description = "Firebase Hosting site id of the public site, for the last-deploy check."
  type        = string
}

variable "visits_dataset" {
  description = "BigQuery dataset linked to the csarko-visits log bucket (the collector's rows)."
  type        = string
}

variable "visits_history_dataset" {
  description = "BigQuery dataset holding goatcounter_history, GoatCounter's backfilled hourly counts."
  type        = string
}

variable "visits_history_until" {
  description = "The cutover instant, RFC 3339 on a whole UTC hour (e.g. 2026-10-15T18:00:00Z): history answers before it, the collector's rows from it on."
  type        = string
}

variable "gsc_property" {
  description = "Search Console property, e.g. sc-domain:csarko.sh."
  type        = string
}

variable "youtube_handle" {
  description = "YouTube channel handle without the @."
  type        = string
}

variable "github_owner" {
  description = "The GitHub account whose public repositories are reported (every one, forks left out; listing an account can only name public ones)."
  type        = string
}

variable "allowed_origins" {
  description = "Origins the API answers CORS requests from: the admin site and the local preview."
  type        = list(string)
}

variable "secret_ids" {
  description = <<-EOT
    Secret Manager secret id to the environment variable it is served as. The
    secrets are created empty; a version is added by hand with
    `gcloud secrets versions add`, so no value ever passes through Terraform.
  EOT
  type        = map(string)
  default = {
    gsc-sa-key    = "GSC_SA_KEY"
    youtube-key   = "YOUTUBE_KEY"
    github-token  = "GITHUB_TOKEN"
    psi-key       = "PSI_KEY"
    fal-admin-key = "FAL_ADMIN_KEY"
    stripe-key    = "STRIPE_KEY"
  }
}

variable "job_secret_ids" {
  description = <<-EOT
    The Modal job's secrets, secret id to environment variable, created and
    granted like secret_ids but mounted on the job alone. The names are the
    Modal client's own: it reads MODAL_TOKEN_ID and MODAL_TOKEN_SECRET itself.
  EOT
  type        = map(string)
  default = {
    modal-token-id     = "MODAL_TOKEN_ID"
    modal-token-secret = "MODAL_TOKEN_SECRET"
  }
}

variable "seeded_secret_ids" {
  description = <<-EOT
    The secrets (from secret_ids and job_secret_ids) created with a first version
    holding the literal `unset`, so Cloud Run accepts the service and the job in
    the same apply; the real value is added by hand as a new version. The four
    original secrets are not here: their versions were added by hand before
    the service existed.
  EOT
  type        = set(string)
  default     = ["fal-admin-key", "modal-token-id", "modal-token-secret", "stripe-key"]
}

variable "job_image" {
  description = "Container image to create the Modal job with. `gcloud run jobs deploy --source` owns it afterwards."
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/job:latest"
}

variable "modal_credits_usd" {
  description = "The Modal plan's included monthly credits, whole US dollars (MODAL_CREDITS_USD on the job; $30 on Starter)."
  type        = number
  default     = 30
}

variable "finance_modal_schedule" {
  description = "Cron schedule for the Modal billing job, in snapshot_time_zone. Before snapshot_schedule, so the snapshot reads a fresh part."
  type        = string
  default     = "50 5 * * *"
}

variable "film_ledgers_bucket" {
  description = "Name of the private GCS bucket the film pipeline syncs <film>/ledger.json into (FILM_LEDGERS_BUCKET on the service). Bucket names are global."
  type        = string
  default     = "csarko-sh-film-ledgers"
}

variable "snapshot_schedule" {
  description = "Cron schedule for the daily snapshot."
  type        = string
  default     = "0 6 * * *"
}

variable "snapshot_time_zone" {
  description = "Time zone the schedule is read in."
  type        = string
  default     = "America/New_York"
}

variable "billing_account_id" {
  description = "Billing account to create the monthly budget alert under, as XXXXXX-XXXXXX-XXXXXX. Empty creates no budget."
  type        = string
  default     = ""
}

variable "monthly_budget_usd" {
  description = "Monthly amount the project budget alerts against, in whole US dollars."
  type        = number
  default     = 5
}

variable "admin_emails" {
  description = "The accounts that may read the admin routes, as addresses. Empty serves no admin routes."
  type        = list(string)
  default     = []
}

variable "aws_cost_role_arn" {
  description = <<-EOT
    ARN of the AWS IAM role the costs collector assumes for Cost Explorer
    (modules/aws-costs, csarko-admin-costs). Empty serves the Finance page's
    AWS cards an "unconfigured" line instead of a role to assume.
  EOT
  type        = string
  default     = ""
}

variable "aws_cost_audience" {
  description = <<-EOT
    The audience the service puts in the Google ID token it mints for its own
    service account and presents to AWS STS; the role's trust policy accepts
    exactly this value (accounts.google.com:aud). Not a secret: the token's
    signature is the proof, the audience only scopes it to that one use.
  EOT
  type        = string
  default     = ""
}
