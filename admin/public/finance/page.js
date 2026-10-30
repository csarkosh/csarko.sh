/**
 * The Finance dashboard (docs/superpowers/specs/2026-10-29-finance-admin-page-design.md): a range
 * row, then six cards in order, each loading its own query and showing its own error line. The
 * month's totals and forecast against the idle goal, spend by category month by month, the idle
 * run-rate as the list of lines that bill while nothing runs, the last 60 days by provider with
 * the days that spiked, what the range's activity bought at what unit price, and the sources.
 *
 * The API is csarko-admin under `/finance` (shapes in admin/CONTRACT.md, "Finance"). Every amount
 * is US dollars net of credits; a day is the provider's own UTC billing day. The range is
 * `month|last|90|13m` (`?range=`), not days: data.js sends it in place of `days`. A part the API
 * cannot answer is `null` with `notConfigured` naming the secret, or an `errors` entry; every
 * card renders those in place, never as a blank or a 0.
 */

import { accountMenu, requireSession } from '/auth.js';
import { ago, columns, compact, delta, el, errorLine, folded, hold, loading, settle, shortDay, skeleton, table, tile } from '/charts.js';
import { loadApps, preview, readParam, source, writeParam } from '/data.js';

const SLUG = 'finance';
const root = document.getElementById('top');
const grid = document.getElementById('cards');
const rangeRow = document.getElementById('range');
const account = document.getElementById('account');

const data = source();
let app = null;
const RANGES = [
  { range: 'month', label: 'This month' },
  { range: 'last', label: 'Last month' },
  { range: '90', label: '90 days' },
  { range: '13m', label: '13 months' },
];
const DEFAULT_RANGE = 'month';
const asked = readParam('range');
let range = RANGES.some((r) => r.range === asked) ? asked : DEFAULT_RANGE;
let generation = 0;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const num = (v) => (isNum(v) ? v : 0);
const str = (v) => (v === null || v === undefined ? '' : String(v));
const missing = (answer, ...parts) => parts.map((p) => answer?.notConfigured?.[p]).find(Boolean) ?? null;
const notConfigured = (env, what = '') => el('p', { class: 'empty' }, `${what ? `${what}: ` : ''}Not configured${env ? ` (${env})` : ''}`);
const notConfiguredText = (env) => `Not configured${env ? ` (${env})` : ''}`;
function errorLines(...answers) {
  const lines = [];
  for (const a of answers) {
    if (!a?.errors || Array.isArray(a.errors)) continue;
    for (const [part, message] of Object.entries(a.errors)) lines.push(errorLine(`${part} failed.`, str(message)));
  }
  return lines;
}

// ---------------------------------------------------------------- money and months

