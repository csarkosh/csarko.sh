-- Arkos's index card: twelve weeks of whole UTC days [start, end), week 0 the oldest and week 11
-- the 7 days ending today. One row a dimension:
--   week     checks, installs (rd = -1), macs (distinct Macs that week: a check on day i of its week is
--            that Mac's first in it exactly when rd = -1 or rd > i), sessions, lost (end = 'lost')
--            and crashes
--   crash24  crash reports since @since (the last 24 hours) by version
--   seen     every version seen in week 11, of any kind, so the code can pick the newest
-- @who: 'users' (everyone but Cyrus), 'me' (Cyrus's own Macs: ch = 'dogfood', or s.own, which the
-- collector sets on rows from his addresses) or 'all'.
WITH arkos AS (
  SELECT
    timestamp AS ts,
    JSON_VALUE(json_payload.k) AS k,
    JSON_VALUE(json_payload.ver) AS ver,
    SAFE_CAST(JSON_VALUE(json_payload.rd) AS INT64) AS rd,
    JSON_VALUE(json_payload.`end`) AS ended,
    DIV(DATE_DIFF(DATE(timestamp), DATE(TIMESTAMP(@start)), DAY), 7) AS week,
    MOD(DATE_DIFF(DATE(timestamp), DATE(TIMESTAMP(@start)), DAY), 7) AS i
  FROM `csarko-sh.csarko_visits._AllLogs`
  WHERE timestamp >= TIMESTAMP(@start) AND timestamp < TIMESTAMP(@end)
    AND JSON_VALUE(json_payload.app) = 'arkos'
    AND JSON_VALUE(json_payload.k) IN ('check', 'session', 'crash')
    AND (@who = 'all' OR (@who = 'me') = (IFNULL(JSON_VALUE(json_payload.ch) = 'dogfood', FALSE) OR IFNULL(JSON_VALUE(json_payload.s.own) = 'true', FALSE)))
)
SELECT
  'week' AS dim, week, CAST(NULL AS STRING) AS ver,
  COUNTIF(k = 'check') AS checks,
  COUNTIF(k = 'check' AND rd = -1) AS installs,
  COUNTIF(k = 'check' AND (rd = -1 OR rd > i)) AS macs,
  COUNTIF(k = 'session') AS sessions,
  COUNTIF(k = 'session' AND ended = 'lost') AS lost,
  COUNTIF(k = 'crash') AS crashes
FROM arkos GROUP BY week
UNION ALL
SELECT 'crash24', NULL, ver, 0, 0, 0, 0, 0, COUNT(*) FROM arkos WHERE k = 'crash' AND ts >= TIMESTAMP(@since) GROUP BY ver
UNION ALL
SELECT 'seen', NULL, ver, 0, 0, 0, 0, 0, 0 FROM arkos WHERE week = 11 AND ver IS NOT NULL GROUP BY ver
