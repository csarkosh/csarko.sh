# Task 7 report: the donate site

Status: DONE_WITH_CONCERNS. Commit 0fa985a "donate: the tip page, its build and the thanks page".

## What I implemented

- `donate/view.mjs` (pure, browser-safe): `pickPrices`, `buttonLabel`, `backLink`, `monthName` as the brief says, plus `thanksLine(door, doors)` (the thanks line, the same own-key guard as `backLink`), `DEFAULT_TIER`, `OWN_TIER`, `PROJECTS_BACK`. Door lookups use `Object.hasOwn`, so `__proto__` and junk keys fall back to the projects page. `pickPrices` drops a `javascript:` link and keeps the baked tiers if the live ones are malformed.
- `donate/page.mjs` (pure): `doorPage`, `thanksPage`, `DONATE_CSS`. The markup runs top to bottom as the brief says: kicker, h1, lead, `<picture class="shot">` (dark sources first when there is a dark variant, `width="1280" height="720"`, the project's own `alt` from its docs front matter), bill, `<fieldset class="tiers">` (a screen-reader `legend`, five `label.tier`, `context` checked, `tier own` dashed), `#pay`, `.foot`, the `#prices` JSON (month, pool, `{tier, usd, label}`, link URLs only, `<` escaped), and `<script type="module" src="/app.js">`. The shell is `standaloneShell` with the bar name "Buy Me Tokens" and the inline `iconSvg()` before it, no bar links, and the footer credit. The thanks page shows "Thank you", `<p class="lead" id="line">Tokens received.</p>` and `<a id="back" href="https://csarko.sh/projects">Back to the projects</a>` with no script, bakes `#doors`, and carries `noindex`. The CSS is the mockup's "Middle" tip card on tokens: one 560px column, 16px gutters at 640px and below, `.tier:has(:checked)` for the selected row, the picture `aspect-ratio: 16 / 9; object-fit: cover` on `--surface-2`, and transitions on `--md-duration-short3` / `--md-easing-standard`. The button's words fade in through a `swap` keyframe on `--md-duration-short4`. Under `prefers-reduced-motion` both are turned off, and the tokens are 0 there anyway.
- `donate/public-src/app.js`: the one script. It imports `/view.js` and takes the door from the path. On a door page the radios set `#pay`'s `href` and text, and a `pageshow` handler re-reads the checked tier after a history restore. It fetches `PRICES_URL` with `cache: "no-cache"`, runs `pickPrices`, and rewrites the bill figure and month, each price and share, and the links. When the prices are stale it adds `<p class="note">Prices are from <month>.</p>` after the bill. On /thanks it sets the line and the link through `textContent` / `setAttribute`.
- `donate/pictures.py`: the CLI from the brief. It imports `encode` and `short_hash` from build_assets.py (the scripts path is added from `__file__`, not the cwd). It writes `<stem>-<w>.<hash8>.{avif,webp,jpg}` at 640 and 1280 (plus `-dark`). A portrait is cropped to 16:9 around `focus_y` (clamped) and refused without one. `--focus-y` outside 0 to 1 is refused. It prints the brief's JSON.
- `donate/build.mjs`: it has the test command in its header and supports `--prices <file>`. Without it, it fetches `PRICES_URL` and fails on a 404 with the brief's message. It copies the fonts and favicons and fills the generated head blocks the way apps/build.mjs does, then writes the door pages, `thanks/`, `app.js`, `view.js`, `icon.svg` (XML prolog, no class, the svg namespace), `404.html`, `robots.txt` and `sitemap.xml` (the six door URLs). Failure modes: a shipped door missing from `prices.doors` fails with "no links for <door> yet; the next snapshot adds them". A missing picture or dark source fails by door, checked before anything is written. A portrait without a focus fails by door, with pictures.py's reason. A non-shipped door in the prices is logged and skipped. A malformed prices.json fails by field. The build also fails if `app.js`'s URL drifts from `PRICES_URL`. The six pictures are made in parallel, in about 11 s.
- `donate/test/fixtures/prices.json`: the Task 3 shape, the six shipped doors, `https://buy.stripe.com/test_<door>_<tier>`, placeholder `price_test_` / `plink_test_` / `prod_test_` ids, pool 288.
- `.gitignore`: `donate/public/`.
- `admin/api/src/donate/doors.mjs`: The Last Trail's `focusY` 0.3 → 0.42, with a comment. `admin/api/test/donate-prices.test.mjs` pins the new value.

## TDD evidence

RED, `node --test donate/test/*.test.mjs` before any implementation:
```
ok 1 - a 32 by 22 map in the ten fixed colours            (icon tests)
ok 2 - ...  ok 3 - ...
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../donate/page.mjs'
not ok 2 - donate/test/page.test.mjs
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../donate/view.mjs'
not ok 3 - donate/test/view.test.mjs
# pass 3  # fail 2
```
A second RED came after the first `view.mjs`: my link filter required `https://`, and the test's `'x'` link failed (`undefined !== 'x'`). I relaxed the filter to drop only `javascript:` links.

GREEN, `node --test donate/test/*.test.mjs`: `# tests 10, # pass 10, # fail 0`. Also green: `admin/api` `node --test test/*.test.mjs` 226/226, and `node --test apps/test/*.test.mjs` 9/9.

## Build checks run by hand

- No `--prices`: `donate: no prices.json yet; the step has not run. Preview with --prices donate/test/fixtures/prices.json`, exit 1 (the bucket answers 404 today).
- Bad argument: usage line, exit 1.
- No body-of-work.png: `donate: all: no picture at .agents/skills/site-quality/assets/donate/body-of-work.png`.
- hallway removed from the prices: `donate: no links for hallway yet; the next snapshot adds them`.
- dayhike added to the prices: `donate: dayhike has links but is not shipped; skipped`, then the build continues.
- hallway's focusY removed for a moment (restored after): `donate: hallway: the source is 1080x1440, taller than wide: give --focus-y for its 16:9 crop`.
- The built pages have no em-dash and match no email address. No Stripe id reaches a page.
- Headless Chrome on /last-trail/ at 390 wide: `Tip $9` with the context link; clicking run gives `Tip $29` and the run link, own gives `Tip what you like`, prompt gives `Tip $3`. The stale note shows (the local fetch fails, so the fallback path ran), there is no horizontal overflow, and the tier transition is `0.15s cubic-bezier(0.2, 0, 0, 1)`.

## Screenshots (/tmp/csarko-donate-site/)

Desktop is 1280 wide and phone 390 (an iframe, cropped), both themes, built from the fixture with the stand-in body-of-work.png (a copy of ide-arkos.png, not committed):
- /tmp/csarko-donate-site/home-desktop-dark.png, home-desktop-light.png, home-phone-dark.png, home-phone-light.png: "Buy Me Tokens" kicker alone, "Fund the next agent run", the stand-in picture.
- /tmp/csarko-donate-site/arkos-desktop-dark.png, arkos-desktop-light.png, arkos-phone-dark.png, arkos-phone-light.png: the hero fitted whole in the 16:9 frame, the context row selected (accent border and tint), `Tip $9`, the stale note on desktop (the local fetch fails).
- /tmp/csarko-donate-site/last-trail-desktop-dark.png, last-trail-desktop-light.png, last-trail-phone-dark.png, last-trail-phone-light.png: after the fix the crop runs from her brows to the radio's lit LED. The first shot at 0.3 kept the face but only the antenna of the radio.
- /tmp/csarko-donate-site/thanks-desktop-dark.png, thanks-desktop-light.png, thanks-phone-dark.png, thanks-phone-light.png: /thanks?door=arkos shows "Tokens received. The next agent run is on you." and "Back to Arkos IDE".

I also looked at /macstats, /hallway and /visits: all landscape, hallway's face in frame, and the dark lib-visits picture in the dark theme. Nothing overflows at 390.

## Self-review

- Every card element is present, in order. The thanks page's no-script defaults are in place, the build's failure modes are named by door, and the fetch has a fallback with the stale note. Only one script of ours, plus JSON data blocks.
- Every colour in DONATE_CSS is a token (the test checks it). The inline icon carries its fixed `fill` hexes as SVG attributes, as Task 6 designed it.
- Beyond the brief, small: `thanksLine` export; a `noindex` on /thanks; the picture's `alt` read from the project's docs front matter (apps and films have one; the bare door gets `alt=""`); the free row's caption "set it at checkout"; the thanks h1 "Thank you"; and a `pageshow` re-read.

## Concerns

1. **Wide sources are fitted, not cropped.** The app heroes are wider than 16:9 (Arkos 2.96:1, lib-visits 2.2:1, MacStats 2.2:1). pictures.py fits them whole into a transparent 16:9 frame, which shows `--surface-2` around them, instead of cropping their sides. Arkos would lose its "The web developer" and "The blogger" labels to a crop. As a result, the Arkos hero fills only about 60% of the frame's height. The brief only spoke to portraits, so Cyrus should confirm or prefer a crop.
2. **focusY changed in doors.mjs.** The Last Trail's 0.3 lost the radio, so it is now 0.42, and the Task 1 test that pinned 0.3 is updated.
3. **The stand-in** `.agents/skills/site-quality/assets/donate/body-of-work.png` is still on disk, untracked and uncommitted, so the preview builds. Task 8 replaces it. Delete it if Task 8 makes the file elsewhere.
4. The bar's name links to the page's own canonical URL (standaloneShell's behaviour), and its link list is empty.

## Fix round 1

Commit 0168a19 "donate: the pay button pays the tier it names; pictures keep their shape". Changes:

- **Important, the pay button.** `pickPrices` now lets the live door win only when its value is an object (a `null` door no longer throws), every key of `baked.links` has a URL whose `new URL(u).protocol === "https:"` (an allowlist; the `javascript:` denylist is gone), every baked tier has a live price, and the pool is a number. Anything else returns the baked prices, marked stale. The reshaped prices carry `door`. In `app.js`, `setButton` returns early when the selected tier has no link, so the label is written only together with the href. A `.catch` after `apply` re-applies the baked prices with the stale line.
- **Ruling, the picture's shape.** pictures.py keeps a source wider than tall at its own aspect ratio (640 and 1280 wide, the height following, no bars). Only a portrait is cropped to 16:9 around `focusY`. The printed `height` is the 1280 picture's real height. A `--dark` source of another shape is refused, and sources are opened through `ImageOps.exif_transpose`. The docstring is updated. `.shot img` dropped `aspect-ratio: 16 / 9` and keeps `height: auto; object-fit: cover`, so the `width`/`height` attributes give its shape. Built heights at 1280: arkos 432, macstats 583, visits 581, last-trail 720, hallway 721 (the 1080-wide crop rounds), bare door 432 (stand-in).
- **Minors.** The `.btn.swap` keyframe and its class toggling are gone, so the text just changes. `#prices` carries `door` and app.js reads it from there, no longer from the path. The bar name links to `DONATE_URL`. A missing `public/404.html` fails the build with `donate: public/404.html not found; ...`, checked before anything is written. A missing or unparseable `--prices` file fails with `donate: no prices file at <path>` or `donate: <path> is not JSON: <reason>`.

Covering tests (written first; RED was 3 failing: the CSS shape, the baked door and bar link, the live-JSON rules):
- view.test: a live fixture with five https links wins. A door missing `run`, a `javascript:` link, an `http:` link, a `null` link, a `null` door, another door, and a missing tier price each fall back to baked and stale.
- page.test: no `aspect-ratio: 16 / 9`, `.shot img` has `height: auto` and `object-fit: cover`, no `@keyframes` or `animation:`. A 1280x432 picture renders `width="1280" height="432"`. The baked JSON's `door` is `arkos`, and the bar links to `https://donate.csarko.sh`.

`node --test donate/test/*.test.mjs`: tests 12, pass 12, fail 0. admin/api: 226 pass.

By hand: a missing `--prices` file, a non-JSON one and a missing 404 page (renamed for a moment, then restored) each fail with their `donate:` message. In headless Chrome on /arkos/ at 390, clicking prompt then run then own then finetune gives Tip $3/prompt, Tip $29/run, Tip what you like/own and Tip $87/finetune. The button's animation-name is `none`, the stale note shows, and nothing overflows.

Screenshots retaken and looked at:
- /tmp/csarko-donate-site/arkos-desktop-dark.png: the hero fills its frame edge to edge, with no bands above or below.
- /tmp/csarko-donate-site/home-desktop-light.png: the same with the stand-in, light theme.
- /tmp/csarko-donate-site/last-trail-phone-light.png: the 16:9 poster crop, brows to radio LED, unchanged.

The other screenshots from the first round still show the old letterboxed hero on arkos and home (phone, and the theme not retaken).

## Fix round 2: the bill sentence

Commit 2e24702 "donate: the bill says what the cloud cost, not what I give away".

- The sentence is now Cyrus's wording: `<p class="bill">In <month> the cloud behind all this cost <b>$<pool></b>. Each tier is a slice of that bill.</p>`.
- `view.mjs` has a new `billParts(prices)` that returns `{ before, figure, after }` (`monthName(prices.month)` and `Math.round(prices.pool)`). It is the one template: `page.mjs` bakes the three parts (escaped), and `app.js` rewrites the same three parts when the live prices win. The rewrite uses `bill.replaceChildren(before, <b>, after)` and sets the `<b>` to the figure, so the baked text and the live text cannot drift.
- `page.mjs` no longer imports `monthName`.
- `.bill` has `text-wrap: pretty`, so the line no longer leaves "bill." alone on the last line at 1280.
- The spec (section 2 item 4) now quotes the new sentence and adds "(Cyrus, Oct 30: the first wording felt too demanding.)". The plan's Task 7 Interfaces and test text quote it in both places.

Tests (RED first: the page sentence assertion failed, and `billParts` did not exist):
- page.test pins `<p class="bill">In October the cloud behind all this cost <b>$288</b>. Each tier is a slice of that bill.</p>`.
- view.test checks that `billParts` joined gives the full sentence (pool 287.6 rounds to $288) and that November and a pool of 300.2 give `In November ... $300`.

`node --test donate/test/*.test.mjs`: tests 13, pass 13, fail 0.

By hand, after a rebuild with the fixture: the baked bill on /arkos/ and the bill after app.js has run (the fallback path, which re-applies the baked prices through `billParts`) read the same sentence.

Screenshot looked at: /tmp/csarko-donate-site/arkos-desktop-dark.png, with the new line under the hero and the price figure in the accent.

Note: `body-of-work.png` is now Task 8's committed picture (31cae67), so the stand-in from round 0 is gone, and the home door builds from the real file.
