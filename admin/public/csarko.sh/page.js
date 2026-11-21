/**
 * The csarko.sh dashboard (spec 2.5): the site's health as small indicators in the page head, a
 * range row, then four cards in order, each loading its own queries and showing its own error
 * lines. Visitors (who they are: the counts, where they arrived from and went on to, their
 * countries and devices; Cyrus, 2026-11-21, in place of Visitors, Where they come from, Audience
 * and Where they go next), what they read, journeys, search. Reach and the Health card left the
 * page the same day, Health for the indicators.
 * The films and the YouTube channel have their own page, /film/ (Cyrus, 2026-11-16).
 *
 * The API (admin/api, shapes in admin/CONTRACT.md) answers `null` for any part whose
 * credential is missing, with `notConfigured: { <part>: "<ENV NAME>" }` naming the secret
 * to add, and `errors: { <part>: "<message>" }` for a part that failed; every card renders
 * those as "Not configured (ENV)" in --faint or as its error line, never as a blank or 0.
 * A visit is one browser on one day, so every `pageviews` field is null and nothing here
 * shows one.
 */

import { accountMenu, requireSession } from '/auth.js';
import { ago, bars, columns, compact, delta, el, errorLine, filteredList, folded, hold, loading, pct, settle, shortDay, skeleton, status, table, tile, tooltip } from '/charts.js';
import { RANGES, loadApps, preview, readRange, readToggles, source, utcMidnightHere, viewerZone, viewerZoneName, writeRange, writeToggles } from '/data.js';
import { fadeIn, fadeOut, tokens } from '/motion.js';
import { savedAll, savedThenLive } from '/instant.js';

const SLUG = 'csarko.sh';
const root = document.getElementById('top');
const grid = document.getElementById('cards');
const rangeRow = document.getElementById('range');
const account = document.getElementById('account');

const data = source();
let app = null;
let range = readRange();
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

/**
 * Readers: the visits that engaged 5 s or more on a page, saw two or more paths, or clicked; the
 * rest are real bounces and the crawlers the API's bot test leaves in (CONTRACT.md). Counted from lib-visits' rows alone, so a range
 * that reaches before the cutover (`readersSince`) shows them since the cutover, with no share
 * of visits and no change against a previous range that has none.
 */
function readersTile(cur, prev, days) {
  if (!isNum(cur.readers)) return tile('Readers', null, { note: 'Not counted before the cutover to lib-visits.' });
  if (cur.readersSince) return tile('Readers', cur.readers, { note: `Since the cutover, ${shortDay(cur.readersSince.slice(0, 10))}.` });
  const comparable = isNum(prev?.readers) && !prev.readersSince;
  return tile('Readers', cur.readers, {
    delta: delta(cur.readers, comparable ? prev.readers : null, { vs: previousText(days) }),
    note: `${pct(cur.readers, num(cur.visits))} of visits: 5 s on a page, 2+ pages or a click.`,
  });
}

/** A country's English name from its ISO code ("US" is "United States"), the code where the runtime has none. */
const COUNTRY = (() => { try { return new Intl.DisplayNames(['en'], { type: 'region' }); } catch { return null; } })();
const countryName = (code) => { try { return COUNTRY?.of(str(code)) ?? str(code); } catch { return str(code); } };

/**
 * One facet of who the visitors are: a heading over its top five, each a bar with its share of
 * the facet's visitors beside it (or of `of`, the range's visits, where one visitor can be in
 * several rows), so every facet reads the same way. Null rows (the part was not
 * configured) say so; an empty facet says what it lacks.
 */
function facet(title, rows, { name = (r) => str(r.name), value = (r) => num(r.visitors), empty = 'Nothing in this range.', missingNote = null, of = null, detail = null } = {}) {
  if (rows === null || rows === undefined) return el('section', { class: 'facet' }, el('h3', {}, title), missingNote ?? el('p', { class: 'empty' }, empty));
  const sorted = [...rows].filter((r) => value(r) > 0).sort((x, y) => value(y) - value(x));
  const total = isNum(of) ? of : sorted.reduce((n, r) => n + value(r), 0);
  return el('section', { class: 'facet' }, el('h3', {}, title), sorted.length
    ? bars(sorted.slice(0, 5).map((r) => ({ name: name(r), value: value(r), aside: pct(value(r), total), ...(detail ? { detail: detail(r) } : {}) })), { label: `${title} by visitors` })
    : el('p', { class: 'empty' }, empty));
}

/** The error lines of several answers, each said once. */
const allErrorLines = (...answers) => {
  const seen = new Set();
  return answers.flatMap((a) => errorLines(a)).filter((n) => { const k = n.textContent; if (seen.has(k)) return false; seen.add(k); return true; });
};

/**
 * Visitors (Cyrus, 2026-11-21: one overview of who the visitors are, in place of Visitors, Where
 * they come from, Audience and Where they go next, which said the same things four ways): how
 * many came, read and clicked out, by day, against the range before; then facets laid out alike,
 * where they arrived from and went on to, and folded under them their countries, languages,
 * systems, browsers, screens and theme; then the referrers and the campaigns, folded too (the
 * list of every event left the same day). Viewport, input and timezone were dropped as facets, since screens, systems and
 * countries already say them; the per day table and the paths through the site were dropped the
 * same day, the chart and the journeys saying them.
 */
