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
  `visits.from`/`to` are UTC hour stamps because GoatCounter ranges are hourly.
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
- **Pageviews are not available.** GoatCounter counts visits only, so every `pageviews`
  field (`visits.current.pageviews`, `visits.previous.pageviews`, `perDay[].pageviews`,
  `pages.rows[].pageviews`) is always `null` and the page never shows one. The fields stay
  in the shape so a future collector that has them does not change it.
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
- `unit` is `""` or a short suffix (`"%"`, `"ms"`); the page appends it to the value.
- `health.status` is `good`, `warning` or `critical`; `note` is one sentence.
- Optional `good: "down"` on a KPI marks one where a fall is the good direction.
- The Day Hike API serves the same shape: sessions, matches started, clean sessions %
  and lobbies open now (spec 1.5).

## `GET <api>/admin/query/<name>?days=1|7|30|90` (csarko.sh)

`days` defaults to 7; any other value is a 400. Query names are exactly these eight.
The sample files are `admin/public/sample/csarko.sh/<name>.json`, each for `days=7`
(the preview tiles that week for the other ranges).

### `visits`

```json
{
  "days": 7, "from": "2026-10-05T01:00:00Z", "to": "2026-10-12T01:00:00Z",
  "current": { "visits": 212, "pageviews": null, "perDay": [ { "day": "2026-10-05", "visits": 24, "pageviews": null } ] },
  "previous": { "visits": 180, "pageviews": null, "perDay": [ { "day": "2026-09-28", "visits": 20, "pageviews": null } ] }
}
```

`perDay` has one entry per day, oldest first, the same length in both ranges. `current`
and `previous` are `null` with `notConfigured.goatcounter = "GOATCOUNTER_TOKEN"`.

### `pages`

```json
{ "rows": [ { "path": "/research/stylized-shader-looks", "title": "Stylized shader looks", "visitors": 31, "pageviews": null, "inSitemap": true } ] }
```

Events are excluded. `inSitemap: false` marks a path that is not in `sitemap.xml`
(a 404 candidate); `inSitemap: null` on every row means the sitemap could not be read
(`notConfigured.sitemap`). `rows` is `null` with `notConfigured.goatcounter`.

### `referrers`

```json
{
  "groups": [ { "group": "search", "visitors": 61 }, { "group": "social", "visitors": 44 }, { "group": "newsletter", "visitors": 21 }, { "group": "code", "visitors": 14 }, { "group": "video", "visitors": 9 }, { "group": "direct", "visitors": 58 }, { "group": "other", "visitors": 5 } ],
  "rows": [ { "referrer": "google.com", "group": "search", "visitors": 54 } ],
  "campaigns": [ { "campaign": "substack-rock-on-steep-terrain", "visitors": 12 } ]
}
```

`groups` always lists all seven (search, social, newsletter, code, video, direct,
other), zero included. All three are `null` with `notConfigured.goatcounter`.

### `events`

```json
{ "rows": [ { "name": "out-linkedin", "kind": "out", "visitors": 14 } ], "outboundRate": 0.16 }
```

`kind` is the name's prefix: `out`, `play`, `watch`, `read`, `nav`, else `other`.
`outboundRate` is outbound clicks over home-page visitors, `null` when nobody reached
the home page in the range. `rows` is `null` with `notConfigured.goatcounter`.

### `audience`

```json
{ "countries": [ { "name": "United States", "visitors": 121 } ], "sizes": [], "browsers": [], "systems": [], "languages": [] }
```

Five lists of `{ name, visitors }`, most visited first. Each is `null` with
`notConfigured.goatcounter`.

### `search`

```json
{
  "lag": "Search Console runs 2 to 3 days behind",
  "perDay": [ { "day": "2026-10-03", "clicks": 3, "impressions": 112, "ctr": 0.027, "position": 19.2 } ],
  "totals": { "clicks": 31, "impressions": 949, "ctr": 0.033, "position": 18.4 },
  "previous": { "clicks": 24, "impressions": 812 },
  "queries": [ { "query": "babylon material plugin", "clicks": 6, "impressions": 41, "ctr": 0.146, "position": 4.2 } ],
  "pages": [ { "page": "https://csarko.sh/", "clicks": 9, "impressions": 210 } ],
  "indexed": { "indexed": 6, "total": 16, "missing": [ "https://csarko.sh/research/ai-short-film-generation" ] },
  "sitemap": { "lastDownloaded": "2026-10-10T07:12:00Z", "errors": 0, "warnings": 0 }
}
```

`ctr` is a ratio in [0, 1]. `position` is `null` on a day, or in `totals`, with no
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
`notFound` with `notConfigured.goatcounter` or `.sitemap`; `indexed` with
`notConfigured.indexed`; `sitemapFetchedAt` with `notConfigured.sitemapState`.
`overall` is always present (an unknown check does not degrade the status; the note
says what is unknown).

## `POST <api>/admin/manual/substack` (csarko.sh)

Body `{ "value": 47 }` (a non-negative integer). Answer `{ "ok": true, "at": "2026-10-12T13:05:00Z" }`.
Appends `{ at, value }` to the `substack` series that `reach` returns; the page then
reloads the Reach card. `substack` is the only key.

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

`page` is root-relative with a trailing slash (the admin site serves with
`trailingSlash: true` and clean URLs). `api` has no trailing slash. The sample index data
is `admin/public/sample/kpis.json`, keyed by `slug`.
