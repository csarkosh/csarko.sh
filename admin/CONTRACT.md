# The admin API contract

What `admin/public/` (the shell and the csarko.sh dashboard) reads, and what each app's
API serves. The shell's index needs only `/admin/kpis` from every app; the csarko.sh page
needs the eight queries and one manual route from `csarko-admin` (`admin/api/`). The fixed
sample under `admin/public/sample/` mirrors the examples here one for one, so
`?preview` renders exactly these shapes.

Conventions, for every route:

- **Auth.** Google sign-in through Firebase Auth on project `csarko-sh`. Every request
  carries `Authorization: Bearer <Firebase ID token>` (`/auth.js` adds a fresh one); the
  API verifies the token's issuer `https://securetoken.google.com/csarko-sh`, audience
  `csarko-sh` and `email_verified`, then the email against its `ADMIN_EMAILS` allowlist,
  and answers 401 otherwise. The shell then shows its gate again with
  "<email> is not on the list." See "Auth: what `/auth.js` exports" below.
- **Times** are ISO 8601 UTC strings (`2026-10-12T13:05:00Z`). A `day` is `YYYY-MM-DD`.
  `visits.from`/`to` are UTC hour stamps because the ranges are hourly.
- **Numbers are numbers**, never strings. A value the source does not have is `null`,
  never 0 (0 is a measurement).
- **Not configured.** A part whose credential is missing is `null`, and the answer carries
  `notConfigured: { "<part>": "<ENV NAME>" }` naming the secret to add. The page renders
  "Not configured (ENV NAME)" in `--faint` for that part and nothing else changes. Which
  parts can be null is listed per query below.
- **Errors.** A part that is configured but failed is `null` with
  `errors: { "<part>": "<message>" }` when the rest of the answer is worth showing; the
  page shows each as the card's error line. A single-source query that fails answers a
  500 `{ "error": "..." }`, which the page shows as the card's error line too.
- **Pageviews are not available.** lib-visits counts a visit as one browser on one day (a stateless daily hash), so every `pageviews`
  field (`visits.current.pageviews`, `visits.previous.pageviews`, `perDay[].pageviews`,
  `pages.rows[].pageviews`) is always `null` and the page never shows one. The fields stay
  in the shape so a future collector that has them does not change it. The pre-cutover
  history is merged in by day, path and name for ranges that reach back before
  `VISITS_HISTORY_UNTIL`.
- **Units differ across the cutover.** Rows before 2026-10-15T15:00Z are GoatCounter's
  per-page-per-session counts (a browser once per page per session), the rows after it are
  lib-visits' visits (one browser on one UTC day). A range that spans the cutover adds the
  two, and the page should say so where it matters.
