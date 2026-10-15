-- The 25 most recent visits in [start, end), each as its journey: where it came from (the first
-- view's referrer and campaign), every page it viewed in order with the engaged seconds, scroll
-- depth and read-to-the-end of that page's leave beacon (matched by the page load's id), and its
-- last outbound click. A visit is the collector's daily hash; a row without one is its own visit.
-- Bots and the deploy and depth checks (/deploy-check, /depth-check) are left out.
WITH ev AS (
  SELECT
    timestamp AS ts,
    JSON_VALUE(json_payload.n) AS n,
    JSON_VALUE(json_payload.id) AS pid,
    JSON_VALUE(json_payload.p) AS path,
    JSON_VALUE(json_payload.t) AS title,
    COALESCE(JSON_VALUE(json_payload.s.visit), JSON_VALUE(json_payload.id)) AS visit,
    JSON_VALUE(json_payload.s.rk) AS rk,
    JSON_VALUE(json_payload.s.rh) AS rh,
    COALESCE(JSON_VALUE(json_payload.cr), JSON_VALUE(json_payload.us)) AS campaign,
    SAFE_CAST(JSON_VALUE(json_payload.e) AS INT64) AS secs,
    SAFE_CAST(JSON_VALUE(json_payload.sd) AS INT64) AS depth,
    JSON_VALUE(json_payload.re) = 'true' AS reached,
    JSON_VALUE(json_payload.ev) AS event,
    JSON_VALUE(json_payload.u) AS url
  FROM `csarko-sh.csarko_visits._AllLogs`
  WHERE timestamp >= TIMESTAMP(@start) AND timestamp < TIMESTAMP(@end)
    AND JSON_VALUE(json_payload.n) IN ('view', 'leave', 'click')
    AND IFNULL(JSON_VALUE(json_payload.s.bot), 'false') != 'true'
    AND JSON_VALUE(json_payload.p) NOT IN ('/deploy-check', '/depth-check')
),
leaves AS (
  SELECT visit, pid, MAX(secs) AS secs, MAX(depth) AS depth, LOGICAL_OR(IFNULL(reached, FALSE)) AS reached
  FROM ev WHERE n = 'leave' GROUP BY visit, pid
),
pages AS (
  SELECT v.visit, v.ts, v.path, v.title, v.rk, v.rh, v.campaign, l.secs, l.depth, IFNULL(l.reached, FALSE) AS reached
  FROM ev AS v LEFT JOIN leaves AS l USING (visit, pid)
  WHERE v.n = 'view'
),
outbound AS (
  SELECT visit, ARRAY_AGG(STRUCT(FORMAT_TIMESTAMP('%FT%TZ', ts) AS stamp, event, url) ORDER BY ts DESC LIMIT 1)[OFFSET(0)] AS last_click
  FROM ev WHERE n = 'click' AND url IS NOT NULL GROUP BY visit
),
visits AS (
  SELECT
    visit,
    MIN(ts) AS started,
    ARRAY_AGG(STRUCT(rk, rh, campaign) ORDER BY ts LIMIT 1)[OFFSET(0)] AS source,
    ARRAY_AGG(STRUCT(FORMAT_TIMESTAMP('%FT%TZ', ts) AS stamp, path, title, secs, depth, reached) ORDER BY ts LIMIT 20) AS steps
  FROM pages GROUP BY visit
)
SELECT FORMAT_TIMESTAMP('%FT%TZ', v.started) AS started, v.source, v.steps, o.last_click
FROM visits AS v LEFT JOIN outbound AS o USING (visit)
ORDER BY v.started DESC
LIMIT 25