function visitorsCard([visits, refs, audience, events, places], days) {
  const cur = visits.current;
  const prev = visits.previous;
  const parts = [...allErrorLines(visits, refs, audience, events, places)];
  if (cur) {
    const prevDays = prev?.perDay ?? [];
    parts.push(el('div', { class: 'tiles compact' },
      tile('Visits', cur.visits, { delta: delta(cur.visits, prev?.visits, { vs: previousText(days) }) }),
      readersTile(cur, prev, days),
      clickedOutTile(events)));
    parts.push(columns(dayBars(cur.perDay ?? [], 'visits'), {
      previous: prev ? (cur.perDay ?? []).map((_, i) => num(prevDays[i]?.visits)) : null,
      label: `Visits per day, ${rangeText(days)}: ${compact(num(cur.visits))} in all${prev ? ` against ${compact(num(prev.visits))} ${previousText(days)}` : ''}`,
      currentLabel: cap(rangeText(days)),
      previousLabel: cap(previousText(days)),
    }));
  } else parts.push(notConfigured(missing(visits, 'visits')));
  const noAudience = audience.countries === null || audience.countries === undefined ? notConfigured(missing(audience, 'visits')) : null;
  const noRefs = refs.groups ? null : notConfigured(missing(refs, 'visits'));
  const noEvents = events.rows ? null : notConfigured(missing(events, 'visits'));
  parts.push(el('div', { class: 'facets pair' },
    facet('Arrived from', refs.groups, { name: (g) => groupName(g.group), empty: 'No referrers in this range.', missingNote: noRefs }),
    facet('Went on to', events.rows ? destinations(events.rows) : null, { empty: 'No clicks on to a profile or a project in this range.', missingNote: noEvents, of: cur ? num(cur.visits) : null })));
  parts.push(whereTheyAre(places));
  // Who they are, folded by default (Cyrus, 2026-11-21): where they came, went and are stay open.
  parts.push(folded('Countries, languages and devices', el('div', { class: 'facets six' },
    facet('Countries', audience.countries, { name: (r) => countryName(r.name), empty: NO_COUNTRIES, missingNote: noAudience }),
    facet('Languages', audience.languages, { missingNote: noAudience }),
    facet('Systems', audience.systems, { missingNote: noAudience }),
    facet('Browsers', audience.browsers, { missingNote: noAudience }),
    facet('Screens', audience.sizes, { missingNote: noAudience }),
    facet('Theme', audience.themes, { missingNote: noAudience }))));
  if (refs.groups) {
    parts.push(folded(`Referrers · ${refs.rows?.length ?? 0}`, table([
      { key: 'referrer', label: 'Referrer', render: mono },
      { key: 'group', label: 'Group', render: groupName },
      { key: 'visitors', label: 'Visitors', num: true },
    ], [...(refs.rows ?? [])].sort((x, y) => y.visitors - x.visitors), 'No referrers in this range.')));
    parts.push(folded(`Campaigns · ${refs.campaigns?.length ?? 0}`, table([
      { key: 'campaign', label: 'Campaign', render: mono },
      { key: 'visitors', label: 'Visitors', num: true },
    ], [...(refs.campaigns ?? [])].sort((x, y) => y.visitors - x.visitors), "No tagged links of the site's own were followed in this range. An assistant's tag, such as ChatGPT's, counts as its referrer above.")));
  }
  return parts;
}

/**
 * The visitors who clicked out to a profile or another site: the API's distinct count, else
 * (older answers) the out-* rows summed, which counts a visitor once per link.
 */
function clickedOutTile(events) {
  if (!events?.rows) return tile('Clicked out', null, { note: 'Events not read.' });
  const distinct = isNum(events.outboundVisitors);
  const out = distinct ? events.outboundVisitors : events.rows.filter((r) => r.kind === 'out').reduce((n, r) => n + num(r.visitors), 0);
  const rate = isNum(events.outboundRate) ? events.outboundRate : null;
  return tile('Clicked out', out, { note: rate === null ? 'LinkedIn, GitHub, YouTube and other sites' : `${pct(rate)} of home page visitors went on to a profile` });
}

// The site's projects by the slug their events carry (a card's play-dayhike, a doc's lead-day-hike).
const PROJECTS = { dayhike: 'Day Hike', 'day-hike': 'Day Hike', 'ide-arkos': 'Arkos IDE', 'lib-visits': 'lib-visits', 'app-macstats': 'MacStats', macstats: 'MacStats', 'the-last-trail': 'The Last Trail', 'who-is-standing-in-my-hallway': 'Hallway' };
const PROFILES = { linkedin: 'LinkedIn', github: 'GitHub', youtube: 'YouTube', substack: 'Substack' };
// The kinds that leave the page for somewhere: a profile or another site, a project (from its
// /projects card, a doc's pill or links, or its app page's install and download), or the tip jar.
const ONWARD_KINDS = new Set(['out', 'play', 'watch', 'app', 'top', 'lead', 'close', 'after', 'get', 'download', 'tokens']);
/**
 * Where visitors went on to, by place rather than by link: LinkedIn, GitHub, Day Hike, The Last
 * Trail. A place's visitors are its links' summed, so a visitor who took two of a project's links
 * counts twice there; the facet's shares are of the range's visits.
 */
function destinations(rows) {
  const by = new Map();
  for (const r of rows) {
    if (!ONWARD_KINDS.has(r.kind)) continue;
    const name = str(r.name);
    const rest = name.slice(name.indexOf('-') + 1);
    const place = r.kind === 'tokens' ? 'Buy me tokens'
      : name.startsWith('link-') ? rest
        : r.kind === 'out' ? PROFILES[rest] ?? cap(rest)
          : PROJECTS[rest] ?? rest;
    by.set(place, (by.get(place) ?? 0) + num(r.visitors));
  }
  return [...by].map(([name, visitors]) => ({ name, visitors }));
}

// ---------------------------------------------------------------- where they are

/** A city as the card names it: "Shoreline, Washington" in the US, "Calgary, Canada" elsewhere, the country alone when the database had no city. */
function placeName(p) {
  const country = countryName(p.country);
  if (!p.city) return p.region ? `${p.region}, ${country}` : country;
  return `${p.city}, ${p.country === 'US' && p.region ? p.region : country}`;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const svgNode = (tag, attrs = {}) => { const n = document.createElementNS(SVG_NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v)); return n; };
