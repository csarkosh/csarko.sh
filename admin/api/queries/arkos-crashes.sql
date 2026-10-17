-- Arkos crash reports (k = 'crash', each one agreed to) in the current window [start, end) and the
-- previous one [prev_start, start), newest first, at most 5,000: grouped in code by failure point
-- (`pk`, and the cause hash `mh` for 'other'), the newest report's frames, image and commit kept so
-- the offsets can be symbolicated. `frames` and `images` come back as JSON text.
SELECT
  IF(timestamp >= TIMESTAMP(@start), 'current', 'previous') AS win,
  FORMAT_TIMESTAMP('%FT%TZ', timestamp) AS received,
  JSON_VALUE(json_payload.ver) AS ver,
  JSON_VALUE(json_payload.pk) AS pk,
  JSON_VALUE(json_payload.mh) AS mh,
  JSON_VALUE(json_payload.file) AS file,
  SAFE_CAST(JSON_VALUE(json_payload.line) AS INT64) AS line,
  JSON_VALUE(json_payload.up) AS up,
  JSON_VALUE(json_payload.commit) AS commit,
  TO_JSON_STRING(json_payload.frames) AS frames,
  TO_JSON_STRING(json_payload.images) AS images
FROM `csarko-sh.csarko_visits._AllLogs`
WHERE timestamp >= TIMESTAMP(@prev_start) AND timestamp < TIMESTAMP(@end)
  AND JSON_VALUE(json_payload.app) = 'arkos'
  AND JSON_VALUE(json_payload.k) = 'crash'
ORDER BY timestamp DESC
LIMIT 5000