/** "$1,234.56"; a dash for a missing number; "−$3.20" for a credit. */
function money(v, digits = 2) {
  if (!isNum(v)) return '–';
  const abs = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${v < 0 ? '−' : ''}$${abs}`;
}
/** "$26", "$0.50", "$1.2K": an axis tick or a direct label. */
function moneyShort(v) {
  if (!isNum(v)) return '–';
  if (Math.abs(v) >= 1000) return `$${compact(v)}`;
  if (Number.isInteger(v)) return `$${v.toLocaleString('en-US')}`;
  return `$${v.toLocaleString('en-US', { maximumFractionDigits: Math.abs(v) < 1 ? 2 : 1 })}`;
}
/** A unit price: three places under a dollar ("$0.526"), two above. */
const price = (v) => (isNum(v) ? money(v, Math.abs(v) < 1 ? 3 : 2) : '–');

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ym = (iso) => /^(\d{4})-(\d{2})/.exec(iso ?? '');
/** "October 2026" from "2026-10". */
function monthName(iso) {
  const m = ym(iso);
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : str(iso);
}
/** "Oct" from "2026-10", with the year on January and on the first column. */
function monthTick(iso, first = false) {
  const m = ym(iso);
  if (!m) return str(iso);
  const short = MONTHS[Number(m[2]) - 1].slice(0, 3);
  return first || m[2] === '01' ? `${short} ${m[1].slice(2)}` : short;
}
const thisMonth = () => new Date().toISOString().slice(0, 7);
/** The range in words for a card's copy, given the months it covers when the answer names them. */
function rangeText(r, months = null) {
  const last = months?.[months.length - 1] ?? thisMonth();
  const first = months?.[0];
  if (r === 'month') return `${monthName(last)} so far`;
  if (r === 'last') return monthName(last);
  if (r === '90') return first ? `${monthName(first).split(' ')[0]} to ${monthName(last)}` : `the three months to ${monthName(last)}`;
  return `the 13 months to ${monthName(last)}`;
}

// ---------------------------------------------------------------- the fixed orders

const PROVIDERS = {
  aws: { label: 'AWS', tone: 'p1', env: 'AWS_COST_ROLE_ARN' },
  gcp: { label: 'Google Cloud', tone: 'p2', env: 'BILLING_DATASET' },
  github: { label: 'GitHub', tone: 'p3', env: 'GITHUB_TOKEN' },
};
const providerName = (key) => PROVIDERS[key]?.label ?? str(key);

/** The categories in their fixed order with their slots (spec section 3); the last three fold into Other. */
const CATEGORIES = [
  { key: 'compute', label: 'Compute', tone: 'c1' },
  { key: 'serverless', label: 'Serverless', tone: 'c2' },
  { key: 'hosting', label: 'Hosting and bandwidth', tone: 'c3' },
  { key: 'loadBalancing', label: 'Load balancing', tone: 'c4' },
  { key: 'storage', label: 'Storage', tone: 'c5' },
  { key: 'ai', label: 'AI generation', tone: 'c6' },
  { key: 'dns', label: 'DNS, keys and secrets', tone: 'c7' },
  { key: 'domains', label: 'Domains', tone: 'c8' },
];
const FOLDED = ['ci', 'tax', 'other'];
const OTHER = { key: 'other', label: 'Other (CI, tax, unmapped)', tone: 'c9' };
const categoryName = (key, answer) => answer?.categories?.find((c) => c.key === key)?.label ?? CATEGORIES.find((c) => c.key === key)?.label ?? { ci: 'CI', tax: 'Tax', other: 'Other' }[key] ?? str(key);

/** "under the $5 goal" or "$1.20 over the $5 goal", in the delta's tones, the words carrying the direction. */
function goalNote(runRate, goal) {
  if (!isNum(runRate) || !isNum(goal)) return null;
  const over = runRate > goal;
  return el('span', { class: `delta ${over ? 'down' : 'up'}` }, over ? `${money(runRate - goal)} over the ${moneyShort(goal)} goal` : `under the ${moneyShort(goal)} goal`);
}

// ---------------------------------------------------------------- 1. this month

function summaryCard([summary], r) {
  const total = summary.total;
  if (!total) return [notConfigured(missing(summary, 'aws', 'gcp', 'github'))];
  const finished = r === 'last';
  const tiles = el('div', { class: 'tiles' },
    tile(finished ? 'The month' : 'Month to date', money(total.mtd), { delta: delta(num(total.mtd), total.lastMonth, { good: 'down', vs: 'the month before', percent: true, format: money }) }),
    tile('Forecast', finished ? '–' : money(total.forecast), { note: finished ? 'A finished month has no forecast' : 'AWS forecast, Google Cloud run-rate, GitHub net' }),
    tile(finished ? 'The month before' : 'Last month', money(total.lastMonth)),
    tile('Idle run-rate', money(total.idleRunRate), { delta: goalNote(total.idleRunRate, summary.goalUsd) ?? undefined, note: 'What bills a month while nothing runs' }));
  const rows = (summary.providers ?? []).map((p) => ({ ...p, env: missing(summary, p.provider) }));
  const providerCell = (p) => el('span', { class: 'cell' }, el('span', {}, p.label ?? providerName(p.provider)),
    isNum(p.gross) ? el('small', {}, `${money(p.gross)} gross if private`) : null);
  const providers = table([
    { key: 'provider', label: 'Provider', wrap: true, render: (_, p) => providerCell(p) },
    { key: 'mtd', label: finished ? 'The month' : 'Month to date', num: true, render: (v, p) => (isNum(v) ? money(v) : el('span', { class: 'empty' }, notConfiguredText(p.env))) },
    { key: 'lastMonth', label: finished ? 'The month before' : 'Last month', num: true, render: (v, p) => (isNum(p.mtd) ? money(v) : '') },
    { key: 'change', label: 'Change', num: true, render: (_, p) => (isNum(p.mtd) && isNum(p.lastMonth) ? delta(p.mtd, p.lastMonth, { good: 'down', vs: 'the month before', percent: true, format: money }) : '') },
    { key: 'lastDay', label: 'Last day billed', render: (v) => (v ? shortDay(v) : '') },
  ], rows, 'No providers answered.');
  return [...errorLines(summary), tiles, providers];
}

// ---------------------------------------------------------------- 2. by category

function categoriesCard([cats], r) {
  if (!Array.isArray(cats.months) || !Array.isArray(cats.categories)) return [notConfigured(missing(cats, 'aws', 'gcp', 'github'))];
  const months = cats.months;
  const byKey = new Map(cats.categories.map((c) => [c.key, c]));
  const values = (key) => months.map((_, i) => num(byKey.get(key)?.byMonth?.[i]));
  const series = CATEGORIES.map((c) => ({ ...c, label: categoryName(c.key, cats), values: values(c.key) }));
  const foldedValues = months.map((_, i) => FOLDED.reduce((n, key) => n + num(byKey.get(key)?.byMonth?.[i]), 0));
  series.push({ ...OTHER, values: foldedValues });
  const partial = new Set(cats.partial ?? []);
  const columnsOf = months.map((m, i) => ({
    label: `${monthTick(m, i === 0)}${partial.has(m) ? '*' : ''}`,
    detail: `${monthName(m)}${partial.has(m) ? ' (AWS and GitHub only)' : ''}`,
  }));
  const totals = months.map((_, i) => series.reduce((n, s) => n + s.values[i], 0));
  const chart = columns(columnsOf, {
    height: 240,
    series,
    format: moneyShort,
    tip: money,
    label: `Spend by category, one column a month, ${rangeText(r, months)}: ${money(totals.reduce((n, v) => n + v, 0))} in all; the table below has every figure.`,
  });
  const partialNote = partial.size
    ? el('p', { class: 'note' }, `* ${[...partial].map((m) => monthName(m)).join(', ')}: AWS and GitHub only. The Google Cloud export has no days before 29 October 2026.`)
    : null;
  // Every category as a row, each month a column, the folded three kept apart here.
  const allKeys = [...CATEGORIES.map((c) => c.key), ...FOLDED];
  const rows = allKeys.map((key) => ({ key, name: categoryName(key, cats), kind: byKey.get(key)?.kind ?? '', ...Object.fromEntries(months.map((m, i) => [m, num(byKey.get(key)?.byMonth?.[i])])) }));
  rows.push({ key: 'total', name: 'All categories', kind: '', ...Object.fromEntries(months.map((m, i) => [m, totals[i]])) });
  const tableCols = [
    { key: 'name', label: 'Category', wrap: true, render: (v, row) => (row.key === 'total' ? el('b', {}, v) : v) },
    { key: 'kind', label: 'Kind' },
    ...months.map((m) => ({ key: m, label: monthTick(m, true), num: true, render: (v) => (v ? money(v) : el('span', { class: 'empty' }, '$0')) })),
  ];
  const other = Array.isArray(cats.other) && cats.other.length
    ? folded(`Unmapped lines in Other · ${cats.other.length}`, table([
      { key: 'provider', label: 'Provider', render: (v) => providerName(v) },
      { key: 'line', label: 'Line', wrap: true, render: (v) => el('span', { class: 'mono' }, str(v)) },
      { key: 'amount', label: 'Amount', num: true, render: (v) => money(v) },
    ], cats.other))
    : null;
  return [...errorLines(cats), chart, partialNote, folded('By category as a table', table(tableCols, rows)), other].filter(Boolean);
}

// ---------------------------------------------------------------- 3. idle run-rate

function idleCard([idle]) {
  if (!Array.isArray(idle.lines)) return [notConfigured(missing(idle, 'aws', 'gcp', 'github'))];
  const lines = [...idle.lines].sort((a, b) => num(b.perMonth) - num(a.perMonth) || str(a.line).localeCompare(str(b.line)));
  const live = lines.filter((l) => !l.stoppedOn);
  const stopped = lines.filter((l) => l.stoppedOn);
  const tiles = el('div', { class: 'tiles' },
    tile('Idle run-rate', money(idle.runRate), { delta: goalNote(idle.runRate, idle.goalUsd) ?? undefined, note: `A month of the last seven days' idle lines${idle.asOf ? `, as of ${shortDay(idle.asOf)}` : ''}` }),
    tile('Lines billing', live.length, { note: 'Each a resource that costs money while nothing runs' }),
    tile('Stopped this week', stopped.length, { note: stopped.length ? 'Struck through below until a week has passed' : 'Nothing cleaned up in the last seven days' }));
  // The bars list by hand: a wider name column, the line in mono with its provider and place
  // under it; a stopped line struck through with its last day in place of its figure.
  const max = Math.max(0, ...lines.map((l) => num(l.perMonth)));
  const list = el('ul', { class: 'bars wide', role: 'list', 'aria-label': 'Idle lines by monthly cost' });
  for (const l of lines) {
    const width = max > 0 ? Math.max((num(l.perMonth) / max) * 100, num(l.perMonth) > 0 ? 1 : 0) : 0;
    const fill = el('span', { class: `fill${num(l.perMonth) <= 0 ? ' empty-fill' : ''}`, 'aria-hidden': 'true' });
    fill.style.width = `${width}%`;
    const whereText = [providerName(l.provider), str(l.where), categoryName(l.category, null)].filter(Boolean).join(' · ');
    const stoppedText = l.stoppedOn ? `stopped ${shortDay(l.stoppedOn)}` : '';
    const item = el('li', { class: l.stoppedOn ? 'stopped' : null, tabindex: 0, title: `${str(l.line)} (${whereText}): ${money(l.perMonth)} a month, ${money(l.perDay, 4)} a day${stoppedText ? `, ${stoppedText}` : ''}` },
      el('span', { class: 'name' }, el('span', { class: 'mono' }, str(l.line)), el('small', {}, whereText)),
      el('span', { class: 'track' }, fill),
      el('span', { class: 'n' }, stoppedText || money(l.perMonth), stoppedText ? null : el('small', {}, `${money(l.perDay, 4)}/day`)));
    list.append(item);
  }
  const body = lines.length ? list : el('p', { class: 'empty' }, 'No idle lines: nothing bills while nothing runs.');
  const asTable = lines.length ? folded('Idle lines as a table', table([
    { key: 'line', label: 'Line', wrap: true, render: (v, l) => el('span', { class: l.stoppedOn ? 'mono stopped' : 'mono' }, str(v)) },
    { key: 'provider', label: 'Provider', render: (v) => providerName(v) },
    { key: 'where', label: 'Where' },
    { key: 'category', label: 'Category', render: (v) => categoryName(v, null) },
    { key: 'perDay', label: 'A day', num: true, render: (v) => money(v, 4) },
    { key: 'perMonth', label: 'A month', num: true, render: (v) => money(v) },
    { key: 'stoppedOn', label: 'Stopped', render: (v) => (v ? shortDay(v) : '') },
  ], lines)) : null;
  return [...errorLines(idle), tiles, body, asTable].filter(Boolean);
}

