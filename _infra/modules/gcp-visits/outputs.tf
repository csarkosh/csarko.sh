output "service_name" { value = google_cloud_run_v2_service.visits.name }
output "service_url" { value = google_cloud_run_v2_service.visits.uri }
output "service_account_email" { value = google_service_account.visits.email }
output "secret_id" { value = google_secret_manager_secret.visits.secret_id }
output "dataset" { value = google_logging_linked_dataset.visits.link_id }
output "history_dataset" { value = google_bigquery_dataset.history.dataset_id }
output "history_table" { value = google_bigquery_table.goatcounter_history.table_id }
