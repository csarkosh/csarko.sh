/**
 * The index: one card per app in apps.json, with its health, three or four KPIs against
 * the previous period and twelve weeks of trend, read from each app's /admin/kpis in
 * parallel. Every card is on the page at once, a skeleton of four tiles until its API
 * answers, and each fills on its own: a slow app never holds the others. An app whose
 * API fails still gets its card, marked Unreachable with the error in place of the tiles.
 * A KPI whose value is null (its source is not configured) shows a dash and names the
 * secret to add.
 */

import { accountMenu, requireSession } from '/auth.js';
import { ago, delta, el, errorLine, hold, loading, settle, status, tile } from '/charts.js';
import { loadApps, preview, source } from '/data.js';

const root = document.getElementById('top');
const grid = document.getElementById('apps');
const account = document.getElementById('account');

function appCard(app) {
  const card = el('section', { class: 'card app-card', 'aria-labelledby': `app-${app.slug}` });
  const head = el('div', { class: 'card-head' },
    el('h2', { class: 'card-title', id: `app-${app.slug}` }, el('a', { href: app.page }, app.name)),
    el('a', { class: 'home', href: app.home, target: '_blank', rel: 'noopener' }, app.home.replace(/^https?:\/\//, '')));
  card.append(head, el('p', { class: 'sub' }, el('a', { href: app.page }, 'Open the dashboard')), loading({ tiles: 4, tile: 156 }));
  return card;
}

/** The env name a KPI is waiting on, from the answer's notConfigured map (impressions share the search key). */
const missingFor = (data, key) => data.notConfigured?.[key] ?? (key === 'impressions' ? data.notConfigured?.search : null) ?? null;

function fill(card, app, data) {
  const health = data.health ?? {};
  card.querySelector('.card-head').append(status(health.status, health.note));
  card.querySelector('.sub').prepend(`Updated ${ago(data.at)}. `);
  const tiles = (data.kpis ?? []).slice(0, 4).map((k) => {
    const unit = k.unit && k.unit !== '%' ? ` ${k.unit}` : (k.unit ?? '');
    const has = typeof k.value === 'number';
    const env = has ? null : missingFor(data, k.key);
    return tile(k.label, has ? k.value : '–', {
      unit: has ? unit : '',
      delta: has ? delta(k.value, k.prev, { unit: k.unit ?? '', good: k.good ?? 'up' }) : undefined,
      note: has ? undefined : `Not configured${env ? ` (${env})` : ''}`,
      trend: k.trend,
      trendLabel: `${k.label}, the last ${k.trend?.length ?? 0} weeks`,
    });
  });
  const body = card.querySelector('.body');
  body.replaceChildren(el('div', { class: 'tiles' }, ...tiles),
    ...Object.entries(data.errors ?? {}).map(([part, message]) => errorLine(`${part} failed.`, String(message))));
  body.removeAttribute('aria-busy');
}

function unreachable(card, app, error) {
  card.querySelector('.card-head').append(status('critical', 'Unreachable'));
  const body = card.querySelector('.body');
  body.replaceChildren(errorLine(`Unreachable: ${app.api}`, error.message));
  body.removeAttribute('aria-busy');
}

/**
 * The cards go up at once as skeletons, before the sign-in is restored (apps.json is the
 * shell's own file and needs none), each held at the height it last had so nothing beside or
 * under it moves (Cyrus, 2026-10-29); each fills, or reports, as its API answers.
 */
const shown = loadApps().then((apps) => {
  const cards = apps.map((app) => appCard(app));
  grid.replaceChildren(...cards);
  cards.forEach((card, i) => hold(card, apps[i].slug));
  return { apps, cards };
});
// A failure is load()'s to report, in place of the cards; not an unhandled rejection meanwhile.
shown.catch(() => {});

async function load() {
  const data = source();
  let apps, cards;
  try {
    ({ apps, cards } = await shown);
  } catch (error) {
    grid.replaceChildren(el('section', { class: 'card' }, errorLine('apps.json could not be read.', error.message)));
    return;
  }
  await Promise.all(apps.map(async (app, i) => {
    try {
      fill(cards[i], app, await data.kpis(app));
    } catch (error) {
      unreachable(cards[i], app, error);
    }
    settle(cards[i], app.slug);
  }));
}

// The nav's account menu (the badge, the email, Sign out) is the shell's: auth.js renders it.
if (preview) {
  accountMenu(account, { preview: true });
  load();
} else {
  requireSession(root, (user) => {
    accountMenu(account, { account: user });
    load();
  });
}
