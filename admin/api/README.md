# csarko-admin: the csarko.sh admin API

The Cloud Run service behind `https://admin.csarko.sh/csarko.sh/`. It holds the vendor
credentials, reads the site's lib-visits rows from BigQuery, Google Search Console, YouTube, GitHub, Hacker News,
PageSpeed Insights and Firebase Hosting for the admin page, and writes one snapshot a
day into Firestore so the trend lines are ours. Design: `docs/superpowers/specs/2026-10-12-admin-dashboard-design.md`
(Parts 1, 2.1, 2.3, 2.4). Response shapes: `admin/CONTRACT.md`.

Node 22, ES modules, `node:http`, no framework. Runtime dependencies are
`@google-cloud/firestore` and `jose`, nothing else.

## Routes

| Route | Auth | Answer |
|---|---|---|
| `GET /health` | none | `{ ok: true, at }` (Cloud Run's probe) |
| `GET /admin/kpis` | admin token | the index card: four KPIs with the previous period and a 12-week trend, plus the health dot |
| `GET /admin/query/<name>?days=1\|7\|30\|90` | admin token | one of `visits`, `pages`, `referrers`, `events`, `audience`, `search`, `reach`, `health`; `days` defaults to 7, anything else is 400 |
| `POST /admin/manual/<key>` body `{ "value": n }` | admin token | appends `{ at, value }` to `manual/<key>` (key: `substack`) |
| `POST /admin/snapshot` | admin token, or Cloud Scheduler's OIDC token | runs every collector and merges `snapshots/<YYYY-MM-DD>` (UTC) |

Every answer is JSON with `cache-control: no-store`. Errors are `{ "error": "..." }`:
401 without the token, 403 for an origin that is not allowed, 404 for an unknown route
or query, 405 for the wrong method, 429 past 60 requests in a burst and one a second
per address, 503 on every `/admin/*` route while `ADMIN_EMAILS` is empty.

A source whose credential is missing answers `null` for its part and a
`notConfigured: { <part>: "<ENV NAME>" }` hint, never a 500. A source that is configured
but fails answers `null` and `errors: { <part>: "<message>" }` when the rest of the
answer is still worth showing; a single-source query (the visits ones) answers 500.

lib-visits counts a visit as one browser on one day (a stateless daily hash), not a
pageview, so every `pageviews` field is `null`. The pre-cutover history keeps
the old unit (a browser once per page per session) and is merged by day, path and name.

## Environment

All of it is set by Terraform on the Cloud Run service; the secrets arrive as environment
variables from Secret Manager. A credential whose value is empty or the placeholder
`unset` (what a secret holds before Cyrus has created it) is "not configured".

| Variable | Default | What |
|---|---|---|
| `ADMIN_EMAILS` | required | comma-separated Google accounts that may read the admin routes; empty means 503 on `/admin/*`, logged at startup |
| `FIREBASE_PROJECT` | `GOOGLE_CLOUD_PROJECT` | the Firebase project whose Auth issues the shell's ID tokens (issuer `https://securetoken.google.com/<project>`, audience `<project>`) |
| `VISITS_DATASET` | | the BigQuery dataset linked to the lib-visits log bucket (`csarko_visits`, table `_AllLogs`); empty means the visits parts are not configured |
| `VISITS_HISTORY_DATASET`, `VISITS_HISTORY_UNTIL` | | the dataset holding GoatCounter's backfilled history (`csarko_history`) and the cutover instant (RFC 3339) where it hands over to the live rows; an empty instant means no history |
| `GSC_SA_KEY`, `GSC_PROPERTY` | `sc-domain:csarko.sh` | the service account key's JSON content (not a path) and the Search Console property |
| `YOUTUBE_KEY`, `YOUTUBE_HANDLE` | `csarkosh` | YouTube Data API key and the channel handle |
| `GITHUB_TOKEN`, `GITHUB_OWNER` | `csarkosh` | fine-grained token for the traffic endpoints, and the account whose public repositories are reported: every one of them, forks left out, found by listing the account (the public listing can never name a private one) |
| `PSI_KEY` | | PageSpeed Insights API key (Lighthouse performance, run by the snapshot) |
| `SITE_URL`, `SITEMAP_URL` | `https://csarko.sh`, `<SITE_URL>/sitemap.xml` | the public site and its sitemap |
| `HOSTING_SITE` | `csarko-sh` | Firebase Hosting site for the last-deploy time (read with the metadata server's token; null off Cloud Run) |
| `ALLOWED_ORIGINS` | `https://admin.csarko.sh,http://localhost:8788` | CORS allowlist |
| `SNAPSHOT_INVOKER` | | the Cloud Scheduler service account's email, the only OIDC identity `/admin/snapshot` accepts |
| `SERVICE_URL` | derived from the request's host | the OIDC audience; the route's full URL is accepted too |
| `GOOGLE_CLOUD_PROJECT` | ADC's | Firestore project |
| `PORT` | `8080` | |
| `ADMIN_STORE` | | `memory` swaps Firestore for an in-memory store, for a local run without Google credentials |

## BigQuery access

The service account reads with `roles/bigquery.jobUser` and `roles/logging.viewAccessor`
on the project and `roles/bigquery.dataViewer` on the two datasets, `csarko_visits` (the
Log Analytics linked dataset) and `csarko_history` (`_infra/modules/gcp-visits`). Each
query in `queries/*.sql` is one BigQuery job (about a second of fixed overhead), run in
parallel and cached five minutes by window. Dependencies: `@google-cloud/firestore`,
`jose` and `@google-cloud/bigquery`.

## Local run

```sh
cd admin/api
npm install
npm test                      # node:test, no network
cp .env.local.example .env.local   # or write one by hand: ADMIN_EMAILS=you@example.com ADMIN_STORE=memory
npm run dev                   # http://localhost:8787, reads .env.local if present, restarts on change
# A request needs a Firebase ID token for an allowed account: sign in on the shell's
# preview (admin/preview.sh) and copy it from the Authorization header it sends.
curl -H "authorization: Bearer $ID_TOKEN" 'http://localhost:8787/admin/query/health'
```

`.env.local` is git-ignored. Without any vendor credential the service still starts:
the uptime, sitemap, Hacker News and GitHub-stars parts work unauthenticated and the
rest reads `null` with its `notConfigured` hint, which is the state the page must handle.

## Deploy

Terraform (`_infra/`) owns everything about the service except the image: the Cloud Run
service, its service account, the Secret Manager secrets and their mounting, the
Scheduler job, Firestore and the budget. The image is built from this directory's
`Dockerfile` (`node:22-slim`, production dependencies, `COPY queries ./queries`, non-root) and pushed by:

```sh
gcloud run deploy csarko-admin --source admin/api --region us-west1 --project csarko-sh
```

`admin/deploy.sh` runs that when `admin/api/` changed. Do not pass `--set-env-vars` or
`--update-secrets` on that command: the environment is Terraform's, and a value set by
hand would be a diff on the next plan. A Dockerfile rather than buildpacks so the Node
version, the dependency set and the user are pinned in the repo instead of inferred.

## Layout

```
src/server.mjs          entry: environment, real collectors, Firestore, listen
src/app.mjs             the routes over injected dependencies
src/auth.mjs            bearer compare (timingSafeEqual), Google OIDC for the scheduler
src/http.mjs            JSON answers, CORS, body reader, `days` validation
src/limiter.mjs         per-address token bucket (60 burst, 1/s)
src/cache.mjs           TTL cache keyed by URL, shared by every collector
src/config.mjs          environment with defaults; `unset` means not configured
src/queries.mjs         the eight queries, kpis, snapshot, manual
src/health.mjs          the thresholds behind the health dot
src/referrers.mjs       host to group classifier (rows are `{ name, count }`)
src/store.mjs           Firestore and in-memory stores
src/collectors/*.mjs    visits, gsc, youtube, github, hn, psi, uptime, hosting, sitemap
queries/*.sql           the saved BigQuery SQL, one job per query, copied into the image
test/                   node:test suites and JSON fixtures
```
