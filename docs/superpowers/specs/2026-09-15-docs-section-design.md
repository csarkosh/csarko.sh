# Docs section for csarko.sh: design

Date: 2026-09-15 · Status: approved in brainstorming, awaiting spec review

Amended after launch: the same pipeline now also builds `/games` from
`docs/games/*.md`. Everything below that says "docs" still holds for the docs
half; the games half is called out where it differs.

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
| Entry point from the home page | A new "Research & docs" section after the projects section; the nav gained page links later, with the games page (see "Nav") |
| Launch content | One doc: `game-dayhike/docs/rendering/2026-09-14-stylized-shader-looks.md` |
| Games page (amendment) | A sibling of the docs index at `/games`, built from `docs/games/<slug>.md` by the same `build_docs.mjs` run; no per-game pages |

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

`docs/published/` and `docs/games/` are the published parts of top-level `docs/`;
their sibling `docs/superpowers/` holds internal planning specs like this one,
which are never published.

**The csarko.sh repository is public on GitHub.** Committing a file under
`docs/published/` publishes it, before any deploy. Review happens before the copy.

### Game source files

`docs/games/<slug>.md`, one file per game. **The file name is the slug alone,
with no date prefix.** A game is not an entry in a dated log the way a research
note is, and the date a game matters by, its release, is a property that can
change; `released:` in the front matter carries it. Digits are legal in a slug,
so a copied doc-style name would otherwise build a game quietly called
`2026-09-16-day-hike`: the build refuses a leading `<YYYY-MM-DD>-` and says to
use `released:` instead. The slug is lowercase letters, digits and hyphens, and
`index` is reserved for the games index page.

The directory holds one file at launch, `docs/games/day-hike.md`.

### URLs

Firebase serves `public/` with `cleanUrls: true` and `trailingSlash: false`.

| Source | Output | Canonical URL |
|---|---|---|
| `docs/published/<YYYY-MM-DD>-<slug>.md` | `public/docs/<slug>.html` | `https://csarko.sh/docs/<slug>` |
| (generated) | `public/docs/index.html` | `https://csarko.sh/docs` |
| `docs/games/<slug>.md` | (no page of its own) | (listed on `/games`) |
| (generated) | `public/games/index.html` | `https://csarko.sh/games` |

**There are no per-game pages yet.** A game is one entry on `/games`, and its
entry links out to the game and its repository rather than to a page here. The
slug names the source file and nothing else, so adding per-game pages later
(`/games/<slug>`) needs no renaming.

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

### Game front matter

The same block, parsed by the same reader, with its own keys:

| Key | Required | Rule |
|---|---|---|
| `description` | yes | 70–160 characters, as for a doc |
| `status` | yes | `playable` or `in-development` |
| `tags` | yes | 1 to 5 comma-separated names |
| `play` | no | an `https://` URL where the game runs |
| `repo` | no | an `https://github.com/…` URL |
| `released` | no | `YYYY-MM-DD`, a real date |

`status` is also the kicker line above the title on `/games` ("Playable now ·
No install" or "In development"), so the two can never disagree. The first
`# H1` is the game's name, required as for a doc, and the body below it is the
entry's copy.

### Content rules

The page copy rules in `AGENTS.md` apply to docs and games alike: no email address or phone
number, no em-dashes. Docs taken from a private repository (such as
`magicpixel.ai`) need Cyrus's explicit approval per doc, and must not describe
the commercial asset pipeline or other private product details.

## 2. Pages

### Build pipeline

`generate-assets.sh` runs, in order:

1. `node .agents/skills/site-quality/scripts/build_docs.mjs`: writes
   `public/docs/<slug>.html`, `public/docs/index.html`, `public/games/index.html`,
   `public/sitemap.xml`, and
   the `<!-- generated:docs -->` block in `public/index.html`. It reads both
   source directories in one run and deletes
   `public/docs/*.html` and `public/games/*.html` files that no longer have a
   source, removing either directory once it is empty. Generated pages contain the
   existing `generated:head`, `generated:fonts` and `generated:analytics` markers,
   left empty.
2. `build_assets.py`: fills the markers as today. Its page loop is extended from
   `public/*.html` to also cover `public/docs/*.html` and `public/games/*.html`,
   with the root-relative `/` prefix (as for `404.html`).
3. The favicon and share-card rendering, unchanged.

`build_docs.mjs` depends only on Node 18+ and `scripts/vendor/marked.esm.mjs`
(copied from `skills-general` with its MIT licence file). The output is
deterministic: two runs over the same sources produce byte-identical files (no
build timestamps; dates come from front matter; lists are sorted).

`build_docs.mjs --out <dir>` writes the same outputs under `<dir>` instead of
`public/` (doc pages, docs index, games index, sitemap, and a copy of
`index.html` with the docs block filled) and touches nothing in the repository.
`check.py` uses it.

With zero sources, the build writes no doc pages and no `docs/index.html`, the
`generated:docs` block is empty (the whole `<section>` lives inside the markers,
so nothing renders), and the sitemap lists only `/`. The Skills and Contact
labels stay `04` and `05` in that case; the gap is accepted. Games behave the
same way: with no file in `docs/games/` there is no `games/index.html` and no
`/games` line in the sitemap.

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
  `/`) and a `ul` of page links. This matches the selectors the layout check
  already uses. The bar reads, on every page of the site:
  - **Home page:** heading links `Work · Projects · Skills · Contact`, the
    `.nav-divider` hairline, then the page links `Games · Research`. The heading
    link formerly labelled `Games` is `Projects`, and the home section it jumps
    to was renamed with it: `#games` became `#projects`, `id="games-title"`
    became `id="projects-title"`, and the label `02 / Games & projects` became
    `02 / Projects`. Its H2 "Things I build for fun" and its four cards are
    unchanged. `Research` is the page link that used to read `Docs`; it still
    points at `/docs`, whose own H1 stays "Research & docs".
  - **Generated pages** (a doc, `/docs`, `/games`): the page links only, in the
    order `Games · Research · Home` (`PAGE_LINKS` in `docs_lib.mjs`), no heading
    links and no divider, with `aria-current="page"` on the index page you are
    on. A doc page marks none of them.
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