- **Bots and checks are out of every live number.** A page load (one `id`) is a bot when any
  of its beacons says so (Lighthouse's view says bot=false, its leave and vitals true), and
  the deploy and depth checks never count.
- `cache-control: no-store` on every answer; the API caches upstream calls for five
  minutes itself.
- CORS allows `https://admin.csarko.sh` and `http://localhost:8788` (the preview) with
  the `authorization` header.

## `GET <api>/admin/kpis` (every app)

The index card. Three or four KPIs, each against the previous period with a 12-week
trend, and the health dot.

```json
{
  "app": "csarko.sh",
  "at": "2026-10-12T13:05:00Z",
  "kpis": [
    { "key": "visits", "label": "Visits, 7 days", "value": 212, "prev": 180, "unit": "", "trend": [96, 104, 121, 118, 133, 150, 142, 161, 174, 169, 180, 212] },
    { "key": "search", "label": "Search clicks, 28 days", "value": 118, "prev": 96, "unit": "", "trend": [41, 48, 52, 60, 66, 71, 79, 84, 90, 96, 103, 118] },
    { "key": "impressions", "label": "Impressions, 28 days", "value": 3804, "prev": 3110, "unit": "", "trend": [1210, 1340, 1480, 1620, 1790, 1950, 2160, 2410, 2680, 2900, 3110, 3804] },
    { "key": "outbound", "label": "Outbound clicks, 7 days", "value": 34, "prev": 27, "unit": "", "trend": [11, 14, 12, 17, 19, 18, 22, 24, 21, 26, 27, 34] }
  ],
  "health": { "status": "warning", "note": "10 of 16 pages not yet indexed" }
}
```

- `kpis[].value` and `prev` may be `null` (not configured): the tile shows a dash and
  "Not configured (ENV)" from `notConfigured[key]` (`impressions` falls back to the
  `search` entry). `trend` is always 12 numbers; a week with no snapshot is 0.
- `search` and `impressions` cover the 28 days ending on Google's last finished day, as
  the `search` query's range does, not today.
- `unit` is `""` or a short suffix (`"%"`, `"ms"`); the page appends it to the value.
- `health.status` is `good`, `warning` or `critical`; `note` is one sentence.
- Optional `good: "down"` on a KPI marks one where a fall is the good direction.
- The Day Hike API serves the same shape: sessions, matches started, clean sessions %
  and lobbies open now (spec 1.5).

## `GET <api>/admin/query/<name>?days=1|7|30|90` (csarko.sh)

`days` defaults to 7; any other value is a 400. Query names are exactly these nine.
The sample files are `admin/public/sample/csarko.sh/<name>.json`, each for `days=7`
(the preview tiles that week for the other ranges).

### `visits`

```json
{
  "days": 7, "from": "2026-10-05T01:00:00Z", "to": "2026-10-12T01:00:00Z", "dayLabel": "utc",
  "current": { "visits": 212, "pageviews": null, "perDay": [ { "day": "2026-10-05", "visits": 24, "pageviews": null } ] },
  "previous": { "visits": 180, "pageviews": null, "perDay": [ { "day": "2026-09-28", "visits": 20, "pageviews": null } ] }
}
```

`perDay` has one entry per day, oldest first, the same length in both ranges. `dayLabel` is
always `"utc"`: the days are UTC days (the collector's daily visit hash rolls at UTC midnight,
so a day cannot be re-cut to another zone), and the card should say so. With `days=1` the
answer also carries `"label": "last 24 hours"`, since the range is the last 24 hours, not a
calendar day; the other ranges carry no `label`. `current` and `previous` are `null` with
`notConfigured.visits = "VISITS_DATASET"`.

### `pages`

```json
{ "rows": [ { "path": "/research/stylized-shader-looks", "title": "Stylized shader looks", "visitors": 31, "pageviews": null, "inSitemap": true, "engagedMedian": 48, "reached": 0.62 } ] }
```

Events are excluded. `visitors` is the distinct visits with a view of the path.
`inSitemap: false` marks a path that is not in `sitemap.xml` (a 404 candidate).
`engagedMedian` is the median, in seconds, over visits of each visit's longest engaged time
on the path, among page loads that sent a leave (a load's time is the most its leaves
reported, capped at 1800 s), `null` when no load did. `reached` (0 to 1) is the share of all
the path's views whose load reached the end of the page (a view with no leave did not), and
only on `/research/<slug>` pages, the ones with a read-end marker; `null` for every other
path. `inSitemap: null` on every row means the sitemap could not be read
(`notConfigured.sitemap`). `rows` is `null` with `notConfigured.visits`.

### `referrers`

```json
{
  "groups": [ { "group": "search", "visitors": 61 }, { "group": "ai", "visitors": 3 }, { "group": "social", "visitors": 44 }, { "group": "newsletter", "visitors": 21 }, { "group": "code", "visitors": 14 }, { "group": "video", "visitors": 9 }, { "group": "direct", "visitors": 58 }, { "group": "own", "visitors": 2 }, { "group": "spam", "visitors": 1 }, { "group": "other", "visitors": 5 } ],
  "rows": [ { "referrer": "google.com", "group": "search", "visitors": 54 } ],
  "campaigns": [ { "campaign": "substack-rock-on-steep-terrain", "visitors": 12 } ],
  "paths": [ { "from": "/", "to": "/research", "visitors": 18 } ]
}
```

`groups` always lists all ten, in this order and zero included: `search`, `ai` (assistants
such as chatgpt.com, perplexity.ai, claude.ai, gemini.google.com), `social`, `newsletter`,
`code`, `video`, `direct`, `own` (the site's own hosts: `*.csarko.sh` and the Firebase preview
channels, so a visit that began on one of our pages rather than an outside one, as when the
daily visit hash rolled at UTC midnight mid-visit), `spam` (known referrer spam, never a
visitor) and `other`. Each visit counts once, by its first view's referrer; `campaigns` are
the first view's too. `paths` are the site's own edges, the previous page to this one, every
view counted. All four are `null` with `notConfigured.visits`.

### `events`

```json
{ "rows": [ { "name": "out-linkedin", "kind": "out", "visitors": 14, "clicks": 17 }, { "name": "link-example.org", "kind": "out", "visitors": 1, "clicks": 1 } ], "outboundVisitors": 19, "outboundRate": 0.16 }
```

`visitors` is the distinct visits that fired the event, `clicks` how many times it fired
(for `read-<slug>`, the page loads that reached the end; the history's one count stands for
both). `kind` is the name's prefix: `out`, `play`, `watch`, `read`, `nav`, else `other`;
`link-<host>` (a click on a link to another host that the page did not name, the host
without `www.`) is kind `out`. `outboundVisitors` is the distinct visitors who clicked any `out-*` or `link-*` event; `outboundRate` is the distinct visitors who clicked any
`out-*` or `link-*` over the home page's visitors, so it never passes 1; `null` when nobody
reached the home page in the range. `rows` is `null` with `notConfigured.visits`.

### `journeys`

The 50 most recent visits in the range (fewer once stitched), newest first, each as its
journey. From lib-visits' rows only (GoatCounter's history holds no visit's sequence), so
nothing before the cutover. A page's leave, vitals and clicks belong to the view with the same
page-load id, whatever visit they name themselves.

```
{ started, source: { kind: 'direct'|'external'|'internal', host?, path?, campaign? },
  device: { browser, version, os, viewport: [w, h], tz, theme, touch, lang },
  steps: [{ path, title, at, left, secs, depth, read, nav, lcp, cls, inp }],
  exit: { kind: 'click', event, url, host } | { kind: 'left' },
  engaged, stitched, suspect }
```

- `source` is the first view's referrer: `host` with `external`, `path` (the site's own page it
  came from) with `internal`, `campaign` when the view carried one.
