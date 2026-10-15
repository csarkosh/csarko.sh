# csarko.sh on lib-visits: the wiring and the cutover

*2026-10-15, amended 2026-10-15 after the survey (history dataset, roles, budget, the export's shape). Approved in conversation; this is the written form. The library itself is
specified in `~/Projects/lib-visits/docs/superpowers/specs/2026-10-15-lib-visits-design.md`;
this document is only what csarko.sh does with it.*

## 1. Why

On 2026-10-15 GoatCounter's one server reset most TLS handshakes for hours, and the
csarko.sh dashboard's Visitors, Referrers, Pages, Events and Audience cards failed with
it. The site's analytics move to `lib-visits`, Cyrus's own cookieless library, collected by
a Rust service in the site's own project and read by the admin dashboard from BigQuery.
GoatCounter's history is backfilled once and the account stays as a frozen archive.

Everything below lives in this repository. `lib-visits` knows nothing of it.

## 2. The collector: Cloud Run `csarko-visits`

A new Terraform module `_infra/modules/gcp-visits`, called from `_infra/main.tf` as
`module "gcp_visits"`, in the shape of the game's `gcp-telemetry`:

- **The service** `csarko-visits`, project `csarko-sh`, `us-west1`, `google_cloud_run_v2_service`,
  0 to 3 instances, 128 MiB, public invoker (`roles/run.invoker` to `allUsers`), its own
  service account with no roles. Container args: `serve --origin https://csarko.sh
  --trusted-proxies <n>`; env `VISITS_SECRET` from a Secret Manager secret the module
  creates (value set once by hand, as `csarko-admin`'s secrets are) and `VISITS_SINK=stdout`.
  Terraform owns the service's shape; the image tag is `ignore_changes`, since the deploy
  script owns it.
- **The rows** go where the game's do: a log bucket `csarko-visits` with Log Analytics on,
  retention 730 days, a project sink with filter `resource.type="cloud_run_revision" AND
  resource.labels.service_name="csarko-visits" AND jsonPayload.v=1`, an exclusion keeping
  the rows and the successful request entries out of `_Default`, and a linked BigQuery
  dataset `csarko_visits`.
- **The reader:** `csarko-admin`'s service account gets `roles/bigquery.jobUser` and
  `roles/logging.viewAccessor` on the project and `roles/bigquery.dataViewer` on the
  linked dataset, as the game grants its admin routes.
- **The history dataset:** a Log Analytics linked dataset is read-only, so GoatCounter's
  history lives in an ordinary dataset `csarko_history` (location `US`) with one table,
  `goatcounter_history`, that the module also creates; the reader gets `dataViewer` on it.
- **The budget:** the existing `google_billing_budget.project` has no `services` filter
  (it covers the whole project), so Cloud Logging is already inside it; nothing changes.

**Deploy:** `visits/deploy.sh` runs `gcloud run deploy csarko-visits --source
~/Projects/lib-visits --region us-west1 --project csarko-sh` after checking that checkout
is clean and on the tag the script names (`VISITS_TAG`), so Cloud Build does the Rust
build and the machine does none. It refuses if `_infra` has no `csarko-visits` yet.

**The proxy depth** (`--trusted-proxies`) is verified once at first deploy: the service is
started with its `--log-ip` setup flag (stderr only), one beacon is sent from a browser,
and the printed address is compared with the browser's. The flag is removed before the
service is left running; the right depth is recorded in this document's "As built".

## 3. The beacon stays on csarko.sh

`firebase.json` gains, for the `csarko-sh` site:

```json
"rewrites": [{ "source": "/v", "run": { "serviceId": "csarko-visits", "region": "us-west1" } }]
```

so the page posts to `csarko.sh/v`. The CSP's `connect-src` is `'self'` and the two
GoatCounter origins leave `connect-src` and `img-src`. `build_assets.py` derives all of
that from `site.json` as it does now.

## 4. The site

`site.json`:

```json
{ "analytics": { "provider": "visits", "endpoint": "/v" } }
```

`provider: null` turns analytics off cleanly, as `code: null` did.

`generate-assets.sh` / `build_assets.py`:
- vendors `visits.min.js` and `vitals.min.js` from `~/Projects/lib-visits/client/dist/`
  into `.agents/skills/site-quality/assets/vendor/`, each with a provenance comment naming
  the tag and the sha256, as `goatcounter-count.js` has; the copies are committed;
- hashes them into `public/assets/` and writes the `generated:analytics` block on every
  page, the 404 included: the core tag with `data-visits="/v"`, then the vitals tag;
- removes `engage.js` and its `read-<slug>` event: the `data-read-end` marker stays on the
  doc's Sources heading (else the "Written by" box) and `leave.re` on the doc's path is the
  same fact;
- replaces `data-goatcounter-click` with `data-visits-event` in `public/index.html` and
  `docs_lib.mjs`; every name (`out-linkedin`, `out-github`, `out-substack`, `out-youtube`,
  `nav-film`, `nav-games`, `nav-research`, `play-<slug>`, `watch-<slug>`) is unchanged;
- drops the `localStorage` note from the analytics section's rationale: the only storage
  left is the visitor's own `#visits-off`.

`check.py` keeps asserting no third-party request and the script budget; the doc page's
script weight falls from 9,922 B to about 2,500 B, so the budget stays at 10,000 B.

`AGENTS.md`'s "Analytics" section is rewritten for the new wiring; the GoatCounter
dashboard line in "Where to look" becomes the admin dashboard.

## 5. The dashboard

`admin/api`:
- adds `@google-cloud/bigquery` and a `collectors/visits.mjs` that runs saved SQL files
  from `admin/api/queries/*.sql` with `@start`, `@end`, `@prev_start` and `@prev_end`
  string parameters (the `hourlyRange` stamps, cast with `TIMESTAMP()` in the SQL), one
  job per query, cached five minutes by name and window; the GoatCounter collector, its
  client and its tests are deleted; the `notConfigured` hint key becomes `visits` with env
  `VISITS_DATASET`;
- the history table is in another dataset and location, so each query runs its live SQL
  over `csarko_visits._AllLogs` and, when the window reaches before the cutover date, a
  second SQL over `csarko_history.goatcounter_history`, and merges the rows in code
  (per-day visits summed, page and referrer rows summed by key);
- the five queries, bots filtered out:
  - **visits**: visits a day (`COUNT(DISTINCT s.visit)` over `view` rows) and the range's
    total, with the previous range for the delta;
  - **pages**: visits a path; plus, new, median engaged seconds and the share that reached
    the end, from the last `leave` per `id`;
  - **referrers**: external referrer hosts and campaigns; plus, new, the top internal
    paths (`rk = "internal"` grouped by `rp` → `p`), the journey's edges;
  - **events**: `click` rows by `ev` with the kind by prefix as today, plus outbound `u`
    hosts; `read-<slug>` rows synthesised from `leave` rows with `re` true on
    `/research/<slug>`, so the "Read to the end" tile and the `read` series keep their
    names; the outbound rate over home-page visits as today;
  - **audience**: countries, screen sizes, browsers, systems, languages as today; plus,
    new, theme (dark or light), viewport buckets, touch, timezones;
- the KPI card's visits figure comes from the same source;
- each query answers in under a second (BigQuery job overhead) and the five-minute cache
  stays.

`admin/public/csarko.sh/page.js` gains the new lines on the existing cards (theme split on
Audience, engaged seconds and reached-the-end on Pages, internal paths on Referrers). A
field-vitals line on the Health card is a follow-up once a week of `vitals` rows exists.

## 6. The cutover

One deploy, with the history backfilled first:

1. **Export** GoatCounter (Settings → Export). GoatCounter stores aggregates, not
   pageviews, so the export is either its JSON format (paths, hourly hit counts per path
   and referrer, per-day browser/system/location/size/language counts) or the older
   per-hit CSV; both carry the hourly path-and-referrer counts the trends need.
2. **Backfill:** `visits/backfill.mjs` reads either format and writes JSON lines of
   `{ hour, path, title, event, ref, visits }` (per-hit CSV rows reduced to hourly
   counts), loaded with `bq load` into `csarko_history.goatcounter_history`. Audience
   history is not backfilled: the Audience card is a window over the chosen range and the
   gap closes on its own after 90 days. One run, kept in the repo for the record.
3. **Deploy**, in order: `terraform apply` (the service, the bucket, the dataset, the
   grants), the secret's value, `visits/deploy.sh`, the proxy-depth check, then
   `generate-assets.sh` and `deploy.sh` for the site (which also ships `firebase.json`'s
   rewrite), then `admin/deploy.sh` and the `csarko-admin` image.
4. **Verify:** the site deploy's checks as today; plus the deploy sends one beacon to
   `https://csarko.sh/v`, expects `204`, and polls BigQuery for the row for up to five
   minutes (Log Analytics lag). The first real visits confirm the hash is populated and
   that the limiter is not sharing one bucket (which would mean the proxy depth is wrong).
5. **GoatCounter** stays as it is, pointed at by nothing. `goatcounter_site` leaves the
   Terraform variables and the admin API's environment.

The last pre-switch week exists in both systems; a comparison after the fact is the sanity
check B would have bought with a budget exception.

## 7. Out of scope

Day Hike's pages (the game has its own telemetry), a field-vitals chart, the access-log
mode, anything in `lib-visits` itself.
