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
