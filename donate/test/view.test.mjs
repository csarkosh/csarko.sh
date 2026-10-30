import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickPrices, buttonLabel, backLink, monthName } from '../view.mjs';

const BAKED = { month: '2026-10', pool: 288, tiers: [{ tier: 'prompt', usd: 3, label: 'about 1%' }, { tier: 'context', usd: 9, label: 'about 3%' }, { tier: 'run', usd: 29, label: 'about 10%' }, { tier: 'finetune', usd: 87, label: 'about 30%' }], links: { prompt: 'a', context: 'b', run: 'c', finetune: 'd', own: 'e' } };

test('the live JSON wins when it is this month or newer, the baked one otherwise, marked stale', () => {
  assert.deepEqual(pickPrices(BAKED, null), { prices: BAKED, stale: true });
  assert.deepEqual(pickPrices(BAKED, { month: '2026-09', doors: {} }), { prices: BAKED, stale: true });
  assert.deepEqual(pickPrices(BAKED, 'garbage'), { prices: BAKED, stale: true });
  const links = (over = {}) => Object.fromEntries(['prompt', 'context', 'run', 'finetune', 'own'].map((t) => [t, { url: `https://buy.stripe.com/${t}` }]).concat(Object.entries(over)));
  const live = { month: '2026-11', pool: 300, tiers: BAKED.tiers, doors: { arkos: { links: links() } } };
  assert.equal(pickPrices(BAKED, live, 'arkos').stale, false);
  assert.equal(pickPrices(BAKED, live, 'arkos').prices.links.prompt, 'https://buy.stripe.com/prompt');
  assert.equal(pickPrices(BAKED, live, 'arkos').prices.door, 'arkos');
  // A live door missing a link, or carrying one that is not https, never wins: the button could
  // otherwise say one tier's price and pay another's.
  const without = links(); delete without.run;
  for (const doorLinks of [without, links({ run: { url: 'javascript:alert(1)' } }), links({ own: { url: 'http://buy.stripe.com/own' } }), links({ own: null })]) {
    assert.deepEqual(pickPrices(BAKED, { ...live, doors: { arkos: { links: doorLinks } } }, 'arkos'), { prices: BAKED, stale: true });
  }
  assert.deepEqual(pickPrices(BAKED, { ...live, doors: { arkos: null } }, 'arkos'), { prices: BAKED, stale: true });
  assert.deepEqual(pickPrices(BAKED, live, 'macstats'), { prices: BAKED, stale: true });
  assert.deepEqual(pickPrices(BAKED, { ...live, tiers: BAKED.tiers.slice(1) }, 'arkos'), { prices: BAKED, stale: true }, 'a tier without a live price');
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