// ---------------------------------------------------------------- 4. daily

const SPIKE = 3;
const shorten = (s, n = 48) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function dailyCard([daily]) {
  if (!Array.isArray(daily.days)) return [notConfigured(missing(daily, 'aws', 'gcp', 'github'))];
  const days = daily.days;
  const keys = Object.keys(PROVIDERS);
  const configured = keys.filter((k) => days.some((d) => isNum(d[k])));
  const series = configured.map((k) => ({ key: k, label: providerName(k), tone: PROVIDERS[k].tone, values: days.map((d) => num(d[k])) }));
  const flags = days.map((d) => Boolean(d.flagged));
  const marks = days.map((d) => ({
    label: shortDay(d.day),
    detail: d.day,
    lines: d.top && d.flagged ? [{ v: money(d.top.amount), k: `top: ${shorten(str(d.top.line))} (${providerName(d.top.provider)})` }] : [],
  }));
  const total = days.reduce((n, d) => n + num(d.total), 0);
  const chart = columns(marks, {
    height: 220,
    series,
    line: days.map((d) => (isNum(d.median14) ? d.median14 : null)),
    lineLabel: '14-day median',
    flags,
    flagLabel: `Over ${SPIKE}x the median`,
    format: moneyShort,
    tip: money,
    label: `Spend per day for the last ${days.length} days, stacked by provider: ${money(total)} in all, ${flags.filter(Boolean).length} days over ${SPIKE} times their median; the table below has every day.`,
  });
  const notHere = keys.filter((k) => !configured.includes(k)).map((k) => `${providerName(k)}: ${notConfiguredText(missing(daily, k) ?? PROVIDERS[k].env)}`);
  const flaggedDays = days.filter((d) => d.flagged);
  const flagItem = (d) => {
    const li = el('li', {}, el('span', { class: 'n' }, `${shortDay(d.day)}: ${money(d.total)}`));
    if (isNum(d.median14) && d.median14 > 0) li.append(`, ${Math.round(num(d.total) / d.median14)}x the median`);
    if (d.top) li.append(', top line ', el('span', { class: 'mono' }, str(d.top.line)), ` (${providerName(d.top.provider)}, ${money(d.top.amount)})`);
    return li;
  };
  const flagList = flaggedDays.length
    ? el('ul', { class: 'flags', 'aria-label': 'Flagged days' }, ...flaggedDays.map(flagItem))
    : el('p', { class: 'note' }, `No day in the last ${days.length} was over ${SPIKE} times its 14-day median.`);
  const asTable = folded('Per day as a table', table([
    { key: 'day', label: 'Day', render: (v) => shortDay(v) },
    ...keys.map((k) => ({ key: k, label: providerName(k), num: true, render: (v) => (isNum(v) ? money(v) : '') })),
    { key: 'total', label: 'Total', num: true, render: (v, d) => (d.flagged ? el('b', {}, money(v)) : money(v)) },
    { key: 'median14', label: '14-day median', num: true, render: (v) => (isNum(v) ? money(v) : '') },
    { key: 'top', label: 'Top line', wrap: true, render: (v) => (v ? el('span', { class: 'cell' }, el('span', { class: 'mono' }, str(v.line)), el('small', {}, `${providerName(v.provider)}, ${money(v.amount)}`)) : '') },
  ], [...days].reverse()));
  return [...errorLines(daily), chart,
    el('p', { class: 'note' }, `Days are the providers' UTC billing days${notHere.length ? `. ${notHere.join('. ')}` : ''}.`),
    flagList, asTable];
}

