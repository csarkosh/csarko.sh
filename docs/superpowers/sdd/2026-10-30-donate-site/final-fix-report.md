# Final fix wave: report (branch `donate`, from d827c5b)

Status: DONE. Five commits, one per numbered item, in the brief's order.

| Item | Commit | Subject |
|---|---|---|
| 1 | d9787a9 | Buy me tokens: a launch flag gates the entrances until donate.csarko.sh is live |
| 2 | d720a7d | donate: a door's five links in one batch, and the day in each idempotency key |
| 3 | e01a930 | donate: the sweep keeps last month's links live for one more month |
| 4 | a61574e | donate: hold the month's prices until GCP's export covers it; how to redo a month |
| 5 | 2a7c969 | docs: the apps bar's Buy me tokens, the donate infra, five project tones, 30 links |

## 1. The launch flag

- `admin/api/src/donate/doors.mjs`: `export const DONATE_LIVE = false`, with the comment the brief gives (flipped by the launch commit, plan Task 9 Step 3; until then the entrances render nothing).
- `docs_lib.mjs`: `tokensLink(project, live = DONATE_LIVE)` returns `''` when not live; `projectCard(project, pad, { live = DONATE_LIVE } = {})`, `projectsPage(projects, theme, { live = DONATE_LIVE } = {})` and `buildSite({ ..., live = DONATE_LIVE })` thread it. The symbol is emitted only when some card carries the line.
- One step beyond the brief's wording, needed for its "no `card-tokens`" assertion: the `.card-tokens` rules and `ICON_CSS` moved out of `PROJECTS_CSS` into a `TOKENS_CSS` constant that `projectsPage` appends only when a card carries the line. Without that the CSS selector alone kept `card-tokens` in the page. With `live: true` the page is the same as before apart from where those three CSS lines sit in the style block (after the 640px media query instead of before it; no rule in that query touches them).
- `apps/product.mjs`: `productPage({ ..., live = DONATE_LIVE })`; the bar link only when `live && door?.shipped`. `prepareReadme` still drops the README snippet either way, so before launch the page carries no Buy me tokens at all.
- Tests: the Task 10 tests now pass `live: true` (`projectsPage(projects, theme, { live: true })`, `productPage({ ..., live: true })`) and keep passing; each gained the default-flag assertion (projects page: no `card-tokens`, no `<symbol id="tokens-icon"`; product page: no "Buy me tokens").
- `generate-assets.sh` run: `public/projects/index.html` is 50,616 B with no `card-tokens`, `tokens-icon` or "Buy me tokens" (was 54,538 B). A second run leaves `public/` unchanged.
- `check.py` budget comment and the AGENTS.md Projects bullet say "54,538 B with the five Buy me tokens lines, about 50.6 KB without"; the 60,000 budget is unchanged.
- Plan Task 9 Step 3 now reads, in order: set `DONATE_LIVE = true`, `generate-assets.sh`, commit, `donate/deploy.sh` (and the Stripe checkout look), then `deploy.sh` and `apps/deploy.sh`; `gcloud run deploy csarko-admin` is not needed for the flag since the API never reads it. The AGENTS.md `donate/` row carries the flag in one sentence.

## 2. The 60 s budget and the keys

