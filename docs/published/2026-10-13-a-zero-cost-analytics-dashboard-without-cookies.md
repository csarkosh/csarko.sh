---
description: Whether a personal site is gaining traction, with no cookies and no monthly bill: the metrics, free sources, one API per app, a daily ledger, and the gotchas.
published: 2026-10-13
categories: Distributed systems, Tooling
series: Analytics without cookies
---
# A zero-cost analytics dashboard without cookies

**Question:** A developer with a portfolio site and a game or two wants to know whether any of
it is gaining traction: how many people come, what they do while they are there, and whether
the work is being seen anywhere else. The usual answer is Google Analytics. It was ruled out
here on three counts: it sets cookies, so a visitor from Europe meets a consent banner before
the page; it is a third-party script from a host the site does not control, which the site's
Content Security Policy forbids; and it answers questions a portfolio does not have. What can
be measured without cookies, where does each number come from for free, and what shape does
the result need so that a second and third app join without a redesign?

**Short answer:** most of what "traction" means is available at $0 and without a cookie, from
sources that already hold the data: a privacy-first counter on the public pages, Google Search
Console for search, the YouTube Data and GitHub APIs for exposure elsewhere, and a lab
performance score for health. What is not available is anything that needs to recognise a
visitor across days; the honest answer is to say so and use proxies. The shape that scales is a
static admin page, one small API per app that holds the credentials and proxies the vendors, a
daily snapshot into a document store so the trend is yours rather than the vendor's, and one
Google sign-in with an allowlist, shared by every app. The worked example is csarko.sh, whose
dashboard first deployed to `admin.csarko.sh` on 2026-10-13; a browser game, Day Hike, joins
as the second app on the same contract.

## 1. What traction means for a portfolio

A portfolio is not a shop: a visitor who reads one page and leaves may be the best visitor it
ever gets. Three questions cover what its owner wants to know:

- **Visiting.** How many people arrive, which pages pull them in, where they come from, and
  whether this week is better than last week.
- **Doing.** Whether a visitor did the one thing the page exists for: opened LinkedIn or
  GitHub, clicked through to play a game, went to watch a film, or read a research note to
  the end.
- **Exposure.** Whether the work shows up where people look when the owner is not pushing it:
  search impressions and clicks, whether the pages are indexed at all, stars and traffic on
  the public repositories, views on the films, mentions on link-sharing sites.

A fourth, **health**, is not traction but belongs on the same page: a site that is down or
slow for a week explains a dip better than any theory. Every number is a trend, shown against
the previous period and over the last twelve weeks, never as a bare total.

Google Analytics fails this brief before its reports are opened: the identifier it stores means
a permission prompt in much of the world, a tag manager breaks a strict CSP and the no
third-party rule, and funnels and audiences are built for a business with a conversion to
optimise. The question here is smaller: is anyone there, and are they finding the work.

## 2. The metrics, and where each comes from

The public site already ran GoatCounter, a counter that stores nothing in the browser and no
IP address on its server. It counts a **visit** the first time a session (site, IP address and
User-Agent, held in memory for 8 hours and never written to disk) loads a path, and it
is free for personal, non-commercial use [1]. Its API serves the same numbers the dashboard
shows, behind a bearer token, at 4 requests a second [2]. The other sources are accounts the
owner already has.

### 2.1 Visiting

| Metric | Source | Notes |
|---|---|---|
| Visits per day; 7, 30 and 90 days against the period before | GoatCounter `stats/total` | the trend line of the whole page |
| Visits per page | GoatCounter `stats/hits` | which docs, the games list or the film page pull people in |
| Referrers, grouped | GoatCounter `stats/toprefs` and per-path referrers | a small classifier maps hosts to search, social, newsletter, code, video, direct, other |
| Campaigns | GoatCounter `stats/campaigns` | a `?ref=` on links the owner posts; the one attribution that works without cookies |
| Countries, screen sizes, browsers, systems, languages | GoatCounter `stats/<panel>` | screen sizes say whether the phone layout matters (it does) |
| Broken links people hit | GoatCounter paths not in the sitemap | the 404 page sends no canonical, so the path asked for is what is counted |

All of it is free. **Not available, by design:** new versus returning visitors, time on page,
bounce rate. All three need an identifier that outlives the 8-hour session, which is exactly
what the counter refuses to keep. The honest proxies are the share of **direct** visits
(someone typed the address or kept a bookmark), the newsletter platform's own repeat-reader
figures, and a read-to-the-end event on the long pages (section 4).

