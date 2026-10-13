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

output "admin_hosting_site_id" {
  description = "Firebase Hosting site id of the admin dashboard"
  value       = module.gcp_hosting_admin.site_id
}

output "admin_hosting_default_url" {
  description = "The admin site's own web.app URL, usable before DNS is live"
  value       = module.gcp_hosting_admin.default_url
}

output "admin_required_dns_updates" {
  description = "Pending DNS actions Firebase still wants for the admin domain. Empty once reconciled, which is the success state."
  value       = module.gcp_hosting_admin.required_dns_updates
}

output "admin_custom_domain_state" {
  description = "Host, ownership and certificate state of the admin domain. All ACTIVE means done."
  value       = module.gcp_hosting_admin.custom_domain_state
}

output "admin_site_url" {
  description = "URL of the admin dashboard"
  value       = "https://${var.admin_domain_name}"
}

output "admin_api_url" {
  description = "Base HTTPS URL of the admin API on Cloud Run; what admin/public/apps.json points the csarko.sh card at"
  value       = module.gcp_admin_api.service_url
}

output "admin_api_service_name" {
  description = "Cloud Run service name, for `gcloud run deploy --source admin/api`"
  value       = module.gcp_admin_api.service_name
}

output "admin_api_secret_ids" {
  description = "The Secret Manager secrets the API reads. Each needs a version added by hand: `gcloud secrets versions add <id> --data-file=-`"
  value       = module.gcp_admin_api.secret_ids
}

output "admin_scheduler_service_account" {
  description = "The identity the daily snapshot job calls the API as"
  value       = module.gcp_admin_api.scheduler_service_account_email
}