/** The flat world, loaded the first time a map is drawn: about 50 KB the rest of the page does without. */
let worldOnce = null;
const loadWorld = () => (worldOnce ??= import('/world.js'));

/**
 * A flat map of where the visitors are (Cyrus, 2026-11-21, as Day Hike's admin has): the whole
 * Earth in the Equal Earth projection, Antarctica left off, one mark a city, as wide as the square
 * root of its visits is of the most any city had. Nothing to turn or drag; hover or focus a mark
 * for its city and visits. The land and the projection are admin/public/world.js, drawn once by
 * admin/tools/world-map.mjs; the map takes its height at once and fills when that has loaded.
 */
function worldMap(places) {
  const box = el('div', { class: 'world-map' });
  const svg = svgNode('svg', { viewBox: '0 0 960 420', role: 'img', 'aria-label': `A map of the world with ${places.length} cit${places.length === 1 ? 'y' : 'ies'} marked` });
  box.append(svg);
  const tip = tooltip(box);
  loadWorld().then(({ LAND, BORDERS, project }) => {
    svg.append(svgNode('path', { class: 'land', d: LAND }), svgNode('path', { class: 'borders', d: BORDERS }));
    const marks = svgNode('g', { class: 'marks' });
    const most = Math.max(1, ...places.map((p) => p.visitors));
    // The smallest drawn last, so a big city never hides a small one beside it.
    for (const p of [...places].sort((a, b) => b.visitors - a.visitors)) {
      if (!isNum(p.lat) || !isNum(p.lon)) continue;
      const [x, y] = project(p.lon, p.lat);
      const r = 3 + 11 * Math.sqrt(Math.min(1, p.visitors / most));
      const label = `${placeName(p)}: ${p.visitors} visit${p.visitors === 1 ? '' : 's'}`;
      const g = svgNode('g', { class: 'mark', tabindex: 0, transform: `translate(${x.toFixed(1)},${y.toFixed(1)})`, 'aria-label': label });
      g.append(svgNode('circle', { class: 'ring', r: r.toFixed(1) }), svgNode('circle', { class: 'fill', r: (r * 0.45).toFixed(1) }));
      const show = () => {
        const rect = svg.getBoundingClientRect();
        tip.show((x / 960) * rect.width, (y / 420) * rect.height, [{ v: placeName(p), k: '', tone: 'none' }, { v: String(p.visitors), k: `visit${p.visitors === 1 ? '' : 's'}`, tone: 'none' }]);
      };
      g.addEventListener('pointerenter', show);
      g.addEventListener('focus', show);
      g.addEventListener('pointerleave', () => tip.hide());
      g.addEventListener('blur', () => tip.hide());
      marks.append(g);
    }
    svg.append(marks);
  }).catch(() => box.replaceChildren(el('p', { class: 'empty' }, 'The map could not be loaded.')));
  return box;
}

/**
 * Where they are: the map, and beside it the cities as a facet like the others, the share of the
 * placed visits each; a line under them counts the visits with no place (every one before the
 * collector had its city database, 2026-11-21) and credits the database.
 */
function whereTheyAre(places) {
  if (!places?.rows) return el('section', { class: 'where' }, el('h3', {}, 'Where they are'), notConfigured(missing(places, 'visits')));
  const rows = places.rows;
  const placed = rows.reduce((n, r) => n + num(r.visitors), 0);
  const unplaced = num(places.unplaced);
  const note = el('p', { class: 'sub facet-note' },
    unplaced ? `${unplaced.toLocaleString('en-US')} visit${unplaced === 1 ? '' : 's'} in this range ha${unplaced === 1 ? 's' : 've'} no city: the collector records them from 2026-11-21. ` : '',
    'City data: ', el('a', { href: 'https://db-ip.com', rel: 'noopener' }, 'DB-IP'), ', CC BY 4.0.');
  const cities = facet('Cities', rows, { name: (p) => (p.city ? `${p.city}, ${p.country}` : countryName(p.country)), detail: placeName, empty: 'No visit in this range has a city yet: the collector records them from 2026-11-21.' });
  return el('section', { class: 'where' }, el('div', { class: 'where-grid' }, el('div', { class: 'where-map' }, el('h3', {}, 'Where they are'), placed ? worldMap(rows) : el('p', { class: 'empty' }, 'No city to mark in this range yet.')), cities), note);
}

/** A referrer group as the card names it: the API's word capitalised, and "ai" as the initials it is. */
const groupName = (group) => (str(group) === 'ai' ? 'AI' : cap(str(group)));

/** A page's title without the site's " · Cyrus Sarkosh" suffix, else its path. */
const pageTitle = (r) => str(r.title).replace(/\s+·\s+(Cyrus Sarkosh|csarko\.sh)$/, '') || str(r.path);
/** A share of a page's visitors, "–" when it has none to share. */
const shareOf = (part, r) => (num(r.visitors) > 0 ? pct(num(part), r.visitors) : '–');
/** The change in a page's visitors on the range before, as a small arrow and count, or "new". */
function trend(r, days) {
  const was = isNum(r.previous) ? r.previous : null;
  if (was === null) return null;
  const change = num(r.visitors) - was;
  const label = was === 0 ? `none ${previousText(days)}` : change === 0 ? `the same as ${previousText(days)}` : `${Math.abs(change)} ${change > 0 ? 'more' : 'fewer'} than ${previousText(days)}`;
  const text = was === 0 ? 'new' : change === 0 ? '=' : `${change > 0 ? '▲' : '▼'}${Math.abs(change)}`;
  return el('span', { class: `p-trend ${was === 0 || change > 0 ? 'up' : change < 0 ? 'down' : ''}`, title: label, 'aria-label': label }, text);
}
/** The median scroll as a short track with its figure. */
const scrollMeter = (v) => (isNum(v)
  ? el('span', { class: 'p-meter', title: `Median scroll ${Math.round(v)}%` }, el('span', { class: 'track', style: `--v:${Math.max(0, Math.min(100, v))}%` }), `${Math.round(v)}%`)
  : '–');
