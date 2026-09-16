---
name: site-quality
description: >-
  Keep csarko.sh fast, findable, accessible, and locked down — and rebuild its
  generated assets deterministically. Covers SEO (tags, JSON-LD, preview card,
  favicons, robots/sitemap, Search Console), performance (responsive AVIF/WebP
  portrait, self-hosted hashed fonts, byte budgets, no third-party requests),
  accessibility (skip link, contrast, alt text), security headers (CSP and
  friends, Mozilla Observatory A+), the custom 404 page, and phone layout. Use
  whenever the user asks about SEO, Google, speed, Lighthouse, Core Web Vitals,
  security headers, accessibility, link previews, favicons, the 404 page, the
  mobile menu, analytics, or adding any script or third-party service; and when
  they ask how the site is doing, route visitor/traffic questions to GoatCounter
  (csarko.goatcounter.com) and Google search/indexing questions to Search
  Console (see AGENTS.md "Where to look") — and
  apply its checklist on EVERY change to public/, even when the user didn't
  mention quality. The preview and deploy skills run its checks automatically.
---

# Site quality for csarko.sh

Targets: **Lighthouse SEO / Accessibility / Best Practices 100 and Performance
≥ 95, Mozilla Observatory A+, no layout breakage from 320px to 1440px.** They
apply to the home page and to every generated page: `/games`, `/docs` and each doc.

## Scripts

```bash
S=.agents/skills/site-quality/scripts
$S/check.py                    # static: SEO, performance budgets, a11y, headers, 404, layout (~5s)
$S/check.py --live             # + deployed site: live headers, caching, 404, redirects, third-party JS
$S/check.py --lighthouse       # + Lighthouse on the home page and the newest doc, once per theme (SEO/A11y/Best Practices 100, Performance ≥ 95)
$S/check.py --observatory      # + Mozilla HTTP Observatory (must be A+)
$S/generate-assets.sh          # rebuild EVERYTHING generated (see below) — deterministic
node $S/build_docs.mjs         # just the pages built from Markdown: docs/published/*.md → public/docs/ and docs/games/*.md → public/games/, plus the sitemap and the home section (generate-assets.sh runs it)
```

Unit tests: `node --test .agents/skills/site-quality/tests/docs_lib.test.mjs` and
`python3 -m unittest discover -s .agents/skills/site-quality/tests`.

`preview.sh` runs `check.py` every time. `deploy.sh` refuses to publish if it
fails, then runs `--live`. After anything that could move scores (images,
fonts, CSS, scripts, headers), also run `--lighthouse --observatory` once live,
and report the numbers.

## Generated assets — never hand-edit

`generate-assets.sh` runs `build_assets.py`, then renders the icons and card.
Same inputs, same outputs (two builds produce identical hashes).

