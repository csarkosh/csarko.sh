-- Who the visitors are, by dimension, in [start, end). The check beacons (/deploy-check, /depth-check)
-- are left out, and so is every page load (id) that any of its rows calls a bot (Lighthouse's view
-- says bot=false, its leave and vitals true).
WITH beacons AS (
  SELECT
    JSON_VALUE(json_payload.n) AS n,
    JSON_VALUE(json_payload.id) AS id,
    json_payload AS j,
    -- A browser brand starting Headless (the client hints' HeadlessChrome, under a User-Agent that
    -- claims a real browser) is a bot too, whatever s.bot says.
    LOGICAL_OR(IFNULL(JSON_VALUE(json_payload.s.bot), 'false') = 'true' OR STARTS_WITH(IFNULL(JSON_VALUE(json_payload.s.bn), ''), 'Headless')) OVER (PARTITION BY JSON_VALUE(json_payload.id)) AS bot
  FROM `csarko-sh.csarko_visits._AllLogs`
  WHERE timestamp >= TIMESTAMP(@start) AND timestamp < TIMESTAMP(@end)
    AND JSON_VALUE(json_payload.p) NOT IN ('/deploy-check', '/depth-check')
),
views AS (
  SELECT
    COALESCE(JSON_VALUE(j.s.visit), id) AS visit,
    JSON_VALUE(j.s.cc) AS country,
    JSON_VALUE(j.sw) AS size,
    JSON_VALUE(j.s.bn) AS browser,
    JSON_VALUE(j.s.os) AS system,
    COALESCE(JSON_VALUE(j.lg), JSON_VALUE(j.s.lg)) AS language,
    JSON_VALUE(j.th) AS theme,
    CASE
      WHEN SAFE_CAST(JSON_VALUE(j.vw) AS INT64) < 400 THEN 'under 400'
      WHEN SAFE_CAST(JSON_VALUE(j.vw) AS INT64) < 800 THEN '400 to 799'
      WHEN SAFE_CAST(JSON_VALUE(j.vw) AS INT64) < 1200 THEN '800 to 1199'
      WHEN SAFE_CAST(JSON_VALUE(j.vw) AS INT64) IS NOT NULL THEN '1200 and up'
    END AS viewport,
    IF(JSON_VALUE(j.tp) = 'true', 'touch', 'pointer') AS touch,
    JSON_VALUE(j.tz) AS timezone
  FROM beacons WHERE n = 'view' AND NOT bot
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
