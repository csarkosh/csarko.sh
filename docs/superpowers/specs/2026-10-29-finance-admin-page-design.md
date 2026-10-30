# The Finance admin page

*2026-10-29. Cyrus: "I will want to add a new Financial admin page so I can see an overview of my
cloud spend with categorical separations", and, of the idle bill, "I want to get to that 3-5/month
range." The first audit that this page replaces by hand is in the Baseline section; the work it
follows is the scale-to-zero rule in game-dayhike's `AGENTS.md` (2026-10-29).*

## 1. What it is for

One page, `admin.csarko.sh/finance/`, that answers four questions without opening a console:

1. **What is this month costing, and where?** Every provider, every dollar, in categories that
   say what the money bought (compute, bandwidth, storage, AI generation, serverless, DNS and
   keys, domains, CI), not in the providers' own service names.
2. **What is billing while nothing runs?** The idle run-rate, line by line, against the goal
   of $3 to $5 a month. This is the number the page exists for: a rig left parked, a load
   balancer in a dead project, a snapshot from 2021 all showed up as flat daily lines that
   nobody read for months.
3. **What did activity cost?** Rig hours, hosting egress, video generation, Cloud Run CPU: the
   spend that a session or a feature caused, so a round's cost is known the day after.
4. **Did anything jump?** A day whose total is out of line with its trailing days, named by
   the SKU that moved it.

The index gains a **Finance** card with the same KPIs every app card has.

### Non-goals

- Invoices, payment methods, credits and tax filing: the consoles' job.
- Changing anything (budgets, caps, shutdowns) from the page. It reads.
- Spend outside the cloud accounts (GitHub Pro, Substack, domains bought elsewhere) unless
  entered by hand through the manual route that already exists.
- Per-match or per-player cost allocation in the game.

## 2. Sources

