-- The GCP billing export, the last days [@start, @end) by UTC day, project, service and SKU: the
-- net cost (cost plus the credits, which are negative) and the usage amount in its unit.
-- Pruned on _PARTITIONTIME two days ahead of the usage window (a row lands in the partition of
-- its export, a day or two after its usage), then cut on usage_start_time. @start and @end are
-- YYYY-MM-DD strings.
SELECT
  FORMAT_DATE('%F', DATE(usage_start_time)) AS day,
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
GROUP BY day, project, service, sku, unit
ORDER BY day, project, service, sku
