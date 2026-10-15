/**
 * The csarko.sh dashboard (spec 2.5): a range row, then nine cards in order, each
 * loading its own query (or two) and showing its own error line. Visitors, where they
 * come from, what they read, where they go next, journeys, search, reach, health, audience.
 *
 * The API (admin/api, shapes in admin/CONTRACT.md) answers `null` for any part whose
 * credential is missing, with `notConfigured: { <part>: "<ENV NAME>" }` naming the secret
 * to add, and `errors: { <part>: "<message>" }` for a part that failed; every card renders
 * those as "Not configured (ENV)" in --faint or as its error line, never as a blank or 0.
 * A visit is one browser on one day, so every `pageviews` field is null and nothing here
 * shows one.
 */

import { accountMenu, requireSession } from '/auth.js';
import { ago, bars, columns, compact, delta, el, errorLine, folded, loading, pct, shortDay, status, table, tile } from '/charts.js';
import { RANGES, loadApps, preview, source } from '/data.js';

const SLUG = 'csarko.sh';
const root = document.getElementById('top');
const grid = document.getElementById('cards');
const rangeRow = document.getElementById('range');
const account = document.getElementById('account');

const data = source();
let app = null;
let range = 7;
let generation = 0;

const rangeText = (days) => (days === 1 ? 'the last 24 hours' : `the last ${days} days`);
const previousText = (days) => (days === 1 ? 'the 24 hours before' : `the ${days} days before`);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const num = (v) => (isNum(v) ? v : 0);
const str = (v) => (v === null || v === undefined ? '' : String(v));
const mono = (v) => el('span', { class: 'mono' }, str(v));
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');
const dayBars = (perDay, key) => perDay.map((r) => ({ label: shortDay(r.day), value: num(r[key]), detail: r.day }));
/** The env name the API says is missing for `part`, from the answer's notConfigured map. */
const missing = (answer, ...parts) => parts.map((p) => answer?.notConfigured?.[p]).find(Boolean) ?? null;
/** "Not configured (ENV)" in --faint: the source has no credential yet. */
const notConfigured = (env, what = '') => el('p', { class: 'empty' }, `${what ? `${what}: ` : ''}Not configured${env ? ` (${env})` : ''}`);
/** The answers' `errors` maps as one error line per failed part, or nothing. */
function errorLines(...answers) {
  const lines = [];
  for (const a of answers) for (const [part, message] of Object.entries(a?.errors ?? {})) lines.push(errorLine(`${part} failed.`, str(message)));
  return lines;
}

// ---------------------------------------------------------------- the eight cards

function visitorsCard([visits], days) {
  const cur = visits.current;
  const prev = visits.previous;
  if (!cur) return [notConfigured(missing(visits, 'visits'))];
  const prevDays = prev?.perDay ?? [];
  const tiles = el('div', { class: 'tiles compact' },
    tile('Visits', cur.visits, { delta: delta(cur.visits, prev?.visits, { vs: previousText(days) }) }));
  const chart = columns(dayBars(cur.perDay ?? [], 'visits'), {
    previous: prev ? (cur.perDay ?? []).map((_, i) => num(prevDays[i]?.visits)) : null,
    label: `Visits per day, ${rangeText(days)}: ${compact(num(cur.visits))} in all${prev ? ` against ${compact(num(prev.visits))} ${previousText(days)}` : ''}`,
    currentLabel: cap(rangeText(days)),
    previousLabel: cap(previousText(days)),
  });
  const rows = (cur.perDay ?? []).map((r, i) => ({ day: r.day, visits: num(r.visits), prevDay: prevDays[i]?.day ?? '', prevVisits: isNum(prevDays[i]?.visits) ? prevDays[i].visits : null }));
  const list = folded('Per day', table([
    { key: 'day', label: 'Day', render: mono },
    { key: 'visits', label: 'Visits', num: true },
    { key: 'prevDay', label: 'Previous day', render: mono },
    { key: 'prevVisits', label: 'Its visits', num: true },
  ], rows));
  return [...errorLines(visits), tiles, chart, list];
}

function referrersCard([refs]) {
  if (!refs.groups) return [notConfigured(missing(refs, 'visits'))];
  const groups = refs.groups.map((g) => ({ name: cap(g.group), value: num(g.visitors), detail: `${cap(g.group)} referrers` }));
  const chart = groups.length ? bars(groups, { label: 'Visitors by referrer group' }) : el('p', { class: 'empty' }, 'No referrers in this range.');
  const raw = folded(`Referrers · ${refs.rows?.length ?? 0}`, refs.rows ? table([
    { key: 'referrer', label: 'Referrer', render: mono },
    { key: 'group', label: 'Group', render: (v) => cap(str(v)) },
    { key: 'visitors', label: 'Visitors', num: true },
  ], [...refs.rows].sort((a, b) => b.visitors - a.visitors), 'No referrers in this range.') : notConfigured(missing(refs, 'visits')));
  const campaigns = folded(`Campaigns · ${refs.campaigns?.length ?? 0}`, refs.campaigns ? table([
    { key: 'campaign', label: 'Campaign', render: mono },
    { key: 'visitors', label: 'Visitors', num: true },
  ], [...refs.campaigns].sort((a, b) => b.visitors - a.visitors), 'No tagged links were followed in this range.') : notConfigured(missing(refs, 'visits')));
  const paths = folded('Paths through the site', table([
    { key: 'from', label: 'From', render: mono },
    { key: 'to', label: 'To', render: mono },
    { key: 'visitors', label: 'Visitors', num: true },
  ], refs.paths ?? [], 'No internal navigation in this range.'));
  return [...errorLines(refs), chart, raw, campaigns, paths];
}

