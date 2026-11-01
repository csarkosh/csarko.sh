# Task 3 report

Implemented `admin/api/src/donate/bucket.mjs` (createPricesBucket, lazy Storage, 404 -> null) and `step.mjs` (createDonateStep) per the brief; test file is the brief's, verbatim.

TDD: RED `node --test test/donate-step.test.mjs` before the modules existed: fail 1 (modules not found). GREEN same command: pass 7, fail 0. `npm test` in admin/api: all pass.

Notes:
- `decide` (Task 1) takes `current.doors` as an array, the JSON has an object, so the step passes `{ month, doors: Object.keys(current.doors) }` to it.
- Every created id and link url is checked to be a non-empty string, else it throws before any bucket write.
- Mid-month (doors added) the record keeps the current month and `at`.
- Products reused only when `active !== false` and `metadata.tier` matches.
- Retire failures are logged via `log.error`, not fatal.

## Fix report, round 1

Changed:
- `stripe-write.mjs`: `listPrices()` and `listLinks()` (every page, `starting_after` while `has_more`); `createPrice` and `createCustomPrice` take `lookupKey` (sent with `transfer_lookup_key=true`) and `metadata`; `createProduct` and `createLink` add `metadata[donate]=1`.
- `step.mjs`: before creating, products matched on `donate=1` and tier; the month's prices reused by lookup key (pool taken from their `metadata.pool`, missing ones created at that pool); a door's links reused by month, door and tier (one `listLinks()` per run). A run that writes retires nothing; a `done` run with a current JSON sweeps other months' links and prices, failures logged, and returns `swept: { links, prices }`. `run` defaults `failed = []`, `next` is built once, `?.id`/`?.url` before `need()`.
- `bucket.mjs`: `write` logs its failure and rethrows.
- Tests: next-month test now asserts no retire on the writing run and a sweep on the following `done` run; new cases for sweep failures, a throwing `bucket.write`, empty id/url/null body, lookup reuse (pool from metadata), partial reuse, two-of-five links, a non-404 read; writer tests for the list paging and the new fields.

Command: `cd admin/api && node --test test/donate-step.test.mjs test/stripe-write.test.mjs` -> pass 20, fail 0. `npm test` -> tests 221, pass 221, fail 0.