### Games index (`/games`)

The same page shape as the docs index, sharing its CSS, and the only page the
games build produces.

- `<title>` and H1 "Games, playable in your browser" (the words a searcher would
  type); the nav, the breadcrumb and the share card use the short name "Games".
  An eyebrow "Games" and a one-sentence intro sit above the list.
- One entry per game: the `status` kicker, the game's H1 rendered as an H2, the
  rendered body, the `tags` as pills, and a links line, "Play in your browser"
  for `play` and "View on GitHub" for `repo`, both external. The heading is not
  itself a link: the two links below it say where they go, which a repeated title
  never does. A game with neither key gets no links line.
- **Order:** games still being built lead, since that is the current work; then
  released games, newest `released` first. Ties break on slug, so the order never
  depends on the order the directory was read in.

### Home page section

A new section in `public/index.html` after the projects section (`#games` then,
`#projects` now). The whole section, wrapper
included, lives inside `<!-- generated:docs -->` markers:

- `<section id="docs" aria-labelledby="docs-title">`, section label
  `03 / Research & docs`, H2 `Notes from what I'm researching`.
- The three newest docs as a simple list (title linked to `/docs/<slug>`,
  date, description), styled with existing tokens and not as project cards.
- An "All docs →" link to `/docs`.
- The Skills and Contact section labels become `04` and `05`. The nav did not
  change for this section; it changed later, with the games page (see "Nav").

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

### Games index

- Head tags as for the docs index, with `og:type` `website`, canonical
  `https://csarko.sh/games`, and a fixed description of 70–160 characters. The
  `<title>` is the H1 plus `· Cyrus Sarkosh`; `og:title` and `twitter:title` use
  the short name "Games".
- JSON-LD: `CollectionPage` shaped as above, whose `ItemList` holds a `VideoGame`
  per game (`name`, `description`, `url` the `play` URL, else `repo`, else the
  page, `gamePlatform` "Web browser", `author` the minimal `Person` node), and a
  two-item `BreadcrumbList` (Cyrus Sarkosh › Games).

### Home page

Its `Person` and `WebSite` JSON-LD is unchanged; `#person` and `#website` are the
`@id`s the docs reference.

### Sitemap

