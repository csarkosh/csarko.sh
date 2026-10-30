# admin.csarko.sh: the shell and the csarko.sh dashboard

The private page behind `https://admin.csarko.sh`: an index with one card per app, and
`/csarko.sh/` with the portfolio site's eight cards (visitors, where they come from, what
they read, where they go next, search, reach, health, audience). Day Hike's page at
`/game-dayhike/` is built in `game-dayhike` and pulled in at deploy. Design:
`docs/superpowers/specs/2026-10-12-admin-dashboard-design.md` (approved 2026-10-12);
the data shapes: [`CONTRACT.md`](./CONTRACT.md); the API that serves them: [`api/`](./api/).

## The rule (spec 2.8)

Everything under `admin/` is a csarko.sh page, held to the site's bar except SEO and
indexing: the site's theme tokens (both blocks, copied from `public/index.html` at build
time, exactly as `docs_lib.mjs`'s `themeBlocks()` copies them for a doc page), Inter and
JetBrains Mono self-hosted from the same hashed files, the 1120px `.wrap` and the nav bar,
dark and light by the system setting with no toggle, a layout that holds from 320px to
1440px, every colour a token (or a `color-mix()` of tokens) with 4.5:1 text contrast in
both themes, no em-dashes, no email address or phone number, no third-party script, no
cookies, Lighthouse 100 on Accessibility and Best Practices with Performance 95 or more,
and screenshots in both themes looked at after any visual change. What does not apply:
`<meta name="robots">` is `noindex, nofollow`, `robots.txt` disallows everything, and
there is no sitemap, JSON-LD, Open Graph card or canonical.

## Layout