| Provider | What | How it is read | History |
|---|---|---|---|
| Google Cloud (billing account `013AA0-554DB9-BBF90D`, projects `fps-csarko`, `csarko-sh`, `enkio-485416`; `magicpixel-487014` until its deletion completes) | Daily cost per SKU with credits | The standard usage cost export to BigQuery, **enabled 2026-10-29** into `csarko-sh.billing` (table `gcp_billing_export_v1_013AA0_554DB9_BBF90D`, partitioned by `_PARTITIONTIME`). The API already runs BigQuery for the visits cards; this is one more dataset and the same client. | From 2026-10-29 forward only. Google does not backfill. The months before are in the console's reports; a one-time CSV from "Cost table" can be loaded by hand if the history matters. |
| AWS (account `705624689046`) | Monthly and daily cost per service and usage type | Cost Explorer `GetCostAndUsage` (and `GetCostForecast` for the month's forecast). **Each call costs $0.01**, so the daily snapshot job makes the calls once a day and the page reads the snapshot; a card never calls Cost Explorer on a request. | 13 months, available at once. |
| GitHub (`csarkosh`, Pro) | Actions minutes, LFS storage and bandwidth, gross and net | `GET /users/csarkosh/settings/billing/usage` with the API's existing GitHub token, which needs the fine-grained **Plan: read** permission added. The repositories are public, so the net is $0 and the gross is "what this would cost if private". | The current and previous months. |
| Domains | `csarko.sh` ($76 a year, Route 53 Domains, auto-renew on; `enkio.ai` and `magicpixel.ai` to 2028, auto-renew off) | Cost Explorer reports the renewal in its month as "Amazon Registrar". The page also shows it amortised, as a fixed line the categories know about. | with AWS |

Every source follows the contract's rules: a missing credential is `null` with `notConfigured`,
a failed one `null` with `errors`, numbers are numbers, `cache-control: no-store`.

## 3. Categories

A table in the API (`admin/api/src/finance/categories.mjs`, one list, tested) maps each provider's
line to a category and marks it **idle** (bills while nothing runs) or **activity** (bills because
something ran). Unmatched lines go to **Other**, and the page lists them so the table gets a row.

| Category | Lines (examples) | Kind |
|---|---|---|
| Compute | `BoxUsage:g4dn.xlarge`, GCP `Nvidia L4 GPU`, Windows licensing on a VM | activity |
| Serverless | Cloud Run CPU and memory (request- and instance-based), Cloud Run Functions | activity |
| Hosting and bandwidth | Firebase Hosting outgoing bandwidth, `DNS-Queries`, `PublicIPv4:InUseAddress` | activity |
| Load balancing | `Cloud Load Balancer Forwarding Rule Minimum` | idle |
| Storage | `EBS:VolumeUsage.*` (a parked rig's disk), `EBS:SnapshotUsage` (the rig image), Firebase Hosting storage, Cloud Storage, Artifact Registry, S3 | idle |
| AI generation | Vertex AI (`Veo 3 Fast 720p Audio Video Generation`), Gemini API | activity |
| DNS, keys and secrets | `HostedZone`, `KMS-Keys`, `AWSSecretsManager-Secrets` | idle |
| Domains | `Route53-Domains` (Amazon Registrar) | fixed (shown amortised, 1/12 a month) |
| CI | GitHub Actions minutes (Linux, Windows, macOS), Actions storage, Git LFS storage and bandwidth | activity |
| Tax | `Tax` | follows the rest |

Categorical colours follow the site's chart rules (one fixed order, never cycled; a 9th series
folds into Other): the categories are assigned hues in the order above and keep them whatever
the range shows.

## 4. The page (`admin/public/finance/`)

The same markup, nav, trail (`Admin › Finance`), tokens, skeletons and hold rules as the other
pages (spec 2026-10-12, 2.8; the "never blank" rule). A range row with **This month**,
**Last month**, **90 days**, **13 months**. Cards, in order:

1. **This month.** Tiles: month to date (all providers, net of credits), the month's forecast
   (AWS's forecast plus GCP's run-rate extrapolation plus GitHub's net), last month's total, and
   the **idle run-rate** (card 3's sum) against the goal, the tile's delta reading "under the
   $5 goal" or "$x over". Under them one row per provider: month to date, last month, the
   change.
2. **By category.** Columns per month for the range (13 months at most), one column a month
   split by category as stacked segments with the 2 px surface gap, the legend always present,
   each category direct-labelled on the last month; below it the same as a table with a row per
   category and a column per month. Months before 2026-10-29 carry an "AWS and GitHub only"
   mark, since GCP's export has no earlier days. (`charts.js` gains a `stacked` option on
   `columns`, or the card renders one small-multiple column chart per category on a shared
   scale; never two axes.)
3. **Idle run-rate.** The actionable list: every line marked idle, its last seven days'
   average daily cost times 30, sorted by amount, with the provider, the project or region, and
   the resource where the SKU names one (the snapshot id, the key id, the zone). The sum is the
   tile on card 1. A line that was present a week ago and is gone now stays for seven days
   struck through with "stopped <day>", so a cleanup is seen to have worked.
4. **Daily.** The last 60 days, one column a day, split by provider, with the trailing 14-day
   median as a ghost line; a day over three times the median is marked and its top SKU named in
   the tooltip. This is where a rig round, a Veo batch or a forgotten machine shows up the day
   after.
5. **What activity bought.** Tiles for the range: rig hours (from `BoxUsage` quantity) and
   their cost; hosting egress in GiB and its cost; Cloud Run CPU-hours and cost; CI minutes
   (gross dollars, net dollars); AI generation count and cost. Each tile notes the unit price so
   the next session can be budgeted ("a rig hour is $0.526 plus $0.19 of disk and IP").
6. **Sources.** One row per source: configured or not, the last day it has data, when the
   snapshot last ran, and for Cost Explorer the calls made this month and their cost (two a day,
   about $0.60 a month: the one line this page adds to the bill, said here so it is not a
   mystery).

Everything except card 6 renders from the sample under `?preview` with the fixed data in
`admin/public/sample/finance/`.

### The index card

`GET <api>/admin/kpis` for `finance`: **Month to date**, **Idle run-rate** (`good: "down"`),
**Last 30 days**, **Forecast**; twelve weekly trend points from the snapshots. Health: `good`
when the idle run-rate is at or under $5 and no day in the last 7 is over three times its
median; `warning` when the idle run-rate is over $5; `critical` when a day in the last 7 is
over $20 without a rig session or AI generation line to explain it.

## 5. The API (`admin/api/`)

Collectors, one file each, returning plain JSON, cached in memory five minutes as the others are:

- `collectors/aws-cost.mjs`: Cost Explorer. Two calls a day from the snapshot job: monthly cost
  by `USAGE_TYPE` for 13 months, and daily cost and quantity by `USAGE_TYPE` for 60 days; the
  forecast is a third call on the 1st to 28th. Nothing on a page request.
- `collectors/gcp-billing.mjs`: three SQL files under `queries/finance-*.sql` over the export
  table (daily cost and credits by SKU and project for 60 days; monthly by SKU for 13 months;
  the last day present). Partition-pruned on `_PARTITIONTIME`; the table is kilobytes a day and
  stays inside BigQuery's free tier.
- `collectors/github-billing.mjs`: the usage endpoint, current and previous month.
- `finance/categories.mjs`: the mapping of section 3; `finance/idle.mjs`: the run-rate and the
  struck-through lines; `finance/anomalies.mjs`: the median rule.

Queries, by name, under `GET /admin/query/finance-<name>?range=month|last|90|13m`:

| name | Returns |
|---|---|
| `summary` | card 1: totals and forecast per provider, the idle sum, the goal |
| `categories` | card 2: per month per category, net of credits, with the "partial" mark |
| `idle` | card 3: the lines |
| `daily` | card 4: per day per provider, the median, the flagged days with their top SKU |
| `activity` | card 5: the quantities, costs and unit prices |
| `sources` | card 6 |

The snapshot job (`POST /admin/snapshot`, 06:00 America/New_York, exists) gains a finance step
that stores the day's Cost Explorer answers and the GitHub usage under `snapshots/<day>.finance`
(a few KB; the document is merged, as today). Every finance query reads AWS and GitHub from the
latest snapshot and GCP from BigQuery live.

Shapes go in `CONTRACT.md` with examples that the sample mirrors one for one, as the other
queries' do.

## 6. Infrastructure (`_infra/`, Terraform)

- **BigQuery.** `gcp-admin-api`'s service account gains `roles/bigquery.dataViewer` on the
  `billing` dataset (it has `jobUser` on the project already for the visits queries). The
  dataset itself was made by hand on 2026-10-29 (`bq mk --dataset --location=US csarko-sh:billing`)
  because the export had to be switched on in the console that day; it is imported into
  Terraform (`google_bigquery_dataset.billing`) rather than recreated, and the export setting
  itself is console-only (no Terraform resource exists for it) and is recorded in this spec.
- **AWS, no stored key.** An IAM role `csarko-admin-costs` in `_infra` (the AWS provider is
  already there for DNS) with one policy, `ce:GetCostAndUsage` and `ce:GetCostForecast`, that
  trusts the Cloud Run service account through web identity federation
  (`sts:AssumeRoleWithWebIdentity`, provider `accounts.google.com`, the conditions
  `accounts.google.com:oaud` equal to the audience the token is minted for,
  `https://admin.csarko.sh/aws-costs`, and `accounts.google.com:aud` and `:sub` equal to the
  service account's unique id, since a service account's token sets `azp` and AWS then reads
  `aud` as that field; *as built 2026-10-29*, `_infra/modules/aws-costs/`). The API mints a Google
  ID token for its own service account from the metadata server and exchanges it; nothing
  long-lived is stored, and Secret Manager stays as it is. A fallback for local preview is an
  `AWS_PROFILE` on the developer's Mac, never a key in a secret.
- **GitHub.** The existing `github-token` secret's token gets **Plan: read** (a fine-grained
  permission) in GitHub's UI; no infrastructure change.
- **Cost of the page.** Two Cost Explorer calls a day, $0.60 a month; BigQuery, Firestore and
  Cloud Run inside their free tiers. It is a resource that bills while idle, and this is the
  sentence that says so.

## 7. Order of work

1. *(done 2026-10-29)* The GCP export is on; the first rows land within a day.
2. Terraform: the dataset import and viewer grant, the AWS role and its trust, applied.
3. The categories table and its test, against the October 2026 lines in the Baseline below:
   every line there lands in a category, none in Other.
4. Collectors, the snapshot step, the six queries, `CONTRACT.md`, the sample.
5. The page, then the index card; `check.py --admin`, screenshots in both themes, Lighthouse
   at the admin bar.
6. A week of snapshots, then the first look at the idle list against the goal.

## 8. Baseline (the hand audit of 2026-10-29)

October 1 to 29, 2026, before any change: **$140.56** across the three providers, against a
steady state of about **$25 a month** in the months before.

| Category | October 1–29 | What it was |
|---|---|---|
| AI generation | $64.80 | Veo 3, 648 clips, project `fps-csarko`, Oct 22–28 |
| Hosting and bandwidth | $18.92 | Firebase Hosting egress 135 GiB (rig rounds: each sample downloaded the client); `PublicIPv4` $0.16 |
| Load balancing | $16.44 | a global forwarding rule in `magicpixel-487014`, every month of 2026, project shut down ~Oct 28 |
| Compute | $26.48 | AWS `g4dn.xlarge` $21.24, GCP rig $5.24 |
| Storage | $7.37 | three parked rig disks $4.78, snapshots $2.48, GCS $0.11 |
| Serverless | $3.43 | Cloud Run after the free tier (CPU always allocated on both services) |
| DNS, keys and secrets | $3.17 | hosted zones, a 2017 test KMS key, a 2020 secret, tax |
| CI | $0 net ($73.48 gross) | Actions on public repositories |

What was done that day, and what the page should show as stopped lines: rigs terminate instead
of parking (no disks between sessions); the GCP rig destroyed; both Cloud Run services on
request-based billing; the harness sharing its HTTP cache across samples; seven 2021 AMIs and
their eleven snapshots, a test KMS key, an unused secret, an empty hosted zone and two stale S3
buckets removed on AWS. The idle run-rate after that is the rig image's snapshot ($0.29), the
`csarko.sh` hosted zone ($0.50), AWS's default keys ($0) and the domain amortised ($6.33), about
**$1 a month** of cloud plus the domain.

## 9. Privacy

Everything on this page is private (the admin allowlist). Amounts, account ids and project ids
are never published; a research doc that quotes a figure quotes it by hand.

## 10. Open questions for Cyrus

- Web identity federation for AWS (no stored key; one more IAM role) or an access key in
  Secret Manager (simpler, a secret to rotate)? This spec assumes federation.
- Fixed subscriptions (GitHub Pro $4, Substack) on the page through the manual route, or left
  out?
- Is $5 the health threshold, or $3?
- Load the GCP months before October 29 from a console CSV once, or let the history start
  there?

## 11. Amended 2026-10-30: no goal, the film providers, the ledgers

Cyrus, 2026-10-30: "I don't have a goal of $5. I am building AI short films which drives a lot of
that cost." So the page judges nothing: the idle run-rate is reported as a fact beside the
activity spend, and the health dot reads the sources and the unexplained days only. And the
providers the films run on are on the page:

- **Modal** (GPU for the image, video and assembly stages of `~/Projects/film-generation`, and
  the Day Hike `dayhike-*` experiments): $80.06 of usage in October 2026 against $30 of included
  credits, $73.49 in September. Modal has no REST billing endpoint, so a Python Cloud Run job
  (`admin/finance-modal/`, `csarko-finance-modal`, scheduled ten minutes before the snapshot)
  runs the workspace billing report and writes `finance.modal` into the day's snapshot. Every
  Modal app is a Compute line named by its app; `cinema-*` apps are film cost, `dayhike-*`
  are Day Hike's.
- **fal** (Seedance, Nano Banana 2, sound effects): $53.63 in October from a prepaid balance.
  fal's per-model report is enterprise-only, so the API reads the credit balance once a day
  with an admin-scoped key (`FAL_ADMIN_KEY`) and a day's spend is the balance's fall; a rise
  is a purchase, never spend. Category AI generation, project Films.
- **The film ledgers**: the pipeline prices every paid call before it is made and writes it
  to `<film>/ledger.json` on the SSD; `tools/cinema/ledger-sync.sh` there copies the ledgers
  alone to the private bucket `csarko-sh-film-ledgers`, and the Films card shows each film's
  total against its $150 cap, by model and provider. The rows carry no dates, so they
  attribute cost and never feed the daily chart; Veo rows are at list rate, so a film's Vertex
  figure can read higher than Google's bill.
- **Projects**, the second axis: Films, Day Hike, csarko.sh and admin, Other, by month, from
  a rule table over every provider's lines (`admin/api/src/finance/projects.mjs`).

Secrets added (seeded `unset`, the page says "Not configured" until a version is added):
`modal-token-id`, `modal-token-secret` (a dedicated Modal token from the workspace's settings),
`fal-admin-key` (a fal key with the Admin scope). The $5 budget on the `csarko-sh` project
stays: it is the site's own alert, not a goal.

**Claude Code, its own category** (Cyrus, 2026-10-30: "i want claude code plumbing into this
too as its own category"). Claude Code runs on a claude.ai subscription, a flat fee with no
billing endpoint, and its usage is in the local transcripts (`~/.claude*/projects/**/*.jsonl`,
one JSON line a message with its token counts and model). `tools/claude-usage-sync.py`, run on
the Mac, sums them per day and per model, prices each row at the first-party API list price
(the plan's value, never a bill: October 2026 came to about $10,450 at list, against a flat
fee), and writes `finance.claude` into the day's snapshot; no transcript text leaves the Mac.
The subscription fee is entered once on the page (the manual series `claude-subscription`)
and is the provider's spend, spread evenly over the month's days; the category `claudeCode`
is fixed, like Domains. The Claude Code card shows the fee, the month's list-price value,
the messages, and the daily value by model.
