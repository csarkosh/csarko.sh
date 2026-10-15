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
    gsc-sa-key   = "GSC_SA_KEY"
    youtube-key  = "YOUTUBE_KEY"
    github-token = "GITHUB_TOKEN"
    psi-key      = "PSI_KEY"
  }
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
