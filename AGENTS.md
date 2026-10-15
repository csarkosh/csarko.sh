# csarko.sh — working context

Cyrus Sarkosh's portfolio site, live at **https://csarko.sh**. A home page (who
he is, where he's worked, the games he builds, his skills, and how to reach him),
apps at **https://csarko.sh/apps** (each with its own page on
**https://apps.csarko.sh**), a games list at **https://csarko.sh/games**, short films at
**https://csarko.sh/film** and research docs at
**https://csarko.sh/research** (served at `/docs` until 2026-09-17; those URLs
now 301 there). No framework and no CI; the one build step,
`generate-assets.sh`, also turns `docs/published/*.md`, `docs/games/*.md`,
`docs/films/*.md` and `docs/apps/*.md` into pages.

## Layout

| Path | What |
|---|---|
| `public/index.html` | **The home page.** One file: inline CSS, inline SVG icons, JSON-LD. The only JavaScript is the two self-hosted lib-visits scripts. Its nav bar and 1120px `.wrap` must stay in step with the generated pages' copy in `docs_lib.mjs` (see `site-quality`, "One bar, one width, every page"). |
| `public/me.jpg` | Portrait (640px wide JPEG, from `~/Pictures/Cyrus/me_1.png`). |
| `public/assets/` | **Generated, content-hashed, cached for a year:** responsive portraits (AVIF/WebP/JPEG) and self-hosted fonts. |
| `public/og-image.jpg`, `portrait.jpg`, `favicon.*`, `apple-touch-icon.png` | **Generated** too. Everything generated comes from `.agents/skills/site-quality/assets/` via `generate-assets.sh` — never hand-edit, including the `generated:` blocks inside the HTML. |
| `public/404.html` | Custom not-found page (noindex, root-relative paths). |
| `public/licenses/fonts-OFL.txt` | Font licenses. |
| `public/robots.txt` | Crawl rules. |
| `docs/published/<YYYY-MM-DD>-<slug>.md` | **Published docs, source of truth.** Markdown with front matter, one file per doc, named for its `published:` date (the build fails if the two disagree). The URL is the slug alone: `/research/<slug>`, no date. The repo is public, so committing a file here publishes it; use the `publish-doc` skill. |
| `docs/films/<slug>.md` | **The films, source of truth.** One file per short film, named for the slug alone (a date prefix is refused; `released:` in the front matter is the date). Front matter also carries `watch` (the YouTube URL), `runtime`, `alt` (the poster's alt text), `tags` and an optional `warning` (a content warning, shown on the card). Its poster is committed at `.agents/skills/site-quality/assets/films/<slug>.jpg`. The repo is public, so committing a file here publishes it. |
| `docs/apps/<slug>.md` | **The apps, source of truth** *(added 2026-10-15)*. One file per app, named for the slug alone. Front matter: `description`, `status` (`released` or `in-development`), `page` (the app's page, `https://apps.csarko.sh/<slug>` for one hosted there), `platforms` (what it runs on, for the JSON-LD), `tags`, and optional `license` (joins the status in the card's kicker), `repo`, `released`, `link` (the card link's words, "Download and docs" by default; MacStats says "Install and docs") and `alt`. **With `alt`, the card carries a preview** *(Cyrus, 2026-10-15, like `/film`'s posters)*: the source is `.agents/skills/site-quality/assets/apps/<slug>.png`, plus `<slug>-dark.png` for the dark theme if there is one, and `build_assets.py` emits the hashed AVIF/WebP/JPEG (a transparent source is laid on the card's background). lib-visits' pair is its README hero (lib-visits' `scripts/readme-image.sh`), MacStats' its `docs/previews/menubar.png`. The body is the card's copy. The repo is public, so committing a file here publishes it. |
| `apps/` | **`https://apps.csarko.sh`** *(added 2026-10-15)*: each app's own page, `apps.csarko.sh/<slug>`, a third Firebase Hosting site `csarko-sh-apps`; its `/` 301s to `https://csarko.sh/apps`, as `games.csarko.sh` goes to `/games`. `apps/build.mjs` makes each page from the app's README on GitHub (default branch) and its **latest release**, whose assets become the download buttons, with the site's head, nav, trail, fonts and theme (`pageShell` in `docs_lib.mjs`, `apps/product.mjs`); `apps/public/` is its git-ignored output. The README's HTML (a `<h1>` title, `<p align>` paragraphs, a `<picture>` hero, a table of picture-and-text panels) is drawn by the page itself; HTML it does not know fails the build. An app without download assets (MacStats builds on your Mac) gets its release named under its `## Install` section instead of buttons. `node apps/build.mjs --local <slug>=<checkout>` builds from a local README, to look before pushing. **Run `apps/deploy.sh` after an app's README changes or it releases**: the buttons name the release that was latest at build time. No script on this host (no analytics: the collector takes `https://csarko.sh` only). Tests: `node --test apps/test/*.test.mjs`. |
| `docs/games/<slug>.md` | **The games, source of truth.** Markdown with front matter, one file per game, named for the slug alone: a game is not a dated log entry, so a date prefix is refused (`released:` in the front matter is the date). The repo is public, so committing a file here publishes it. |
| `public/research/`, `public/games/`, `public/film/`, `public/apps/`, `public/sitemap.xml` | **Generated** from `docs/published/`, `docs/games/`, `docs/films/` and `docs/apps/` by `build_docs.mjs` (run by `generate-assets.sh`). `public/film/<slug>.jpg` is each film's stable poster, written by `build_assets.py`. |
| `docs/superpowers/` | Internal design specs and implementation plans. **Never published** (unlike its siblings `docs/published/`, `docs/games/`, `docs/films/` and `docs/apps/`, which are). |
| `docs/substack/posts.json` | The log of csarko.log posts made with the `substack-post` skill: date, Substack URL, title and the doc slugs each covered. Not a page: the build reads only the three content folders. |
| `firebase.json`, `.firebaserc` | Firebase Hosting config: publish `public/`, cache headers, and the 301 redirects from the old `/docs` URLs to `/research` (keep them: old links and search results still use them). |
| `admin/` | **The private dashboard, `https://admin.csarko.sh`** *(designed and approved 2026-10-12; spec: `docs/superpowers/specs/2026-10-12-admin-dashboard-design.md`)*. `admin/public/` is the shell (the index of tracked apps, `/csarko.sh/` the site's own dashboard, `theme.css`, `auth.js`, `charts.js`), a second Firebase Hosting site `csarko-sh-admin`; `admin/api/` is the Cloud Run service `csarko-admin` that reads the visits data in BigQuery, Search Console, YouTube, GitHub and the daily Firestore snapshots; `admin/public/game-dayhike/` is **pulled at deploy** from the game's repo (git-ignored). See "Admin pages" below for the standing rule. |
| `_infra/` | Terraform for the hosting, DNS, the apps site, and the admin site and API. Same shape as `~/Projects/game-dayhike/_infra` (project `fps-csarko`). |
| `.agents/skills/` | Agent skills: `preview`, `deploy`, `site-quality`, `publish-doc` and `substack-post`. `.claude/skills` is a symlink to it so Claude Code discovers them. |
| `.claude/settings.json` | Imports the shared skill plugins from [`csarkosh/skills-general`](https://github.com/csarkosh/skills-general): `general:doc-preview` (open a markdown doc as a styled page in Chrome; not this repo's `preview`, which previews the site) and `general:search-console` (Google Search Console reports: indexing, sitemap, search performance) and `general-claude:doc-artifact` (publish a doc as a claude.ai Artifact). Change those skills in `skills-general`, not here. On a machine that has never installed them, run `claude plugin install general@csarkosh` and `claude plugin install general-claude@csarkosh`. Codex has no per-repository import: run `codex plugin marketplace add csarkosh/skills-general` and `codex plugin add general@csarkosh` once per machine. |
| `README.md` | Human-facing overview. `LICENSE` is MIT and predates this version of the site. |

## Workflows

- **See a change:** `.agents/skills/preview/scripts/preview.sh` (opens the home page
  from disk; use `--serve` for `/apps`, `/film`, `/games`, `/research` and their links) or `--shots` for
  desktop + mobile screenshots of the home page, `/apps`, `/film`, `/games` and the newest doc, in
  both the dark and light themes, in `/tmp/csarko-sh-preview/`. After any visual
  edit, look at the screenshots in both themes before calling it done.
- **Publish a doc:** the `publish-doc` skill.
- **Write a Substack post:** the `substack-post` skill outlines a short csarko.log
  post on 1 to 4 published docs, Cyrus writes every sentence, and the skill reviews
  it and suggests spots for humour. Claude never writes the post itself: a Claude
  draft in his voice scored 100% AI on Substack's check
  (`/research/voice-profile-vs-pangram`). His voice profile is
  `~/.config/csarko-sh/voice.md`: outside the repo, never committed.
- **Ship a change:** `.agents/skills/deploy/scripts/deploy.sh`. It verifies the
  deployed home page, `/apps`, `/film`, `/games`, `/research` and newest doc byte-for-byte on both
  the web.app URL and csarko.sh. `--preview` gives a 7-day shareable channel
  instead.
- **Change infrastructure:** `terraform -chdir=_infra plan`, then `apply`. Never
  hand-edit the resources Terraform owns.

**Every change is also a quality change.** The standing targets are Lighthouse
100/100/100 with Performance ≥ 95, Mozilla Observatory A+, and a layout that
holds from 320px to 1440px. Preview runs `site-quality`'s checks, deploy refuses
to publish if they fail, and that skill's checklist covers what the script
can't. Adding any script or third-party service (analytics included) has its
own procedure there. Read each skill's `SKILL.md` before using it.

## Where to look: measuring the site

Three sources, each for a different question. **Pick by the question, not by habit.**

| Question | Source | Where |
|---|---|---|
| Who's visiting? How many visits, which pages, where from (referrers), countries, devices, browsers? Which broken links do people hit (404 paths)? | **The admin dashboard**, with BigQuery behind it *(moved from GoatCounter, 2026-10-15)* | https://admin.csarko.sh/csarko.sh/ |
| How does the site do in **Google Search**? Queries people search, impressions, clicks, CTR, average position; whether pages are **indexed**; sitemap status; URL removals; structured-data and page-experience reports | **Google Search Console** | the `general:search-console` skill (`gsc.py index \| sitemap \| perf`) for indexing, sitemap and performance; the rest at https://search.google.com/search-console?resource_id=sc-domain%3Acsarko.sh (Domain property `csarko.sh`) |
| Is the site fast, accessible, SEO-correct and locked down right now? (lab measurements, not visitors) | **`site-quality` checks** | `.agents/skills/site-quality/scripts/check.py --live --lighthouse --observatory` |

- **"Traffic", "visitors", "views", "where are people coming from"** → the admin dashboard.
  **"Google", "ranking", "search results", "indexed", "impressions", "why doesn't my site show up"** → Search Console.
  A referrer of `google.com` in the dashboard tells you a visit came from search;
  *which query* it came from is only in Search Console.
- **Search Console is connected to agents.** The shared
  `general:search-console` skill (in
  [`csarkosh/skills-general`](https://github.com/csarkosh/skills-general), so
  change it there, not here) reads indexing, sitemap and performance data
  through the API with a read-only service account key at
  `~/.config/csarko-sh/gsc-sa.json` (override with `$GSC_SA_KEY`): **outside the
  repo, never committed**. The service account is
  `gsc-reader@csarko-sh.iam.gserviceaccount.com`, a Full user on the property. If
  the key or the grant is missing, `gsc.py` prints the setup steps. Anything
  the API doesn't expose (the aggregate Page Indexing report, Links, Manual
  actions, Removals, Crawl stats, and the "Request indexing" button) is still
  Cyrus opening the dashboard.
- **Visit data is readable by agents too** *(2026-10-15)*: BigQuery answers from the
  command line, `bq query --project_id=csarko-sh` over `csarko_visits._AllLogs` (the
  collector's rows) and `csarko_history.goatcounter_history` (the old hourly counts).
  The SQL the dashboard runs is in `admin/api/queries/`; start from it rather than
  guessing column names. It needs Cyrus's `gcloud` login; **never commit a key.**
- **Expect small numbers and lag.** It's a personal site. Search Console's
  reports run 2–3 days behind and show nothing for queries with very low volume.
  Its Core Web Vitals report needs real-user traffic volume the site may never
  reach; use the `site-quality` Lighthouse run for performance instead.

**Search Console state as of 2026-09-23** (check these before re-doing any of
them; `general:search-console`'s `gsc.py sitemap` and `gsc.py index` answer the first
three from the command line):
- Domain property verified through the apex TXT `google-site-verification=…` in
  `_infra/main.tf`. Removing that value un-verifies the property.
- Sitemap `https://csarko.sh/sitemap.xml` is **fetched**: last downloaded
  2026-09-22 UTC (the API reports UTC, so it reads a day ahead of an evening
  Eastern session), 0 errors, 0 warnings, and the copy Google holds lists all 16
  live URLs, so it needs no resubmit. `gsc.py sitemap --resubmit` asks for
  a refetch (the only write the skill makes, and the only way to hurry one);
  Google still refetches on its own schedule, usually within a day or two.
- **Indexed:** `/`, `/film`, `/games`, `/research`,
  `/research/stylized-shader-looks` and `/research/babylon-material-plugin-traps`.
  Not yet: the other ten `/research/<slug>` docs. Of those, six still have their
  old `/docs/<slug>` URL indexed, so they stay findable through the redirect
  while Google moves them over. `/research/browser-coop-netcode` and
  `/research/ai-short-film-generation` were crawled and passed over ("Crawled,
  currently not indexed"): that is Google's call, not a fault on the page.
- **Request indexing clicked, 2026-09-23, on all ten unindexed docs.** Don't
  click them again: a second click on the same URL buys nothing. Check back with
  `gsc.py index` in a few days, and spend future clicks on new docs only.
- **Docs moved to `/research`, 2026-09-17.** `/docs` and every `/docs/<slug>`
  301 to `/research` and `/research/<slug>` (`firebase.json` `redirects`), and
  the sitemap lists only the new URLs. Google transfers the old URLs' indexing
  to the new ones as it recrawls the redirects; expect both to show in reports
  for a few weeks.
- A Domain property covers **every host** under `csarko.sh`, so search reports
  still carry rows for the retired subdomains and the old React site's
  `/contact` and `/projects`.
- Temporary removals submitted for the retired subdomains `readme-viewer`,
  `babylonjs-fps-demo`, `shooter`, `fps`, `webgl` (all `*.csarko.sh`, "remove
  all URLs with this prefix"). They lapse around 2027-03. They shouldn't need
  renewing, since those hosts no longer resolve.
- After a meaningful content change or a new doc, use URL Inspection → Request
  indexing for the changed URLs (`https://csarko.sh/`, `https://csarko.sh/research`,
  `https://csarko.sh/research/<slug>`).

## Content rules (Cyrus's standing preferences)

- **No email address or phone number anywhere on the page.** He doesn't want
  spam. Contact goes through LinkedIn (the primary button), GitHub, Substack and
  YouTube (*the YouTube chip was added with the `/film` page, 2026-09-17*).
  `deploy.sh` enforces this and refuses to publish otherwise.
- **Dark and light themes, chosen by the visitor's system setting, no toggle**
  *(Cyrus, 2026-09-14; it was dark-only before)*. Dark is the default. The light
  theme keeps the same scheme: cool slate neutrals and the teal accent. See
  "Theme tokens".
- **Facts come from his résumé.** The canonical source is
  `~/Documents/Resume/resume_build.docx`; decisions and confirmed numbers are in
  `~/Documents/Resume/AGENTS.md`. Don't introduce a number or claim that isn't
  there. In particular: GEM is not profitable; titles are "Senior Software
  Engineer" (he was the *de facto* lead — say "engineering lead" in prose, never
  "Tech Lead" as a title); Voice AI was sunset, so never imply it's still running.
- **Frame him as a lead**, not a supporting engineer.
- **Pitch: an engineering lead on distributed systems and AI products** *(Cyrus,
  2026-10-08, to match his résumé and interview targets: senior or Staff IC with
  engineering-lead scope, NYC; see `~/Documents/InterviewPrep/AGENTS.md`)*. The
  title stays "Senior Software Engineer" (eyebrow, `<title>`, JSON-LD
  `jobTitle`); the prose opens "Engineering lead with 9+ years…", as the résumé's
  summary does. The hero names the production LLM pipelines with evals and the AI
  agents adopted team-wide, and puts generative AI for film and games "on the
  side". The search description, share card, `og`/`twitter` descriptions, JSON-LD
  `description` and the doc pages' "Written by" bio all lead with distributed
  systems and AI products. **None of them names DoorDash** *(Cyrus, 2026-10-08:
  he doesn't want his name tied so tightly to DoorDash; visitors see it in the
  Experience list and on LinkedIn)*. Before 2026-10-08 the hero and metadata said
  he was "the founding engineer and lead on several zero-to-one products at
  DoorDash", then briefly that he was exploring generative AI for film production
  and game development; the film-and-games clause is the side note now, not the
  pitch.
- **The Experience section stays high-level** *(Cyrus, 2026-09-11)*: for each role, a
  short description of the product and his general role on it, plus tech tags.
  **No metrics, customer names, or accomplishment bullets** (ARR, merchant counts,
  call volumes, ~20x, McDonald's, Unilever…). Those details live in the résumé only.
  GEM's and Voice AI's lines name the work a Staff loop asks about (the LLM
  pipeline and its evals, the AI agents, the pivot to AI) without numbers
  *(2026-10-08)*.
- **The hero tiles are a "Now" snapshot**, deliberately about him rather than
  DoorDash metrics: **Leading / Working / Building / Filming** *(2026-10-08:
  "Leading" added first: "Zero-to-one AI products, hands-on from the first
  prototype to launch, 100x scale, and beyond" (his wording; the "100x" is
  GEM's growth from prototype in merchants, review volume, AI replies and traffic,
  confirmed 2026-10-09 and on the résumé). Keep it hands-on: a version listing design
  docs, design reviews and SLOs read as if he did no development work; the "Based in" tile was dropped since the eyebrow already says
  New York)*. An earlier "What I care about" version was tried and replaced. The
  Filming tile was **Writing** (csarko.log on Substack) until 2026-09-20, when Cyrus
  asked for it to highlight his YouTube channel instead: it links `@csarkosh` to
  https://www.youtube.com/@csarkosh. Substack is still a hero and Contact chip.
- **No em-dashes in page copy**; commas, colons, semicolons.
- **The home page's sections** *(Cyrus, 2026-10-08)*: `01 / Experience` (`#work`),
  `02 / Education` (`#education`, the University of Washington card, "Where I
  studied") and `03 / Contact`; the nav's heading links are `Work · Education ·
  Contact`. **The Notes section was dropped too** *(Cyrus, 2026-10-09)*: the
  research docs are reached through the nav's `Research` link, and the home page
  no longer lists any (its `generated:docs` block and `homeSection()` are gone).
  **The Projects and Skills sections were dropped** on 2026-10-08 at his request: Projects (Day Hike, `game-dayhike`,
  `electron-gamepatch` and the `csarko.sh` card) is covered by `/games` and the
  hero's Building tile, and Skills by the Experience section's tech tags. Don't
  bring any of the three back unasked. If a card about the code ever returns: `game-dayhike`
  is **GPL-3.0** *(licence added 2026-10-13 at Cyrus's request; it had none before, and was
  a "Public repo" rather than "Open source" until then)*, and **the asset pipeline is being
  commercialized**: it is not in that repo and is never described as open source or as part
  of it. The public list of the games is **`/games`** (nav: `Games`), built
  from `docs/games/*.md`, one file per game.
- **The blog is "csarko.log"** at `https://csarko.substack.com/`. It has no
  published posts yet; Cyrus will publish once Day Hike is ready to publicize.
  Posts that introduce the research docs go through the `substack-post` skill
  *(added 2026-09-23)* and are logged in `docs/substack/posts.json`.
- **Docs** *(added 2026-09-15)*: research notes and specs at `/research`
  (*moved from `/docs`, 2026-09-17; the old URLs 301 to the new ones*; the nav
  calls the page `Research`; the page's own H1 is "Research & notes" and its eyebrow
  "Research", *renamed from "Research & docs" / "Docs", 2026-09-16; the eyebrow
  was briefly "Notes"*. Only the URL moved: the sources stay in `docs/published/`
  and the code still calls them docs; the home page has no section for them
  since 2026-10-09), copied
  into `docs/published/` as `<YYYY-MM-DD>-<slug>.md` (the published copy is the
  source of truth; the URL is the slug, without the date). The page copy rules
  apply (no email, phone or em-dashes): the build rejects em-dashes in
  `docs/published/`, `docs/games/` and `docs/films/` alike, and `deploy.sh` rejects email
  addresses and phone numbers (its scan covers `public/*.html`, `public/research/*.html`,
  `public/games/*.html`, `public/film/*.html`, `docs/published/*.md`, `docs/games/*.md`
  and `docs/films/*.md`). Docs
  from private repositories such as `magicpixel.ai` need Cyrus's OK per doc, and
  never describe the commercial asset pipeline. Launched with
  `stylized-shader-looks`, from `game-dayhike`. **Every doc carries `categories:`**
  *(Cyrus, 2026-10-13)*: one to three of the fixed set in `docs_lib.mjs`
  (`CATEGORIES`: Distributed systems, AI, Rendering, Worlds and terrain, Game design,
  Film, Tooling), which are the filter chips above the list on `/research` (multi-select,
  OR across chips, "All" a reset button, no script: the list filters through CSS
  `:has()`) and the tags on each card. The build refuses a doc without them or with a
  name outside the set; the `publish-doc` skill says which to give a doc.
- **Film** *(added 2026-09-17)*: short films at **`/film`** (nav: `Film`, second
  among the page links after `Apps` since 2026-10-15, and the first link to collapse when the bar
  narrows to below 360px, the first page link to go (Cyrus: it has little to show yet; the home
  page's section links still go before it, at 640px); no heading link, since the home page
  has no film section; the page's H1 is "Short films on YouTube",
  its eyebrow "Film"), built from `docs/films/*.md`, one file per film. Each card
  carries the film's poster, a `Short film · <runtime>` kicker, its title, its
  copy, tags, and a "Watch on YouTube"
  link out to the video (*the warning was added 2026-09-17: horror is the genre, so a viewer
  should know before clicking*). The poster leads on desktop, beside the text; **on a phone
  the kicker and title come first and the poster sits under them** *(Cyrus, 2026-09-19)*, since
  a thumbnail alone does not say which film it is. That reorder is CSS only (the body is
  `display: contents` inside the 640px media query in `docs_lib.mjs`, so the parts can be
  ordered around the poster), and the markup order stays poster-then-text. **One warning, on the page, not on the cards**
  *(Cyrus, 2026-09-17, revised the same day)*: the page carries a standing notice,
  "Contains horror imagery that some viewers may find disturbing.", under the lead
  and above the list, because every card is a link and a phone reaches one before
  it reaches the copy. It is bold and in the `--warning` yellow with an icon, and
  it is `FILM_NOTICE` in `docs_lib.mjs`. **A film has no `warning:` field**: the
  per-card warning was tried first, then dropped because the standing notice
  already covers the whole list, and the front matter key is now rejected outright
  rather than silently ignored. The page's JSON-LD lists each
  film as a `VideoObject`. **The home page carries no film section** *(one was
  tried on 2026-09-17 and removed the same day, at Cyrus's request; the home
  page's sections stayed `01`-`05` as they were)*: the nav's `Film` link is the
  only way in, as it is for `/games`. The films live on his YouTube channel
  **https://www.youtube.com/@csarkosh**, which the home page links from the hero
  chips, the Contact chips and the JSON-LD `sameAs`. **Posters are self-hosted**:
  the source frame is committed under the site-quality skill's `assets/films/`
  and `build_assets.py` emits the hashed AVIF/WebP/JPEG set, so the page still
  makes no third-party request. Launched with `who-is-standing-in-my-hallway`.
- **Breadcrumbs** *(added 2026-09-15)*: every generated page carries a trail
  under the nav (`Home › Research › <title>` on a doc, `Home › Research` on
  `/research`, `Home › Apps` on `/apps`, `Home › Games` on `/games`, `Home › Film` on `/film`; an app's page on
  apps.csarko.sh carries `Home › Apps › <app>`, every link absolute); the home page and `404.html` carry none.
  A doc page's eyebrow is therefore the date alone, not `Research · <date>`. The
  trail and the page's `BreadcrumbList` JSON-LD are one array in `docs_lib.mjs`
  and `check.py` fails the build if they drift apart; see `site-quality`,
  "One trail, two places".

## Admin pages (standing rule, Cyrus 2026-10-12)

**Everything under `admin/` is a csarko.sh page: styled like https://csarko.sh and
held to the same requirements, except SEO and search indexing.** When you touch
anything related to the admin pages in this repo:

- **Same look.** The site's theme tokens (both blocks, copied at build time from
  `public/index.html` by `admin/build.mjs`, never retyped), Inter and JetBrains Mono
  self-hosted from the same hashed font files, the 1120px `.wrap` and the nav bar
  shape, dark and light by system setting with no toggle. A new colour is a token in
  both blocks, 4.5:1 on its surface in both themes. No em-dashes, no email address or
  phone number.
- **One chrome, every page** *(Cyrus, 2026-10-13)*. The nav holds the wordmark and, at
  the right, the account: a round profile button whose menu is the Live or Sample badge,
  the signed-in email and Sign out (`auth.js`, `accountMenu`; the shell renders it, every
  page calls it). It carries no app links: the trail under the nav, `Admin › <app>` in the
  research page's style (`.crumbs`), is the way back to the index, which carries none. An
  app's page (Day Hike's, built in its own repo) wears the same markup, nav, trail and page
  head included, with a `generated:head` block that `admin/build.mjs` fills after
  `admin/deploy.sh` has pulled the bundle. The old aside under the page head is gone.
- **Never blank** *(Cyrus, 2026-10-13)*. Every card is on the page at once as a skeleton
  the shape of what it waits for (`charts.js`, `skeleton()` and `loading()`: tiles, a
  chart, lines, in the surface's greys with a slow sweep, still under reduced motion),
  fills on its own as its queries answer, and shows its own error line in place; no page
  waits for its slowest card, and no error replaces the whole page.
- **Same bar.** Lighthouse 100 on Accessibility and Best Practices, Performance ≥ 95,
  a layout that holds from 320px to 1440px, a strict CSP and the same security
  headers. No third-party script, with one documented exception: Google's sign-in
  (`https://apis.google.com` in `script-src`, Identity Toolkit and Secure Token in
  `connect-src`, `frame-src 'self'` for the auth iframe); the Firebase Auth SDK itself
  is bundled and self-hosted (`admin/public/vendor/`). The only other cross-origin
  requests are to the app APIs listed in `admin/public/apps.json`.
- **Not a target.** Indexing: the pages carry `noindex, nofollow`, `admin/public/robots.txt`
  disallows everything, there is no sitemap entry, JSON-LD, Open Graph card or canonical,
  and the Lighthouse SEO score is ignored. `check.py --admin` runs the checks that
  apply; `admin/deploy.sh` refuses to publish if they fail.
- **Access** is Google sign-in through Firebase Auth on project `csarko-sh`, served from
  `admin.csarko.sh` itself, with an email allowlist (`admin_emails` in the git-ignored
  `_infra/terraform.tfvars`, the `ADMIN_EMAILS` env on every app API). Every app API
  verifies the ID token (issuer `https://securetoken.google.com/csarko-sh`, audience
  `csarko-sh`, `email_verified`) and the allowlist; no list, no admin routes. The sign-in
  is the one documented exception to "no third-party request": the popup flow talks to
  Google's Identity Toolkit, and the CSP allows exactly that. An app is tracked by one
  entry in `apps.json` and two routes on its API, `GET /admin/kpis` and
  `GET /admin/query/<name>?days=N` (the contract is `admin/CONTRACT.md`). GitHub metrics
  cover **every public, non-fork repository of the account** (`GITHUB_OWNER`, found by
  listing it, which can only name public ones; *all of them rather than a fixed list,
  Cyrus 2026-10-13*), never a private one.
- **The slow sources run once a day, never on a request** *(2026-10-13, after the index
  card took 29 to 60 s)*: a Search Console URL inspection is 5 to 7 s a URL and a
  PageSpeed run longer, so the daily snapshot inspects the sitemap and runs Lighthouse
  and stores both; `health` and `search` read the snapshot and inspect live only before
  the first one exists. Every other collector answers in under a second and is cached
  five minutes. Day Hike's BigQuery queries cost about a second each of fixed job
  overhead, in parallel.
- **No cookies anywhere**: Firebase Auth keeps its session in IndexedDB.
  Screenshots in both themes (`admin/preview.sh --shots`) are looked at before a visual
  change is called done.

## Analytics: how lib-visits is wired in

*(2026-10-15, after GoatCounter's outage that day; this is the end state, and the
cutover deploy is the step that makes it live. GoatCounter, set up 2026-09-11, was
dropped because its host went down and took the numbers with it.)*

- **[lib-visits](https://github.com/csarkosh/lib-visits)** (private, GPL-3.0-only, tag
  `v0.1.0`) is Cyrus's own analytics: two small scripts and a collector. No cookies,
  so no consent banner. The only storage is the visitor's own `#visits-off` opt-out.
- **Configured in one place:** `.agents/skills/site-quality/site.json`
  (`analytics.provider` is `visits`, `endpoint` is `/v`). `generate-assets.sh` derives the
  two `<script>` tags on every page, the CSP (`script-src 'self'`, `connect-src 'self'`,
  `img-src 'self'`: no third-party origin at all) and `check.py`'s allowlist from it.
  Don't edit any of those by hand. Set `provider` to `null` and both scripts and every
  event go away together.
- **The scripts are vendored unmodified** at
  `.agents/skills/site-quality/assets/vendor/visits.min.js` (3,068 B) and `vitals.min.js`
  (995 B), each with a provenance line (tag, licence, sha256) that `strip_comments` drops
  before hashing, so the served, content-hashed file is byte-identical to the tag's.
  The vendoring command:

  ```bash
  LIB=~/Projects/lib-visits; git -C "$LIB" checkout -q v0.1.0
  for f in visits vitals; do
    { printf '// lib-visits v0.1.0 (GPL-3.0-only), client/dist/%s.min.js, sha256 %s\n' "$f" "$(shasum -a 256 "$LIB/client/dist/$f.min.js" | cut -c1-64)"; cat "$LIB/client/dist/$f.min.js"; } > .agents/skills/site-quality/assets/vendor/$f.min.js
  done
  git -C "$LIB" checkout -q main
  ```

  To bump the client, repeat this with the new tag, run `generate-assets.sh`, and commit
  the vendored files, the hashed assets and the pages together; `check.py` refuses a page
  whose hash is not the vendored file's.
- **The beacon is same-origin.** `firebase.json` rewrites `/v` to the Cloud Run service
  `csarko-visits` (`us-west1`), so there is no CORS, no preflight and no new origin in the
  CSP. `.agents/skills/site-quality/tests/firebase.test.mjs` pins the rewrite and fails if a
  file in `public/` would shadow `/v`. The service is Terraform's
  (`_infra/modules/gcp-visits`); the image is built from the lib-visits tag by
  `visits/deploy.sh`.
- **Where the rows go:** the collector logs one row an event to the log bucket
  `csarko-visits`, with Log Analytics on, linked as the BigQuery dataset `csarko_visits`
  (query `csarko_visits._AllLogs`). GoatCounter's history was backfilled to
  `csarko_history.goatcounter_history`; the admin dashboard reads both, joined at the
  cutover instant.
- `localhost` and `file://` previews are never counted. The 404 page counts too (the
  path shows the broken link).
- **Events** *(unchanged from 2026-10-12, when they were added for the admin dashboard)*:
  clicks out to LinkedIn, GitHub, Substack and YouTube count as `out-linkedin`,
  `out-github`, `out-substack`, `out-youtube` (hero chips, Contact buttons and the Filming
  tile's link in `index.html`); the nav's page links count `nav-film`, `nav-games`,
  `nav-research` in both navs (never on the page you are on); a game card's "Play in your
  browser" counts `play-<slug>` and a film card's "Watch on YouTube" counts `watch-<slug>`
  (`docs_lib.mjs`). All are `data-visits-event` attributes. `read-<slug>` needs no script of
  ours any more: it is derived from lib-visits' `leave.re` (the reader reached the end of a
  doc). **Event names are stable identifiers, not copy:** renaming a button or a URL must
  not rename its series. A doc page now carries about 4,063 B of the 10,000 B script
  budget. Campaign tags on links Cyrus posts (`?ref=substack`, `?ref=linkedin`) are
  recorded as the page's query; the site does nothing for them.

## Theme tokens

Defined as CSS custom properties at the top of `index.html`: the dark values on
`:root`, the light overrides in `@media (prefers-color-scheme: light)`. Cyrus uses
the dark ones to match his Substack theme, so keep them stable or tell him when
they change. Docs pages copy both token blocks out of `index.html` at build time,
so after changing a token run `generate-assets.sh` (`check.py` fails until you
do).

| Token | Dark (default) | Light |
|---|---|---|
| `--accent` | `#7dd3c0` | `#0a735f` |
| `--accent-hover` / `--on-accent` | `#95e0cf` / `#06231d` | `#075a4a` / `#ffffff` |
| `--bg` | `#0a0b0e` | `#f6f7f9` |
| `--surface` / `--surface-2` | `#111318` / `#161922` | `#ffffff` / `#eef0f4` |
| `--text` / `--muted` / `--faint` | `#e8eaf0` / `#a0a8b8` / `#7d8597` | `#12151c` / `#4a5263` / `#5f677a` |
| `--warning` | `#f5c451` | `#8a6100` | 

The light accent is a deep version of the mint (same hue, ~167°), because the
mint itself is unreadable on white; the mint still shows up in light mode as the
background glow and the featured card's tint. **Every color on the page is a
token** (borders, glows, the nav's glass, shadows too), so a new color needs a
value in both blocks; `check.py` fails on a hardcoded color, a token the light
block misses, or text under 4.5:1 in either theme. `404.html` carries a subset
of the same tokens.

`--faint` is the dimmest text that clears WCAG 4.5:1 on every surface in its
theme (dark was `#6e7688`, which failed). Fonts: Inter (text) and JetBrains Mono (labels,
tags), **self-hosted** from `public/assets/` — not Google Fonts, whose stylesheet
blocked the first paint. The og-image and favicons stay dark in both themes; if a
dark token changes, regenerate them
(`.agents/skills/site-quality/scripts/generate-assets.sh`).

## Infrastructure

- **Hosting:** Firebase Hosting site `csarko-sh` in GCP project **`csarko-sh`**
  (billing: Main Billing). Default URL `https://csarko-sh.web.app`.
- **DNS:** Route53 zone `csarko.sh` (`Z905ENUNE0H3I`, AWS account `705624689046`).
  **The zone is not Terraform-managed, and neither is most of what's in it.**
  This repo's state owns exactly three record sets: the apex **A**
  (`199.36.158.100`), the apex **TXT** (`hosting-site=csarko-sh` plus the Google
  Search Console `google-site-verification=…` token — never remove it), and the
  **`www` CNAME** → `csarko-sh.web.app`, which Firebase serves as a 301 to
  `https://csarko.sh` (`redirect_domain_names` in `_infra/variables.tf`). Everything
  else there belongs to someone else — the apex **MX records are Google Workspace
  mail** (never touch them) and `games`/`game` belong to `~/Projects/game-dayhike/_infra`.
  As of 2026-09-11 that is the whole zone — every older project subdomain was
  taken down (see History).
- **Apex TXT is one record set.** If another apex TXT value is ever needed (SPF,
  a verification token), add it to the `txt_records` list in `_infra/main.tf`
  rather than creating a second record set.
- **State:** GCS bucket `gs://csarko-sh-tfstate`, prefix `csarko-sh`, versioned.
  Created by hand with the project; not managed by Terraform (see the comment in
  `_infra/main.tf`).
- **`hosting_required_dns_updates` goes empty once the domain is healthy.** That's
  success, not breakage. `hosting_custom_domain_state` should read
  `HOST_ACTIVE` / `OWNERSHIP_ACTIVE` / `CERT_ACTIVE`.
- **Stale state lock after an interrupted apply:** the GCS backend's lock ID for
  `terraform force-unlock` is the lock object's *generation number*
  (`gcloud storage objects describe gs://csarko-sh-tfstate/csarko-sh/default.tflock
  --format='value(generation)'`), not the UUID in the error. Confirm no
  `terraform` process is running first, and `terraform import` anything the
  interrupted run created but didn't record.
- **Targeted applies don't write root outputs.** If `deploy.sh` says an output is
  missing after a `-target` apply, run `terraform -chdir=_infra apply -refresh-only`.

## History

- **2020 – 2026-09-10:** a React app deployed by GitHub Actions to AWS (S3 bucket
  `csarko.sh` behind CloudFront, ACM certificate, Terraform state in the S3 bucket
  `sh.csarko.terraform` under `portfolio-site.csarko.sh/`).
- **2026-09-11:** replaced with this static page on Firebase Hosting. All old
  files were deleted except `LICENSE`; the README was rewritten.
  - **Cutover** was a single Route53 UPSERT of the apex A record (CloudFront alias
    → `199.36.158.100`) at ~02:00 ET, after the certificate had been pre-issued
    through a temporary `_acme-challenge.csarko.sh` TXT record (hand-made, not in
    Terraform) so HTTPS worked from the first request. Verified: all public
    resolvers, byte-identical `index.html`, valid Google Trust Services cert.
  - **Deleted, with Cyrus's approval:** CloudFront distribution `E2CFFDQ06WHKKO`,
    S3 bucket `csarko.sh`, and the state object
    `s3://sh.csarko.terraform/portfolio-site.csarko.sh/terraform.tfstate` (that
    bucket is versioned, so prior versions remain recoverable).
  - **Old project subdomains taken down the same day, at Cyrus's request:**
    `fps`, `webgl`, `babylonjs-fps-demo`, `readme-viewer` and `shooter`. Deleted:
    their DNS records, CloudFront distributions `E33WBFXY6RAK4C`,
    `E3KV21DE1QR0RU`, `E6PTH8ZUPZHU0`, their S3 buckets, readme-viewer's backend
    (API Gateway `lyqvmoqvd6` + custom domain, Lambdas `readme-viewer` and
    `cache-gh-data`, the weekly EventBridge rule, two IAM roles, the
    `readme-viewer.csarko.sh-lambdas2` and `csarko.sh-lambdas` code buckets), the
    wildcard `*.csarko.sh` ACM certificate and its validation CNAME, an expired
    2021 certificate, the 2019 `csarko-website` and `inject-headers` Lambdas and
    their log groups, the `html5-multiplayer-shooter-ec2-sg` security group, and
    the `shooter`, `webgl` and `webrtc` state objects.
  - **Kept:** `s3://sh.csarko.terraform/csarko.sh/terraform.tfstate`. It is stale
    (most of what it lists is gone) but it also claims the **Route53 zone and the
    apex MX records**. Never run Terraform against it — a destroy would take out
    the zone and mail. There is no longer any AWS CloudFront, ACM, API Gateway or
    Lambda for csarko.sh; the zone itself is the only csarko.sh resource left on
    AWS.
