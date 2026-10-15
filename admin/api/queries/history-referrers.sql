-- GoatCounter's referrers in [start, end), from the backfilled hourly counts.
SELECT 'referrer' AS kind, IFNULL(ref, '') AS name, '' AS target, SUM(visits) AS visitors
FROM `csarko-sh.csarko_history.goatcounter_history`
WHERE hour >= TIMESTAMP(@start) AND hour < TIMESTAMP(@end) AND NOT event
GROUP BY name ORDER BY visitors DESC
