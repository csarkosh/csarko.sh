# Task 10 report: the entrances on csarko.sh and apps.csarko.sh

Status: NEEDS_CONTEXT. Steps 1 to 5 are implemented and uncommitted. Step 7's commit is held
because check.py fails the /projects budget the brief sets, and the apps bar no longer fits a
phone. Both need a ruling.

## What I implemented

- `docs_lib.mjs`:
  - imports `doorOf` and `DONATE_URL` from doors.mjs, and `ICON_CSS`, `iconSymbol` and `iconUse` from icon.mjs.
  - `tokensLink(project)`, modelled on `sourceLink`, renders the brief's exact markup for a shipped door and `''` otherwise.
  - `projectCard` puts the link last in `.card-links`.
  - `projectsPage` emits `iconSymbol()` once, right after `<main>` opens, when any card has the link.
  - `PROJECTS_CSS` gains the two `.card-tokens` rules verbatim, plus `ICON_CSS`.
  - `standaloneShell` links take an optional fourth element, `icon`, placed inside the anchor before the escaped label. Its extraCss gains `ICON_CSS`.
- `apps/product.mjs`:
  - `prepareReadme` first drops any line that is only a Markdown link to `https://donate.csarko.sh...`, with or without the `<img>`.
  - `productPage` adds `['Buy me tokens', DONATE_URL + door.path, true, iconSvg()]` after GitHub and before the release, when the app's door is shipped.
- `check.py:59`: `BUDGET_HTML_PROJECTS = 60_000`. I kept the existing comment and appended "; the Buy me tokens link and its one symbol (2026-10-30)". **check.py fails this value; see Concern 1.**
- `AGENTS.md`:
  - Events: `tokens-<slug>`, "a click on a card's Buy me tokens line", noting that the apps bar line counts nothing because that host has no script.
  - A new `donate/` Layout row: what it is, the spec, the build, deploy and test commands, and "the repo is public, so the door copy is public".
  - The `admin/` row: a clause about the `donate` step and its spec.
  - A Content rules bullet "Buy me tokens": the exact snippet, the once-per-page rule and the anti-goal in one sentence.
  - The DNS bullet: the `admin`, `apps` and `donate` CNAMEs. The bullet named neither `apps` nor `admin` before and said "exactly three record sets", so I added all three CNAMEs and changed that phrase to "these record sets".
  - No em-dash added.

## Tests

- RED: both new tests failed on their first assertion (symbol count 0; the bar regex did not match).
- **Deviation in the docs_lib test:** as written, its card slice ends at `html.indexOf('</li>', …)`. That is the first *tag* `<li>`'s close, because the tags list comes before `.card-links`. The slice therefore never contains the link, and the count assertion can never pass. I changed only that search string to `'</li>\n'`, the card's own close (tag items sit on one line). Everything else is as written.
- Also: `html.indexOf('card-source') < html.indexOf('card-tokens')` is satisfied by the CSS rules in `<head>` before it reaches the cards. It is weak as written; I left it unchanged.
- GREEN: `node --test docs_lib.test.mjs product.test.mjs`: 79 pass, 0 fail. All apps, site-quality and donate suites: 97 pass, 0 fail.

## Rebuild and check

- `generate-assets.sh` regenerated only `public/projects/index.html`. It has five `card-tokens` links (ide-arkos, lib-visits, the-last-trail, who-is-standing-in-my-hallway, app-macstats) and none for day-hike.
- `check.py`: **1 failed**, `HTML 60,667 B (budget 60,000)` on /projects. Every other check passes, including the colour-token rule.

## Screenshots (looked at; crops in my scratchpad)

- /tmp/csarko-sh-preview/projects-desktop.png
- /tmp/csarko-sh-preview/projects-desktop-light.png
- /tmp/csarko-sh-preview/projects-mobile.png
- /tmp/csarko-sh-preview/projects-mobile-light.png

In all four, the line sits after "Source on GitHub" in muted grey. The icon is at text height on the baseline with a small gap, at body weight, with no accent. Five cards carry it and Day Hike's does not. On the phone it wraps under the other two links, as "Source on GitHub" already does.

## Apps build

- `node apps/build.mjs --local lib-visits=~/Projects/lib-visits`: lib-visits has one "Buy me tokens", in the bar. The bar has it for all three apps, between GitHub and the version, with the ↗ external arrow like GitHub's.
- The local README has no snippet yet, so I also built from a scratch copy with the snippet appended. The page still has one "Buy me tokens" and one donate.csarko.sh URL, both in the bar.
- For comparison, HEAD's code built from that same copy leaks the snippet into the body. So the drop is needed.

## Concerns (need a ruling)

1. **The /projects budget.** The page is 60,667 B against the brief's 60,000; HEAD is 50,616 B.
   - `iconSymbol()` alone is 8,577 B: one `<rect>` per run of colour.
   - The five links add about 1 KB and the CSS about 0.4 KB.
   - Options:
     - (a) raise the budget to 65,000. That gives about the same 4.4 KB headroom 55,000 gave over 50.6 KB.
     - (b) make icon.mjs's sprite smaller, for example one `<path>` per colour instead of about 100 rects. That is Task 6's module, outside my scope.
   - Once ruled, AGENTS.md's Projects bullet, which quotes "55,000 B ... 50,611 B", also needs its numbers updated. I left it alone pending the ruling.
