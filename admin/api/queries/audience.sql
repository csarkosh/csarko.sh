-- Who the visitors are, by dimension, in [start, end). The check beacons (/deploy-check, /depth-check) are left out.
WITH views AS (
  SELECT
    COALESCE(JSON_VALUE(json_payload.s.visit), JSON_VALUE(json_payload.id)) AS visit,
    JSON_VALUE(json_payload.s.cc) AS country,
    JSON_VALUE(json_payload.sw) AS size,
    JSON_VALUE(json_payload.s.bn) AS browser,
    JSON_VALUE(json_payload.s.os) AS system,
    COALESCE(JSON_VALUE(json_payload.lg), JSON_VALUE(json_payload.s.lg)) AS language,
    JSON_VALUE(json_payload.th) AS theme,
    CASE
      WHEN SAFE_CAST(JSON_VALUE(json_payload.vw) AS INT64) < 400 THEN 'under 400'
      WHEN SAFE_CAST(JSON_VALUE(json_payload.vw) AS INT64) < 800 THEN '400 to 799'
      WHEN SAFE_CAST(JSON_VALUE(json_payload.vw) AS INT64) < 1200 THEN '800 to 1199'
      WHEN SAFE_CAST(JSON_VALUE(json_payload.vw) AS INT64) IS NOT NULL THEN '1200 and up'
    END AS viewport,
    IF(JSON_VALUE(json_payload.tp) = 'true', 'touch', 'pointer') AS touch,
    JSON_VALUE(json_payload.tz) AS timezone
  FROM `csarko-sh.csarko_visits._AllLogs`
  WHERE timestamp >= TIMESTAMP(@start) AND timestamp < TIMESTAMP(@end)
    AND JSON_VALUE(json_payload.n) = 'view'
    AND IFNULL(JSON_VALUE(json_payload.s.bot), 'false') != 'true'
    AND JSON_VALUE(json_payload.p) NOT IN ('/deploy-check', '/depth-check')
)
SELECT dim, name, COUNT(DISTINCT visit) AS visitors FROM (
  SELECT 'countries' AS dim, country AS name, visit FROM views
  UNION ALL SELECT 'sizes', size, visit FROM views
  UNION ALL SELECT 'browsers', browser, visit FROM views
  UNION ALL SELECT 'systems', system, visit FROM views
  UNION ALL SELECT 'languages', language, visit FROM views
  UNION ALL SELECT 'themes', theme, visit FROM views
  UNION ALL SELECT 'viewports', viewport, visit FROM views
  UNION ALL SELECT 'touch', touch, visit FROM views
  UNION ALL SELECT 'timezones', timezone, visit FROM views
)
WHERE name IS NOT NULL AND name != ''
GROUP BY dim, name
ORDER BY dim, visitors DESC