function pagesCard([pages]) {
  if (!pages.rows) return [notConfigured(missing(pages, 'visits'))];
  const rows = [...pages.rows].sort((a, b) => b.visitors - a.visitors);
  const known = rows.some((r) => r.inSitemap !== null && r.inSitemap !== undefined);
  const live = rows.filter((r) => r.inSitemap !== false);
  const notFound = rows.filter((r) => r.inSitemap === false);
  const cols = [
    { key: 'path', label: 'Page', wrap: true, render: (v, row) => el('span', { class: 'page-cell' }, mono(v), row.title ? el('small', {}, str(row.title)) : null) },
    { key: 'visitors', label: 'Visitors', num: true },
    { key: 'engagedMedian', label: 'Median engaged', num: true, render: (v) => (isNum(v) ? `${v}s` : '') },
    { key: 'reached', label: 'Read to the end', num: true, render: (v) => (isNum(v) ? pct(v) : '') },
  ];
  const parts = [...errorLines(pages), table(cols, live.slice(0, 8), 'No visits in this range.')];
  if (live.length > 8) parts.push(folded(`All pages · ${live.length}`, table(cols, live)));
  parts.push(folded(`404 paths · ${known ? notFound.length : '?'}`, known
    ? table([{ key: 'path', label: 'Path asked for', render: mono }, { key: 'visitors', label: 'Visitors', num: true }], notFound, 'Nobody hit a missing page in this range.')
    : notConfigured(missing(pages, 'sitemap'), 'The sitemap was not read, so 404 paths cannot be told apart')));
  return parts;
}

const KINDS = { out: 'Outbound', play: 'Play', watch: 'Watch', read: 'Read to the end', nav: 'Navigation', other: 'Other' };

function eventsCard([events, visits], days) {
  if (!events.rows) return [notConfigured(missing(events, 'visits'))];
  const rows = events.rows;
  const byKind = (kind) => rows.filter((r) => r.kind === kind).reduce((n, r) => n + num(r.visitors), 0);
  // The API's distinct count of visitors who clicked out; without it (older answers) the per-link
  // visitor counts are summed, which counts a visitor once per link.
  const distinct = isNum(events.outboundVisitors);
  const out = distinct ? events.outboundVisitors : byKind('out');
  const total = visits?.current ? num(visits.current.visits) : null;
  const rate = isNum(events.outboundRate) ? events.outboundRate : null;
  const tiles = el('div', { class: 'tiles' },
    tile(distinct ? 'Visitors who clicked out' : 'Outbound clicks', out, { note: rate === null ? 'LinkedIn, GitHub, Substack, YouTube' : `${pct(rate)} of home page visitors went on to a profile` }),
    tile('Went to play', byKind('play'), { note: 'Play in your browser, on /games' }),
    tile('Went to watch', byKind('watch'), { note: 'Watch on YouTube, on /film' }),
    tile('Read to the end', byKind('read'), { note: 'Reached the last line of a doc' }));
  const funnel = total === null
    ? el('p', { class: 'empty' }, 'Visits are not available, so the share of visits cannot be drawn.')
    : bars([
      { name: 'Visits', value: total, detail: `Visits ${rangeText(days)}` },
      { name: 'Clicked out', value: out, detail: distinct ? 'Visitors who clicked out' : 'Outbound clicks' },
      { name: 'Went to play', value: byKind('play'), detail: 'Play clicks' },
      { name: 'Went to watch', value: byKind('watch'), detail: 'Watch clicks' },
    ], { ramp: true, share: true, label: 'From a visit to a click out, as a share of visits' });
  const list = folded(`Events · ${rows.length}`, table([
    { key: 'name', label: 'Event', render: mono },
    { key: 'kind', label: 'Kind', render: (v) => KINDS[str(v)] ?? cap(str(v)) },
    { key: 'visitors', label: 'Visitors', num: true },
    { key: 'clicks', label: 'Clicks', num: true, render: (v) => (isNum(v) ? v.toLocaleString('en-US') : '') },
  ], [...rows].sort((a, b) => b.visitors - a.visitors), 'No events in this range: the public site has none wired yet.'));
  return [...errorLines(events, visits), tiles, el('h3', {}, 'Share of visits'), funnel, list];
}

// ---------------------------------------------------------------- journeys

