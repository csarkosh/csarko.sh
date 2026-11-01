### Task 7: The donate site

**Files:**
- Create: `donate/page.mjs` (pure: the door page, the thanks page, the CSS)
- Create: `donate/view.mjs` (pure, shared with the browser: `pickPrices`, `buttonLabel`, `backLink`)
- Create: `donate/public-src/app.js` (the page's one script, an ES module importing `/view.js`)
- Create: `donate/pictures.py` (landscape pictures: AVIF, WebP, JPEG at two widths, a 16:9 crop around `focusY` for a portrait source)
- Create: `donate/build.mjs`
- Test: `donate/test/page.test.mjs`, `donate/test/view.test.mjs`
- Modify: `.gitignore` (`donate/public/`)
- Modify: `package.json` at the root if one holds the test script; else document `node --test donate/test/*.test.mjs` in `donate/build.mjs`'s header.

**Interfaces:**
- Consumes: `DOORS`, `TIERS`, `CUSTOM`, `TIER_KEYS`, `PRICES_URL`, `DONATE_URL`, `doorByKey`, `shippedDoors` from `admin/api/src/donate/doors.mjs` (relative import `../admin/api/src/donate/doors.mjs`); `standaloneShell`, `themeBlocks`, `escapeHtml` from `.agents/skills/site-quality/scripts/docs_lib.mjs`; `iconSvg`, `ICON_CSS` (Task 6); the `prices.json` shape (Task 3).
- Produces (`view.mjs`): `pickPrices(baked, fetched, door): { prices, stale: boolean }` (`fetched` is the bucket's whole JSON; it wins when it is an object whose `month` is a string `>=` the baked one and whose `doors[door]` exists, reshaped to the baked shape `{ month, pool, tiers: [{ tier, usd, label }], links: { <tierKey>: url } }`; else `baked` with `stale: true`); `buttonLabel(tierKey, prices): string` (`Tip $9` for a tier, `Tip what you like` for `own`); `backLink(door, doors): { label, href }` (the door's `back` when `door` is a key in `doors`, else `{ label: "Back to the projects", href: "https://csarko.sh/projects" }`); `monthName("2026-10")` → `October`.
- Produces (`page.mjs`): `doorPage({ door, prices, picture, theme }): string` and `thanksPage({ theme, doors }): string` (door keys to `back` and `thanks`, baked as `<script type="application/json" id="doors">`; the markup without a script shows `<p class="lead" id="line">Tokens received.</p>` and `<a id="back" href="https://csarko.sh/projects">Back to the projects</a>`, which `app.js` replaces from the door), `DONATE_CSS`. The door page's markup, top to bottom inside `<main id="top" class="wrap"><article class="tip">`: `<p class="kicker">Buy Me Tokens · Arkos IDE</p>` (`Buy Me Tokens` alone for `all`), `<h1>` the headline, `<p class="lead">`, `<picture class="shot">` from `picture`, `<p class="bill">Everything I give away here cost <b>$288</b> to run in October. Each tier is a slice of that.</p>` (the figure is `Math.round(prices.pool)`, the month `monthName(prices.month)`), a `<fieldset class="tiers">` of five `<label class="tier">` each with `<input type="radio" name="tier" value="<key>">` (`context` checked), the name in `<b>`, the caption in `<small>`, the price in `<span class="price">$9<small>about 3%</small></span>` (the custom row: `<span class="price">any<small>$1 or more</small></span>`, class `tier own`), `<a id="pay" class="btn" href="<context link url>">Tip $9</a>`, `<p class="foot">Payments by Stripe · no account needed</p>`, then `<script type="application/json" id="prices">` holding `{ month, pool, tiers: [{tier, usd, label}], links: { <tierKey>: url } }` for this door only (no ids), and `<script type="module" src="/app.js">`. Styles: the mockup's tip card (`.superpowers/brainstorm/42116-1793373577/content/picture-placement.html`, the `.bmt` rules) rewritten on the site's tokens and type scale; `.tier:has(:checked)` for the selected row; the picture `aspect-ratio: 16 / 9; object-fit: cover`. Everything escaped through `escapeHtml`.
- Produces (`app.js`): on a door page, listens to the radios and sets `#pay`'s `href` and text; fetches `PRICES_URL` (`cache: "no-cache"`), applies `pickPrices`, rewrites the bill's `<b>` and month, each `.price`, each link, and when `stale` appends `<p class="note">Prices are from <month>.</p>` after the bill. On `/thanks`, reads `new URL(location).searchParams.get("door")`, looks it up in `#doors`, and sets the one link's text and `href` through `textContent`/`setAttribute` (never `innerHTML`), and the thanks line.
- Produces (`pictures.py`): `python3 -I donate/pictures.py --source <png|jpg> [--dark <png>] [--focus-y 0.3] --out <dir> --stem <door>` → writes `<stem>-<w>.<hash8>.{avif,webp,jpg}` for widths `(640, 1280)` (plus `<stem>-dark-...` when `--dark`), cropping a source taller than wide to 16:9 with the crop's centre at `focus_y` of the height (clamped), refusing a source that is taller than wide without `--focus-y`; prints JSON `{ "sets": { "light": { "avif": [...], "webp": [...], "jpg": [...] }, "dark": {...} }, "width": 1280, "height": 720 }` where each list is `"<file> <w>w"` srcset entries. Encoding as `build_assets.py`'s `encode()` (import it: `sys.path.insert(0, ".agents/skills/site-quality/scripts")`).
- Produces (`build.mjs`): `node donate/build.mjs [--prices <file>]` → `donate/public/`: fonts and favicons copied as `apps/build.mjs` does, `index.html` (door `all`), `<door>/index.html` per shipped door, `thanks/index.html`, `icon.svg` (`iconSvg()` with an XML prolog, no class), `view.js` (a copy of `view.mjs`), `app.js`, `404.html` (as the apps build makes it), `robots.txt`, `sitemap.xml` listing the door pages. Without `--prices` it fetches `PRICES_URL` and **fails** when the object is missing (`donate: no prices.json yet; the step has not run. Preview with --prices donate/test/fixtures/prices.json`). A shipped door without a picture source on disk fails the build by door name; a portrait source without `focusY` fails by door name; a door that is in `prices.doors` but not shipped is skipped with a log line; a shipped door missing from `prices.doors` fails (`no links for <door> yet; the next snapshot adds them`).

- [ ] **Step 1: Write the failing tests**

```js
// donate/test/view.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickPrices, buttonLabel, backLink, monthName } from '../view.mjs';

const BAKED = { month: '2026-10', pool: 288, tiers: [{ tier: 'prompt', usd: 3, label: 'about 1%' }, { tier: 'context', usd: 9, label: 'about 3%' }, { tier: 'run', usd: 29, label: 'about 10%' }, { tier: 'finetune', usd: 87, label: 'about 30%' }], links: { prompt: 'a', context: 'b', run: 'c', finetune: 'd', own: 'e' } };

test('the live JSON wins when it is this month or newer, the baked one otherwise, marked stale', () => {
  assert.deepEqual(pickPrices(BAKED, null), { prices: BAKED, stale: true });
  assert.deepEqual(pickPrices(BAKED, { month: '2026-09', doors: {} }), { prices: BAKED, stale: true });
  assert.deepEqual(pickPrices(BAKED, 'garbage'), { prices: BAKED, stale: true });
  const live = { month: '2026-11', pool: 300, tiers: BAKED.tiers, doors: { arkos: { links: { prompt: { url: 'x' } } } } };
  assert.equal(pickPrices(BAKED, live, 'arkos').stale, false);
  assert.equal(pickPrices(BAKED, live, 'arkos').prices.links.prompt, 'x');
});

test('the button says the price, or what you like', () => {
  assert.equal(buttonLabel('context', BAKED), 'Tip $9');
  assert.equal(buttonLabel('own', BAKED), 'Tip what you like');
  assert.equal(buttonLabel('nope', BAKED), 'Tip $9', 'an unknown tier falls back to the default one');
});

test('the thanks link: the door’s own, else the projects page; junk never passes through', () => {
  const doors = { arkos: { back: { label: 'Back to Arkos IDE', href: 'https://apps.csarko.sh/ide-arkos' }, thanks: 'Tokens received. The next agent run is on you.' } };
  assert.deepEqual(backLink('arkos', doors), doors.arkos.back);
  assert.deepEqual(backLink('<img onerror=1>', doors), { label: 'Back to the projects', href: 'https://csarko.sh/projects' });
  assert.deepEqual(backLink(null, doors), { label: 'Back to the projects', href: 'https://csarko.sh/projects' });
  assert.equal(monthName('2026-10'), 'October');
});
```

```js
// donate/test/page.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { doorPage, thanksPage, DONATE_CSS } from '../page.mjs';
import { doorByKey } from '../../admin/api/src/donate/doors.mjs';

const THEME = ':root { --bg: #0a0b0e; }\n    @media (prefers-color-scheme: light) { :root { --bg: #f6f7f9; } }';
const PICTURE = { sets: { light: { avif: ['arkos-640.abc.avif 640w', 'arkos-1280.abc.avif 1280w'], webp: ['arkos-640.abc.webp 640w'], jpg: ['arkos-640.abc.jpg 640w', 'arkos-1280.abc.jpg 1280w'] } }, width: 1280, height: 720 };
const PRICES = { month: '2026-10', pool: 288, tiers: [{ tier: 'prompt', name: 'A prompt', share: 0.01, label: 'about 1%', usd: 3 }, { tier: 'context', name: 'A long context window', share: 0.03, label: 'about 3%', usd: 9 }, { tier: 'run', name: 'A whole agent run', share: 0.1, label: 'about 10%', usd: 29 }, { tier: 'finetune', name: 'A fine-tune', share: 0.3, label: 'about 30%', usd: 87 }], links: { prompt: 'https://buy.stripe.com/p', context: 'https://buy.stripe.com/c', run: 'https://buy.stripe.com/r', finetune: 'https://buy.stripe.com/f', own: 'https://buy.stripe.com/o' } };

test('the Arkos door, top to bottom', () => {
  const html = doorPage({ door: doorByKey('arkos'), prices: PRICES, picture: PICTURE, theme: THEME });
  const at = (s) => { const i = html.indexOf(s); assert.ok(i >= 0, s); return i; };
  assert.ok(at('<p class="kicker">Buy Me Tokens · Arkos IDE</p>') < at('<h1>Fund my next agent run</h1>'));
  assert.ok(at('<h1>') < at('<picture class="shot">') && at('<picture class="shot">') < at('<p class="bill">'));
  at('Everything I give away here cost <b>$288</b> to run in October. Each tier is a slice of that.');
  assert.ok(html.includes('srcset="arkos-640.abc.avif 640w, arkos-1280.abc.avif 1280w"'));
  assert.ok(html.includes('width="1280" height="720"'));
  assert.equal((html.match(/<input type="radio" name="tier"/g) || []).length, 5);
  assert.ok(html.includes('value="context" checked'));
  assert.ok(html.includes('<b>A long context window</b><small>a whole feature, read end to end</small>'));
  assert.ok(html.includes('<span class="price">$9<small>about 3%</small></span>'));
  assert.ok(html.includes('<a id="pay" class="btn" href="https://buy.stripe.com/c">Tip $9</a>'));
  assert.ok(html.includes('Payments by Stripe · no account needed'));
  assert.ok(at('<script type="application/json" id="prices">') < at('<script type="module" src="/app.js">'));
  assert.ok(!html.includes('plink_') && !html.includes('price_'), 'no Stripe ids on the page');
  assert.ok(!/—/.test(html) && !/[a-z0-9._%+-]+@[a-z0-9-]+\.[a-z]{2,}/i.test(html.replace(/@font-face|@media/g, '')));
  assert.ok(html.includes('<title>Buy Me Tokens · Arkos IDE</title>'));
  assert.ok(html.includes('<link rel="canonical" href="https://donate.csarko.sh/arkos" />'));
});

test('the bare door says Buy Me Tokens alone and is canonical at the root', () => {
  const html = doorPage({ door: doorByKey('all'), prices: PRICES, picture: PICTURE, theme: THEME });
  assert.ok(html.includes('<p class="kicker">Buy Me Tokens</p>'));
  assert.ok(html.includes('<link rel="canonical" href="https://donate.csarko.sh/" />'));
});

test('the thanks page bakes every shipped door’s line and link, escaped', () => {
  const html = thanksPage({ theme: THEME, doors: { arkos: { back: doorByKey('arkos').back, thanks: doorByKey('arkos').thanks }, all: { back: { label: 'Back to the projects', href: 'https://csarko.sh/projects' }, thanks: 'Tokens received.' } } });
  assert.ok(html.includes('<script type="application/json" id="doors">'));
  assert.ok(html.includes('Tokens received. The next agent run is on you.'));
  assert.ok(html.includes('<a id="back" href="https://csarko.sh/projects">Back to the projects</a>'));
});

test('the CSS is tokens only and sizes the picture 16:9', () => {
  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(DONATE_CSS.replace(/#(top|pay|back|prices|doors)\b/g, '')));
  assert.ok(DONATE_CSS.includes('aspect-ratio: 16 / 9'));
  assert.ok(DONATE_CSS.includes('.tier:has(:checked)'));
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test donate/test/*.test.mjs`
Expected: FAIL, modules not found (the icon test passes).

- [ ] **Step 3: Write `view.mjs`, `page.mjs`, `public-src/app.js`, `pictures.py` and `build.mjs` to the Interfaces block; add `donate/public/` to `.gitignore`; create `donate/test/fixtures/prices.json` (the Task 3 shape for the six shipped doors with `https://buy.stripe.com/test_<door>_<tier>` URLs and placeholder ids)**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test donate/test/*.test.mjs`
Expected: PASS.

- [ ] **Step 5: Build with the fixture and look**

Run: `node donate/build.mjs --prices donate/test/fixtures/prices.json && (cd donate/public && python3 -m http.server 8789)` then screenshots of `/`, `/arkos`, `/last-trail`, `/thanks?door=arkos` at 1280 and 390 wide in both themes with headless Chrome (`.agents/skills/preview/scripts/preview.sh` shows the flags), and check: the picture is landscape on every door, the Last Trail crop keeps the woman and the radio in frame, the selected tier is visible, the button says `Tip $9`, nothing overflows at 390. Show Cyrus the screenshots in one message with the icon from Task 6 if not yet shown.

- [ ] **Step 6: Commit**

```bash
git add donate .gitignore
git commit -m "donate: the tip page, its build and the thanks page"
```

---