// ---------------------------------------------------------------- 5. what activity bought

/** Which source each item comes from, for the Not configured note. */
const ITEM_SOURCE = { rigHours: 'aws', egressGiB: 'gcp', cloudRunCpuHours: 'gcp', ciMinutes: 'github', aiGenerations: 'gcp' };
const UNIT_NAMES = { h: ' h', GiB: ' GiB', min: ' min', '': '' };

function activityCard([activity]) {
  if (!Array.isArray(activity.items)) return [notConfigured(missing(activity, 'aws', 'gcp', 'github'))];
  const tiles = activity.items.map((item) => {
    const env = missing(activity, ITEM_SOURCE[item.key] ?? '') ?? PROVIDERS[ITEM_SOURCE[item.key]]?.env;
    if (!isNum(item.quantity)) return tile(str(item.label), '–', { note: notConfiguredText(env) });
    const cost = el('p', { class: 'cost' }, el('b', {}, money(item.cost)),
      isNum(item.gross) ? el('small', {}, `net, ${money(item.gross)} gross`) : null);
    const per = isNum(item.unitPrice) ? `${price(item.unitPrice)} ${str(item.per) || 'each'}` : (item.quantity === 0 ? 'Nothing in this range' : 'No unit price');
    return tile(str(item.label), compact(item.quantity), { unit: UNIT_NAMES[item.unit] ?? ` ${str(item.unit)}`, delta: cost, note: per });
  });
  return [...errorLines(activity), el('div', { class: 'tiles compact' }, ...tiles)];
}