/** Seconds as "41s" or "3m 05s": the engaged and visible figures. */
const duration = (s) => { const n = Math.max(0, Math.round(s)); return n >= 60 ? `${Math.floor(n / 60)}m ${String(n % 60).padStart(2, '0')}s` : `${n}s`; };
/** Seconds as m:ss: positions on the timeline and spans. */
const clock = (s) => { const n = Math.max(0, Math.round(s)); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; };
const SOURCE_NAMES = { 'google.com': 'Google', 'bing.com': 'Bing', 'duckduckgo.com': 'DuckDuckGo', 'github.com': 'GitHub', 'linkedin.com': 'LinkedIn', 'substack.com': 'Substack', 'youtube.com': 'YouTube', 'chatgpt.com': 'ChatGPT', 't.co': 'X' };
/** The host's name by suffix (www.google.com is Google too), else the host as given. */
function hostName(host) {
  const h = str(host).toLowerCase();
  for (const [suffix, name] of Object.entries(SOURCE_NAMES)) if (h === suffix || h.endsWith(`.${suffix}`)) return name;
  return str(host);
}
const sourceName = (src) => (src?.kind === 'external' ? hostName(src.host) || 'Elsewhere' : src?.kind === 'internal' ? 'This site' : 'Direct');
const ARROW_SVG = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M2 8h11M9 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const arrow = () => { const a = el('li', { class: 'j-arrow', 'aria-hidden': 'true' }); a.innerHTML = ARROW_SVG; return a; };

const NY_CLOCK = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
/** The visit's start on a New York wall clock, "Wed 3:41 pm"; with the date once the weekday alone is ambiguous, "Wed 8 Oct 3:41 pm". */
function wallClock(iso, now) {
  const ms = Date.parse(str(iso));
  if (!Number.isFinite(ms)) return '';
  const p = Object.fromEntries(NY_CLOCK.formatToParts(ms).filter((x) => x.type !== 'literal').map((x) => [x.type, x.value]));
  const date = now - ms > 6 * 86_400_000 ? ` ${p.day} ${p.month}` : '';
  return `${p.weekday}${date} ${p.hour}:${p.minute} ${str(p.dayPeriod).toLowerCase()}`;
}

/** "Chrome 155 · macOS · 1512×982 · America/New_York · dark · touch · en-US", the unknowns left out. */
function deviceLine(d) {
  if (!d) return '';
  const vp = Array.isArray(d.viewport) && isNum(d.viewport[0]) && isNum(d.viewport[1]) ? `${d.viewport[0]}×${d.viewport[1]}` : '';
  return [[d.browser, d.version].map(str).filter(Boolean).join(' '), d.os, vp, d.tz, d.theme, d.touch === true ? 'touch' : '', d.lang].map(str).filter(Boolean).join(' · ');
}

/** The LCP chip: the figure, graded by Google's thresholds (good to 2.5 s, needs work to 4 s, poor past it), with CLS and INP in small beside it. */
function lcpChip(s) {
  if (!isNum(s.lcp)) return null;
  const sec = s.lcp / 1000;
  const grade = sec <= 2.5 ? 'good' : sec <= 4 ? 'needs' : 'poor';
  const word = grade === 'good' ? 'good' : grade === 'needs' ? 'needs work' : 'poor';
  const extra = [isNum(s.cls) ? `CLS ${s.cls.toFixed(2)}` : '', isNum(s.inp) ? `INP ${Math.round(s.inp)} ms` : ''].filter(Boolean);
  const text = `LCP ${sec.toFixed(1)} s`;
  const chip = el('span', { class: `j-lcp ${grade}`, title: `${text}, ${word}` }, text);
  if (grade !== 'good') chip.append(el('small', {}, ` · ${word}`));
  if (!extra.length) return chip;
  return el('span', { class: 'j-vitals' }, chip, el('span', { class: 'j-small' }, extra.join(' · ')));
}

const NAV_TAGS = { reload: 'reloaded', back_forward: 'back', prerender: 'prerendered' };

/** One page of a journey: when it was reached, its title and path, how far it was scrolled, how long it was visible and on screen, its LCP. */
function pageNode(s, i) {
  const at = num(s.at);
  const secs = isNum(s.secs) ? s.secs : null;
  const onPage = isNum(s.left) ? Math.max(0, s.left - at) : null;
  const kicker = el('span', { class: 'j-kicker' }, `Page ${i + 1} · at ${clock(at)}`);
  if (NAV_TAGS[s.nav]) kicker.append(' ', el('span', { class: 'j-tag' }, NAV_TAGS[s.nav]));
  const depthKnown = isNum(s.depth);
  const depthPct = depthKnown ? Math.max(0, Math.min(100, Math.round(s.depth))) : 0;
  const depth = el('span', { class: 'j-depth', role: 'img', 'aria-label': depthKnown ? `Scrolled ${depthPct}%` : 'No scroll depth recorded' }, el('span', { style: `width:${depthPct}%` }));
  const scrolled = el('span', { class: 'j-small' }, depthKnown ? `scrolled ${depthPct}%` : secs === null ? 'no leave beacon' : 'no scroll depth');
  const read = s.read === true ? el('span', { class: 'j-badge' }, 'read to the end') : s.read === false ? el('span', { class: 'j-small' }, 'not to the end') : null;
  const time = el('span', { class: 'j-time' }, secs === null ? '–' : duration(secs), el('small', {}, ' visible'));
  const wall = onPage !== null && (secs === null || Math.round(onPage) !== Math.round(secs)) ? el('span', { class: 'j-small' }, `on page ${clock(onPage)}`) : null;
  return el('li', { class: 'j-node' }, kicker,
    el('span', { class: 'j-title', title: str(s.title || s.path) }, str(s.title || s.path)),
    el('span', { class: 'j-path mono', title: str(s.path) }, str(s.path)),
    depth, scrolled, read, lcpChip(s), time, wall);
}