| Path | What |
|---|---|
| `build.mjs` | Fills the generated blocks (below), bundles the Firebase Auth SDK when the tooling is installed, and writes `auth-config.json`. Node 22, deterministic; the one dependency is the bundle step (`package.json`). Run it after `generate-assets.sh` changes a token or a font. |
| `package.json`, `package-lock.json` | Build tooling only, private: `@firebase/app`, `@firebase/auth` and `esbuild` as devDependencies for the vendor bundle (the two Firebase packages, not the whole `firebase` SDK, whose Firestore pulls in a vulnerable `@grpc/grpc-js`). `npm install` here once; `node_modules/` is git-ignored. The pages themselves have no dependencies. |
| `vendor/firebase-auth.js` | The bundle's entry: the eight Firebase exports `auth.js` needs (`initializeApp`, `getAuth`, `GoogleAuthProvider`, `onAuthStateChanged`, `signInWithPopup`, `signOut`, `browserLocalPersistence`, `setPersistence`), tree-shaken from `firebase/app` and `firebase/auth`. |
| `preview.sh` | Build, serve `public/` on `http://localhost:8788` and open every page with sample data; `--shots` for screenshots, `--lighthouse` for the scores, `--page <name>` for one page, `--stop`. |
| `public/index.html` | The index. Static shell; `app.js` fills one card per app from `apps.json` and each app's `/admin/kpis`. |
| `public/csarko.sh/index.html`, `page.js` | The csarko.sh dashboard: range row (Today, 7, 30, 90 days), then the eight cards, each loading its own query and showing its own error line. |
| `public/finance/index.html`, `page.js` | The Finance dashboard (spec `docs/superpowers/specs/2026-10-29-finance-admin-page-design.md`, amended 2026-10-30: no spend goal, the page judges nothing): range row (This month, Last month, 90 days, 13 months, sent as `range=month\|last\|90\|13m` in place of `days`), then ten cards: the month's six tiles, three across (month to date, Donations (the month's net through Stripe, with gross, fees and count under it; "Not configured (STRIPE_KEY)" until the key exists), Net (`total.net`, the spend after donations, against the month before's net), forecast, last month, idle run-rate) with a row per provider in the fixed order AWS, Google Cloud, GitHub, Modal, fal, Claude Code (GitHub's gross if private, Modal's gross before its included credits, fal's balance left, Claude Code's value at API list price); Donations (the `income` query, 2026-10-30): gross, fees, net, count and average for the range, the Stripe balance (available and pending) as a line, a 60-day columns chart of the net per day in `--income` (the accent: the site's own colour and `charts.js`'s mark for a lone series, 10.6:1 dark and 5.8:1 light on `--surface`; the twelve spend tones fill the hue wheel, so no thirteenth cleared the CVD gate beside all of them) with the day's count in the tooltip, and three folds, Recent donations (day, gross, net), Payouts (day, amount, status) and the months; amounts and days only, never who gave; spend by category as stacked columns per month (the `admin:palette` slots in `theme.css`, `--cat-1` to `--cat-10`, one per category in a fixed order, `--cat-10` the orchid that is Claude Code's own, `--cat-9` the neutral Other); spend by project (Films, Day Hike, csarko.sh and admin, Other; `--proj-1` to `--proj-4`, the palette's yellow, magenta, violet and the neutral); the films from the pipeline's own ledgers, each total as a bar against its $150 cap with a fold per film by model and provider; Claude Code (the `claude` query): the claude.ai subscription as a tile with its entry form (a number field and Save, `POST /finance/admin/manual/claude-subscription`, the tile reading Not entered until a fee exists), the month's value at API list price (the plan's value, not a bill), the messages and the top model's share, a 60-day columns chart of the daily value stacked by model (`--cat-1` to `--cat-5` as fixed tones per model, ids shortened to Fable 5.1, Opus 5.5 and so on), the `byModel` table folded, and a note naming `tools/claude-usage-sync.py` and its last run; the idle run-rate as the list of lines that bill while nothing runs, stopped lines struck through; the last 60 days stacked by the six providers (`--prov-1` to `--prov-6`, the fourth and fifth a violet and a magenta of their own, the sixth Claude Code's orchid, all validated with the dataviz skill `--pairs all` in both themes) with the 14-day median and flagged days; what the range's activity bought at what unit price (eight tiles; Modal's lists its apps, fal's its balance, Claude Code's the messages with the fee as its cost and the list value as its note, a missing quantity a dash); and the eight sources, Stripe among them. Served by `csarko-admin` under `/finance`. |
| `public/apps.json` | The tracked apps: `slug`, `name`, `home`, `api`, `page`. Adding an app is adding a line here (and its page and API). |
| `public/theme.css` | Tokens and fonts (generated blocks), then the site's base, `.wrap`, nav, card, tile, grid, table, button, badge and note primitives. |
| `public/auth.js` | Sign-in: `requireSession()`, `user()`, `fetchWithAuth()`, `signOut()`, on Firebase Auth (Google sign-in, project `csarko-sh`). The Day Hike bundle imports it as `/auth.js`, so its exports are a contract (`CONTRACT.md`, "Auth"); the old names `requireToken`, `clearToken` and `token` stay as aliases for one release. |
| `public/auth-config.json` | **Generated:** `{ apiKey, authDomain: "admin.csarko.sh", projectId: "csarko-sh" }`, the key from `ADMIN_FIREBASE_API_KEY` or `--api-key`. A Firebase web API key is public by design (it names the project; the allowlist and Firebase's authorized domains do the guarding), so the file is committed. `apiKey: null` means a build with no sign-in. |
| `public/vendor/firebase-auth.<hash>.js` | **Generated:** the Firebase Auth SDK, one minified ES module (about 113 KB, 34 KB over the wire), self-hosted because the CSP allows no third-party script. Committed, as the site commits its generated assets, so a checkout deploys as is; rebuilt by `build.mjs` when `node_modules` is present and the bundle is older than `package-lock.json`. |
| `public/charts.js` | Chart primitives, hand-written SVG and DOM: `el`, `tile`, `delta`, `columns`, `bars`, `sparkline`, `table`, `folded` (an accordion), `filteredList` (a chip-filtered list that glides), `hold` and `settle` (held, eased and remembered card heights), `status`, `errorLine`, `compact`, `ago`, `pct`, `shortDay`. |
| `public/motion.js` | Material 3 motion, every timing a token off `:root` (instant under reduced motion): `accordion` (a folded `<details>`; a click while it moves is taken once it settles), `glideList` (a list re-rendered by a chip: FLIP, ghosts, its height eased), `easeHeight`, `fadeIn`, `fadeOut`, `showMenu`, `hideMenu` (inert while it fades out), plus `tokens` and `parseDuration`. Design: `docs/superpowers/specs/2026-10-29-motion-design.md`. Day Hike's page mirrors its API in its own repo rather than importing it. Used by `charts.js` (every fold, `hold`/`settle`, `filteredList`), `auth.js` (the menu, the gate's fade through) and every host page's cards (the index, `csarko.sh/`, `ide-arkos/` and `finance/`). Tests: `node --test admin/test/*.test.mjs`; the pages' motion is checked in a browser by `check.py --admin`. |
| `public/data.js` | The source: each app's API through `fetchWithAuth`, or the sample under `?preview`. |
| `public/sample/` | Fixed sample data for `?preview`: `kpis.json` (keyed by app slug), `csarko.sh/<query>.json`, `ide-arkos/<query>.json` and `finance/<query>.json` (served as is for every range). Mirrors the examples in `CONTRACT.md`. |
| `public/assets/` | **Generated:** the hashed font files, copied from `public/assets/`. Committed, as the site commits its generated assets, so a checkout deploys as is. |
| `public/favicon.ico`, `favicon.svg` | **Generated:** the site's icons, copied. |
| `public/robots.txt` | `Disallow: /`. |
| `.gitignore` | `public/game-dayhike/`, the Day Hike bundle, pulled from `gs://fps-csarko-downloads/admin/latest/` by the deploy step; and `node_modules/`. |

### Generated blocks: never hand-edit

`build.mjs` owns the content between these markers; everything else in the file is hand-written.

| File | Block | From |
|---|---|---|
| `public/theme.css` | `/* generated:theme */` | the `:root { … }` and `@media (prefers-color-scheme: light) { :root { … } }` token blocks of `public/index.html` |
| `public/theme.css` | `/* generated:fonts */` | the `@font-face` rules of `public/index.html` (Inter, JetBrains Mono, and their metric-matched fallbacks), with root-relative URLs |
| `public/index.html`, `public/csarko.sh/index.html` | `<!-- generated:head -->` | the Inter preload with the current hash |
| same | `<!-- generated:nav -->` | one link per app in `apps.json`, `aria-current="page"` on the page's own |
| `public/assets/*.woff2`, `favicon.*` | | copied; stale font files are removed |
| `public/auth.js` | `// generated:vendor` | the hashed path of the vendor bundle, which `auth.js` imports lazily |
| `public/vendor/firebase-auth.<hash>.js` | | esbuild over `vendor/firebase-auth.js`, when `node_modules` is present and the bundle is missing, older than `package-lock.json` or the entry, or `--vendor` is given; stale hashed copies are removed. Without `node_modules` the committed bundle is used as it is. |
| `public/auth-config.json` | | from `--api-key <key>` or `ADMIN_FIREBASE_API_KEY`; with neither, an existing file is left alone (a local build does not blank it) |

`node admin/build.mjs --api <url>` (or `ADMIN_API_URL=<url>`) also rewrites the
csarko.sh entry's `api` in `apps.json`. The Cloud Run URL
(`https://csarko-admin-lwkslxdnnq-uw.a.run.app`) is committed there now; the override
exists for a redeploy that changes it.

## Preview

```sh
admin/preview.sh              # build, serve on :8788, open /?preview and /csarko.sh/?preview
admin/preview.sh --shots      # 1440px and 390px, dark and light, both pages → /tmp/csarko-sh-admin-preview/
admin/preview.sh --lighthouse # Performance, Accessibility, Best Practices per page and theme
admin/preview.sh --shots --page finance   # one page only (index, csarko-sh, ide-arkos, finance)
admin/preview.sh --stop
```

`?preview` renders the sample with no sign-in and never calls an API or loads the SDK; a
"Sample data" badge says so. Without it the page shows the sign-in gate, then reads the
live APIs (the APIs allow `http://localhost:8788` in CORS; Firebase Auth allows `localhost`
as an authorized domain by default, so the popup works locally too). Each theme is forced for screenshots and
Lighthouse with Chrome's `--blink-settings=preferredColorScheme=0|1`, as the site's
preview does; there is no `?theme` override, so the stylesheet stays exactly the site's
two token blocks with no duplicated values. Look at every screenshot in both themes
before calling a visual change done.

## How the pages behave

- **Sign-in.** Google sign-in through Firebase Auth on project `csarko-sh`, with
  `authDomain` `admin.csarko.sh` so the popup stays on our host. The session persists in
  `localStorage` (`browserLocalPersistence`, no cookie); every API request carries a fresh
  ID token as `Authorization: Bearer`, and the API checks it against its `ADMIN_EMAILS`
  allowlist. Nobody signed in shows the gate ("Sign in with Google") and nothing else; a 401
  from any API means the account is not on the list, and the gate returns with
  "<email> is not on the list." and a Sign out so another account can be tried. The page
  head shows the signed-in email and a Sign out. A build whose `auth-config.json` has no
  key says "This build has no sign-in" and points at `?preview`.
- **The SDK is self-hosted, the flow is not.** The bundle is served from our host, but the
  popup flow still loads Google's gapi loader (`https://apis.google.com/js/api.js`), embeds
  `/__/auth/iframe` from our host, and talks to `https://identitytoolkit.googleapis.com` and
  `https://securetoken.googleapis.com`. The CSP in `firebase.json` allows exactly that and
  nothing more.
- **Not configured.** A part the API answers `null` for, with a `notConfigured` hint,
  reads "Not configured (ENV NAME)" in `--faint`; a KPI tile shows a dash. An `errors`
  entry becomes the card's error line. See `CONTRACT.md`.
- **No pageviews.** lib-visits counts visits (one browser on one day), not pageviews; nothing on the page shows a
  pageview or a pages-per-visit figure.
- **Charts.** Columns per day with the previous range ghosted behind, horizontal bars for
  groups and events (the funnel on an ordinal ramp mixed from the accent, validated with
  the dataviz skill in both themes), sparklines on the KPI tiles, and a folded table under
  every chart so no value is reachable only by hover. Each column is keyboard-focusable
  with a title. The series colour is `--accent`, the ghost and chrome `--faint` and the
  border tokens, warnings `--warning`; no new colour values.
- **Loading.** The first render waits for every card so the page does not shift as cards
  fill (CLS 0); a range change updates each card in place with the old render held at
  half opacity.

## Deploying

Not from here: `admin/deploy.sh` and the two-site `firebase.json` are spec 2.7 (another
step). What the deploy must provide:

- Firebase Hosting target `admin` serving `admin/public` with `cleanUrls` and
  `trailingSlash: true` (the app links are `/csarko.sh/` and `/game-dayhike/`).
- The site's security headers, with a CSP whose `script-src` is `'self'` plus Google's
  gapi loader for the sign-in popup, `connect-src` the app APIs plus Identity Toolkit and
  Secure Token, `frame-src 'self'` for the auth iframe, and `default-src 'none'`,
  `base-uri 'none'`, `form-action 'none'`, `frame-ancestors 'none'` as the site has. The
  pages have no inline script and no inline event handler; `style-src 'unsafe-inline'`
  covers the inline `style` widths on the bars and tooltip. `form-action 'none'` is fine:
  the one form (the Substack count) is handled in script and never submits.
- Run `node admin/build.mjs` before `firebase deploy` so the tokens and fonts match the
  site that was just built, with `ADMIN_FIREBASE_API_KEY` set the first time (or whenever
  the key changes) so `auth-config.json` carries the project's web API key.
