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
  at('<p class="bill">In October the cloud behind all this cost <b>$288</b>. Each tier is a slice of that bill.</p>');
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

test('the CSS is tokens only and sizes the picture by its own shape', () => {
  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(DONATE_CSS.replace(/#(top|pay|back|prices|doors)\b/g, '')));
  assert.ok(!DONATE_CSS.includes('aspect-ratio: 16 / 9'), 'no fixed frame: a wide hero keeps its own shape');
  assert.ok(/\.shot img \{[^}]*height: auto;[^}]*object-fit: cover;/.test(DONATE_CSS));
  assert.ok(DONATE_CSS.includes('.tier:has(:checked)'));
  assert.ok(!/@keyframes|animation:/.test(DONATE_CSS), 'nothing animated');
});

test('a wide picture keeps its own width and height on the page', () => {
  const wide = { ...PICTURE, width: 1280, height: 432 };
  const html = doorPage({ door: doorByKey('arkos'), prices: PRICES, picture: wide, theme: THEME });
  assert.ok(html.includes('width="1280" height="432"'));
});

test('the baked prices name their door, and the bar links to the site', () => {
  const html = doorPage({ door: doorByKey('arkos'), prices: PRICES, picture: PICTURE, theme: THEME });
  const baked = JSON.parse(/<script type="application\/json" id="prices">(.*?)<\/script>/.exec(html)[1]);
  assert.equal(baked.door, 'arkos');
  assert.ok(html.includes('<a class="app-name" href="https://donate.csarko.sh">'));
});
