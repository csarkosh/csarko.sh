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

variable "goatcounter_site" {
  description = "GoatCounter site code; the same value as `code` in .agents/skills/site-quality/site.json."
  type        = string
  default     = "csarko"
}

variable "youtube_handle" {
  description = "YouTube channel handle the dashboard reports on, without the @."
  type        = string
  default     = "csarkosh"
}

variable "github_repos" {
  description = <<-EOT
    GitHub repositories the dashboard reports stars and traffic for, as
    owner/name. Public repos only (Cyrus, 2026-10-12): never a private one.
  EOT
  type        = list(string)
  default     = ["csarkosh/game-dayhike", "csarkosh/electron-gamepatch"]
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
