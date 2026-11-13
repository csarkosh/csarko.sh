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
comma-separated), and optional `play`, `repo`, `released` (`YYYY-MM-DD`) and `blurb` (below). The
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

**A game, an app (`docs/apps/<slug>.md`) or a film that a doc names as its `project:` needs a
`blurb`** *(2026-11-13)*: the phrase that follows its name where a doc introduces it, 10 to 90
characters, lower case, no full stop, as in "Day Hike, a first-person co-op horror game that runs
in your browser". All six projects have one, and the build refuses a doc whose project has none.

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
project: <the game, app or film this research was done for: its slug in docs/games, docs/apps or docs/films, or none>
project-line: <20 to 240 characters, whole sentences, plain text: the product line, in place of the default; only with a project>
closing: <40 to 520 characters, whole sentences, plain text: the doc's last paragraph, under What next>
asks: <15 to 90 characters ending in "?", plain text: the question this doc answers, in a reader's words>
series: <the run of docs it belongs to, only if it has one; see "Series and What next">
related: <1 to 3 doc slugs for its What next section, only to hand-pick them; 2 on a doc with a next part in its series>
source: <https://github.com/… URL of the original, only if that repo is public>
watch: <youtube.com/watch?v=<id> or youtube.com/shorts/<id> URL, only for a doc about one video>
watch-title: <the video's name, up to 60 characters; required with watch>
---
# <Title>
```

**A doc about one video links it from its header** *(Cyrus, 2026-11-12, for The Well: the whole
doc was about that film and its only link was source [1] at the bottom)*: `watch` and `watch-title`
draw "Watch <watch-title> on YouTube" as the accent pill, under the title and the series line, so it
is on the first screen. Keep the video in Sources too; the pill is not a citation.

The build refuses: em-dashes (use commas, colons or semicolons), an image that is
not a figure (below), links that aren't `https://`, `#anchor` or `/root-relative`,
skipped heading levels, and more than one `# ` title. Fix the copy, not the build.
Number `## ` sections (`## 1. Outlines`) when the doc is a list of approaches; the
number shows as a label.

## Write for the skim

*(2026-10-23, from the site's own visit data and published reading research: NN/g's
eyetracking and scanning studies, Chartbeat's engaged-time data, Wikipedia's link and
preview tests. Revised 2026-11-13, Cyrus, after a four-week review of real visits and the
fact-checked report in `docs/superpowers/specs/2026-11-13-doc-reading-and-funnel-research.md`.)*
Real visitors spend a median of about 21.5 seconds on a doc; most flick to the end without
reading, 91% never open a second page, and half the readers an assistant sends are on
phones. The first two screens get about 74% of all viewing time (NN/g), and that is where a
visit is decided. So a doc is written to pay off a 15 to 120 second skim, then to hand the
reader who has the answer a reason to go on, and every fact still stays on the page:
nothing is gated, collapsed or cut to make it shorter.

