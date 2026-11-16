/**
 * The Film dashboard (Cyrus, 2026-11-16: the films' numbers on their own top-level page, beside
 * csarko.sh's on the index, rather than as one card of the site's): a range row, then the YouTube
 * channel and each film, each card loading its own query and showing its own error line.
 *
 * The API is csarko-admin under `/film` (shapes in admin/CONTRACT.md, "Film"). A part it cannot
 * answer is `null` with `notConfigured` naming the secret, or an `errors` entry; every card renders
 * those in place, never as a blank or a 0.
 */

import { accountMenu, requireSession } from '/auth.js';
import { ago, bars, columns, compact, curve, delta, el, errorLine, folded, hold, loading, pct, shortDay, skeleton, table, tile } from '/charts.js';
import { RANGES, loadApps, preview, readRange, source, writeRange } from '/data.js';
import { fadeIn, fadeOut, tokens } from '/motion.js';
import { savedAll, savedThenLive } from '/instant.js';

const SLUG = 'film';
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

/** Seconds as "41s" or "3m 05s". */
const duration = (s) => { const n = Math.max(0, Math.round(s)); return n >= 60 ? `${Math.floor(n / 60)}m ${String(n % 60).padStart(2, '0')}s` : `${n}s`; };
/** Seconds as m:ss: positions on the retention curve. */
const clock = (s) => { const n = Math.max(0, Math.round(s)); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; };
/** The sites YouTube's External source names most, by suffix (www.google.com is Google too). */
const SOURCE_NAMES = { 'google.com': 'Google', 'bing.com': 'Bing', 'duckduckgo.com': 'DuckDuckGo', 'chatgpt.com': 'ChatGPT', 'github.com': 'GitHub', 'linkedin.com': 'LinkedIn', 'substack.com': 'Substack', 'csarko.sh': 'csarko.sh', 't.co': 'X' };
/** The host's name by suffix, else the host as given. */
function hostName(host) {
  const h = str(host).toLowerCase();
  for (const [suffix, name] of Object.entries(SOURCE_NAMES)) if (h === suffix || h.endsWith(`.${suffix}`)) return name;
  return str(host);
}

// ---------------------------------------------------------------- the channel (YouTube Data API)

/** The channel as a whole: its subscribers and lifetime views against the snapshot a week back, its uploads, and each video's views and likes. */
function channelCard([channel]) {
  const parts = [...errorLines(channel)];
  const yt = channel.youtube;
  if (!yt) return [...parts, notConfigured(missing(channel, 'youtube'))];
  parts.push(el('div', { class: 'tiles' },
    tile('Subscribers', yt.subscribers, { delta: yt.prev ? delta(yt.subscribers, yt.prev.subscribers, { vs: 'the last snapshot', percent: false }) : undefined, note: yt.prev ? undefined : 'no snapshot a week back yet' }),
    tile('Views', yt.views, { delta: yt.prev ? delta(yt.views, yt.prev.views, { vs: 'the last snapshot' }) : undefined, note: 'every upload, over the channel\'s life' }),
    tile('Videos', yt.videos)));
  parts.push(folded(`Videos · ${yt.videosList?.length ?? 0}`, table([
    { key: 'title', label: 'Title', wrap: true, render: (v, row) => (row.id ? el('a', { href: `https://www.youtube.com/watch?v=${encodeURIComponent(str(row.id))}`, target: '_blank', rel: 'noopener' }, str(v)) : str(v)) },
    { key: 'views', label: 'Views', num: true },
    { key: 'likes', label: 'Likes', num: true },
  ], yt.videosList ?? [])));
  return parts;
}

// ---------------------------------------------------------------- films (YouTube Analytics)

