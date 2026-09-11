variable "project_id" {
  description = "GCP project ID."
  type        = string
}

variable "site_id" {
  description = "Firebase Hosting site id. Must be globally unique."
  type        = string
}

variable "domain_name" {
  description = "Custom domain to serve the site on."
  type        = string
}

variable "redirect_domain_names" {
  description = "Extra custom domains that 301-redirect to domain_name, e.g. [\"www.csarko.sh\"]."
  type        = list(string)
  default     = []
}
