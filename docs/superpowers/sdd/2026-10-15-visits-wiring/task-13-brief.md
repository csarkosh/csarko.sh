### Task 13: The cutover

**Files:**
- Modify: `.agents/skills/deploy/scripts/deploy.sh` (append a beacon check after the page verification), `_infra/main.tf:139` and `_infra/variables.tf` (`goatcounter_site`), `_infra/modules/gcp-admin-api/variables.tf:32,62-70`, `_infra/modules/gcp-admin-api/main.tf` (the `GOATCOUNTER_SITE` env, the "six secrets" comments, add `VISITS_DATASET`, `VISITS_HISTORY_DATASET`, `VISITS_HISTORY_UNTIL` envs), `docs/superpowers/specs/2026-10-15-visits-wiring-design.md` ("As built")

- [ ] **Step 1: The beacon check in `deploy.sh`**

After the `VERIFY` loop, add:
```bash
# The beacon route: one test event through the Hosting rewrite must be taken.
code="$(curl -s -o /dev/null -w '%{http_code}' -H "Origin: $SITE_URL" -H 'Content-Type: text/plain' -d '{"v":1,"n":"view","id":"deploy-check","p":"/deploy-check"}' "$SITE_URL/v")"
[[ "$code" == "204" ]] && echo "✓ $SITE_URL/v takes a beacon (204)" || die "$SITE_URL/v answered $code: is the rewrite deployed and csarko-visits up?"
```
(use the script's existing variable for the live URL; it may be named differently.)

- [ ] **Step 2: Terraform: the admin API's new env and GoatCounter's removal**

In `_infra/modules/gcp-admin-api/main.tf`, replace the `GOATCOUNTER_SITE` env block with three:
```hcl
      env {
        name  = "VISITS_DATASET"
        value = var.visits_dataset
      }
      env {
        name  = "VISITS_HISTORY_DATASET"
        value = var.visits_history_dataset
      }
      env {
        name  = "VISITS_HISTORY_UNTIL"
        value = var.visits_history_until
      }
```
Add the three variables to the module (`visits_dataset`, `visits_history_dataset` strings; `visits_history_until` string, the cutover instant in RFC 3339, e.g. `"2026-10-17T00:00:00Z"`, the day after the deploy), remove `goatcounter_site`, remove the `goatcounter-token` entry from `secret_ids`' default and fix the "six" comments to "five". In `_infra/main.tf` replace `goatcounter_site = var.goatcounter_site` with `visits_dataset = module.gcp_visits.dataset`, `visits_history_dataset = module.gcp_visits.history_dataset`, `visits_history_until = var.visits_history_until`; add `variable "visits_history_until"` to the root (`type = string`, no default) and set it in `terraform.tfvars`; delete `goatcounter_site` from `variables.tf`, `terraform.tfvars` and `terraform.tfvars.example`.

Run: `terraform -chdir=_infra plan -input=false 2>&1 | grep -E "Plan:|destroy"`
Expected: the `goatcounter-token` secret and its IAM member are destroyed, the admin service changes its env; nothing else destroyed.

- [ ] **Step 3: Deploy, in this order**

```bash
terraform -chdir=_infra apply -input=false                   # admin env, GoatCounter secret gone
nice -n 10 .agents/skills/site-quality/scripts/generate-assets.sh >/dev/null
nice -n 10 .agents/skills/deploy/scripts/deploy.sh           # the site: tags, CSP, the /v rewrite, the beacon check
gcloud run deploy csarko-admin --source admin/api --region us-west1 --project csarko-sh --quiet
nice -n 10 admin/deploy.sh
```
Then the proxy depth through Hosting (Task 3 step 3, against `https://csarko.sh/v` this time) and the first real row:
```bash
sleep 120; bq query --project_id=csarko-sh --use_legacy_sql=false "SELECT timestamp, JSON_VALUE(json_payload.p) p, JSON_VALUE(json_payload.s.visit) visit, JSON_VALUE(json_payload.s.bn) bn FROM csarko_visits._AllLogs ORDER BY timestamp DESC LIMIT 5"
```
Expected: rows within a few minutes, with `visit` populated (if `visit` is null on real visits, the proxy depth is wrong: fix per Task 3 and re-apply). Then open https://admin.csarko.sh/csarko.sh/ and confirm every card fills, and run `nice -n 10 python3 .agents/skills/site-quality/scripts/check.py --live --lighthouse --observatory` once: 100/100/100, Performance ≥ 95, Observatory A+.

- [ ] **Step 4: Record and commit**

Append to the spec's "As built": the cutover date, the history-until value, the proxy depth through Hosting, and the first-row check. Commit:
```bash
git add .agents/skills/deploy/scripts/deploy.sh _infra docs/superpowers/specs/2026-10-15-visits-wiring-design.md
git commit -m "cutover: csarko.sh counts with lib-visits

The site's beacons go to csarko.sh/v, the dashboard reads BigQuery,
GoatCounter's token and site leave Terraform; history before the
cutover comes from the backfilled table."
```
Push `master` and request indexing of nothing (no page content changed).

---

## Self-review

**Spec coverage.** §2 service, rows, reader, history dataset, budget untouched (Task 1), deploy script and proxy depth (Tasks 2, 3). §3 rewrite and CSP (Tasks 4, 7). §4 `site.json`, the vendored scripts, the tags, `engage.js` gone, the attribute rename, `check.py`, AGENTS.md (Tasks 4, 5, 6, 7). §5 the collector, the SQL, the queries, the KPI, the dashboard lines (Tasks 8, 9, 10). §6 the export and backfill, the ordered deploy, the verification, GoatCounter's removal (Tasks 12, 13). §7 out of scope: nothing built for it.

**Placeholders.** The proxy depth and the cutover date are measured in Tasks 3 and 13 and written into the spec's "As built"; `2026-10-xx` in AGENTS.md (Task 7) is replaced with the real date at Task 13.

**Type consistency.** `createVisits` returns the shapes Task 9 consumes (`visits.current.visits`, `pages` rows with `engagedMedian`/`reached`, `referrers.{referrers,campaigns,paths}`, `events.{rows,homeVisitors}`, `audience.*`); `groupReferrers` takes `{ name, count }` rows (`referrers.mjs:52-58`); `hourlyRange`'s `start/end/prevStart/prevEnd` map to the SQL's `@start/@end/@prev_start/@prev_end`; the dashboard reads `refs.paths`, `pages.rows[].engagedMedian`, `audience.themes` as Task 9 emits them.

**Review Focus.** (1) the `COALESCE(visit, id)` in every SQL and the Task 8 collector test's "row without a visit still counts" (the fixture rows carry no visit at all, so counts come through regardless). (2) Task 8's history test merges `2026-10-14` from both sources into 6. (3) Task 5 step 3's stale-hash proof; the 404 page carries both tags as every page does. (4) Task 7's `firebase.test.mjs`. (5) Task 9's referrers test with `google.com` as a bare host through `groupReferrers`.
