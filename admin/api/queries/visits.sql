-- Visits a day for the current window [start, end) and the previous one [prev_start, start), the
-- days cut in @tz, the reader's IANA zone (UTC when the page sends none).
-- A visit is the collector's daily hash; a row without one (no address resolved) counts by its page id.
-- The deploy script's and depth check's beacons (/deploy-check, /depth-check) are left out, and so
-- is every page load (id) that is a bot's or a crawler's: the test in _bot.sql that all six
-- visits queries share (the collector's flag or a Headless brand on any of the load's rows, a
-- device no real one is, the Linux fleet from google.com that never leaves, Day Hike's tooling
-- lobby). A visit whose views are all such page loads never counts.
-- `readers` are the visits that did something a person does: 5 or more engaged seconds on one page
-- load, views of 2 or more paths, or a click. The rest (a single page, gone in under 5 s, or no
-- leave at all) are real bounces and the crawlers that test still misses (_bot.sql and the
-- contract say which). A leave or click belongs to its page load's visit (the view's, by id),
-- since the daily hash can roll between a view and its beacons.
WITH beacons AS (
  SELECT
    timestamp AS ts,
    JSON_VALUE(json_payload.n) AS n,
    JSON_VALUE(json_payload.id) AS id,
    JSON_VALUE(json_payload.p) AS path,
    SAFE_CAST(JSON_VALUE(json_payload.e) AS INT64) AS secs,
    COALESCE(JSON_VALUE(json_payload.s.visit), JSON_VALUE(json_payload.id)) AS visit,
    -- The shared bot test, queries/_bot.sql: the collector's flag, a Headless brand, an impossible
    -- device, the Linux fleet from google.com and Day Hike's tooling lobby, over the whole page load.
    {{bot}} AS bot
  FROM `csarko-sh.csarko_visits._AllLogs`
  WHERE timestamp >= TIMESTAMP(@prev_start) AND timestamp < TIMESTAMP(@end)
    AND JSON_VALUE(json_payload.p) NOT IN ('/deploy-check', '/depth-check')
),
views AS (
  SELECT ts, id, visit, path FROM beacons WHERE n = 'view' AND NOT bot
),
loads AS (
  SELECT id, ANY_VALUE(visit) AS visit FROM views GROUP BY id
),
readers AS (
  SELECT visit FROM (
    SELECT l.visit, b.n, b.secs, NULL AS path FROM beacons AS b JOIN loads AS l USING (id) WHERE b.n IN ('leave', 'click')
    UNION ALL
    SELECT visit, 'view', NULL, path FROM views
  )
  GROUP BY visit
  HAVING LOGICAL_OR(n = 'leave' AND secs >= 5) OR LOGICAL_OR(n = 'click') OR COUNT(DISTINCT path) >= 2
)
SELECT
  IF(v.ts >= TIMESTAMP(@start), 'current', 'previous') AS win,
  DATE(v.ts, @tz) AS day,
  COUNT(DISTINCT v.visit) AS visits,
  COUNT(DISTINCT r.visit) AS readers
FROM views AS v LEFT JOIN readers AS r ON r.visit = v.visit
GROUP BY win, day
ORDER BY day
