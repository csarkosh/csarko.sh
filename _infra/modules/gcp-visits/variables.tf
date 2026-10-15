variable "project_id" { type = string }
variable "region" { type = string }

variable "image" {
  description = "The collector's image. The deploy script owns it after the first apply; this default only lets the service exist."
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "origins" {
  description = "The sites allowed to post beacons, as origins."
  type        = list(string)
}

variable "trusted_proxies" {
  description = "How many proxies sit in front of the service (Firebase Hosting's rewrite plus Cloud Run's frontend). Confirmed once with --log-ip; see the deploy notes."
  type        = number
  default     = 1
}

variable "ignore_ips" {
  description = "Addresses or CIDR prefixes whose beacons the collector answers and never writes: the owner's own machines. Sensitive, so a plan never prints them."
  type        = list(string)
  default     = []
  sensitive   = true
}

variable "retention_days" {
  description = "How long the rows stay in the log bucket. Two years, so a year reads against the one before."
  type        = number
  default     = 730
}

variable "dataset" {
  description = "The BigQuery dataset linked to the log bucket, where the rows are read."
  type        = string
}

variable "history_dataset" {
  description = "The BigQuery dataset for analytics history from before lib-visits."
  type        = string
}

variable "reader_service_account_email" {
  description = "The admin API's service account, which reads the datasets."
  type        = string
}
