output "gcp_project_id" {
  description = "GCP project ID, for `firebase deploy --project`"
  value       = var.gcp_project_id
}

output "hosting_site_id" {
  description = "Firebase Hosting site id"
  value       = module.gcp_hosting.site_id
}

output "hosting_default_url" {
  description = "The site's own web.app URL, usable before DNS is live"
  value       = module.gcp_hosting.default_url
}

output "hosting_required_dns_updates" {
  description = <<-EOT
    Pending DNS actions Firebase still wants for the custom domain, straight
    from the API. Empty once the domain has fully reconciled — that is the
    success state. Informational only; the aws-dns module reads its values
    from var.firebase_hosting_ips and the site id instead.
  EOT
  value       = module.gcp_hosting.required_dns_updates
}

output "hosting_custom_domain_state" {
  description = "Host, ownership and certificate state of the custom domain. All ACTIVE means done."
  value       = module.gcp_hosting.custom_domain_state
}

output "redirect_domain_states" {
  description = "State of each redirect-only custom domain (www). All ACTIVE means done."
  value       = module.gcp_hosting.redirect_domain_states
}

output "dns_record_fqdn" {
  description = "The apex record created for the custom domain"
  value       = module.aws_dns.fqdn
}

output "site_url" {
  description = "Public URL of the site"
  value       = "https://${var.domain_name}"
}
