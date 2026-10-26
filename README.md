# csarko.sh

The source code behind my portfolio site **→ [csarko.sh](https://csarko.sh)**.

A hand-written home page plus projects (games, apps and short films) at [csarko.sh/projects](https://csarko.sh/projects) and research docs at [csarko.sh/research](https://csarko.sh/research), all built from Markdown: no framework, fully agent-managed. Beside it, a private analytics dashboard at admin.csarko.sh that costs nothing to run and sets no cookies; the design is written up in [A zero-cost analytics dashboard without cookies](https://csarko.sh/research/a-zero-cost-analytics-dashboard-without-cookies).

## What's here

```
public/            the site: index.html, film/, games/ and research/ (generated) and assets
docs/published/    the published docs, as dated Markdown with front matter
docs/games/        one Markdown file per game, named for its slug
docs/films/        one Markdown file per short film, with its poster beside the site-quality skill
docs/superpowers/  internal design specs and plans, never published
docs/substack/     the log of Substack posts made from the docs
admin/             the private dashboard: admin/public is the site admin.csarko.sh, admin/api its Cloud Run service
_infra/            Terraform for hosting (Firebase, GCP), the admin site and API, and DNS (Route53, AWS)
.agents/skills/    preview, deploy, site-quality, publish-doc and substack-post skills for AI agents (and humans)
firebase.json      what gets published (two Hosting sites), and how it's cached
AGENTS.md          working context and rules for agents; CLAUDE.md points to it
```

## The admin dashboard

[admin.csarko.sh](https://admin.csarko.sh) is one private page per app, behind a Google sign-in with an allowlist, with the look and the quality bar of the site itself. An index card per app shows its KPIs against the period before, twelve weeks of trend and a health reading; each app's own page goes deeper. For the site that is visits, referrers, pages, outbound clicks, search queries and impressions, reach (YouTube, every public GitHub repo, Hacker News, Substack), health (uptime, certificate, Lighthouse, pages indexed, 404s) and audience; for [Day Hike](https://games.csarko.sh/dayhike) it is the game's own telemetry.

- **No cookies, no vendor on the page:** lib-visits (two self-hosted scripts and a same-origin collector) counts visits; Search Console, YouTube, GitHub and PageSpeed Insights are read server-side by a Cloud Run service that scales to zero.
- **$0 a month:** every source is a free API, the daily snapshot of every KPI is a few KB a day in Firestore, and Cloud Scheduler writes it.
- **Scales by contract:** an app is one entry in `admin/public/apps.json` and two routes on its API (`admin/CONTRACT.md`); the Day Hike page is built in its own repo and pulled in at deploy.
- **Fast to read:** every card is a skeleton the moment the page opens and fills on its own; the slow sources (URL inspection, Lighthouse) run once a day in the snapshot, never on a page load.

```bash
admin/preview.sh            # the pages with sample data, on http://localhost:8788
admin/deploy.sh             # publish the admin site (the API deploys with gcloud run deploy, see admin/api/README.md)
```

## Preview locally

```bash
.agents/skills/preview/scripts/preview.sh           # open in Chrome
.agents/skills/preview/scripts/preview.sh --serve   # serve on http://localhost:4173 with clean URLs (needed for /projects and /research)
.agents/skills/preview/scripts/preview.sh --shots   # desktop + mobile screenshots in /tmp
```

Or just open `public/index.html` in a browser (its /projects and /research links need --serve).

## Deploy

```bash
.agents/skills/deploy/scripts/deploy.sh             # publish to csarko.sh
.agents/skills/deploy/scripts/deploy.sh --preview   # a shareable preview link, valid 7 days
```

The script publishes `public/` to Firebase Hosting, then fetches the live page and checks that it matches the file you deployed. It needs Node 20+, Terraform, and Google application-default credentials (`gcloud auth application-default login`).

## Quality

Lighthouse 100 across SEO, accessibility and best practices, performance ≥ 95, and an A+ on Mozilla Observatory — enforced, not aspirational:

- **Fast:** a responsive AVIF/WebP portrait, self-hosted fonts, content-hashed assets cached for a year, and byte budgets for HTML, fonts, images and JavaScript.
- **Findable:** canonical URLs, schema.org `Person` data on the home page and `TechArticle` + breadcrumbs on every doc, a 1200×630 link-preview card, real favicons, `robots.txt` and a generated sitemap.
- **Locked down:** a strict Content-Security-Policy and the full set of security headers.
- **Accessible:** skip link, WCAG AA contrast in both the dark and light themes (the page follows your system setting), and a layout checked from 320px to 1440px.
- **Private analytics:** lib-visits (my own, private), with its scripts self-hosted, a same-origin collector and no cookies, so no consent banner and no third-party code on the page.

`.agents/skills/site-quality/scripts/check.py` verifies all of it. Preview runs it, deploy won't publish without it, and `generate-assets.sh` rebuilds every generated asset deterministically.

## Infrastructure

```
csarko.sh ─────(Route53 A + TXT)───▶ Firebase Hosting (GCP project csarko-sh) ──▶ public/
www.csarko.sh ──(Route53 CNAME)────▶ Firebase Hosting ──301──▶ https://csarko.sh
```

Everything is defined in Terraform under `_infra/`, with state in a versioned GCS bucket:

```bash
terraform -chdir=_infra init
terraform -chdir=_infra plan
```

## License

[MIT](./LICENSE)
