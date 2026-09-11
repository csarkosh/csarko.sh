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
  mobile menu, analytics, or adding any script or third-party service — and
  apply its checklist on EVERY change to public/, even when the user didn't
  mention quality. The preview and deploy skills run its checks automatically.
---

# Site quality for csarko.sh

Targets: **Lighthouse SEO / Accessibility / Best Practices 100 and Performance
≥ 95, Mozilla Observatory A+, no layout breakage from 320px to 1440px.** It's one
page, so every one of these is achievable and should stay that way.

## Scripts

```bash
S=.agents/skills/site-quality/scripts
$S/check.py                    # static: SEO, performance budgets, a11y, headers, 404, layout (~5s)
$S/check.py --live             # + deployed site: live headers, caching, 404, redirects, third-party JS
$S/check.py --lighthouse       # + Lighthouse (SEO/A11y/Best Practices 100, Performance ≥ 95)
$S/check.py --observatory      # + Mozilla HTTP Observatory (must be A+)
$S/generate-assets.sh          # rebuild EVERYTHING generated (see below) — deterministic
```

`preview.sh` runs `check.py` every time. `deploy.sh` refuses to publish if it
fails, then runs `--live`. After anything that could move scores (images,
fonts, CSS, scripts, headers), also run `--lighthouse --observatory` once live,
and report the numbers.

## Generated assets — never hand-edit

`generate-assets.sh` runs `build_assets.py`, then renders the icons and card.
Same inputs, same outputs (two builds produce identical hashes).

| Output | Source | Notes |
|---|---|---|
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
levels; robots.txt allows all and names the sitemap.

**Performance** — HTML ≤ 50 KB; fonts ≤ 100 KB with `font-display: swap`, each
with a metric-matched `"<Family> Fallback"` face (`size-adjust` etc. against
Arial / Courier New, values in `build_assets.py` `FALLBACKS`) listed right after
it in the font stack — without them the font swap re-wrapped the hero and
measured **CLS 0.125**; Lighthouse CLS must stay ≤ 0.05; the
portrait is a `<picture>` with AVIF + WebP, `srcset`/`sizes`/`width`/`height`,
`fetchpriority="high"`, never lazy; 480w AVIF ≤ 25 KB and no variant > 90 KB;
**no animation on the hero** (it once delayed LCP by ~0.7s); **no third-party
resources** except origins in `THIRD_PARTY` in `check.py`; scripts must be
`async`/`defer`; JavaScript ≤ 10 KB (third-party measured with `--live`).

**Accessibility** — the first element in `<body>` is the skip link, and its
target has `tabindex="-1"`; alt on every image; in-page links resolve; new-tab
links have `rel="noopener"`. Contrast is enforced by Lighthouse = 100:
`--faint` `#7d8597` is the dimmest text that clears 4.5:1 — don't darken it.

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

**Layout** — at 320, 360, 390, 768 and 1440px: all four nav links visible on one
line, ≥ 8px from the wordmark, no horizontal scroll, no button off-screen, skip
link hidden until focused. On phones "Contact" is shown as "Links"
(`label-short`), with `aria-label="Contact"` so assistive tech is unchanged; at
≤ 360px the nav gap tightens to 11px.

## Adding a script or third-party service (e.g. analytics)

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
5. New section? Sequential headings, one h1. New nav item? Re-run the layout
   check — it may need a `label-short`.
6. New text color? ≥ 4.5:1 on its surface.
7. Never add `noindex` to index.html, `Disallow: /`, or remove the canonical.

Content rules in `AGENTS.md` still win (no email/phone, no metrics in Experience).

## Google Search Console

Domain property `csarko.sh`, verified 2026-09-11 by a `google-site-verification`
TXT value in `txt_records` in `_infra/main.tf` — **never remove it**. The sitemap
`https://csarko.sh/sitemap.xml` is submitted. After meaningful content changes,
use URL Inspection → Request indexing.

## Outside this repo

Links to https://csarko.sh from his GitHub profile, LinkedIn (Contact info →
Website) and Substack help name searches. Suggest them; don't change those
accounts without asking.