/** YouTube's traffic source types in its own Studio words. */
const TRAFFIC_SOURCES = {
  SHORTS: 'Shorts feed', YT_SEARCH: 'YouTube search', EXT_URL: 'External', RELATED_VIDEO: 'Suggested videos', YT_CHANNEL: 'Channel pages',
  SUBSCRIBER: 'Browse features', NO_LINK_OTHER: 'Direct or unknown', NO_LINK_EMBEDDED: 'Embedded players', PLAYLIST: 'Playlists', YT_PLAYLIST_PAGE: 'Playlist pages',
  YT_OTHER_PAGE: 'Other YouTube features', NOTIFICATION: 'Notifications', END_SCREEN: 'End screens', ANNOTATION: 'Cards', CAMPAIGN_CARD: 'Campaign cards',
  HASHTAGS: 'Hashtag pages', SOUND_PAGE: 'Sound pages', SHORTS_CONTENT_LINKS: 'Shorts related video', VIDEO_REMIXES: 'Remixes', ADVERTISING: 'YouTube ads',
  PROMOTED: 'Promotions', LIVE_REDIRECT: 'Live redirects', PRODUCT_PAGE: 'Product pages', IMMERSIVE_LIVE: 'Immersive live',
};
const trafficName = (type) => TRAFFIC_SOURCES[str(type)] ?? cap(str(type).toLowerCase().replace(/_/g, ' '));