/** How the visit ended: the click out, or the last time the visitor was seen. */
function exitNode(exit, lastSeen) {
  if (exit?.kind === 'click') {
    return el('li', { class: 'j-node edge' },
      el('span', { class: 'j-kicker' }, 'Left by a click'),
      el('span', { class: 'j-main' }, `Clicked out to ${str(exit.host) || 'a link'}`),
      el('span', { class: 'j-small mono', title: str(exit.url || exit.event) }, exit.event ? `event ${exit.event}` : str(exit.url) || 'no event name or url'));
  }
  return el('li', { class: 'j-node edge' },
    el('span', { class: 'j-kicker' }, 'Exit'),
    el('span', { class: 'j-main' }, lastSeen === null ? 'Ended here' : 'Left'),
    el('span', { class: 'j-small' }, lastSeen === null ? 'no leave beacon from the last page' : `last seen +${clock(lastSeen)}`));
}

/** One visit: its header and device, then left to right from where it came to how it left, and the strip of time on each page. */
function journey(j, now) {
  const steps = Array.isArray(j.steps) ? j.steps : [];
  const first = steps[0];
  const last = steps[steps.length - 1];
  const lastLeft = steps.reduce((m, s) => (isNum(s.left) ? Math.max(m, s.left) : m), -1);
  const lastSeen = lastLeft >= 0 ? lastLeft : last && isNum(last.secs) ? num(last.at) + last.secs : null;
  const span = lastSeen !== null && first ? lastSeen - num(first.at) : null;
  const n = steps.length;
  const src = j.source ?? { kind: 'direct' };
  const from = el('li', { class: 'j-node edge' },
    el('span', { class: 'j-kicker' }, 'Arrived from'),
    el('span', { class: 'j-main' }, sourceName(src)),
    el('span', { class: 'j-small mono', title: str(src.kind === 'internal' ? src.path : src.host) || null }, src.kind === 'external' ? str(src.host) : src.kind === 'internal' ? str(src.path) || 'an earlier page' : 'no referrer'));
  const items = [from];
  steps.forEach((s, i) => items.push(arrow(), pageNode(s, i)));
  items.push(arrow(), exitNode(j.exit, lastSeen));
  // The strip: one segment per page, sized by its wall time (left - at), by its visible time when the leave is unknown.
  const sized = steps.map((s) => ({ path: str(s.path), size: isNum(s.left) ? Math.max(0, s.left - num(s.at)) : isNum(s.secs) ? s.secs : 0 })).filter((s) => s.size > 0);
  const strip = sized.length
    ? el('div', { class: 'j-strip', role: 'img', 'aria-label': `Time on each page: ${sized.map((s) => `${s.path} ${clock(s.size)}`).join(', ')}` },
      ...sized.map((s, i) => el('span', { style: `flex:${s.size} 1 0`, class: `ord-${Math.min(4, sized.length - i)}`, title: `${s.path}: ${clock(s.size)}` })))
    : null;
  const head = el('p', { class: 'j-head' },
    el('span', { class: 'j-when' }, wallClock(j.started, now)),
    ` · ${ago(j.started, now)} · ${isNum(j.engaged) ? `${duration(j.engaged)} engaged` : 'no engaged time'} · ${n} page${n === 1 ? '' : 's'}${span !== null ? ` over ${clock(span)}` : ''}`);
  const chips = [];
  if (num(j.stitched) > 0) chips.push(el('span', { class: 'badge' }, 'stitched across midnight'));
  if (j.suspect) chips.push(el('span', { class: 'badge warn' }, 'suspect: UTC clock, no engaged time'));
  if (src.campaign) chips.push(el('span', { class: 'badge' }, `tagged ${str(src.campaign)}`));
  const device = deviceLine(j.device);
  const meta = el('div', { class: 'j-meta' }, device ? el('span', { class: 'j-device mono' }, device) : null, chips.length ? el('span', { class: 'tags j-chips' }, ...chips) : null);
  return el('li', { class: `journey${j.suspect ? ' suspect' : ''}` }, head, meta, el('ol', { class: 'j-flow', 'aria-label': `Journey from ${sourceName(src)}` }, ...items), strip);
}

const JOURNEY_FILTERS = [
  { id: 'suspect', label: 'Hide suspect', on: true, keep: (j) => !j.suspect },
  { id: 'multi', label: 'Only 2+ pages', on: false, keep: (j) => (j.steps?.length ?? 0) >= 2 },
  { id: 'click', label: 'Only with a click', on: false, keep: (j) => j.exit?.kind === 'click' },
];
const JOURNEYS_SHOWN = 8;

