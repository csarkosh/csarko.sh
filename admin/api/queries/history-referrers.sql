-- GoatCounter's referrers in [start, end), from the backfilled hourly counts. The site's own hosts
-- (csarko.sh, its subdomains, the Firebase preview channels) are left out, as the live query counts
-- a visit by its first view's referrer and never by a page of the site's own.
SELECT 'referrer' AS kind, IFNULL(ref, '') AS name, '' AS target, SUM(visits) AS visitors
FROM `csarko-sh.csarko_history.goatcounter_history`
WHERE hour >= TIMESTAMP(@start) AND hour < LEAST(TIMESTAMP(@end), TIMESTAMP(@until)) AND NOT event
  AND NOT REGEXP_CONTAINS(IFNULL(ref, ''), r'(^|\.)csarko\.sh(/|$)|--preview-[^.]*\.web\.app(/|$)|^csarko-sh\.web\.app(/|$)')
GROUP BY name ORDER BY visitors DESC