/** An External detail (a full URL or a bare host, as YouTube reports it) as { site, host, page, href }: every reddit.com host and redd.it is one site, Reddit. */
function externalSite(detail) {
  const raw = str(detail).trim();
  let url = null;
  try { url = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`); } catch { url = null; }
  const host = url ? url.hostname.replace(/^(www|old|new|m|np)\./, '') : raw;
  const reddit = host === 'redd.it' || host === 'reddit.com' || host.endsWith('.reddit.com');
  const page = url && url.pathname !== '/' ? `${url.pathname}${url.search}` : '';
  return { site: reddit ? 'Reddit' : hostName(host) || raw, host, page, href: url && /^https?:/.test(url.protocol) && /^[a-z]+:\/\//i.test(raw) ? url.href : null };
}

/** Minutes as the card says them: 940 min, 15.7 h. */
const watchTime = (min) => (num(min) >= 120 ? `${compact(Math.round(num(min) / 6) / 10)} h` : `${compact(Math.round(num(min)))} min`);
/** m:ss to seconds; null when the runtime is unknown. */
const runtimeSecs = (rt) => { const m = /^(\d+):(\d{2})$/.exec(str(rt)); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };

/**
 * Engaged views (2026-11-03): the views that played past a Short's first seconds. Since YouTube's
 * 2025 change a Shorts view is any start or replay, so the rest of the views are swipes and loops.
 * Snapshots made before the card read them have no `engagedViews`, which is null here, not 0.
 */
const engagedOf = (row) => (isNum(row?.engagedViews) ? row.engagedViews : isNum(row?.engaged) ? row.engaged : null);
/** "58% engaged" for a row with views and engaged views, else null. */
const engagedShare = (row) => { const e = engagedOf(row); return e === null || num(row?.views) <= 0 ? null : `${pct(e, num(row.views))} engaged`; };

/** A film's five numbers, each against the range before: views, engaged views, watch time, average percentage viewed, subscribers gained. */
function filmTiles(f, days) {
  const t = f.totals ?? {};
  const p = f.prev ?? {};
  const vs = previousText(days);
  const viewed = num(t.views) > 0;
  const engaged = engagedOf(t);
  // Watch time over the engaged views alone: the swipes' few seconds stay in it, so it is a ceiling.
  const perEngaged = engaged ? `; at most ${duration((num(t.estimatedMinutesWatched) * 60) / engaged)} an engaged view` : '';
  return el('div', { class: 'tiles' },
    tile('Views', num(t.views), { delta: delta(num(t.views), p.views, { vs }) }),
    tile('Engaged views', engaged === null ? '–' : engaged, {
      delta: engaged === null ? undefined : delta(engaged, engagedOf(p), { vs }),
      note: engaged === null ? 'not in this snapshot: the next daily one reads them' : viewed ? `${pct(engaged, num(t.views))} of views; the rest swiped away or looped` : 'no views in this range',
    }),
    tile('Watch time', watchTime(t.estimatedMinutesWatched), {
      delta: delta(num(t.estimatedMinutesWatched), p.estimatedMinutesWatched, { vs, format: watchTime }),
      note: viewed ? `${duration(num(t.averageViewDuration))} a view on average${perEngaged}` : 'no views in this range',
    }),
    tile('Average viewed', viewed ? `${num(t.averageViewPercentage).toFixed(1)}%` : '–', {
      delta: viewed ? delta(num(t.averageViewPercentage), num(p.views) > 0 ? p.averageViewPercentage : null, { vs, percent: false, format: (v) => `${v.toFixed(1)}%` }) : undefined,
      note: viewed ? 'of the runtime, on average' : 'no views in this range',
    }),
    tile('Subscribers gained', num(t.subscribersGained), { delta: delta(num(t.subscribersGained), p.subscribersGained, { vs, percent: false }) }));
}

/** The retention curve: the share of views still watching at each hundredth of the runtime. */
function retentionChart(f) {
  const points = Array.isArray(f.retention) ? f.retention : [];
  if (!points.length) return el('p', { class: 'empty' }, f.errors?.retention ? 'The retention curve was not read.' : 'No retention yet: YouTube draws the curve once a film has enough views.');
  const secs = runtimeSecs(f.runtime);
  const at = (ratio) => (secs === null ? `${Math.round(ratio * 100)}%` : clock(ratio * secs));
  const relative = (r) => (isNum(r) ? (r >= 0.55 ? 'above' : r <= 0.45 ? 'below' : 'about the same as') : null);
  // A tick at each quarter of the runtime, on the point nearest it (the first point is 1% in).
  const nearest = (ratio) => points.reduce((best, pt, i) => (Math.abs(num(pt.ratio) - ratio) < Math.abs(num(points[best].ratio) - ratio) ? i : best), 0);
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({ at: nearest(ratio), label: at(ratio) }));
  const mid = points[Math.round((points.length - 1) / 2)];
  const end = points[points.length - 1];
  const chart = curve(points.map((pt) => ({
    value: num(pt.watch),
    lines: [{ v: pct(num(pt.watch)), k: `still watching at ${at(pt.ratio)}` }, ...(relative(pt.relative) ? [{ v: relative(pt.relative), k: 'videos of a similar length' }] : [])],
  })), { height: 170, min: 1, format: (v) => pct(v), xTicks, label: `Retention for ${str(f.title)}: ${pct(num(mid?.watch))} still watching halfway, ${pct(num(end?.watch))} at the end` });
  const note = el('p', { class: 'note' }, `YouTube reports retention in 100 steps of the runtime${secs === null ? '' : `, ${(secs / 100).toFixed(2).replace(/0$/, '')} s each here`}; past 100% means people watched that moment again, as a Short that loops does. Over the film's life, not the range.`);
  return [chart, note];
}

/** Where a film's views came from: the traffic source types, and External's sites and pages, Reddit's posts as one site. */
function filmSources(f, days) {
  const sources = Array.isArray(f.sources) ? f.sources : null;
  const external = Array.isArray(f.external) ? f.external : null;
  const left = el('div', {}, el('h3', {}, 'Traffic sources'), sources === null
    ? el('p', { class: 'empty' }, 'Traffic sources were not read.')
    : sources.length ? bars(sources.map((s) => ({ name: trafficName(s.source), value: num(s.views), aside: engagedShare(s), detail: `${trafficName(s.source)}, ${engagedOf(s) === null ? '' : `${compact(engagedOf(s))} engaged, `}${watchTime(s.minutes)} watched` })), { label: `Views by traffic source, ${rangeText(days)}` }) : el('p', { class: 'empty' }, 'No views in this range.'));
  if (external === null) return [el('div', { class: 'pair' }, left, el('div', {}, el('h3', {}, 'External sites'), el('p', { class: 'empty' }, 'External sites were not read.')))];
  const pages = external.map((e) => ({ ...externalSite(e.url), views: num(e.views), engaged: engagedOf(e), minutes: num(e.minutes) }));
  const sites = new Map();
  for (const pg of pages) sites.set(pg.site, (sites.get(pg.site) ?? 0) + pg.views);
  const right = el('div', {}, el('h3', {}, 'External sites'), sites.size
    ? bars([...sites].sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value, detail: `${name} sent` })), { label: `Views from outside YouTube by site, ${rangeText(days)}` })
    : el('p', { class: 'empty' }, 'Nothing from outside YouTube in this range.'));
  const list = folded(`External pages · ${pages.length}`, table([
    { key: 'site', label: 'Site' },
    { key: 'page', label: 'Page', wrap: true, render: (v, row) => { const text = row.page || row.host; return row.href ? el('a', { href: row.href, target: '_blank', rel: 'noopener', class: 'mono' }, text) : mono(text); } },
    { key: 'views', label: 'Views', num: true },
    { key: 'engaged', label: 'Engaged', num: true, render: (v) => (v === null ? '–' : compact(v)) },
    { key: 'minutes', label: 'Watch time', num: true, render: (v) => watchTime(v) },
  ], [...pages].sort((a, b) => (sites.get(b.site) ?? 0) - (sites.get(a.site) ?? 0) || a.site.localeCompare(b.site) || b.views - a.views), 'Nothing from outside YouTube in this range.'));
  return [el('div', { class: 'pair' }, left, right), list];
}

