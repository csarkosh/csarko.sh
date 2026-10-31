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

output "apps_hosting_site_id" {
  description = "Firebase Hosting site id of the apps site"
  value       = module.gcp_hosting_apps.site_id
}

output "apps_hosting_default_url" {
  description = "The apps site's own web.app URL, usable before DNS is live"
  value       = module.gcp_hosting_apps.default_url
}

output "apps_custom_domain_state" {
  description = "Host, ownership and certificate state of the apps domain. All ACTIVE means done."
  value       = module.gcp_hosting_apps.custom_domain_state
}

output "apps_site_url" {
  description = "URL of the apps site"
  value       = "https://${var.apps_domain_name}"
}

output "donate_hosting_site_id" {
  description = "Firebase Hosting site id of the donate site"
  value       = module.gcp_hosting_donate.site_id
}

output "donate_hosting_default_url" {
  description = "The donate site's own web.app URL, usable before DNS is live"
  value       = module.gcp_hosting_donate.default_url
}

output "donate_custom_domain_state" {
  description = "Host, ownership and certificate state of the donate domain. All ACTIVE means done."
  value       = module.gcp_hosting_donate.custom_domain_state
}

output "donate_site_url" {
  description = "URL of the donate site"
  value       = "https://${var.donate_domain_name}"
}

output "donate_prices_bucket" {
  description = "The public bucket the admin API publishes the donate site's prices to"
  value       = module.gcp_admin_api.donate_prices_bucket
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

output "admin_finance_modal_job_name" {
  description = "Cloud Run job that writes Modal's billing report into the snapshot, for `gcloud run jobs deploy --source admin/finance-modal`"
  value       = module.gcp_admin_api.finance_modal_job_name
}

output "film_ledgers_bucket" {
  description = "The private GCS bucket the film pipeline syncs <film>/ledger.json into (the Finance page's Films card)"
  value       = module.gcp_admin_api.film_ledgers_bucket
}

output "admin_scheduler_service_account" {
  description = "The identity the daily snapshot job calls the API as"
  value       = module.gcp_admin_api.scheduler_service_account_email
}

output "admin_web_api_key" {
  description = "The Firebase web API key the admin shell signs in with (admin/build.mjs bakes it into auth-config.json). Public by design."
  value       = module.gcp_auth.web_api_key
}

output "visits_service_name" { value = module.gcp_visits.service_name }
output "visits_service_url" { value = module.gcp_visits.service_url }
output "visits_secret_id" { value = module.gcp_visits.secret_id }
output "visits_dataset" { value = module.gcp_visits.dataset }
output "visits_history_dataset" { value = module.gcp_visits.history_dataset }

output "admin_costs_role_arn" {
  description = "The AWS IAM role the admin API assumes for Cost Explorer (the Finance page); the service's AWS_COST_ROLE_ARN"
  value       = module.aws_costs.role_arn
}

output "admin_costs_audience" {
  description = "The audience of the Google ID token the admin API presents to AWS STS; the service's AWS_COST_AUDIENCE"
  value       = module.aws_costs.audience
}

output "mail_table" { value = module.aws_mail.table_name }
output "mail_bucket" { value = module.aws_mail.bucket }
output "mail_function" { value = module.aws_mail.function_name }
output "mail_config_set" { value = module.aws_mail.configuration_set }
output "mail_region" { value = module.aws_mail.region }
output "mail_skill_policy_arn" {
  description = "Attach to the AWS profile the mail skill runs as."
  value       = module.aws_mail.skill_policy_arn
}
output "mail_owner_identity_verified" { value = module.aws_mail.owner_identity_verified }
output "mail_domain_identity_verified" { value = module.aws_mail.domain_identity_verified }
