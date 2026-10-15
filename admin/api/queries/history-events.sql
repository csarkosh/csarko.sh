-- GoatCounter's events in [start, end), from the backfilled hourly counts.
SELECT REGEXP_REPLACE(path, r'^/', '') AS name, SUM(visits) AS visitors
FROM `csarko-sh.csarko_history.goatcounter_history`
WHERE hour >= TIMESTAMP(@start) AND hour < TIMESTAMP(@end) AND event
GROUP BY name ORDER BY visitors DESC