2. **The apps bar on a phone.** I measured the pages in 390px and 320px iframes with fonts loaded.
   - HEAD's bar fits on one line at 390px and wraps inside the 60px bar at 320px.
   - With the new link, the items wrap at 390px: the list is 54 to 82px tall in the 60px bar, and the version chip is pushed to the edge.
   - At 320px it overflows: page scrollWidth is 332 (MacStats) and 341 (lib-visits), and the list is 136px tall. That breaks "a layout that holds from 320px".
   - Options:
     - (a) hide the version chip under 640px.
     - (b) let the bar wrap to two rows on phones.
     - (c) icon-only with a visually hidden label on phones. This departs from "the icon plus the words".
   - That is a design call, so I made none.
3. Smaller notes:
   - The `apps/` Layout row still says the bar carries "Download or Install, GitHub and the version". The new Content rules bullet covers the line, but the row could name it too. I did not edit the row; it is not in the brief's list.
   - The `_infra/` row does not mention the donate site. That is also outside the brief's list.
   - The README drop also removes such a line inside a fenced code block. No README has one.

## Files changed (uncommitted)

- .agents/skills/site-quality/scripts/docs_lib.mjs
- .agents/skills/site-quality/scripts/check.py
- .agents/skills/site-quality/tests/docs_lib.test.mjs
- apps/product.mjs
- apps/test/product.test.mjs
- AGENTS.md
- public/projects/index.html (regenerated)

## Self-review

- Every shipped door's card is covered, and so are the apps bar, the snippet drop and every AGENTS.md edit the brief lists.
- Nothing is deployed. No em-dash, email address or phone number is in the diff.
- `docs_lib.mjs` grew by 16 lines. The change is not sprawling.

## Fix report: the coordinator's two rulings (2026-10-30)

Status: DONE. Commit `d672376` "Buy me tokens: one quiet line on every project card and apps
page". It includes the regenerated `public/projects/index.html`, `donate/icon.mjs` and its test.

### 1. Budget: the sprite is one path per colour; the budget stays 60,000

- `donate/icon.mjs`: `RECTS` became `SHAPES`, one `<path fill d>` per palette colour that appears. Each run is an `M{x} {y}h{w}v1h-{w}z` segment.
  - `iconSvg()`, `iconSymbol()` and the donate build's `icon.svg` all use it.
  - The opening `<svg>` tags are unchanged.
  - `iconSymbol()` went from 8,577 B to 2,448 B; `iconSvg()` is 2,379 B.
- `donate/test/icon.test.mjs`, third case: it now asserts no `<rect` and at most one path per colour. It rebuilds the 32 by 22 grid from the paths' segments, with fills looked up in PALETTE, and `deepEqual`s it to `PIXELS`. RED against the rect sprite, GREEN after.
- `apps/test/product.test.mjs`: the bar regex expects `<path ` in place of `<rect `.
- /projects is **54,538 B** against a budget of 60,000. The check.py comment and the AGENTS.md Projects bullet both state it, dated 2026-10-30.
- check.py: `✓ site checks passed (11 warning(s))`. That is the same 11 warnings as before this task.

### 2. The apps bar on a phone: wraps, hides nothing

Under `@media (max-width: 640px)`, `.app-bar .wrap` gets `flex-wrap: wrap; height: auto; row-gap: 6px`. Three departures from the ruling's exact values, each fixing something I measured:

- **Vertical padding only** (`padding-top: 10px; padding-bottom: 10px`). `padding: 10px 0` wiped `.wrap`'s 24px side gutter, which put the app name at x=0 on the phone.
- **The list wraps too** (`.app-bar ul { flex-wrap: wrap; gap: 6px 14px; }`). At 320px, dropping the list to its own row was not enough: it still did not fit, and its labels broke mid-word ("Buy me / tokens", "GitHub / ↗").
- **`html { scroll-padding-top: 136px; }` on phones.** The two-row bar is 113px tall at 320px, against the 84px scroll padding, so a jump to `#setup` from the bar's Download link would have landed under the sticky bar. Measured with `scrollIntoView`, the heading now sits at 136px under a bar ending at 113px, at both widths.

Measured in 390px and 320px iframes with fonts loaded, for all three apps:

- Page scrollWidth is exactly 390 and 320; nothing overflows.
- The list ends at 296px at 320px wide (the 24px gutter kept) and at 357 to 366px at 390px wide.
- Every link and the version are kept.

Screenshots (all three apps at 390px on top and 320px below):

- /private/tmp/claude-501/-Users-csarko-Projects/c2a42205-5788-40cc-8051-e940a781aaf3/scratchpad/apps-bars-phone-dark.png
- /private/tmp/claude-501/-Users-csarko-Projects/c2a42205-5788-40cc-8051-e940a781aaf3/scratchpad/apps-bars-phone-light.png

### Re-runs

- donate, apps and site-quality suites: 97 pass, 0 fail.
- check.py: passes.
- `/projects` screenshots retaken (16:10): /tmp/csarko-sh-preview/projects-desktop.png, projects-desktop-light.png, projects-mobile.png and projects-mobile-light.png. The line is unchanged with the path sprite: after "Source on GitHub", grey, icon at text height, in both themes and both widths. A crop of the four rows is in my scratchpad as rows-after.png.
- The apps build from a README carrying the snippet still has one "Buy me tokens", in the bar.

The `'</li>\n'` test fix is kept. Still open, outside the rulings:

- The `apps/` and `_infra/` Layout rows in AGENTS.md do not name the bar's new line or the donate site.
