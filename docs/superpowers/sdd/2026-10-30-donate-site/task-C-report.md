# Task C report: a rolling 30-day bill, repriced weekly

Commit `6863e03` on `donate` (from 25276e9): `donate: a rolling 30-day bill, repriced weekly`.

## What changed, by section of the brief

**Constants (`doors.mjs`).** `DONATE_FROM_MONTH` is gone. Added `DONATE_FROM = "2026-10-31"`, `WINDOW_DAYS = 30`, `REPRICE_DAYS = 7`, `KEEP_DAYS = 35`, each with a short comment. Header and the TIERS comment say "the last 30 days' pool".

**Rules (`prices.mjs`).** New `windowOf(today)`, which uses `addDays` from `../time.mjs`. `poolOf(dailyRows, window)` sums the rows with a `day` inside the window. It skips commercial rows (`projectOf` or `r.project`) and never returns less than 0. `pricesOf` is unchanged. `decide` follows rules 1 to 7 in the brief's order and always returns `{ run, reason, window, newPeriod, pending }`. Two constants are private: `LATE_DAYS = 3` and `GCP_LAG_DAYS = 2`. `PRICE_DAY` and `LATE_DAY` were removed, and nothing else used them. The header comment now states the new rule.

**The step (`step.mjs`).**
- A new period sets `period = { ...window, repricedOn: today }`.
- Prices use the lookup key `donate:<repricedOn>:<tier>` and the metadata `{ donate, period, tier, pool }`. Idempotency keys:
  - prices: `donate:price:<repricedOn>:<tier>:<today>`
  - links: `donate:link:<repricedOn>:<door>:<tier>:<today>`
- Links are found by `metadata.period` and created with `period` (`createLink` in `stripe-write.mjs` takes `period`, and the payment intent metadata matches).
- The JSON is `{ period, pool, at, tiers, custom, products, doors }`. The record is `{ period, pool, at, doors }`.
- "doors added" reuses `current.period`, its pool, its price ids and its `at`.
- The sweep sets `horizon = addDays(repricedOn, -KEEP_DAYS)`. It deactivates links whose `metadata.period < horizon` and archives prices whose key matches `^donate:YYYY-MM-DD:<tier>$` with a date before the horizon.
- The lookups, the `need()` checks and the non-fatal sweep failures are unchanged.
- The header is rewritten and the budget note kept. `bucket.mjs`'s header says period instead of month.

**Snapshot (`finance-queries.mjs`).** `snapshotPart` passes `{ dailyRows: loaded.dailyRows, failed, today, gcpConfigured: gcpBilling.configured, gcpLastDay: loaded.lastDays.gcp }`. It no longer calls `exportFirstDay()` for the step. The helper stays, and `categories`, `projects` and `sources` still use it. `income.prices` is now `{ period, pool, at }`. The header comment notes the Oct 31 amendment.

**Page (`donate/`).**
- `view.mjs`: `billParts` gives "Over the last 30 days the cloud behind all this cost $N. Each tier is a slice of that bill." `pickPrices` checks `fetched.period.repricedOn` as a real `YYYY-MM-DD` and compares it with `baked.period.repricedOn`. `monthName` became `dayLabel(iso)`, which returns `October 31`; nothing else used `monthName`.
- `page.mjs`: the baked JSON carries `period`.
- `app.js`: the stale note is `Prices are from <dayLabel(repricedOn)>.`
- `build.mjs`: `checkPrices` validates `period.from`, `period.to` and `period.repricedOn`. The log line names the period.
- The fixture carries the brief's period and `at` 2026-10-31.
- `deploy.sh`: one comment changed from "the month's" to "the current" prices.

**Finance page.** The prices note and its empty-state line use the brief's wording. `sample/finance/income.json` carries a `period`.

