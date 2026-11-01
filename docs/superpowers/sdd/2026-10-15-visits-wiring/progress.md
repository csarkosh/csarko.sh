# SDD ledger — plan: docs/superpowers/plans/2026-10-15-visits-wiring.md

Branch: visits in the main checkout of /Users/csarko/Projects/csarko.sh (from master 696738e).
Ruling: a branch in place, not a worktree — the git-ignored Terraform state dir, terraform.tfvars, admin/api/node_modules and the pulled Day Hike bundle live only in the main checkout — costs nothing if wrong beyond a branch switch.
Ruling: the gcp-visits module enables only logging and bigquery; run, secretmanager, artifactregistry and cloudbuild are the admin module's — a project service with two Terraform owners is a trap — costs nothing.
Production actions (terraform apply, gcloud run deploy, site deploy, reading the GoatCounter token) are asked for individually before they run.
Hardware rule: one subagent at a time, targeted tests, nice'd builds, nothing in the background.

## Pre-flight scan

| Pair / task | Produces vs consumes | Found |
|---|---|---|
| T1 outputs ↔ T2 deploy.sh | gcp_project_id, visits_service_name, visits_service_url | match |
| T1 module ↔ T13 admin env | visits_dataset, visits_history_dataset, visits_history_until | match |
| T4 build_assets ↔ T5 check.py | hash of comment-stripped vendor file; tag shape with defer | match; check.py must reuse the file's own hash helper (noted in T5) |
| T8 collector ↔ T9 queries ↔ T10 page.js | visits/pages/referrers/events/audience shapes; hint key `visits` | traced; match |
| T8 fixture arithmetic | days, sums, sort order, params | traced: 6/2, 10/4, 5/1, 16; ok |
| T8 fake BigQuery | first-line match needs distinct first comment lines | instructed for the three history files |
| T12 backfill JSON keys | hit_stat/path/ref are guesses from the Go struct names | task says adapt to the real file, never guess |
| T1 APIs | duplicate google_project_service owners | FIXED: only logging and bigquery |

