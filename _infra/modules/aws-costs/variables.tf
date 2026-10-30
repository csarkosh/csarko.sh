variable "role_name" {
  description = "Name of the IAM role the admin API assumes for Cost Explorer."
  type        = string
  default     = "csarko-admin-costs"
}

variable "audience" {
  description = <<-EOT
    The audience the Cloud Run service puts in the Google ID token it presents to
    STS, matched exactly against the token's `aud` claim (accounts.google.com:aud).
    A URL under the admin site is the convention, e.g. https://admin.csarko.sh/aws-costs;
    it is an identifier, nothing is served there.
  EOT
  type        = string

  validation {
    condition     = length(trimspace(var.audience)) > 0
    error_message = "audience is empty: a trust policy with an empty audience would accept any Google service account's token."
  }
}

variable "service_account_unique_id" {
  description = <<-EOT
    The Google service account's numeric unique id (google_service_account.unique_id),
    which is the `sub` claim of the ID tokens it mints (accounts.google.com:sub).
    The id, not the email: an email can be reused by a recreated account, the id cannot.
  EOT
  type        = string

  validation {
    condition     = can(regex("^[0-9]{10,30}$", var.service_account_unique_id))
    error_message = "service_account_unique_id must be the service account's numeric unique id, not its email."
  }
}