**Docs.**
- Spec: section 2 item 4; section 3 "The pool", "When they change" and "The first pool and the launch", each with the brief's amendment parenthetical; section 4 steps 1, 2, 4 (link metadata), 5 and 6, the snapshot record, and one dated sentence on the redeploy; section 8.
- Plan: an "Amended Oct 31" paragraph under the header, and Task 12 marked not needed.
- `CONTRACT.md`: the `prices` example and description, and the donate step paragraph.
- API `README.md`: the step's rule, and "Redo a period's tip prices" keyed by `repricedOn`.
- `AGENTS.md`: the `donate/` row (the brief's wording, weekly step, and a redeploy rule matching the 35-day keep) and the `admin/` row's "weekly tip prices".

## Tests

All tests were changed first and seen failing before the code changed.
- `admin/api`, `npm test`: 232 pass, 0 fail.
- `node --test donate/test/*.test.mjs apps/test/*.test.mjs .agents/skills/site-quality/tests/*.test.mjs`: 99 pass, 0 fail.
- `admin/test`: 19 pass, 0 fail.

What the new tests cover:
- **donate-prices:** the constants; `windowOf`, including a crossing into February; `poolOf` bounds, monthly rows and commercial rows; a first run; done at 6 days and a new period at 7; doors added; the failed-provider hold up to 3 days late; the GCP hold through `to - 2`; the launch day.
- **donate-step:** the new period's record, keys and metadata; the weekly turn, where the pool moves with the window; a sweep where a period 36 days old goes and one 34 days old stays; the GCP hold; the launch-day hold (Oct 30 does nothing, Oct 31 runs); crash and rerun with the day in the keys.
- **finance-queries:** the fake `run` asserts every argument it receives.

`node donate/build.mjs --prices donate/test/fixtures/prices.json` builds six doors and logs "prices of 2026-10-31 (2026-10-01 to 2026-10-30)". No added line has an em-dash or an email address.

## Screenshot

`/tmp/csarko-donate-site/arkos-desktop-dark.png`: 1280 wide, dark, served from `donate/public`. It reads "Over the last 30 days the cloud behind all this cost **$288**. Each tier is a slice of that bill." Under it is "Prices are from October 31.", because the live fetch found no prices object, so the stale path and `dayLabel` ran. The tiers are $3, $9, $29 and any, and the button says Tip $9.

## Concerns

- The brief asked for a "Claude Fable 5.1" Co-Authored-By line. The session's attribution rule says `Claude Opus 5.5`, so the commit carries that line.
- After a crash, the next day's rerun starts a new period with `repricedOn` set to that day, as the rulings say. Any prices and links the crashed day created stay unused and live until the sweep's 35-day horizon passes them.
- The spec's launch paragraph says the export backfilled October on its own, taken from the brief's Task 12 note. I did not check that against BigQuery.

## Fix after review

The Important from the review is fixed in `admin/api/README.md`, "Redo a period's tip prices", in the commit `donate: a redo recomputes on a later day`. The steps are now: archive the period's prices, deactivate its links, delete `prices.json`, let the next daily snapshot recompute (the following UTC day at the earliest), then redeploy. A bold line says never to trigger the snapshot by hand on the same UTC day. It explains why: the idempotency keys carry the day, so Stripe would replay the dead objects (same pool) or refuse the key (changed pool) after `prices.json` is gone. The section also says the new window is the recompute day's 30 days, not the original period's.

Notes:
- Between deactivating the links and the redeploy, the pages' baked checkouts are dead, possibly for a day. The section says so and advises starting right after a day's snapshot. Another order would avoid the gap: delete `prices.json` first, let the next day's period price on new keys, redeploy, then retire the old period. That would mean a day of payments at the old prices. I did not adopt it.
- The commit carries `Co-Authored-By: Claude Opus 5.5`, the line set by this session's attribution rule, not the Fable 5.1 line the coordinator asked for.

## Second fix: the redo keeps checkouts alive

On the coordinator's ruling, the Redo section now runs in this order:
1. Delete `prices.json`.
2. Let the next daily snapshot price a new period on new keys (a later UTC day; never by hand on the same day, for the idempotency-key reason).
3. Run `donate/deploy.sh`.
4. Retire the wrong period's prices and links, which the 35-day sweep would otherwise do.

The trade-off sentence and the window note are in. The commit again carries the session's `Claude Opus 5.5` trailer.
