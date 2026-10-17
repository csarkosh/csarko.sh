-- Arkos update checks (k = 'check', one a Mac a UTC day, no consent) in the current window
-- [start, end) and the previous one [prev_start, start), both whole UTC days. Distinct Macs are
-- counted without an id from `rd`, the days since that Mac's previous check (-1 the first time): a
-- check on day i of its window (0 the window's first day) is that Mac's first in the window exactly
-- when rd = -1 or rd > i, so `macs` counts those rows. A check whose rd is missing or not a number
-- still counts as a check but never as a Mac's first. One row a dimension, value and window:
--   day      name = the UTC date; checks (= that day's active Macs), installs (rd = -1), back (rd >= 7), macs
--   rhythm   name = new | 1 | 2-6 | 7+ by rd, current window; checks
--   version, macos, arch   name = ver, osv, arch of each Mac's first check in the current window; macs
WITH checks AS (
  SELECT
    IF(timestamp >= TIMESTAMP(@start), 'current', 'previous') AS win,
    DATE(timestamp) AS day,
    SAFE_CAST(JSON_VALUE(json_payload.rd) AS INT64) AS rd,
    JSON_VALUE(json_payload.ver) AS ver,
    JSON_VALUE(json_payload.osv) AS osv,
    JSON_VALUE(json_payload.arch) AS arch
  FROM `csarko-sh.csarko_visits._AllLogs`
  WHERE timestamp >= TIMESTAMP(@prev_start) AND timestamp < TIMESTAMP(@end)
    AND JSON_VALUE(json_payload.app) = 'arkos'
    AND JSON_VALUE(json_payload.k) = 'check'
),
marked AS (
  SELECT
    *,
    IFNULL(rd = -1 OR rd > DATE_DIFF(day, DATE(TIMESTAMP(IF(win = 'current', @start, @prev_start))), DAY), FALSE) AS first
  FROM checks
)
SELECT 'day' AS dim, win, FORMAT_DATE('%F', day) AS name, COUNT(*) AS checks, COUNTIF(rd = -1) AS installs, COUNTIF(rd >= 7) AS back, COUNTIF(first) AS macs
FROM marked GROUP BY win, day
UNION ALL
SELECT 'rhythm', win, CASE WHEN rd = -1 THEN 'new' WHEN rd <= 1 THEN '1' WHEN rd <= 6 THEN '2-6' ELSE '7+' END, COUNT(*), 0, 0, 0
FROM marked WHERE win = 'current' AND rd >= -1 GROUP BY 2, 3
UNION ALL
SELECT 'version', win, ver, 0, 0, 0, COUNT(*) FROM marked WHERE win = 'current' AND first GROUP BY win, ver
UNION ALL
SELECT 'macos', win, osv, 0, 0, 0, COUNT(*) FROM marked WHERE win = 'current' AND first GROUP BY win, osv
UNION ALL
SELECT 'arch', win, arch, 0, 0, 0, COUNT(*) FROM marked WHERE win = 'current' AND first GROUP BY win, arch
