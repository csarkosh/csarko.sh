# Task 1 report

Commit 310d127 "donate: doors, tiers and the price rule, pure".

Implemented: admin/api/src/donate/doors.mjs, prices.mjs; `commercial` in PROJECTS (projects.mjs, header comment says five); `--proj-5` in both admin:palette blocks of theme.css (dark #1ca7c9 6.6:1 on #111318, light #0a8fa8 3.8:1 on #fff; cyan, hue ~190, unused by the other tones; validator runs in Task 11); tests as in the brief.

TDD: RED `node --test test/donate-prices.test.mjs test/finance.test.mjs` -> Cannot find module doors.mjs, and the PROJECT_KEYS assertion failed (pass 29, fail 2). GREEN `npm test` in admin/api -> tests 201, pass 201, fail 0.

Deviations / concerns:
1. The brief's poolOf test has a gcp magicpixel row with `project: "commercial"` expected excluded, but projectOf ignores `row.project` and routes that row to "other" (the finance test pins that). So poolOf excludes `r.project === "commercial" || projectOf(r) === "commercial"`.
2. finance.test.mjs: besides the brief's change, the PROJECTS labels assertion and the projectsTable deepEqual (a `commercial` row of zeros) had to change.
3. Chart colours go by position (j1..j5): Commercial is 4th (j4 = --proj-4, neutral grey) and Other 5th (j5 = cyan). Task 11 / the By project chart should swap, or --proj-4/--proj-5 should be exchanged. Also theme.css j5 CSS class and AGENTS.md "--proj-1 to --proj-4" text not updated (out of scope).
4. The hallway focusY is 0.25 (portrait 1080x1440; 16:9 crop = 42% height; face in frame). Picture donate/body-of-work.png does not exist yet.
