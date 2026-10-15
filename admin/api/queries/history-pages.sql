-- GoatCounter's pages by visitors in [start, end), from the backfilled hourly counts.
SELECT path, ANY_VALUE(title) AS title, SUM(visits) AS visitors
FROM `csarko-sh.csarko_history.goatcounter_history`
WHERE hour >= TIMESTAMP(@start) AND hour < TIMESTAMP(@end) AND NOT event
GROUP BY path ORDER BY visitors DESC LIMIT 200
