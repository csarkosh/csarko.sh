/**
 * The csarko.sh dashboard (spec 2.5): a range row, then eight cards in order, each
 * loading its own query (or two) and showing its own error line. Visitors, where they
 * come from, what they read, where they go next, search, reach, health, audience.
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

const rangeText = (days) => (days === 1 ? 'today' : `the last ${days} days`);
const previousText = (days) => (days === 1 ? 'yesterday' : `the ${days} days before`);
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
  const out = byKind('out');
  const total = visits?.current ? num(visits.current.visits) : null;
  const rate = isNum(events.outboundRate) ? events.outboundRate : null;
  const tiles = el('div', { class: 'tiles' },
    tile('Outbound clicks', out, { note: rate === null ? 'LinkedIn, GitHub, Substack, YouTube' : `${pct(rate)} of home page visitors went on to a profile` }),
    tile('Went to play', byKind('play'), { note: 'Play in your browser, on /games' }),
    tile('Went to watch', byKind('watch'), { note: 'Watch on YouTube, on /film' }),
    tile('Read to the end', byKind('read'), { note: 'Reached the last line of a doc' }));
  const funnel = total === null
    ? el('p', { class: 'empty' }, 'Visits are not available, so the share of visits cannot be drawn.')
    : bars([
      { name: 'Visits', value: total, detail: `Visits ${rangeText(days)}` },
      { name: 'Clicked out', value: out, detail: 'Outbound clicks' },
      { name: 'Went to play', value: byKind('play'), detail: 'Play clicks' },
      { name: 'Went to watch', value: byKind('watch'), detail: 'Watch clicks' },
    ], { ramp: true, share: true, label: 'From a visit to a click out, as a share of visits' });
  const list = folded(`Events · ${rows.length}`, table([
    { key: 'name', label: 'Event', render: mono },
    { key: 'kind', label: 'Kind', render: (v) => KINDS[str(v)] ?? cap(str(v)) },
    { key: 'visitors', label: 'Visitors', num: true },
  ], [...rows].sort((a, b) => b.visitors - a.visitors), 'No events in this range: the public site has none wired yet.'));
  return [...errorLines(events, visits), tiles, el('h3', {}, 'Share of visits'), funnel, list];
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

function audienceCard([audience]) {
  const sections = [['countries', 'Countries'], ['sizes', 'Screen sizes'], ['browsers', 'Browsers'], ['systems', 'Systems'], ['languages', 'Languages'], ['themes', 'Theme'], ['viewports', 'Viewport'], ['touch', 'Input'], ['timezones', 'Timezones']];
  if (sections.every(([key]) => !audience[key])) return [notConfigured(missing(audience, 'visits'))];
  const cols = el('div', { class: 'cols' }, ...sections.map(([key, label]) => {
    const rows = audience[key] ? [...audience[key]].sort((a, b) => b.visitors - a.visitors) : null;
    return el('div', {}, el('h3', {}, label), rows === null
      ? notConfigured(missing(audience, 'visits'))
      : rows.length
        ? bars(rows.slice(0, 6).map((r) => ({ name: r.name, value: num(r.visitors) })), { label: `${label} by visitors` })
        : el('p', { class: 'empty' }, 'Nothing in this range.'));
  }));
  const top = (key) => {
    const rows = audience[key] ? [...audience[key]].sort((a, b) => b.visitors - a.visitors) : [];
    const total = rows.reduce((n, r) => n + num(r.visitors), 0);
    return rows[0] ? `${rows[0].name} ${pct(num(rows[0].visitors), total)}` : '';
  };
  const summary = [top('countries'), top('sizes'), top('browsers'), top('themes')].filter(Boolean).join(' · ');
  return [...errorLines(audience), el('p', { class: 'sub' }, summary || 'Who the visitors are'), folded('Countries, screen sizes, browsers, systems, languages, theme, viewport, input, timezones', cols)];
}

/** Each card: its queries, its copy, how it renders, and the skeleton that stands in for it while the queries run. */
const CARDS = [
  { id: 'visitors', title: 'Visitors', queries: ['visits'], sub: (d) => `Visits ${rangeText(d)}, against ${previousText(d)}. A visit is one browser on one day; nothing is stored in it. Before the cutover the counts are GoatCounter's, a browser once per page; since then, once per day.`, render: visitorsCard, skeleton: { tiles: 2, chart: true } },
  { id: 'referrers', title: 'Where they come from', half: true, queries: ['referrers'], sub: () => 'Visitors by where the visit started; the raw referrers and the tagged links folded below.', render: referrersCard, skeleton: { lines: 6 } },
  { id: 'pages', title: 'What they read', half: true, queries: ['pages'], sub: () => 'Pages by visitors; the paths that hit the 404 page folded below.', render: pagesCard, skeleton: { lines: 6 } },
  { id: 'events', title: 'Where they go next', queries: ['events', 'visits'], sub: () => 'Clicks out to a profile, to play, to watch, and docs read to the end.', render: eventsCard, skeleton: { tiles: 3, lines: 4 } },
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
