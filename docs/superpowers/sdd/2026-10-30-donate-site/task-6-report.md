# Task 6 report: the icon

Status: DONE_WITH_CONCERNS (one small deviation from the brief's `iconSymbol()` string, below)

Commit: a7e6adc donate: the heart and token icon, one pixel map

## What was implemented

`donate/icon.mjs` (Node 22 ES module, no dependencies):

- `PALETTE`: the ten letters to the ten fixed fills (`O m s h H`, `g G c l L`), each commented.
- `PIXELS`: 22 rows of 32 characters, drawn by hand from a throwaway generator.
- `iconSvg({ className })`: `<svg viewBox="0 0 32 22" shape-rendering="crispEdges" aria-hidden="true" class="...">`, one `<rect>` per horizontal run of one colour (181 rects, built once at import).
- `iconSymbol()`: `<svg hidden aria-hidden="true" width="0" height="0" style="position: absolute"><symbol id="tokens-icon" viewBox="0 0 32 22" shape-rendering="crispEdges">rects</symbol></svg>`.
- `iconUse({ className })`: exactly the brief's string.
- `ICON_CSS`: exactly the brief's rule.
- The class attribute is escaped (`& " < >`), a one-line guard.

`donate/test/icon.test.mjs`: the brief's test, verbatim.

## How the pixels were drawn

A throwaway Python generator (scratchpad, not committed) built two masks: the heart from two circles of radius 6.2 at x = 16 +/- 5.4, y = 7.2, plus the tangent triangle down to (16, 22.2), every row below the lobes' centre filled between its ends; a V cleft cut 5 rows deep (2 px wide at row 4, widening one pixel a side per row up); the token a disc of radius 6 centred at (25, 15.5). Shading: a one-pixel outline where a 4-neighbour is outside the shape; heart shadow `s` where the pixel to the right or lower right (or two down-right) is not interior, so it sits on the lower right; coin rim `l` on the upper left and `c` on the lower right, `L` where the rim faces the light most, and an engraved inner ring at radius 3.3 (`c` on its lit side, `l` on its shaded side) so it reads as a coin. The coin is drawn over the heart.

Then hand-corrected: the right lobe's highlight moved to mirror the left lobe's spot (`h` ring around two `H`), the right lobe's shadow trimmed from three pixels wide to two, and the tip ended as a clean `OO` on row 20 (it had two rows of four), leaving row 0 and row 21 empty so the sprite is vertically centred.

```
................................
........OOOO........OOOO........
.......OmmmsO......OmmmsO.......
......OhhmmmsO....OhhmmmsO......
.....OhHHhmmmsO..OhHHhmmmsO.....
.....OmhhmmmmmsOOmhhmmmmmsO.....
....OmmmmmmmmmmmmmmmmmmmmssO....
....OmmmmmmmmmmmmmmmmmmmmssO....
.....OmmmmmmmmmmmmmmmmmmssO.....
.....OmmmmmmmmmmmmmmmmmmssO.....
.....Ommmmmmmmmmmmmmmmgggggg....
......OmmmmmmmmmmmmmmgLlllllg...
.......OmmmmmmmmmmmmgLGccccGGg..
........OmmmmmmmmmmglGcGGGGlGcg.
.........OmmmmmmmmsglcGGGGGGlcg.
..........OmmmmmmssglcGGGGGGlcg.
...........OmmmmsssglcGGGGGGlcg.
............OmmssssglGcGGGGlGcg.
.............OmsssO.gGGllllGcg..
..............OssO...gccccccg...
...............OO.....gggggg....
................................
```

Test values: top(15) = top(16) = 5 (the cleft), top(7) = 2, top(23) = 1 (the lobes), gold in rows 12 to 20 at x >= 20.

Note on the mockup: the brainstorm's `icon-a-cleft-v3.html` "Deeper" variant has the heart at x 0 to 21 and the coin beside it at x 19 to 31, which cannot meet the brief's test (top(23) would be the coin at row 9, and the cleft sits at x 10/11). Per the controller, the test was the arbiter: the heart is centred on x 16 and the coin tucked over its lower right.

## Test output

RED (before `icon.mjs` existed):

```
# Subtest: donate/test/icon.test.mjs
not ok 1 - donate/test/icon.test.mjs
  ...
  code: 'ERR_MODULE_NOT_FOUND' (url: .../donate/icon.mjs)
# tests 1
# pass 0
# fail 1
```

GREEN:

```
# tests 3
# suites 0
# pass 3
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

## Preview

`/tmp/csarko-donate-icon/preview.png` (from `/tmp/csarko-donate-icon/preview.html`, taken with the exact headless Chrome command in the task). It shows the icon at 1em before "Buy me tokens" in 14px Inter (the site's own self-hosted `inter-latin-var` woff2, system-ui fallback) at weight 400 in the dark panel (#0a0b0e, #a0a8b8) and the light panel (#f6f7f9, #4a5263), and the icon alone at 256 px wide in both.

What I saw: at 8x the heart reads as a heart with a clear V cleft, a pink spot on the upper left of each lobe, a darker band down the right lobe and the lower right to the tip, a one-pixel dark outline all round, no stray pixels; the coin reads as a gold coin with a bright upper-left rim, a darker lower-right rim and an engraved inner ring, sitting over the heart's lower right. At 1em (14px, 1x device pixels) the heart and its cleft are still visible, and the coin is a small gold disc at the lower right; I cropped and enlarged that line to check it in both themes. It sits on the text's baseline at the right size next to the cap height.

I also rendered `iconSymbol()` + `iconUse()` beside `iconSvg()` in a throwaway page: the two draw identically.

## Files changed

- `donate/icon.mjs` (new)
- `donate/test/icon.test.mjs` (new)

Outside the repository: `/tmp/csarko-donate-icon/preview.html`, `/tmp/csarko-donate-icon/preview.png`.

## Self-review

- Against the brief: every export present with the brief's names and defaults; the SVG's opening tag matches the test string; one rect per run (the test counts it); no em-dash, no en-dash, no email address in either file (checked).
- The test is the brief's, verbatim, and exercises the real module.
- The test output is clean (3 pass, nothing else printed).
- Brief step 3 says to render `donate/test/icon-preview.html`; per the controller the preview lives at `/tmp/csarko-donate-icon/preview.html` instead, outside the repository, so nothing extra is committed.

## Concerns

1. `iconSymbol()` deviates from the brief's `<svg hidden>`: browsers apply the `hidden` attribute's `display: none` only to HTML elements, not to an `<svg>` (seen in Chrome: the symbol sheet drew as an empty 300 by 150 box). So the wrapper is `<svg hidden aria-hidden="true" width="0" height="0" style="position: absolute">`. The `style` attribute is allowed by every csarko.sh CSP (`style-src 'self' 'unsafe-inline'`). The brief's test still holds (it checks the `<symbol ...>` substring), and Task 8's assertions on the symbol (`<symbol id="tokens-icon"` counted once) are unaffected. If you would rather keep the brief's exact string, the alternative is a `svg[hidden] { display: none; }` rule in the page CSS.
2. Cyrus has not seen the sprite yet; the commit was made per the controller's instruction that his approval is handled separately.
