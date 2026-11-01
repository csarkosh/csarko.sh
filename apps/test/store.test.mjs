import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fontBlocks, motionTokens, STORE_TOKENS, TEXT_TOKENS, TINTS } from '../store.mjs';

const luminance = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

test('every text colour clears 4.5:1 on the page and on every band tint', () => {
  const surfaces = { paper: STORE_TOKENS['--paper'], ...Object.fromEntries(TINTS.map((t) => [t, STORE_TOKENS[`--${t}`]])) };
  for (const token of TEXT_TOKENS) {
    for (const [name, bg] of Object.entries(surfaces)) {
      const ratio = contrast(STORE_TOKENS[token], bg);
      assert.ok(ratio >= 4.5, `${token} on ${name} is ${ratio.toFixed(2)}:1`);
    }
  }
  assert.ok(contrast(STORE_TOKENS['--on-badge'], STORE_TOKENS['--badge']) >= 4.5, 'the badge');
  assert.ok(contrast(STORE_TOKENS['--white'], STORE_TOKENS['--ink']) >= 4.5, 'the black pill');
});

test('the fonts are faces on hashed files, with metric-matched fallbacks and the text face preloaded', () => {
  const { faces, preloads } = fontBlocks({ 'google-sans-flex-latin-var': 'google-sans-flex-latin-var.0123abcd.woff2', 'google-sans-code-latin-var': 'google-sans-code-latin-var.4567ef01.woff2' });
  assert.ok(faces.includes('font-family: "Google Sans Flex"; font-style: normal; font-weight: 300 700; font-display: swap;'));
  assert.ok(faces.includes('src: url("/assets/google-sans-code-latin-var.4567ef01.woff2") format("woff2");'));
  assert.ok(faces.includes('font-family: "Google Sans Flex Fallback"; src: local("Arial");'));
  assert.equal(preloads, '  <link rel="preload" href="/assets/google-sans-flex-latin-var.0123abcd.woff2" as="font" type="font/woff2" crossorigin />');
  assert.throws(() => fontBlocks({}), /no hashed file/);
});

test('the motion tokens come from the home page, the reduced-motion block with them', () => {
  const motion = motionTokens(readFileSync(new URL('../../public/index.html', import.meta.url), 'utf8'));
  assert.ok(/^:root \{ --md-easing-standard: cubic-bezier\(/.test(motion));
  assert.ok(motion.includes('--md-duration-medium2:') && motion.includes('prefers-reduced-motion: reduce'));
  assert.ok(!motion.includes('--accent'), 'only motion, none of the portfolio\'s colours');
  assert.throws(() => motionTokens('<style>:root { --x: 1; }</style>'), /motion tokens/);
});

test('the fonts the build hashes are in apps/fonts/ with their licence', () => {
  for (const stem of ['google-sans-flex-latin-var', 'google-sans-code-latin-var']) {
    const bytes = readFileSync(new URL(`../fonts/${stem}.woff2`, import.meta.url));
    assert.equal(bytes.subarray(0, 4).toString('latin1'), 'wOF2');
  }
  const ofl = readFileSync(new URL('../fonts/OFL.txt', import.meta.url), 'utf8');
  assert.ok(ofl.includes('Google Sans Flex') && ofl.includes('Google Sans Code') && ofl.includes('SIL Open Font License'));
});