- `device` is the first view's: `browser` and `version` (a string) and `os` as the collector
  names them, `viewport` as `[width, height]` in CSS pixels (each `null` when unknown), `tz`
  the IANA zone, `theme` `dark` or `light`, `touch` a boolean, `lang` the browser's language.
- `steps` are the views in order. `at` is seconds from the first view; `left` is when the
  visitor left that page, in the same seconds: the next step's `at`, else the exit click's
  time, else `at + secs` when the page sent a leave, else `null`. `secs` and `depth` (0 to
  100) come from the page's leave beacon (`null` when none arrived). `read` is whether the
  reader reached the end, only on `/research/<slug>` pages (the ones with a read-end marker)
  and `null` elsewhere. `nav` is the navigation type (`navigate`, `reload`, `back_forward`) or
  `null`. `lcp`, `cls`, `inp` come from the page's vitals beacon, `null` when none or when the
  metric was not measured (INP needs an interaction). A page loaded again within two seconds,
  or reloaded, is the same step with the larger `secs` and `depth`.
- `exit` is the last outbound click (`event` the link's event name or `null`, `url`, `host`
  without `www.`) when it came on or after the last view, else `{ "kind": "left" }`.
- `engaged` sums the steps' known `secs`, `null` with none.
- `stitched` counts the later visits joined onto this one: the daily visit hash rolls at UTC
  midnight, so a visit under way then arrives as two, and the second (from one of our own
  pages, the one the first ended on, on the same device, within 30 minutes of when the first
  left it) is appended to the first with its `at`/`left` moved by the real gap; the first
  then carries the second's exit and the sum of both engaged times. 0 for most.
- `suspect` is `true` for a visit that looks like automation: a UTC clock, no leave and no
  vitals from any page.

```json
{ "rows": [ { "started": "2026-10-15T14:05:12Z", "source": { "kind": "external", "host": "google.com" }, "device": { "browser": "Chrome", "version": "155", "os": "macOS", "viewport": [1544, 1256], "tz": "America/New_York", "theme": "dark", "touch": false, "lang": "en-US" }, "steps": [ { "path": "/", "title": "Cyrus Sarkosh", "at": 0, "left": 41, "secs": 41, "depth": 70, "read": null, "nav": "navigate", "lcp": 216, "cls": 0, "inp": null } ], "exit": { "kind": "click", "event": "out-github", "url": "https://github.com/csarkosh", "host": "github.com" }, "engaged": 41, "stitched": 0, "suspect": false } ] }
```

A visit's steps are capped at 40. Stitching only sees the visits returned (the range's 50
newest), so a visit whose first half falls before the range, or past the 50, shows as an
unstitched journey from "This site". `suspect` is a UTC clock with no engaged second on any
page, the mark of a headless browser.

### `audience`

