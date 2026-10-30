# finance-modal

The Cloud Run **job** `csarko-finance-modal`: once a day it runs Modal's workspace
billing report and writes it into the day's Firestore snapshot as `finance.modal`,
which the admin API's Finance page reads (`admin/CONTRACT.md`, "Finance").

**Why a Python job exists at all.** Modal has no REST billing endpoint. The only
way at the numbers is the Python SDK (`modal.billing.workspace_billing_report`, the
same data `modal billing report --json` prints: one row an app a day with its cost),
so this is a Python 3.12 container beside the Node API, and it runs as a job rather
than a service because it has nothing to serve.

## What it writes

`snapshots/<YYYY-MM-DD>` (today, UTC), the one path `finance.modal`, as a merge, so
the Node API's part of the document is never touched:

```json
{ "finance": { "modal": {
  "at": "2026-10-30T09:52:00Z", "lastDay": "2026-10-29", "credits": 30,
  "rows":    [ { "day": "2026-10-29", "app": "cinema-spike", "env": "main", "cost": 12.4 } ],
  "monthly": [ { "month": "2026-10", "app": "cinema-spike", "cost": 67.28 } ]
} } }
```

`rows` is the last 60 days, `monthly` the last 13 calendar months (daily rows summed
by month and app). Zero-cost rows are dropped; a day is Modal's UTC day; today is
never there (Modal drops a partial interval). On any failure it writes
`{ "at", "error": "<message>" }` at the same path and exits non-zero.

Modal refuses a daily report over more than 31 days and rate-limits the report
call, so the job asks month by month (13 calls, two seconds apart, with a backoff
retry on `ResourceExhaustedError`): about a minute. A real run on 2026-10-30 wrote
206 rows and 20 monthly rows (18 KB).

| Env | Default | What |
|---|---|---|
| `MODAL_TOKEN_ID`, `MODAL_TOKEN_SECRET` | | a Modal token; the Modal client reads these names itself |
| `GOOGLE_CLOUD_PROJECT` | | the Firestore project (`csarko-sh`) |
| `MODAL_CREDITS_USD` | `30` | the plan's included monthly credits, written as `credits` |

## Run it locally

```sh
cd admin/finance-modal
# The token: from ~/.modal.toml (the active profile's token_id / token_secret), or a
# dedicated token from the workspace settings.
export MODAL_TOKEN_ID=ak-... MODAL_TOKEN_SECRET=as-...
export GOOGLE_CLOUD_PROJECT=csarko-sh
python3 main.py --dry-run     # prints the document it would write, writes nothing
python3 main.py               # writes it, with gcloud ADC or GOOGLE_APPLICATION_CREDENTIALS
```

Firestore credentials: `gcloud auth application-default login`, or
`GOOGLE_APPLICATION_CREDENTIALS` pointing at a key outside the repo. Without
`MODAL_TOKEN_*` set, the Modal client falls back to `~/.modal.toml`, so a dry run on
this Mac needs no export.

Tests (the row shaping over a fixture, no credentials): `python3 -m pytest
admin/finance-modal` or `python3 admin/finance-modal/test_main.py`.

## Deploy

Terraform owns everything but the image (`_infra/modules/gcp-admin-api/main.tf`,
"the Modal job"): the job, its service account (the admin API's own), the two
secrets, the Scheduler job at 05:50 New York (ten minutes before the API's
snapshot, so that run reads a fresh part). The image is deployed the way the API's
is:

```sh
gcloud run jobs deploy csarko-finance-modal --source admin/finance-modal \
  --region us-west1 --project csarko-sh
```

Terraform ignores the image, so an apply never puts the placeholder back. Run it
once by hand with `gcloud run jobs execute csarko-finance-modal --region us-west1
--project csarko-sh --wait`, and read the result in the Finance page's Sources card.

The secrets are created seeded with the literal `unset` (so the job can be created
before the real values exist); the page says "Not configured" until a real version
is added:

```sh
printf '%s' "$MODAL_TOKEN_ID"     | gcloud secrets versions add modal-token-id     --project=csarko-sh --data-file=-
printf '%s' "$MODAL_TOKEN_SECRET" | gcloud secrets versions add modal-token-secret --project=csarko-sh --data-file=-
```
