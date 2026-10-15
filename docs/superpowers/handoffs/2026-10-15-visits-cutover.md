# Handoff: csarko.sh moves from GoatCounter to lib-visits

*Written 2026-10-15 by the agent that ran the work so far, for the agent that picks it up.
Delete this file in the last commit before `visits` merges into `master`.*

## Start here

You are continuing a half-finished migration. Read this file top to bottom, then
`AGENTS.md` (always loaded), then the two documents it argues from:

- Spec: `docs/superpowers/specs/2026-10-15-visits-wiring-design.md`
- Plan: `docs/superpowers/plans/2026-10-15-visits-wiring.md` (13 tasks)
- The library's own spec: `~/Projects/lib-visits/docs/superpowers/specs/2026-10-15-lib-visits-design.md`
  and its wire format `~/Projects/lib-visits/spec/SPEC.md`

The run was executed with the `superpowers:subagent-driven-development` skill (a fresh
implementer per task, a task review, a scoped re-review per fix round). Its ledger is
`.superpowers/sdd/2026-10-15-visits-wiring/progress.md` (git-ignored; every ruling and
deferred minor is there too, copied below so nothing depends on scratch files). The task
briefs and reports sit beside it.

**Everything that remains touches production. Ask Cyrus before each production action**
(a `terraform apply`, a `gcloud run deploy`, a site or admin deploy, reading a secret).
An approval given for one step does not carry to the next. The auto-mode permission
layer has refused `gcloud run deploy` and `npm run deploy:server` even after Cyrus said
yes in chat; when that happens, give him the exact command to run with the `!` prefix.

## Why this exists

On 2026-10-15 GoatCounter's one server (`65.21.71.180`, Hetzner) reset most TLS
handshakes for hours, and five cards on `https://admin.csarko.sh/csarko.sh/` failed with
it. Cyrus decided to replace it with his own cookieless analytics library, `lib-visits`
(GPL-3.0, a ~3 KB client and a Rust collector), self-hosted on csarko.sh's GCP project
with rows in BigQuery. The research behind it is published at
`https://csarko.sh/research/visits-without-cookies`.

## Already done and live (do not redo)

- **The 502 change on the admin API** (`csarko-admin` revision `00012-pmp`): a vendor that
  cannot be reached answers 502 naming it. Commit `dded88d` on master.
- **Day Hike's admin fixes** (game repo, pushed and deployed): "still playing" only for a
  match heard from in two minutes, `end`/`lobby_end` count as leaving, the stills shoot
  sends no telemetry.
- **lib-visits v0.1.0**: `~/Projects/lib-visits`, private repo `csarkosh/lib-visits`,
  `main` = tag `v0.1.0` = `origin/main` = `a751e17`, clean. Client `visits.min.js`
  3,068 B and `vitals.min.js` 995 B; the collector is a 1.1 MB static binary (0.6 MB
  `FROM scratch` image, compressed) idling at 2.6 MiB. 27 Rust and 31 client tests.
- **The research doc** `visits-without-cookies` (published, then corrected to the
  measured sizes in `0d91cea`).

## Where the repos stand

| Repo | State |
|---|---|
| `~/Projects/csarko.sh` | Main checkout on branch **`visits`** at `cb5b8de`, clean, **not pushed**: 19 commits on top of `696738e`. Nothing on it is applied or deployed. |
| csarko.sh `master` | **Moved under us.** Another session (Cyrus's ide-arkos one) published `telemetry-without-identifying-anyone` as `3f82d97` from a scratch worktree of `master` at `/private/tmp/claude-501/-Users-csarko-Projects/ab13b043-a456-4f45-b538-9d8487463595/scratchpad/csarko-main`. **That doc is live** (200), so the live site is `master`. Local `master` is 3 commits ahead of `origin/master` (`0d91cea`): `28aacca` (wiring spec amend), `696738e` (wiring plan), `3f82d97` (their doc). While that worktree exists, `master` cannot be checked out in the main checkout; ask Cyrus whether that session is finished before touching `master`. |
| `~/Projects/lib-visits` | `main` = `v0.1.0`, clean, pushed. `visits/deploy.sh` refuses to build unless the checkout is clean and exactly at `VISITS_TAG` (default `v0.1.0`); today `main` is that commit, so it passes without a checkout. If `main` moves (the README follow-up below), check out the tag before deploying. |
| `~/Projects/game-dayhike` | Nothing pending from this work. |

## What the `visits` branch contains (Tasks 1, 2, 4 to 12, all reviewed clean)

- **Task 1** `_infra/modules/gcp-visits` + root wiring: Cloud Run `csarko-visits`
  (0 to 3 instances, 128Mi, `serve --trusted-proxies 1`, secret `visits-secret`), log
  bucket `csarko-visits` with Log Analytics, sink and exclusion, linked dataset
  `csarko_visits`, plain dataset `csarko_history` with table `goatcounter_history`,
  reader grants for `csarko-admin`'s service account. `terraform plan`: 17 to add, 1 to
  change (pre-existing drift, see below), 0 to destroy.
- **Task 2** `visits/deploy.sh` and `visits/README.md`.
- **Task 4** `site.json` is `{ "analytics": { "provider": "visits", "endpoint": "/v" } }`;
  `build_assets.py` vendors the two scripts (provenance line stripped before hashing, served
  bytes identical to the tag) and writes two `defer` tags on every page; CSP is `'self'`
  only. `count.js` and `engage.js` are deleted.
- **Task 5** `check.py`'s analytics checks rewritten (proven to fail a stale hash and an
  extra script).
