### Task 6: The icon

**Files:**
- Create: `donate/icon.mjs`
- Test: `donate/test/icon.test.mjs`

**Interfaces:**
- Produces: `PALETTE` (ten letters to the ten fixed fills: `O m s h H` the heart's outline, mid-tone, shadow, highlight, top highlight; `g G c l L` the token's outline, mid-tone, shadow, highlight, top highlight), `PIXELS: string[22]` each 32 characters of palette letters or `.`, `iconSvg({ className = "tokens-icon" } = {}): string` (one `<svg viewBox="0 0 32 22" shape-rendering="crispEdges" aria-hidden="true" class="...">` with one `<rect>` per horizontal run of one colour), `iconSymbol(): string` (`<svg hidden><symbol id="tokens-icon" ...>rects</symbol></svg>`), `iconUse({ className = "tokens-icon" } = {}): string` (`<svg class="..." aria-hidden="true"><use href="#tokens-icon"/></svg>`), `ICON_CSS` (`.tokens-icon { width: calc(1em * 32 / 22); height: 1em; vertical-align: -0.12em; margin-right: 0.35em; flex: none; }`).

- [ ] **Step 1: Write the failing test**

```js
// donate/test/icon.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PALETTE, PIXELS, iconSvg, iconSymbol, iconUse, ICON_CSS } from '../icon.mjs';

test('a 32 by 22 map in the ten fixed colours', () => {
  assert.equal(PIXELS.length, 22);
  assert.ok(PIXELS.every((row) => row.length === 32));
  assert.deepEqual(Object.values(PALETTE).sort(), ['#6b1113', '#7a5600', '#b32d33', '#c8962a', '#e5484d', '#f0c040', '#ff7a80', '#ffd6d8', '#ffe08a', '#fff7d6']);
  const letters = new Set(Object.keys(PALETTE));
  assert.ok(PIXELS.every((row) => [...row].every((c) => c === '.' || letters.has(c))));
});

test('the cleft is about a quarter deep, the lobes start near the top, the token sits at the lower right, no hole in the heart', () => {
  const top = (x) => PIXELS.findIndex((row) => row[x] !== '.');
  assert.ok(top(15) >= 5 && top(16) >= 5, `cleft depth ${top(15)}`);
  assert.ok(top(7) <= 2 && top(23) <= 2, 'the lobes');
  const gold = new Set(['g', 'G', 'c', 'l', 'L']);
  assert.ok(PIXELS.slice(12).some((row) => [...row.slice(20)].some((c) => gold.has(c))), 'a token at the lower right');
  for (const [y, row] of PIXELS.entries()) {
    const heart = [...row].map((c, x) => ['O', 'm', 's', 'h', 'H'].includes(c) ? x : -1).filter((x) => x >= 0);
    if (heart.length === 0 || y < top(15)) continue;
    for (let x = heart[0]; x <= heart.at(-1); x++) assert.notEqual(row[x], '.', `hole at ${x},${y}`);
  }
});

test('the SVG is crisp, hidden from readers, one rect per run, and the symbol and use agree', () => {
  const svg = iconSvg();
  assert.ok(svg.startsWith('<svg viewBox="0 0 32 22" shape-rendering="crispEdges" aria-hidden="true" class="tokens-icon">'));
  assert.ok(svg.includes('fill="#e5484d"'));
  assert.ok(!svg.includes('<script'));
  assert.ok(iconSymbol().includes('<symbol id="tokens-icon" viewBox="0 0 32 22"'));
  assert.equal(iconUse(), '<svg class="tokens-icon" aria-hidden="true"><use href="#tokens-icon"/></svg>');
  assert.ok(ICON_CSS.includes('height: 1em') && ICON_CSS.includes('margin-right: 0.35em'));
  const rects = (svg.match(/<rect /g) || []).length;
  const runs = PIXELS.reduce((n, row) => n + (row.match(/([^.])\1*/g) || []).length, 0);
  assert.equal(rects, runs);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test donate/test/icon.test.mjs`
Expected: FAIL, module not found.

- [ ] **Step 3: Draw the pixels and write `icon.mjs`**

Start from the brainstorm's generator (`.superpowers/brainstorm/42116-1793373577/content/icon-a-cleft-v3.html`, the "deeper" variant: heart from two circles of radius 6 at x = 16 ± 5.4 plus a triangle, rows filled below the cleft; token of radius 6 centred at (19, 9) in that grid), then hand-correct until the test passes and the sprite reads at 16px. Render `donate/test/icon-preview.html` (git-ignored, under `/tmp/`) showing the icon at 1em beside "Buy me tokens" in 14px Inter and at 8x, in both themes, and **show it to Cyrus before committing**. Iterate on his word.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test donate/test/icon.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit (after Cyrus's OK)**

```bash
git add donate/icon.mjs donate/test/icon.test.mjs
git commit -m "donate: the heart and token icon, one pixel map"
```

---