```json
{ "countries": [ { "name": "US", "visitors": 121 } ], "sizes": [], "browsers": [], "systems": [], "languages": [], "themes": [], "viewports": [], "touch": [], "timezones": [] }
```

Nine lists of `{ name, visitors }`, most visited first. `themes` is the visitor's colour scheme, `viewports` is bucketed as `under 400`, `400 to 799`, `800 to 1199` and `1200 and up`, `touch` is `touch` or `pointer`, and `timezones` are IANA names. Each is `null` with
`notConfigured.visits`.

### `search`

```json
{
  "lag": "Search Console runs 2 to 3 days behind",
  "from": "2026-10-03",
  "to": "2026-10-09",
  "perDay": [ { "day": "2026-10-03", "clicks": 3, "impressions": 112, "ctr": 0.027, "position": 19.2 } ],
  "totals": { "clicks": 31, "impressions": 949, "ctr": 0.033, "position": 18.4 },
  "previous": { "clicks": 24, "impressions": 812 },
  "queries": [ { "query": "babylon material plugin", "clicks": 6, "impressions": 41, "ctr": 0.146, "position": 4.2 } ],
  "pages": [ { "page": "https://csarko.sh/", "clicks": 9, "impressions": 210 } ],
  "indexed": { "indexed": 6, "total": 16, "missing": [ "https://csarko.sh/research/ai-short-film-generation" ] },
  "sitemap": { "lastDownloaded": "2026-10-10T07:12:00Z", "errors": 0, "warnings": 0 }
}
```

The range is `days` whole UTC days ending on `to`, the last day Google has finished
counting (the day before Search Console's first incomplete day, usually two or three days
back), not today; `previous` is the equal range before `from`. So `days=1` is that one
finished day. `ctr` is a ratio in [0, 1]. `position` is `null` on a day, or in `totals`, with no
impressions. Everything but `lag` is `null` with `notConfigured.search = "GSC_SA_KEY"`;
`indexed` alone can be `null` with `notConfigured.indexed` or `.sitemap`, and `sitemap`
with `notConfigured.sitemapState`. `sitemap.lastDownloaded` is `null` until Google has
fetched the feed.

### `reach`

```json
{
  "youtube": { "subscribers": 41, "views": 2184, "videos": 1, "videosList": [ { "id": "dQw4w9WgXcQ", "title": "Who Is Standing in My Hallway", "views": 2184, "likes": 37 } ], "prev": { "subscribers": 38, "views": 2051 } },
  "github": [ { "repo": "csarkosh/game-dayhike", "stars": 12, "forks": 1, "watchers": 12, "traffic": { "views": 184, "uniques": 61, "clones": 7, "referrers": [ { "referrer": "csarko.sh", "count": 44, "uniques": 19 } ] } } ],
  "hn": { "mentions": 1, "items": [ { "title": "Rock on steep terrain: shape it, cover it, or skin it", "url": "https://news.ycombinator.com/item?id=45000001", "points": 6, "at": "2026-10-09T15:42:00Z", "kind": "story" } ] },
  "substack": { "series": [ { "at": "2026-10-05T10:00:00Z", "value": 47 } ] }
}
```

- `youtube` is `null` with `notConfigured.youtube = "YOUTUBE_KEY"`; `youtube.prev` is
  the snapshot a week back, `null` until there is one.
- `github` lists every public, non-fork repository of the account (`GITHUB_OWNER`,
  found by listing it, so a private one can never appear); it is `null` with
  `notConfigured.github = "GITHUB_OWNER"`. Stars come without a token;
  `traffic` is `null` on every repo with `notConfigured.githubTraffic = "GITHUB_TOKEN"`
  while the stars are still present. Traffic is GitHub's last 14 days.
- `hn` needs no credential; `items[].kind` is `story` or `comment`.
- `substack.series` is the hand-entered subscriber count, oldest first, `[]` until the
  first entry; never `null`.

### `health`

```json
{
  "up": true, "status": 200, "ttfbMs": 212, "certDaysLeft": 61,
  "lighthousePerformance": 99, "lighthouseAt": "2026-10-12T10:00:00Z",
  "lastDeployAt": "2026-10-11T22:14:00Z",
  "notFound": [ { "path": "/projects", "visitors": 4 } ],
  "sitemapFetchedAt": "2026-10-10T07:12:00Z",
  "indexed": { "indexed": 6, "total": 16 },
  "overall": { "status": "warning", "note": "10 of 16 pages not yet indexed" }
}
```

