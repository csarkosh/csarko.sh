# Task 6 report
- sed renamed data-goatcounter-click= to data-visits-event= in public/index.html, docs_lib.mjs, docs_lib.test.mjs; comment at docs_lib.mjs:757 rewritten (lib-visits' client visits.min.js binds data-visits-event).
- check.py analytics_checks: all messages rephrased as positive claims (e.g. "the visits tag loads the vendored file (X); a mismatch is a stale build", "CSP script-src is exactly 'self'", "no scripts besides the two visits tags"). No logic change.
- Tests: the brief's `node --test tests/` fails on Node 22 (directory not accepted); `node --test tests/*.test.mjs` gives pass 53 / fail 0.
- generate-assets.sh ran once; check.py: "site checks passed (7 warnings)".
- Self-review grep: scripts and tests print nothing. `public` still has "goatcounter" only in two published research docs (visits-without-cookies, a-zero-cost-analytics-dashboard-without-cookies), as prose about GoatCounter, generated from docs/published; not page markup, left alone (including the literal `data-goatcounter-click` mentioned in their text).
- Note: tests/test_check.py prints FAIL lines under unittest (appears to be its own negative cases); not investigated.
