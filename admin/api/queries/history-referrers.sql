-- GoatCounter's referrers in [start, end), from the backfilled hourly counts. The site's own host
-- is left out, as the live query leaves internal views out of its referrers.
SELECT 'referrer' AS kind, IFNULL(ref, '') AS name, '' AS target, SUM(visits) AS visitors
FROM `csarko-sh.csarko_history.goatcounter_history`
WHERE hour >= TIMESTAMP(@start) AND hour < LEAST(TIMESTAMP(@end), TIMESTAMP(@until)) AND NOT event
  AND IFNULL(ref, '') != 'csarko.sh'
GROUP BY name ORDER BY visitors DESC
