# Docs section for csarko.sh: design

Date: 2026-09-15 · Status: approved in brainstorming, awaiting spec review

## Goal

Publish research docs and specs at `https://csarko.sh/docs/…` so they rank in
search and send their SEO value to `csarko.sh` itself. A path was chosen over a
`docs.csarko.sh` subdomain because it puts all links and search signals on one
host and lets the home page link to the docs as part of the same site.

The site keeps its standing targets on every page: Lighthouse SEO /
Accessibility / Best Practices 100 and Performance ≥ 95, Mozilla Observatory A+,
no layout breakage from 320px to 1440px, and no JavaScript except the
self-hosted GoatCounter counter.

## Decisions

| Question | Decision |
|---|---|
| Subdomain or path | Path: `/docs` and `/docs/<slug>` |
| Where the Markdown lives | Copied into this repo at `docs/published/<YYYY-MM-DD>-<slug>.md`; the copy is the published source of truth |
| Build approach | Node script `build_docs.mjs` with a vendored `marked`, adapted from `skills-general`'s `doc-preview/render.mjs`; output committed |
| Entry point from the home page | A new "Research & docs" section after Games; the nav is unchanged |
| Launch content | One doc: `game-dayhike/docs/rendering/2026-09-14-stylized-shader-looks.md` |

## Non-goals (this version)

- Per-doc share images (every page uses `og-image.jpg`).
- Images inside docs. The build fails if a doc contains any Markdown image
  (a remote image would also break the CSP and the third-party allowlist).
