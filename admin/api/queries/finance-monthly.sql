-- The GCP billing export, the months from @start (the first of a month) to @end by month, project,
-- service and SKU: the net cost (cost plus the credits, which are negative) and the usage amount
-- in its unit. Pruned on _PARTITIONTIME two days ahead of the usage window, then cut on
-- usage_start_time (UTC). @start and @end are YYYY-MM-DD strings.
SELECT
  FORMAT_DATE('%Y-%m', DATE(usage_start_time)) AS month,
  project.id AS project,
  service.description AS service,
  sku.description AS sku,
  usage.unit AS unit,
  SUM(cost) + SUM(IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) AS c), 0)) AS net,
  SUM(usage.amount) AS amount
FROM `csarko-sh.billing.gcp_billing_export_v1_013AA0_554DB9_BBF90D`
WHERE _PARTITIONTIME >= TIMESTAMP(DATE_SUB(DATE(@start), INTERVAL 2 DAY))
  AND usage_start_time >= TIMESTAMP(@start)
  AND usage_start_time < TIMESTAMP(@end)
GROUP BY month, project, service, sku, unit
ORDER BY month, project, service, sku
