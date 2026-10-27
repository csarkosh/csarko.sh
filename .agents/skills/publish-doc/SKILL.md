---
name: publish-doc
description: >-
  Publish a Markdown research doc or spec to csarko.sh/research. Use whenever the
  user wants to publish, post, add or put a doc, research note, write-up or
  spec on the site ("publish this doc to my site", "add the shader research to
  csarko.sh/research"), or update or remove a published doc. Not for previewing a
  doc privately (that's general:doc-preview) or for turning docs into a Substack
  post (that's substack-post).
---

# Publish a doc to csarko.sh/research

Docs are Markdown files in `docs/published/<YYYY-MM-DD>-<slug>.md`, dated so the
directory reads in publication order. `generate-assets.sh` turns them into
`https://csarko.sh/research/<slug>`, the `/research` index and the sitemap (the home
page lists no docs; the nav's `Research` link is the way in). **The URL is the slug alone**: the date prefix
belongs to the file name and never appears in a link. The design is in
`docs/superpowers/specs/2026-09-15-docs-section-design.md`.

**A game is not a doc.** It goes in `docs/games/<slug>.md`, the slug alone with
no date prefix, with front matter `description` (70–160 characters), `status`
(`playable` or `in-development`, which becomes the kicker line), `tags` (1 to 5,
comma-separated), and optional `play`, `repo` and `released` (`YYYY-MM-DD`). The
H1 is the game's name and the body is its card copy. The same
`generate-assets.sh` run builds both directories, with the same refusals
(em-dashes, images, links that aren't `https://`, `#anchor` or root-relative),
and the games land on `/games`.

**A film is not a doc either.** It goes in `docs/films/<slug>.md`, the slug alone
with no date prefix, with front matter `description` (70–160 characters), `watch`
(the `youtube.com/shorts/<id>` or `youtube.com/watch?v=<id>` URL), `released`
(`YYYY-MM-DD`), `runtime` (`m:ss`), `alt` (what the poster shows, for screen
readers), `tags` (1 to 5, comma-separated) and an optional `warning`, one
sentence shown on the card above the watch link (horror films get one). The H1 is the film's title and the
body is its card copy. Its poster is a portrait (9:16) JPEG committed at
`.agents/skills/site-quality/assets/films/<slug>.jpg`, which the same
`generate-assets.sh` run turns into the hashed responsive images; without it the
card falls back to a plain `<img>`. Films land on `/film` only; the home page
has no film section.

**The csarko.sh repository is public on GitHub. Committing a file under
`docs/published/` publishes it, before any deploy.** Do the review first.
(`docs/superpowers/` is the other half of `docs/`, and is never published.)

## 1. Review the source before copying anything

Read the whole doc. Stop and ask Cyrus if any of these apply:

- It comes from a **private** repository (check with
  `gh repo view csarkosh/<repo> --json visibility`). Private docs, such as
  `magicpixel.ai`'s, need his explicit OK for that specific doc.
- It describes the **commercial asset pipeline**, unreleased product plans,
  customer names, pricing agreements, credentials, or internal URLs.
- It contains an email address or phone number (never allowed on the site).

## 2. Copy it in with front matter

Name the file `docs/published/<YYYY-MM-DD>-<slug>.md`:

- The **date prefix** is the doc's `published:` date. The build fails if the two
  disagree, so change both or neither. A revision sets `updated:` and leaves the
  file name's date alone.
- The **slug** is lowercase letters, digits and hyphens, and carries no date of
  its own. It alone is the URL: `2026-09-14-stylized-shader-looks.md` is served
  at `/research/stylized-shader-looks`. Renaming it moves a live URL, so only do that
  on purpose.

```markdown
---
description: <70–160 characters: what a searcher learns from this doc>
published: <YYYY-MM-DD, the doc's original date>
categories: <one to three of the list below, comma-separated, spelled exactly>
updated: <YYYY-MM-DD, only when revising a published doc>
featured: <1, 2, 3…, only for a doc in /research's Start here row>
series: <the run of docs it belongs to, only if it has one; see "Series and Keep reading">
related: <2 to 4 doc slugs for its Keep reading block, only to hand-pick them>
source: <https://github.com/… URL of the original, only if that repo is public>
---
# <Title>
```

The build refuses: em-dashes (use commas, colons or semicolons), an image that is
not a figure (below), links that aren't `https://`, `#anchor` or `/root-relative`,
skipped heading levels, and more than one `# ` title. Fix the copy, not the build.
Number `## ` sections (`## 1. Outlines`) when the doc is a list of approaches; the
number shows as a label.

## Write for the skim

*(2026-10-23, from the site's own visit data and published reading research: NN/g's
eyetracking and scanning studies, Chartbeat's engaged-time data, Wikipedia's link and
preview tests.)* Real visitors
spend a median of about 16 seconds on a doc; most flick to the end without reading, and
Google visitors decide from the first screen. The first two screens get about 74% of all
viewing time (NN/g). So a doc is written to pay off a 15 to 120 second skim, and every
fact still stays on the page: nothing is gated, collapsed or cut to make it shorter.

What the page does by itself: the `description` shows under the title (so write it as
the doc's one-line result, not a topic), an "In this doc" list follows the opening, a
Keep reading block (its series, related docs, Play Day Hike when the text names the
game, the feed) comes before Sources and a Read next link after the author box, and the
read time counts the words before Sources. What the doc has to do:

1. **Open with the answer.** `**Question:**` in at most three sentences, then
   `**Short answer:**`, a verdict of 2 to 4 sentences that says the finding plainly. A
   searcher who never heard of Day Hike should get the answer before Day Hike comes up.
2. **Then the figure**, if the doc has one (below): one real result in the first two
   screens.
3. **Then `**In numbers:**`** (or `**In short:**`): 3 to 6 bullets, each opening with a
   **bold** number or fact from the body and ending with a link to the section that proves
   it, `([section 2](#heading-id))`. No other summary section: no "answer in five lines".
4. **Headings say the finding.** A scanner reads about the first two words of a heading,
   so lead with the result, the number or the technique's name: "Device loss under GPU
   saturation", not "Gotchas"; "1.3 to 1.5 ms per frame, and where it comes from", not
   "Results". The contents list is built from them, so together they read as the argument.
5. **Define the jargon in place.** `[froxel](#term "A frustum voxel: one cell of …")`
   draws the word as a button whose definition opens on a tap (a popover, no script; the
   definition is in the HTML, so it is public and searchable). One to three in the
   opening, where a newcomer meets them.
6. **Callouts stay visible.** A `>` blockquote whose first words are bold
   (`> **Takeaway:** …`) draws as a boxed callout with that label. Never put core content
   in anything collapsed.
7. **Citations stay in the body.** References are numbered by first citation, so no `[n]`
   in the opening, a caption or a definition: one cited earlier than its number breaks the
   build.

## Date the present

*(Cyrus, 2026-10-23: "I don't want to keep going back and using outdated wording.")* A doc
describes a moving target: Day Hike changes weekly, and so do models, prices, browsers and
engines. So a doc never says "today", "now", "currently", "so far", "not yet" or "no longer" on
its own; it says when: **"as of <the doc's published date>"**, in the site's format, `as of Sep 29,
2026`. Then nothing in it goes stale; it was true on that date, and a reader can see the date.

- **Once per passage is enough.** A section that describes the game's state opens with
  "This section describes Day Hike as of Sep 29, 2026, when this survey was written; the game has
  changed since." and can then speak in the present tense. A lone sentence carries its own
  ("As of Sep 15, 2026, the restyle stays on WebGL2."). A table column says so in its header
  ("What was drawn as of Sep 29, 2026").
- **The date is the published date,** not the day you happen to edit: the doc reports what was
  true when it was written. A revision that adds a newer fact dates that fact with the revision's
  own date, `as of <updated>`, and leaves the older ones as they were.
- **A figure shot later says when.** A still taken after the doc was written gets its month in
  the caption ("As of October 2026, Day Hike draws …").
- **Not stale, just dated.** When the game moves on, the doc does not need rewording; it needs
  a new doc, or a dated addition, if the change matters.

The build enforces it for docs published from 2026-10-24 (`DATED_SINCE` in `docs_lib.mjs`): a
paragraph that says any of those words without "as of" fails the build. Quotes, code and Sources
are exempt. Older docs build as they are; when you revise one, date its present the same way.

## Figures

A doc may carry figures *(2026-10-23)*: a paragraph that is one image and nothing else,

```markdown
![What the picture shows, for a screen reader](fog.png "The point the picture makes, in one or two sentences.")
```

with the file at `.agents/skills/site-quality/assets/research/<slug>/fog.png` (PNG) or
`.svg`. Both the alt text and the caption are required; the caption states the point,
it does not just name the picture. `build_assets.py` turns a PNG into hashed AVIF, WebP
and JPEG at up to 1440px (and a 1200x630 JPEG cut from its middle, which becomes the doc's share card
when it is the first figure); an SVG is served as it is. The first figure loads at once,
the rest lazily. Prefer a real result over decoration: Day Hike's stills
(`~/Projects/game-dayhike/branding/previews/`, shot by its `npm run previews`), a chart
of the doc's own measurements, a diagram of the system it describes. A caption that says
how Day Hike draws something is checked against the game's source first. An SVG is
hand-written, without scripts or external references, sized by `viewBox` plus `width`
and `height`, with an inline `<style>` in the site's dark colours and a
`@media (prefers-color-scheme: light)` block for the light ones, and every number in it
from the doc.

## Series and Keep reading

`series: <Name>` *(2026-10-23)* puts a doc in a run of docs read in published order: the
title shows "Part 2 of 5 in <Name> · Next: …", and Keep reading lists every part. A
series needs two or more docs (the build refuses one of one); the name is 3 to 40
letters, digits, spaces or apostrophes, starting with a capital, spelled the same on
every doc. The series now: WebGPU against WebGL2; Rendering a browser forest; Filling the
distance; Day Hike's look; Olympic Peninsula field notes; Horror craft; AI short films;
Arkos IDE notes; Analytics without cookies; Day Hike netcode. A new doc joins one when
it continues that work, and a new series starts when a second doc would join it.

Keep reading also offers docs to read next: `related: slug-a, slug-b` hand-picks 2 to 4
(the build refuses a slug that is not a published doc), else the build picks the three
sharing the most categories, newest first (two, beside a series). Hand-pick when the
best next read is in another category.

Every link the page adds counts in the visits log, so the dashboard shows which ones are
followed: `toc` and `toc-rail` (the contents), `doc-<slug>` (a link in the text to
another doc), `series-<slug>`, `next-<slug>` (Keep reading), `end-<slug>` (Read next) and
`play-<game>`, plus `section-<n>` from `reading.js` when a section has been on screen for
5 seconds (n 0 is the opening).

### Categories

**Every doc carries one to three categories** *(Cyrus, 2026-10-13)*: they are the
filter chips on `/research` and the tags on the doc's card, so a reader can narrow
the list. The set is fixed, `CATEGORIES` in `docs_lib.mjs`, and the build refuses a
name outside it, an empty list, a repeat, or more than three. Pick by what the doc
is *about*, not what it was built with:

| Category | Give it to a doc about |
|---|---|
| `Distributed systems` | netcode, signalling, cloud services, data pipelines, anything about machines talking to each other |
| `AI` | generative models, LLM workflows, synthetic media; not a doc that merely used an agent to get written |
| `Rendering` | shaders, materials, GPU budgets, WebGPU and WebGL2, how something is drawn |
| `Worlds and terrain` | procedural generation, and the geology and ecology of the setting |
| `Game design` | pacing, dread, openings, how other games do a thing |
| `Film` | short films, cinematic technique, voice |
| `Tooling` | the engineering notes that are neither game nor film: Git, Electron, analytics, the writing workflow |

A doc that measures a rendering technique in a procedural world is `Rendering,
Worlds and terrain`; an AI film experiment is `AI, Film`. Adding a category is a
change to `CATEGORIES` (its chip and its filter rule follow) and a note here.

### Start here

`/research` opens with a **Start here** row *(Cyrus, 2026-10-18)*: his most read docs, plus one
or two that speak to his professional work (distributed systems, AI and evaluation), so a
visitor from LinkedIn or the home page meets the strongest work before the newest. A doc joins
it with `featured: <n>`, lowest first; two docs cannot share a number, and the build refuses
one that is not a whole number from 1. Keep it to about five. The row's cards still appear in the
full list below, which the chips filter alone. Featuring a doc is not a revision: leave
`updated` alone. Pick by the admin dashboard's What they read and Search cards, not by date,
and lead with docs that reward a short visit *(2026-10-23: ground fog and the AI horror short,
9 and 10 minutes, kept readers longest; a 26 or 79 minute doc is a poor first card)*.
*(2026-10-26, for Staff roles at AI companies: the row leads with the agent and infrastructure docs,
How Codex embeds its browser (9 min) first, then the two Arkos reboot and update docs, the netcode
doc and ground fog; the 40-minute telemetry doc stays out of the row.)*
Each card's click counts as `start-<slug>`.

To **update** a doc, edit its file and set `updated`. To **remove** one, delete
its file; the build deletes the page.

### Sources in IEEE style

**Every doc published on or after 2026-09-23 (`IEEE_SINCE` in `docs_lib.mjs`) cites
its sources in IEEE style.** If the doc has a `## Sources` section, the build refuses
anything else. Older docs keep their tables and bullet lists until they are converted.
`substack-post` converts each one before it goes into a post. A converted doc sets
`updated:` and is held to the same rules.

**In the text,** cite with a bare `[n]`:
- Put it inside the sentence, before the full stop: "…escapes it [1]."
- List several separately: `[1], [3]`. Don't use ranges like `[2]–[4]`: the build
  links each number, so a range would leave the middle ones uncited.
- A citation can be the subject: "as [2] shows".
- Never cite in a heading or inside link text; the build won't link one there.

The build turns each marker into a link to its entry. Code is left alone, so
`finalWorld[3]` in backticks stays text.

**In the list,** `## Sources` (or `## 8. Sources`) is the last section: a numbered
Markdown list, one entry per source. The build draws the `[n]` labels, so the source
starts `1. A. Author, …`, not `1. [1] …`.

The build refuses:
- entries not numbered 1, 2, 3… in order
- entries not numbered in the order they are first cited
- a citation with no entry
- an entry never cited
- an entry without `Accessed:` and `[Online]. Available: https://…`

Every entry is an online source and ends the same way. The templates:

```markdown
1. A. Author, "Page or doc title," Site or Publisher. Accessed: Sep. 23, 2026. [Online]. Available: https://…
2. A. Author, B. Author, and C. Author, "Paper title," *Journal Abbrev.*, vol. 12, no. 3, pp. 45-67, Mar. 2025. Accessed: Sep. 23, 2026. [Online]. Available: https://doi.org/…
3. A. Author and B. Author, "Paper title," arXiv:2510.14975, Oct. 2025. Accessed: Sep. 23, 2026. [Online]. Available: https://arxiv.org/abs/2510.14975
4. A. Author, "Talk title," presented at Game Developers Conf., San Francisco, CA, USA, Mar. 2015. Accessed: Sep. 23, 2026. [Online]. Available: https://www.gdcvault.com/…
5. Channel Name, "Video title," YouTube, Sep. 2, 2025. Accessed: Sep. 23, 2026. [Online]. Available: https://www.youtube.com/watch?v=…
6. Electron Authors, "electron," GitHub repository, v44.1.1. Accessed: Sep. 23, 2026. [Online]. Available: https://github.com/electron/electron
```

- **Authors:** initials and surname ("J. Ng"). List up to six, then write "et al." after the
  first. Use the organisation when there is no person ("Chromium Authors", "Google").
- **Titles:** in "quotes". Journal names are *italic* and abbreviated where IEEE has an
  abbreviation.
- **Dates:** months are abbreviated Jan., Feb., Mar., Apr., May, Jun., Jul., Aug., Sep.,
  Oct., Nov., Dec. The `Accessed:` date is when you checked the page.
- **Page ranges** use a hyphen (`pp. 45-67`); the site bans em-dashes.
- **Source code or files:** use the most specific URL you checked (a tagged file, not the
  repo root), and name the version in the title or after the site.

## 3. Build, check and look

```bash
.agents/skills/site-quality/scripts/generate-assets.sh
.agents/skills/preview/scripts/preview.sh --shots
```

Read `doc-desktop.png`, `doc-desktop-light.png`, `doc-mobile.png` and
`doc-mobile-light.png` (the newest doc; for an older one use
`preview.sh --serve` and open it), plus `desktop.png` for the home section.
Check the first two phone screens in particular: the title, the description, the
verdict and, if the doc has one, the figure should be there.
The desktop shots are 1440×4000, so a long doc's bottom is cut off in
`doc-desktop*.png`; use `preview.sh --serve` to check the end of a long doc.
`check.py` must pass. A title longer than 65 characters only warns.

## 4. Ship

Commit `docs/published/` and `public/` together, then use the **deploy** skill.
After it's live, remind Cyrus to open Search Console → URL Inspection and
request indexing for the new doc's URL and `https://csarko.sh/research`.
