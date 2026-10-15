-- Visits a day for the current window [start, end) and the previous one [prev_start, start).
-- A visit is the collector's daily hash; a row without one (no address resolved) counts by its page id.
-- The deploy script's and depth check's beacons (/deploy-check, /depth-check) are left out, and so
-- is every page load (id) that any of its rows calls a bot: Lighthouse's view said bot=false while
-- its leave and vitals said true, so the flag is read over the whole page load, not the one row.
-- A visit whose views are all bot page loads is a bot visit and never counts.
WITH beacons AS (
  SELECT
    timestamp AS ts,
    JSON_VALUE(json_payload.n) AS n,
    COALESCE(JSON_VALUE(json_payload.s.visit), JSON_VALUE(json_payload.id)) AS visit,
    LOGICAL_OR(IFNULL(JSON_VALUE(json_payload.s.bot), 'false') = 'true') OVER (PARTITION BY JSON_VALUE(json_payload.id)) AS bot
  FROM `csarko-sh.csarko_visits._AllLogs`
  WHERE timestamp >= TIMESTAMP(@prev_start) AND timestamp < TIMESTAMP(@end)
    AND JSON_VALUE(json_payload.p) NOT IN ('/deploy-check', '/depth-check')
)
SELECT IF(ts >= TIMESTAMP(@start), 'current', 'previous') AS win, DATE(ts) AS day, COUNT(DISTINCT visit) AS visits
FROM beacons
WHERE n = 'view' AND NOT bot
GROUP BY win, day
ORDER BY day