- **Task 6** `data-goatcounter-click` → `data-visits-event` everywhere, names unchanged;
  pages regenerated.
- **Task 7** `firebase.json` rewrites `/v` to `csarko-visits` (with
  `.agents/skills/site-quality/tests/firebase.test.mjs`); AGENTS.md's Analytics section
  rewritten as the end state.
- **Task 8** `admin/api/src/collectors/visits.mjs` + nine saved SQL files in
  `admin/api/queries/` (`COPY queries ./queries` in the Dockerfile), cached five minutes;
  the five live queries dry-run clean against real BigQuery.
- **Task 9** `queries.mjs` (five queries, KPI, snapshot, 404 list) reads the collector;
  GoatCounter's collector and tests deleted; env `VISITS_DATASET`,
  `VISITS_HISTORY_DATASET`, `VISITS_HISTORY_UNTIL`.
- **Task 10** the dashboard shows engaged time, read-to-the-end share, paths through the
  site, theme/viewport/input/timezone; the Visitors card states the unit change at the
  cutover. Looked at in both themes.
- **Task 11** docs (admin README, CONTRACT.md, site-quality SKILL.md, comments).
- **Task 12 (script and tests only)** `visits/backfill.mjs`: either GoatCounter export
  format → hourly rows, refuses a header it does not understand, never loads without
  `--load`. Tests: `node --test visits/test/*.test.mjs` (11 pass).

## Next steps, in this order

The plan's Tasks 3 and 13 were written before several rulings; their briefs in the
scratch directory are stale on the points marked **(not in the brief)** below. Pass those
points to whoever does the work.

### 1. Bring `master` into `visits` (no production action)