**A finding from building it:** GoatCounter's API reports **visits only**, never pageviews.
The dashboard was designed with a pageview tile and a pages-per-visit tile; both came back
empty on the first deploy, and the API help page says as much: it counts visits rather than
pageviews [2]. The contract keeps a `pageviews`
field in every shape, always `null`, so a future collector that has the figure does not change
the shape; the page never shows one.

### 2.2 Doing

Events, not sessions. The counter supports them already: an element with a
`data-goatcounter-click="<name>"` attribute counts a click, and a one-line call counts
anything else [2]. Events are stored as paths with a flag, so the same `stats/hits` call
returns them.

| Event | What it says | Where it is attached |
|---|---|---|
| `out-linkedin`, `out-github`, `out-substack`, `out-youtube` | the portfolio's conversions: a visitor went on to contact or follow | the hero and Contact links |
| `play-<game>` | a visitor went to play | the "Play in your browser" link on each game card |
| `watch-<film>` | a visitor went to watch | the "Watch on YouTube" link on each film card |
| `nav-research`, `nav-games`, `nav-film` | which section a page sends people to | the nav links, never on the current page |
| `read-<slug>` | the reader reached the end of a research note | one small script on doc pages, section 4 |

Every event name is a stable identifier, not copy, so renaming a button never breaks a series.

### 2.3 Exposure

| Source | Metrics | Notes |
|---|---|---|
| Google Search Console | impressions, clicks, CTR, average position by query, page and day; pages indexed against the sitemap; sitemap last fetched | 1,200 queries a minute per site and 2,000 URL inspections a day [3]; data lags 2 to 3 days and keeps 16 months |
| YouTube Data API | channel subscribers, total views, per-video views and likes | public data with an API key; `channels.list` and `videos.list` cost 1 unit each of 10,000 a day [4] |
| GitHub REST API | stars, forks, watchers; repository traffic: views, unique visitors, clones, top referrers and paths | stars need no token; traffic needs one, and GitHub keeps **only the last 14 days** [5] |
| Hacker News (Algolia search) | stories and comments mentioning the domain | no credential |
| Newsletter (Substack) | subscribers | no API; a hand-entered number, section 7 |

**The second finding:** GitHub's traffic window is 14 days, so anything older is gone unless
something wrote it down. The daily snapshot in section 3 exists for this first; the other
sources got the same treatment, because a trend you hold yourself survives a vendor changing
its terms.

### 2.4 Health

| Check | Source |
|---|---|
| Up, time to first byte, days left on the certificate | a `HEAD` request from the API |
| Lighthouse performance score, lab | PageSpeed Insights API, 25,000 requests a day; run once a day by the snapshot, never on page load |
| Pages indexed equals pages in the sitemap; sitemap fetched in the last 7 days | Search Console |
| 404 paths in the last 7 days | GoatCounter against the sitemap |
| Last deploy | the hosting platform's releases API |

Health is **good** when the site is up, performance is 95 or more, every sitemap URL is indexed
and no 404 path has more than a handful of hits; **warning** when one slips; **critical** when
the site is down or performance drops under 90. It is a dot beside each app on the index.

## 3. The architecture

```
browser (owner's machine)                 admin.csarko.sh (static hosting, noindex)
  signed in with Google      ───────────▶   /            index: one card per app, from apps.json
  (Firebase Auth, no cookie)                /auth.js     the sign-in gate, fetchWithAuth()
                                            /<app>/      that app's own page
                                                 │
              Authorization: Bearer <ID token>   │  one small API per app, scales to zero
                                                 ▼
          ┌────────────────────────────┐    ┌────────────────────────────┐
          │ app A API                  │    │ app B API                  │
          │ GET /admin/kpis            │    │ GET /admin/kpis            │
          │ GET /admin/query/<n>?days=N│    │ GET /admin/query/<n>?days=N│
          │ POST /admin/snapshot ◀──── scheduler, daily, OIDC           │
          └──────┬──────────────┬──────┘    └────────────────────────────┘
                 │              │
      vendor APIs with the      │  document store: snapshots/<YYYY-MM-DD>
      credentials held here     │  the ledger: 84 days read for the trends
      (counter, search, video,  ▼
       code, lab scores)
```

Four decisions make the shape, and each generalises.

**Why not call the vendors from the browser.** GoatCounter's API allows it; a live preflight
against the hosted service answered `Access-Control-Allow-Origin: *`. But an admin page is a
static bundle, and a credential in a static bundle is public; the search console key is a
service account and cannot go to a browser at all. One pattern for every source is also simpler than
two.