`days` is ignored: 404s are the last 7 days. `status`, `ttfbMs` and `certDaysLeft` are
`null` when the check could not run (`up` is then `false` or `null`).
`lighthousePerformance`/`lighthouseAt` are `null` with `notConfigured.lighthouse =
"PSI_KEY"` or before the first snapshot; `lastDeployAt` with `notConfigured.hosting`;
`notFound` with `notConfigured.visits` or `.sitemap`; `indexed` with
`notConfigured.indexed`; `sitemapFetchedAt` with `notConfigured.sitemapState`.
`overall` is always present (an unknown check does not degrade the status; the note
says what is unknown).

## `POST <api>/admin/manual/substack` (csarko.sh)

Body `{ "value": 47 }` (a non-negative integer). Answer `{ "ok": true, "at": "2026-10-12T13:05:00Z" }`.
Appends `{ at, value }` to the `substack` series that `reach` returns; the page then
reloads the Reach card. `substack` is the only key.

## Arkos IDE: `GET <api>/arkos/admin/kpis` and `/arkos/admin/query/<name>?days=1|7|30|90&who=users|me|all`

The csarko-admin service serves Arkos under the prefix `/arkos`, so `apps.json` names
`<service>/arkos` as its `api` and the shell's two routes hold. Same auth, CORS, rate limit,
cache and conventions as the csarko.sh routes. Every query reads `csarko_visits._AllLogs`
rows with `json_payload.app = 'arkos'`, of three kinds told apart by `json_payload.k`:
`check` (one per Mac per day, no consent), `session` (opt-in usage reports) and `crash`.
Design: `docs/superpowers/specs/2026-10-17-arkos-admin-dashboard-design.md`. Ranges:
`installs` and `kpis` count whole UTC days ending today (the `rd` count needs whole days), so
`installs?days=1` is today so far against yesterday; `journey`, `sessions` and `crashes` use
the csarko.sh rolling window (the last `days`×24 hours ending at the next hour), so their
`days=1` is the last 24 hours. A KPI's sessions and the journey's can therefore differ by a
partial day. Every query answers `null` parts with `notConfigured.visits = "VISITS_DATASET"`
when the dataset is not set. Sample files: `admin/public/sample/ide-arkos/<name>.json`
(`days=7`), and `sample/kpis.json` under `"ide-arkos"`.

**Whose rows** *(Cyrus, 2026-10-17: he dogfoods Arkos, and his use is kept apart from users')*:
every query takes `who`, `users` (the default: everyone but Cyrus), `me` (his own Macs) or `all`,
and echoes it as `who`; anything else is `400` `"who must be users, me or all"`. A row is his
when its `ch` is `dogfood` (a release on a Mac holding `~/.config/arkos/dogfood`) or the
collector marked it `s.own` (sent from one of its `--ignore-ips` addresses, lib-visits v0.4.0).
`kpis`, the index card, counts users only. The sample files ignore `who`.

### `kpis`

The index card, the shape of every app's: `app: "ide-arkos"`, four KPIs, each `value`,
`prev` (the 7 days before) and a 12-week `trend` computed from the rows (not snapshots):

| key | label | value |
|---|---|---|
| `active` | Active Macs, 7 days | distinct Macs that checked in, counted by `rd` (below) |
| `new` | New installs, 7 days | checks with `rd = -1` |
| `sessions` | Sessions, 7 days | session reports received |
| `crashfree` | Crash-free sessions, 7 days | `unit: "%"`, sessions whose `end` is not `lost`, of all, 0 to 100 with one decimal; `null` with no sessions |

`health`: `critical` when a crash report arrived in the last 24 hours for the newest
version seen (the highest version among the last 7 days' Arkos rows), `warning` when
crash-free sessions are under 98% over 7 days, else `good`; the note says which (`"No
crashes in 7 days"`, `"2 crashes on 0.5.1 in the last 24 hours"`, `"Crash-free sessions 97.9%
over 7 days, under 98%"`). `value` is the 7 days ending today and `prev` the 7 before; a week
with no sessions is 0 in the `crashfree` trend while `value` stays `null`.

**Distinct Macs from `rd`.** A Mac sends at most one check a day through the collector,
and `rd` is the days since its previous check (`-1` the first time). In a window of UTC
days `0..n-1`, a check on day `i` is that Mac's first in the window exactly when
`rd = -1` or `rd > i`; counting those rows counts distinct Macs, no id stored.

### `installs` (no consent)

```json
{
  "days": 7, "from": "2026-10-11", "to": "2026-10-17",
  "current": { "active": 41, "new": 6, "back": 3, "checks": 180,
    "perDay": [ { "day": "2026-10-11", "active": 26, "new": 1, "back": 0 } ] },
  "previous": { "active": 37, "new": 4, "back": 2, "checks": 160,
    "perDay": [ { "day": "2026-10-04", "active": 24, "new": 0, "back": 1 } ] },
  "rhythm": [ { "name": "new", "checks": 6 }, { "name": "1", "checks": 140 }, { "name": "2-6", "checks": 28 }, { "name": "7+", "checks": 6 } ],
  "versions": [ { "name": "0.5.1", "macs": 33 }, { "name": "0.5.0", "macs": 8 } ],
  "macos": [ { "name": "15", "macs": 30 }, { "name": "14", "macs": 11 } ],
  "arch": [ { "name": "arm64", "macs": 39 }, { "name": "x86_64", "macs": 2 } ]
}
```

`active` is distinct Macs over the range (the `rd` count); `perDay[].active` is that day's
checks (one per Mac). `new` is `rd = -1`, `back` is `rd >= 7` (back after a week or more).
`perDay` has one entry per UTC day, zeros included, oldest first, the same length in both
ranges. `rhythm` buckets the range's checks by `rd`: how often Macs come back.
`versions`, `macos` and `arch` count each distinct Mac once, by its first check in the range,
largest first.

### `journey` (opt-in session reports: the journey map)

The aggregate over the range's session reports, capped at the 5,000 newest (`capped: true`
when the cap was hit). Each report's `ev` becomes **steps** (the step table in the design
spec, section 3): a label, a `group` and an optional detail. Restored tabs in the launch's
first 5 seconds fold into the launch; consecutive identical steps collapse.

