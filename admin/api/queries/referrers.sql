-- Where visits came from in [start, end): external hosts and direct, the campaign tags, and the
-- site's own edges (the previous page to this one). The check beacons (/deploy-check, /depth-check) are left out.
WITH views AS (
  SELECT
    JSON_VALUE(json_payload.p) AS path,
    COALESCE(JSON_VALUE(json_payload.s.visit), JSON_VALUE(json_payload.id)) AS visit,
    JSON_VALUE(json_payload.s.rk) AS rk,
    JSON_VALUE(json_payload.s.rh) AS rh,
    JSON_VALUE(json_payload.s.rp) AS rp,
    COALESCE(JSON_VALUE(json_payload.cr), JSON_VALUE(json_payload.us)) AS campaign
  FROM `csarko-sh.csarko_visits._AllLogs`
  WHERE timestamp >= TIMESTAMP(@start) AND timestamp < TIMESTAMP(@end)
    AND JSON_VALUE(json_payload.n) = 'view'
    AND IFNULL(JSON_VALUE(json_payload.s.bot), 'false') != 'true'
    AND JSON_VALUE(json_payload.p) NOT IN ('/deploy-check', '/depth-check')
)
SELECT 'referrer' AS kind, IF(rk = 'direct', '', IFNULL(rh, '')) AS name, '' AS target, COUNT(DISTINCT visit) AS visitors
FROM views WHERE rk IN ('direct', 'external') GROUP BY name
UNION ALL
SELECT 'campaign', campaign, '', COUNT(DISTINCT visit) FROM views WHERE campaign IS NOT NULL GROUP BY campaign
UNION ALL
SELECT 'internal', rp, path, COUNT(DISTINCT visit) FROM views WHERE rk = 'internal' AND rp IS NOT NULL GROUP BY rp, path
ORDER BY visitors DESC
