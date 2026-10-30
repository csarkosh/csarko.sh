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
