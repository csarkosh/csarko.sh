# Task 4 report
Status: DONE_WITH_CONCERNS.
Changed: site.json (provider visits, endpoint /v); build_assets.py (analytics() replaces analytics_origin(); analytics_block() writes visits+vitals tags; CSP only appends script-src 'self', so connect-src/img-src stay 'self'; docstring and strip_comments docstring updated); vendored vendor/visits.min.js and vendor/vitals.min.js (v0.1.0, provenance line); git rm of goatcounter-count.js and engage.js; regenerated pages, assets, firebase.json.
Deviation: the brief's Step 1 appends `echo`, but dist files already end in a newline, so the served file was 1 byte longer than the tag's. I dropped the `echo`; `cmp` of lib-visits client/dist/{visits,vitals}.min.js against public/assets/visits.7ad2ea24.js and vitals.75ad3d15.js is now identical.
Generator: generate-assets.sh rc=0. CSP in firebase.json (public site): script-src 'self'; connect-src 'self'; img-src 'self' (admin site entry unchanged).
check.py fails as expected: FileNotFoundError at check.py:958 in analytics_checks, `want_counter = f"goatcounter-count....` reading vendor/goatcounter-count.js (no assertion lines reached; Task 5).
Self-review: index, 404 and a research page carry the two defer tags with correct prefix (relative on index, root-relative elsewhere). Remaining "goatcounter" in public/index.html (and research pages) is only data-goatcounter-click attributes (12 in index.html), left for Task 6.
Concern: tag order depends on defer; none otherwise.
