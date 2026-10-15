-- Pages by visitors in [start, end), with the engaged time and the share that reached the end
-- from each page load's last leave. The check beacons (/deploy-check, /depth-check) are left out.
WITH views AS (
  SELECT
    JSON_VALUE(json_payload.id) AS id,
    JSON_VALUE(json_payload.p) AS path,
    JSON_VALUE(json_payload.t) AS title,
    COALESCE(JSON_VALUE(json_payload.s.visit), JSON_VALUE(json_payload.id)) AS visit
  FROM `csarko-sh.csarko_visits._AllLogs`
  WHERE timestamp >= TIMESTAMP(@start) AND timestamp < TIMESTAMP(@end)
    AND JSON_VALUE(json_payload.n) = 'view'
    AND IFNULL(JSON_VALUE(json_payload.s.bot), 'false') != 'true'
    AND JSON_VALUE(json_payload.p) NOT IN ('/deploy-check', '/depth-check')
),
leaves AS (
  SELECT
    JSON_VALUE(json_payload.id) AS id,
    ARRAY_AGG(STRUCT(
      SAFE_CAST(JSON_VALUE(json_payload.e) AS INT64) AS e,
      JSON_VALUE(json_payload.re) = 'true' AS re
    ) ORDER BY timestamp DESC LIMIT 1)[OFFSET(0)] AS last
  FROM `csarko-sh.csarko_visits._AllLogs`
  WHERE timestamp >= TIMESTAMP(@start) AND timestamp < TIMESTAMP(@end)
    AND JSON_VALUE(json_payload.n) = 'leave'
    AND JSON_VALUE(json_payload.p) NOT IN ('/deploy-check', '/depth-check')
  GROUP BY id
)
SELECT
  v.path,
  ANY_VALUE(v.title) AS title,
  COUNT(DISTINCT v.visit) AS visitors,
  APPROX_QUANTILES(l.last.e, 2)[OFFSET(1)] AS engaged_median,
  SAFE_DIVIDE(COUNTIF(l.last.re), COUNTIF(l.id IS NOT NULL)) AS reached
FROM views v
LEFT JOIN leaves l USING (id)
GROUP BY v.path
ORDER BY visitors DESC
LIMIT 200
