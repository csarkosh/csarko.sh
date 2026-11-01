# Task 1 report: gcp-visits module

Status: DONE_WITH_CONCERNS

Wrote _infra/modules/gcp-visits/{main,variables,outputs}.tf verbatim from the brief; added module "gcp_visits" to _infra/main.tf (before the hosting-CNAME locals, after gcp_admin_api) and five outputs to _infra/outputs.tf. No deviations; validate passed unmodified (startup_probe, linked dataset and both providers all accepted).

Plan: 17 to add, 1 to change, 0 to destroy.
Added (all module.gcp_visits): google_project_service.apis x2 (logging, bigquery), service_account.visits, secret_manager_secret.visits, secret_iam_member.visits_reads, cloud_run_v2_service.visits, cloud_run_v2_service_iam_member.public, logging_project_bucket_config.visits, logging_project_sink.visits, logging_project_exclusion.visits_duplicates, logging_linked_dataset.visits, bigquery_dataset.history, bigquery_table.goatcounter_history, project_iam_member.reader x2, bigquery_dataset_iam_member.reader_visits, reader_history.

Concern: the 1 change is module.gcp_admin_api.google_cloud_run_v2_service.admin, in place, removing build_config (stamped by gcloud run deploy --source). It is pre-existing drift: with my changes stashed the plan shows the same 1 change. Not caused by this task; an apply would clear it harmlessly but build_config could be added to that module's ignore_changes.
Nothing applied. Full plan output: scratchpad plan.txt.

## Fix round 1
Added depends_on = [module.gcp_admin_api] to module "gcp_visits" with the comment; ran terraform fmt -recursive (aligned timeout/max_instance_request_concurrency); added the ingress comment. validate passes. No plan run.
