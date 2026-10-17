-- Arkos session reports counted by window, current [start, end) and previous [prev_start, start),
-- and version, uncapped: sessions, first sessions (rd = -1) and lost ones (end = 'lost', a crash or
-- a force quit: the crash estimate).
-- @who: 'users' (everyone but Cyrus), 'me' (Cyrus's own Macs: ch = 'dogfood', or s.own, which the
-- collector sets on rows from his addresses) or 'all'.
SELECT
  IF(timestamp >= TIMESTAMP(@start), 'current', 'previous') AS win,
  JSON_VALUE(json_payload.ver) AS ver,
  COUNT(*) AS sessions,
  COUNTIF(SAFE_CAST(JSON_VALUE(json_payload.rd) AS INT64) = -1) AS first,
  COUNTIF(JSON_VALUE(json_payload.`end`) = 'lost') AS lost
FROM `csarko-sh.csarko_visits._AllLogs`
WHERE timestamp >= TIMESTAMP(@prev_start) AND timestamp < TIMESTAMP(@end)
  AND JSON_VALUE(json_payload.app) = 'arkos'
  AND JSON_VALUE(json_payload.k) = 'session'
  AND (@who = 'all' OR (@who = 'me') = (IFNULL(JSON_VALUE(json_payload.ch) = 'dogfood', FALSE) OR IFNULL(JSON_VALUE(json_payload.s.own) = 'true', FALSE)))
GROUP BY win, ver