| Output | Source | Notes |
|---|---|---|
| `public/docs/<slug>.html`, `public/docs/index.html`, `<!-- generated:docs -->` in `index.html` | `docs/published/<YYYY-MM-DD>-<slug>.md` via `build_docs.mjs` (logic in `docs_lib.mjs`, `marked` vendored in `scripts/vendor/`) | Doc pages copy `index.html`'s theme token blocks and get fonts and analytics from `build_assets.py`, with root-relative paths. `check.py` rebuilds into a temp dir and fails if `public/` is stale. |
| `public/games/index.html` | `docs/games/<slug>.md` via the same `build_docs.mjs` run | The `/games` list, one entry per file: kicker from `status`, the H1 as the name, the body as the copy, `tags` as pills, and `play` / `repo` as outbound links. No per-game pages yet. Same theme, fonts, analytics and staleness rules as a doc page. |
| `public/sitemap.xml` | both `docs/published/` and `docs/games/` via `build_docs.mjs` | `/`, `/games`, `/docs` (no `lastmod` on any of the three), then each doc with its own. `/games` appears only while a game exists, `/docs` only while a doc does. |
| `public/assets/portrait-{240,360,480,720}.<hash>.{avif,webp,jpg}` | `assets/portrait-source.jpg` | Responsive LCP image. Desktop 2x loads a ~15 KB AVIF instead of a 100 KB JPEG. |
| `public/assets/<font>.<hash>.woff2` | `assets/fonts/*.woff2` | Inter + JetBrains Mono variable, latin subset. License: `public/licenses/fonts-OFL.txt`. |
| `public/portrait.jpg` | same | Stable URL for JSON-LD `Person.image`. |
| `<!-- generated:head -->`, `/* generated:fonts */`, `<!-- generated:portrait -->` blocks in `public/*.html` | the above | `index.html` gets relative paths (the file:// preview works); `404.html` gets root-relative paths (it's served at any depth). |
| `favicon.{ico,svg}`, `favicon-96x96.png`, `apple-touch-icon.png` | `assets/favicon.svg` | Real files, so Google Search shows them. |
| `og-image.jpg` (1200×630) | `assets/og-image.html` | Link-preview card. |

**Everything in `public/assets/` is named by its content hash** and cached for a
year (`immutable`). That's only safe because names change when bytes change —
`check.py` verifies every name against its content. To change the photo, replace
`assets/portrait-source.jpg` and re-run the generator; never overwrite a hashed
file in place.

## What each check protects

**SEO** — title/description lengths; canonical `https://csarko.sh/` (Firebase also
serves `csarko-sh.web.app`); `og:url` and JSON-LD `url` match it; Open Graph +
Twitter tags with a real 1200×630 image; JSON-LD `Person` with `sameAs`
(LinkedIn, GitHub, Substack); favicon files; one `<h1>`, no skipped heading
levels; robots.txt allows all and names the sitemap. Every page's canonical must
match its clean URL (`docs/x.html` → `https://csarko.sh/docs/x`); docs need
`og:type` `article`, `TechArticle` JSON-LD whose author is `#person`, and a
`BreadcrumbList`; `/docs` and `/games` need `CollectionPage`. The sitemap must list exactly
the indexable pages, and root-relative links must resolve without a redirect (no
trailing `/`, no `.html`).

**Performance** — HTML ≤ 50 KB; fonts ≤ 100 KB with `font-display: swap`, each
with a metric-matched `"<Family> Fallback"` face (`size-adjust` etc. against
Arial / Courier New, values in `build_assets.py` `FALLBACKS`) listed right after
it in the font stack — without them the font swap re-wrapped the hero and
measured **CLS 0.125**; Lighthouse CLS must stay ≤ 0.05; the
portrait is a `<picture>` with AVIF + WebP, `srcset`/`sizes`/`width`/`height`,
`fetchpriority="high"`, never lazy; 480w AVIF ≤ 25 KB and no variant > 90 KB;
**no animation on the hero** (it once delayed LCP by ~0.7s); **no third-party
resources** except origins in `THIRD_PARTY` in `check.py`; scripts must be
`async`/`defer`; JavaScript ≤ 10 KB (third-party measured with `--live`). Doc
pages get a 120 KB HTML budget.

**Accessibility** — the first element in `<body>` is the skip link, and its
target has `tabindex="-1"`; alt on every image; in-page links resolve; new-tab
links have `rel="noopener"`. Contrast is enforced by Lighthouse = 100:
`--faint` `#7d8597` is the dimmest text that clears 4.5:1 — don't darken it.

**Theme** — the page follows the system color scheme: dark tokens on `:root`,
light overrides in `@media (prefers-color-scheme: light) { :root { … } }`, with
`<meta name="color-scheme" content="dark light">` and a `theme-color` meta per
scheme. Lighthouse sees one theme per run, and headless Chrome otherwise
inherits the machine's setting, so `--lighthouse` audits both
(`--blink-settings=preferredColorScheme=0|1`). The static check covers both on
every run: no color literal outside the two token blocks, the light block
overrides every color token, and `--text`/`--muted`/`--faint`/`--accent` clear
4.5:1 on `--bg`/`--surface`/`--surface-2` (and `--on-accent` on the accent) in
each theme. In light mode `--faint` is `#5f677a` and the accent is the deep
`#0a735f`; the mint `#7dd3c0` fails on white.

**Security** (`firebase.json`, source `**`) — `Content-Security-Policy` with
`default-src 'none'`, `frame-ancestors 'none'`, `base-uri 'none'`,
`form-action 'none'`, `connect-src 'self'` (Lighthouse's robots.txt audit fetches
from inside the page; blocking it dropped SEO to 92), no `'unsafe-eval'`, no
`'unsafe-inline'` in `script-src`;
`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy: strict-origin-when-cross-origin`, a restrictive
`Permissions-Policy`, `Cross-Origin-Opener-Policy: same-origin`. HSTS comes from
Firebase. An inline `<script>` needs its SHA-256 in `script-src` (the check
prints the exact hash); JSON-LD data blocks are exempt. `style-src` keeps
`'unsafe-inline'` for the inline `<style>`, which Observatory doesn't penalize.

**404** — `public/404.html` exists, is `noindex`, has no canonical, links home,
and uses only root-relative paths.

**Layout** — at 320, 360, 390, 768 and 1440px: every nav link visible on one
line, ≥ 8px from the wordmark, no horizontal scroll, no button off-screen, skip
link hidden until focused. At ≤ 360px the nav gap tightens to 11px. The same
checks run on `/games`, `/docs` and the newest doc.

**One bar, one width, every page** — `.wrap` is `max-width: 1120px` in both
`public/index.html` and `DOCS_CSS` in `docs_lib.mjs`; change them together or
the nav jumps width between the home page and a generated page. The bar reads
`heading links │ page links`: heading links jump inside the current page, sit in
front and take `--faint`; page links go to another page, sit after the hairline
`.nav-divider` and take `--muted`. The home page's is
`Work · Projects · Skills · Contact │ Games · Research` (`Projects` jumps to
`#projects`, `Research` goes to `/docs`); every generated page (a doc, `/docs`,
`/games`) has page links only (`Games · Research`, from `PAGE_LINKS` in
`docs_lib.mjs`) and no divider, with `aria-current="page"` on the index page you
are on. Nothing links home by name: the wordmark does that on every page. Heading links are `li.heading-link` whose anchor
carries `data-collapsible="true"`: at ≤ 640px they and the divider hide, leaving
the page links alone. That attribute is also what lets the layout check accept a
hidden link (every link without it must stay visible at every width), so a new
nav link needs it only if it is a heading link. Long text is bounded by its own measure, not by the
shell: `78ch` on role and doc-list copy, `72ch` on a doc's `main`.

## Analytics (in place)

GoatCounter, configured only in `site.json` (`analytics.code`). The generator
writes the async `<script data-goatcounter>` tag into both pages, the hashed
self-hosted `count.js`, and the CSP; `check.py` derives its allowlist from the
same file and verifies all three agree. Source script:
`assets/vendor/goatcounter-count.js` (unmodified, ISC). It fits the 10 KB script
budget (9.4 KB raw, 3 KB transferred).

## Adding a script or third-party service

This is the change most likely to regress everything above. In order:

1. Prefer a first-party script file under `public/`, loaded with `defer`. If the
   vendor's host is required, load it `async`/`defer` — never render-blocking.
2. Add the vendor's origins to `THIRD_PARTY` in `check.py` (`script-src`, plus
   `connect-src` for where it sends beacons) **and** to the same CSP directives
   in `firebase.json`. No inline `<script>` unless its hash is in `script-src`.
