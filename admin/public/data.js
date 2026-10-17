/**
 * Where the pages read from: each app's API through fetchWithAuth, or, with `?preview`,
 * the fixed sample under /sample/ so the pages can be built and screenshotted with no
 * credentials. The shapes are the contract in admin/CONTRACT.md.
 */

import { fetchWithAuth } from '/auth.js';

export const RANGES = [
  { days: 1, label: 'Today' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
];

export const params = new URLSearchParams(location.search);
export const preview = params.has('preview');

export async function loadApps() {
  const response = await fetch('/apps.json', { cache: 'no-cache' });
  if (!response.ok) throw new Error(`apps.json: ${response.status}`);
  return response.json();
}

async function readJson(url, init) {
  let response;
  try {
    response = await fetchWithAuth(url, init);
  } catch (error) {
    throw new Error(`could not reach ${new URL(url, location.href).host}: ${error.message}`);
  }
  if (!response.ok) {
    // Every API answers a failure as `{ error }`; that message says whose fault it was.
    const body = await response.json().catch(() => null);
    const said = typeof body?.error === 'string' && body.error !== '' ? body.error : response.statusText || '';
    throw new Error(`${response.status}${said ? `: ${said}` : ''}`);
  }
  return response.json();
}

async function sampleJson(path) {
  const response = await fetch(path, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`sample ${path}: ${response.status}`);
  return response.json();
}

const DAY = 86_400_000;
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

/** The sample holds seven days; other ranges tile that week so every range has a chart. */
function tileDays(perDay, days, keys) {
  if (!Array.isArray(perDay) || perDay.length === 0) return [];
  const end = Date.parse(perDay[perDay.length - 1].day);
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const src = perDay[(perDay.length - 1 - (i % perDay.length))];
    const row = { day: isoDay(end - i * DAY) };
    for (const key of keys) {
      const v = src[key];
      row[key] = typeof v === 'number' ? (Number.isInteger(v) ? Math.round(v * (1 + ((i * 7) % 5) / 25)) : v) : v;
    }
    out.push(row);
  }
  return out;
}

const sum = (rows, key) => rows.reduce((n, r) => n + (r[key] ?? 0), 0);

function sampleRange(name, data, days) {
  if (days === 7) return data;
  const scale = days / 7;
  if (name === 'visits') {
    const cur = tileDays(data.current.perDay, days, ['visits', 'pageviews']);
    const prev = tileDays(data.previous.perDay, days, ['visits', 'pageviews']).map((r) => ({ ...r, day: isoDay(Date.parse(r.day) - days * DAY) }));
    return {
      ...data,
      days,
      from: cur[0]?.day ?? data.from,
      to: cur[cur.length - 1]?.day ?? data.to,
      current: { visits: sum(cur, 'visits'), pageviews: sum(cur, 'pageviews'), perDay: cur },
      previous: { visits: sum(prev, 'visits'), pageviews: sum(prev, 'pageviews'), perDay: prev },
    };
  }
  if (name === 'search') {
    const perDay = tileDays(data.perDay, days, ['clicks', 'impressions', 'ctr', 'position']);
    const clicks = sum(perDay, 'clicks');
    const impressions = sum(perDay, 'impressions');
    return {
      ...data,
      perDay,
      totals: { ...data.totals, clicks, impressions, ctr: impressions ? Math.round((clicks / impressions) * 1000) / 1000 : 0 },
      previous: { clicks: Math.round(data.previous.clicks * scale), impressions: Math.round(data.previous.impressions * scale) },
      queries: data.queries.map((q) => ({ ...q, clicks: Math.round(q.clicks * scale), impressions: Math.round(q.impressions * scale) })),
      pages: data.pages.map((p) => ({ ...p, clicks: Math.round(p.clicks * scale), impressions: Math.round(p.impressions * scale) })),
    };
  }
  const scaleRows = (rows, key = 'visitors') => (rows ?? []).map((r) => ({ ...r, [key]: Math.round((r[key] ?? 0) * scale) }));
  if (name === 'pages') return { rows: scaleRows(data.rows).map((r) => ({ ...r, pageviews: Math.round(r.pageviews * scale) })) };
  if (name === 'referrers') return { ...data, groups: scaleRows(data.groups), rows: scaleRows(data.rows), campaigns: scaleRows(data.campaigns) };
  if (name === 'events') return { ...data, rows: scaleRows(scaleRows(data.rows), 'clicks'), outboundVisitors: Math.round((data.outboundVisitors ?? 0) * scale) };
  if (name === 'audience') return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, scaleRows(v)]));
  return data;
}

/** A source: kpis(app), query(app, name, days, extra), manual(app, key, value). `extra` adds query parameters (Arkos's `who`); the sample ignores it. */
export function source() {
  if (preview) {
    return {
      kind: 'sample',
      async kpis(app) {
        const all = await sampleJson('/sample/kpis.json');
        const found = all[app.slug];
        if (!found) throw new Error(`no sample for ${app.slug}`);
        return found;
      },
      async query(app, name, days) {
        return sampleRange(name, await sampleJson(`/sample/${app.slug}/${name}.json`), days);
      },
      async manual() {
        return { ok: true, at: new Date().toISOString() };
      },
    };
  }
  return {
    kind: 'live',
    kpis: (app) => readJson(`${app.api}/admin/kpis`),
    query: (app, name, days, extra = {}) => readJson(`${app.api}/admin/query/${encodeURIComponent(name)}?${new URLSearchParams({ days, ...extra })}`),
    manual: (app, key, value) => readJson(`${app.api}/admin/manual/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value }),
    }),
  };
}
