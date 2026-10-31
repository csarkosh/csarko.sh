output "service_url" {
  description = "Base HTTPS URL of the admin API"
  value       = google_cloud_run_v2_service.admin.uri
}

output "service_name" {
  description = "Cloud Run service name, for `gcloud run deploy`"
  value       = google_cloud_run_v2_service.admin.name
}

output "service_account_email" {
  description = "The service's own identity"
  value       = google_service_account.admin.email
}

output "scheduler_service_account_email" {
  description = "The identity the snapshot job calls the service as; the handler accepts only this one"
  value       = google_service_account.scheduler.email
}

output "secret_ids" {
  description = "The Secret Manager secrets the service reads, by id. Each needs a version added by hand."
  value       = [for s in google_secret_manager_secret.this : s.secret_id]
}

output "image_repository" {
  description = "Artifact Registry Docker path `gcloud run deploy --source` pushes to, without a tag"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.source_deploy.repository_id}"
}

output "finance_modal_job_name" {
  description = "Cloud Run job name of the Modal billing job, for `gcloud run jobs deploy --source admin/finance-modal`"
  value       = google_cloud_run_v2_job.finance_modal.name
}

output "film_ledgers_bucket" {
  description = "The private bucket the film pipeline syncs <film>/ledger.json into; the service's FILM_LEDGERS_BUCKET"
  value       = google_storage_bucket.film_ledgers.name
}

output "donate_prices_bucket" {
  description = "The public bucket the admin API publishes the donate site's prices to; the service's DONATE_BUCKET"
  value       = google_storage_bucket.donate_prices.name
}

output "service_account_unique_id" {
  description = "The service's identity as its numeric unique id: the `sub` claim of the ID tokens it mints, which the AWS costs role's trust policy names"
  value       = google_service_account.admin.unique_id
}