`public/sitemap.xml` is generated. It lists `https://csarko.sh/`,
`https://csarko.sh/games`, `https://csarko.sh/docs`, and each doc with
`<lastmod>` (`updated`, else `published`), in that order. `/`, `/games` and
`/docs` carry no `<lastmod>`: a home-page-only edit never
moves it, so a borrowed value (such as the newest doc's date) would be
unreliable, and a game's `released:` is not the date its entry last changed.
`robots.txt` is unchanged.

### Manual steps after launch

Search Console → URL Inspection → Request indexing for `https://csarko.sh/docs`
and each new doc. The sitemap URL is already submitted.

## 4. Quality checks, preview, deploy, agent docs

### `check.py`

Page discovery: `index.html`, `404.html`, `docs/index.html` and
`games/index.html` (each if present), and `docs/*.html`. Each page's expected
canonical is derived from its path using the clean-URL rules. Per page kind:

| Check | Home | 404 | Docs index | Games index | Doc |
|---|---|---|---|---|---|
| SEO tags, canonical = derived URL, one H1, no skipped levels | ✓ | (existing 404 rules) | ✓ | ✓ | ✓ |
| JSON-LD | `Person` (existing) | none | `CollectionPage` + `BreadcrumbList` | `CollectionPage` + `BreadcrumbList` | `TechArticle` (author `@id` `#person`) + `BreadcrumbList` |
| HTML budget | 50 KB | 50 KB | 50 KB | 50 KB | 120 KB |
| Fonts, scripts, third-party allowlist | ✓ | ✓ | ✓ | ✓ | ✓ |
| Portrait rules | ✓ | | | | |
| Accessibility (alt, in-page anchors, `noopener`) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Skip link first in `<body>`, target has `tabindex="-1"` | ✓ | | ✓ | ✓ | ✓ |
| Theme (tokens, light overrides, contrast) | ✓ | ✓ | ✓ | ✓ | ✓ |

New checks:

- **Internal links:** every root-relative `href` on every page resolves to a
  file under `public/` by clean-URL rules (`/` → `index.html`, `/docs` →
  `docs/index.html`, `/games` → `games/index.html`, `/docs/x` → `docs/x.html`).
  Links ending in `/` (other than `/`) or in `.html` fail, since Firebase would
  redirect them.
- **Sitemap:** the set of `<loc>` URLs equals the set of indexable pages
  (every page except `404.html`).
- **Freshness and determinism:** `check.py` runs `build_docs.mjs --out` into two
  temporary directories. The two builds must be byte-identical (determinism).
  The first is then compared with the committed files (`public/docs/*.html`,
  `public/games/*.html`, `public/sitemap.xml`, and the `generated:docs` block of
  `index.html`), after
  blanking the contents of the `generated:head`, `generated:fonts` and
  `generated:analytics` markers on both sides, since `build_assets.py` fills
  those. Any difference, including an extra or missing doc or game page, fails
  with "run generate-assets.sh"; the comparison covers `docs/published/` and
  `docs/games/` together. This catches edits to a source and to the template
  alike. `check.py` therefore needs Node 18+, which `deploy.sh` already requires.
- **Layout:** the headless-Chrome harness runs on `index.html`,
  `games/index.html`, `docs/index.html`
  and the newest doc at 320, 360, 390, 768 and 1440px, with the existing rules
  (nav links visible on one line, ≥ 8px from the wordmark, no horizontal scroll,
  no button off-screen, skip link hidden). Pages load over `file://` for this
  check, so it measures layout only.
- **`--live`:** `/games`, `/docs` and every doc return 200 with the required
  headers and the same CSP as `/`; `/games/`, `/docs/` and
  `/docs/<newest>.html` return 301 to the clean URL; every sitemap URL returns
  200.
- **`--lighthouse`:** audits `/` and the newest doc, each in both themes, with
  the existing targets. It does not audit `/games`, which shares the docs index's
  page shape and CSS.

### `preview.sh`

- `--serve` uses a small Python server (`serve.py` beside `preview.sh`) that
  mimics Firebase's routing: `/x` serves `x.html` when it exists, a directory
  serves its `index.html`, a trailing slash redirects to the slashless URL, and
  a missing path serves `404.html` with status 404.
- `--shots` loads pages from a temporary `serve.py` and adds desktop and mobile
  screenshots of `/games` and of the newest doc, in both themes
  (`games-desktop.png`, `games-desktop-light.png`, `games-mobile.png`,
  `games-mobile-light.png`; `doc-desktop.png`, `doc-desktop-light.png`,
  `doc-mobile.png`, `doc-mobile-light.png`).
- Plain `preview.sh` still opens `index.html` from disk and prints that the docs
  links need `--serve`.

### `deploy.sh`

- The privacy guard scans `public/*.html`, `public/docs/*.html`,
  `public/games/*.html`, `docs/published/*.md` and `docs/games/*.md`: every file
  that carries copy, in both its source and its built form. A new content type
  has to be added to `SCAN` in `deploy.sh`, or it ships unscanned.
- After a live deploy, the byte-for-byte check also covers `games/index.html`,
  `docs/index.html` and the newest doc, on both the web.app URL and csarko.sh.

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
- **Games (amendment):** `publish-doc/SKILL.md` keeps its subject, a research
  doc, and only points at `docs/games/<slug>.md` and its front matter keys for a
  game. `site-quality/SKILL.md` gains the games rows in the generated-assets
  table and the corrected nav bar; `AGENTS.md` and `README.md` gain
  `docs/games/` and `public/games/`.

### Launch content

`docs/published/2026-09-14-stylized-shader-looks.md`, copied from
`game-dayhike/docs/rendering/2026-09-14-stylized-shader-looks.md`, with front
matter (`published: 2026-09-14`, a 70–160 character description, and `source`
pointing at the GitHub original).

The games page launched with one file, `docs/games/day-hike.md`: `status:
playable`, `play` pointing at `https://games.csarko.sh/dayhike/`, `repo` at the
public `game-dayhike`, and the story and tech copy the home page card already
carried.

## Acceptance

- `generate-assets.sh` runs twice with no diff.
- `check.py` passes, including the new checks.
- `preview.sh --serve --shots` screenshots of the home page, `/games`, `/docs`
  and the doc look right in both themes at desktop and mobile width.
- After `deploy.sh`: `check.py --live --lighthouse --observatory` passes (SEO,
  Accessibility, Best Practices 100; Performance ≥ 95; Observatory A+) for `/`
  and the doc, in both themes.
