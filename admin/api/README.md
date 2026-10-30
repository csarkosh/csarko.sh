# csarko-admin: the csarko.sh admin API

The Cloud Run service behind `https://admin.csarko.sh/csarko.sh/`. It holds the vendor
credentials, reads the site's lib-visits rows from BigQuery, Google Search Console, YouTube, GitHub, Hacker News,
PageSpeed Insights and Firebase Hosting for the admin page, the cloud bills (AWS Cost Explorer, the
GCP billing export, GitHub's usage, Modal's billing report, fal's credit balance, the Claude Code
subscription with the transcripts' list-price value, the film ledgers, and the donations through Stripe as income) for the finance page, and writes one snapshot a
day into Firestore so the trend lines are ours. Design: `docs/superpowers/specs/2026-10-12-admin-dashboard-design.md`
(Parts 1, 2.1, 2.3, 2.4); the finance page's is `docs/superpowers/specs/2026-10-29-finance-admin-page-design.md`.
Response shapes: `admin/CONTRACT.md`.

Node 22, ES modules, `node:http`, no framework. Runtime dependencies are
`@google-cloud/firestore`, `@google-cloud/bigquery`, `@google-cloud/storage` (the film ledgers'
bucket), `jose`, and for Cost Explorer `@aws-sdk/client-cost-explorer` and
`@aws-sdk/credential-providers`, nothing else.

## Routes

| Route | Auth | Answer |
|---|---|---|
| `GET /health` | none | `{ ok: true, at }` (Cloud Run's probe) |
| `GET /admin/kpis` | admin token | the index card: four KPIs with the previous period and a 12-week trend, plus the health dot |
| `GET /admin/query/<name>?days=1\|7\|30\|90` | admin token | one of `visits`, `pages`, `referrers`, `events`, `audience`, `search`, `reach`, `health`; `days` defaults to 7, anything else is 400 |
| `POST /admin/manual/<key>` body `{ "value": n }` | admin token | appends `{ at, value }` to `manual/<key>` (key: `substack`) |
| `POST /admin/snapshot` | admin token, or Cloud Scheduler's OIDC token | runs every collector and merges `snapshots/<YYYY-MM-DD>` (UTC) |
| `GET /arkos/admin/kpis` | admin token | Arkos IDE's index card: active Macs, new installs, sessions and crash-free sessions over 7 days, each with the 7 days before and a 12-week trend computed from the rows, plus the health dot |
| `GET /arkos/admin/query/<name>?days=1\|7\|30\|90` | admin token | one of Arkos's `installs`, `journey`, `sessions`, `crashes`; same `days` rule |
| `GET /finance/admin/kpis` | admin token | the finance page's index card: month to date, the idle run-rate (a fact, there is no goal), the month's net donations and the month's forecast, in dollars, with 12-week trends from the snapshots and the health dot (the sources answered, no unexplained day) |
| `GET /finance/admin/query/<name>?range=month\|last\|90\|13m` | admin token | one of `summary`, `categories`, `idle`, `daily`, `activity`, `sources`, `projects` (the spend by Films, Day Hike, the site and other), `films` (each film ledger's total against its cap, by provider and model), `claude` (Claude Code: the month's subscription fee, the transcripts' list-price value by model and by day), `income` (the donations through Stripe: the range's gross, fees, net, count and average, 60 days, 13 months, the newest 20 as amounts and days, the payouts and the balance); `range` defaults to `month`, anything else is 400 (`idle`, `daily` and `films` ignore it) |
| `POST /finance/admin/manual/<key>` body `{ "value": n }` | admin token | appends `{ at, value }` to `manual/<key>` and answers `{ key, value, at }` (key: `claude-subscription`, the claude.ai plan's monthly fee in USD, applying from its month; `n` finite and 0 or more, else 400; any other key 404) |

Arkos IDE is served under the prefix `/arkos`, and the finance page under `/finance`, so `apps.json`
names `<service>/arkos` and `<service>/finance` as their APIs and the shell's two routes hold. Its routes read the Arkos rows in the same log bucket
(`json_payload.app = 'arkos'`: the daily update checks, the opt-in session reports, the crash
reports) through `queries/arkos-*.sql`; the journey (steps, paths, milestones, next steps,
features) is worked out in code (`src/arkos.mjs`, `src/steps.mjs`) over the range's 5,000 newest
session reports. Macs are counted without an id from the check's `rd`, which needs whole UTC days, so
`installs` and the KPIs take whole days ending today (`days=1` is today so far against
yesterday); `journey`, `sessions` and `crashes` take the last `days` times 24 hours, as the
csarko.sh queries do. Design: `docs/superpowers/specs/2026-10-17-arkos-admin-dashboard-design.md`.

## Finance: the cloud bills

The finance page (`/finance/admin/*`) reads six providers, the film ledgers and, as income, the donations through Stripe. **AWS Cost Explorer costs $0.01 a call,
so it is never called on a request**: the daily snapshot job makes two calls (13 months of cost and
usage by usage type, and 60 days of the same) and a third for the month's forecast until the 28th,
and stores the rows under the day's snapshot as `finance.aws` (`monthly`, `daily`, `forecast`,
`calls`, `lastDay`); every query reads the latest snapshot. GitHub's usage
(`GET /users/<owner>/settings/billing/usage`, current and previous month; the token needs the
fine-grained **Plan: read** permission) is read by the same job and stored as `finance.github`.
The GCP billing export (`csarko-sh.billing`, the standard usage cost export, rows from 2026-10-29 on)
is read live from BigQuery through `queries/finance-*.sql`, partition-pruned and cached five minutes.
**fal** has no per-model report below the enterprise plan, so the same job reads the prepaid credit
balance (`GET https://api.fal.ai/v1/account/billing?expand=credits`, `Authorization: Key <FAL_ADMIN_KEY>`,
a key with the Admin scope) and stores it as `finance.fal = { at, balance, currency, lastDay }`; a day's
spend is the balance's fall between two snapshots (a rise is a credit purchase, never spend), derived
from the run of snapshots (`src/finance/fal.mjs`). **Modal** has no REST billing endpoint, so a Python
Cloud Run job (`admin/finance-modal/`, scheduled ten minutes before the snapshot) runs
`modal billing report` and writes `finance.modal = { at, lastDay, credits, rows, monthly }` into the
day's document (`rows` the last 60 days by app and day, `monthly` 13 months by app and month, `cost` the
usage in USD; `{ at, error }` when it failed); the API reads it from the latest snapshot, every app a
`compute` line named by the app, charged as the month's usage less the plan's $30 of included credits
(each line carries its share of that net, `gross` the usage). The job here keeps that part when it
writes `finance`, since the store replaces the key whole. The **film ledgers** (`<film>/ledger.json`
in the bucket `FILM_LEDGERS_BUCKET`, synced by the pipeline's `tools/cinema/ledger-sync.sh`) are read
live with `@google-cloud/storage` and cached five minutes; the service account needs
`roles/storage.objectViewer` on the bucket. **Claude Code** (Cyrus, 2026-10-30: "its own category")
runs on a claude.ai subscription, a flat fee the code cannot read, so the fee is entered on the page
(`POST /finance/admin/manual/claude-subscription`, the series `manual/claude-subscription`) and is
the spend: one `claudeCode` line a month (the twelfth category, `fixed`, project other), spread over
the month's days in `daily`; a month uses the latest entry at or before its end, so a plan change
applies from its month, and no entry means the provider is not configured
(`notConfigured.claude = "claude-subscription"`). The value beside it comes from
`tools/claude-usage-sync.py`, which Cyrus runs on his Mac after a day's sessions (`--dry-run` to
print it): it sums the local transcripts' tokens (`~/.claude*/projects/**/*.jsonl`) per day and per
model, prices them at the first-party API list price, and PATCHes `finance.claude = { at, lastDay,
files, rows, monthly, pricing }` into the day's snapshot with his `gcloud` token (no transcript text
leaves the Mac). The API reads it from the latest snapshot (`src/finance/claude.mjs`); a fee with no
sync there is `errors.claude = "No usage sync yet: run tools/claude-usage-sync.py"`, the fee still
counted. The job here keeps that part, like Modal's, when it writes `finance`.
**Income** (Cyrus, 2026-10-30: "I also just setup a stripe account for donations. I want this to be
included as income into the dashboard"): donations arrive through **Stripe** and are read live with a
restricted key (`STRIPE_KEY`, read-only on balance transactions, charges and payouts), cached five
minutes (`src/collectors/stripe.mjs`): `GET /v1/balance_transactions` since the first of the month
twelve months back, every page, `GET /v1/payouts` for the last 60 days and `GET /v1/balance`, with
the account's default API version (no `Stripe-Version` header). A transaction of type `charge` or
`payment` is a donation (`amount` gross, `fee`, `net`, in cents), a `refund` or `payment_refund`
subtracts, nothing else counts (`src/finance/income.mjs`). `summary` gains `income` and `total.net`
(the spend less the month's net donations), `income` is the page's card, `donations` is the third
KPI (the month's net, `good: "up"`), and `sources` gains a `stripe` row read live (`snapshotAt`
null). **The privacy rule: no donor identity ever reaches the page.** The API keeps amounts, a
currency and a day of each transaction and nothing else: no name, email, card, receipt,
description, customer or Stripe id; `recent` is `day, gross, net, currency` and the tests fail on
any other field. A Stripe read that fails is `errors.stripe`, a health warning like any source's;
without the key every income part is null with `notConfigured.stripe = "STRIPE_KEY"`.
The balance transactions are listed with `expand[]=data.source` so each carries its charge, and the
only field kept from it is the **door** (`metadata.door`): the `income` query's `byDoor` splits the
range by door, `unknown` for a charge without one.
The daily snapshot also runs the **donate step** (`src/donate/step.mjs`, `STRIPE_WRITE_KEY`): once a
month it makes the next month's prices and payment links and publishes the prices object, and stores
`finance.donate = { month, pool, at, doors }` (the `income` query's `prices`), carried forward on the
days it does nothing; without the key it is `notConfigured.donate`, and a failure is `errors.donate`.
While the GCP export's first usage day is after the first of the month being priced, the step holds
with the reason `waiting on GCP history for <month>`, whatever the day of the month.
The job also stores the day's KPI values as `finance.kpi` (`monthToDate`, `idleRunRate`, `last30`,
`forecast`, `donations`; `last30` left the card on 2026-10-30 but keeps its history), which the index
card's trends read, a small `finance.stripe = { at, mtdNet, count, lastDay }` read live, and
`finance.awsCalls`, which the Sources card sums over the month. A failing finance step is
`errors.finance` on the snapshot and never fails the rest of the day's write.

AWS credentials come by **web identity federation**, so no key is stored: the service asks the
metadata server for a Google ID token for its own service account (audience `AWS_COST_AUDIENCE`,
the role's trust condition; the role ARN when none is set) and exchanges it with
`AssumeRoleWithWebIdentity` on `AWS_COST_ROLE_ARN` (`_infra/modules/aws-costs`). Off Cloud Run there
is no metadata server: set `AWS_COST_LOCAL=1` and the SDK's default credential chain (an `AWS_PROFILE`
on the Mac) is used instead, for a local run only. Every line is put in one of twelve categories
(`src/finance/categories.mjs`: compute, serverless, hosting, load balancing, storage, AI, DNS and
keys, domains, Claude Code, CI, tax, other), each idle, activity or fixed; an unmapped line lands in
`other` and the page lists it so the table gets a row.

Every answer is JSON with `cache-control: no-store`. Errors are `{ "error": "..." }`:
401 without the token, 403 for an origin that is not allowed, 404 for an unknown route
or query, 405 for the wrong method, 429 past 60 requests in a burst and one a second
per address, 503 on every `/admin/*`, `/arkos/admin/*` and `/finance/admin/*` route while `ADMIN_EMAILS` is empty. All three
prefixes go through the same checks in the same order.

A source whose credential is missing answers `null` for its part and a
`notConfigured: { <part>: "<ENV NAME>" }` hint, never a 500. A source that is configured
but fails answers `null` and `errors: { <part>: "<message>" }` when the rest of the
answer is still worth showing; a single-source query (the visits ones) answers 500.

lib-visits counts a visit as one browser on one day (a stateless daily hash), not a
pageview, so every `pageviews` field is `null`. The pre-cutover history keeps
the old unit (a browser once per page per session) and is merged by day, path and name.

## Redo a month's tip prices

The step reuses whatever Stripe holds for the month: its lookups find the active prices by
`lookup_key` and the active links by `metadata.month`, so a rerun alone changes nothing. To make
the month's prices again (a wrong pool, a fixed bill):

1. Archive the month's prices: every active price whose `lookup_key` starts with `donate:<month>:`
   (`active=false`; a new price takes the key over).
2. Deactivate the month's payment links: every active link whose `metadata.month` is the month.
3. Delete the prices object: `gcloud storage rm gs://csarko-sh-donate-prices/prices.json`.
4. Let the next snapshot recompute it (or call `POST /admin/snapshot`), then run `donate/deploy.sh` so
   the pages' baked fallback points at the new links.

Until step 4 the pages' fallback points at the retired links, so do it in one sitting.

## Environment

All of it is set by Terraform on the Cloud Run service; the secrets arrive as environment
variables from Secret Manager. A credential whose value is empty or the placeholder
`unset` (what a secret holds before Cyrus has created it) is "not configured".

| Variable | Default | What |
|---|---|---|
| `ADMIN_EMAILS` | required | comma-separated Google accounts that may read the admin routes; empty means 503 on `/admin/*`, logged at startup |
| `FIREBASE_PROJECT` | `GOOGLE_CLOUD_PROJECT` | the Firebase project whose Auth issues the shell's ID tokens (issuer `https://securetoken.google.com/<project>`, audience `<project>`) |
| `VISITS_DATASET` | | the BigQuery dataset linked to the lib-visits log bucket (`csarko_visits`, table `_AllLogs`); empty means the visits parts, and every Arkos part, are not configured |
| `VISITS_HISTORY_DATASET`, `VISITS_HISTORY_UNTIL` | | the dataset holding GoatCounter's backfilled history (`csarko_history`) and the cutover instant (RFC 3339) where it hands over to the live rows; an empty instant means no history |
| `GSC_SA_KEY`, `GSC_PROPERTY` | `sc-domain:csarko.sh` | the service account key's JSON content (not a path) and the Search Console property |
| `YOUTUBE_KEY`, `YOUTUBE_HANDLE` | `csarkosh` | YouTube Data API key and the channel handle |
| `GITHUB_TOKEN`, `GITHUB_OWNER` | `csarkosh` | fine-grained token for the traffic endpoints, and the account whose public repositories are reported: every one of them, forks left out, found by listing the account (the public listing can never name a private one) |
| `PSI_KEY` | | PageSpeed Insights API key (Lighthouse performance, run by the snapshot) |
| `AWS_COST_ROLE_ARN` | | the IAM role (`csarko-admin-costs`) the service assumes by web identity federation to call Cost Explorer; empty means the AWS part of the finance page is not configured |
| `AWS_COST_AUDIENCE` | the role ARN | the audience of the Google ID token the role trusts (`accounts.google.com:oaud`) |
| `AWS_COST_LOCAL` | | `1` uses the SDK's default credential chain (`AWS_PROFILE`) instead of federation, for a local run; never set on Cloud Run |
| `BILLING_DATASET`, `BILLING_TABLE` | | the GCP billing export's dataset (`billing`) and table (`gcp_billing_export_v1_013AA0_554DB9_BBF90D`); either empty means the GCP part is not configured |
| `FAL_ADMIN_KEY` | | a fal API key with the Admin scope, for the credit balance; empty means the fal part is not configured |
| `STRIPE_KEY` | | a **restricted** Stripe key (read on balance transactions, charges and payouts, nothing else; never the secret key), for the donations; empty means the income parts (`summary.income`, `total.net`, the `income` query, the `donations` KPI) are not configured |
| `STRIPE_WRITE_KEY` | | a second **restricted** Stripe key that can write products, prices and payment links (nothing else), for the monthly tip prices; empty means the donate step is not configured (`notConfigured.donate`) and the snapshot skips it |
| `DONATE_BUCKET` | | the public GCS bucket the donate step writes the prices object into (`csarko-sh-donate-prices`); empty means the donate step is not configured either (it needs both this and the write key) |
| `DONATE_URL` | `https://donate.csarko.sh` | the donate site's address, read into the config; the step's payment links currently return to the same address from `src/donate/doors.mjs` |
| `FILM_LEDGERS_BUCKET` | | the private GCS bucket holding `<film>/ledger.json` (`csarko-sh-film-ledgers`); empty means the Films card is not configured |
| `MODAL_CONFIGURED` | | `1` when Terraform has created the Modal job (`csarko-finance-modal`), so a snapshot without its part is an error rather than "Not configured (MODAL_TOKEN_ID)"; the job's own secrets are `MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET`, never read here |
| (none for Claude Code) | | the provider is configured by the manual series `claude-subscription` in Firestore, entered on the page, and its usage part is written by `tools/claude-usage-sync.py` with Cyrus's own `gcloud` token: nothing on the service |
| ~~`FINANCE_GOAL_USD`~~ | | removed 2026-10-30: there is no spend goal, the idle run-rate is reported as a fact |
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
on the project and `roles/bigquery.dataViewer` on the three datasets, `csarko_visits` (the
Log Analytics linked dataset), `csarko_history` (`_infra/modules/gcp-visits`) and `billing` (the
cost export, `_infra`), and `roles/storage.objectViewer` on the film ledgers' bucket. Each
query in `queries/*.sql` is one BigQuery job (about a second of fixed overhead), run in
parallel and cached five minutes by window. Dependencies: `@google-cloud/firestore`,
`jose`, `@google-cloud/bigquery` and `@google-cloud/storage`.

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
For the finance page locally, add `AWS_COST_LOCAL=1` with an `AWS_PROFILE` that may call Cost
Explorer, `BILLING_DATASET=billing` and `BILLING_TABLE=...` (your `gcloud` login reads BigQuery),
`FAL_ADMIN_KEY=...` and `FILM_LEDGERS_BUCKET=csarko-sh-film-ledgers` (your `gcloud` login reads the
bucket), then `POST /admin/snapshot` once so the AWS, GitHub and fal parts have a snapshot to read;
remember each snapshot costs two or three cents of Cost Explorer. fal's spend needs two snapshots on
different days; Modal's part needs the Python job, or a hand-written `finance.modal` in the store.
Claude Code needs the fee entered (`POST /finance/admin/manual/claude-subscription` with
`{ "value": 200 }`) and, for the value, a `finance.claude` part: `tools/claude-usage-sync.py` writes
the real one into Firestore, or copy `test/fixtures/finance-claude.json` into the memory store. The donations need
`STRIPE_KEY=rk_...` (make a restricted key in the Stripe dashboard with read access to balance transactions, charges
and payouts); they are read live, so no snapshot is needed.

## Deploy

Terraform (`_infra/`) owns everything about the service except the image: the Cloud Run
service, its service account, the Secret Manager secrets and their mounting, the
Scheduler job, Firestore and the budget. The image is built from this directory's
`Dockerfile` (`node:22-slim`, production dependencies, `COPY queries ./queries`, non-root) and pushed by:

```sh
gcloud run deploy csarko-admin --source admin/api --region us-west1 --project csarko-sh
```

Run it by hand from the repo's root after anything under `admin/api/` changes: `admin/deploy.sh`
publishes only the Hosting site (the pages under `admin/public/`) and never deploys the API.
Do not pass `--set-env-vars` or `--update-secrets` on that command: the environment is
Terraform's, and a value set by hand would be a diff on the next plan. A Dockerfile rather than buildpacks so the Node
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
src/arkos-queries.mjs   Arkos IDE's kpis and four queries, their ranges and not-configured shapes
src/arkos.mjs           Arkos rows to answers: journey (paths, milestones, next, features...), installs, crashes, kpis
src/steps.mjs           the Arkos event-to-step table, restore folding and duplicate collapsing
src/finance-queries.mjs the finance page's kpis, ten queries, the manual series and the snapshot's finance step; `parseRange`
src/finance/*.mjs       pure shaping over plain rows: categories (the table), rows (sources to one shape, Modal's credits),
                        months (range, the categories table), idle (run-rate, stopped lines), daily (median, flags), activity,
                        projects (the rule table), films (ledgers to the Films card), fal (the balance's fall),
                        claude (the subscription's rows, the transcripts' value), income (Stripe's transactions to
                        amounts and days, never who gave), kpis (health)
src/health.mjs          the thresholds behind the health dot
src/referrers.mjs       host to group classifier (rows are `{ name, count }`)
src/store.mjs           Firestore and in-memory stores
src/collectors/*.mjs    visits (and the BigQuery runner), arkos, gsc, youtube, github, hn, psi, uptime, hosting, sitemap,
                        aws-cost (Cost Explorer by federation), gcp-billing (the export in BigQuery), github-billing (usage),
                        fal (the credit balance), stripe (the donations, paged, a restricted key), ledgers (the film ledgers in their bucket)
queries/*.sql           the saved BigQuery SQL, one job per query, copied into the image (finance-*.sql read the export)
test/                   node:test suites and JSON fixtures
```