```json
{
  "days": 7, "sessions": 120, "firstSessions": 18, "previous": { "sessions": 98 }, "capped": false,
  "paths": {
    "columns": [
      [ { "id": "0:Launched", "label": "Launched", "group": "launch", "sessions": 120 } ],
      [ { "id": "1:Terminal tab", "label": "Terminal tab", "group": "tab", "sessions": 70 },
        { "id": "1:Claude resumed", "label": "Claude resumed", "group": "agent", "sessions": 22 },
        { "id": "1:Other", "label": "Other", "group": "other", "sessions": 20 },
        { "id": "1:Ended", "label": "Ended", "group": "end", "sessions": 8, "ends": { "quit": 6, "lost": 1, "unknown": 1 } } ]
    ],
    "links": [ { "from": "0:Launched", "to": "1:Terminal tab", "sessions": 70 } ],
    "first": { "columns": [], "links": [] }
  },
  "milestones": [
    { "key": "launch", "label": "Launched", "sessions": 120, "first": 18, "medianSecs": 0, "firstMedianSecs": 0 },
    { "key": "tab", "label": "Opened a tab", "sessions": 110, "first": 15, "medianSecs": 4, "firstMedianSecs": 21 },
    { "key": "agent", "label": "Started an agent", "sessions": 96, "first": 11, "medianSecs": 9, "firstMedianSecs": 64 },
    { "key": "waiting", "label": "An agent asked for input", "sessions": 80, "first": 8, "medianSecs": 140, "firstMedianSecs": 210 },
    { "key": "file", "label": "Opened a file", "sessions": 52, "first": 6, "medianSecs": 300, "firstMedianSecs": 420 },
    { "key": "panes", "label": "Worked in two panes", "sessions": 40, "first": 3, "medianSecs": 260, "firstMedianSecs": 600 },
    { "key": "browser", "label": "Used the browser pane", "sessions": 12, "first": 1, "medianSecs": 900, "firstMedianSecs": null }
  ],
  "next": [
    { "label": "Terminal tab", "group": "tab", "sessions": 104, "to": [ { "label": "Claude started", "group": "agent", "sessions": 61 }, { "label": "Ended", "group": "end", "sessions": 9 } ] }
  ],
  "features": {
    "opened": [ { "name": "terminal", "how": "key", "sessions": 60, "count": 140 } ],
    "palette": [ { "name": "split", "sessions": 31, "count": 58 } ],
    "md": [ { "name": "mermaid", "sessions": 12, "count": 12 } ],
    "views": [ { "name": "markdown", "mode": "rendered", "sessions": 40, "count": 96 } ],
    "settings": [ { "name": "theme.dark", "sessions": 4, "count": 5 } ],
    "help": [ { "name": "keybindings", "sessions": 6, "count": 7 } ],
    "agents": [ { "name": "claude", "how": "resume", "sessions": 70, "count": 160 } ]
  },
  "focus": [ { "name": "terminal", "secs": 310000, "sessions": 118 } ],
  "lengths": [ { "name": "<1m", "sessions": 8 }, { "name": "1-10m", "sessions": 20 }, { "name": "10-60m", "sessions": 41 }, { "name": "1-4h", "sessions": 39 }, { "name": "4h+", "sessions": 12 } ],
  "ends": { "quit": 100, "lost": 3, "unknown": 17 },
  "errorEvents": [ { "name": "session_lost", "sessions": 2, "count": 3 } ],
  "notices": [ { "name": "update_ready", "sessions": 30, "count": 30 } ],
  "dropped": 0, "rejected": 1,
  "rhythm": [ { "name": "first", "sessions": 18 }, { "name": "same day", "sessions": 60 }, { "name": "1", "sessions": 25 }, { "name": "2-6", "sessions": 12 }, { "name": "7+", "sessions": 5 } ],
  "cohorts": [ { "week": "2026-09-24", "weeks": [ 12, 9, 7 ] } ]
}
```

