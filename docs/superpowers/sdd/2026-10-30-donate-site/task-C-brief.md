# Task C: a rolling 30-day bill, repriced weekly

Cyrus (2026-10-31): "Let's go with the rolling last 30 days figure, repriced weekly." This replaces "last month's bill, priced on the 3rd" everywhere. The controller's rulings below are the requirements; where the existing code already does the right thing, leave it.

Work from `/Users/csarko/Projects/csarko.sh/.worktrees/donate` (branch `donate`, HEAD 25276e9). Tests: `cd admin/api && npm test` and `node --test donate/test/*.test.mjs apps/test/*.test.mjs .agents/skills/site-quality/tests/*.test.mjs`. No em-dash anywhere; no email address; both repositories are public. Read each module's header comment before editing and update it to the new rule.

## Constants (`admin/api/src/donate/doors.mjs`)

Replace `DONATE_FROM_MONTH` with:
- `DONATE_FROM = "2026-10-31"`: the first day the step may price (the launch day).
- `WINDOW_DAYS = 30`: the bill is the 30 days ending yesterday (UTC).
- `REPRICE_DAYS = 7`: prices turn every seven days from the last repricing.
- `KEEP_DAYS = 35`: a sweep retires Stripe objects whose period is older than this many days before the current period, so the deployed pages' baked links pay for a month after a turn.

## Rules (`admin/api/src/donate/prices.mjs`)

- `windowOf(today)` → `{ from: addDays(today, -WINDOW_DAYS), to: addDays(today, -1) }` (use `addDays` from `../time.mjs`).
- `poolOf(dailyRows, window)` → the sum of `amount` over rows with a `day` and `window.from <= r.day <= window.to`, excluding rows whose `projectOf(r) === "commercial"` or `r.project === "commercial"`, never below 0. (It replaces the monthly `poolOf`; the step now receives `dailyRows`.)
- `pricesOf(pool)` unchanged.
- `decide({ today, current, failed = [], doors, gcpConfigured = false, gcpLastDay = null, from = DONATE_FROM })` → `{ run, reason, window, newPeriod, pending }`, in this order:
  1. `today < from` → `{ run: false, reason: "before the launch day" }`.
  2. `due = current === null || addDays(current.period.repricedOn, REPRICE_DAYS) <= today`.
  3. not due and every door in `current.doors` → `{ run: false, reason: "done" }`.
  4. not due, doors missing → `{ run: true, reason: "doors added", newPeriod: false, pending: <missing> }` (at the current prices).
  5. due and `gcpConfigured` and (`gcpLastDay === null` or `gcpLastDay < addDays(window.to, -2)`) → `{ run: false, reason: "waiting on GCP rows through <addDays(window.to, -2)>" }` (the export runs a day or two behind; three days is the most we tolerate).
  6. due and `failed.length > 0` and (`current === null` or `today < addDays(current.period.repricedOn, REPRICE_DAYS + 3)`) → `{ run: false, reason: "waiting on <failed joined>" }`; past three days late it runs with what is there.
  7. otherwise `{ run: true, reason: "new period", newPeriod: true, pending: <all doors> }`.
  Every answer carries `window: windowOf(today)`. `newPeriod` and `pending` default to `false` and `[]` on the non-run answers.

## The step (`admin/api/src/donate/step.mjs`)

- `run({ dailyRows, failed = [], today, gcpConfigured = false, gcpLastDay = null })`.
- A new period: `pool = cents(poolOf(dailyRows, window))`; `repricedOn = today`; prices get `lookup_key = donate:<repricedOn>:<tier>` (and `:own`) and `metadata = { donate: "1", period: repricedOn, tier, pool }`; a found set of the period's prices reuses them and takes `pool` from their metadata as before. Links carry `metadata = { donate: "1", period: repricedOn, door, tier, share }` (the `month` field is gone; `payment_intent_data.metadata` the same). Idempotency keys: `donate:price:<repricedOn>:<tier>:<today>`, `donate:link:<repricedOn>:<door>:<tier>:<today>`, products unchanged. `createLink` in `stripe-write.mjs` takes `period` instead of `month`; update its test.
- The JSON: `{ period: { from, to, repricedOn }, pool, at, tiers, custom, products, doors }`. The record kept in the snapshot: `{ period, pool, at, doors }`.
- "doors added": reuse `current.period`, `current.pool`, the tiers' price ids, create only the missing doors' links.
- The sweep (when `!d.run && d.reason === "done" && current`): `horizon = addDays(current.period.repricedOn, -KEEP_DAYS)`; deactivate active donate links whose `metadata.period < horizon`; archive active prices whose lookup key is `donate:<date>:<tier>` with `date < horizon`. Dates are `YYYY-MM-DD` strings and compare as strings.
- Update the header comment (the budget note stays) and every test in `donate-step.test.mjs`: fixtures with `period` objects, a weekly turn (a run 7 days after `repricedOn` is a new period; 6 days after is `done`), the sweep horizon (a period 36 days old is swept, one 34 days old survives), the GCP hold, the launch-day hold (`2026-10-30` prices nothing; `2026-10-31` runs), the crash-and-rerun case with the day in the keys.