/** The p75 LCP in seconds, with a dot when it misses Google's 2.5 s (a ring) or passes 4 s (filled). */
function lcpCell(ms) {
  if (!isNum(ms)) return '–';
  const sec = ms / 1000;
  const grade = sec <= 2.5 ? 'good' : sec <= 4 ? 'needs' : 'poor';
  return el('span', { class: 'p-lcp', title: `75% of loads painted their largest element within ${sec.toFixed(1)} s${grade === 'good' ? '' : grade === 'needs' ? ', needs work' : ', poor'}` },
    `${sec.toFixed(1)} s`, grade === 'good' ? null : el('span', { class: `j-slow ${grade}`, 'aria-hidden': 'true' }));
}

/**
 * What they read (Cyrus, 2026-11-21: more compact, and more to it): one line a page, its title
 * (the path on hover), its visitors with the change on the range before, the share of them who
 * landed on it and who went on from it to another page, the median engaged time and scroll, the
 * share of a doc's views read to the end, and the p75 LCP. The first ten, the rest and the 404
 * paths folded under them.
 */
function pagesCard([pages], days) {
  if (!pages.rows) return [notConfigured(missing(pages, 'visits'))];
  const rows = [...pages.rows].sort((a, b) => b.visitors - a.visitors);
  const known = rows.some((r) => r.inSitemap !== null && r.inSitemap !== undefined);
  const live = rows.filter((r) => r.inSitemap !== false);
  const notFound = rows.filter((r) => r.inSitemap === false);
  const cols = [
    { key: 'path', label: 'Page', render: (v, r) => el('span', { class: 'p-page', title: str(v) }, pageTitle(r)) },
    { key: 'visitors', label: 'Visitors', num: true, render: (v, r) => el('span', { class: 'p-visitors' }, num(v).toLocaleString('en-US'), trend(r, days)) },
    { key: 'landed', label: 'Landed here', num: true, render: (v, r) => shareOf(v, r) },
    { key: 'onward', label: 'Went on', num: true, render: (v, r) => shareOf(v, r) },
    { key: 'engagedMedian', label: 'Engaged', num: true, render: (v) => (isNum(v) ? duration(v) : '–') },
    { key: 'depthMedian', label: 'Scrolled', num: true, render: scrollMeter },
    { key: 'reached', label: 'Read to end', num: true, render: (v) => (isNum(v) ? pct(v) : '–') },
    { key: 'lcp', label: 'LCP p75', num: true, render: lcpCell },
  ];
  const dense = (list, empty) => { const t = table(cols, list, empty); t.classList.add('pages'); return t; };
  const parts = [...errorLines(pages), dense(live.slice(0, PAGES_SHOWN), 'No visits in this range.')];
  if (live.length > PAGES_SHOWN) parts.push(folded(`All pages · ${live.length}`, dense(live)));
  parts.push(folded(`404 paths · ${known ? notFound.length : '?'}`, known
    ? table([{ key: 'path', label: 'Path asked for', render: mono }, { key: 'visitors', label: 'Visitors', num: true }], notFound, 'Nobody hit a missing page in this range.')
    : notConfigured(missing(pages, 'sitemap'), 'The sitemap was not read, so 404 paths cannot be told apart')));
  return parts;
}
const PAGES_SHOWN = 10;

// ---------------------------------------------------------------- journeys

/** Seconds as "41s" or "3m 05s": the engaged and visible figures. */
const duration = (s) => { const n = Math.max(0, Math.round(s)); return n >= 60 ? `${Math.floor(n / 60)}m ${String(n % 60).padStart(2, '0')}s` : `${n}s`; };
/** Seconds as m:ss: positions on the timeline and spans. */
const clock = (s) => { const n = Math.max(0, Math.round(s)); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; };
// The assistants first: the names match by suffix, and gemini.google.com is not Google.
const SOURCE_NAMES = { 'chatgpt.com': 'ChatGPT', 'gemini.google.com': 'Gemini', 'notebook.google.com': 'NotebookLM', 'notebooklm.google.com': 'NotebookLM', 'perplexity.ai': 'Perplexity', 'claude.ai': 'Claude', 'google.com': 'Google', 'bing.com': 'Bing', 'duckduckgo.com': 'DuckDuckGo', 'github.com': 'GitHub', 'linkedin.com': 'LinkedIn', 'substack.com': 'Substack', 'youtube.com': 'YouTube', 't.co': 'X' };
/** The host's name by suffix (www.google.com is Google too), else the host as given. */
function hostName(host) {
  const h = str(host).toLowerCase();
  for (const [suffix, name] of Object.entries(SOURCE_NAMES)) if (h === suffix || h.endsWith(`.${suffix}`)) return name;
  return str(host);
}
/** Where a journey began. A visit with no referrer and an assistant's tag (`assistant`, a link in a ChatGPT answer) is that assistant's, as the Referrers card counts it. */
const sourceName = (src) => (src?.kind === 'external' ? hostName(src.host) || 'Elsewhere' : src?.assistant ? hostName(src.assistant) : src?.kind === 'internal' ? 'This site' : 'Direct');
/** The small line under it: the host, the page of ours it came from, or that it brought no referrer; an assistant's link brought its tag alone. Short: the line is cut at the node's width. */
const sourceLine = (src) => (src.kind === 'external' ? str(src.host) : src.assistant ? 'tagged link' : src.kind === 'internal' ? str(src.path) || 'an earlier page' : 'no referrer');
/** That line in full, for its tooltip. */
const sourceTitle = (src) => (src.kind === 'external' ? str(src.host) : src.assistant ? `tagged ${str(src.campaign)}, ${src.kind === 'internal' ? `from ${str(src.path) || 'an earlier page'}` : 'no referrer'}` : src.kind === 'internal' ? str(src.path) : '');

