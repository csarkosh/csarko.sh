-- Named clicks, outbound links by host, docs read to the end (from the leave beacon: `re` on any
-- of the page load's leaves AND a scroll depth, its MAX(sd), of 50 or more, since a crawler that
-- renders the whole page at once sets `re` without scrolling), doc sections
-- read (section-<n>, the site's reading.js), and the
-- home page's visitors, in [start, end). Two numbers a name: `visitors`, the distinct visits
-- that fired it, and `clicks`, how many times it fired (for a read, the page loads that reached
-- the end; for (home), the home page's views). A click with no event name but a url (a link to
-- another host the page did not name) counts as link-<host>, the host without www.; a named
-- link carries both and counts under its name alone. (outbound) is the distinct visits that
-- clicked any out-* or link-*, so the rate over home visitors cannot pass 100%.
-- A click or a leave belongs to its page load's visit (the view's, by id), since the daily hash
-- can roll between a view and its beacons.
-- The check beacons (/deploy-check, /depth-check) are left out, and so is every page load (id)
-- that is a bot's or a crawler's (the shared test in _bot.sql).
WITH beacons AS (
  SELECT
    JSON_VALUE(json_payload.n) AS n,
    JSON_VALUE(json_payload.id) AS id,
    json_payload AS j,
    COALESCE(JSON_VALUE(json_payload.s.visit), JSON_VALUE(json_payload.id)) AS visit,
    -- The shared bot test, queries/_bot.sql: the collector's flag, a Headless brand, an impossible
    -- device, the Linux fleet from google.com and Day Hike's tooling lobby, over the whole page load.
    {{bot}} AS bot
  FROM `csarko-sh.csarko_visits._AllLogs`
  WHERE timestamp >= TIMESTAMP(@start) AND timestamp < TIMESTAMP(@end)
    AND JSON_VALUE(json_payload.p) NOT IN ('/deploy-check', '/depth-check')
),
loads AS (
  SELECT id, ANY_VALUE(visit) AS visit FROM beacons WHERE n = 'view' AND NOT bot GROUP BY id
),
clicks AS (
  SELECT
    COALESCE(l.visit, b.visit) AS visit,
    JSON_VALUE(b.j.ev) AS ev,
    REGEXP_REPLACE(REGEXP_EXTRACT(JSON_VALUE(b.j.u), r'^https?://([^/:?#]+)'), r'^www\.', '') AS host
  FROM beacons AS b LEFT JOIN loads AS l USING (id) WHERE b.n = 'click' AND NOT b.bot
)
SELECT name, COUNT(DISTINCT visit) AS visitors, COUNT(*) AS clicks FROM (
  SELECT ev AS name, visit FROM clicks WHERE ev IS NOT NULL
  UNION ALL
  SELECT CONCAT('link-', host), visit FROM clicks WHERE ev IS NULL AND host IS NOT NULL
  UNION ALL
  SELECT name, visit FROM (
    SELECT CONCAT('read-', REGEXP_EXTRACT(ANY_VALUE(JSON_VALUE(b.j.p)), r'^/research/([^/]+)$')) AS name, ANY_VALUE(COALESCE(l.visit, b.visit)) AS visit, b.id
    FROM beacons AS b LEFT JOIN loads AS l USING (id)
    WHERE b.n = 'leave' AND NOT b.bot AND REGEXP_CONTAINS(JSON_VALUE(b.j.p), r'^/research/[^/]+$')
    GROUP BY b.id
    HAVING LOGICAL_OR(JSON_VALUE(b.j.re) = 'true') AND MAX(SAFE_CAST(JSON_VALUE(b.j.sd) AS INT64)) >= 50
  )
  UNION ALL
  -- A doc section read for 5 s with the page in view (the site's reading.js), as section-<n>,
  -- n 0 for the opening before section 01.
  SELECT CONCAT('section-', JSON_VALUE(b.j.d.n)), COALESCE(l.visit, b.visit)
  FROM beacons AS b LEFT JOIN loads AS l USING (id)
  WHERE b.n = 'section' AND NOT b.bot
  UNION ALL
  SELECT '(home)', visit FROM beacons WHERE n = 'view' AND NOT bot AND JSON_VALUE(j.p) = '/'
  UNION ALL
  SELECT DISTINCT '(outbound)', visit FROM clicks WHERE STARTS_WITH(ev, 'out-') OR (ev IS NULL AND host IS NOT NULL)
)
WHERE name IS NOT NULL
GROUP BY name
ORDER BY visitors DESC
