/**
 * Where the pages read from: each app's API through fetchWithAuth, or, with `?preview`,
 * the fixed sample under /sample/ so the pages can be built and screenshotted with no
 * credentials. The shapes are the contract in admin/CONTRACT.md.
 */

import { fetchWithAuth, idToken } from '/auth.js';
import { savedId } from '/saved-id.js';

export const RANGES = [
  { days: 1, label: 'Today' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
];

export const params = new URLSearchParams(location.search);
export const preview = params.has('preview');

/**
 * The chips keep their state in the address (Cyrus, 2026-10-29), so a refresh or a shared link
 * opens on the same view: `?range=30`, `?who=me`, and one parameter a card's filter row. A row at
 * its default leaves its parameter out; the other parameters (`preview` among them) are kept.
 */
export function readParam(name) {
  return new URLSearchParams(location.search).get(name);
}
export function writeParam(name, value) {
  const url = new URL(location.href);
  if (value === null || value === undefined) url.searchParams.delete(name);
  else url.searchParams.set(name, value);
  // Commas stay commas, so a list reads as one (`sessions=first,lost`); the values are ids. A
  // bare flag stays bare (`?preview`, not `?preview=`): no chip writes an empty value.
  const search = url.search.replace(/%2C/gi, ',').replace(/=(?=&|$)/g, '');
  history.replaceState(history.state, '', url.pathname + search + url.hash);
}

/** The range the address names, else the default. */
export function readRange(fallback = 7) {
  const days = Number(readParam('range'));
  return RANGES.some((r) => r.days === days) ? days : fallback;
}
export const writeRange = (days, fallback = 7) => writeParam('range', days === fallback ? null : String(days));

/**
 * A filter row's toggles from the address: the ids it names (`none` for no toggle on), or the
 * row's defaults when it names none. Ids it does not know are dropped.
 */
export function readToggles(name, ids, defaults) {
  const raw = readParam(name);
  if (raw === null) return new Set(defaults);
  return new Set(raw.split(',').filter((id) => ids.includes(id)));
}
export function writeToggles(name, on, defaults) {
  const same = on.size === defaults.length && defaults.every((id) => on.has(id));
  writeParam(name, same ? null : [...on].join(',') || 'none');
}

/** The reader's IANA zone, the browser's own: every API cuts its days in it and every clock on the pages shows it. */
export const viewerZone = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
})();

/** The zone in words for the pages' copy: "Pacific Time", "Eastern Time", "UTC". */
export const viewerZoneName = (() => {
  if (viewerZone === 'UTC') return 'UTC';
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: viewerZone, timeZoneName: 'longGeneric' }).formatToParts(Date.now()).find((p) => p.type === 'timeZoneName')?.value || viewerZone;
  } catch {
    return viewerZone;
  }
})();

/** The hour UTC midnight falls on in the reader's zone, "5 pm", for the copy that says when a UTC day rolls. */
export function utcMidnightHere(now = Date.now()) {
  const d = new Date(now);
  const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  return new Intl.DateTimeFormat('en-US', { timeZone: viewerZone, hour: 'numeric', minute: '2-digit' }).format(midnight).replace(':00', '').toLowerCase();
}

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
  // A page that scopes by something other than days (finance's `range`) gets the file as it is.
  if (days === 7 || days === null || days === undefined) return data;
  // The Films card has no day view: the API answers 1 as 7.
  if (name === 'films' && days === 1) return data;
  const scale = days / 7;
  if (name === 'films') {
    const counts = ['views', 'estimatedMinutesWatched', 'subscribersGained', 'likes', 'shares', 'comments'];
    const scaled = (m) => (m ? { ...m, ...Object.fromEntries(counts.map((k) => [k, Math.round((m[k] ?? 0) * scale)])) } : m);
    const rows = (list) => (list ? list.map((r) => ({ ...r, views: Math.round(r.views * scale), minutes: Math.round(r.minutes * scale) })) : list);
    const end = Date.parse(data.to);
    return {
      ...data,
      days,
      from: isoDay(end - (days - 1) * DAY),
      films: data.films.map((f) => ({ ...f, totals: scaled(f.totals), prev: scaled(f.prev), daily: tileDays(f.daily, days, [...counts, 'averageViewDuration', 'averageViewPercentage']), sources: rows(f.sources), external: rows(f.external) })),
      others: (data.others ?? []).map((o) => ({ ...o, totals: scaled(o.totals), prev: scaled(o.prev) })),
    };
  }
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

/**
 * The answer an app's API last gave for this request, saved in Firestore (apps.json `saved`, the
 * collection; admin/api/src/saved.mjs): `{ at, answer }`, or null when there is none to show (no
 * `saved` for the app, not signed in, none yet, refused, any failure). The page draws it at once and
 * then the live answer; a null only means it waits for the live one, as before.
 */
async function readSaved(app, path, query) {
  if (!app?.saved) return null;
  try {
    const token = await idToken();
    if (!token) return null;
    const id = savedId(app.slug, path, query);
    const response = await fetch(`${app.saved}/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token}` }, credentials: 'omit', mode: 'cors' });
    if (!response.ok) return null;
    const fields = (await response.json())?.fields ?? {};
    const at = fields.at?.stringValue;
    const body = fields.body?.stringValue;
    if (typeof at !== 'string' || typeof body !== 'string') return null;
    return { at, answer: JSON.parse(body) };
  } catch {
    return null;
  }
}

/** The parameters a query sends, as one object: `query()` sends them and `saved()` names its document by them. */
const queryParams = (days, extra = {}) => ({ ...(days === null || days === undefined ? {} : { days: String(days) }), tz: viewerZone, ...extra });

/**
 * A source: kpis(app), query(app, name, days, extra), manual(app, key, value), and the saved
 * answers of the first two, savedKpis(app) and saved(app, name, days, extra), which the sample has none of. Every live request
 * carries `tz` (viewerZone); `extra` adds query parameters (Arkos's `who`); the sample ignores both.
 * A page whose API scopes by something other than days passes `days` as null and the scope in
 * `extra` (finance's `range=month|last|90|13m`): no `days` is sent, and the sample file under
 * /sample/<slug>/<name>.json is served as it is for every range.
 */
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
      async savedKpis() {
        return null;
      },
      async saved() {
        return null;
      },
    };
  }
  return {
    kind: 'live',
    kpis: (app) => readJson(`${app.api}/admin/kpis?${new URLSearchParams({ tz: viewerZone })}`),
    query: (app, name, days, extra = {}) => readJson(`${app.api}/admin/query/${encodeURIComponent(name)}?${new URLSearchParams(queryParams(days, extra))}`),
    savedKpis: (app) => readSaved(app, '/admin/kpis', { tz: viewerZone }),
    saved: (app, name, days, extra = {}) => readSaved(app, `/admin/query/${name}`, queryParams(days, extra)),
    manual: (app, key, value) => readJson(`${app.api}/admin/manual/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value }),
    }),
  };
}
