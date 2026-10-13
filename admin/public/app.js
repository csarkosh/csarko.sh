/**
 * The index: one card per app in apps.json, with its health, three or four KPIs against
 * the previous period and twelve weeks of trend, read from each app's /admin/kpis in
 * parallel. An app whose API fails still gets its card, marked Unreachable. A KPI whose
 * value is null (its source is not configured) shows a dash and names the secret to add.
 */

import { requireSession, signOut } from '/auth.js';
import { ago, delta, el, errorLine, status, tile } from '/charts.js';
import { loadApps, preview, source } from '/data.js';

const root = document.getElementById('top');
const grid = document.getElementById('apps');
const aside = document.getElementById('page-aside');

function appCard(app) {
  const card = el('section', { class: 'card app-card', 'aria-labelledby': `app-${app.slug}` });
  const head = el('div', { class: 'card-head' },
    el('h2', { class: 'card-title', id: `app-${app.slug}` }, el('a', { href: app.page }, app.name)),
    el('a', { class: 'home', href: app.home, target: '_blank', rel: 'noopener' }, app.home.replace(/^https?:\/\//, '')));
  card.append(head, el('p', { class: 'sub' }, el('a', { href: app.page }, 'Open the dashboard')), el('div', { class: 'tiles' }));
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
  card.querySelector('.tiles').replaceChildren(...tiles);
  for (const [part, message] of Object.entries(data.errors ?? {})) card.append(errorLine(`${part} failed.`, String(message)));
}

function unreachable(card, app, error) {
  card.querySelector('.card-head').append(status('critical', 'Unreachable'));
  card.querySelector('.tiles').remove();
  card.append(errorLine(`Unreachable: ${app.api}`, error.message));
}

/** All the cards are rendered together once every API has answered, so nothing shifts as they fill. */
async function load() {
  const data = source();
  let apps;
  try {
    apps = await loadApps();
  } catch (error) {
    grid.replaceChildren(el('section', { class: 'card' }, errorLine('apps.json could not be read.', error.message)));
    return;
  }
  const cards = apps.map((app) => appCard(app));
  await Promise.all(apps.map(async (app, i) => {
    try {
      fill(cards[i], app, await data.kpis(app));
    } catch (error) {
      unreachable(cards[i], app, error);
    }
  }));
  grid.replaceChildren(...cards);
}

/** The badge, and for a live page the signed-in account with its Sign out (the gate returns on its own). */
function asideControls(account) {
  aside.replaceChildren(el('span', { class: `badge ${preview ? 'sample' : 'live'}` }, preview ? 'Sample data' : 'Live'));
  if (account) {
    const out = el('button', { class: 'btn ghost small', type: 'button' }, 'Sign out');
    out.addEventListener('click', () => { signOut(); });
    aside.append(el('span', { class: 'who' }, account.email), out);
  }
}

if (preview) {
  asideControls(null);
  load();
} else {
  requireSession(root, (account) => {
    asideControls(account);
    load();
  });
}
