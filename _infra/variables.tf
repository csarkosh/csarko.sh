variable "aws_region" {
  description = "AWS region for the Route53 provider. Route53 is global; this only anchors the provider."
  type        = string
  default     = "us-east-1"
}

variable "gcp_project_id" {
  description = "GCP project that holds Firebase Hosting and the Terraform state bucket."
  type        = string
}

variable "gcp_region" {
  description = "Default GCP region for the providers."
  type        = string
  default     = "us-west1"
}

variable "domain_name" {
  description = "Public hostname for the site. The zone apex."
  type        = string
  default     = "csarko.sh"
}

variable "redirect_domain_names" {
  description = "Hostnames that 301-redirect to domain_name. Each gets a Firebase redirect domain and a CNAME."
  type        = list(string)
  default     = ["www.csarko.sh"]
}

variable "dns_zone_name" {
  description = "Route53 hosted zone that contains domain_name. Trailing dot optional."
  type        = string
  default     = "csarko.sh"
}

variable "hosting_site_id" {
  description = "Firebase Hosting site id. Globally unique across all of Firebase."
  type        = string
  default     = "csarko-sh"
}

variable "firebase_hosting_ips" {
  description = <<-EOT
    A record values Firebase Hosting wants for an apex custom domain. Confirmed
    against the custom domain's live required_dns_updates on 2026-09-11 rather
    than remembered. That output empties once the domain reconciles, so it
    can't be the steady-state source — this variable is. If Firebase ever
    changes the address, `terraform output hosting_required_dns_updates` will
    show the new one while the domain is unhealthy.
  EOT
  type        = list(string)
  default     = ["199.36.158.100"]
}

variable "apps_domain_name" {
  description = "Hostname of the apps site: each released app's page (apps.csarko.sh/<slug>), with / redirecting to https://csarko.sh/apps."
  type        = string
  default     = "apps.csarko.sh"
}

variable "apps_hosting_site_id" {
  description = "Firebase Hosting site id of the apps site. Globally unique across all of Firebase."
  type        = string
  default     = "csarko-sh-apps"
}

variable "donate_domain_name" {
  description = "Hostname of the donate site (Buy Me Tokens), a static page whose prices the admin API publishes to a public bucket."
  type        = string
  default     = "donate.csarko.sh"
}

variable "donate_hosting_site_id" {
  description = "Firebase Hosting site id of the donate site. Globally unique across all of Firebase."
  type        = string
  default     = "csarko-sh-donate"
}

variable "admin_domain_name" {
  description = "Hostname of the admin dashboard. A subdomain of domain_name, so it CNAMEs to its site's web.app host."
  type        = string
  default     = "admin.csarko.sh"
}

variable "admin_hosting_site_id" {
  description = "Firebase Hosting site id of the admin dashboard. Globally unique across all of Firebase."
  type        = string
  default     = "csarko-sh-admin"
}

variable "visits_ignore_ips" {
  description = <<-EOT
    Cyrus's own addresses (plain or CIDR, v4 and v6), whose beacons the collector drops so
    the dashboard never counts him. Set in the git-ignored terraform.tfvars, never here:
    the repo is public. Check the current ones with `curl -4 https://api.ipify.org` and
    `curl -6 https://api64.ipify.org` (the v6 one as its /64).
  EOT
  type        = list(string)
  default     = []
  sensitive   = true
}

variable "visits_history_until" {
  description = <<-EOT
    Where the admin dashboard stops reading GoatCounter's backfilled history and
    starts reading lib-visits: the next whole UTC hour after the site deploy that
    switched the scripts, RFC 3339 (e.g. "2026-10-15T18:00:00Z"). Ceiling to the
    hour keeps GoatCounter's last partial hour. No default, so no apply can run
    before it is set, and setting it comes after the GoatCounter export (an apply
    destroys the goatcounter-token secret the export reads).
  EOT
  type        = string

  # A malformed instant would parse to NaN in the admin API and drop the history
  # from every chart without an error.
  validation {
    condition     = can(regex("^\\d{4}-\\d{2}-\\d{2}T\\d{2}:00:00Z$", var.visits_history_until))
    error_message = "visits_history_until must be a whole UTC hour in RFC 3339, e.g. 2026-10-15T18:00:00Z."
  }
}

variable "youtube_handle" {
  description = "YouTube channel handle the dashboard reports on, without the @."
  type        = string
  default     = "csarkosh"
}

variable "github_owner" {
  description = <<-EOT
    The GitHub account whose public repositories the dashboard reports stars
    and traffic for: every one of them, forks left out, found by listing the
    account (Cyrus, 2026-10-13; the listing can only ever name public ones,
    so never a private one, as he asked on 2026-10-12).
  EOT
  type        = string
  default     = "csarkosh"
}

variable "billing_account_id" {
  description = <<-EOT
    Billing account to create the project's monthly budget alert under, as
    XXXXXX-XXXXXX-XXXXXX. Empty (the default) creates no budget. Set it only
    in the git-ignored terraform.tfvars.
  EOT
  type        = string
  default     = ""
}

variable "monthly_budget_usd" {
  description = <<-EOT
    Monthly amount the project budget alerts against, in whole US dollars. An
    ordinary month of both Hosting sites and the admin API is within every
    free tier, so the first alert, at half of this, means a spike or a leak.
  EOT
  type        = number
  default     = 5
}

variable "admin_emails" {
  description = <<-EOT
    The Google accounts that may read admin.csarko.sh, as addresses. Every
    app's admin API checks the signed-in account against this list. Set in
    the git-ignored terraform.tfvars; an empty list serves no admin routes.
  EOT
  type        = list(string)
  default     = []
}

variable "mail_region" {
  description = "Where SES receives the domain's mail (an SES receiving region)."
  type        = string
  default     = "us-east-2"
}

variable "mail_owner_address" {
  description = "Where every alias at the domain forwards, and the only sender allowed to reply through a reverse alias. Set in the git-ignored terraform.tfvars; never committed."
  type        = string
  sensitive   = true
}

variable "mail_retention_days" {
  description = "Days a received or sent message is kept."
  type        = number
  default     = 365
}

variable "mail_protected_aliases" {
  description = "Local parts that can never be blocked, besides postmaster, abuse and dmarc."
  type        = list(string)
  default     = []
}

variable "mail_trial_subdomain" {
  description = "A subdomain whose MX points at SES during the trial (\"test\" is test.csarko.sh). Empty after the cutover."
  type        = string
  default     = "test"
}

variable "mail_manage_apex_mx" {
  description = "Point the apex MX at SES (the cutover). False until the trial passes."
  type        = bool
  default     = false
}

variable "mail_apex_mx_rollback" {
  description = "With mail_manage_apex_mx, point the apex MX back at Google Workspace's hosts."
  type        = bool
  default     = false
}

variable "mail_cutover_complete" {
  description = "True once the Workspace subscription is cancelled: SPF drops Google and DMARC moves to p=quarantine."
  type        = bool
  default     = false
}