**Why one Google sign-in for every app.** The reader is the owner, with a Google account
already, so the gate is "Sign in with Google" through Firebase Auth, which is free at any
number of accounts and keeps its session in the browser's own storage rather than a cookie.
The sign-in is served from the admin host itself (Firebase Hosting answers `/__/auth/` there),
so no third-party cookie is involved either. What the browser then sends every API is the
signed ID token, and each API verifies it with nothing but Google's public keys: the issuer
and audience must be the admin project, the email must be verified, and the address must be
on the API's own allowlist, set in its environment; 401 otherwise, and no admin routes at all
while the list is empty. Adding a collaborator is one environment change, not a deploy; one
sign-in covers every app because every API trusts the same issuer.

**Why one API per app.** An app is tracked by adding one entry to `apps.json` and serving two
routes: `/admin/kpis` for the index card (three or four numbers, each with the previous period
and a 12-week trend, plus the health dot) and `/admin/query/<name>?days=N` for whatever its own
page wants. A new app therefore never touches another app's code, and a vendor change (say,
moving the counter to a self-hosted instance) changes one collector in one API. The game
already had an admin page with a telemetry API and dependency-free SVG charts [6]; it gains the
`kpis` route and trusts the shared sign-in, and its charts were ported to plain JavaScript for the shell.

**Why the ledger.** The snapshot route runs every collector once a day, called by a scheduler
with an OIDC token, and merges one document per UTC date into the store. GitHub keeps 14 days;
YouTube's counts are cumulative, so the change since last week exists only if last week was
written down; the counter is a third party. Reading 84 days of snapshots draws every sparkline
on the index. The per-app pages read live behind a five-minute cache in the API, so a page full
of cards never exceeds the counter's rate limit or the search console's quota.

## 4. Events on the public site

Only the last row of section 2.2 needed a script. The click events are an attribute on an
anchor, bound by the counter's own `count.js`, which the site already serves self-hosted under
a content hash: seven event names on the home page (four outbound, three nav), and two templates
in the page generator for the play and watch links on every game and film card.

The read-to-the-end event needed code because "read" had to be defined. A page's bottom is the
wrong marker on a research note that ends with a long reference list: a reader who finished the
prose and did not scroll through 146 citations has read the doc. The build therefore marks one
element per page `data-read-end`, the Sources heading when the doc has one, else the author box
at the foot. A 549-byte script, its comments stripped at build time, watches that element with
an `IntersectionObserver`, fires `goatcounter.count({ path: 'read-<slug>', event: true })` once
when it scrolls into view, and disconnects. Two details took longer than the observer.
`count.js` loads `async`, so on a short doc the end can be on screen before the counter exists;
the script waits for the `load` event, after which the counter is either there or blocked for
good. And it must never throw where the counter is blocked, or on a local preview, where
`count.js` drops the beacon anyway.

The site holds every page to a 10,000-byte script budget, and the deploy refuses to pass
without it. A doc page now carries 9,922 bytes of it; the next script displaces something,
which is the point of a budget.

## 5. What it costs

| Item | Free allowance | This use |
|---|---|---|
| Static hosting for the admin site (Firebase Hosting) | 10 GB stored, 10 GB a month transferred, per project [7] | a few hundred KB, one reader |
| The API (Cloud Run, CPU only during requests) | 2 million requests and 180,000 vCPU-seconds a month; scales to zero | a few hundred requests a day |
| Document store (Firestore) | 1 GiB, 50,000 reads and 20,000 writes a day [8] | about 100 reads and 1 write a day |
| Scheduler (Cloud Scheduler) | 3 jobs at no charge [9] | 1 job |
| Secret storage (Secret Manager) | 6 active secret versions, 10,000 accesses a month | 5 secrets, read at cold start |
| Container registry | 0.5 GB | one small image |
| GoatCounter, hosted | free for personal, non-commercial use [1] | $0 |
| Search Console, YouTube Data, PageSpeed Insights, GitHub and Hacker News APIs | free within quotas far above this use [3], [4], [5] | $0 |

Expected monthly cost: **$0**. Two caveats. A serverless runtime needs a billing account on
the project even for its free tier, so the project has one, and a budget alert at $5 a month
emails if anything changes; an alarm, not a cap. And five of the six free secret versions
are in use, so the second new credential would be the first line item.