3. Stay within `BUDGET_SCRIPTS`.
4. Run `check.py`, deploy, then `check.py --live --lighthouse --observatory`.
   Performance must stay ≥ 95 and Observatory A+.
5. Update README.md and AGENTS.md wherever they say the page has no JavaScript.

## Checklist for any change to public/

1. Name, headline, title or tagline changed? Update `<title>`, description,
   `og:*`, `twitter:*`, JSON-LD `jobTitle`/`description`, and
   `assets/og-image.html`; run `generate-assets.sh`.
2. Photo, fonts or theme colors changed? Replace the source in `assets/` and run
   `generate-assets.sh`; look at `og-image.jpg` and the preview screenshots.
3. Profile links changed? Update JSON-LD `sameAs`.
4. New image? `alt`, `width`, `height`; above the fold, never lazy or animated.
5. New section? Sequential headings, one h1. New nav item? Decide whether it is
   a heading link (in-page jump: `li.heading-link` plus
   `data-collapsible="true"`, in front of the divider) or a page link (after it),
   add it to both navs (`public/index.html` and `PAGE_LINKS` in `docs_lib.mjs`)
   if it belongs site-wide, and re-run the layout check.
6. New color? Make it a token with a value in both the dark and light blocks;
   text ≥ 4.5:1 on its surface in both. Check both themes' screenshots.
7. Never add `noindex` to index.html, `Disallow: /`, or remove the canonical.
8. New or changed doc? Use the `publish-doc` skill. A game is a file in
   `docs/games/`. Either way, edit the Markdown and re-run the generator; never
   edit `public/docs/` or `public/games/` by hand.

Content rules in `AGENTS.md` still win (no email/phone, no metrics in Experience).

## Google Search Console

**Use it for:** search queries, impressions, clicks, average position, indexing
and coverage, sitemap status, removals, and structured-data reports. For visitor
counts and referrers use GoatCounter instead. `AGENTS.md` → "Where to look" has
the URLs, the routing table, and the property's current state (pending items
with dates).

Domain property `csarko.sh`, verified 2026-09-11 by a `google-site-verification`
TXT value in `txt_records` in `_infra/main.tf` — **never remove it**. The sitemap
`https://csarko.sh/sitemap.xml` is submitted. After meaningful content changes,
use URL Inspection → Request indexing.

## Outside this repo

Links to https://csarko.sh from his GitHub profile, LinkedIn (Contact info →
Website) and Substack help name searches. Suggest them; don't change those
accounts without asking.
