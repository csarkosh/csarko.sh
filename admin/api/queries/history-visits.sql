-- GoatCounter's visits a day in [start, end), for the window's part before the cutover.
SELECT IF(hour >= TIMESTAMP(@start), 'current', 'previous') AS window, DATE(hour) AS day, SUM(visits) AS visits
FROM `csarko-sh.csarko_history.goatcounter_history`
WHERE hour >= TIMESTAMP(@prev_start) AND hour < TIMESTAMP(@end) AND NOT event
GROUP BY window, day
ORDER BY day
