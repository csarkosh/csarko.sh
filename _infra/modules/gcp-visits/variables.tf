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

variable "retention_days" {
  description = "How long the rows stay in the log bucket. Two years, so a year reads against the one before."
  type        = number
  default     = 730
}

variable "reader_service_account_email" {
  description = "The admin API's service account, which reads the datasets."
  type        = string
}
