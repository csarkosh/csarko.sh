-- Where the visitors are, one line a city, in [start, end) (Cyrus, 2026-11-21, as Day Hike's admin
-- has). The collector looks each address up in its bundled city database (DB-IP's IP to City Lite,
-- lib-visits v0.6.0) and writes the country (`s.cc`), the region (`s.rg`), the city (`s.ct`) and the
-- city's coordinates (`s.la`, `s.lo`, to a tenth of a degree), never the address. A visit (the
-- daily hash) counts once, at the first place it was seen in; the visits seen with no place (every
-- one before 2026-11-21, or an address the database does not know) are the one row with no country.
-- The check beacons (/deploy-check, /depth-check) are left out, and so is every page load (id) that
-- is a bot's or a crawler's (the shared test in _bot.sql).
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
per_visit AS (
  SELECT
    COALESCE(JSON_VALUE(j.s.visit), id) AS visit,
    ANY_VALUE(JSON_VALUE(j.s.cc) HAVING MIN IF(JSON_VALUE(j.s.cc) IS NULL, NULL, ts)) AS country,
    ANY_VALUE(JSON_VALUE(j.s.rg) HAVING MIN IF(JSON_VALUE(j.s.cc) IS NULL, NULL, ts)) AS region,
    ANY_VALUE(JSON_VALUE(j.s.ct) HAVING MIN IF(JSON_VALUE(j.s.cc) IS NULL, NULL, ts)) AS city,
    ANY_VALUE(SAFE_CAST(JSON_VALUE(j.s.la) AS FLOAT64) HAVING MIN IF(JSON_VALUE(j.s.cc) IS NULL, NULL, ts)) AS lat,
    ANY_VALUE(SAFE_CAST(JSON_VALUE(j.s.lo) AS FLOAT64) HAVING MIN IF(JSON_VALUE(j.s.cc) IS NULL, NULL, ts)) AS lon,
    MAX(ts) AS last_seen
  FROM beacons WHERE n = 'view' AND NOT bot
  GROUP BY visit
)
SELECT
  city,
  region,
  country,
  ROUND(AVG(lat), 1) AS lat,
  ROUND(AVG(lon), 1) AS lon,
  COUNT(*) AS visitors,
  MAX(last_seen) AS last_seen
FROM per_visit
GROUP BY city, region, country
ORDER BY visitors DESC, last_seen DESC
LIMIT 200
