-- The last usage day the GCP billing export holds, looking back from @start (a YYYY-MM-DD string)
-- so the scan stays within the recent partitions; NULL when the export has no row since then.
SELECT FORMAT_DATE('%F', MAX(DATE(usage_start_time))) AS day
FROM `csarko-sh.billing.gcp_billing_export_v1_013AA0_554DB9_BBF90D`
WHERE _PARTITIONTIME >= TIMESTAMP(DATE_SUB(DATE(@start), INTERVAL 2 DAY))
  AND usage_start_time >= TIMESTAMP(@start)