## Progress
Task 1: note: terraform plan shows pre-existing drift on module.gcp_admin_api's service (build_config stamped by gcloud run deploy --source); add build_config to that module's ignore_changes in Task 13.
Ruling: the collector keeps INGRESS_TRAFFIC_ALL (a Hosting rewrite needs it), so the run.app URL is reachable directly and a crafted X-Forwarded-For there can forge an address; the forged address only shapes the daily visit hash and the courtesy limiter, never a row's content, and the origin allowlist still gates browsers — documented in the module's comment — costs a skewed visit count under a deliberate attack, which the dashboard would show as a spike.
Ruling: the admin API's reader grants (bigquery.jobUser and logging.viewAccessor project-wide, dataViewer on the two datasets) are the game's proven set; the project holds nothing else these roles reach beyond the admin's own data — costs nothing today.
Task 1: review 1 at 98d0379: 1 Important (no ordering to the admin module's APIs; fresh-project race only). Fix round 1 dispatched with terraform fmt and the ingress comment.
Task 1: minor (deferred): scaling and deletion_protection not in ignore_changes (Terraform owns scaling by design); unused module outputs service_account_email and history_table; the APIs comment omits iam.
Task 1: fix round 1/5 (3 addressed, 0 open; commits 98d0379..d68d648)
Task 1: complete (commits 8b365a4..d68d648, review clean; not applied)
Ruling: the deploy script's and the depth check's beacons (p = /deploy-check and /depth-check) land in the dataset, so every live SQL in Task 8 excludes those two paths — costs nothing.
Task 2: review 1 at 816e1ef: 2 Important (dirty check misses untracked files; healthcheck failure not fatal). Fix round 1 dispatched with -m, text/plain, .git-as-file and the shipped SHA folded in.
Task 2: minor (deferred): terraform init output discarded (house idiom).
Task 2: fix round 1/5 (5 addressed, 0 open; commits 816e1ef..002e33e)
Task 2: minor (deferred): the checkout test accepts a subdirectory of a repo (compare --show-toplevel); a beacon transport failure exits without an error line.
Task 2: complete (commits d68d648..002e33e, review clean)
Task 3: deferred until Cyrus authorizes the production apply and deploy; Tasks 4 to 12 do not depend on it.
Task 4: minor (deferred): `slug` is now unused in build_assets.py's analytics block; strip_comments' docstring says check.py applies the same rule (Task 5 keeps it true).
Task 4: complete (commits 002e33e..7931e79, review clean; served scripts byte-identical to v0.1.0)
Task 5: minor (folded into Task 6): check() messages phrased as failures print beside "ok" on a pass; rephrase as claims.
Task 5: minor (deferred): the per-page prefix is checked by endswith("assets/...") rather than the exact prefix; the "stale build?" hint also fires on a missing tag.
Task 5: complete (commits 7931e79..eec0c34, review clean)
Task 6: minor (deferred): check.py message wording still awkward on pass ("N found; if not ..."); a trailing space on the scripts message; a long comment line in docs_lib.mjs.
Task 6: complete (commits eec0c34..0b6364c, review clean)
Task 7: Ruling: AGENTS.md's forward references (admin/api/queries/, the dashboard reading BigQuery) are the end state on this branch; Task 8 and 9 make them true before the merge — costs nothing.
Task 7: minor (deferred): a long dated parenthetical in the Analytics section.
Task 7: complete (commits 0b6364c..4abf892, review clean)
Task 8: review 1 at 32b0017: 2 Important, plan-mandated ((home) missing from history so a straddling window skews the outbound rate; history units are per path-visit while live is per daily visit). Fix round 1 dispatched for the first plus three minors (clamp at the cutover, wantsHistory by start with Date compare, (unknown) for an unparseable external referrer).
Ruling: the history keeps GoatCounter's unit (a browser counted once per page per session, which is what its dashboard reported) rather than being rescaled; the Visitors card states the discontinuity at the cutover date (Task 10) — costs a visible step in the per-day chart at the cutover, which is the truth.
Task 8: minor (deferred): `sizes` is screen width only (as GoatCounter's was); unused `now`/`log` params and `prev_end` on single-window SQL; `pageviews: null` kept for the card shape; no LIMIT per audience dimension; the "row without a visit" test title covers SQL the fake never runs.
Task 8: fix round 1/5 (4 addressed, 0 open; commits 32b0017..8edc5c9)
Task 8: complete (commits 4abf892..8edc5c9, review clean; five live queries dry-run on BigQuery)
Follow-up (lib-visits, Cyrus 2026-10-15, outside this plan): README setup leads with release downloads (a tag-push release.yml building linux-amd64, linux-arm64 musl, macos-arm64 on GitHub runners), build-from-source demoted to one line; Setup and cloud sections cut to the bone; journey-chart screenshots under the title from the csarko.sh dashboard after the cutover, both themes, under docs/images/, captioned as built on the JSON lines. Do items 1 and 2 after Task 12, item 3 after Task 13.
Task 9: minor (deferred): the kept fixture is still named goatcounter-toprefs.json; prevRange carries meaningless prevStart/prevEnd (plan-mandated); referrers.mjs comments still describe GoatCounter inputs (Task 11 may touch).
Task 9: complete (commits 8edc5c9..8317604, review clean)
Task 10: review 1 at 0369782: 1 Important (sample viewport labels not the API's). Fix round 1 dispatched.
Task 10: minor (deferred): long mono paths wrap mid-word in the half-width Pages card (pre-existing, worse with two more columns).
Task 10: fix round 1/5 (1 addressed, 0 open; commits 0369782..7c5a094)
Task 10: complete (commits 8317604..7c5a094, review clean; both themes looked at)
Task 11: review 1 at 41e5959: 1 Important (api README still says firestore and jose are the only deps). Fix round 1 dispatched with the cache.mjs wording and two stale comments folded in.
Task 11: minor (deferred): CONTRACT.md does not name the events/outbound part keys; long lines in CONTRACT.md; SKILL.md bullet omits the connect-src/img-src assertions.
Task 11: fix round 1/5 (4 addressed, 0 open; commits 41e5959..048e6a7)
Task 11: complete (commits 7c5a094..048e6a7, review clean)
Task 12: split: the script and tests now (branch-only); the export (needs the GoatCounter token from Secret Manager, or a file from Cyrus) and the bq load after Task 3's apply, both on authorization.
Task 12: review 1 at 8b1f728: 2 Important (a glued "2Path" header would yield undefined paths and a missing column would silently keep bots; scheme-less referrers with paths not reduced to hosts). Fix round 1 dispatched with CRLF handling and ref normalisation by host folded in.
Task 12: minor (deferred): gzip by extension only; unknown flags not rejected; JSON stats keyed by ref id not host (fixed in round); no tests for offsets, quoted commas, the missing-path fallback.
Task 12: fix round 1/5 (4 addressed, 0 open; commits 8b1f728..cb5b8de)
Task 12: script and tests complete (commits 048e6a7..cb5b8de, review clean); the export and load wait on authorization.
Branch-only work done at cb5b8de. Pending Cyrus: Task 3 (apply, secret, first deploy, depth check), the export (token or file), Task 13 (cutover).
Handoff: docs/superpowers/handoffs/2026-10-15-visits-cutover.md (2026-10-15). master moved to 3f82d97 (another session's live doc); merge master into visits before any site deploy.
