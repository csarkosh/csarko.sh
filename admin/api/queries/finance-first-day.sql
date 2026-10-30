-- The first usage day the GCP billing export holds: where its history starts, which is not the
-- day the export was switched on (2026-10-29). Google backfills earlier months over the first
-- days after enabling (2026-08-01 had arrived within hours), so the months a range calls
-- "partial" (AWS and GitHub only) are the ones before this day, read, never assumed. The whole
-- table is scanned on purpose: it is kilobytes a day, and the answer is cached.
SELECT FORMAT_DATE('%F', MIN(DATE(usage_start_time))) AS day
FROM `csarko-sh.billing.gcp_billing_export_v1_013AA0_554DB9_BBF90D`
