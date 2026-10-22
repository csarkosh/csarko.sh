-- Pages by visitors in [start, end). What each number means:
--   visitors        distinct visits (the collector's daily hash) with a view of the path;
--   engaged_median  the median, in seconds, over visits of each visit's longest engaged time on
--                   the path, among page loads that sent a leave (a load's time is its leaves'
--                   MAX(e), capped at 1800 s so a tab left open does not swamp the rest);
--   reached         the share of ALL the path's views whose page load reached the end (a view
--                   with no leave did not), only for /research/<slug> pages, which are the ones
--                   with a data-read-end marker; NULL for every other path.
-- The check beacons (/deploy-check, /depth-check) are left out, and so is every page load (id)
-- that any of its rows calls a bot (Lighthouse's view says bot=false, its leave and vitals true).
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
  SELECT id, JSON_VALUE(j.p) AS path, JSON_VALUE(j.t) AS title, COALESCE(JSON_VALUE(j.s.visit), id) AS visit
  FROM beacons WHERE n = 'view' AND NOT bot
),
leaves AS (
  SELECT
    id,
    LEAST(MAX(SAFE_CAST(JSON_VALUE(j.e) AS INT64)), 1800) AS secs,
    MAX(SAFE_CAST(JSON_VALUE(j.sd) AS INT64)) AS depth,
    LOGICAL_OR(JSON_VALUE(j.re) = 'true') AS reached
  FROM beacons WHERE n = 'leave' AND NOT bot GROUP BY id
),
loads AS (
  SELECT v.path, v.title, v.visit, l.secs, IFNULL(l.reached, FALSE) AS reached
  FROM views v LEFT JOIN leaves l USING (id)
),
engaged AS (
  SELECT path, APPROX_QUANTILES(secs, 2)[OFFSET(1)] AS engaged_median
  FROM (SELECT path, visit, MAX(secs) AS secs FROM loads WHERE secs IS NOT NULL GROUP BY path, visit)
  GROUP BY path
)
SELECT
  l.path,
  ANY_VALUE(l.title) AS title,
  COUNT(DISTINCT l.visit) AS visitors,
  ANY_VALUE(e.engaged_median) AS engaged_median,
  IF(REGEXP_CONTAINS(l.path, r'^/research/[^/]+$'), COUNTIF(l.reached) / COUNT(*), NULL) AS reached
FROM loads l LEFT JOIN engaged e USING (path)
GROUP BY l.path
ORDER BY visitors DESC
LIMIT 200