/** YouTube's device types in Studio's words. */
const DEVICES = { MOBILE: 'Phone', DESKTOP: 'Computer', TABLET: 'Tablet', TV: 'TV', GAME_CONSOLE: 'Game console', UNKNOWN_PLATFORM: 'Unknown' };
const deviceName = (type) => DEVICES[str(type)] ?? cap(str(type).toLowerCase().replace(/_/g, ' '));
let regionNames = null;
/** A country code as its English name (ID is Indonesia), the code itself where the browser has no name for it. */
const countryName = (code) => { try { regionNames ??= new Intl.DisplayNames(['en'], { type: 'region' }); return regionNames.of(str(code)) || str(code); } catch { return str(code); } };
/** An age group as Studio says it: age18-24 is 18 to 24, age65- is 65 and over. */
const ageName = (group) => { const m = /^age(\d+)-(\d*)$/.exec(str(group)); return m ? (m[2] ? `${m[1]} to ${m[2]}` : `${m[1]} and over`) : str(group); };
const GENDERS = { female: 'Female', male: 'Male', user_specified: 'User-specified' };
/** The countries the bars show; the rest are in the fold under them. */
const COUNTRY_BARS = 8;

/**
 * Who watched a film (2026-11-12): views by country and by device, each with the share that played
 * past the first seconds, which is the number that differs between groups (a Short's swipes are
 * most of its views). Then the age and gender shares, which are all YouTube gives for them.
 */
