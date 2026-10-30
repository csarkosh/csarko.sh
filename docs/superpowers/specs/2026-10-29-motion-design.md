# Motion across csarko.sh and its admin pages: design

*2026-10-29. Approved direction from Cyrus in conversation; mockups at
`.superpowers/brainstorm/60560-1793322770/content/motion.html` (git-ignored).*

## Why

Cyrus: "how fast everything jumps. when I apply filters, when i show / hide the tables in the
admin page." Today nearly every change on both sites happens in one frame: filtered cards vanish
and the list snaps shut, folded tables pop open, menus and drawers appear, content replaces its
skeleton. He wants every one of them to move, the admin's show/hide sections as an accordion and
everything else as a smooth transition, all following Google's Material (Material 3) motion
guidance. **Nothing stays instant.**

## Scope

**In:** the public site at csarko.sh (the home page, `/projects`, `/research` and every doc page)
and every admin page at admin.csarko.sh (the index, `/csarko.sh/`, `/ide-arkos/`, and Day Hike's
page, which is built in `~/Projects/game-dayhike`, `client/src/admin/`). An admin page added later
(the finance page specced today, `2026-10-29-finance-admin-page-design.md`) uses the same shared
pieces and so moves the same way.

**Out:** the app pages on apps.csarko.sh (Cyrus: "ignore the app pages ... I'm planning to change
the app pages completely"). The game itself.

## The motion system (Material 3)

One set of tokens, used everywhere, so the two sites move as one:

| Token | Value | Use |
|---|---|---|
| standard | `cubic-bezier(0.2, 0, 0, 1)` | anything that starts and ends on screen: moving, resizing, colour and state changes |
| emphasized decelerate | `cubic-bezier(0.05, 0.7, 0.1, 1)` | things arriving: a menu, a drawer, a card coming back into a list |
| emphasized accelerate | `cubic-bezier(0.3, 0, 0.8, 0.15)` | things leaving: always shorter than their entrance |
| short3 / short4 | 150 / 200 ms | small changes: hovers, chips, tooltips, exits |
| medium2 / medium4 | 300 / 400 ms | things that cross space: an accordion opening, cards gliding, a drawer |

They are CSS custom properties on `:root` (on the public site in `index.html`'s token block, copied
into the generated pages as the colour tokens are; on the admin in `theme.css`), and the scripts
read the same values. **Under `prefers-reduced-motion: reduce` every effect is instant** (Material's
accessibility rule; the sites already honour it for their hovers): the durations become zero, and
nothing waits on an animation to finish.

## Each effect

These are what the mockup showed and Cyrus approved ("A, glide. everything else is good").

### Admin: folded sections are an accordion

Every folded table on the admin pages (`folded()` in `admin/public/charts.js`, about 25 of them, and
Day Hike's `details.table`s and its drawers' folds): on opening, the body's height grows from 0 on
the standard curve over 300 ms while its rows fade in (150 ms, starting 75 ms in); on closing it
shrinks over 200 ms on the accelerate curve while the rows fade out first (100 ms). The disclosure
arrow turns with it. A click while it moves is ignored until it settles. The `<details>` element
stays the element (keyboard, screen readers and find-in-page keep working); script animates it.

### Filter chips: glide

On `/projects` and `/research`, and the chip rows inside admin cards that filter a list (csarko.sh's
journeys, Arkos's recent sessions):

- cards leaving fade out where they are, 150 ms, accelerate;
- cards staying glide from their old place to their new one, 400 ms, standard (a FLIP: measure,
  apply the filter, animate from the old position);
- cards arriving fade in and rise 8 px with a slight scale, 300 ms, decelerate, starting 100 ms in;
- the list's own height eases to its new height over the same 400 ms, so nothing under it jumps.

The public pages' filtering stays CSS-driven (the chips still filter with no script, as today); the
glide is added by `filters.js`, which those two pages already load. Without script the filter still
works and is simply instant. A chip row that swaps a chart rather than filtering a list (Arkos's
"First sessions only" on the paths flow) cross-fades instead (below).

### Content arriving and changing (admin)

- **Skeleton to content**, on load and after a range or Whose change: the content cross-fades in over
  the skeleton, 300 ms standard, in place at the card's held height. Heights are still held and
  remembered as the no-jump work of 2026-10-29 does it; where a height does change, it eases (below).
- **A range or Whose change** cross-fades the card to its skeleton (150 ms) before the new content
  cross-fades in.
- **A chart or list swapped by a chip** (paths flow, first sessions) cross-fades, 300 ms standard.
- **Day Hike's "Right now"** refresh every 10 s: changed figures cross-fade (150 ms), the card does not
  rebuild visibly.

### A card whose height changes eases to it

*(Cyrus, asked after the design review: "ease them".)* Whenever an admin card's height changes, it
grows or shrinks to its new height over 300 ms on the standard curve, and everything below glides
with it rather than jumping in one frame. That covers:

- **a view never seen before** (a new range, Whose, filter or window width): no height is remembered,
  so the content's height differs from the skeleton's;
- **a range or Whose change**: the card moves from the height it has now to the height remembered for
  the new view (`hold()` today sets that in one frame);
- **a chip that swaps content of another size** (Arkos's "First sessions only" flow, a filtered
  journey or session list) and Day Hike's "Right now" when lobbies come and go;
- **a drawer's loading line replaced by its content**.

The remembered height is the card's **final** height, measured before the ease starts (or once it
ends), never a height from the middle of one: `settle()`'s 1.5 s re-measuring window
(`admin/public/charts.js`, and Day Hike's `client/src/admin/hold.ts`) must not record mid-animation
values. A view seen before at this width still loads with no change of height at all, so nothing
moves.

### Menus, tooltips, drawers, gates

- **Account menu** (`auth.js` `accountMenu`): grows from the button's corner, scale 0.92 to 1 and
  fade, 300 ms decelerate; closes 150 ms accelerate. Escape and click-outside close it as now.
- **Chart tooltips** (`charts.js`, Day Hike's `charts.ts`): fade and lift 4 px in, 150 ms standard;
  moving between bars glides the tooltip rather than jumping it. Bar and flow-band highlights ease on
  the same 150 ms.
- **Day Hike's drawers** (session, visitor, match): slide in from the right edge, 400 ms decelerate,
  over a scrim that fades in (300 ms); leave in 200 ms accelerate with the scrim fading out. A drawer
  opened from inside a drawer slides over it the same way.
- **The sign-in gate** (`auth.js` `requireSession`): page and gate swap with a fade through (out 90 ms,
  in 210 ms with a slight scale), Material's pattern for a full change of content.

### Public site: the rest

- **Word definitions** on doc pages (the `popover` terms): fade and scale in from 0.96, 200 ms
  decelerate; out 150 ms accelerate; the backdrop fades with them.
- **The "In this doc" rail**: the current-section highlight changes colour over 150 ms standard rather
  than jumping.
- **Hovers, link underlines, chips, card lift** on both sites: today's 0.15–0.18 s `ease` becomes
  150 ms standard, the same everywhere.
- In-page scrolling stays the browser's smooth scroll, as now.

### Direct manipulation stays direct

Day Hike's map scrubber follows the pointer frame by frame, as Material asks of anything dragged:
an eased lag there would feel broken. Choosing another world on that map cross-fades the map (300 ms).
*(This is the designer's call within "nothing stays instant": the scrub is continuous motion already.)*

## Constraints

- **Every standing rule still holds**: Lighthouse 100 on accessibility and best practices and
  performance ≥ 95, no layout shift (the effects animate transform, opacity and a clipped height,
  and a card's height; content below a card moves only by easing with it, and a view seen before does
  not move at all), Observatory A+, the strict CSP (no inline
  script; any new script is a hashed first-party file), the 10,000 B script budget on public pages
  (list pages carry about 4.8 KB today), no third-party code.
- **No new colours.** Motion only.
- **The no-jump guarantees of 2026-10-29 stay**: held heights, remembered heights, skeletons from
  the first frame. Motion never makes a card change height that would not have changed anyway; it
  only makes the changes that do happen ease instead of snap.
- **Day Hike's page moves through the host's tokens and helpers where it can** (`/theme.css`), and
  through its own code where it already has its own (its drawers, charts and accordion), with the same
  values, so all four admin pages feel the same. It deploys with the host, as it does now.
- Both repos' rules: csarko.sh's `site-quality` checks and screenshots in both themes; game-dayhike's
  worktree, push gate (or the `test.yml` workflow) and commit format.

## Left to the builder

- How the accordion and the glide are written (Web Animations API is what the mockup used; CSS
  `::details-content` with `interpolate-size` where supported is fine if it falls back to the same
  feel), and how the code is shared between pages.
- Whether `filters.js` grows to hold the glide or a second small file does, within the budget.
- Exact stagger, if any, when many cards arrive at once (Material allows a small one; keep the whole
  move within ~500 ms).
- Tests: what can be tested without a browser (the tokens, the reduced-motion path), and screenshots
  or recordings for the rest.