- Steps: a report with no launch (a window that reconnected, or usage reports turned on mid-run)
  starts with a `Continued` step (group `launch`), so column 0 can hold `Launched` and
  `Continued`; the `launch` milestone counts real launches only. `view` events in the launch's
  first 5 seconds (restored tabs showing their files) are dropped with the restores. Ids read
  with spaces: `Palette: new terminal`, `Error: session lost`.
- `errorEvents` is the `error` events by kind (named so to keep clear of the `errors` map of
  failed parts).
- `paths`: the first `PATH_DEPTH = 5` steps after the launch, so six columns (column 0 is
  the launch). Other and Ended are left out of a column where they have no sessions; Ended's
  `ends` always has all three keys. Each column keeps its 6 most common labels plus `Other` and `Ended` (a session
  with fewer steps ends there, `ends` counting its `end`); a session that ended is in no later
  column. `links` join consecutive columns by node `id` (`<column>:<label>`). `first` is the
  same over first sessions (`rd = -1`) alone.
- `milestones` in this order: the sessions (and first sessions) reaching each at any time,
  and the median seconds from the start to the first time (`null` when none did). `panes` is a
  `palette` `split`, or a second `pane_open` that is not a restore while the first is open.
- `next`: the 8 most common labels (by sessions that had them), each with its 5 most common
  next steps (the label after it in the same session, `Ended` at the end), counting sessions.
- `features`: sessions that used each and how many times, largest first. `opened` is
  `pane_open` by `kind` and `how` (restores left out); `agents` is `agent_launch`.
- `focus`: the reports' `focus` summed per surface; `sessions` is how many had any.
- `rhythm`: by the session's `rd` (days since the previous session from that copy; `0` is
  "same day"). `cohorts`: by `iw` (the install week: days since 1970 rounded down to a
  multiple of 7, so each starts on a Thursday, shown as that date) and weeks since it (the
  report's day, bucketed the same way, minus `iw`, over 7), the 8 newest install weeks oldest
  first, each zero-filled to the week under way; a week that ended before the range began was
  not measured and is `null`, sessions each,
  newest 8 cohorts.
- `null` parts and `notConfigured.visits` when the dataset is not set.

### `sessions` (the newest session reports in full)

```json
{ "rows": [ {
  "received": "2026-10-17T14:05:12Z", "ver": "0.5.1", "osv": 15, "arch": "arm64",
  "len": 5400, "end": "quit", "rd": 1, "iw": "2026-10-08",
  "focus": { "terminal": 3100, "viewer": 900 },
  "steps": [ { "t": 0, "label": "Launched", "group": "launch", "detail": "normal, 3 tabs restored" },
             { "t": 12, "label": "Claude resumed", "group": "agent", "detail": null } ],
  "dropped": 0, "rejected": 0
} ] }
```

The 50 newest in the range, newest first. `received` is the row's time (the report is sent
after the run ends, so the run started about `len` seconds before). `steps` as in `journey`,
consecutive duplicates kept with a count in `detail` (`"x3"`).

### `crashes`

