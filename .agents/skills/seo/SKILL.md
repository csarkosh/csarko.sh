---
name: seo
description: >-
  Keep csarko.sh findable and good-looking when shared: search tags, structured
  data, link-preview card, favicons, robots/sitemap, Core Web Vitals, and
  Google Search Console. Use whenever the user asks about SEO, Google, search
  ranking, "why doesn't my site show up", link previews ("how does it look on
  LinkedIn/Slack/X"), favicons, or Search Console — and apply its checklist on
  EVERY change to public/index.html, even when the user didn't mention SEO
  (changing the name, title, tagline, photo, colors, or adding a section all
  have SEO consequences). The preview and deploy skills run its checks
  automatically; this skill is where the rules and fixes live.
---

# SEO for csarko.sh

The goal is narrow and specific: **someone searching "Cyrus Sarkosh" finds this
site first, and a shared link renders a clean preview card.** It's one page, so
there's no keyword strategy — just make sure every signal is correct and stays
correct.

## Scripts

```bash
.agents/skills/seo/scripts/seo_check.py                   # static checks on public/ (offline, ~1s)
.agents/skills/seo/scripts/seo_check.py --live            # + the deployed site: robots, sitemap, images, 404, http→https, www
.agents/skills/seo/scripts/seo_check.py --lighthouse      # + Lighthouse; SEO and Accessibility must be 100
.agents/skills/seo/scripts/generate-assets.sh             # rebuild favicons + og-image.jpg from assets/
```

`preview.sh` runs the static check after every run, and `deploy.sh` refuses to
publish if it fails and runs `--live` after publishing. Run `--lighthouse`
yourself after visual or performance-relevant changes.

## What's in place, and why

| Signal | Where | Why it matters |
|---|---|---|
| `<title>` and meta description | `<head>` | The two lines shown in search results. Title 30–65 chars, description 70–160. |
| `<link rel="canonical" href="https://csarko.sh/">` | `<head>` | Firebase also serves the page at `csarko-sh.web.app` and `csarko-sh.firebaseapp.com`; canonical tells Google which one is real. `og:url` and JSON-LD `url` must match it exactly. |
| JSON-LD `Person` + `WebSite` | `<head>` | Lets Google tie the site to his LinkedIn, GitHub and Substack (`sameAs`) — the strongest signal for name searches. |
| Open Graph + Twitter tags | `<head>` | Link previews. `og:image` is `og-image.jpg`, **1200×630**, with declared width/height and alt text. |
| Favicons as files | `favicon.ico`, `.svg`, `favicon-96x96.png`, `apple-touch-icon.png` | Google Search only shows a favicon that is a crawlable file at a multiple of 48px. A `data:` URI never shows. |
| `robots.txt`, `sitemap.xml` | `public/` | Allow everything; the sitemap is what gets submitted to Search Console. No `lastmod` — a stale one is worse than none. |
| One `<h1>` (his name), no skipped heading levels, `lang="en"`, alt on every image | body | Basic crawlability and accessibility. |
| Self-hosted fonts, preloaded Inter + portrait, no fade-in on the hero | `public/fonts/`, `<head>` | The portrait is the Largest Contentful Paint. Third-party font CSS and an opacity animation both delayed it. |
| `--faint: #7d8597` | CSS tokens | The dimmest text color that clears 4.5:1 on every surface. Don't darken it. |
| `www.csarko.sh` → 301 → `csarko.sh` | `_infra` (`redirect_domain_names`) | People type www. One canonical host, no duplicate. |

## Checklist for any change to public/index.html

1. **Changed the name, headline, title, or tagline?** Update `<title>`,
   `meta description`, `og:title`/`og:description`, `twitter:*`, the JSON-LD
   `jobTitle`/`description`, **and** `assets/og-image.html`, then run
   `generate-assets.sh`.
2. **Changed the photo or theme colors?** Regenerate assets
   (`generate-assets.sh`) and look at `public/og-image.jpg`.
3. **Added or changed a profile link** (LinkedIn, GitHub, Substack)? Update
   JSON-LD `sameAs` to match.
4. **Added an image?** `alt`, `width` and `height`, and a relative `src`. Don't
   lazy-load or animate anything above the fold.
5. **Added a section?** Keep heading levels sequential (h2 → h3 → h4); only one h1.
6. **Added a new color for text?** Check contrast ≥ 4.5:1 against the surface it
   sits on.
7. **Added a new page** (unlikely)? Add it to `sitemap.xml`, give it its own
   canonical, title and description.
8. Never add `noindex`, never `Disallow: /`, never remove the canonical.

Content rules in `AGENTS.md` still win (no email/phone, no metrics in Experience).

## Google Search Console

The domain property `csarko.sh` is verified with a TXT record — **add the
token to `txt_records` in `_infra/main.tf`** (the apex TXT is a single record
set shared with `hosting-site=csarko-sh`), `terraform apply`, then click
Verify. After verifying: submit `https://csarko.sh/sitemap.xml`, and use URL
Inspection → Request indexing after meaningful content changes. Coverage and
queries show up there within a few days.

## Things that help ranking but live outside this repo

Links to `https://csarko.sh` from his GitHub profile (website field and profile
README), LinkedIn (Contact info → Website), and Substack (profile and About
page). Suggest them when relevant; don't change those accounts without asking.