- `step.mjs` `linksFor`: the five tier keys of one door go through `Promise.all` (every lookup and `need()` kept); doors still one after another. The header comment names the budget (the snapshot route has 60 s, the step must stay well under 30 s) and the shape of a first run (about ten sequential creates, then one batch a door).
- Keys: `donate:price:<month>:<tier>:<today>` (the custom price too, `donate:price:<month>:own:<today>`), `donate:link:<month>:<door>:<tier>:<today>`; products unchanged (`donate:product:<tier>`). The header says the lookups are the duplicate guard and the keys guard a same-run retry, and why (Stripe replays a key's first answer, a 500 included, for 24 hours).
- Tests (`donate-step.test.mjs`): the pinned key strings carry `:2026-11-03`, plus the custom price's key and a product key without a day. "A Stripe failure midway" now checks that a same-day rerun repeats the keys and that the next day's are all new except the five product keys. No order assertion needed changing: the fake writer records each create when it is invoked, and `Promise.all` invokes them in tier order, so the "two of five links found" test's `["context", "run", "finetune"]` still holds.

## 3. The sweep keeps the previous month

- `step.mjs` `sweep(month)`: `keep = addMonths(month, -1)`; links are deactivated when `metadata.month < keep`, prices archived when the month in `lookup_key` (`/^donate:(\d{4}-\d{2}):/`) is `< keep`. A donate link without a month string is now left alone (before, anything `!== month` went). The header comment explains the baked fallback and the monthly redeploy.
- Tests: the next-month test now holds September and October objects; the Dec 4 sweep retires September's two links and five prices, and October's survive. The failing-sweep test's objects moved from 2026-09 to 2026-08 (September is the previous month there, so it would now be kept).
- Spec section 4: step 5 rewritten (last month's links stay live one more month, swept on the first snapshot after the following month's prices land, so the baked fallback always pays; dated "Amended Oct 30 after the branch review"); a "monthly redeploy" paragraph, dated the same way, says `donate/deploy.sh` is re-run after each month's prices land, a line in Cyrus's monthly routine keyed to the Finance page's prices line; the snapshot paragraph now says the record is `{ month, pool, at, doors }` and the bucket JSON is the source of truth for the ids. Plan Task 13 gained the monthly redeploy; the AGENTS.md `donate/` row says to re-run `donate/deploy.sh` each month.

## 4. The GCP hold and the redo

- `finance-queries.mjs` `snapshotPart`: inside the donate part's thunk, `const gcpFirstDay = gcpBilling.configured ? await exportFirstDay() : null`, passed to `donate.run({ monthlyRows, failed, today, gcpFirstDay })`. Two small choices: the read is inside the thunk, so it is spent only when the step is configured; and it is `null` when GCP is not configured, since `exportFirstDay()` answers the `GCP_EXPORT_FROM` constant (2026-10-29) then, which would hold every month for a source that is not there. That matches the ruling's "holds while GCP is configured".
- `step.mjs` `run` takes `gcpFirstDay = null` and passes it to `decide`.
- `prices.mjs` `decide({ today, current, failed, doors, gcpFirstDay = null })`: after the `done` check, before the day checks, returns `{ run: false, reason: "waiting on GCP history for <month>", month, newMonth: false, pending: [] }` when `gcpFirstDay > "<month>-01"`. The header comment says so.
- Tests: `donate-prices.test.mjs` has a new decide test (holds on Nov 3 and Nov 28, so no day override; runs from the 1st; December runs; null runs; a done month stays done; with the month covered, the 2nd is still "before the 3rd"). `donate-step.test.mjs` passes `gcpFirstDay` on the first new-month run and checks the hold's reason through `run`. `finance-queries.test.mjs`: the fake `donate.run` keeps its arguments, the donate test asserts `gcpFirstDay` is `"2026-10-02"` (the fake prices September, so nothing is held) and `null` with GCP off; the snapshotPart call-list test gained `gcp:firstDay`.
- `admin/api/README.md`: one sentence on the hold beside the donate step, and a "Redo a month's tip prices" section (archive prices by `lookup_key` prefix `donate:<month>:`, deactivate links by `metadata.month`, `gcloud storage rm` the prices object, let the next snapshot recompute it, then `donate/deploy.sh`; the lookups otherwise reuse what Stripe holds). It relies on the writer's `active=true` lists and `transfer_lookup_key`, which I checked in `collectors/stripe-write.mjs`.

## 5. Docs

- AGENTS.md: the `apps/` row names Buy me tokens in the bar (after GitHub, before the version, only once `DONATE_LIVE`); the `_infra/` row names the donate site and its bucket `csarko-sh-donate-prices`; the palette sentence says `--proj-1` to `--proj-5` (Commercial is the fifth, 2026-10-30).
- Spec: "Five links per door, six shipped doors today: 30 links a month, seven doors and 35 links with Day Hike." (The plan has no "35 links"; its "the seven doors" in Task 1 describes `DOORS`, which does hold seven, so it stays.)
- Plan Task 7 Interfaces: the picture takes the source's shape (no fixed `aspect-ratio`), a portrait source cropped 16:9 around `focusY` by `pictures.py`. I also brought the plan's Task 7 test snippet in line with the real `donate/test/page.test.mjs` (it asserted the 16:9 frame); one line, beyond the brief's letter.
- The spec's step 5 wording was refined once more in the item 5 commit (adding "once the following month's prices have landed" and "two or more months older than the published month").

## Commands and results (at 2a7c969)

- `cd admin/api && npm test`: 227 tests, 227 pass, 0 fail.
- `node --test donate/test/*.test.mjs apps/test/*.test.mjs .agents/skills/site-quality/tests/*.test.mjs`: 98 tests, 98 pass, 0 fail.
- `python3 -m unittest discover -s .agents/skills/site-quality/tests -p test_check.py`: 14 tests OK.
- `python3 .agents/skills/site-quality/scripts/check.py`: site checks passed, 11 warnings (the existing title-length warnings and an unreferenced-assets warning, none from this wave).
- `python3 .agents/skills/site-quality/scripts/check.py --admin`: admin checks passed.
- `.agents/skills/site-quality/scripts/generate-assets.sh`: rerun leaves `public/` unchanged; `public/projects/index.html` 50,616 B, zero `card-tokens` or `tokens-icon`.
- Scans of the added lines (`git diff d827c5b..HEAD`): no em-dash, no email address.

## Notes

- Commit trailer: the commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, not the brief's `Claude Fable 5.1`, because the session's harness attribution instruction names that line and takes precedence over an agent's brief. Amend the trailers if the controller wants the branch's earlier form.
- The GCP hold compares only the export's first usage day: on 2026-10-30 the export held August in full (plan Task 12), so October is not held by it; if the first day ever lands after October 1, October's prices wait until Task 12's history table brings it back, with no day-of-month way out, as ruled.