function journeysCard([journeys]) {
  if (!journeys.rows) return [notConfigured(missing(journeys, 'visits'))];
  const rows = journeys.rows;
  if (!rows.length) return [...errorLines(journeys), el('p', { class: 'empty' }, 'No visits in this range yet. Journeys start at the cutover to lib-visits, 2026-10-15.')];
  const now = Date.now();
  const state = Object.fromEntries(JOURNEY_FILTERS.map((f) => [f.id, f.on]));
  const hidden = el('span', { class: 'j-hidden', role: 'status' });
  const host = el('div', { class: 'j-list' });
  const list = (items) => el('ol', { class: 'journeys', role: 'list' }, ...items.map((j) => journey(j, now)));
  const render = () => {
    const kept = rows.filter((j) => JOURNEY_FILTERS.every((f) => !state[f.id] || f.keep(j)));
    const n = rows.length - kept.length;
    hidden.textContent = n ? `${n} hidden` : '';
    host.replaceChildren(...[
      kept.length ? list(kept.slice(0, JOURNEYS_SHOWN)) : el('p', { class: 'empty' }, 'Every journey in this range is hidden by the filters.'),
      kept.length > JOURNEYS_SHOWN ? folded(`More journeys · ${kept.length - JOURNEYS_SHOWN}`, list(kept.slice(JOURNEYS_SHOWN))) : null,
    ].filter(Boolean));
  };
  const buttons = JOURNEY_FILTERS.map((f) => {
    const b = el('button', { type: 'button', 'aria-pressed': String(state[f.id]) }, f.label);
    b.addEventListener('click', () => {
      state[f.id] = !state[f.id];
      b.setAttribute('aria-pressed', String(state[f.id]));
      render();
    });
    return b;
  });
  render();
  return [...errorLines(journeys), el('div', { class: 'j-filters', role: 'group', 'aria-label': 'Journey filters' }, ...buttons, hidden), host];
}

function searchCard([search], days) {
  if (!search.perDay || !search.totals) return [notConfigured(missing(search, 'search'))];
  const t = search.totals;
  const p = search.previous;
  const indexed = search.indexed;
  const tiles = el('div', { class: 'tiles' },
    tile('Clicks', num(t.clicks), { delta: delta(num(t.clicks), p?.clicks, { vs: previousText(days) }) }),
    tile('Impressions', num(t.impressions), { delta: delta(num(t.impressions), p?.impressions, { vs: previousText(days) }) }),
    tile('Click-through', pct(num(t.ctr)), { note: 'clicks over impressions' }),
    tile('Position', isNum(t.position) ? t.position.toFixed(1) : '–', { note: isNum(t.position) ? 'average, lower is better' : 'no impressions yet' }),
    tile('Indexed', indexed ? `${num(indexed.indexed)} / ${num(indexed.total)}` : '–', { note: indexed ? 'pages in the sitemap Google has indexed' : `not read${missing(search, 'indexed', 'sitemap') ? ` (${missing(search, 'indexed', 'sitemap')})` : ''}` }));
  const perDay = search.perDay;
  const pair = el('div', { class: 'pair' },
    el('div', {}, el('h3', {}, 'Clicks per day'), columns(dayBars(perDay, 'clicks'), { height: 160, label: `Clicks per day, ${compact(num(t.clicks))} in all` })),
    el('div', {}, el('h3', {}, 'Impressions per day'), columns(dayBars(perDay, 'impressions'), { height: 160, label: `Impressions per day, ${compact(num(t.impressions))} in all` })));
  const queries = folded(`Top queries · ${search.queries?.length ?? 0}`, search.queries ? table([
    { key: 'query', label: 'Query', wrap: true },
    { key: 'clicks', label: 'Clicks', num: true },
    { key: 'impressions', label: 'Impressions', num: true },
    { key: 'ctr', label: 'CTR', num: true, render: (v) => pct(num(v)) },
    { key: 'position', label: 'Position', num: true, render: (v) => (isNum(v) ? v.toFixed(1) : '–') },
  ], search.queries, 'No queries with enough volume to show.') : notConfigured(missing(search, 'search')));
  const pages = folded(`Top pages · ${search.pages?.length ?? 0}`, search.pages ? table([
    { key: 'page', label: 'Page', render: (v) => mono(str(v).replace(/^https:\/\/csarko\.sh/, '') || '/') },
    { key: 'clicks', label: 'Clicks', num: true },
    { key: 'impressions', label: 'Impressions', num: true },
  ], search.pages) : notConfigured(missing(search, 'search')));
  const missingUrls = indexed?.missing ?? null;
  const unindexed = folded(`Not yet indexed · ${missingUrls ? missingUrls.length : '?'}`, missingUrls === null
    ? notConfigured(missing(search, 'indexed', 'sitemap'), 'Index status was not read')
    : missingUrls.length
      ? el('ul', { class: 'urls' }, ...missingUrls.map((u) => el('li', {}, str(u).replace(/^https:\/\/csarko\.sh/, '') || '/')))
      : el('p', { class: 'empty' }, 'Every sitemap URL is indexed.'));
  const sm = search.sitemap;
  const foot = el('p', { class: 'card-foot' }, sm?.lastDownloaded
    ? `Sitemap fetched ${ago(sm.lastDownloaded)} · ${num(sm.errors)} errors · ${num(sm.warnings)} warnings`
    : sm ? 'Sitemap: no fetch recorded by Google yet' : `Sitemap state: not read${missing(search, 'sitemapState') ? ` (${missing(search, 'sitemapState')})` : ''}`);
  return [...errorLines(search), tiles, pair, queries, pages, unindexed, foot];
}

