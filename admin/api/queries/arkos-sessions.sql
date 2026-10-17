-- The newest Arkos session reports (k = 'session', sent only with usage reports on) in [start, end),
-- newest first, at most 5,000: the rows the journey is aggregated from in code (src/arkos.mjs) and
-- the recent sessions listed in full. `received` is the row's time, which is when the report
-- arrived: it is sent after its run ended. Numbers may arrive as JSON numbers or strings, so each is
-- cast; `focus` and `ev` come back as JSON text.
SELECT
  FORMAT_TIMESTAMP('%FT%TZ', timestamp) AS received,
  JSON_VALUE(json_payload.ver) AS ver,
  SAFE_CAST(JSON_VALUE(json_payload.osv) AS INT64) AS osv,
  JSON_VALUE(json_payload.arch) AS arch,
  SAFE_CAST(JSON_VALUE(json_payload.len) AS INT64) AS len,
  JSON_VALUE(json_payload.`end`) AS ended,
  SAFE_CAST(JSON_VALUE(json_payload.rd) AS INT64) AS rd,
  SAFE_CAST(JSON_VALUE(json_payload.iw) AS INT64) AS iw,
  TO_JSON_STRING(json_payload.focus) AS focus,
  TO_JSON_STRING(json_payload.ev) AS ev,
  SAFE_CAST(JSON_VALUE(json_payload.ev_dropped) AS INT64) AS ev_dropped,
  SAFE_CAST(JSON_VALUE(json_payload.ev_rejected) AS INT64) AS ev_rejected
FROM `csarko-sh.csarko_visits._AllLogs`
WHERE timestamp >= TIMESTAMP(@start) AND timestamp < TIMESTAMP(@end)
  AND JSON_VALUE(json_payload.app) = 'arkos'
  AND JSON_VALUE(json_payload.k) = 'session'
ORDER BY timestamp DESC
LIMIT 5000