function filmAudience(f, days) {
  const countries = Array.isArray(f.countries) ? f.countries : null;
  const devices = Array.isArray(f.devices) ? f.devices : null;
  const demographics = Array.isArray(f.demographics) ? f.demographics : null;
  const viewsBars = (rows, nameOf, label) => bars(rows.map((r) => ({ name: nameOf(r), value: num(r.views), aside: engagedShare(r), detail: `${nameOf(r)}, ${engagedOf(r) === null ? '' : `${compact(engagedOf(r))} engaged, `}${watchTime(r.minutes)} watched` })), { label });
  const country = (r) => countryName(r.country);
  const left = el('div', {}, el('h3', {}, 'Countries'), countries === null
    ? el('p', { class: 'empty' }, f.errors?.countries ? 'Countries were not read.' : 'Not in this snapshot: the next daily one reads them.')
    : countries.length ? viewsBars(countries.slice(0, COUNTRY_BARS), country, `Views by country, ${rangeText(days)}`) : el('p', { class: 'empty' }, 'No views in this range.'));
  const right = el('div', {}, el('h3', {}, 'Devices'), devices === null
    ? el('p', { class: 'empty' }, f.errors?.devices ? 'Devices were not read.' : 'Not in this snapshot: the next daily one reads them.')
    : devices.length ? viewsBars(devices, (r) => deviceName(r.device), `Views by device, ${rangeText(days)}`) : el('p', { class: 'empty' }, 'No views in this range.'));
  const parts = [el('div', { class: 'pair' }, left, right)];
  if (countries !== null && countries.length > COUNTRY_BARS) {
    parts.push(folded(`Every country · ${countries.length}`, table([
      { key: 'country', label: 'Country', wrap: true, render: (v) => countryName(v) },
      { key: 'views', label: 'Views', num: true },
      { key: 'engaged', label: 'Engaged', num: true, render: (v) => (v === null ? '–' : compact(v)) },
      { key: 'views', label: 'Stayed', num: true, render: (v, row) => engagedShare(row)?.replace(' engaged', '') ?? '–' },
      { key: 'minutes', label: 'Watch time', num: true, render: (v) => watchTime(v) },
    ], countries, 'No views in this range.')));
  }
  const listed = countries === null ? 0 : countries.reduce((n, r) => n + num(r.views), 0);
  const all = num(f.totals?.views);
  const coverage = countries !== null && countries.length && listed < all ? ` These ${countries.length} ${countries.length === 1 ? 'country holds' : 'countries hold'} ${compact(listed)} of the ${compact(all)} views; YouTube leaves out countries with too few viewers.` : '';
  parts.push(el('p', { class: 'note' }, `Engaged is the share of a group's views that played past the first seconds; the rest swiped away. With few views it moves by chance: by up to 10 points either way at 100 views, 5 at 400.${coverage}`));
  parts.push(el('h3', {}, 'Age and gender'));
  if (demographics === null) parts.push(el('p', { class: 'empty' }, f.errors?.demographics ? 'Age and gender were not read.' : 'Not in this snapshot: the next daily one reads them.'));
  else if (!demographics.length) parts.push(el('p', { class: 'empty' }, 'YouTube shows no age or gender for this range: too few signed-in viewers.'));
  else {
    const sum = (key) => { const m = new Map(); for (const d of demographics) m.set(d[key], (m.get(d[key]) ?? 0) + num(d.percent)); return [...m]; };
    const share = (v) => Math.round(v * 10) / 10;
    const ages = sum('age');
    const genders = `${sum('gender').sort((a, b) => b[1] - a[1]).map(([g, v]) => `${GENDERS[g] ?? cap(str(g))} ${share(v)}%`).join(' · ')}`;
    // YouTube shows only the groups with enough signed-in viewers, each a share of those alone, so one group reads 100%.
    if (ages.length === 1) parts.push(el('p', { class: 'note' }, `Only one age group had enough signed-in viewers for YouTube to show it: ${ageName(ages[0][0])}. Within it: ${genders}.`));
    else {
      parts.push(bars(ages.map(([age, v]) => ({ name: ageName(age), value: share(v), detail: `${ageName(age)} years old` })), { unit: '%', label: `Signed-in viewers by age, ${rangeText(days)}` }));
      parts.push(el('p', { class: 'note' }, `${genders}. Shares of the groups YouTube shows, which leaves out any with too few signed-in viewers.`));
    }
    parts.push(el('p', { class: 'note' }, 'YouTube gives no views or watch time by age or gender, so it cannot say which group stayed.'));
  }
  return parts;
}

/** A film's views per day, each day split into its engaged views and the rest once the snapshot has them. */
function dailyViews(f, daily, days) {
  const label = `Views per day of ${str(f.title)}, ${rangeText(days)}: ${compact(num(f.totals?.views))} in all`;
  if (!daily.every((d) => engagedOf(d) !== null)) return columns(dayBars(daily, 'views'), { height: 160, label });
  const engaged = daily.map((d) => Math.min(engagedOf(d), num(d.views)));
  return columns(dayBars(daily, 'views'), {
    height: 160,
    label: `${label}, ${compact(engagedOf(f.totals) ?? 0)} of them engaged`,
    series: [
      { key: 'engaged', label: 'Engaged: played past the first seconds', values: engaged },
      { key: 'rest', label: 'Swiped away or looped', tone: 'c9', values: daily.map((d, i) => num(d.views) - engaged[i]) },
    ],
  });
}

