# Task 8 report: the bare door's graphic

Status: DONE_WITH_CONCERNS. Commit 5791ea5 "donate: the bare door's picture".

## Composition

Five tilted cards across a 1920x1080 field of `#0a0b0e`, with a faint elliptical glow of `#7dd3c0`
behind them (22% at its centre, fading to nothing at its rim). Left to right: The Last Trail
poster, MacStats, Arkos IDE, lib-visits, the Hallway poster. Films sit at the two ends and the
apps between them, so the row reads film, apps, film.

The cards zigzag (the ends and Arkos sit low, MacStats and lib-visits high), so each neighbour
covers only a corner. The first layout, a plain fan in one row, let Arkos hide half of MacStats'
temperature gauge and most of lib-visits' journey. Stacking order: the two side apps go down
first, then the posters, which lie over the apps' outer edges (that hides the cut-off end of
lib-visits' subtitle), then Arkos in front, over the side apps' inner bottom corners.

Each card is the crop laid on `--surface` `#111318` (the screenshots with transparency show that
colour through), with 10px rounded corners, a 1px `#1f2430` border and a soft shadow (0,22
offset, 26px blur, 70%). Each one is rotated with `expand=True` on an RGBA layer. The whole
picture is drawn at 2x and brought down with LANCZOS, so the tilted edges and the 1px borders come
out clean (I checked a crop at full size). No words are drawn; the only words are the ones inside
the screenshots. Nothing is random.

## Constants (top of `donate/scripts/compose.py`)

- WIDTH, HEIGHT = 1920, 1080; SCALE = 2
- BG, SURFACE, BORDER and ACCENT: the site's tokens
- GLOW_CENTER (960, 560), GLOW_RADII (900, 420), GLOW_ALPHA 0.22, GLOW_STEP 8
- CARD_RADIUS 10, BORDER_WIDTH 1, SHADOW_OFFSET (0, 22), SHADOW_BLUR 26, SHADOW_ALPHA 0.70
- CARDS, back to front: source, crop box in the source's pixels, width (the height follows the crop's shape), centre, angle
  - MacStats `(16, 0, 696, 510)` 4:3, 480 wide, centre (648, 392), +4 degrees: the menu bar's readings over the CPU and temperature gauges
  - lib-visits-dark `(92, 48, 1313, 862)` 3:2, 520 wide, centre (1296, 404), -4 degrees: the window's title bar, "One visit, start to finish", the first three steps with their arrows, the timeline
  - The Last Trail `(0, 40, 720, 940)` 4:5, 360 wide, centre (232, 596), +7 degrees: the face, the radio and its green light
  - Hallway `(90, 60, 990, 1185)` 4:5, 360 wide, centre (1688, 596), -7 degrees: the face over the phone's light (the "Hello?" subtitle is cropped out)
  - Arkos IDE `(516, 76, 1283, 550)` about 16:10, 640 wide, centre (962, 640), -1.5 degrees: the hero's centre window from its traffic lights down to just above its "The multi tasker" label, with none of the side windows

## What I saw

- Full size PNG: the row reads at a glance as two horror stills around three app windows (a gauge, a terminal-style IDE, an analytics journey). Nothing is cut badly: each card's key part is clear of its neighbours. The fan uses about the middle 60% of the height, with dark field above and below it.
- Desktop shot (`/tmp/csarko-donate-site/home-desktop-dark.png`, 1280 wide, picture 560 wide): all five cards are distinct; the gauges, the green and teal bars, the two faces and the phone's light carry it; the screenshot text is texture.
- Phone shot (`/tmp/csarko-donate-site/home-phone-dark.png`): headless Chrome will not size a window below about 500px (preview.sh notes this too). The plain `--window-size=390,1400` shot came out as a 500px-wide layout cropped to 390, which looks like an overflow but is not one. I retook it the way preview.sh does, through a 390px iframe in a 600px window, cropped to the left 390px. At about 358px the picture still reads as two films and three apps.

## Size and determinism

1,029,526 bytes (`optimize=True`, no quantizing needed), under the 1.5 MB budget. Two runs give the same sha256, 28894f61...4c3c3d.

## Files

- `donate/scripts/compose.py` (new)
- `.agents/skills/site-quality/assets/donate/body-of-work.png` (new, replaces the untracked stand-in)

## Self-review

- No em-dash and no "@" in the script. 1920x1080, opaque RGB.
- I removed an unused parameter and a tangled conditional paste from the first draft. The bytes were unchanged.
- Nothing beyond the brief: no other file touched, and `donate/public/` is the git-ignored build.

## Concerns

1. No game: there is no picture of Day Hike in the repo (AGENTS.md: its card has none until a trailer exists), so "a game" is not shown. A sixth card can be added to CARDS once a Day Hike still exists.
2. The picture is dark in both themes, as the guidance said. I did not take a fresh light-theme shot: the task asked for the two dark shots only.
3. Attribution: the commit ends with `Co-Authored-By: Claude Opus 5.5`, the line from my harness's attribution rule. The task asked for `Claude Fable 5.1`. Amend if the plan needs the other line.
4. The brief asks for Cyrus's OK before committing. I committed as the controller asked; the controller holds the approval.