```json
{
  "total": 4, "previous": 2, "sessions": 120, "lost": 3,
  "byVersion": [ { "ver": "0.5.1", "crashes": 2, "sessions": 80, "lost": 1 } ],
  "groups": [ { "key": "other:b5bb9d80", "pk": "other", "mh": "b5bb9d8014a0…", "file": "/src/crates/arkos/src/md_view.rs", "line": 812,
    "versions": ["0.5.1"], "count": 2, "first": "2026-10-15T10:00:00Z", "last": "2026-10-17T09:12:00Z", "up": { "<10m": 2 },
    "frames": [ [0, 1843200] ], "image": ["arkos", "6c3f0e2a…", 48234496], "commit": "4f2a9c1" } ]
}
```

`groups` by `pk` (and `mh` for `other`), largest first, with the newest report's frames,
image and commit so the offsets can be symbolicated (`atos`). `lost` is session reports
whose `end` is `lost` (crashes not reported, force quits included). `byVersion` joins
crash reports and sessions by `ver`.

## Auth: what `/auth.js` exports

The shell's `public/auth.js` is the one auth surface on the admin host; every app page
imports it as `/auth.js` (the Day Hike bundle included), so these names are a contract.

```js
export function requireSession(root, onReady)
// Renders the gate into `root` while nobody is signed in: the page's own children (its
// h1 included) are hidden behind it, as before; the gate is a heading, one sentence, a
// "Sign in with Google" button and a note line for errors such as "<email> is not on the
// list." Calls onReady({ email }) once someone is signed in, again after a re-sign-in, and
// re-renders the gate on sign-out or on the window event 'admin:unauthorized' (with a
// "Sign out" so another account can be tried). A build whose auth-config.json has no
// apiKey shows the gate with the button disabled and "This build has no sign-in. Add
// ?preview to the address to see the page with sample data."

export function user()
// { email, name } | null: the signed-in account; `name` is the Google account's display
// name, or null.

export async function fetchWithAuth(url, init)
// fetch() with `Authorization: Bearer <fresh ID token from getIdToken()>`, credentials
// 'omit', mode 'cors'. On 401 it dispatches 'admin:unauthorized' on window with
// { detail: { email, url } } and still returns the Response.

export async function signOut()
// Firebase signOut; the gate returns through the auth state change, and the nav's account
// menu is cleared.

export function accountMenu(host, { account, preview })
// The nav's account, rendered into `host` (the nav's `<div class="account" id="account">`
// that every page's chrome carries): a round button (aria-expanded, aria-controls), the
// account's initials on the accent when someone is signed in and a profile mark otherwise,
// that toggles a menu with the Live or Sample badge, the name, the email and a Sign out
// button. A page calls it from onReady with the account, or once with { preview: true }
// under ?preview, where the menu says nobody is signed in and has no Sign out. Closes on
// Escape, on a click elsewhere, and on Sign out.
```

Persistence is `browserLocalPersistence` (localStorage, no cookie); the provider is
`GoogleAuthProvider` with `prompt: select_account`. The config is read once from
`/auth-config.json` (`{ apiKey, authDomain: "admin.csarko.sh", projectId: "csarko-sh" }`),
and the SDK is the self-hosted bundle `/vendor/firebase-auth.<hash>.js`, imported only when
a page asks for a session (never under `?preview`).

For one release the old names stay as aliases, so a Day Hike bundle built against the
token gate still loads: `requireToken` is `requireSession`, `clearToken` is `signOut`, and
`token()` returns `null` (the ID token is fetched inside `fetchWithAuth`). `setToken` is
gone.

## Shapes the shell itself serves

`admin/public/apps.json`, one entry per tracked app (spec 2.3):

```json
[
  { "slug": "csarko.sh", "name": "csarko.sh", "home": "https://csarko.sh", "api": "https://csarko-admin-lwkslxdnnq-uw.a.run.app", "page": "/csarko.sh/" },
  { "slug": "game-dayhike", "name": "Day Hike", "home": "https://games.csarko.sh/dayhike", "api": "https://fps-telemetry-5pogqa5sqq-uw.a.run.app", "page": "/game-dayhike/" }
]
```

Arkos IDE's entry is `{ "slug": "ide-arkos", "name": "Arkos IDE", "home": "https://apps.csarko.sh/ide-arkos", "api": "<csarko-admin>/arkos", "page": "/ide-arkos/" }`.

`page` is root-relative with a trailing slash (the admin site serves with
`trailingSlash: true` and clean URLs). `api` has no trailing slash. The sample index data
is `admin/public/sample/kpis.json`, keyed by `slug`.
