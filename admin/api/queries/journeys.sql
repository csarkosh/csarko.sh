-- The 50 visitors most recently seen in [start, end), each as its journey: where it came from (the
-- first view's referrer, internal path and campaign), the first view's device, the city it was last
-- placed in (s.ct, s.rg, s.cc, from 2026-11-21; NULL before), the network it was last on and its
-- connection hints (lib-visits v0.7.0, from 2026-11-21), its latest 40 page
-- views (newest first here; the API puts them in order) with the engaged seconds, scroll depth and
-- read-to-the-end of that page load's leaves (`re` AND a scroll depth of 50 or more, as in
-- pages.sql) and the LCP, CLS and INP of its vitals row, and its
-- last outbound click. A visitor is the collector's visitor hash (s.vid, lib-visits --visitor, since
-- 2026-11-01), which holds across days, so a browser that comes back lands in the journey it began;
-- rows from before it carry only the daily visit hash, which stands in for it. Leaves, vitals and clicks
-- join their view by the page load's id ONLY: a page load's visit is its view's visit, whatever
-- the later row says (the daily hash can roll between them). A row with neither hash is its own
-- visit. The check beacons (/deploy-check, /depth-check) are
-- left out, and so is every page load (id) that is a bot's or a crawler's (the shared test in
-- _bot.sql).
WITH beacons AS (
  SELECT
    timestamp AS ts,
    JSON_VALUE(json_payload.n) AS n,
    JSON_VALUE(json_payload.id) AS id,
    json_payload AS j,
    -- The shared bot test, queries/_bot.sql: the collector's flag, a Headless brand, an impossible
    -- device, the Linux fleet from google.com and Day Hike's tooling lobby, over the whole page load.
    {{bot}} AS bot
  FROM `csarko-sh.csarko_visits._AllLogs`
  WHERE timestamp >= TIMESTAMP(@start) AND timestamp < TIMESTAMP(@end)
    AND JSON_VALUE(json_payload.p) NOT IN ('/deploy-check', '/depth-check')
),
views AS (
  SELECT
    ts,
    id,
    COALESCE(JSON_VALUE(j.s.vid), JSON_VALUE(j.s.visit), id) AS visit,
    JSON_VALUE(j.p) AS path,
    -- The step's host when it is another of the site's (apps.csarko.sh, donate.csarko.sh): one
    -- visit runs across them, since the collector keys it on the visitor, not the host.
    IF(IFNULL(JSON_VALUE(j.s.host), 'csarko.sh') IN ('csarko.sh', 'www.csarko.sh'), NULL, JSON_VALUE(j.s.host)) AS host,
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
    COALESCE(JSON_VALUE(j.lg), JSON_VALUE(j.s.lg)) AS lg,
    -- The city the collector placed the address in (lib-visits v0.6.0, from 2026-11-21), never the address.
    JSON_VALUE(j.s.ct) AS ct,
    JSON_VALUE(j.s.rg) AS rg,
    JSON_VALUE(j.s.cc) AS cc,
    -- The network and Chromium's connection hints (lib-visits v0.7.0, from 2026-11-21).
    SAFE_CAST(JSON_VALUE(j.s.an) AS INT64) AS an,
    JSON_VALUE(j.s.ao) AS ao,
    JSON_VALUE(j.s.nk) AS nk,
    JSON_VALUE(j.s.ect) AS ect,
    SAFE_CAST(JSON_VALUE(j.s.rtt) AS INT64) AS rtt,
    SAFE_CAST(JSON_VALUE(j.s.dl) AS FLOAT64) AS dl,
    JSON_VALUE(j.s.sd) = 'true' AS sd
  FROM beacons WHERE n = 'view' AND NOT bot
),
leaves AS (
  SELECT
    id,
    MAX(SAFE_CAST(JSON_VALUE(j.e) AS INT64)) AS secs,
    MAX(SAFE_CAST(JSON_VALUE(j.sd) AS INT64)) AS depth,
    LOGICAL_OR(JSON_VALUE(j.re) = 'true') AND MAX(SAFE_CAST(JSON_VALUE(j.sd) AS INT64)) >= 50 AS reached
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
    MAX(ts) AS last_seen,
    ARRAY_AGG(STRUCT(rk, rh, rp, campaign) ORDER BY ts LIMIT 1)[OFFSET(0)] AS source,
    ARRAY_AGG(STRUCT(bn, bv, os, vw, vh, tz, th, tp, lg) ORDER BY ts LIMIT 1)[OFFSET(0)] AS device,
    -- Where the visitor was last placed: a view from before the city database has none.
    ARRAY_AGG(IF(cc IS NULL, NULL, STRUCT(ct, rg, cc)) IGNORE NULLS ORDER BY ts DESC LIMIT 1)[SAFE_OFFSET(0)] AS place,
    -- The network it was last on, and its last connection hints.
    ARRAY_AGG(IF(an IS NULL AND nk IS NULL, NULL, STRUCT(an, ao, nk)) IGNORE NULLS ORDER BY ts DESC LIMIT 1)[SAFE_OFFSET(0)] AS network,
    ARRAY_AGG(IF(ect IS NULL AND rtt IS NULL, NULL, STRUCT(ect, rtt, dl, sd)) IGNORE NULLS ORDER BY ts DESC LIMIT 1)[SAFE_OFFSET(0)] AS connection,
    ARRAY_AGG(STRUCT(FORMAT_TIMESTAMP('%FT%TZ', ts) AS stamp, path, host, title, nt, secs, depth, reached, lcp, cls, inp) ORDER BY ts DESC LIMIT 40) AS steps
  FROM steps GROUP BY visit
)
SELECT FORMAT_TIMESTAMP('%FT%TZ', v.started) AS started, v.source, v.device, v.place, v.network, v.connection, v.steps, o.last_click
FROM visits AS v LEFT JOIN outbound AS o USING (visit)
ORDER BY v.last_seen DESC
LIMIT 50
