-- Where visits came from in [start, end), each visit counted once, by its FIRST view: direct (an
-- empty name), the external host, or 'csarko.sh' when the first view already came from one of
-- the site's own pages or subdomains (the daily hash rolled mid-visit at UTC midnight, or a
-- subdomain linked here; the collector keeps no host for an internal referrer, and referrers.mjs
-- groups the row as "own"). Campaigns are the first view's too. The site's own edges
-- (the previous page to this one) count every view, as before. The check beacons (/deploy-check,
-- /depth-check) are left out, and so is every page load (id) that any of its rows calls a bot
-- (Lighthouse's view says bot=false, its leave and vitals true).
WITH beacons AS (
  SELECT
    timestamp AS ts,
    JSON_VALUE(json_payload.n) AS n,
    JSON_VALUE(json_payload.id) AS id,
    json_payload AS j,
    LOGICAL_OR(IFNULL(JSON_VALUE(json_payload.s.bot), 'false') = 'true') OVER (PARTITION BY JSON_VALUE(json_payload.id)) AS bot
  FROM `csarko-sh.csarko_visits._AllLogs`
  WHERE timestamp >= TIMESTAMP(@start) AND timestamp < TIMESTAMP(@end)
    AND JSON_VALUE(json_payload.p) NOT IN ('/deploy-check', '/depth-check')
),
views AS (
  SELECT
    ts,
    JSON_VALUE(j.p) AS path,
    COALESCE(JSON_VALUE(j.s.visit), id) AS visit,
    JSON_VALUE(j.s.rk) AS rk,
    JSON_VALUE(j.s.rh) AS rh,
    JSON_VALUE(j.s.rp) AS rp,
    COALESCE(JSON_VALUE(j.cr), JSON_VALUE(j.us)) AS campaign
  FROM beacons WHERE n = 'view' AND NOT bot
),
first_views AS (
  SELECT visit, ARRAY_AGG(STRUCT(rk, rh, campaign) ORDER BY ts LIMIT 1)[OFFSET(0)] AS f
  FROM views GROUP BY visit
)
SELECT
  'referrer' AS kind,
  CASE f.rk WHEN 'external' THEN IFNULL(f.rh, '(unknown)') WHEN 'internal' THEN 'csarko.sh' ELSE '' END AS name,
  '' AS target,
  COUNT(*) AS visitors
FROM first_views GROUP BY name
UNION ALL
SELECT 'campaign', f.campaign, '', COUNT(*) FROM first_views WHERE f.campaign IS NOT NULL GROUP BY f.campaign
UNION ALL
SELECT 'internal', rp, path, COUNT(DISTINCT visit) FROM views WHERE rk = 'internal' AND rp IS NOT NULL GROUP BY rp, path
ORDER BY visitors DESC