function reachCard([reach], days, reload) {
  const parts = [...errorLines(reach)];
  // YouTube
  parts.push(el('h3', {}, 'YouTube'));
  const yt = reach.youtube;
  if (!yt) parts.push(notConfigured(missing(reach, 'youtube')));
  else {
    parts.push(el('div', { class: 'tiles' },
      tile('Subscribers', yt.subscribers, { delta: yt.prev ? delta(yt.subscribers, yt.prev.subscribers, { vs: 'last snapshot', percent: false }) : undefined, note: yt.prev ? undefined : 'no snapshot a week back yet' }),
      tile('Views', yt.views, { delta: yt.prev ? delta(yt.views, yt.prev.views, { vs: 'last snapshot' }) : undefined }),
      tile('Videos', yt.videos)));
    parts.push(folded(`Videos · ${yt.videosList?.length ?? 0}`, table([
      { key: 'title', label: 'Title', wrap: true, render: (v, row) => (row.id ? el('a', { href: `https://www.youtube.com/watch?v=${encodeURIComponent(str(row.id))}`, target: '_blank', rel: 'noopener' }, str(v)) : str(v)) },
      { key: 'views', label: 'Views', num: true },
      { key: 'likes', label: 'Likes', num: true },
    ], yt.videosList ?? [])));
  }
  // GitHub
  parts.push(el('h3', {}, 'GitHub'));
  const gh = reach.github;
  if (!gh) parts.push(notConfigured(missing(reach, 'github')));
  else {
    const dash = (v) => (isNum(v) ? v.toLocaleString('en-US') : '–');
    // Most viewed first (Cyrus, 2026-10-13); a repo whose traffic could not be read sorts
    // after every one whose could, then by stars, then by name.
    const views = (r) => (isNum(r.traffic?.views) ? r.traffic.views : -1);
    const sorted = [...gh].sort((a, b) => views(b) - views(a) || num(b.stars) - num(a.stars) || str(a.repo).localeCompare(str(b.repo)));
    parts.push(table([
      { key: 'repo', label: 'Repo', render: (v) => el('a', { href: `https://github.com/${str(v)}`, target: '_blank', rel: 'noopener' }, mono(v)) },
      { key: 'stars', label: 'Stars', num: true },
      { key: 'forks', label: 'Forks', num: true },
      { key: 'watchers', label: 'Watchers', num: true },
      { key: 'traffic', label: 'Views, 14 d', num: true, render: (v) => dash(v?.views) },
      { key: 'traffic', label: 'Uniques', num: true, render: (v) => dash(v?.uniques) },
      { key: 'traffic', label: 'Clones', num: true, render: (v) => dash(v?.clones) },
    ], sorted, 'No public repos listed.'));
    const trafficEnv = missing(reach, 'githubTraffic');
    if (trafficEnv) parts.push(notConfigured(trafficEnv, 'Traffic'));
    else {
      const refRows = sorted.flatMap((r) => (r.traffic?.referrers ?? []).map((ref) => ({ repo: r.repo, ...ref }))).sort((a, b) => num(b.count) - num(a.count));
      parts.push(folded(`Traffic referrers · ${refRows.length}`, table([
        { key: 'repo', label: 'Repo', render: mono },
        { key: 'referrer', label: 'Referrer', render: mono },
        { key: 'count', label: 'Views', num: true },
        { key: 'uniques', label: 'Uniques', num: true },
      ], refRows, 'No referrers in the last 14 days.')));
    }
  }
  // Hacker News
  parts.push(el('h3', {}, 'Hacker News'));
  const hn = reach.hn;
  if (!hn) parts.push(notConfigured(missing(reach, 'hn')));
  else {
    parts.push(el('div', { class: 'tiles compact' }, tile('Mentions', num(hn.mentions), { note: 'stories and comments naming csarko.sh' })));
    if (hn.items?.length) parts.push(folded(`Mentions · ${hn.items.length}`, table([
      { key: 'title', label: 'Title', wrap: true, render: (v, row) => (row.url ? el('a', { href: str(row.url), target: '_blank', rel: 'noopener' }, str(v)) : str(v)) },
      { key: 'points', label: 'Points', num: true },
      { key: 'at', label: 'When', render: (v) => (v ? ago(str(v)) : '') },
    ], hn.items)));
  }
  // Substack
  parts.push(el('h3', {}, 'Substack'));
  const series = reach.substack?.series ?? [];
  const latest = series[series.length - 1];
  const before = series[series.length - 2];
  const substackTile = tile('Subscribers', latest ? num(latest.value) : '–', {
    delta: latest && before ? delta(num(latest.value), num(before.value), { vs: 'previous entry', percent: false }) : undefined,
    note: latest ? `entered ${ago(latest.at)}` : 'No entry yet: csarko.log has no API, so the count is typed in here.',
    trend: series.map((s) => num(s.value)),
    trendLabel: `Substack subscribers over ${series.length} entries`,
  });
  const input = el('input', { id: 'substack-count', type: 'number', min: '0', step: '1', inputmode: 'numeric', required: true, placeholder: latest ? String(latest.value) : '0' });
  const save = el('button', { class: 'btn small', type: 'submit' }, 'Save');
  const note = el('p', { class: 'note', role: 'status' });
  const form = el('form', { class: 'field' }, el('label', { for: 'substack-count' }, 'Subscribers today', input), el('div', {}, save));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const value = Number(input.value);
    if (!Number.isInteger(value) || value < 0) { input.focus(); return; }
    save.disabled = true;
    note.textContent = 'Saving';
    try {
      const result = await data.manual(app, 'substack', value);
      note.textContent = `Saved ${compact(value)}${data.kind === 'sample' ? ' (sample: nothing is stored)' : ''} at ${new Date(result.at ?? Date.now()).toLocaleTimeString()}.`;
      reload();
    } catch (error) {
      note.textContent = `Could not save: ${error.message}`;
      save.disabled = false;
    }
  });
  parts.push(el('div', { class: 'tiles compact' }, substackTile), form, note);
  return parts;
}

