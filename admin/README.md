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
| `build.mjs` | Fills the generated blocks (below). Node 22, no dependencies, deterministic. Run it after `generate-assets.sh` changes a token or a font. |
| `preview.sh` | Build, serve `public/` on `http://localhost:8788` and open both pages with sample data; `--shots` for screenshots, `--lighthouse` for the scores, `--stop`. |
| `public/index.html` | The index. Static shell; `app.js` fills one card per app from `apps.json` and each app's `/admin/kpis`. |
| `public/csarko.sh/index.html`, `page.js` | The csarko.sh dashboard: range row (Today, 7, 30, 90 days), then the eight cards, each loading its own query and showing its own error line. |
| `public/apps.json` | The tracked apps: `slug`, `name`, `home`, `api`, `page`. Adding an app is adding a line here (and its page and API). |
| `public/theme.css` | Tokens and fonts (generated blocks), then the site's base, `.wrap`, nav, card, tile, grid, table, button, badge and note primitives. |
| `public/auth.js` | The token gate: `token()`, `setToken()`, `clearToken()`, `fetchWithAuth()`, `requireToken()`. The Day Hike bundle imports it as `/auth.js`, so its exports are a contract. |
| `public/charts.js` | Chart primitives, hand-written SVG and DOM: `el`, `tile`, `delta`, `columns`, `bars`, `sparkline`, `table`, `folded`, `status`, `errorLine`, `compact`, `ago`, `pct`, `shortDay`. |
| `public/data.js` | The source: each app's API through `fetchWithAuth`, or the sample under `?preview`. |
| `public/sample/` | Fixed sample data for `?preview`: `kpis.json` (keyed by app slug) and `csarko.sh/<query>.json`. Mirrors the examples in `CONTRACT.md`. |
| `public/assets/` | **Generated:** the hashed font files, copied from `public/assets/`. Committed, as the site commits its generated assets, so a checkout deploys as is. |
| `public/favicon.ico`, `favicon.svg` | **Generated:** the site's icons, copied. |
| `public/robots.txt` | `Disallow: /`. |
| `.gitignore` | `public/game-dayhike/`, the Day Hike bundle, pulled from `gs://fps-csarko-downloads/admin/latest/` by the deploy step. |

### Generated blocks: never hand-edit

`build.mjs` owns the content between these markers; everything else in the file is hand-written.

| File | Block | From |
|---|---|---|
| `public/theme.css` | `/* generated:theme */` | the `:root { … }` and `@media (prefers-color-scheme: light) { :root { … } }` token blocks of `public/index.html` |
| `public/theme.css` | `/* generated:fonts */` | the `@font-face` rules of `public/index.html` (Inter, JetBrains Mono, and their metric-matched fallbacks), with root-relative URLs |
| `public/index.html`, `public/csarko.sh/index.html` | `<!-- generated:head -->` | the Inter preload with the current hash |
| same | `<!-- generated:nav -->` | one link per app in `apps.json`, `aria-current="page"` on the page's own |
| `public/assets/*.woff2`, `favicon.*` | | copied; stale font files are removed |

`node admin/build.mjs --api <url>` (or `ADMIN_API_URL=<url>`) also rewrites the
csarko.sh entry's `api` in `apps.json`. The Cloud Run URL
(`https://csarko-admin-lwkslxdnnq-uw.a.run.app`) is committed there now; the override
exists for a redeploy that changes it.

## Preview

```sh
admin/preview.sh              # build, serve on :8788, open /?preview and /csarko.sh/?preview
admin/preview.sh --shots      # 1440px and 390px, dark and light, both pages → /tmp/csarko-sh-admin-preview/
admin/preview.sh --lighthouse # Performance, Accessibility, Best Practices per page and theme
admin/preview.sh --stop
```

`?preview` renders the sample with no token and never calls an API; a "Sample data" badge
says so. Without it the page shows the token gate, then reads the live APIs (the APIs
allow `http://localhost:8788` in CORS). Each theme is forced for screenshots and
Lighthouse with Chrome's `--blink-settings=preferredColorScheme=0|1`, as the site's
preview does; there is no `?theme` override, so the stylesheet stays exactly the site's
two token blocks with no duplicated values. Look at every screenshot in both themes
before calling a visual change done.

## How the pages behave

- **Token.** One admin token, pasted once per browser, kept in `localStorage` under
  `admin.token` (no cookie) and sent as `Authorization: Bearer` to every app's API. No
  token, or a 401 from any API, shows the gate ("Admin token", Continue) and nothing
  else; "Forget token" in the page head clears it.
- **Not configured.** A part the API answers `null` for, with a `notConfigured` hint,
  reads "Not configured (ENV NAME)" in `--faint`; a KPI tile shows a dash. An `errors`
  entry becomes the card's error line. See `CONTRACT.md`.
- **No pageviews.** GoatCounter counts visits only; nothing on the page shows a
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
- The site's security headers, with a CSP of `default-src 'none'; script-src 'self';
  connect-src 'self' https://csarko-admin-lwkslxdnnq-uw.a.run.app
  https://fps-telemetry-5pogqa5sqq-uw.a.run.app; img-src 'self'; font-src 'self';
  style-src 'self' 'unsafe-inline'; base-uri 'none'; form-action 'none';
  frame-ancestors 'none'`. The pages have no inline script and no inline event handler;
  `style-src 'unsafe-inline'` covers the inline `style` widths on the bars and tooltip.
  `form-action 'none'` is fine: both forms (the gate, the Substack count) are handled in
  script and never submit.
- Run `node admin/build.mjs` before `firebase deploy` so the tokens and fonts match the
  site that was just built.