/** One film: its title, its five numbers, and folded under them its days, its retention and where its views came from. */
function filmBlock(f, days) {
  const href = f.videoId ? `https://www.youtube.com/watch?v=${encodeURIComponent(str(f.videoId))}` : null;
  const title = el('h3', { class: 'film-title' }, href ? el('a', { href, target: '_blank', rel: 'noopener' }, str(f.title)) : str(f.title));
  if (f.published) title.append(el('small', {}, ` released ${shortDay(f.published)}`));
  const daily = Array.isArray(f.daily) ? f.daily : [];
  const opened = folded(`${str(f.title)}: by day, retention, traffic sources, audience`, [
    ...errorLines(f),
    el('h3', {}, 'Views per day'),
    daily.length ? dailyViews(f, daily, days) : el('p', { class: 'empty' }, 'No days in this range.'),
    el('h3', {}, 'Retention'),
    retentionChart(f),
    ...filmSources(f, days),
    ...filmAudience(f, days),
  ].flat());
  return el('div', { class: 'film' }, title, filmTiles(f, days), opened);
}

function filmsCard([films], days) {
  if (!films.films) {
    const errors = errorLines(films);
    return errors.length ? errors : [notConfigured(missing(films, 'films'))];
  }
  const parts = [...errorLines(films)];
  if (!films.films.length) parts.push(el('p', { class: 'empty' }, 'No films listed: docs/films has none.'));
  for (const f of films.films) parts.push(filmBlock(f, films.days ?? days));
  const others = Array.isArray(films.others) ? films.others : [];
  parts.push(folded(`Other uploads · ${others.length}`, table([
    { key: 'title', label: 'Video', wrap: true, render: (v, row) => el('a', { href: `https://www.youtube.com/watch?v=${encodeURIComponent(str(row.videoId))}`, target: '_blank', rel: 'noopener' }, v ? str(v) : str(row.videoId)) },
    { key: 'totals', label: 'Views', num: true, render: (v) => compact(num(v?.views)) },
    { key: 'prev', label: 'Before', num: true, render: (v) => compact(num(v?.views)) },
    { key: 'totals', label: 'Watch time', num: true, render: (v) => watchTime(v?.estimatedMinutesWatched) },
    { key: 'totals', label: 'Avg viewed', num: true, render: (v) => (num(v?.views) > 0 ? `${num(v.averageViewPercentage).toFixed(1)}%` : '–') },
    { key: 'totals', label: 'Subscribers', num: true, render: (v) => compact(num(v?.subscribersGained)) },
  ], others, 'Every upload on the channel is a film.')));
  const age = films.at ? `${films.errors?.films ? 'Last good numbers' : 'From the daily snapshot'}, ${ago(films.at)} (${new Date(films.at).toLocaleString()})` : 'No snapshot yet';
  parts.push(el('p', { class: 'card-foot' }, `${str(films.lag) || 'YouTube Analytics runs 2 to 3 days behind'} · ${age}`));
  return parts;
}

/** The Films card's sub: the range, through YouTube's last finished day, and what 1 day means here. */
function filmsSub(d, films) {
  const shown = films?.days ?? (d === 1 ? 7 : d);
  const through = films?.to ? ` through ${shortDay(films.to)}` : '';
  const noDay = d === 1 ? 'YouTube Analytics has no view of a single day, so this is 7 days. ' : '';
  return `${noDay}Each film on YouTube over the ${shown} days${through}, against the ${shown} days before: views, engaged views (the ones that played past a Short's first seconds), watch time, how much of it people watched and the subscribers it brought. Open a film for its days, its retention, where its views came from and who watched: the countries and devices, each with the share that stayed, and the age and gender shares. YouTube Analytics runs 2 to 3 days behind, so the range ends on the last day it has finished; its days are Pacific Time's.`;
}

/** Each card: its queries, its copy, how it renders, and the skeleton that stands in for it while the queries run. */
const CARDS = [
  { id: 'channel', title: 'Channel', queries: ['channel'], sub: () => 'The YouTube channel @csarkosh as YouTube shows it now: subscribers and lifetime views against the daily snapshot a week back, and every upload with its views and likes.', render: channelCard, skeleton: { tiles: 3, tile: 118, folds: 1 } },
  { id: 'films', title: 'Films', queries: ['films'], sub: filmsSub, render: filmsCard, skeleton: [{ heading: true, tiles: 5, tile: 145, folds: 1 }, { tiles: 5, tile: 145, folds: 1 }, { heading: false, folds: 1, lines: 1 }] },
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
    return;
  }
  load();
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

