-- Visits a day for the current window [start, end) and the previous one [prev_start, start).
-- A visit is the collector's daily hash; a row without one (no address resolved) counts by its page id.
-- The deploy script's and depth check's beacons (/deploy-check, /depth-check) are left out.
WITH views AS (
  SELECT
    DATE(timestamp) AS day,
    IF(timestamp >= TIMESTAMP(@start), 'current', 'previous') AS window,
    COALESCE(JSON_VALUE(json_payload.s.visit), JSON_VALUE(json_payload.id)) AS visit
  FROM `csarko-sh.csarko_visits._AllLogs`
  WHERE timestamp >= TIMESTAMP(@prev_start) AND timestamp < TIMESTAMP(@end)
    AND JSON_VALUE(json_payload.n) = 'view'
    AND IFNULL(JSON_VALUE(json_payload.s.bot), 'false') != 'true'
    AND JSON_VALUE(json_payload.p) NOT IN ('/deploy-check', '/depth-check')
)
SELECT window, day, COUNT(DISTINCT visit) AS visits
FROM views
GROUP BY window, day
ORDER BY day