// ---------------------------------------------------------------- 6. sources

function sourcesCard([sources]) {
  if (!Array.isArray(sources.sources)) return [notConfigured(missing(sources, 'aws', 'gcp', 'github'))];
  const now = Date.now();
  return [...errorLines(sources), table([
    { key: 'label', label: 'Source', wrap: true },
    { key: 'configured', label: 'Configured', render: (v, s) => (v ? 'Yes' : el('span', { class: 'empty' }, notConfiguredText(missing(sources, s.key) ?? PROVIDERS[s.key]?.env))) },
    { key: 'lastDay', label: 'Last day', render: (v) => (v ? shortDay(v) : '') },
    { key: 'snapshotAt', label: 'Snapshot', render: (v) => (v ? ago(v, now) : el('span', { class: 'empty' }, 'read live')) },
    { key: 'callsThisMonth', label: 'Calls this month', num: true, render: (v, s) => (isNum(v) ? `${v.toLocaleString('en-US')}${isNum(s.callCostUsd) ? `, ${money(s.callCostUsd)}` : ''}` : '') },
    { key: 'note', label: 'Note', wrap: true },
  ], sources.sources, 'No sources answered.')];
}

// ---------------------------------------------------------------- the cards

const CARDS = [
  { id: 'summary', title: (r) => (r === 'last' ? 'Last month' : 'This month'), queries: ['summary'], sub: (r, a) => `${a?.month ? `${monthName(a.month)}${r === 'last' ? '' : ' so far'}` : r === 'last' ? 'The previous calendar month' : 'The current calendar month'}, every provider, net of credits${a?.at ? `, as of ${ago(a.at)}` : ''}. The forecast is AWS's own plus Google Cloud's run-rate plus GitHub's net; the idle run-rate is card 3's sum against the ${moneyShort(a?.goalUsd ?? 5)} goal.`, render: summaryCard, skeleton: { tiles: 4, rows: 3, row: 56 } },
  { id: 'categories', title: () => 'By category', queries: ['categories'], sub: (r, a) => `One column a month for ${rangeText(r, a?.months)}, split by category in a fixed order; CI, tax and unmapped lines fold into Other, listed below. Compute, serverless, hosting and AI bill because something ran; load balancing, storage, DNS and keys bill while nothing does; domains are a yearly fee shown a twelfth a month.`, render: categoriesCard, skeleton: { chart: 240, lines: 2, folds: 2 } },
  { id: 'idle', title: () => 'Idle run-rate', queries: ['idle'], sub: () => 'Every line that bills while nothing runs, as its last seven days’ average times 30, most expensive first, with the provider and the region or project. A line gone since a week ago stays struck through for seven days with the day it stopped, so a cleanup is seen to have worked. The same for every range.', render: idleCard, skeleton: { tiles: 3, bars: 6, folds: 1 } },
  { id: 'daily', title: () => 'Daily', queries: ['daily'], sub: () => `The last 60 days, one column a day, stacked by provider, with the trailing 14-day median as a dashed line. A day over ${SPIKE} times its median (and over $1) is marked, and its largest line named: a rig round, a Veo batch or a forgotten machine shows up here the day after. The same for every range.`, render: dailyCard, skeleton: { chart: 220, lines: 2, folds: 1 } },
  { id: 'activity', title: () => 'What activity bought', queries: ['activity'], sub: (r) => `What ran in ${rangeText(r)}, how much of it, what it cost, and the unit price to budget the next session with. CI minutes cost nothing on public repositories; the gross is what they would on private ones.`, render: activityCard, skeleton: { tiles: 5, tile: 150 } },
  { id: 'sources', title: () => 'Sources', queries: ['sources'], sub: () => 'Where the numbers come from, the last day each has data, when the snapshot last read it, and what reading costs: Cost Explorer bills a cent a call, two a day, the one line this page adds to the bill.', render: sourcesCard, skeleton: { rows: 3, row: 64 } },
];

