variable "domain" {
  description = "The domain whose every address this receives, e.g. csarko.sh."
  type        = string
}

variable "zone_name" {
  description = "The Route 53 hosted zone that holds the domain."
  type        = string
}

variable "owner_address" {
  description = "Where every alias forwards, and the only sender allowed to use a reverse alias. Kept out of the repository: set in the git-ignored terraform.tfvars."
  type        = string
  sensitive   = true

  validation {
    condition     = can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", var.owner_address))
    error_message = "owner_address must be one email address."
  }
}

variable "lambda_source_dir" {
  description = "The folder holding inbound.py, mailkit.py and store.py."
  type        = string
}

variable "name" {
  description = "The name of the table, the rule set, the configuration set, and the prefix of everything else."
  type        = string
  default     = "mail"
}

variable "retention_days" {
  description = "Days a received or sent message is kept in S3 (and its index row in DynamoDB)."
  type        = number
  default     = 365
}

variable "protected_aliases" {
  description = "Local parts that can never be blocked, besides postmaster, abuse and dmarc: addresses some account depends on."
  type        = list(string)
  default     = []
}

variable "manage_apex_mx" {
  description = "Take over the apex MX record. False during the trial: the apex keeps whatever it points at, and only the trial subdomain reaches SES."
  type        = bool
  default     = false
}

variable "apex_mx_rollback" {
  description = "With manage_apex_mx, point the apex MX at rollback_mx instead of SES. The way back, without deleting the record."
  type        = bool
  default     = false
}

variable "rollback_mx" {
  description = "The apex MX before the cutover (Google Workspace), for apex_mx_rollback."
  type        = list(string)
  default = [
    "1 aspmx.l.google.com",
    "5 alt1.aspmx.l.google.com",
    "5 alt2.aspmx.l.google.com",
    "10 alt3.aspmx.l.google.com",
    "10 alt4.aspmx.l.google.com",
  ]
}

variable "trial_subdomain" {
  description = "A subdomain whose MX points at SES while the apex does not, e.g. \"test\" for test.csarko.sh. Empty for none."
  type        = string
  default     = ""
}

variable "cutover_complete" {
  description = "True once SES is the only sender for the domain: SPF drops Google, DMARC moves from p=none to p=quarantine."
  type        = bool
  default     = false
}
