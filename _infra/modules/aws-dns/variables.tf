variable "zone_name" {
  description = "Route53 hosted zone name, e.g. csarko.sh"
  type        = string
}

variable "domain_name" {
  description = "Fully qualified record name to create, e.g. csarko.sh"
  type        = string
}

variable "a_records" {
  description = "IPv4 addresses for the A record. Must not be empty — an empty A record is a broken record that looks applied."
  type        = list(string)

  validation {
    condition     = length(var.a_records) > 0 && alltrue([for ip in var.a_records : can(cidrhost("${ip}/32", 0))])
    error_message = "a_records must be a non-empty list of IPv4 addresses."
  }
}

variable "txt_records" {
  description = "Values for the apex TXT record set, e.g. [\"hosting-site=csarko-sh\"]."
  type        = list(string)

  validation {
    condition     = length(var.txt_records) > 0
    error_message = "txt_records is empty — refusing to create a TXT record set with no values."
  }
}

variable "ttl" {
  description = "TTL in seconds. Low while the domain is being set up."
  type        = number
  default     = 300
}