function healthCard([health]) {
  const overall = health.overall ?? {};
  const up = health.up === true;
  const unknown = health.up === null || health.up === undefined;
  const tiles = el('div', { class: 'tiles' },
    tile('Site', unknown ? '–' : up ? 'Up' : 'Down', { note: unknown ? 'not checked' : `HTTP ${isNum(health.status) ? health.status : '–'} · TTFB ${isNum(health.ttfbMs) ? `${health.ttfbMs} ms` : '–'}` }),
    tile('Certificate', isNum(health.certDaysLeft) ? health.certDaysLeft : '–', { unit: isNum(health.certDaysLeft) ? 'days left' : '', note: isNum(health.certDaysLeft) ? undefined : 'not read' }),
    tile('Lighthouse performance', isNum(health.lighthousePerformance) ? health.lighthousePerformance : '–', { note: health.lighthouseAt ? `lab run ${ago(health.lighthouseAt)}` : `no run yet${missing(health, 'lighthouse') ? ` (${missing(health, 'lighthouse')})` : ''}` }),
    tile('Last deploy', health.lastDeployAt ? ago(health.lastDeployAt) : '–', { note: health.lastDeployAt ? new Date(health.lastDeployAt).toLocaleString() : `not read${missing(health, 'hosting') ? ` (${missing(health, 'hosting')})` : ''}` }),
    tile('Indexed', health.indexed ? `${num(health.indexed.indexed)} / ${num(health.indexed.total)}` : '–', { note: health.sitemapFetchedAt ? `sitemap fetched ${ago(health.sitemapFetchedAt)}` : `sitemap state not read${missing(health, 'sitemapState', 'indexed', 'sitemap') ? ` (${missing(health, 'sitemapState', 'indexed', 'sitemap')})` : ''}` }));
  const nf = health.notFound;
  const list = folded(`404 paths, last 7 days · ${nf ? nf.length : '?'}`, nf
    ? table([{ key: 'path', label: 'Path asked for', render: mono }, { key: 'visitors', label: 'Visitors', num: true }], nf, 'Nobody hit a missing page.')
    : notConfigured(missing(health, 'visits', 'sitemap')));
  return [...errorLines(health), el('p', { class: 'sub' }, status(overall.status, overall.note)), tiles, list];
}

// csarko-visits runs without a GeoIP database (lib-visits' `--geoip`), so rows carry no country.
const NO_COUNTRIES = 'Not recorded: the collector has no GeoIP database. Timezones are the nearest guide.';

function audienceCard([audience]) {
  const sections = [['countries', 'Countries'], ['sizes', 'Screen sizes'], ['browsers', 'Browsers'], ['systems', 'Systems'], ['languages', 'Languages'], ['themes', 'Theme'], ['viewports', 'Viewport'], ['touch', 'Input'], ['timezones', 'Timezones']];
  if (sections.every(([key]) => !audience[key])) return [notConfigured(missing(audience, 'visits'))];
  const cols = el('div', { class: 'cols' }, ...sections.map(([key, label]) => {
    const rows = audience[key] ? [...audience[key]].sort((a, b) => b.visitors - a.visitors) : null;
    return el('div', {}, el('h3', {}, label), rows === null
      ? notConfigured(missing(audience, 'visits'))
      : rows.length
        ? bars(rows.slice(0, 6).map((r) => ({ name: r.name, value: num(r.visitors) })), { label: `${label} by visitors` })
        : el('p', { class: 'empty' }, key === 'countries' ? NO_COUNTRIES : 'Nothing in this range.'));
  }));
  const top = (key) => {
    const rows = audience[key] ? [...audience[key]].sort((a, b) => b.visitors - a.visitors) : [];
    const total = rows.reduce((n, r) => n + num(r.visitors), 0);
    return rows[0] ? `${rows[0].name} ${pct(num(rows[0].visitors), total)}` : '';
  };
  const summary = [top('countries'), top('sizes'), top('browsers'), top('themes')].filter(Boolean).join(' · ');
  return [...errorLines(audience), el('p', { class: 'sub' }, summary || 'Who the visitors are'), folded('Countries, screen sizes, browsers, systems, languages, theme, viewport, input, timezones', cols)];
}

const GOATCOUNTER_NOTE = "Before the cutover, counts are GoatCounter's, a browser once per page per session.";
/**
 * The Visitors card's sub: the range (the API's own `label` when it sends one, "last 24 hours"
 * for a day), and that a visit's day is UTC (`dayLabel`), which rolls at 8 pm New York in summer.
 */
function visitorsSub(d, visits) {
  const label = typeof visits?.label === 'string' && visits.label ? `the ${visits.label.replace(/^the /, '')}` : rangeText(d);
  const dayNote = visits?.dayLabel && visits.dayLabel !== 'utc'
    ? `A visit is one browser on one day (${visits.dayLabel}); nothing is stored in it.`
    : "A visit is one browser on one UTC day, which rolls at 8 pm New York in summer and 7 pm in winter; nothing is stored in it.";
  return `Visits ${label}, against ${previousText(d)}. ${dayNote} ${GOATCOUNTER_NOTE}`;
}

