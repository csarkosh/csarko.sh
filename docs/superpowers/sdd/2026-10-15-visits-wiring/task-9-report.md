# Task 9 report (as handed back by the implementer; saved by the controller)

Commit: 8317604 admin API: the site's queries read BigQuery, GoatCounter leaves
Tests: `npm test` gives 60 pass, 0 fail, no `not ok`.

Concerns:
- `grep -rn goatcounter admin/api/src admin/api/test` still prints lines: test/referrers.test.mjs and test/queries.test.mjs read the kept fixture test/fixtures/goatcounter-toprefs.json (both use its rows); src/collectors/visits.mjs and test/visits.test.mjs name the goatcounter_history table (correct); comments in src/cache.mjs, src/http.mjs, src/referrers.mjs and src/time.mjs still say GoatCounter (left, not asked).
- The kpis visits result variable is renamed `visitsKpi` (the destructured `visits` would shadow the collector).
- The events query computes the outbound rate from the shaped rows (same value as the brief's version).
- No dedicated test for the kpis outbound previous-range path; the existing kpi test covers it through the halved fake events (30 vs 15).

Deleted: src/collectors/goatcounter.mjs, test/goatcounter.test.mjs, fixtures goatcounter-hits.json, goatcounter-locations.json, goatcounter-total.json.

Self-review: every part() uses visits/events/outbound with env VISITS_DATASET; requireVisits() early returns are null fields plus notConfigured, including paths, themes, viewports, touch, timezones; eventKindOf exported; outboundOf used by kpis, snapshot and events; nothing staged outside admin/api.