const CLOCK = new Intl.DateTimeFormat('en-US', { timeZone: viewerZone, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
/** The visit's start on the reader's wall clock, "Wed 3:41 pm"; with the date once the weekday alone is ambiguous, "Wed 8 Oct 3:41 pm". */
function wallClock(iso, now) {
  const ms = Date.parse(str(iso));
  if (!Number.isFinite(ms)) return '';
  const p = Object.fromEntries(CLOCK.formatToParts(ms).filter((x) => x.type !== 'literal').map((x) => [x.type, x.value]));
  const date = now - ms > 6 * 86_400_000 ? ` ${p.day} ${p.month}` : '';
  return `${p.weekday}${date} ${p.hour}:${p.minute} ${str(p.dayPeriod).toLowerCase()}`;
}

/** "Chrome 155 · macOS · 1512×982 · America/New_York · dark · touch · en-US", the unknowns left out. */
function deviceLine(d) {
  if (!d) return '';
  const vp = Array.isArray(d.viewport) && isNum(d.viewport[0]) && isNum(d.viewport[1]) ? `${d.viewport[0]}×${d.viewport[1]}` : '';
  return [[d.browser, d.version].map(str).filter(Boolean).join(' '), d.os, vp, d.tz, d.theme, d.touch === true ? 'touch' : '', d.lang].map(str).filter(Boolean).join(' · ');
}

/** The LCP graded by Google's thresholds (good to 2.5 s, needs work to 4 s, poor past it), in words for a step's details, and the grade for its mark. */
function lcpOf(s) {
  if (!isNum(s.lcp)) return null;
  const sec = s.lcp / 1000;
  const grade = sec <= 2.5 ? 'good' : sec <= 4 ? 'needs' : 'poor';
  const extra = [isNum(s.cls) ? `CLS ${s.cls.toFixed(2)}` : '', isNum(s.inp) ? `INP ${Math.round(s.inp)} ms` : ''].filter(Boolean);
  return { grade, text: [`LCP ${sec.toFixed(1)} s${grade === 'good' ? '' : grade === 'needs' ? ', needs work' : ', poor'}`, ...extra].join(' · ') };
}

const NAV_TAGS = { reload: 'reloaded', back_forward: 'back', prerender: 'prerendered', spa: 'in app' };

/** A stretch of time at the scale it has: 2 d 4 h, 3 h 12 m, else m:ss. */
const stretch = (s) => { const n = Math.max(0, Math.round(s)); if (n >= 86400) return `${Math.floor(n / 86400)} d ${Math.round((n % 86400) / 3600)} h`; if (n >= 3600) return `${Math.floor(n / 3600)} h ${Math.round((n % 3600) / 60)} m`; return clock(n); };

/** A step's page as the card names it: its path, with its host first when the step was on another of the site's hosts (apps.csarko.sh, donate.csarko.sh). */
const pathLabel = (s) => (s.host ? `${str(s.host)}${str(s.path)}` : str(s.path));

const chevron = () => el('li', { class: 'j-arrow', 'aria-hidden': 'true' }, '›');

/**
 * One page of a journey as a pill (Cyrus, 2026-11-21: the journeys more compact): its title and
 * the time it was visible, a line under it as long as it was scrolled, a check when it was read to
 * the end, and a mark when its LCP was slow. Everything else (when it was reached, its path, how
 * it was reached, the scroll, the time on the page, the vitals) is its title.
 */
function pageStep(s, i) {
  const at = num(s.at);
  const secs = isNum(s.secs) ? s.secs : null;
  const onPage = isNum(s.left) ? Math.max(0, s.left - at) : null;
  const depthKnown = isNum(s.depth);
  const depthPct = depthKnown ? Math.max(0, Math.min(100, Math.round(s.depth))) : 0;
  const lcp = lcpOf(s);
  const details = [
    `Page ${i + 1} at ${clock(at)}${NAV_TAGS[s.nav] ? ` (${NAV_TAGS[s.nav]})` : ''}`,
    pathLabel(s),
    depthKnown ? `scrolled ${depthPct}%` : secs === null ? 'no leave beacon' : 'no scroll depth',
    s.read === true ? 'read to the end' : s.read === false ? 'not to the end' : '',
    secs === null ? '' : `${duration(secs)} visible`,
    onPage !== null && (secs === null || Math.round(onPage) !== Math.round(secs)) ? `on the page ${clock(onPage)}` : '',
    lcp?.text ?? '',
  ].filter(Boolean).join(' · ');
  return el('li', { class: 'j-step', title: details, tabindex: '0', style: `--depth:${depthPct}%` },
    el('span', { class: 'j-title' }, str(s.title || s.path)),
    el('span', { class: 'j-time' }, secs === null ? '–' : duration(secs)),
    s.read === true ? el('span', { class: 'j-read', 'aria-label': 'read to the end' }, '✓') : null,
    lcp && lcp.grade !== 'good' ? el('span', { class: `j-slow ${lcp.grade}`, 'aria-label': lcp.text }) : null);
}

/** Where the visit came from, how it ended, and a return after time away, as the quieter pills at the ends and between. */
const edgeStep = (text, title) => el('li', { class: 'j-step edge', title: title || text }, el('span', { class: 'j-title' }, text));

/** One visit, in two lines: when, how long, how many pages and on what, with its marks; then from where it came, page by page, to how it left. */
function journey(j, now) {
  const steps = Array.isArray(j.steps) ? j.steps : [];
  const first = steps[0];
  const last = steps[steps.length - 1];
  const lastLeft = steps.reduce((m, s) => (isNum(s.left) ? Math.max(m, s.left) : m), -1);
  const lastSeen = lastLeft >= 0 ? lastLeft : last && isNum(last.secs) ? num(last.at) + last.secs : null;
  const span = lastSeen !== null && first ? lastSeen - num(first.at) : null;
  const n = steps.length;
  const src = j.source ?? { kind: 'direct' };
  const items = [edgeStep(`from ${sourceName(src)}`, [sourceName(src), sourceTitle(src) || sourceLine(src)].filter(Boolean).join(' · '))];
  steps.forEach((s, i) => {
    if (s.back && i > 0) items.push(chevron(), edgeStep(`back ${stretch(num(s.at) - (num(steps[i - 1].at) + (isNum(steps[i - 1].secs) ? steps[i - 1].secs : 0)))} later`, 'The same browser came back after time away'));
    items.push(chevron(), pageStep(s, i));
  });
  const exit = j.exit?.kind === 'click'
    ? edgeStep(`out to ${str(j.exit.host) || 'a link'}`, [`Left by a click`, j.exit.event ? `event ${j.exit.event}` : '', str(j.exit.url)].filter(Boolean).join(' · '))
    : edgeStep(lastSeen === null ? 'ended' : 'left', lastSeen === null ? 'No leave beacon from the last page' : `Last seen +${clock(lastSeen)}`);
  items.push(chevron(), exit);
  const chips = [];
  if (num(j.returns) > 0) chips.push(el('span', { class: 'badge' }, `came back ${j.returns === 1 ? 'once' : `${j.returns} times`}`));
  if (num(j.stitched) > 0) chips.push(el('span', { class: 'badge' }, 'across midnight'));
  if (j.suspect) chips.push(el('span', { class: 'badge warn', title: 'UTC clock, no engaged time' }, 'suspect'));
  else if (j.reader === false) chips.push(el('span', { class: 'badge warn', title: 'One page, under 5 s, no click' }, 'glance'));
  // An assistant's tag is already the journey's source, so it is not said twice.
  if (src.campaign && !src.assistant) chips.push(el('span', { class: 'badge' }, `tagged ${str(src.campaign)}`));
  const device = deviceLine(j.device);
  const where = j.place?.country ? placeName(j.place) : '';
  const head = el('p', { class: 'j-head' },
    el('span', { class: 'j-when' }, wallClock(j.started, now)),
    where ? el('span', { class: 'j-where' }, ` · ${where}`) : null,
    ` · ${ago(j.started, now)} · ${isNum(j.engaged) ? `${duration(j.engaged)} engaged` : 'no engaged time'} · ${n} page${n === 1 ? '' : 's'}${span !== null ? ` over ${stretch(span)}` : ''}`,
    device ? el('span', { class: 'j-device', title: device }, ` · ${[j.device?.browser, j.device?.os].map(str).filter(Boolean).join(', ')}`) : null,
    ...chips);
  return el('li', { class: `journey${j.suspect || j.reader === false ? ' suspect' : ''}` }, head, el('ol', { class: 'j-flow', 'aria-label': `Journey from ${sourceName(src)}` }, ...items));
}

const JOURNEY_FILTERS = [
  { id: 'suspect', label: 'Hide suspect', on: true, keep: (j) => !j.suspect },
  { id: 'glance', label: 'Hide glances', on: true, keep: (j) => j.reader !== false },
  { id: 'multi', label: 'Only 2+ pages', on: false, keep: (j) => (j.steps?.length ?? 0) >= 2 },
  { id: 'click', label: 'Only with a click', on: false, keep: (j) => j.exit?.kind === 'click' },
];
const JOURNEYS_SHOWN = 8;
// The row's state lives in the address as ?journeys=<ids on> (none: `none`), left out at the defaults.
const JOURNEY_IDS = JOURNEY_FILTERS.map((f) => f.id);
const JOURNEY_DEFAULTS = JOURNEY_FILTERS.filter((f) => f.on).map((f) => f.id);

function journeysCard([journeys]) {
  if (!journeys.rows) return [notConfigured(missing(journeys, 'visits'))];
  const rows = journeys.rows;
  if (!rows.length) return [...errorLines(journeys), el('p', { class: 'empty' }, 'No visits in this range yet. Journeys start at the cutover to lib-visits, 2026-10-15.')];
  const now = Date.now();
  const on = readToggles('journeys', JOURNEY_IDS, JOURNEY_DEFAULTS);
  const state = Object.fromEntries(JOURNEY_FILTERS.map((f) => [f.id, on.has(f.id)]));
  const hidden = el('span', { class: 'j-hidden', role: 'status' });
  // A journey is its start and its browser: the row carries no id of its own.
  const list = filteredList(rows, {
    id: (j) => `${str(j.started)}|${deviceLine(j.device)}`,
    render: (j) => journey(j, now),
    shown: JOURNEYS_SHOWN,
    more: (n) => `More journeys · ${n}`,
    empty: 'Every journey in this range is hidden by the filters.',
  });
  const render = () => {
    const kept = rows.filter((j) => JOURNEY_FILTERS.every((f) => !state[f.id] || f.keep(j)));
    const n = rows.length - kept.length;
    hidden.textContent = n ? `${n} hidden` : '';
    list.update(kept);
  };
  const buttons = JOURNEY_FILTERS.map((f) => {
    const b = el('button', { type: 'button', 'aria-pressed': String(state[f.id]) }, f.label);
    b.addEventListener('click', () => {
      state[f.id] = !state[f.id];
      b.setAttribute('aria-pressed', String(state[f.id]));
      writeToggles('journeys', new Set(JOURNEY_IDS.filter((id) => state[id])), JOURNEY_DEFAULTS);
      render();
    });
    return b;
  });
  render();
  return [...errorLines(journeys), el('div', { class: 'j-filters', role: 'group', 'aria-label': 'Journey filters' }, ...buttons, hidden), list.node];
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


// ---------------------------------------------------------------- health, at the top

const signals = document.getElementById('signals');
/** One small indicator: a dot in its tone and a few words, the detail in its title; a link when it has somewhere to go. */
function signal(tone, text, title, href = null) {
  const attrs = { class: `signal ${tone}`, title, ...(href ? { href } : {}) };
  return el(href ? 'a' : 'span', attrs, el('span', { class: 'dot', 'aria-hidden': 'true' }), text);
}

/**
 * The site's health as small indicators in the page head (Cyrus, 2026-11-21, in place of the
 * Health card): whether the site is up and how many sitemap pages Google has not indexed, always;
 * the certificate, Lighthouse, the sitemap's last fetch and loud 404s only when they warn. The
 * unindexed count opens the Search card's list of them.
 */
function healthSignals(health) {
  const out = [];
  const up = health.up === true;
  const unknown = health.up === null || health.up === undefined;
  const deploy = health.lastDeployAt ? ` · deployed ${ago(health.lastDeployAt)}` : '';
  out.push(unknown
    ? signal('unknown', 'Uptime not checked', `Not read${missing(health, 'uptime') ? ` (${missing(health, 'uptime')})` : ''}`)
    : signal(up ? 'good' : 'critical', up ? 'Up' : 'Down', `HTTP ${isNum(health.status) ? health.status : '–'} · TTFB ${isNum(health.ttfbMs) ? `${health.ttfbMs} ms` : '–'}${deploy}`));
  const ix = health.indexed;
  if (ix && isNum(ix.indexed) && isNum(ix.total)) {
    const left = ix.total - ix.indexed;
    out.push(signal(left > 0 ? 'warning' : 'good', left > 0 ? `${left} not indexed` : 'All indexed', `${ix.indexed} of ${ix.total} sitemap pages in Google's index${health.sitemapFetchedAt ? ` · sitemap fetched ${ago(health.sitemapFetchedAt)}` : ''}`, left > 0 ? '#card-search' : null));
  } else out.push(signal('unknown', 'Indexing not read', `Not read${missing(health, 'indexed', 'sitemap') ? ` (${missing(health, 'indexed', 'sitemap')})` : ''}`));
  if (isNum(health.certDaysLeft) && health.certDaysLeft < CERT_WARN_DAYS) out.push(signal(health.certDaysLeft <= 0 ? 'critical' : 'warning', health.certDaysLeft <= 0 ? 'Certificate expired' : `Certificate ${health.certDaysLeft} d`, 'Days until the TLS certificate expires'));
  if (isNum(health.lighthousePerformance) && health.lighthousePerformance < 95) out.push(signal(health.lighthousePerformance < 80 ? 'critical' : 'warning', `Performance ${health.lighthousePerformance}`, `Lighthouse performance, lab run ${health.lighthouseAt ? ago(health.lighthouseAt) : ''}`.trim()));
  const loud = Array.isArray(health.notFound) ? health.notFound.filter((n) => num(n.visitors) > 3) : [];
  if (loud.length) out.push(signal('warning', loud.length === 1 ? `Broken link ×${num(loud[0].visitors)}` : `${loud.length} broken links`, `${loud.map((n) => `${str(n.path)} (${num(n.visitors)})`).join(', ')}, last 7 days`, '#card-pages'));
  if (health.sitemapFetchedAt && (Date.now() - Date.parse(health.sitemapFetchedAt)) / 86_400_000 > 14) out.push(signal('warning', 'Sitemap stale', `Google last fetched the sitemap ${ago(health.sitemapFetchedAt)}`));
  return out;
}
// health.mjs's own thresholds: the certificate warns under 21 days.
const CERT_WARN_DAYS = 21;

/** Loads the indicators once: the health answer does not change with the range. */
async function loadSignals() {
  signals.setAttribute('aria-busy', 'true');
  try {
    const health = await data.query(app, 'health', range);
    const errs = Object.keys(health?.errors ?? {});
    const nodes = healthSignals(health ?? {});
    if (errs.length) nodes.push(signal('warning', 'Health partly read', `Failed: ${errs.join(', ')}`));
    signals.replaceChildren(...nodes);
  } catch (error) {
    signals.replaceChildren(signal('warning', 'Health not read', str(error?.message)));
  }
  signals.removeAttribute('aria-busy');
  fadeIn(signals, tokens().short3);
}

/** A link to the Search card from the unindexed count opens its list of them. */
signals?.addEventListener('click', (event) => {
  const link = event.target.closest('a.signal');
  if (!link) return;
  const fold = [...document.querySelectorAll(`${link.getAttribute('href')} details.folded`)].find((d) => /^(Not yet indexed|404 paths)/.test(d.querySelector('summary')?.textContent ?? ''));
  if (fold && !fold.open) fold.open = true;
});

// csarko-visits runs without a GeoIP database (lib-visits' `--geoip`), so rows carry no country.
const NO_COUNTRIES = 'No countries in this range: the collector records them from 2026-11-21 (lib-visits v0.6.0).';


const GOATCOUNTER_NOTE = "Before the cutover, counts are GoatCounter's, a browser once per page per session.";
/**
 * The Visitors card's sub: the range (the API's own `label` when it sends one, "last 24 hours"
 * for a day), and which days the counts are cut on (`dayLabel`, the reader's zone the page sent,
 * or "utc" from an API that cut them in UTC), with the visit id's roll at UTC midnight.
 */
function visitorsSub(d, visits) {
  const label = typeof visits?.label === 'string' && visits.label ? `the ${visits.label.replace(/^the /, '')}` : rangeText(d);
  const dayNote = visits?.dayLabel && visits.dayLabel !== 'utc'
    ? `Days are ${visits.dayLabel === viewerZone ? viewerZoneName : visits.dayLabel} days. A visit is one browser until UTC midnight (${utcMidnightHere()} here), so one on the site across it counts twice that day; nothing is stored in it.`
    : `Days are UTC days, which roll at ${utcMidnightHere()} here. A visit is one browser on one UTC day; nothing is stored in it.`;
  return `Who the visitors are: visits ${label} against ${previousText(d)}, where they arrived from and went on to, the cities they are in, their countries, languages, systems, browsers, screens and theme. ${dayNote} ${GOATCOUNTER_NOTE}`;
}

/** The Search card's sub: the day the range ends on, Google's last finished one, since Search Console runs behind. */
function searchSub(d, search) {
  return search?.to
    ? `Through ${shortDay(search.to)}, the last day Google has finished counting; Search Console runs 2 to 3 days behind, and its days are Pacific Time's, whatever zone this page is read in.`
    : "Google Search Console runs 2 to 3 days behind, and its days are Pacific Time's.";
}

/** Each card: its queries, its copy, how it renders, and the skeleton that stands in for it while the queries run. */
const CARDS = [
  { id: 'visitors', title: 'Visitors', queries: ['visits', 'referrers', 'audience', 'events', 'places'], sub: visitorsSub, render: visitorsCard, skeleton: [{ tiles: 3, tile: 188, chart: true }, { heading: false, bars: 10, cols: 2 }, { chart: 300, folds: 3 }] },
  { id: 'pages', title: 'What they read', queries: ['pages'], sub: (d) => `Each page's visitors, ▲▼ against ${previousText(d)}; the share who landed on it and who went on to another; the median time engaged and scroll; a doc's views read to the end; and the LCP 75% of loads beat, a dot past Google's 2.5 s. Hover a title for its path. ${GOATCOUNTER_NOTE}`, render: pagesCard, skeleton: { rows: 10, row: 36, folds: 2 } },
  { id: 'journeys', title: 'Journeys', queries: ['journeys'], sub: () => 'The most recent visits, newest first, each with the city it came from (since 2026-11-21) and one row from where it came to how it left: every page with the time it was visible, a line under it as far as it was scrolled, ✓ when read to the end, a dot when it loaded slowly. Hover a page for the rest. From lib-visits, so since the cutover only.', render: journeysCard, skeleton: { chips: 4, items: 8, item: 64 } },
  { id: 'search', title: 'Search', queries: ['search'], sub: searchSub, render: searchCard, skeleton: { tiles: 5, chart: 185, folds: 3 } },
];

// ---------------------------------------------------------------- the page

function cardShell(def) {
  return el('section', { class: 'card', id: `card-${def.id}`, 'aria-labelledby': `title-${def.id}` },
    el('h2', { id: `title-${def.id}` }, def.title),
    el('p', { class: 'sub' }, def.sub(range)),
    loading(def.skeleton));
}

async function loadCard(def, gen, card) {
  const body = card.querySelector('.body');
  body.setAttribute('aria-busy', 'true');
  const answers = Promise.all(def.queries.map((name) => data.query(app, name, range)));
  answers.catch(() => {});
  // The answers this request last got, drawn first when they come before the live ones (instant.js).
  const saved = savedAll(def.queries.map((name) => data.saved(app, name, range)));
  // A rendered card goes back to its skeleton while it reloads (its content fades out, the
  // skeleton in), held at the height this view had last, else the one it has now, so nothing
  // under it moves but by easing; see hold() in charts.js.
  if (body.querySelector('.skeleton')) hold(card, def.id);
  else {
    const now = card.getBoundingClientRect().height;
    hold(card, def.id, now);
    await fadeOut(body)?.finished.catch(() => {});
    if (gen !== generation) return;
    body.replaceChildren(el('p', { class: 'sr-only' }, 'Loading'), skeleton(def.skeleton));
    fadeIn(body, tokens().short3);
    hold(card, def.id, now);
  }
  await savedThenLive({
    card, key: def.id, body, live: answers, saved,
    current: () => gen === generation,
    draw: (results) => {
      const sub = def.sub(range, results[0]);
      card.querySelector('.sub').textContent = sub;
      card.querySelector('.sub').hidden = !sub;
      body.replaceChildren(...def.render(results, range, () => loadCard(def, generation, card)));
    },
    fail: (error) => body.replaceChildren(errorLine(`${def.title} could not be read.`, error.message)),
  });
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
      writeRange(range);
      for (const other of buttons) other.setAttribute('aria-pressed', String(other === b));
      load();
    });
    return b;
  });
  rangeRow.append(...buttons);
}


/**
 * Every card is on the page, held at its last height, from the first paint: restoring the
 * sign-in takes a second or so, and cards that appeared only after it would push the page
 * about as they came (Cyrus, 2026-10-29). The queries wait for the session; the shapes do not.
 */
function shells() {
  grid.replaceChildren(...CARDS.map(cardShell));
  for (const def of CARDS) hold(document.getElementById(`card-${def.id}`), def.id);
}

async function start() {
  try {
    const apps = await loadApps();
    app = apps.find((a) => a.slug === SLUG);
    if (!app) throw new Error(`${SLUG} is not in apps.json`);
  } catch (error) {
    grid.replaceChildren(el('section', { class: 'card' }, errorLine('apps.json could not be read.', error.message)));
    signals.replaceChildren();
    return;
  }
  load();
  loadSignals();
}

rangeButtons();
shells();
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