// ---------------------------------------------------------------- the page

function cardShell(def) {
  return el('section', { class: 'card', id: `card-${def.id}`, 'aria-labelledby': `title-${def.id}` },
    el('h2', { id: `title-${def.id}` }, def.title(range)),
    el('p', { class: 'sub' }, def.sub(range)),
    loading(def.skeleton));
}

async function loadCard(def, gen, card) {
  const body = card.querySelector('.body');
  // A rendered card goes back to its skeleton while it reloads, held at the height this view
  // had last (else the one it has now), so nothing under it moves; see hold() in charts.js.
  const now = body.querySelector('.skeleton') ? 0 : card.getBoundingClientRect().height;
  if (now) body.replaceChildren(el('p', { class: 'sr-only' }, 'Loading'), skeleton(def.skeleton));
  hold(card, def.id, now);
  body.setAttribute('aria-busy', 'true');
  card.querySelector('h2').textContent = def.title(range);
  try {
    const results = await Promise.all(def.queries.map((name) => data.query(app, name, null, { range })));
    if (gen !== generation) return;
    const sub = def.sub(range, results[0]);
    card.querySelector('.sub').textContent = sub;
    card.querySelector('.sub').hidden = !sub;
    body.replaceChildren(...def.render(results, range));
  } catch (error) {
    if (gen !== generation) return;
    body.replaceChildren(errorLine(`${def.title(range)} could not be read.`, error.message));
  } finally {
    if (gen === generation) {
      body.removeAttribute('aria-busy');
      settle(card, def.id);
    }
  }
}

/** Every card loads on its own and shows its own error line; a failed answer is asked again on the next load. */
async function load() {
  generation += 1;
  const gen = generation;
  if (!grid.querySelector('.card')) grid.replaceChildren(...CARDS.map(cardShell));
  await Promise.allSettled(CARDS.map((def) => loadCard(def, gen, document.getElementById(`card-${def.id}`))));
}

function rangeButtons() {
  const buttons = RANGES.map((r) => {
    const b = el('button', { type: 'button', 'aria-pressed': String(r.range === range) }, r.label);
    b.addEventListener('click', () => {
      if (range === r.range) return;
      range = r.range;
      writeParam('range', range === DEFAULT_RANGE ? null : range);
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
if (preview) {
  accountMenu(account, { preview: true });
  start();
} else {
  requireSession(root, (user) => {
    accountMenu(account, { account: user });
    start();
  });
}
