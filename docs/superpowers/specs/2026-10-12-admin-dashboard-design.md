# admin.csarko.sh: one dashboard for every app's traction

Date: 2026-10-12 · Status: approved by Cyrus 2026-10-12 (token auth, not Google sign-in; public repos only; admin pages inherit the site's style and quality bar) · Not published (docs/superpowers is internal)

## Goal

Answer three questions about csarko.sh, and later about every app Cyrus ships, from one
private page: **how many people visit, what they do while they are here, and whether the
site is getting exposure elsewhere** (search, YouTube, GitHub, Substack, link-sharing
sites). "Traction" is the trend, so every number is shown against the previous period and
over the last twelve weeks, not as a bare total.

The page is `https://admin.csarko.sh`. Its index lists every tracked app with a few KPIs
and a health dot; `/csarko.sh` is the portfolio site's dashboard and `/game-dayhike` is the
Day Hike admin page that lives at `games.csarko.sh/dayhike/admin/` today, moved here.

Constraints, all his: no cookies anywhere (the public site already uses none), a monthly
cost as close to $0 as possible, and a shape that scales to more apps and more metrics
without a redesign.

## Decisions

| Question | Decision |
|---|---|
| How Cyrus gets in | **One admin token, no sign-in** *(Cyrus, 2026-10-12: he prefers a token to signing in)*. A long random secret he pastes into the admin page once per browser; the page keeps it in localStorage (not a cookie) and sends it as `Authorization: Bearer` to every app's API. Each API holds the same token in Secret Manager and compares it in constant time. No Firebase Auth, no Identity Platform, no OAuth console steps. |
| Where csarko.sh's data is read from | A small Cloud Run service `csarko-admin` in `csarko-sh` that holds the vendor credentials and proxies GoatCounter, Search Console, YouTube, GitHub and a few free public endpoints. The browser never sees a vendor token. Scales to zero; free tier covers it. |
| Why not call GoatCounter from the browser | Its API does allow it (`Access-Control-Allow-Origin: *`, checked 2026-10-12), but the token would sit in a public static bundle, and the Search Console key cannot go to a browser at all. One pattern for every source is simpler than two. |
| History | A daily snapshot of every KPI into Firestore, written by one Cloud Scheduler job (3 jobs per billing account are free). GitHub traffic only lasts 14 days at GitHub, YouTube counts are cumulative, and GoatCounter is a third party: the ledger makes the trend ours. |
| Where the shell lives | This repo, `admin/`, deployed as a second Firebase Hosting site (`csarko-sh-admin`) in the `csarko-sh` project. Terraform here adds the site, the custom domain and the `admin` CNAME. |
| Where the Day Hike page lives | Its code stays in `game-dayhike` (it needs the game's sim to redraw trails). That repo builds it with `base: /game-dayhike/` and publishes the bundle to GCS; this repo's admin deploy pulls it in before `firebase deploy`. Firebase Hosting has no partial deploys, so one repo has to assemble the site. |
| Charts | The game admin's dependency-free SVG charts (`columns`, `funnel`, `histogram`, `tile`, `table`) ported to plain JS as `admin/public/charts.js`. No chart library. |
| Theme | The site's own tokens, copied the way `docs_lib.mjs` copies them, so the admin reads like csarko.sh. Dark and light by system setting, no toggle. |
| Preview | `?preview` renders a fixed sample dataset without sign-in, as the game admin does, so pages can be built and screenshotted with no credentials. |

## Non-goals

- Replacing GoatCounter. It stays the collector on the public site; the admin reads it.
- Any identifier that follows a visitor across days on csarko.sh. GoatCounter cannot do it
  without cookies and we do not want it. (Day Hike's `vid` in localStorage is the game's
  own call and is not changed by this design.)
- Real-time anything for csarko.sh. A five-minute cache is fine for a portfolio.
- Public dashboards. Everything behind `admin.csarko.sh` is for whoever holds the token: Cyrus.
- Cross-site visitor stitching (csarko.sh visitor → Day Hike player). The two apps are
  read side by side; the Play click on csarko.sh and the game's landing count are the
  join, by eye.

## Part 1: the metrics, and where each one comes from

Each row says what the metric tells you, which source has it, whether the source is
already wired up, and what it costs.

### 1.1 How many people visit (GoatCounter, in place)

GoatCounter counts a **visit** the first time a session (site + IP + User-Agent, held in
memory for 8 hours, never stored) loads a path, and a **pageview** on every load. It stores
no IP and nothing in the browser. The hosted plan is free for personal, non-commercial use.
API: `GET /api/v0/stats/total`, `/stats/hits`, `/stats/hits/{path_id}` (referrers for one
path), `/stats/{page}` for the dashboard panels, `/paths`; `Authorization: Bearer <token>`;
4 requests per second.

| Metric | What it tells you | How |
|---|---|---|
| Visits per day; 7, 28 and 90 days vs the previous period | Is traffic growing | `stats/total` with `start`/`end`, `stats` array per day. **GoatCounter's API reports visits only**, never pageviews (found on the first deploy, 2026-10-13); the dashboard has no pageview figure |
| Visits per page | Which docs, the games list or the film page pull people in | `stats/hits` (paths with visitors and pageviews) |
| Referrers, grouped | Where visits come from: search, LinkedIn, Substack, GitHub, YouTube, Hacker News, Reddit, direct | `stats/toprefs`, `stats/hits/{path_id}`; a small classifier maps hosts to groups |
| Campaigns | Which of *his own* links worked: a `?ref=substack-<post>` or `utm_source=linkedin` on links he posts shows up as the referrer | `stats/campaigns`, after tagging the links (Part 3, step 0) |
| Countries, screen sizes, browsers, systems, languages | Who the audience is, and whether the phone layout matters (it does: most Substack reading is on phones) | `stats/locations`, `stats/sizes`, `stats/browsers`, `stats/systems`, `stats/languages` |
| 404 paths | Broken links people actually hit | `stats/hits` paths not in `public/sitemap.xml` (the 404 page has no canonical, so GoatCounter records the path asked for) |

**Not available, by design:** new vs returning visitors, time on page, bounce rate.
GoatCounter has no cross-day identity. The honest proxies are the share of *direct*
visits (people who typed or bookmarked), repeat Substack readers (Substack's own stats),
and the read-to-the-end event below.

### 1.2 What they do on the site (GoatCounter events, not yet used)

`count.js` already supports events: an element with `data-goatcounter-click="<name>"`
counts a click, and `goatcounter.count({path: '<name>', event: true})` counts anything.
Events are stored as paths flagged `event`, so the same `stats/hits` call returns them;
`/paths` tells the two apart. No new script, no CSP change, no new request type.

| Event | Why it matters | Where it goes |
|---|---|---|
| `out-linkedin`, `out-github`, `out-substack`, `out-youtube` | The portfolio's conversions: a visitor went on to contact or follow him | hero chips and Contact chips in `public/index.html` |
| `play-<game>` | A visitor went to play; pairs with Day Hike's "Landed" funnel step | the "Play in your browser" link in `docs_lib.mjs` |
| `watch-<film>` | A visitor went to watch; pairs with YouTube views | the "Watch on YouTube" link in `docs_lib.mjs` |
| `nav-research`, `nav-games`, `nav-film` | Which section a page sends people to | the page links in both navs, never on the current page |
| `read-<slug>` *(in place, 2026-10-12)* | **The engagement metric for a research site:** the reader reached the end of the doc. `.agents/skills/site-quality/assets/engage.js` (549 B shipped, comment lines stripped at build) fires it once when the doc's end scrolls into view: the Sources heading when there is one (a 146-source list would otherwise hide the readers who finished the prose), else the "Written by" box, marked `data-read-end` by the build. Doc pages only. A doc page now carries 9,922 B of the 10,000 B script budget: the next script displaces something. | doc pages, via `build_assets.py` and `docs_lib.mjs` |

Every event name is a stable identifier, not copy, so renaming a button never breaks a
series.

### 1.3 Exposure elsewhere (search, video, code, newsletter)

| Source | Metrics | Access | Status |
|---|---|---|---|
| **Google Search Console** | impressions, clicks, CTR, average position, by query, by page, by day; pages indexed vs pages in the sitemap; sitemap last fetched | `searchAnalytics.query` and `urlInspection.index.inspect`, service account `gsc-reader@csarko-sh` with key at `~/.config/csarko-sh/gsc-sa.json`. Quotas: 1,200 queries/min per site; URL inspection 2,000/day per site (29 URLs, fine). Data lags 2 to 3 days and keeps 16 months. | **Wired** (`general:search-console`'s `gsc.py`); the admin API reuses the same key and calls |
| **YouTube Data API** | channel subscribers, total views, video count; per-video views and likes for the films | API key, public data, `channels.list` and `videos.list` cost 1 unit each of 10,000 a day | New: one API key in the `csarko-sh` project |
| **YouTube Analytics API** | watch time, average view duration, traffic sources per video | Channel owner OAuth (`yt-analytics.readonly` + `youtube.readonly`) | Phase 2: needs a one-time consent and a stored refresh token; the Data API numbers come first |
| **GitHub** | stars, forks, watchers on `game-dayhike` and `electron-gamepatch`; repo traffic: views, unique visitors, clones, top referrers, top paths, **last 14 days only** | public REST for stars; traffic needs a fine-grained token with read access to the repos | New: one read-only PAT; the daily snapshot keeps traffic beyond 14 days |
| **Hacker News** | mentions of `csarko.sh` (stories and comments) | Algolia HN search API, free, no auth | New, trivial |
| **Reddit, LinkedIn, Bluesky** | mentions, profile views | no usable free API for a personal profile; Reddit's API requires an app and has tightened | Not built. Referrers in GoatCounter show when a mention sends traffic, which is what matters |
| **Substack (csarko.log)** | subscribers, opens, post views | no API | A **hand-entered** number: a small form on the csarko.sh page writes `manual/substack` into Firestore with a date, so the trend still draws. Posts themselves are already logged in `docs/substack/posts.json` |
| **Backlinks** | who links to the site | Search Console's Links report has no API; third-party indexes cost money | Not built. GoatCounter referrers cover the links that get clicked |

### 1.4 Health (so the index can show a dot)

| Check | Source | Cost |
|---|---|---|
| Site up, TTFB, certificate days left | a `HEAD https://csarko.sh/` from the API | free |
| Lighthouse performance score (lab) | PageSpeed Insights API, API key, 25,000 requests a day free; run once a day in the snapshot, not on page load | free |
| Pages indexed = pages in sitemap; sitemap fetched in the last 7 days | Search Console | free |
| 404s in the last 7 days | GoatCounter paths not in the sitemap | free |
| Last deploy | Firebase Hosting API `sites.releases.list` | free |

Health is **good** when the site is up, Lighthouse performance ≥ 95, every sitemap URL is
indexed and no 404 path has more than a handful of hits; **warning** when one of those
slips; **critical** when the site is down or performance drops under 90.

### 1.5 What the index shows per app

Three to four KPIs, each with the current period, the delta against the previous period,
a 12-week sparkline, and a health dot. The same contract for every app (see 2.3).

| App | KPIs on the index |
|---|---|
| csarko.sh | visits (7d, Δ) · search clicks and impressions (28d, Δ) · outbound clicks (7d, Δ) · health |
| game-dayhike | sessions (7d, Δ) · matches started (7d, Δ) · clean sessions % (7d) · lobbies open now · health (error rate vs the previous week) |

## Part 2: the build

```
admin.csarko.sh  (Firebase Hosting site csarko-sh-admin, project csarko-sh, static)
├── /                 index: apps.json → one card per app, KPIs from each app's API
├── /auth.js          the token gate: localStorage token, fetchWithAuth()
├── /charts.js, /admin.css, /sample/*.json
├── /csarko.sh/       the portfolio dashboard (this repo)
└── /game-dayhike/    the Day Hike admin bundle (built in game-dayhike, pulled at deploy)

csarko-admin  (Cloud Run, project csarko-sh, min 0, max 2)      fps-telemetry (exists, project fps-csarko)
  GET  /admin/kpis                                                 GET /admin/kpis            (new, one saved query)
  GET  /admin/query/<name>?days=N                                  GET /admin/query/<name>    (exists)
  POST /admin/manual/<key>        {value, at}                      GET /admin/live            (exists)
  POST /admin/snapshot            (Cloud Scheduler, OIDC)          GET /admin/session/<sid>   (exists)
  → GoatCounter · Search Console · YouTube · GitHub · HN · PSI · Firestore (snapshots, manual)
```

### 2.1 Access: one token, no sign-in, no cookies

A single admin token: 32 random bytes, base64url, generated once (`openssl rand -base64 32`),
stored in Secret Manager in each project that runs an app API (`csarko-sh` for
`csarko-admin`, `fps-csarko` for `fps-telemetry`) and injected as the `ADMIN_TOKEN` env
var. It is never committed. Rotation is: new secret version, redeploy both services,
paste the new value into the browser.

`/auth.js` is the only auth surface on the client: `token()` (from localStorage key
`admin.token`), `setToken(t)`, `clearToken()`, and `fetchWithAuth(url, init)` which adds
`Authorization: Bearer <token>`. When no token is stored, or any API answers 401, the shell
shows one field, "Admin token", and nothing else. The csarko.sh page and the Day Hike
bundle both import it, so the Day Hike client drops its `firebase` dependency.

Every app API compares the bearer value against `ADMIN_TOKEN` with
`crypto.timingSafeEqual` (lengths checked first) and answers 401 on a mismatch. If
`ADMIN_TOKEN` is unset the admin routes are not served at all, the same rule the game
applies to an empty allowlist today. The existing per-IP token bucket makes guessing a
256-bit value pointless. CORS allows `https://admin.csarko.sh` (and `http://localhost:<port>`
for preview) and the `authorization` header. The token lives only in Cyrus's own browsers;
the public site is untouched.

Why not Google sign-in: Cyrus preferred not to sign in (2026-10-12). The sign-in version
(Firebase Auth in `csarko-sh`, the game's API trusting that issuer) is recorded in this
spec's first draft in git history, should it ever be wanted.

### 2.2 Infrastructure (Terraform, `_infra/`, project `csarko-sh`)

New, all free at this scale:

- `module "gcp_hosting_admin"`: a second instance of the existing `gcp-hosting` module,
  `site_id = "csarko-sh-admin"`, `domain_name = "admin.csarko.sh"`, no redirect domains.
- `aws_dns` gains `"admin.csarko.sh" => csarko-sh-admin.web.app` in `cname_records`.
  A subdomain can CNAME straight to the site's own host, as `www` does. The apex TXT is
  not touched.
- `gcp-admin-api`: Artifact Registry repo, Cloud Run service `csarko-admin` (1 CPU, 256Mi,
  min 0, max 2, concurrency 80, `allUsers` invoker because the handler does the auth),
  a service account with `secretmanager.secretAccessor` and `datastore.user`, Secret
  Manager secrets `admin-token`, `goatcounter-token`, `gsc-sa-key`, `youtube-key`,
  `github-token`, `psi-key` (6 active versions are free; `gsc-sa.json` is the same key the
  CLI skill uses, uploaded once; a collector whose secret is missing reports "not
  configured" instead of failing the page), Firestore database (native), one Cloud Scheduler job
  (`0 6 * * *` America/New_York → `POST /admin/snapshot` with an OIDC token for the
  service account), and a `google_billing_budget` at $5 a month like the game's.

Hosting quota is project-level: 10 GB stored, 10 GB transferred a month, shared with
csarko.sh. The admin site is a few hundred KB and has one reader.

### 2.3 The app contract (what makes it scalable)

An app is tracked by adding one entry to `admin/public/apps.json` and serving two routes:

```json
{ "slug": "game-dayhike", "name": "Day Hike", "home": "https://games.csarko.sh/dayhike",
  "api": "https://fps-telemetry-5pogqa5sqq-uw.a.run.app", "page": "/game-dayhike/" }
```

```
GET /admin/kpis            → { "app": "...", "at": "<iso>",
                                "kpis": [ { "key": "visits", "label": "Visits", "value": 212, "prev": 180,
                                            "unit": "", "trend": [ ...12 weekly numbers ] } ],
                                "health": { "status": "good" | "warning" | "critical", "note": "..." } }
GET /admin/query/<name>?days=1|7|30|90   → app-specific JSON, consumed by the app's own page
```

The index needs only `/admin/kpis`. Each app owns its page and its API, so a new app
never touches another app's code, and a vendor change (say, self-hosting GoatCounter)
changes one collector in one API. The game's API already has `/admin/query/*`; it gains
`/admin/kpis` (one saved query over sessions, matches, clean sessions and errors) and the
`csarko-sh` issuer.

### 2.4 The csarko.sh API (`admin/api/`, Node 22, no framework)

Collectors, one file each, each returning plain JSON and cached in memory for five
minutes so the page's cards never exceed GoatCounter's 4 requests a second or Search
Console's quotas: `goatcounter.mjs`, `gsc.mjs` (ports `gsc.py`'s three calls), `youtube.mjs`,
`github.mjs`, `hn.mjs`, `psi.mjs`, `uptime.mjs`, `hosting.mjs`. Queries, by name:

| `name` | Returns | Sources |
|---|---|---|
| `visits` | per-day visits and pageviews for the range and the range before it | GoatCounter |
| `pages` | per-path visitors and pageviews, events excluded, 404s flagged | GoatCounter + sitemap |
| `referrers` | referrers grouped (search, social, newsletter, code, video, direct, other) and raw; campaigns | GoatCounter |
| `events` | outbound, play, watch and read events with visitors | GoatCounter |
| `audience` | countries, sizes, browsers, systems, languages | GoatCounter |
| `search` | per-day clicks, impressions, CTR, position; top queries; top pages; indexed vs sitemap; sitemap state | Search Console (card says "2 to 3 days behind") |
| `reach` | YouTube channel and per-film stats, GitHub stars and traffic for **public repos only** (`game-dayhike`, `electron-gamepatch`; never a private one, *Cyrus 2026-10-12*), HN mentions, Substack manual series | YouTube, GitHub, HN, Firestore |
| `health` | up, TTFB, cert days, Lighthouse performance, last deploy, 404s | uptime, PSI (from the last snapshot), Hosting, GoatCounter |

`/admin/snapshot` runs every collector once a day and writes `snapshots/<YYYY-MM-DD>` to
Firestore (one document, a few KB: well inside 20,000 writes and 1 GiB). `/admin/kpis`
and the sparklines read the last 84 days of snapshots (84 reads; the free quota is 50,000
a day). `/admin/manual/substack` appends `{value, at}` to `manual/substack` for the
hand-entered subscriber count.

Rate limiting and validation follow the game's server: a per-IP token bucket, `days` in
{1, 7, 30, 90}, query names from a fixed list, `cache-control: no-store` on responses.

### 2.5 The csarko.sh page (`admin/public/csarko.sh/`)

Plain HTML, CSS and JS, the site's tokens, the ported chart primitives, a range row
(Today, 7, 30, 90) like the game's. Cards, in order:

1. **Visitors**: tiles for visits, pageviews, pages per visit, each with Δ vs the previous
   range; a column chart of visits per day with the previous range ghosted behind it.
2. **Where they come from**: a bar per referrer group, a folded table of raw referrers and
   campaigns.
3. **What they read**: top pages with visitors, pageviews and (if shipped) read-to-the-end
   rate; the 404 paths folded under it.
4. **Where they go next**: outbound, Play and Watch event counts; the funnel home →
   outbound as a percentage.
5. **Search**: clicks and impressions per day, CTR and position tiles, top queries and top
   pages folded; indexed n of m with the unindexed URLs listed.
6. **Reach**: YouTube subscribers and views (Δ since the last snapshot and over the range),
   per-film views; GitHub stars and 14-day traffic per repo; HN mentions; Substack
   subscribers with the entry form.
7. **Health**: the five checks of 1.4 with their last values.
8. **Audience** (folded): countries, sizes, browsers, systems.

### 2.6 Moving the Day Hike page

In `game-dayhike`:

- The admin Vite entry builds with `base: "/game-dayhike/"` (a second config or a mode),
  imports `/auth.js` from the shell as an external, and drops the `firebase` dependency.
- `server/src/adminAuth.ts` compares the bearer token against `ADMIN_TOKEN` (constant
  time) instead of verifying a Firebase ID token; `ADMIN_EMAILS` goes away;
  `DEFAULT_ALLOWED_ORIGINS` gains `https://admin.csarko.sh`. `/admin/kpis` is added.
- `deploy:client` uploads `dist-admin/` to `gs://fps-csarko-downloads/admin/latest/` (the
  bucket already holds its source maps) and, when `~/Projects/csarko.sh` is present, runs
  that repo's `admin/deploy.sh`.
- `firebase.json` 301s `/dayhike/admin/**` to `https://admin.csarko.sh/game-dayhike/`.
- `deploy:verify` checks the new URL answers 200 with a script and the old one 301s.

### 2.7 Deploying from this repo

`firebase.json` becomes a two-site config (`hosting: [{target: "site", public: "public"},
{target: "admin", public: "admin/public"}]`, targets applied in `.firebaserc`), and
`deploy.sh` passes `--only hosting:site` so a site deploy never touches the admin and
vice versa. `admin/deploy.sh` pulls `gs://fps-csarko-downloads/admin/latest/` into
`admin/public/game-dayhike/` (git-ignored), builds and pushes the API image when
`admin/api/` changed (`gcloud run deploy --source` keeps it to one command), deploys
`hosting:admin`, then verifies: `/` and `/csarko.sh/` return 200 with `noindex`, every
app's `/admin/kpis` returns 401 without a token, and `admin.csarko.sh/robots.txt`
disallows everything.

### 2.8 The admin pages are csarko.sh pages (standing rule, Cyrus 2026-10-12)

Everything under `admin/` is **styled like https://csarko.sh and held to the same
requirements, except SEO and search indexing**. That means: the site's theme tokens
(both blocks, copied at build time as the doc pages do), Inter and JetBrains Mono
self-hosted from the same hashed assets, the 1120px `.wrap` and nav bar shape, dark and
light by system setting, a layout that holds from 320px to 1440px, no em-dashes in copy,
no email address or phone number, every colour a token with 4.5:1 contrast in both themes,
a strict CSP with no third-party script (the only cross-origin requests are to the app
APIs), the same security headers, Lighthouse 100 on Accessibility and Best Practices with
Performance ≥ 95, and screenshots in both themes reviewed after any visual change. What
does **not** apply: `<meta name="robots">` is `noindex, nofollow`, `robots.txt` disallows
everything, there is no sitemap entry, no JSON-LD, no Open Graph card, no canonical, and
the Lighthouse SEO score is not a target. `check.py --admin` runs the applicable checks
over `admin/public/` and `admin/deploy.sh` refuses to publish if they fail. The rule is
also in `AGENTS.md`.

## Part 3: order of work

| Step | What | Needs from Cyrus | Value |
|---|---|---|---|
| **0. Events on the public site** *(done 2026-10-12)* | `data-goatcounter-click` on the outbound, nav, Play and Watch links; the `read-<slug>` script; campaign tags on the links he posts (`?ref=substack`, `?ref=linkedin`, GitHub README) are Cyrus's to add when he posts | nothing; the GoatCounter dashboard shows events at once | the behaviour metrics start accumulating now, before the dashboard exists |
| 1. Infra | Terraform for the admin site, DNS, Cloud Run, Firestore, Scheduler, secrets | a GoatCounter API token (Settings → API, read permission), a fine-grained GitHub token (public repos, traffic read); YouTube and PSI keys can be made with `gcloud` | the host exists, the token gate works |
| 2. Shell and csarko.sh page | `auth.js`, `charts.js`, index, the eight cards, `?preview` sample data | review of the screenshots | the portfolio dashboard |
| 3. The csarko.sh API | collectors, `/admin/kpis`, snapshot job, manual entry | the credentials above, into Secret Manager | live numbers, history begins |
| 4. Move Day Hike | the four changes of 2.6, the redirect | approve the change in `game-dayhike` | one place for both apps |
| 5. Phase 2 | YouTube Analytics (watch time), Bing Webmaster Tools (free, has an API, a second search engine's view), Lighthouse history chart | a one-time YouTube consent | deeper exposure data |

## Costs

| Item | Free allowance | Expected |
|---|---|---|
| Firebase Hosting (admin site) | 10 GB stored, 10 GB/month transferred, per project | KB |
| Cloud Run `csarko-admin` | 2M requests, 180k vCPU-s a month; scales to zero | a few hundred requests a day |
| Firestore | 1 GiB, 50k reads, 20k writes a day | ~100 reads and 1 write a day |
| Cloud Scheduler | 3 jobs per billing account | 1 job |
| Secret Manager | 6 active versions, 10k accesses a month | 5 secrets, accessed on cold start only |
| Artifact Registry | 0.5 GB | one small image |
| GoatCounter hosted | free for personal, non-commercial use | $0 |
| Search Console, YouTube Data, PageSpeed Insights, GitHub, HN APIs | free within quotas far above this use | $0 |

Expected monthly cost: **$0**. The `csarko-sh` project already has billing (Main
Billing), which Cloud Run requires even for free-tier use; the budget alert at $5
catches a surprise. If GoatCounter's hosted service ever changes terms, `count.js` is
already self-hosted, so pointing `site.json` at a self-hosted instance is the only change.

## Privacy

No cookies anywhere: GoatCounter stores nothing in the browser; the admin token lives in
localStorage on Cyrus's own machines; the Scheduler and APIs are server-to-server. The public site's CSP, script budget and third-party rules are
unchanged by anything except the optional `read-<slug>` script, which follows the
existing procedure.

## Decisions taken on review (Cyrus, 2026-10-12)

1. Access is an **admin token**, not Google sign-in (2.1).
2. GitHub: **public repos only**, `game-dayhike` and `electron-gamepatch`; never a private repo.
3. The `read-<slug>` script ships (Part 1.2), through `site-quality`'s script procedure.
4. Substack subscribers are entered by hand.
5. The admin pages follow csarko.sh's style and quality bar except SEO and indexing (2.8).

## Research this design rests on

Gathered 2026-10-12: GoatCounter's OpenAPI spec (`/api.json`) and help pages on the API,
sessions and events; a live CORS preflight against `csarko.goatcounter.com`
(`access-control-allow-origin: *`, `x-rate-limit-limit: 4`); Google's Search Console API
limits and `searchAnalytics.query` reference; Firebase Hosting usage and quotas, Firestore
quotas, scheduled functions and Cloud Scheduler pricing (3 free jobs); the YouTube Data API
quota table and channel resource; the YouTube Analytics `reports.query` reference; GitHub's
repository traffic API; Google's note that the JavaScript implicit flow is discouraged in
favour of Firebase/GIS; and the Day Hike admin and telemetry designs in
`game-dayhike/docs/admin/2026-10-12-admin-page-design.md` and
`docs/telemetry/2026-10-12-telemetry-design.md`.
