-- GoatCounter's visits a day in [start, end), for the window's part before the cutover, the days
-- cut in @tz as visits.sql's are (the history is hourly, so a whole-hour zone re-cuts exactly).
SELECT IF(hour >= TIMESTAMP(@start), 'current', 'previous') AS win, DATE(hour, @tz) AS day, SUM(visits) AS visits
FROM `csarko-sh.csarko_history.goatcounter_history`
WHERE hour >= TIMESTAMP(@prev_start) AND hour < LEAST(TIMESTAMP(@end), TIMESTAMP(@until)) AND NOT event
GROUP BY win, day
ORDER BY day