What the page does by itself: the `description` shows under the title (so write it as
the doc's one-line result, not a topic); a doc in a series gets one line under it, "Part 2
of 5 in <Name>", with short Previous and Next links; the product line goes in after the
opening's last labelled paragraph ("The project a doc belongs to", below); an "In this doc"
list follows the opening on screens too narrow for the contents rail, which lists the same
sections; a What next section comes right under the last section and before Sources (the
doc's `closing` with its project's link, up to three next questions, its place in its
series, the feed); one line after the author box repeats the project's link, the next
question and All research; and the read time counts the words before Sources. There is no
Keep reading box, no card and no Play pill any more: a block that looks like a promotion
got 1 click in 172 page loads. What the doc has to do:

1. **Open with the answer, then say what it leaves open.** Three labelled paragraphs, in
   this order and spelled exactly so, since the page places the product line by them
   (each a paragraph of its own, the label in bold with its colon inside the bold; the
   build stops on a near miss such as `**Short Answer:**`, `**Short answer**:`, a label
   with no bold or a label in a list item, and names it):
   `**Question:**` in at most two sentences, in the reader's words. `**Short answer:**` in
   60 to 90 words, in plain words: shorter in words, never in content. Every part of the
   Question still gets its answer there and nothing is withheld; a searcher who never
   heard of Day Hike gets the answer before Day Hike comes up. Then
   `**What that leaves open:**` in two or three sentences: what the answer does not
   settle (the number that looks wrong, the approach that failed, the cost) and what the
   reader will be able to check by the end. Never a tease: it names the open thing
   outright, and it is the reason to read on that the Short answer alone does not give.
2. **Then the figure**, if the doc has one (below): one real result in the first two
   screens. The sentence before a figure says what to look for in it, and its caption
   states the claim the figure proves, not the picture's name.
3. **Then `**In numbers:**`** (or `**In short:**`): at most four bullets, each opening
   with a **bold** number or fact from the body and ending with a link to the section that
   proves it, `([section 2](#heading-id))`. No other summary section, and no companion
   paragraph between the bullets and section 1: a pointer to another doc belongs in
   `related:`, and anything about the project in `project-line:` or `closing:`. Section 1
   should start within three phone screens.
4. **Headings say the finding.** A scanner reads about the first two words of a heading,
   so lead with the result, the number or the technique's name: "Device loss under GPU
   saturation", not "Gotchas"; "1.3 to 1.5 ms per frame, and where it comes from", not
   "Results". The contents list is built from them, so together they read as the argument.
5. **Say the idea in plain words before naming the term.** "A still picture animated by a
   video model", then "image-to-video". Any term the argument needs is explained in its
   own sentence where it first appears. `[froxel](#term "A frustum voxel: one cell of …")`
   still draws the word as a button whose definition opens on a tap (a popover, no script;
   the definition is in the HTML, so it is public and searchable), but a tap-to-open
   definition is a reminder only: about half of readers never open one, and a link that
   lands on a sentence cannot land inside a closed one. The sentence itself carries the
   meaning.
6. **Section 1 opens on a concrete case, in prose**: a frame, the bug as it looked, a
   measured number. Not a table and not definitions. A table comes after the paragraph
   that says what to look for in it.
7. **Each section ends on the problem the next one solves**, so the headings and the
   section endings, read in order, are the argument: the problem, the sticking point, what
   was tried, what worked. Keep the failed attempt in.
8. **Callouts stay visible.** A `>` blockquote whose first words are bold
   (`> **Takeaway:** …`) draws as a boxed callout with that label. Never put core content
   in anything collapsed.
9. **Citations stay in the body.** References are numbered by first citation, so no `[n]`
   in the opening, a caption or a definition: one cited earlier than its number breaks the
   build.
10. **One doc, one question**, stated in the title in the reader's words. Split a long doc
    only where it answers separate questions, each part standing alone with its own
    Question and Short answer; never to make a second page.

### The project a doc belongs to

*(Cyrus, 2026-11-13: no doc linked its app or its film, and the Play button reached only the
readers who finished.)* Four front matter fields tie a doc to the game, app or film its
research was done for, and say how another doc points to it:

- **`project:`** a slug in `docs/games`, `docs/apps` or `docs/films`, or `none` for a doc
  with no honest tie to one. Every doc makes the choice once. The build refuses a slug
  that is not a project, a project without a `blurb`, and a project with nowhere to send
  the reader (a game with no `play`).
- **`project-line:`** the product line, 20 to 240 characters of whole sentences: what the
  project is, what in it this doc explains, and what the click gives. "I build Day Hike, a
  co-op horror game that runs in your browser. This doc is how its ground fog is drawn."
  Without it the page writes "This research was done for <Title>, <blurb>." (a film:
  "The author of this page also made <Title>, <blurb>.", which claims nothing about how the film was made). Either way the page adds the link and the full
  stop itself: "Play it in your browser, no install" for a game, "See what it does" for
  an app, "Watch it on YouTube" for a film. It is one plain paragraph after the last of
  the Question, Short answer and What that leaves open paragraphs (after the first
  paragraph of an opening with none of them), never before the Short answer. Do not
  write a second link to the project into the opening.
- **`closing:`** the doc's last paragraph, 40 to 520 characters of whole sentences, shown
  under What next: what the reader can now recognise in the project and where to see it.
  "Stand at the trailhead at dusk. The band of fog under the trees is section 3; the way
  it thins as you climb is section 5." The page adds the same link after it. Without one
  the page writes a sentence from the project's title and blurb; with `project: none` a
  closing is shown without a link, and a doc with neither gets no paragraph.
- **`asks:`** the question this doc answers, in a reader's words, 15 to 90 characters
  ending in "?". It is the link's text wherever another doc offers this one as a next
  read; until it is written the title stands in.

`project-line`, `closing` and `asks` are **plain text**: the page prints them as written,
so the build refuses Markdown in them (backticks, `*emphasis*`, `_emphasis_`, a
`[link](...)`). Name a file or a function in plain words. The first two are paragraphs of
the page, so they date their present like the body ("Date the present", below): "as of
<published date>", never a bare "now" or "currently", which the build refuses from
2026-10-24. The project's link in all three places is words alone, with no arrow mark
even when it leaves for YouTube, and its last three words stay on one line.

How a film was made stays private (AGENTS.md, the films row): a `project-line` or `closing`
on a film doc may say what to watch for in the film, and nothing about models beyond the
one its card names, prompts, pipeline or costs.

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

## Series and What next

`series: <Name>` *(2026-10-23)* puts a doc in a run of docs read in published order: the
line under the title shows "Part 2 of 5 in <Name> · Previous · Next" (one line at every
width; the two short links carry their targets' titles for a screen reader), and What next
names the previous and the next part by title. The line never wraps, so on a phone a long
name is cut with an ellipsis (the full name is in What next): on a 390 px screen a middle
part shows about 19 characters of it, and "Rendering a browser forest" loses its last
word. Keep a new series name under about 20 characters. A
series needs two or more docs (the build refuses one of one); the name is 3 to 40
letters, digits, spaces or apostrophes, starting with a capital, spelled the same on
every doc. The series now: WebGPU against WebGL2; Rendering a browser forest; Filling the
distance; Day Hike's look; Olympic Peninsula field notes; Horror craft; AI short films;
Arkos IDE notes; Analytics without cookies; Day Hike netcode. A new doc joins one when
it continues that work, and a new series starts when a second doc would join it.

What next *(2026-11-13; it was a boxed Keep reading block)* also offers up to three docs
to read next, each as the question it answers (its `asks:`): the next part of the series
first, then `related: slug-a, slug-b`, which hand-picks 1 to 3 (the build refuses a
fourth, and a slug that is not a published doc), else the three sharing the most
categories, newest first (two, beside a series). **The list never holds more than three,
and the next part of a series takes the first place**, so on a doc that has a next part
only the first two `related` slugs are shown: name two there, the ones that matter most
first, or the third is left off the page without a word from the build. The last part of a
series has no next part and shows all three. Hand-pick when the best next read is in
another category.

Every link the page adds counts in the visits log, so the dashboard shows which ones are
followed: `toc` and `toc-rail` (the contents), `doc-<slug>` (a link in the text to
another doc), `series-<slug>` (a part of the doc's own series: under the title, and in What
next whether it is the next part or one named in `related`),
`next-<slug>` (a next question in What next from outside the series), `end-<slug>` (the next question after
the author box), `lead-<project>`, `close-<project>` and `after-<project>` (the project's
link in the opening, in What next and after the author box), `watch-<doc slug>` (the
header's watch pill), `term` (a definition tapped open), `crumb-home` and `author-home`
(the trail's and the author box's links home), plus `section-<n>` from `reading.js` when
a section has been on screen for 5 seconds (n 0 is the opening; the last section stops
counting where What next begins).

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

### No Start here row

`/research` had a **Start here** row of featured docs from 2026-10-18; Cyrus dropped it on
2026-10-29, with the `featured:` field (the build now refuses it). Every doc is in the one list,
newest first, filtered by one category chip at a time.

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
Question and the first line of the Short answer should be on the first, and the product
line near the end of the second.
The desktop shots are 1440×4000, so a long doc's bottom is cut off in
`doc-desktop*.png`; use `preview.sh --serve` to check the end of a long doc.
`check.py` must pass. A title longer than 65 characters only warns.

## 4. Ship

Commit `docs/published/` and `public/` together, then use the **deploy** skill.
After it's live, remind Cyrus to open Search Console → URL Inspection and
request indexing for the new doc's URL and `https://csarko.sh/research`.
