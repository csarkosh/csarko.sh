-- Pages by visitors in [start, end), with the same pages' visitors in [prev_start, prev_end). What
-- each number means:
--   visitors        distinct visits (the collector's daily hash) with a view of the path;
--   previous        the same over the range before (prev_start, prev_end), 0 for a path not seen then;
--   landed          the distinct visits whose first view in the range was the path: they came in here;
--   onward          the distinct visits that saw the path and whose last view in the range was
--                   another path: they went on from it rather than left the site there (2026-11-21);
--   engaged_median  the median, in seconds, over visits of each visit's longest engaged time on
--                   the path, among page loads that sent a leave (a load's time is its leaves'
--                   MAX(e), capped at 1800 s so a tab left open does not swamp the rest);
--   depth_median    the median, over visits, of each visit's deepest scroll on the path (0 to 100),
--                   among page loads that sent a leave with a depth;
--   lcp_p75         the 75th percentile of the path's page loads' LCP in ms (the vitals beacon), the
--                   percentile Google's Core Web Vitals assess, NULL with no vitals row;
--   reached         the share of ALL the path's views whose page load reached the end (a view
--                   with no leave did not), only for /research/<slug> pages, which are the ones
--                   with a data-read-end marker; NULL for every other path. Reached the end is
--                   the leave's `re` AND a scroll depth of 50 or more (the load's MAX(sd)): a
--                   crawler that renders the whole page at once sets `re` without scrolling, and
--                   in four weeks of rows no load sat between 15 and 72 (2026-11-13).
-- Everything but `previous` is the current range's.
-- Filters (2026-11-21, multi-select on the What they read card): a visit is kept when its country
-- (the first its views were placed in, s.cc) is in @countries and its source (its first view's
-- referrer as referrers.sql names it, `name|target`) is in @sources and its network (the first
-- its views were on, s.an, lib-visits v0.7.0) is in @networks; a list holding '*' keeps every
-- visit. The API turns the card's referrer groups into the sources the range holds
-- (collectors/visits.mjs), since the groups are referrers.mjs's rules, not SQL's.
-- The check beacons (/deploy-check, /depth-check) are left out, and so is every page load (id)
-- that is a bot's or a crawler's (the shared test in _bot.sql).
-- A page on another of the site's hosts (apps.csarko.sh, donate.csarko.sh, whose beacons the
-- collector takes since 2026-11-01) is named with its host, `apps.csarko.sh/ide-arkos`, so it
-- never folds into csarko.sh's path of the same name (both have a /).
WITH beacons AS (
  SELECT
    timestamp AS ts,
    timestamp >= TIMESTAMP(@start) AS cur,
    JSON_VALUE(json_payload.n) AS n,
    JSON_VALUE(json_payload.id) AS id,
    json_payload AS j,
    -- The shared bot test, queries/_bot.sql: the collector's flag, a Headless brand, an impossible
    -- device, the Linux fleet from google.com and Day Hike's tooling lobby, over the whole page load.
    {{bot}} AS bot
  FROM `csarko-sh.csarko_visits._AllLogs`
  WHERE ((timestamp >= TIMESTAMP(@start) AND timestamp < TIMESTAMP(@end)) OR (timestamp >= TIMESTAMP(@prev_start) AND timestamp < TIMESTAMP(@prev_end)))
    AND JSON_VALUE(json_payload.p) NOT IN ('/deploy-check', '/depth-check')
),
all_views AS (
  SELECT id, ts, cur, JSON_VALUE(j.s.cc) AS cc, JSON_VALUE(j.s.an) AS an, JSON_VALUE(j.s.rk) AS rk, JSON_VALUE(j.s.rh) AS rh, COALESCE(JSON_VALUE(j.cr), JSON_VALUE(j.us)) AS campaign, IF(IFNULL(JSON_VALUE(j.s.host), 'csarko.sh') IN ('csarko.sh', 'www.csarko.sh'), JSON_VALUE(j.p), CONCAT(JSON_VALUE(j.s.host), JSON_VALUE(j.p))) AS path, JSON_VALUE(j.t) AS title, COALESCE(JSON_VALUE(j.s.visit), id) AS visit
  FROM beacons WHERE n = 'view' AND NOT bot
),
kept AS (
  SELECT visit
  FROM (
    SELECT
      visit,
      ARRAY_AGG(cc IGNORE NULLS ORDER BY ts LIMIT 1)[SAFE_OFFSET(0)] AS country,
      ARRAY_AGG(an IGNORE NULLS ORDER BY ts LIMIT 1)[SAFE_OFFSET(0)] AS network,
      ARRAY_AGG(STRUCT(rk, rh, campaign) ORDER BY ts LIMIT 1)[OFFSET(0)] AS f
    FROM all_views GROUP BY visit
  )
  WHERE ('*' IN UNNEST(@countries) OR country IN UNNEST(@countries))
    AND ('*' IN UNNEST(@networks) OR network IN UNNEST(@networks))
    AND ('*' IN UNNEST(@sources) OR CONCAT(CASE f.rk WHEN 'external' THEN IFNULL(f.rh, '(unknown)') WHEN 'internal' THEN 'csarko.sh' ELSE '' END, '|', IF(f.rk = 'external', '', IFNULL(f.campaign, ''))) IN UNNEST(@sources))
),
views AS (
  SELECT id, ts, cur, path, title, visit FROM all_views JOIN kept USING (visit)
),
leaves AS (
  SELECT
    id,
    LEAST(MAX(SAFE_CAST(JSON_VALUE(j.e) AS INT64)), 1800) AS secs,
    MAX(SAFE_CAST(JSON_VALUE(j.sd) AS INT64)) AS depth,
    LOGICAL_OR(JSON_VALUE(j.re) = 'true') AND MAX(SAFE_CAST(JSON_VALUE(j.sd) AS INT64)) >= 50 AS reached
  FROM beacons WHERE n = 'leave' AND NOT bot AND cur GROUP BY id
),
vitals AS (
  SELECT id, MAX(SAFE_CAST(JSON_VALUE(j.d.lcp) AS FLOAT64)) AS lcp
  FROM beacons WHERE n = 'vitals' AND NOT bot AND cur GROUP BY id
),
-- The current range's views in visit order: the first is where the visit landed, and a path that is
-- not the visit's last is one it went on from rather than left from.
ordered AS (
  SELECT
    v.*,
    ROW_NUMBER() OVER (PARTITION BY visit ORDER BY ts, id) = 1 AS first,
    LAST_VALUE(path) OVER (PARTITION BY visit ORDER BY ts, id ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) AS last_path
  FROM views v WHERE cur
),
loads AS (
  SELECT o.path, o.title, o.visit, o.first, o.last_path != o.path AS went_on, l.secs, l.depth, t.lcp, IFNULL(l.reached, FALSE) AS reached
  FROM ordered o LEFT JOIN leaves l USING (id) LEFT JOIN vitals t USING (id)
),
per_visit AS (
  SELECT path, visit, MAX(secs) AS secs, MAX(depth) AS depth FROM loads GROUP BY path, visit
),
medians AS (
  SELECT path,
    APPROX_QUANTILES(secs, 2 IGNORE NULLS)[SAFE_OFFSET(1)] AS engaged_median,
    APPROX_QUANTILES(depth, 2 IGNORE NULLS)[SAFE_OFFSET(1)] AS depth_median
  FROM per_visit GROUP BY path
),
previous AS (
  SELECT path, COUNT(DISTINCT visit) AS previous FROM views WHERE NOT cur GROUP BY path
)
SELECT
  l.path,
  ANY_VALUE(l.title) AS title,
  COUNT(DISTINCT l.visit) AS visitors,
  IFNULL(ANY_VALUE(p.previous), 0) AS previous,
  COUNT(DISTINCT IF(l.first, l.visit, NULL)) AS landed,
  COUNT(DISTINCT IF(l.went_on, l.visit, NULL)) AS onward,
  ANY_VALUE(m.engaged_median) AS engaged_median,
  ANY_VALUE(m.depth_median) AS depth_median,
  APPROX_QUANTILES(l.lcp, 4 IGNORE NULLS)[SAFE_OFFSET(3)] AS lcp_p75,
  IF(REGEXP_CONTAINS(l.path, r'^/research/[^/]+$'), COUNTIF(l.reached) / COUNT(*), NULL) AS reached
FROM loads l LEFT JOIN medians m USING (path) LEFT JOIN previous p USING (path)
GROUP BY l.path
ORDER BY visitors DESC
LIMIT 200
