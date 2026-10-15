-- GoatCounter's events in [start, end), from the backfilled hourly counts, and the home page's visitors as "(home)".
SELECT name, visitors FROM (
  SELECT REGEXP_REPLACE(path, r'^/', '') AS name, SUM(visits) AS visitors
  FROM `csarko-sh.csarko_history.goatcounter_history`
  WHERE hour >= TIMESTAMP(@start) AND hour < LEAST(TIMESTAMP(@end), TIMESTAMP(@until)) AND event
  GROUP BY name
  UNION ALL
  SELECT '(home)' AS name, SUM(visits) AS visitors
  FROM `csarko-sh.csarko_history.goatcounter_history`
  WHERE hour >= TIMESTAMP(@start) AND hour < LEAST(TIMESTAMP(@end), TIMESTAMP(@until)) AND NOT event AND path = '/'
)
ORDER BY visitors DESC