- Categories, tags, subfolders, pagination, search, RSS.
- Draft or unpublished docs. The repo is public, so anything committed is published.
- The contents rail's active-section highlight (it needs JavaScript).
- Mermaid, syntax highlighting, math.
- Changes to other repos (a "Published at csarko.sh" note in the `game-dayhike`
  original is optional and only with Cyrus's OK, after launch).

## 1. Sources, URLs and metadata

### Source files

`docs/published/<YYYY-MM-DD>-<slug>.md`, one file per doc, so the directory
reads in publication order. The date prefix is the doc's `published:` front
matter value, and the build fails if the two disagree. `<slug>` is lowercase
letters, digits and hyphens and carries no date of its own
(`2026-09-14-stylized-shader-looks.md` has the slug `stylized-shader-looks`).

**The slug alone is the URL.** The date prefix never appears in a link, so
renaming a file's slug moves a live URL. Because the date is what makes two file
names differ, the directory no longer keeps slugs unique on its own: the build
refuses two files whose slugs match, rather than let the second page overwrite
the first.

`docs/published/` is the only published part of top-level `docs/`; its sibling
`docs/superpowers/` holds internal planning specs like this one, which are never
published.

**The csarko.sh repository is public on GitHub.** Committing a file under
`docs/published/` publishes it, before any deploy. Review happens before the copy.

### URLs

Firebase serves `public/` with `cleanUrls: true` and `trailingSlash: false`.

| Source | Output | Canonical URL |
|---|---|---|
| `docs/published/<YYYY-MM-DD>-<slug>.md` | `public/docs/<slug>.html` | `https://csarko.sh/docs/<slug>` |
| (generated) | `public/docs/index.html` | `https://csarko.sh/docs` |

Because `/docs` has no trailing slash, relative links on it would resolve
against `/`. All links and asset paths on docs pages are root-relative.

### Front matter

Each source begins with a front matter block of `key: value` lines between `---`
fences, parsed by the build without a YAML library. Values are single-line
strings; a trailing `# comment` is not supported.

| Key | Required | Rule |
|---|---|---|
| `description` | yes | 70–160 characters |
| `published` | yes | `YYYY-MM-DD`, a real date |
| `updated` | no | `YYYY-MM-DD`, not before `published` |
| `source` | no | an `https://github.com/…` URL of a public original |

Unknown keys, a missing required key, or an invalid value fail the build with
the file name and the problem. The first `# H1` is the title and is required;
the build fails without one. The H1 is removed from the body and rendered in the
page header.

### Content rules

The page copy rules in `AGENTS.md` apply to docs: no email address or phone
number, no em-dashes. Docs taken from a private repository (such as
`magicpixel.ai`) need Cyrus's explicit approval per doc, and must not describe
the commercial asset pipeline or other private product details.

## 2. Pages

### Build pipeline

`generate-assets.sh` runs, in order:

1. `node .agents/skills/site-quality/scripts/build_docs.mjs`: writes
   `public/docs/<slug>.html`, `public/docs/index.html`, `public/sitemap.xml`, and
   the `<!-- generated:docs -->` block in `public/index.html`. It deletes
   `public/docs/*.html` files that no longer have a source. Doc pages contain the
   existing `generated:head`, `generated:fonts` and `generated:analytics` markers,
   left empty.
2. `build_assets.py`: fills the markers as today. Its page loop is extended from
   `public/*.html` to also cover `public/docs/*.html`, with the root-relative
   `/` prefix (as for `404.html`).
3. The favicon and share-card rendering, unchanged.

`build_docs.mjs` depends only on Node 18+ and `scripts/vendor/marked.esm.mjs`
(copied from `skills-general` with its MIT licence file). The output is
deterministic: two runs over the same sources produce byte-identical files (no
build timestamps; dates come from front matter; lists are sorted).

`build_docs.mjs --out <dir>` writes the same outputs under `<dir>` instead of
`public/` (doc pages, docs index, sitemap, and a copy of `index.html` with the
docs block filled) and touches nothing in the repository. `check.py` uses it.

With zero sources, the build writes no doc pages and no `docs/index.html`, the
`generated:docs` block is empty (the whole `<section>` lives inside the markers,
so nothing renders), and the sitemap lists only `/`. The Skills and Contact
labels stay `04` and `05` in that case; the gap is accepted.

### Shared page parts

- **Theme tokens:** the build reads `public/index.html` and copies its dark
  `:root { … }` block and its `@media (prefers-color-scheme: light) { :root { … } }`
  block verbatim into each generated page. Doc CSS uses only those tokens, so
  `check.py`'s theme checks hold and colors cannot drift from the home page.
- **CSS:** inline `<style>` per page, like `index.html`.
- **Head:** `lang="en"`, `color-scheme` meta and both `theme-color` metas as on
  the home page, root-relative favicon links.
- **Nav:** `.skip-link` as the first body element (target `main` with
  `tabindex="-1"`), then `.nav` containing the `.wordmark` (`csarko.sh`, linking
  `/`) and a `ul` with two links: Docs (`/docs`) and Home (`/`). This matches
  the selectors the layout check already uses.
- **Footer:** the home page's footer.
- **JavaScript:** none besides the generated analytics tag.

### Doc page (`/docs/<slug>`)

The visual style follows `doc-preview`'s renderer, minus the parts that don't
fit the site (embedded fonts, inline script, repository path labels):

- Header: eyebrow `Research · <Mon D, YYYY>` (plus ` · Updated <date>` when
  `updated` is set), the H1, and a tag row with `<n> min read` (words ÷ 230,
  minimum 1) and, when `source` is set, an "Also on GitHub ↗" link.
- Body: GitHub-flavored Markdown via `marked`.
  - H2 → a section with an `id` slug; a leading `N.` becomes a mono label (`01`)
    above the heading.
  - Tables and `pre` blocks wrapped in a horizontally scrolling box.
  - `http(s)` links get `target="_blank" rel="noopener"` and a `↗` mark.
  - Raw HTML in Markdown is escaped, not passed through.
  - Heading levels in the body must not skip (H2 → H4 fails the build).
  - Any Markdown image fails the build.
  - Links must be `https://`/`http://`, `#anchor` or root-relative `/path`;
    anything else (such as `other.md`) fails the build.
  - A link inside any heading (H1 through H6) fails the build, since it would
    produce a nested `<a>` (the heading's own anchor link, or the title link on
    `/docs` and the home list).
  - An em-dash anywhere in the file fails the build.
- Contents rail: the H2 list, visible at ≥ 1060px, static (no highlight).
- Author box after the body: "Written by Cyrus Sarkosh", the identity line
  "Senior software engineer, founding engineer and lead on several zero-to-one
  products at DoorDash.", and links to `/` and LinkedIn.

### Docs index (`/docs`)

- H1 "Research & docs" and a one-sentence intro.
- A list of every doc, newest `published` first (ties by slug): title linked to
  `/docs/<slug>`, description, date, reading time.

### Home page section

A new section in `public/index.html` after `#games`. The whole section, wrapper
included, lives inside `<!-- generated:docs -->` markers:

- `<section id="docs" aria-labelledby="docs-title">`, section label
  `03 / Research & docs`, H2 `Notes from what I'm researching`.
- The three newest docs as a simple list (title linked to `/docs/<slug>`,
  date, description), styled with existing tokens and not as project cards.
- An "All docs →" link to `/docs`.
- The Skills and Contact section labels become `04` and `05`. The nav does not
  change.

These links are root-relative, so they work under `preview.sh --serve` but not
when `index.html` is opened from disk.

## 3. SEO

### Doc page head

- `<title>`: `<H1> · Cyrus Sarkosh`. Over 65 characters is a warning, not a
  failure, and the title is not truncated.
- `<meta name="description">`: front matter `description`.
- `<link rel="canonical">` and `og:url`: `https://csarko.sh/docs/<slug>`.
- `og:type` `article`, `og:site_name` `Cyrus Sarkosh`, `og:locale` `en_US`,
  `og:title`, `og:description`, `og:image` `https://csarko.sh/og-image.jpg` with
  width, height and alt, `article:published_time`, `article:modified_time`
  (`updated`, else `published`), `article:author` `https://csarko.sh/`.
- `twitter:card` `summary_large_image`, `twitter:title`,
  `twitter:description`, `twitter:image` (equal to `og:image`),
  `twitter:image:alt`.

### Doc page JSON-LD

One `application/ld+json` block with an `@graph`:

- `TechArticle`: `@id` `<url>#article`, `headline` (H1), `description`,
  `datePublished`, `dateModified`, `url`, `mainEntityOfPage` (`url`),
  `wordCount`, `inLanguage` `en`, `image` (`og-image.jpg`),
  `author` and `publisher` an embedded minimal `Person` node
  (`{"@type": "Person", "@id": "https://csarko.sh/#person", "name": "Cyrus Sarkosh",
  "url": "https://csarko.sh/"}`, built once and reused for both fields), because
  Google reads structured data per page and does not follow `@id` to the home
  page's fuller `Person` record, `isPartOf` `{"@id": "https://csarko.sh/#website"}`,
  and `sameAs` `[source]` when `source` is set.
- `BreadcrumbList`: Cyrus Sarkosh (`https://csarko.sh/`) › Docs
  (`https://csarko.sh/docs`) › H1 (`url`).

### Docs index

- Head tags as above with `og:type` `website`, title
  `Research & docs · Cyrus Sarkosh`, canonical `https://csarko.sh/docs`, and a
  fixed description of 70–160 characters.
- JSON-LD: `CollectionPage` (`url`, `name`, `description`, `isPartOf` the
  website, `about` the person, `mainEntity` an `ItemList` of the docs in listed
  order) and a two-item `BreadcrumbList`.

### Home page

Its `Person` and `WebSite` JSON-LD is unchanged; `#person` and `#website` are the
`@id`s the docs reference.

### Sitemap

`public/sitemap.xml` is generated. It lists `https://csarko.sh/`,
`https://csarko.sh/docs`, and each doc with `<lastmod>` (`updated`, else
`published`). `/` and `/docs` carry no `<lastmod>`: a home-page-only edit never
moves it, so a borrowed value (such as the newest doc's date) would be
unreliable. `robots.txt` is unchanged.

### Manual steps after launch

Search Console → URL Inspection → Request indexing for `https://csarko.sh/docs`
and each new doc. The sitemap URL is already submitted.

## 4. Quality checks, preview, deploy, agent docs

### `check.py`

Page discovery: `index.html`, `404.html`, `docs/index.html` (if present), and
`docs/*.html`. Each page's expected canonical is derived from its path using the
clean-URL rules. Per page kind:

| Check | Home | 404 | Docs index | Doc |
|---|---|---|---|---|
| SEO tags, canonical = derived URL, one H1, no skipped levels | ✓ | (existing 404 rules) | ✓ | ✓ |
| JSON-LD | `Person` (existing) | none | `CollectionPage` + `BreadcrumbList` | `TechArticle` (author `@id` `#person`) + `BreadcrumbList` |
| HTML budget | 50 KB | 50 KB | 50 KB | 120 KB |
| Fonts, scripts, third-party allowlist | ✓ | ✓ | ✓ | ✓ |
| Portrait rules | ✓ | | | |
| Accessibility (alt, in-page anchors, `noopener`) | ✓ | ✓ | ✓ | ✓ |
| Skip link first in `<body>`, target has `tabindex="-1"` | ✓ | | ✓ | ✓ |
| Theme (tokens, light overrides, contrast) | ✓ | ✓ | ✓ | ✓ |

New checks:

- **Internal links:** every root-relative `href` on every page resolves to a
  file under `public/` by clean-URL rules (`/` → `index.html`, `/docs` →
  `docs/index.html`, `/docs/x` → `docs/x.html`). Links ending in `/` (other than
  `/`) or in `.html` fail, since Firebase would redirect them.
- **Sitemap:** the set of `<loc>` URLs equals the set of indexable pages
  (every page except `404.html`).
- **Freshness and determinism:** `check.py` runs `build_docs.mjs --out` into two
  temporary directories. The two builds must be byte-identical (determinism).
  The first is then compared with the committed files (`public/docs/*.html`,
  `public/sitemap.xml`, and the `generated:docs` block of `index.html`), after
  blanking the contents of the `generated:head`, `generated:fonts` and
  `generated:analytics` markers on both sides, since `build_assets.py` fills
  those. Any difference, including an extra or missing doc page, fails with
  "run generate-assets.sh". This catches edits to a source and to the template
  alike. `check.py` therefore needs Node 18+, which `deploy.sh` already requires.
- **Layout:** the headless-Chrome harness runs on `index.html`, `docs/index.html`
  and the newest doc at 320, 360, 390, 768 and 1440px, with the existing rules
  (nav links visible on one line, ≥ 8px from the wordmark, no horizontal scroll,
  no button off-screen, skip link hidden). Pages load over `file://` for this
  check, so it measures layout only.
- **`--live`:** `/docs` and every doc return 200 with the required headers and
  the same CSP as `/`; `/docs/` and `/docs/<newest>.html` return 301 to the clean
  URL; every sitemap URL returns 200.
- **`--lighthouse`:** audits `/` and the newest doc, each in both themes, with
  the existing targets.

### `preview.sh`

- `--serve` uses a small Python server (`serve.py` beside `preview.sh`) that
  mimics Firebase's routing: `/x` serves `x.html` when it exists, a directory
  serves its `index.html`, a trailing slash redirects to the slashless URL, and
  a missing path serves `404.html` with status 404.
- `--shots` loads pages from a temporary `serve.py` and adds desktop and mobile
  screenshots of the newest doc, in both themes (`doc-desktop.png`,
  `doc-desktop-light.png`, `doc-mobile.png`, `doc-mobile-light.png`).
- Plain `preview.sh` still opens `index.html` from disk and prints that the docs
  links need `--serve`.

### `deploy.sh`

- The privacy guard scans `public/**/*.html` and `docs/published/*.md`.
- After a live deploy, the byte-for-byte check also covers `docs/index.html` and
  the newest doc, on both the web.app URL and csarko.sh.

### Agent docs

- **New skill** `.agents/skills/publish-doc/SKILL.md` (discovered through the
  existing `.claude/skills` symlink), for "publish this doc to my site":
  1. Read the whole source doc and review it before copying: email addresses,
     phone numbers, private product details, commercial asset pipeline
     internals, customer names. From a private repository, get Cyrus's explicit
     OK for that doc.
  2. Copy it to `docs/published/<YYYY-MM-DD>-<slug>.md`, add front matter whose
     `published:` matches the file name's date, and replace any em-dashes.
  3. Run `generate-assets.sh`, then `preview.sh --serve --shots`, and look at
     both themes.
  4. Commit, run `deploy.sh`, and remind Cyrus to request indexing in Search
     Console.
- **`site-quality/SKILL.md`:** docs pages in the generated-assets table, the new
  checks, the doc HTML budget, `build_docs.mjs`.
- **`AGENTS.md`:** layout table (`docs/published/`, `public/docs/`, the vendored
  `marked`), "one static page" becomes a home page plus docs, the docs content
  rule, and that `docs/superpowers/specs/` holds unpublished planning specs.
- **`README.md`:** the same structural changes, briefly.

### Launch content

`docs/published/2026-09-14-stylized-shader-looks.md`, copied from
`game-dayhike/docs/rendering/2026-09-14-stylized-shader-looks.md`, with front
matter (`published: 2026-09-14`, a 70–160 character description, and `source`
pointing at the GitHub original).

## Acceptance

- `generate-assets.sh` runs twice with no diff.
- `check.py` passes, including the new checks.
- `preview.sh --serve --shots` screenshots of the home page, `/docs` and the doc
  look right in both themes at desktop and mobile width.
- After `deploy.sh`: `check.py --live --lighthouse --observatory` passes (SEO,
  Accessibility, Best Practices 100; Performance ≥ 95; Observatory A+) for `/`
  and the doc, in both themes.