`git merge master` on `visits`. The generated files will conflict
(`public/research/index.html`, `public/sitemap.xml`, the new doc page's analytics block):
resolve by taking either side, then run
`nice -n 10 .agents/skills/site-quality/scripts/generate-assets.sh` and
`nice -n 10 python3 .agents/skills/site-quality/scripts/check.py` and commit the result.
**Never deploy the site from a tree that lacks `3f82d97`: it would take a live doc down.**
If `master` moves again before the cutover, repeat.

### 2. Task 3: apply, secret, first deploy, proxy depth (production: ask Cyrus)

Follow the Task 3 brief (`.superpowers/sdd/2026-10-15-visits-wiring/task-3-brief.md`,
same text as the plan's Task 3) with these notes:

- The plan also shows `module.gcp_admin_api.google_cloud_run_v2_service.admin` changing in
  place: `build_config` drift that `gcloud run deploy --source` stamps. Harmless; Task 13
  stops it recurring **(not in the brief)**.
- Targeted applies do not write root outputs: run the `apply -refresh-only` line, or
  `visits/deploy.sh` dies on a missing `visits_service_name`.
- `visits/deploy.sh` posts one beacon (`p: /deploy-check`) and the depth check another
  (`p: /depth-check`); every live SQL file excludes both paths **(not in the brief)**.
- The `--log-ip` revision is made with `gcloud run services update --args`; the closing
  `terraform apply` restores Terraform's args, so run it last.
- Record the measured depth in the spec's new "As built" section.

### 3. Task 13's code changes, as one reviewed task (no production action)

Do the brief's Steps 1 and 2 (the beacon check in `.agents/skills/deploy/scripts/deploy.sh`,
the admin module's three `VISITS_*` env vars, GoatCounter's removal from Terraform), plus
**(not in the brief)**:

- Add `build_config` to `ignore_changes` on `module.gcp_admin_api`'s Cloud Run service.
- The beacon curl in `deploy.sh`: `-m 20`, and `|| code=000` so a transport failure still
  reaches the `die` with a message.
- `visits_history_until` is the **next full UTC hour after the site deploy switches
  scripts** (GoatCounter stops counting the moment `count.js` leaves the pages and
  lib-visits starts the same moment, so ceiling to the hour keeps GoatCounter's last
  partial hour). It is set in `_infra/terraform.tfvars` after the site deploy, so leave
  the variable without a default and set it during step 5.
- **Do not let the `goatcounter-token` secret be destroyed before the export in step 5
  has run.** Removing the `goatcounter-token` entry from `secret_ids` destroys it on the
  next apply.

Review it, then run the **final whole-branch review** the SDD skill requires (most
capable model, against `master`'s merge base, pointed at the ledger's deferred minors and
the rulings below), one fix wave, and the `superpowers:finishing-a-development-branch`
skill when Cyrus says how to integrate.

### 4. Ask Cyrus the export question

The backfill needs GoatCounter's export. Two ways; Cyrus chooses:
- read the token with `gcloud secrets versions access latest --secret goatcounter-token
  --project csarko-sh` and pull the export through the API (the plan's Task 12 Step 3
  commands; GoatCounter may still reset connections, so retry), or
- Cyrus downloads it from goatcounter.com (Settings, Export) and gives you the path.

Either way, run `node visits/backfill.mjs <file>` first and read its summary and a few
output lines before `--load`; the JSON export's key names (`path`, `ref`, `hit_stat`) are
read from GoatCounter's Go structs and not yet verified against a real file. If the file
differs, adapt the parser and add its real first lines to the tests; never guess.

### 5. The cutover (production: ask Cyrus, then go in this order)

1. Site deploy from the merged tree (`.agents/skills/deploy/scripts/deploy.sh`): the tags,
   the CSP, the `/v` rewrite and the beacon check go live together. Note the time.
2. The GoatCounter export and `node visits/backfill.mjs <file> --load` (the
   `csarko_history` table exists after Task 3).
3. Set `visits_history_until` (step 3's rule) in `terraform.tfvars`; `terraform apply`
   (admin env set, GoatCounter's secret and site variable removed).
4. `gcloud run deploy csarko-admin --source admin/api --region us-west1 --project csarko-sh`,
   then `admin/deploy.sh`.
5. The proxy depth again, through `https://csarko.sh/v` this time (Hosting adds a hop);
   fix `trusted_proxies` in `_infra/main.tf` and re-apply if `s.visit` is null on real
   rows. Check with
   `bq query --project_id=csarko-sh --use_legacy_sql=false "SELECT timestamp, JSON_VALUE(json_payload.p) p, JSON_VALUE(json_payload.s.visit) visit FROM csarko_visits._AllLogs ORDER BY timestamp DESC LIMIT 5"`.
6. Open `https://admin.csarko.sh/csarko.sh/`; every card fills.
7. `nice -n 10 python3 .agents/skills/site-quality/scripts/check.py --live --lighthouse --observatory`
   once: 100/100/100, Performance ≥ 95, Observatory A+.
8. "As built" in the spec (cutover time, history-until, depth through Hosting, first row),
   commit, push.

## Rulings made on Cyrus's behalf in this run

Each says what was decided, why, and what it costs if wrong. Cyrus has not reviewed these
yet; report them to him when the work finishes.

1. The work runs on a branch in the main checkout, not a worktree: the git-ignored
   Terraform state dir, `terraform.tfvars`, `admin/api/node_modules` and the pulled Day
   Hike bundle exist only there. Cost: nothing.
2. The `gcp-visits` module enables only the `logging` and `bigquery` APIs; the admin module
   owns the rest (one owner per project service). Cost: nothing.
3. The collector keeps `INGRESS_TRAFFIC_ALL` (a Hosting rewrite needs it), so its run.app
   URL is reachable directly and a crafted `X-Forwarded-For` there can forge an address;
   that only shapes the visit hash and the courtesy limiter, never a row's content.
   Documented in the module. Cost: a skewed count under a deliberate attack.
4. The admin API's reader grants (`bigquery.jobUser`, `logging.viewAccessor` project-wide,
   `dataViewer` on both datasets) copy the game's proven set. Cost: nothing today.
5. The deploy and depth-check beacons are excluded from every live query. Cost: nothing.
6. AGENTS.md describes the end state on the branch; later tasks made it true. Cost:
   nothing.
7. GoatCounter's history keeps its own unit (a browser once per page per session) rather
   than being rescaled; the Visitors card says so. Cost: a visible step at the cutover,
   which is the truth.
8. Several plan-level corrections made before dispatch: timestamps in the library's
   fixtures, the size gate (1,536 → 3,072 B, the estimate was a gzip figure), the referrer
   sent without its query, `window` → `win` in SQL (reserved word). All recorded in the
   ledger and already reported to Cyrus for the library.

## Deferred minors (for the final review's triage)

- Terraform: `scaling` and `deletion_protection` not in `ignore_changes` (Terraform owns
  scaling by design); unused module outputs; the APIs comment omits `iam`.
- `visits/deploy.sh`: the checkout test accepts a repo subdirectory; `terraform init`
  output discarded.
- `build_assets.py`: `slug` now unused in the analytics block.
- `check.py`: prefix checked with `endswith`; pass-line wording; the "stale build?" hint
  also fires on a missing tag.
- `docs_lib.mjs`: one long comment line. AGENTS.md: one long dated parenthetical.
- SQL/collector: `sizes` is screen width only; unused `now`/`log`/`prev_end`; no `LIMIT`
  per audience dimension; the kept fixture is still named `goatcounter-toprefs.json`;
  `kpis`' `prevRange` carries meaningless fields.
- Dashboard: long paths wrap mid-word in the half-width Pages card.
- CONTRACT.md: the `events`/`outbound` part keys not named; long lines. SKILL.md: one
  bullet omits the `connect-src`/`img-src` assertions.
- Backfill: gzip detected by extension; unknown flags not rejected; a few untested inputs
  (offset stamps, quoted commas, the missing-path fallback).

## Open requests from Cyrus outside the plan

**lib-visits README** (asked 2026-10-15; a design was proposed and is awaiting his yes):
lead Setup with downloadable release binaries, build-from-source as one muted line; make
Setup and "Running it in the cloud" much shorter; add screenshots of the user-journey
charts under the title. Proposed: a `release.yml` workflow that runs only on a `v*` tag
push and builds static `visits` binaries for linux-amd64 and linux-arm64 (musl, via
`cross`) and macos-arm64 on GitHub's runners, attached to a GitHub Release; Setup as three
one-line steps led by a bold download link; the cloud section as the three diagrams with
one caption each; tag `v0.1.1`. The screenshots come after the cutover, from the csarko.sh
dashboard in both themes, under `docs/images/`, captioned as built on the JSON lines. This
is bounded work in `~/Projects/lib-visits`; get his yes first. Bumping the tag later means
re-vendoring the client in csarko.sh (the command is in AGENTS.md's Analytics section).

## Working rules learned the hard way

- **CPU.** Cyrus's machine is small, and a full background test run froze it once. Run
  only the tests that cover a change, `nice` builds, one heavy job at a time, nothing in
  the background; ask before a full suite. (His memory file `cpu-limited-test-runs.md`
  says the same.) Docker Desktop may still be running from an earlier deploy; it is not
  needed for this work.
- **Node 22** refuses `node --test <dir>/`; use a glob (`test/*.test.mjs`).
- **macOS sed** is BSD: `sed -i ''`. Implementers tripped on this twice.
- **BigQuery**: validate SQL with `bq query --dry_run` against
  `fps-csarko.dayhike_telemetry._AllLogs`, which has the same `json_payload` schema as
  `csarko_visits._AllLogs`; `window` is a reserved word.
- **GoatCounter's own site** resets connections; read its docs through the Wayback Machine
  (`curl -sL "https://web.archive.org/web/2025id_/https://www.goatcounter.com/help/<page>"`).
- **`.superpowers/`** is git-ignored scratch; anything worth keeping goes in a commit.
- House style: no em-dashes, Conventional Commits with a short body, stage paths
  explicitly (never `git add -A`), end commit messages with the attribution line your
  harness gives you.
