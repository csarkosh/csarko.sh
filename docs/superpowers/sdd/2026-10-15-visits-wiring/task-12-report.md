# Task 12 report

TDD: first run with no module: `# pass 0 / # fail 1` (ERR_MODULE_NOT_FOUND). After the script: first pass 5/1 (CSV fixture), then 6/0 after the header fix below.
CLI: `node visits/backfill.mjs /tmp/gc-sample.jsonl` -> `3 rows, 6 visits, 1 days, 1 lines skipped -> /tmp/goatcounter-history.jsonl` (3 lines; the skipped line is export_version). No --load.
Files: visits/backfill.mjs, visits/test/backfill.test.mjs. No em-dashes.

Deviations:
- `node --test visits/test/` fails on this Node (treats it as a module); used `visits/test/*.test.mjs`.
- Added `reduceExport` -> {rows, skipped}; rowsOf wraps it. Unknown JSON lines (none of path/ref/hit_stat) counted and printed. Exported hourOf/hostOf; 4 extra tests (hourOf, hostOf, skipped, CSV by column name).
- CSV: the brief's fixture header has a leading version cell ("2") with no matching data column, so a numeric first header cell is dropped before name lookup. Verify against the real file.
- Main guard uses fileURLToPath equality. --load prints row/visit totals first; --replace kept.
Concerns: JSON key names remain unverified against a real export.

## Fix round 1
CSV header: version stripped whether glued ("2Path") or its own cell; required columns Path, Title, Event, Bot, Referrer, Date else a clear Error. hostOf cuts scheme-less referrers at the first / ? #, strips userinfo and :port, www., lowercases. Both parsers split on /\r?\n/. fromJson sums after reading the whole file, keyed by resolved host. 5 tests added; all pass (see run). CLI sample still gives 3 rows.
