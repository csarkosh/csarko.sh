-- The 50 most recent visits in [start, end), each as its journey: where it came from (the first
-- view's referrer, internal path and campaign), the first view's device, every page it viewed in
-- order with the engaged seconds, scroll depth and read-to-the-end of that page load's leaves and
-- the LCP, CLS and INP of its vitals row, and its last outbound click. Leaves, vitals and clicks
-- join their view by the page load's id ONLY: a page load's visit is its view's visit, whatever
-- the later row says (the daily hash can roll between them). A visit is the collector's daily
-- hash; a row without one is its own visit. The check beacons (/deploy-check, /depth-check) are
-- left out, and so is every page load (id) that any of its rows calls a bot (Lighthouse's view
-- says bot=false, its leave and vitals true).
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
    id,
    COALESCE(JSON_VALUE(j.s.visit), id) AS visit,
    JSON_VALUE(j.p) AS path,
    JSON_VALUE(j.t) AS title,
    JSON_VALUE(j.nt) AS nt,
    JSON_VALUE(j.s.rk) AS rk,
    JSON_VALUE(j.s.rh) AS rh,
    JSON_VALUE(j.s.rp) AS rp,
    COALESCE(JSON_VALUE(j.cr), JSON_VALUE(j.us)) AS campaign,
    JSON_VALUE(j.s.bn) AS bn,
    JSON_VALUE(j.s.bv) AS bv,
    JSON_VALUE(j.s.os) AS os,
    SAFE_CAST(JSON_VALUE(j.vw) AS INT64) AS vw,
    SAFE_CAST(JSON_VALUE(j.vh) AS INT64) AS vh,
    JSON_VALUE(j.tz) AS tz,
    JSON_VALUE(j.th) AS th,
    IFNULL(JSON_VALUE(j.tp) = 'true', FALSE) AS tp,
    COALESCE(JSON_VALUE(j.lg), JSON_VALUE(j.s.lg)) AS lg
  FROM beacons WHERE n = 'view' AND NOT bot
),
leaves AS (
  SELECT
    id,
    MAX(SAFE_CAST(JSON_VALUE(j.e) AS INT64)) AS secs,
    MAX(SAFE_CAST(JSON_VALUE(j.sd) AS INT64)) AS depth,
    LOGICAL_OR(JSON_VALUE(j.re) = 'true') AS reached
  FROM beacons WHERE n = 'leave' GROUP BY id
),
vitals AS (
  SELECT
    id,
    MAX(SAFE_CAST(JSON_VALUE(j.d.lcp) AS FLOAT64)) AS lcp,
    MAX(SAFE_CAST(JSON_VALUE(j.d.cls) AS FLOAT64)) AS cls,
    MAX(SAFE_CAST(JSON_VALUE(j.d.inp) AS FLOAT64)) AS inp
  FROM beacons WHERE n = 'vitals' GROUP BY id
),
loads AS (
  SELECT id, ANY_VALUE(visit) AS visit FROM views GROUP BY id
),
outbound AS (
  SELECT
    l.visit,
    ARRAY_AGG(STRUCT(FORMAT_TIMESTAMP('%FT%TZ', c.ts) AS stamp, JSON_VALUE(c.j.ev) AS ev, JSON_VALUE(c.j.u) AS u) ORDER BY c.ts DESC LIMIT 1)[OFFSET(0)] AS last_click
  FROM beacons c JOIN loads l USING (id)
  WHERE c.n = 'click' AND JSON_VALUE(c.j.u) IS NOT NULL
  GROUP BY l.visit
),
steps AS (
  SELECT v.*, l.secs, l.depth, IFNULL(l.reached, FALSE) AS reached, t.lcp, t.cls, t.inp
  FROM views v LEFT JOIN leaves l USING (id) LEFT JOIN vitals t USING (id)
),
visits AS (
  SELECT
    visit,
    MIN(ts) AS started,
    ARRAY_AGG(STRUCT(rk, rh, rp, campaign) ORDER BY ts LIMIT 1)[OFFSET(0)] AS source,
    ARRAY_AGG(STRUCT(bn, bv, os, vw, vh, tz, th, tp, lg) ORDER BY ts LIMIT 1)[OFFSET(0)] AS device,
    ARRAY_AGG(STRUCT(FORMAT_TIMESTAMP('%FT%TZ', ts) AS stamp, path, title, nt, secs, depth, reached, lcp, cls, inp) ORDER BY ts LIMIT 40) AS steps
  FROM steps GROUP BY visit
)
SELECT FORMAT_TIMESTAMP('%FT%TZ', v.started) AS started, v.source, v.device, v.steps, o.last_click
FROM visits AS v LEFT JOIN outbound AS o USING (visit)
ORDER BY v.started DESC
LIMIT 50
