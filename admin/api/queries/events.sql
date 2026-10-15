-- Named clicks, outbound links by host, docs read to the end (from the leave beacon), and the
-- home page's visitors, in [start, end). The check beacons (/deploy-check, /depth-check) are left out.
WITH base AS (
  SELECT json_payload AS j, COALESCE(JSON_VALUE(json_payload.s.visit), JSON_VALUE(json_payload.id)) AS visit
  FROM `csarko-sh.csarko_visits._AllLogs`
  WHERE timestamp >= TIMESTAMP(@start) AND timestamp < TIMESTAMP(@end)
    AND IFNULL(JSON_VALUE(json_payload.s.bot), 'false') != 'true'
    AND JSON_VALUE(json_payload.p) NOT IN ('/deploy-check', '/depth-check')
)
SELECT name, COUNT(DISTINCT visit) AS visitors FROM (
  SELECT JSON_VALUE(j.ev) AS name, visit FROM base
  WHERE JSON_VALUE(j.n) = 'click' AND JSON_VALUE(j.ev) IS NOT NULL
  UNION ALL
  SELECT CONCAT('link-', REGEXP_EXTRACT(JSON_VALUE(j.u), r'^https?://([^/]+)')), visit FROM base
  WHERE JSON_VALUE(j.n) = 'click' AND JSON_VALUE(j.ev) IS NULL AND JSON_VALUE(j.u) IS NOT NULL
  UNION ALL
  SELECT CONCAT('read-', REGEXP_EXTRACT(JSON_VALUE(j.p), r'^/research/([^/]+)$')), visit FROM base
  WHERE JSON_VALUE(j.n) = 'leave' AND JSON_VALUE(j.re) = 'true' AND REGEXP_CONTAINS(JSON_VALUE(j.p), r'^/research/[^/]+$')
  UNION ALL
  SELECT '(home)', visit FROM base WHERE JSON_VALUE(j.n) = 'view' AND JSON_VALUE(j.p) = '/'
)
WHERE name IS NOT NULL
GROUP BY name
ORDER BY visitors DESC
