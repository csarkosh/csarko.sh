-- The bot test every visits query shares: the collector splices this file in wherever a query says
-- {{bot}} (collectors/visits.mjs), inside its `beacons` step, where each row is one log line. It is
-- TRUE on every row of a page load (one id) that is a bot's or a crawler's, and never NULL:
--   flag      any of the load's rows carries the collector's own flag (s.bot), or names a browser
--             brand starting Headless (the client hints' HeadlessChrome, under a User-Agent that
--             claims a real browser). Lighthouse's view said bot=false while its leave and vitals
--             said true, so the flag is read over the whole page load, not the one row.
--   device    the load's view reports a device no real one is (2026-11-13; rule codes D1 to D4):
--             D1 a viewport larger than its screen, on the 800x600 screen a headless Chrome has
--                by default, at pixel ratio 1. Only that screen: a reader on a scaled display
--                who zooms out (125% scaling at 80% zoom) also reports pixel ratio 1 and a
--                viewport wider than the screen, and every catch in four weeks was 800x600;
--             D2 a square screen;
--             D3 a viewport that is the whole screen at pixel ratio 1 (no browser frame, no OS bar);
--             D4 a phone-width viewport (480 px or less) at pixel ratio 1, or on a named desktop
--                OS (Windows, macOS, Linux, ChromeOS) whose screen is phone-width too. A narrow
--                window on a desktop at a higher pixel ratio (a split view, a zoomed half
--                screen) is a person, and so is a phone whose OS the collector cannot name.
--             Firefox is spared D2 and D3: its resist-fingerprinting mode (Tor Browser, Mullvad
--             Browser, LibreWolf) reports the window as the screen.
--   fleet     F1: Chrome on Linux, a 1920x1080 screen at pixel ratio 1, a viewport of 1919x992 or
--             more (Chrome's own bars and nothing else, so no desktop panel), the light theme,
--             arriving from google.com, and the load never sent a leave: a cloud box's default
--             profile, the browser killed and not closed. A person on that exact desktop counts
--             from their first leave on (the first time the tab is hidden or closed).
--   rig       T1: the load's visit (the daily hash) opened Day Hike's tooling lobby, the fixed game
--             id its capture and frame-budget tools use; every load of that visit.
-- Checked against four weeks of rows, 2026-10-15 to 2026-11-13: of 458 page loads the flag missed,
-- 178 were crawlers by hand and 277 were people; this drops 151 of the 178 and none of the people.
-- It can drop a real reader in four known cases (none of the 277 people was one): a browser other
-- than Firefox in true full screen on a pixel-ratio-1 display (D3); a window 480 px wide or less
-- at pixel ratio 1, such as a browser's side panel or DevTools' responsive mode (D4); a phone
-- emulated in DevTools on a desktop (D4); and F1's exact desktop until its first leave.
-- What it leaves in on purpose is in admin/CONTRACT.md ("Bots, crawlers and checks").
(
  IFNULL(LOGICAL_OR(
    IFNULL(JSON_VALUE(json_payload.s.bot), 'false') = 'true'
    OR STARTS_WITH(IFNULL(JSON_VALUE(json_payload.s.bn), ''), 'Headless')
    OR (JSON_VALUE(json_payload.n) = 'view' AND IFNULL(
      -- D1
      (SAFE_CAST(JSON_VALUE(json_payload.dpr) AS FLOAT64) = 1
        AND SAFE_CAST(JSON_VALUE(json_payload.sw) AS INT64) = 800
        AND SAFE_CAST(JSON_VALUE(json_payload.sh) AS INT64) = 600
        AND (SAFE_CAST(JSON_VALUE(json_payload.vw) AS INT64) > 800
          OR SAFE_CAST(JSON_VALUE(json_payload.vh) AS INT64) > 600))
      -- D2 and D3
      OR (IFNULL(JSON_VALUE(json_payload.s.bn), '') != 'Firefox'
        AND SAFE_CAST(JSON_VALUE(json_payload.sw) AS INT64) > 0
        AND (SAFE_CAST(JSON_VALUE(json_payload.sw) AS INT64) = SAFE_CAST(JSON_VALUE(json_payload.sh) AS INT64)
          OR (SAFE_CAST(JSON_VALUE(json_payload.dpr) AS FLOAT64) = 1
            AND SAFE_CAST(JSON_VALUE(json_payload.vw) AS INT64) = SAFE_CAST(JSON_VALUE(json_payload.sw) AS INT64)
            AND SAFE_CAST(JSON_VALUE(json_payload.vh) AS INT64) = SAFE_CAST(JSON_VALUE(json_payload.sh) AS INT64))))
      -- D4
      OR (SAFE_CAST(JSON_VALUE(json_payload.vw) AS INT64) BETWEEN 1 AND 480
        AND (SAFE_CAST(JSON_VALUE(json_payload.dpr) AS FLOAT64) = 1
          OR (JSON_VALUE(json_payload.s.os) IN ('Windows', 'macOS', 'Linux', 'ChromeOS')
            AND SAFE_CAST(JSON_VALUE(json_payload.sw) AS INT64) BETWEEN 1 AND 480))),
      FALSE))
  ) OVER (PARTITION BY JSON_VALUE(json_payload.id)), FALSE)
  -- F1
  OR (
    IFNULL(LOGICAL_OR(
      JSON_VALUE(json_payload.n) = 'view'
      AND JSON_VALUE(json_payload.s.bn) = 'Chrome' AND JSON_VALUE(json_payload.s.os) = 'Linux'
      AND SAFE_CAST(JSON_VALUE(json_payload.sw) AS INT64) = 1920 AND SAFE_CAST(JSON_VALUE(json_payload.sh) AS INT64) = 1080
      AND SAFE_CAST(JSON_VALUE(json_payload.vw) AS INT64) >= 1919 AND SAFE_CAST(JSON_VALUE(json_payload.vh) AS INT64) >= 992
      AND SAFE_CAST(JSON_VALUE(json_payload.dpr) AS FLOAT64) = 1 AND JSON_VALUE(json_payload.th) = 'light'
      AND JSON_VALUE(json_payload.s.rk) = 'external' AND JSON_VALUE(json_payload.s.rh) = 'google.com'
    ) OVER (PARTITION BY JSON_VALUE(json_payload.id)), FALSE)
    AND NOT IFNULL(LOGICAL_OR(JSON_VALUE(json_payload.n) = 'leave') OVER (PARTITION BY JSON_VALUE(json_payload.id)), FALSE)
  )
  -- T1
  OR IFNULL(LOGICAL_OR(
    JSON_VALUE(json_payload.p) = '/dayhike/game/0f1c2a3b-4d5e-4f60-8a9b-0c1d2e3f4a5b'
  ) OVER (PARTITION BY COALESCE(JSON_VALUE(json_payload.s.visit), JSON_VALUE(json_payload.id))), FALSE)
)