## 6. Lessons and gotchas

In the order they were met on the first deploy:

- **Cloud Run refuses "CPU always allocated" under 512 MiB.** Request-based CPU (allocated
  only while a request is in flight) is what the free tier counts in anyway, and it accepts
  256 MiB.
- **Do not name a liveness route `/healthz`.** On Cloud Run, Google's frontend answers that
  exact path itself with its own 404, and the request never reaches the container. The route
  is `/health`.
- **A Firestore range filter on the document id wants a composite index; a cursor does not.**
  Snapshot ids are UTC dates, so string order is date order, and `orderBy(documentId())` with
  `startAt(from)` and `endAt(to)` reads the range with no index to create.
- **Cloud Run refuses a revision whose secret has no version.** On the very first apply the
  secrets exist but hold nothing, and the service cannot start. Seed every secret first; a
  placeholder value that the service treats as "not configured" lets it start, with every card
  reading "Not configured" for that part, before a single real credential exists.
- **Fine-grained GitHub tokens need Administration: read for traffic.** Read access to the
  repository's contents is not enough; the traffic endpoints sit under a different permission,
  and the error does not say so.
- **Search Console lags 2 to 3 days.** The card says so, and the previous period compares
  like with like by sliding both windows back.
- **GoatCounter's rate limit is 4 requests a second, and its CORS is open.** The API keeps
  itself to 3 and honours a 429's reset header once; the open CORS is why the browser could
  have called it directly, and section 3 is why it should not.
- **Hold the admin pages to the site's own quality bar, minus SEO.** The same theme tokens,
  self-hosted fonts, contrast rules, CSP and Lighthouse targets as the public pages, with
  `noindex`, a `robots.txt` that disallows everything, and no sitemap entry, canonical or
  share card. The checks were already written; a private page is still a page.

## 7. What is not built, and why

- **Cross-site visitor stitching**, from a visit on the portfolio to a session in the game. It
  needs an identifier that crosses origins and days, which is the thing the design refuses.
  The `play-<game>` click on one and the landing count on the other are the join, by eye.
- **Backlinks.** Search Console's Links report has no API, and third-party indexes cost money.
  The counter's referrers cover the links that are actually clicked, which is the part that
  matters.
- **LinkedIn and Reddit.** No usable free API for a personal profile; Reddit's requires a
  registered app and has tightened. Again, the referrers show when a mention sends traffic.
- **YouTube watch time and average view duration.** They are in the YouTube Analytics API,
  which needs the channel owner's OAuth consent and a stored refresh token, not an API key.
- **Substack.** No API. A small form writes a hand-entered subscriber count with a date into
  the store, so the trend still draws. It is the one number on the page typed by a person.

None of these would change the shape. Each is another collector in one app's API, or another
entry in `apps.json`.

## 8. Sources

1. GoatCounter, "Privacy policy," GoatCounter. Accessed: Oct. 13, 2026. [Online]. Available: https://www.goatcounter.com/help/privacy
2. GoatCounter, "API," GoatCounter. Accessed: Oct. 13, 2026. [Online]. Available: https://www.goatcounter.com/help/api
3. Google, "Usage limits," Google Search Console API. Accessed: Oct. 13, 2026. [Online]. Available: https://developers.google.com/webmaster-tools/limits
4. Google, "Quota calculator," YouTube Data API. Accessed: Oct. 13, 2026. [Online]. Available: https://developers.google.com/youtube/v3/determine_quota_cost
5. GitHub, "REST API endpoints for repository traffic," GitHub Docs. Accessed: Oct. 13, 2026. [Online]. Available: https://docs.github.com/en/rest/metrics/traffic
6. C. Sarkosh, "Day Hike admin page design," game-dayhike, GitHub repository, Oct. 12, 2026. Accessed: Oct. 13, 2026. [Online]. Available: https://github.com/csarkosh/game-dayhike/blob/main/docs/admin/2026-10-12-admin-page-design.md
7. Google, "Usage, quotas, and pricing," Firebase Hosting. Accessed: Oct. 13, 2026. [Online]. Available: https://firebase.google.com/docs/hosting/usage-quotas-pricing
8. Google, "Usage and limits," Cloud Firestore. Accessed: Oct. 13, 2026. [Online]. Available: https://firebase.google.com/docs/firestore/quotas
9. Google, "Schedule functions," Cloud Functions for Firebase. Accessed: Oct. 13, 2026. [Online]. Available: https://firebase.google.com/docs/functions/schedule-functions
