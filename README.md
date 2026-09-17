# csarko.sh

The source code behind my portfolio site **→ [csarko.sh](https://csarko.sh)**.

A hand-written home page plus a games list at [csarko.sh/games](https://csarko.sh/games) and research docs at [csarko.sh/research](https://csarko.sh/research), both built from Markdown: no framework, fully agent-managed.

## What's here

```
public/            the site: index.html, games/ and research/ (generated) and assets
docs/published/    the published docs, as dated Markdown with front matter
docs/games/        one Markdown file per game, named for its slug
docs/superpowers/  internal design specs and plans, never published
_infra/            Terraform for hosting (Firebase, GCP) and DNS (Route53, AWS)
.agents/skills/    preview, deploy, site-quality and publish-doc skills for AI agents (and humans)
firebase.json      what gets published, and how it's cached
AGENTS.md          working context and rules for agents; CLAUDE.md points to it
```

## Preview locally

```bash
.agents/skills/preview/scripts/preview.sh           # open in Chrome
.agents/skills/preview/scripts/preview.sh --serve   # serve on http://localhost:4173 with clean URLs (needed for /games and /research)
.agents/skills/preview/scripts/preview.sh --shots   # desktop + mobile screenshots in /tmp
```

Or just open `public/index.html` in a browser (its /games and /research links need --serve).

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
- **Private analytics:** [GoatCounter](https://www.goatcounter.com), with its script self-hosted and no cookies, so no consent banner and no third-party code on the page.

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