## The snapshot (`admin/api/src/finance-queries.mjs`)

In `snapshotPart`, the step gets `{ dailyRows: loaded.dailyRows, failed, today, gcpConfigured: gcpBilling.configured, gcpLastDay: loaded.lastDays.gcp }`; drop the `exportFirstDay()` call that fed `gcpFirstDay` (keep the helper; `categories`/`projects` still use it). Update the `finance-queries.test.mjs` donate tests accordingly (the fake `run` asserts the arguments it receives). `income.prices` becomes `{ period, pool, at }`.

## The page (`donate/`)

- `view.mjs`: `billParts(prices)` → before `"Over the last 30 days the cloud behind all this cost "`, figure `"$<round(pool)>"`, after `". Each tier is a slice of that bill."` (Cyrus's sentence shape, with the window in place of the month). `pickPrices(baked, fetched, door)`: the live JSON wins when `fetched.period.repricedOn >= baked.period.repricedOn` and the door's links are complete and https, as now. The stale note reads `Prices are from <Month D>.` using `repricedOn` (add `dayLabel(iso)` → e.g. `October 31`; drop `monthName` if nothing else uses it). The baked per-door JSON is `{ period, pool, door, tiers, links }`.
- `page.mjs`: the bill paragraph through `billParts`; nothing else changes.
- `public-src/app.js`: reads `period` where it read `month`.
- `build.mjs`: `checkPrices` validates `period.from`, `period.to`, `period.repricedOn` as `YYYY-MM-DD` strings; the log line names the period.
- `donate/test/fixtures/prices.json`: `period: { from: "2026-10-01", to: "2026-10-30", repricedOn: "2026-10-31" }`, no `month`.
- Tests `page.test.mjs` and `view.test.mjs` follow (the bill assertion becomes the new sentence with `$288`).

## The Finance page (`admin/public/finance/page.js`, sample data)

The prices note: `Tip prices follow the last 30 days' bill, <money>, set <ago>; they turn weekly.` when `income.prices` is an object, else `Tip prices: not set yet; the donate step reprices weekly from its launch day.` The sample `income.json` carries `prices: { period: {...}, pool, at }`.

## Docs

- Spec `docs/superpowers/specs/2026-10-30-donate-site-design.md`: section 3 "The pool" and "When they change" and "The first pool and the launch" rewritten for the rolling window, weekly turn, the GCP freshness hold and `DONATE_FROM`, each with "(amended Oct 31: Cyrus chose a rolling 30-day bill repriced weekly so the site could launch without waiting for a closed month)"; section 4 steps 1, 2, 5 and the JSON description (`period`); section 2 item 4 (the bill sentence); section 8 (Cyrus's decisions). Keep the amendments short and dated; do not rewrite unrelated text.
- Plan `docs/superpowers/plans/2026-10-30-donate-site.md`: one dated paragraph under the header ("Amended Oct 31: ...") pointing at the spec; Task 12 marked "not needed: the export backfilled October on its own (through Oct 23 as of Oct 31)".
- `admin/CONTRACT.md` Income (`prices` shape), `admin/api/README.md` (the step's rule and the redo section by period date), `AGENTS.md` `donate/` row ("each a share of the last 30 days' cloud spend, repriced weekly").

## Then

Rebuild with the fixture and screenshot `/arkos/` (desktop dark) into `/tmp/csarko-donate-site/arkos-desktop-dark.png`; Read it: the bill reads "Over the last 30 days the cloud behind all this cost $288. Each tier is a slice of that bill." Commit on `donate`: `donate: a rolling 30-day bill, repriced weekly` with the Co-Authored-By Claude Fable 5.1 line. Write a report to `.superpowers/sdd/2026-10-30-donate-site/task-C-report.md` (what changed per section, tests, the screenshot). Reply with status, commit, one-line test summary, concerns, report path. If a ruling above cannot be done as written, stop on that item, finish the rest, and report it.