/** Each card: its queries, its copy, how it renders, and the skeleton that stands in for it while the queries run. */
const CARDS = [
  { id: 'visitors', title: 'Visitors', queries: ['visits'], sub: visitorsSub, render: visitorsCard, skeleton: { tiles: 2, chart: true } },
  { id: 'referrers', title: 'Where they come from', half: true, queries: ['referrers'], sub: () => `Visitors by where the visit started; the raw referrers and the tagged links folded below. ${GOATCOUNTER_NOTE}`, render: referrersCard, skeleton: { lines: 6 } },
  { id: 'pages', title: 'What they read', half: true, queries: ['pages'], sub: () => `Pages by visitors; the paths that hit the 404 page folded below. ${GOATCOUNTER_NOTE}`, render: pagesCard, skeleton: { lines: 6 } },
  { id: 'events', title: 'Where they go next', queries: ['events', 'visits'], sub: () => `Clicks out to a profile, to play, to watch, and docs read to the end. ${GOATCOUNTER_NOTE}`, render: eventsCard, skeleton: { tiles: 3, lines: 4 } },
  { id: 'journeys', title: 'Journeys', queries: ['journeys'], sub: () => 'The most recent visits, newest first, each from where it came to how it left: every page with when it was reached, how far it was scrolled, how long it was visible and on screen, its LCP, and the click that ended the visit. From lib-visits, so since the cutover only.', render: journeysCard, skeleton: { lines: 6 } },
  { id: 'search', title: 'Search', queries: ['search'], sub: (d, s) => s?.lag ?? 'Google Search Console runs 2 to 3 days behind.', render: searchCard, skeleton: { tiles: 4, chart: true } },
  { id: 'reach', title: 'Reach', queries: ['reach'], sub: () => 'YouTube, GitHub, Hacker News and Substack: exposure beyond the site. A section reads Not configured until its credential is in Secret Manager.', render: reachCard, skeleton: { tiles: 3, lines: 4 } },
  { id: 'health', title: 'Health', half: true, queries: ['health'], sub: () => '', render: healthCard, skeleton: { tiles: 4, lines: 1 } },
  { id: 'audience', title: 'Audience', half: true, queries: ['audience'], sub: () => '', render: audienceCard, skeleton: { lines: 5 } },
];

// ---------------------------------------------------------------- the page

function cardShell(def) {
  return el('section', { class: `card${def.half ? ' half' : ''}`, id: `card-${def.id}`, 'aria-labelledby': `title-${def.id}` },
    el('h2', { id: `title-${def.id}` }, def.title),
    el('p', { class: 'sub' }, def.sub(range)),
    loading(def.skeleton));
}

async function loadCard(def, gen, card) {
  const body = card.querySelector('.body');
  // A skeleton is already the loading state; a rendered card dims while it reloads.
  if (!body.querySelector('.skeleton')) card.classList.add('loading');
  body.setAttribute('aria-busy', 'true');
  try {
    const results = await Promise.all(def.queries.map((name) => data.query(app, name, range)));
    if (gen !== generation) return;
    const sub = def.sub(range, results[0]);
    card.querySelector('.sub').textContent = sub;
    card.querySelector('.sub').hidden = !sub;
    body.replaceChildren(...def.render(results, range, () => loadCard(def, generation, card)));
  } catch (error) {
    if (gen !== generation) return;
    body.replaceChildren(errorLine(`${def.title} could not be read.`, error.message));
  } finally {
    if (gen === generation) {
      card.classList.remove('loading');
      body.removeAttribute('aria-busy');
    }
  }
}

/**
 * Every card loads on its own and shows its own error line. On the first load every
 * card is on the page at once as a skeleton the shape of what it waits for, and fills as
 * its queries answer, so the page is never blank and a slow source holds only its own
 * card; a range change updates each card in place, the old render dimmed meanwhile.
 */
async function load() {
  generation += 1;
  const gen = generation;
  if (!grid.querySelector('.card')) grid.replaceChildren(...CARDS.map(cardShell));
  await Promise.allSettled(CARDS.map((def) => loadCard(def, gen, document.getElementById(`card-${def.id}`))));
}

function rangeButtons() {
  const buttons = RANGES.map((r) => {
    const b = el('button', { type: 'button', 'aria-pressed': String(r.days === range) }, r.label);
    b.addEventListener('click', () => {
      if (range === r.days) return;
      range = r.days;
      for (const other of buttons) other.setAttribute('aria-pressed', String(other === b));
      load();
    });
    return b;
  });
  rangeRow.append(...buttons);
}


async function start() {
  try {
    const apps = await loadApps();
    app = apps.find((a) => a.slug === SLUG);
    if (!app) throw new Error(`${SLUG} is not in apps.json`);
  } catch (error) {
    grid.replaceChildren(el('section', { class: 'card' }, errorLine('apps.json could not be read.', error.message)));
    return;
  }
  load();
}

rangeButtons();
// The nav's account menu (the badge, the email, Sign out) is the shell's: auth.js renders it.
if (preview) {
  accountMenu(account, { preview: true });
  start();
} else {
  requireSession(root, (user) => {
    accountMenu(account, { account: user });
    start();
  });
}
