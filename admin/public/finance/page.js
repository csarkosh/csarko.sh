/**
 * The Finance dashboard (docs/superpowers/specs/2026-10-29-finance-admin-page-design.md, amended
 * 2026-10-30, Claude Code added 2026-10-29, donations 2026-10-30): a range row, then ten cards in
 * order, each loading its own query and showing its own error line. The month's totals, the
 * donations against them and the net with a row per provider, the donations themselves (Stripe,
 * read live: amounts and days, never who gave),
 * spend by category month by month, spend by project (the films, Day Hike, the site, the rest), each
 * film's cost from the pipeline's own ledgers against its cap, Claude Code (the claude.ai fee entered
 * by hand, and the local transcripts' tokens priced at API list rates as the plan's value), the idle
 * run-rate as the list of lines that bill while nothing runs, the last 60 days by provider with the
 * days that spiked, what the range's activity bought at what unit price, and the sources.
 *
 * The page judges nothing (Cyrus, 2026-10-30: there is no spend goal; the AI short films drive
 * the cost on purpose). It separates the activity spend from the idle spend and reports both.
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
import { fadeIn, fadeOut, tokens as motion } from '/motion.js';

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
/** A count with a dash for a missing one, never a 0 standing in for "unknown". */
const count = (v) => (isNum(v) ? v.toLocaleString('en-US') : '–');
/** Seconds as minutes: "5.5 min", "0.2 min"; a dash when unknown. */
const minutes = (seconds) => (isNum(seconds) ? `${(seconds / 60).toLocaleString('en-US', { maximumFractionDigits: seconds < 600 ? 1 : 0 })} min` : '–');

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

/**
 * The six providers in the contract's fixed order, each with its Daily stack slot and the secret
 * that configures it. Claude Code's "secret" is the claude.ai fee typed into its card (the manual
 * series `claude-subscription`), so its missing part reads "Not entered" rather than "Not configured".
 */
const PROVIDERS = {
  aws: { label: 'AWS', tone: 'p1', env: 'AWS_COST_ROLE_ARN' },
  gcp: { label: 'Google Cloud', tone: 'p2', env: 'BILLING_DATASET' },
  github: { label: 'GitHub', tone: 'p3', env: 'GITHUB_TOKEN' },
  modal: { label: 'Modal', tone: 'p4', env: 'MODAL_TOKEN_ID' },
  fal: { label: 'fal', tone: 'p5', env: 'FAL_ADMIN_KEY' },
  claude: { label: 'Claude Code', tone: 'p6', env: 'claude-subscription' },
};
const PROVIDER_KEYS = Object.keys(PROVIDERS);
/** Every part a card may be told is not configured, Stripe (the donations) and the ledgers included. */
const ENV = { ...Object.fromEntries(PROVIDER_KEYS.map((k) => [k, PROVIDERS[k].env])), stripe: 'STRIPE_KEY', ledgers: 'FILM_LEDGERS_BUCKET' };
const PARTS = Object.keys(ENV);
const providerName = (key) => PROVIDERS[key]?.label ?? str(key);
const SUBSCRIPTION = 'claude-subscription';
const NOT_ENTERED = 'Not entered: the fee goes in on the Claude Code card';
/** A missing part in words: the secret's name, or, for the Claude Code fee, where to type it. */
const missingText = (env) => (env === SUBSCRIPTION ? NOT_ENTERED : notConfiguredText(env));

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
  { key: 'claudeCode', label: 'Claude Code', tone: 'c10' },
];
const FOLDED = ['ci', 'tax', 'other'];
const OTHER = { key: 'other', label: 'Other (CI, tax, unmapped)', tone: 'c9' };
const categoryName = (key, answer) => answer?.categories?.find((c) => c.key === key)?.label ?? CATEGORIES.find((c) => c.key === key)?.label ?? { ci: 'CI', tax: 'Tax', other: 'Other' }[key] ?? str(key);

/** The projects in their fixed order (spec section 11) with their slots: the second axis over the same lines. */
const PROJECTS = [
  { key: 'films', label: 'Films', tone: 'j1' },
  { key: 'dayhike', label: 'Day Hike', tone: 'j2' },
  { key: 'site', label: 'csarko.sh and admin', tone: 'j3' },
  { key: 'commercial', label: 'Commercial', tone: 'j5' },
  { key: 'other', label: 'Other', tone: 'j4' },
];
const projectName = (key, answer) => answer?.projects?.find((p) => p.key === key)?.label ?? PROJECTS.find((p) => p.key === key)?.label ?? str(key);

// ---------------------------------------------------------------- 1. this month

/**
 * The provider's name with the figure its row carries beside the net: GitHub's gross, Modal's gross
 * before the credits, fal's balance, Claude Code's value at API list price (the plan's value, not a bill).
 */
function providerCell(p) {
  const notes = [];
  if (p.provider === 'github' && isNum(p.gross)) notes.push(`${money(p.gross)} gross if private`);
  if (p.provider === 'modal' && isNum(p.gross)) notes.push(`gross ${money(p.gross)} before the ${moneyShort(isNum(p.credits) ? p.credits : 30)} included credits`);
  if (p.provider === 'fal' && isNum(p.balance)) notes.push(`balance ${money(p.balance)} left`);
  if (p.provider === 'claude' && isNum(p.listValue)) notes.push(`value ${money(p.listValue)} at list price${isNum(p.messages) ? `, ${count(p.messages)} messages` : ''}`);
  return el('span', { class: 'cell' }, el('span', {}, p.label ?? providerName(p.provider)), notes.length ? el('small', {}, notes.join('; ')) : null);
}

/** "4 donations", "1 donation", a dash for an unknown count. */
const donations = (n) => (isNum(n) ? `${count(n)} donation${n === 1 ? '' : 's'}` : '– donations');

function summaryCard([summary], r) {
  const total = summary.total;
  if (!total) return [notConfigured(missing(summary, ...PROVIDER_KEYS))];
  const finished = r === 'last';
  // The donations (Stripe) count as income against the spend: the month's net under its gross and
  // fees, and Net, the spend after them, against the month before's net. Without the key both say so.
  const income = summary.income && typeof summary.income === 'object' ? summary.income : null;
  const given = income?.mtd ?? null;
  const stripeEnv = missing(summary, 'stripe') ?? ENV.stripe;
  const lastNet = isNum(total.lastMonth) && isNum(income?.lastMonth?.net) ? total.lastMonth - income.lastMonth.net : null;
  const tiles = el('div', { class: 'tiles across-3' },
    tile(finished ? 'The month' : 'Month to date', money(total.mtd), { delta: delta(num(total.mtd), total.lastMonth, { good: 'down', vs: 'the month before', percent: true, format: money }) }),
    tile('Donations', isNum(given?.net) ? money(given.net) : '–', { note: isNum(given?.net) ? `gross ${money(given.gross)}, fees ${money(given.fees)}, ${donations(given.count)}` : notConfiguredText(stripeEnv) }),
    tile('Net', isNum(total.net) ? money(total.net) : '–', {
      delta: isNum(total.net) && isNum(lastNet) ? delta(total.net, lastNet, { good: 'down', vs: 'the month before', percent: true, format: money }) : undefined,
      note: isNum(total.net) ? 'What the month cost after donations' : notConfiguredText(stripeEnv),
    }),
    tile('Forecast', finished ? '–' : money(total.forecast), { note: finished ? 'A finished month has no forecast' : 'AWS forecast, Google Cloud run-rate, the rest at their month to date' }),
    tile(finished ? 'The month before' : 'Last month', money(total.lastMonth)),
    tile('Idle run-rate', money(total.idleRunRate), { note: 'What bills a month while nothing runs' }));
  // Every provider has a row, in the fixed order, whether or not it answered.
  const answered = new Map((summary.providers ?? []).map((p) => [p.provider, p]));
  const rows = PROVIDER_KEYS.map((key) => ({ provider: key, label: providerName(key), ...(answered.get(key) ?? {}), env: missing(summary, key) ?? ENV[key] }));
  for (const p of summary.providers ?? []) if (!PROVIDERS[p.provider]) rows.push({ ...p, env: missing(summary, p.provider) });
  const providers = table([
    { key: 'provider', label: 'Provider', wrap: true, render: (_, p) => providerCell(p) },
    { key: 'mtd', label: finished ? 'The month' : 'Month to date', num: true, render: (v, p) => (isNum(v) ? money(v) : el('span', { class: 'empty' }, missingText(p.env))) },
    { key: 'lastMonth', label: finished ? 'The month before' : 'Last month', num: true, render: (v, p) => (isNum(p.mtd) ? money(v) : '') },
    { key: 'change', label: 'Change', num: true, render: (_, p) => (isNum(p.mtd) && isNum(p.lastMonth) ? delta(p.mtd, p.lastMonth, { good: 'down', vs: 'the month before', percent: true, format: money }) : '') },
    { key: 'lastDay', label: 'Last day billed', render: (v) => (v ? shortDay(v) : '') },
  ], rows, 'No providers answered.');
  return [...errorLines(summary), tiles, providers];
}

// ---------------------------------------------------------------- 2. donations

/**
 * The period the Donations tiles cover, in words: the answer's own month for This month and Last
 * month, the last three of its thirteen months for 90 days, all thirteen for 13 months.
 */
function incomePeriod(r, income) {
  const months = (Array.isArray(income?.months) ? income.months : []).map((m) => str(m.month));
  if (r === '13m') return rangeText(r, months);
  if (r === '90') return rangeText(r, months.slice(-3));
  return income?.month ? `${monthName(income.month)}${r === 'month' ? ' so far' : ''}` : rangeText(r);
}

function donationsCard([income], r) {
  if (!Array.isArray(income.days)) return [notConfigured(missing(income, 'stripe') ?? ENV.stripe, 'Stripe donations')];
  const period = incomePeriod(r, income);
  const feeShare = isNum(income.fees) && num(income.gross) > 0 ? `${Math.round((income.fees / income.gross) * 1000) / 10}% of the gross` : 'Stripe’s cut';
  const tiles = el('div', { class: 'tiles' },
    tile('Gross', money(income.gross), { note: `Given in ${period}, before fees` }),
    tile('Fees', money(income.fees), { note: feeShare }),
    tile('Net', money(income.net), { note: 'Gross less fees, after refunds: the income' }),
    tile('Donations', count(income.count), { note: `In ${period}` }),
    tile('Average', money(income.average), { note: 'Gross a donation' }));
  const b = income.balance && typeof income.balance === 'object' ? income.balance : null;
  const balance = b
    ? el('p', { class: 'note' }, `Balance at Stripe: ${money(b.available)} available, ${money(b.pending)} pending${b.currency ? ` (${str(b.currency).toUpperCase()})` : ''}; a payout moves the available balance to the bank.`)
    : null;
  const pr = income.prices && typeof income.prices === 'object' ? income.prices : null;
  const prices = el('p', { class: 'note' }, pr
    ? `Tip prices follow the last 30 days' bill, ${money(pr.pool)}, set ${ago(pr.at)}; they turn weekly.`
    : 'Tip prices: not set yet; the donate step reprices weekly from its launch day.');
  const days = income.days;
  const given = days.reduce((n, d) => n + num(d.count), 0);
  const total = days.reduce((n, d) => n + num(d.net), 0);
  const marks = days.map((d) => ({ label: shortDay(d.day), detail: d.day, lines: num(d.count) > 0 ? [{ v: count(d.count), k: num(d.count) === 1 ? 'donation' : 'donations' }] : [] }));
  const chart = columns(marks, {
    height: 220,
    series: [{ key: 'net', label: 'Net a day', tone: 'inc', values: days.map((d) => num(d.net)) }],
    format: moneyShort,
    tip: money,
    label: `Donations net per day for the last ${days.length} days: ${money(total)} in all from ${donations(given)}; the folds below list the newest, the payouts and the months.`,
  });
  const recent = Array.isArray(income.recent) ? income.recent : [];
  const payouts = Array.isArray(income.payouts) ? income.payouts : [];
  const months = Array.isArray(income.months) ? income.months : [];
  const recentFold = folded(`Recent donations · ${recent.length}`, table([
    { key: 'day', label: 'Day', render: (v) => shortDay(v) },
    { key: 'gross', label: 'Gross', num: true, render: (v) => money(v) },
    { key: 'net', label: 'Net', num: true, render: (v) => money(v) },
  ], recent, 'No donations yet.'));
  const byDoor = Array.isArray(income.byDoor) ? income.byDoor : [];
  const doorFold = folded(`By door · ${byDoor.length}`, table([
    { key: 'label', label: 'Door', wrap: true, render: (v) => str(v) },
    { key: 'gross', label: 'Gross', num: true, render: (v) => money(v) },
    { key: 'fees', label: 'Fees', num: true, render: (v) => money(v) },
    { key: 'net', label: 'Net', num: true, render: (v) => money(v) },
    { key: 'count', label: 'Donations', num: true, render: (v) => count(v) },
  ], byDoor, 'No tips through a door yet.'));
  const payoutsFold = folded(`Payouts · ${payouts.length}`, table([
    { key: 'day', label: 'Day', render: (v) => shortDay(v) },
    { key: 'amount', label: 'Amount', num: true, render: (v) => money(v) },
    { key: 'status', label: 'Status', render: (v) => str(v) },
  ], payouts, 'No payouts in the last 60 days.'));
  const monthsFold = folded('By month as a table', table([
    { key: 'month', label: 'Month', wrap: true, render: (v) => monthName(v) },
    { key: 'gross', label: 'Gross', num: true, render: (v) => money(v) },
    { key: 'fees', label: 'Fees', num: true, render: (v) => money(v) },
    { key: 'net', label: 'Net', num: true, render: (v) => money(v) },
    { key: 'count', label: 'Donations', num: true, render: (v) => count(v) },
  ], [...months].reverse(), 'No months yet.'));
  return [...errorLines(income), tiles, balance, prices, chart, doorFold, recentFold, payoutsFold, monthsFold].filter(Boolean);
}

// ---------------------------------------------------------------- 3. by category, 4. by project

/** The months' column labels, a star on a month that has AWS and GitHub only. */
function monthColumns(months, partial) {
  return months.map((m, i) => ({
    label: `${monthTick(m, i === 0)}${partial.has(m) ? '*' : ''}`,
    detail: `${monthName(m)}${partial.has(m) ? ' (AWS and GitHub only)' : ''}`,
  }));
}
const partialNote = (partial) => (partial.size
  ? el('p', { class: 'note' }, `* ${[...partial].map((m) => monthName(m)).join(', ')}: AWS and GitHub only. The Google Cloud export has no days before 29 October 2026.`)
  : null);
/** A month a column in the table, each $0 faint, the total row bold. */
const monthTableColumns = (months) => months.map((m) => ({ key: m, label: monthTick(m, true), num: true, render: (v) => (v ? money(v) : el('span', { class: 'empty' }, '$0')) }));

function categoriesCard([cats], r) {
  if (!Array.isArray(cats.months) || !Array.isArray(cats.categories)) return [notConfigured(missing(cats, ...PROVIDER_KEYS))];
  const months = cats.months;
  const byKey = new Map(cats.categories.map((c) => [c.key, c]));
  const values = (key) => months.map((_, i) => num(byKey.get(key)?.byMonth?.[i]));
  const series = CATEGORIES.map((c) => ({ ...c, label: categoryName(c.key, cats), values: values(c.key) }));
  const foldedValues = months.map((_, i) => FOLDED.reduce((n, key) => n + num(byKey.get(key)?.byMonth?.[i]), 0));
  series.push({ ...OTHER, values: foldedValues });
  const partial = new Set(cats.partial ?? []);
  const totals = months.map((_, i) => series.reduce((n, s) => n + s.values[i], 0));
  const chart = columns(monthColumns(months, partial), {
    height: 240,
    series,
    format: moneyShort,
    tip: money,
    label: `Spend by category, one column a month, ${rangeText(r, months)}: ${money(totals.reduce((n, v) => n + v, 0))} in all; the table below has every figure.`,
  });
  // Every category as a row, each month a column, the folded three kept apart here.
  const allKeys = [...CATEGORIES.map((c) => c.key), ...FOLDED];
  const rows = allKeys.map((key) => ({ key, name: categoryName(key, cats), kind: byKey.get(key)?.kind ?? '', ...Object.fromEntries(months.map((m, i) => [m, num(byKey.get(key)?.byMonth?.[i])])) }));
  rows.push({ key: 'total', name: 'All categories', kind: '', ...Object.fromEntries(months.map((m, i) => [m, totals[i]])) });
  const tableCols = [
    { key: 'name', label: 'Category', wrap: true, render: (v, row) => (row.key === 'total' ? el('b', {}, v) : v) },
    { key: 'kind', label: 'Kind' },
    ...monthTableColumns(months),
  ];
  const other = Array.isArray(cats.other) && cats.other.length
    ? folded(`Unmapped lines in Other · ${cats.other.length}`, table([
      { key: 'provider', label: 'Provider', render: (v) => providerName(v) },
      { key: 'line', label: 'Line', wrap: true, render: (v) => el('span', { class: 'mono' }, str(v)) },
      { key: 'amount', label: 'Amount', num: true, render: (v) => money(v) },
    ], cats.other))
    : null;
  return [...errorLines(cats), chart, partialNote(partial), folded('By category as a table', table(tableCols, rows)), other].filter(Boolean);
}

function projectsCard([projects], r) {
  if (!Array.isArray(projects.months) || !Array.isArray(projects.projects)) return [notConfigured(missing(projects, ...PROVIDER_KEYS))];
  const months = projects.months;
  const byKey = new Map(projects.projects.map((p) => [p.key, p]));
  const series = PROJECTS.map((p) => ({ ...p, label: projectName(p.key, projects), values: months.map((_, i) => num(byKey.get(p.key)?.byMonth?.[i])) }));
  // A project the contract does not name joins Other, so the stack still sums to the month.
  for (const p of projects.projects) if (!PROJECTS.some((k) => k.key === p.key)) months.forEach((_, i) => { series[series.length - 1].values[i] += num(p.byMonth?.[i]); });
  const partial = new Set(projects.partial ?? []);
  const totals = months.map((_, i) => series.reduce((n, s) => n + s.values[i], 0));
  const filmsTotal = series[0].values.reduce((n, v) => n + v, 0);
  const allTotal = totals.reduce((n, v) => n + v, 0);
  const chart = columns(monthColumns(months, partial), {
    height: 240,
    series,
    format: moneyShort,
    tip: money,
    label: `Spend by project, one column a month, ${rangeText(r, months)}: ${money(allTotal)} in all, ${money(filmsTotal)} of it the films; the table below has every figure.`,
  });
  const rows = series.map((s) => ({ key: s.key, name: s.label, ...Object.fromEntries(months.map((m, i) => [m, s.values[i]])) }));
  rows.push({ key: 'total', name: 'All projects', ...Object.fromEntries(months.map((m, i) => [m, totals[i]])) });
  const tableCols = [
    { key: 'name', label: 'Project', wrap: true, render: (v, row) => (row.key === 'total' ? el('b', {}, v) : v) },
    ...monthTableColumns(months),
  ];
  const share = allTotal > 0 ? el('p', { class: 'note' }, `The films are ${money(filmsTotal)}, ${Math.round((filmsTotal / allTotal) * 100)}% of the ${money(allTotal)} spent in ${rangeText(r, months)}.`) : null;
  return [...errorLines(projects), chart, partialNote(partial), share, folded('By project as a table', table(tableCols, rows))].filter(Boolean);
}

// ---------------------------------------------------------------- 5. films

const DEFAULT_CAP = 150;

function filmsCard([answer]) {
  if (!Array.isArray(answer.films)) return [notConfigured(missing(answer, 'ledgers') ?? ENV.ledgers, 'Film ledgers')];
  const films = [...answer.films].sort((a, b) => num(b.total) - num(a.total) || str(a.label).localeCompare(str(b.label)));
  if (!films.length) return [...errorLines(answer), el('p', { class: 'empty' }, 'No ledgers in the bucket yet.')];
  const sum = films.reduce((n, f) => n + num(f.total), 0);
  const over = films.filter((f) => num(f.total) > num(f.capUsd ?? DEFAULT_CAP));
  const tiles = el('div', { class: 'tiles' },
    tile('Films', films.length, { note: `One ledger a film${answer.asOf ? `, newest synced ${ago(answer.asOf)}` : ''}` }),
    tile('All films', money(sum), { note: 'Every priced call across the ledgers' }),
    tile('Over the cap', over.length, { note: over.length ? `${over.map((f) => str(f.label)).join(', ')}` : `Every film under its ${moneyShort(DEFAULT_CAP)} cap` }));
  // A row a film: the name with its provider split under it, a track the cap's width, and the
  // total with the cap in words; past the cap the fill turns and the words say so.
  const list = el('ul', { class: 'bars wide capped', role: 'list', 'aria-label': 'Films by cost against their cap' });
  for (const f of films) {
    const cap = isNum(f.capUsd) && f.capUsd > 0 ? f.capUsd : DEFAULT_CAP;
    const total = num(f.total);
    const share = Math.min(100, (total / cap) * 100);
    const isOver = total > cap;
    const fill = el('span', { class: `fill${isOver ? ' over' : ''}${total <= 0 ? ' empty-fill' : ''}`, 'aria-hidden': 'true' });
    fill.style.width = `${Math.max(share, total > 0 ? 1 : 0)}%`;
    const split = providerSplit(f.byProvider);
    const capText = isOver ? `${money(total - cap)} over the ${moneyShort(cap)} cap` : `${Math.round(share)}% of the ${moneyShort(cap)} cap`;
    list.append(el('li', { tabindex: 0, title: `${str(f.label)}: ${money(total)}, ${capText}${split ? `; ${split}` : ''}` },
      el('span', { class: 'name' }, el('span', {}, str(f.label)), split ? el('small', {}, split) : null),
      el('span', { class: 'track' }, fill),
      el('span', { class: 'n' }, money(total), el('small', {}, capText))));
  }
  // A fold a film: its provider split in a line, then every model with its calls and minutes.
  const folds = films.map((f) => {
    const models = [...(Array.isArray(f.byModel) ? f.byModel : [])].sort((a, b) => num(b.usd) - num(a.usd));
    const split = providerSplit(f.byProvider);
    return folded(`${str(f.label)} by model · ${models.length}`, [
      split ? el('p', { class: 'note' }, `By provider: ${split}.`) : null,
      table([
        { key: 'model', label: 'Model', wrap: true, render: (v) => el('span', { class: 'mono' }, str(v)) },
        { key: 'provider', label: 'Provider', render: (v) => providerName(v) },
        { key: 'usd', label: 'Cost', num: true, render: (v) => money(v) },
        { key: 'calls', label: 'Calls', num: true, render: (v) => count(v) },
        { key: 'seconds', label: 'Generated', num: true, render: (v) => minutes(v) },
      ], models, 'No priced calls in this ledger.'),
    ]);
  });
  return [...errorLines(answer), tiles, list, ...folds];
}

/** "Google Cloud $82.45 · Modal $36.20 · fal $28.10", largest first, in the providers' names. */
function providerSplit(byProvider) {
  if (!byProvider || typeof byProvider !== 'object') return '';
  return Object.entries(byProvider).filter(([, v]) => isNum(v) && v > 0).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${providerName(k)} ${money(v)}`).join(' · ');
}

// ---------------------------------------------------------------- 6. Claude Code

/**
 * The models in a fixed order, each with its stack slot: the categorical palette's first five
 * (validated as adjacent pairs), a model the list does not know taking the next free slot in the
 * order the month's value ranks it. The id is shortened for labels ("claude-opus-5-5" is "Opus 5.5");
 * the fold's table keeps the id beside it.
 */
const MODELS = [
  { id: 'claude-fable-5-1', tone: 'c1' },
  { id: 'claude-opus-5-5', tone: 'c2' },
  { id: 'claude-opus-4-7', tone: 'c3' },
  { id: 'claude-sonnet-5-5', tone: 'c4' },
  { id: 'claude-haiku-5-5', tone: 'c5' },
];
const SPARE_TONES = ['c7', 'c8', 'c6', 'c9'];
function modelName(id) {
  const m = /^claude-([a-z]+)-(\d+)(?:-(\d+))?/.exec(str(id));
  if (!m) return str(id) || 'Unknown model';
  return `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}${m[3] ? `.${m[3]}` : ''}`;
}
/** The series for the chart: the known models first in their order, then the rest by value, each with a tone. */
function modelSeries(byModel, days) {
  const ranked = [...byModel].sort((a, b) => num(b.usd) - num(a.usd)).map((m) => str(m.model));
  const seen = new Set();
  for (const d of days) for (const id of Object.keys(d.byModel ?? {})) if (!ranked.includes(id)) ranked.push(id);
  const known = MODELS.filter((m) => ranked.includes(m.id)).map((m) => ({ key: m.id, tone: m.tone }));
  const rest = ranked.filter((id) => !MODELS.some((m) => m.id === id)).map((id, i) => ({ key: id, tone: SPARE_TONES[Math.min(i, SPARE_TONES.length - 1)] }));
  return [...known, ...rest].filter((s) => !seen.has(s.key) && seen.add(s.key)).map((s) => ({ ...s, label: modelName(s.key), values: days.map((d) => num(d.byModel?.[s.key])) }));
}
/** Tokens in compact units: "23.9M", "896K", "1,204". */
const tokens = (v) => (isNum(v) ? compact(v) : '–');

/**
 * The subscription's entry form (the Substack count's pattern on the site's page): a number field
 * and Save, which POSTs the fee as the manual series `claude-subscription`; then every card
 * reloads, since the fee is the provider's spend on all of them.
 */
function subscriptionForm(current) {
  const input = el('input', { id: 'claude-fee', type: 'number', min: '0', step: '0.01', inputmode: 'decimal', required: true, placeholder: isNum(current) ? current.toFixed(2) : '200.00' });
  const save = el('button', { class: 'btn small', type: 'submit' }, isNum(current) ? 'Change' : 'Save');
  const note = el('p', { class: 'note', role: 'status' });
  const form = el('form', { class: 'field' }, el('label', { for: 'claude-fee' }, 'Subscription this month, USD', input), el('div', {}, save));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const value = Number(input.value);
    if (!Number.isFinite(value) || value < 0) { input.focus(); return; }
    save.disabled = true;
    note.textContent = 'Saving';
    try {
      const result = await data.manual(app, SUBSCRIPTION, Math.round(value * 100) / 100);
      note.textContent = `Saved ${money(value)}${data.kind === 'sample' ? ' (sample: nothing is stored)' : ''} at ${new Date(result.at ?? Date.now()).toLocaleTimeString()}.`;
      load();
    } catch (error) {
      note.textContent = `Could not save: ${error.message}`;
      save.disabled = false;
    }
  });
  return [form, note];
}

function claudeCard([answer]) {
  const fee = answer.subscriptionUsd;
  const byModel = Array.isArray(answer.byModel) ? answer.byModel : [];
  const days = Array.isArray(answer.days) ? answer.days : [];
  const synced = days.length > 0 || byModel.length > 0 || isNum(answer.listValue);
  const top = [...byModel].sort((a, b) => num(b.usd) - num(a.usd))[0];
  const value = num(answer.listValue);
  const topShare = top && value > 0 ? Math.round((num(top.usd) / value) * 100) : null;
  const syncNote = synced
    ? `${isNum(answer.files) ? `${count(answer.files)} transcripts` : 'The transcripts'}${answer.syncedAt ? `, synced ${ago(answer.syncedAt)}` : ''}`
    : 'No transcripts synced yet: run tools/claude-usage-sync.py on the Mac';
  const tiles = el('div', { class: 'tiles' },
    tile('Subscription', isNum(fee) ? money(fee) : 'Not entered', { note: isNum(fee) ? `entered ${ago(answer.enteredAt) || 'by hand'}; the month's spend, spread over its days` : 'The claude.ai fee, typed in below once a month' }),
    // Whole dollars past a thousand: a five-figure sum with cents breaks across a phone's tile.
    tile('Value at list price', synced ? money(answer.listValue, value >= 1000 ? 0 : 2) : '–', { note: 'What these tokens would cost as API calls: the plan\'s value, not a bill' }),
    tile('Messages', synced ? compact(num(answer.messages)) : '–', { note: syncNote }),
    tile('Top model', topShare === null ? '–' : `${topShare}%`, { note: top ? `${modelName(top.model)}, ${money(top.usd)} of the value` : 'No model priced yet' }));
  const parts = [...errorLines(answer), tiles, ...subscriptionForm(fee)];
  if (days.length) {
    const series = modelSeries(byModel, days);
    const marks = days.map((d) => ({ label: shortDay(d.day), detail: d.day, lines: isNum(d.messages) ? [{ v: count(d.messages), k: 'messages' }] : [] }));
    const total = days.reduce((n, d) => n + num(d.usd), 0);
    parts.push(columns(marks, {
      height: 220,
      series,
      format: moneyShort,
      tip: money,
      label: `Claude Code value at API list price per day for the last ${days.length} days, stacked by model: ${money(total)} in all; the table below has every model.`,
    }));
  } else if (synced) {
    parts.push(el('p', { class: 'empty' }, 'No days in the sync yet.'));
  }
  if (byModel.length) {
    const rows = [...byModel].sort((a, b) => num(b.usd) - num(a.usd));
    parts.push(folded(`By model, ${monthName(answer.month ?? thisMonth())} · ${rows.length}`, table([
      { key: 'model', label: 'Model', wrap: true, render: (v) => el('span', { class: 'cell' }, el('span', {}, modelName(v)), el('small', { class: 'mono' }, str(v))) },
      { key: 'messages', label: 'Messages', num: true, render: (v) => count(v) },
      { key: 'input', label: 'Input', num: true, render: (v) => tokens(v) },
      { key: 'cacheWrite', label: 'Cache write', num: true, render: (v) => tokens(v) },
      { key: 'cacheRead', label: 'Cache read', num: true, render: (v) => tokens(v) },
      { key: 'output', label: 'Output', num: true, render: (v) => tokens(v) },
      { key: 'usd', label: 'Value', num: true, render: (v) => money(v) },
    ], rows)));
  }
  parts.push(el('p', { class: 'note' }, `The tokens, models and days come from the local transcripts, summed and priced on the Mac by tools/claude-usage-sync.py${answer.lastDay ? `, last run for ${shortDay(answer.lastDay)}` : ''}${answer.syncedAt ? ` (${ago(answer.syncedAt)})` : ''}; no transcript text leaves it. The fee is the only figure billed.`));
  return parts;
}

// ---------------------------------------------------------------- 7. idle run-rate

function idleCard([idle]) {
  if (!Array.isArray(idle.lines)) return [notConfigured(missing(idle, ...PROVIDER_KEYS))];
  const lines = [...idle.lines].sort((a, b) => num(b.perMonth) - num(a.perMonth) || str(a.line).localeCompare(str(b.line)));
  const live = lines.filter((l) => !l.stoppedOn);
  const stopped = lines.filter((l) => l.stoppedOn);
  const tiles = el('div', { class: 'tiles' },
    tile('Idle run-rate', money(idle.runRate), { note: `A month of the last seven days' idle lines${idle.asOf ? `, as of ${shortDay(idle.asOf)}` : ''}` }),
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

// ---------------------------------------------------------------- 8. daily

const SPIKE = 3;
const shorten = (s, n = 48) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function dailyCard([daily]) {
  if (!Array.isArray(daily.days)) return [notConfigured(missing(daily, ...PROVIDER_KEYS))];
  const days = daily.days;
  // Every configured provider is a series in the fixed order; one not configured (null on every
  // day) is named under the chart instead, so the legend names the five once all five answer.
  const configured = PROVIDER_KEYS.filter((k) => days.some((d) => isNum(d[k])));
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
  const notHere = PROVIDER_KEYS.filter((k) => !configured.includes(k)).map((k) => `${providerName(k)}: ${missingText(missing(daily, k) ?? PROVIDERS[k].env)}`);
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
    ...PROVIDER_KEYS.map((k) => ({ key: k, label: providerName(k), num: true, render: (v) => (isNum(v) ? money(v) : el('span', { class: 'empty' }, '–')) })),
    { key: 'total', label: 'Total', num: true, render: (v, d) => (d.flagged ? el('b', {}, money(v)) : money(v)) },
    { key: 'median14', label: '14-day median', num: true, render: (v) => (isNum(v) ? money(v) : '') },
    { key: 'top', label: 'Top line', wrap: true, render: (v) => (v ? el('span', { class: 'cell' }, el('span', { class: 'mono' }, str(v.line)), el('small', {}, `${providerName(v.provider)}, ${money(v.amount)}`)) : '') },
  ], [...days].reverse()));
  return [...errorLines(daily), chart,
    el('p', { class: 'note' }, `Days are the providers' UTC billing days; a fal day is its balance's fall, a Claude Code day the month's fee spread evenly${notHere.length ? `. ${notHere.join('. ')}` : ''}.`),
    flagList, asTable];
}

// ---------------------------------------------------------------- 9. what activity bought

/** Which source each item comes from, for the Not configured note. */
const ITEM_SOURCE = { rigHours: 'aws', egressGiB: 'gcp', cloudRunCpuHours: 'gcp', ciMinutes: 'github', aiGenerations: 'gcp', modalGpu: 'modal', falGenerations: 'fal', claudeCode: 'claude' };
const UNIT_NAMES = { h: ' h', GiB: ' GiB', min: ' min', messages: ' messages', '': '' };

function activityCard([activity]) {
  if (!Array.isArray(activity.items)) return [notConfigured(missing(activity, ...PROVIDER_KEYS))];
  const tiles = activity.items.map((item) => {
    const env = missing(activity, ITEM_SOURCE[item.key] ?? '') ?? ENV[ITEM_SOURCE[item.key]];
    // Nothing at all from the source: its secret is missing.
    if (!isNum(item.quantity) && !isNum(item.cost)) return tile(str(item.label), '–', { note: missingText(env) });
    // Claude Code: the messages, the subscription as the cost (a dash until it is entered), and
    // what the tokens would have cost as API calls as the note: the plan's value, not a bill.
    if (item.key === 'claudeCode') {
      const fee = el('p', { class: 'cost' }, el('b', {}, isNum(item.cost) ? money(item.cost) : '–'), el('small', {}, isNum(item.cost) ? 'the subscription' : 'fee not entered'));
      const value = isNum(item.listValue) ? `${money(item.listValue)} at API list price, the plan's value` : 'No transcripts synced yet';
      return tile(str(item.label), compact(item.quantity), { unit: UNIT_NAMES[item.unit] ?? ` ${str(item.unit)}`, delta: fee, note: value });
    }
    const cost = el('p', { class: 'cost' }, el('b', {}, money(item.cost)),
      isNum(item.gross) ? el('small', {}, `net, ${money(item.gross)} gross`) : null);
    // A source with no quantity (Modal's report, fal's balance) shows a dash for it, never a 0,
    // and says what it does know: Modal its apps by cost, fal where the money came from.
    if (!isNum(item.quantity)) {
      const apps = Array.isArray(item.apps) ? item.apps.filter((a) => isNum(a.cost)).sort((a, b) => b.cost - a.cost) : [];
      const note = item.key === 'modalGpu' && apps.length ? apps.map((a) => `${str(a.app)} ${money(a.cost)}`).join(' · ')
        : item.key === 'falGenerations' ? 'From the credit balance; fal reports no quantities'
          : item.key === 'modalGpu' ? 'Modal’s report has no quantities' : 'No quantity reported';
      return tile(str(item.label), '–', { delta: cost, note });
    }
    const per = isNum(item.unitPrice) ? `${price(item.unitPrice)} ${str(item.per) || 'each'}` : (item.quantity === 0 ? 'Nothing in this range' : 'No unit price');
    return tile(str(item.label), compact(item.quantity), { unit: UNIT_NAMES[item.unit] ?? ` ${str(item.unit)}`, delta: cost, note: per });
  });
  return [...errorLines(activity), el('div', { class: 'tiles compact' }, ...tiles)];
}

// ---------------------------------------------------------------- 10. sources

function sourcesCard([sources]) {
  if (!Array.isArray(sources.sources)) return [notConfigured(missing(sources, ...PARTS))];
  const now = Date.now();
  return [...errorLines(sources), table([
    { key: 'label', label: 'Source', wrap: true },
    { key: 'configured', label: 'Configured', render: (v, s) => (v ? 'Yes' : el('span', { class: 'empty' }, missingText(missing(sources, s.key) ?? ENV[s.key]))) },
    { key: 'lastDay', label: 'Last day', render: (v) => (v ? shortDay(v) : el('span', { class: 'empty' }, '–')) },
    { key: 'snapshotAt', label: 'Snapshot', render: (v, s) => (v ? ago(v, now) : el('span', { class: 'empty' }, s.configured ? 'read live' : '–')) },
    { key: 'callsThisMonth', label: 'Calls this month', num: true, render: (v, s) => (isNum(v) ? `${v.toLocaleString('en-US')}${isNum(s.callCostUsd) ? `, ${money(s.callCostUsd)}` : ''}` : '') },
    { key: 'note', label: 'Note', wrap: true },
  ], sources.sources, 'No sources answered.')];
}

// ---------------------------------------------------------------- the cards

const CARDS = [
  { id: 'summary', title: (r) => (r === 'last' ? 'Last month' : 'This month'), queries: ['summary'], sub: (r, a) => `${a?.month ? `${monthName(a.month)}${r === 'last' ? '' : ' so far'}` : r === 'last' ? 'The previous calendar month' : 'The current calendar month'}, every provider, net of credits${a?.at ? `, as of ${ago(a.at)}` : ''}. Donations through Stripe count as income against the spend: Net is what the month cost after them. The AI short films drive the activity spend on purpose, so the page keeps it apart from the idle spend: the idle run-rate is what bills while nothing runs, the rest is what the films, Day Hike and the site bought. The forecast is AWS's own plus Google Cloud's run-rate plus the other providers' month to date. Claude Code's row is the claude.ai fee, with what the month's tokens would cost at API list price under it.`, render: summaryCard, skeleton: { tiles: 6, across: 3, rows: 6, row: 56 } },
  { id: 'donations', title: () => 'Donations', queries: ['income'], sub: (r, a) => `Donations arrive through Stripe and are read live with a restricted key that can only read the balance, its transactions and the payouts. The tiles are ${incomePeriod(r, a)}, the chart the last 60 days, the folds the newest donations, the payouts and the months; amounts are dollars after refunds, on Stripe's UTC days. Nothing about who gave is shown: no name, email, card or message, only amounts and days. By door says which project's page the tip came through; nothing more about the giver.`, render: donationsCard, skeleton: { tiles: 5, lines: 2, chart: 220, folds: 4 } },
  { id: 'categories', title: () => 'By category', queries: ['categories'], sub: (r, a) => `One column a month for ${rangeText(r, a?.months)}, split by category in a fixed order; CI, tax and unmapped lines fold into Other, listed below. Compute, serverless, hosting and AI generation bill because something ran (a Modal app is Compute, named by its app; fal is AI generation); load balancing, storage, DNS and keys bill while nothing does; domains are a yearly fee shown a twelfth a month, and Claude Code is the subscription, a fixed fee a month.`, render: categoriesCard, skeleton: { chart: 240, lines: 2, folds: 2 } },
  { id: 'projects', title: () => 'By project', queries: ['projects'], sub: (r, a) => `The same months as By category for ${rangeText(r, a?.months)}, every line sorted by what it was for. A line is a film cost when it is Vertex AI, a cinema-* Modal app or fal; Day Hike is the rest of fps-csarko, the rigs and the dayhike-* Modal apps; csarko.sh and admin is the csarko-sh project with the domain and its zone; everything else is Other.`, render: projectsCard, skeleton: { chart: 240, lines: 1, folds: 1 } },
  { id: 'films', title: () => 'Films', queries: ['films'], sub: (r, a) => `Each film's cost from the pipeline's own ledgers: every paid call is priced before it is made and written to the film's ledger on the SSD, synced to the bucket${a?.asOf ? ` (newest ${ago(a.asOf)})` : ''}. The rows carry no dates, so they attribute cost by film and by model and never feed the Daily chart; the Veo rows are at list rate, so a film's Google Cloud figure can read higher than Google's bill. The pipeline's cap is ${moneyShort(DEFAULT_CAP)} a film. The same for every range.`, render: filmsCard, skeleton: { tiles: 3, bars: 4, folds: 4 } },
  { id: 'claude', title: () => 'Claude Code', queries: ['claude'], sub: (r, a) => `Claude Code runs on a claude.ai subscription, so its spend is the month's fee, typed in here once and spread evenly over the month's days; the tokens in the local transcripts, priced at the API's list rates, are what the same work would have cost as API calls, the plan's value and not a bill. ${monthName(a?.month ?? thisMonth())}${a?.month && a.month !== thisMonth() ? '' : ' so far'} in the tiles and the fold, the last 60 days in the chart, whatever the range.`, render: claudeCard, skeleton: { tiles: 4, lines: 1, chart: 220, folds: 1 } },
  { id: 'idle', title: () => 'Idle run-rate', queries: ['idle'], sub: () => 'Every line that bills while nothing runs, as its last seven days’ average times 30, most expensive first, with the provider and the region or project. A line gone since a week ago stays struck through for seven days with the day it stopped, so a cleanup is seen to have worked. The same for every range.', render: idleCard, skeleton: { tiles: 3, bars: 6, folds: 1 } },
  { id: 'daily', title: () => 'Daily', queries: ['daily'], sub: () => `The last 60 days, one column a day, stacked by provider in a fixed order, with the trailing 14-day median as a dashed line. A day over ${SPIKE} times its median (and over $1) is marked, and its largest line named: a rig round, a Veo batch, a Modal render or a forgotten machine shows up here the day after. The same for every range.`, render: dailyCard, skeleton: { chart: 220, lines: 2, folds: 1 } },
  { id: 'activity', title: () => 'What activity bought', queries: ['activity'], sub: (r) => `What ran in ${rangeText(r)}, how much of it, what it cost, and the unit price to budget the next session with. CI minutes cost nothing on public repositories; the gross is what they would on private ones. Modal's report and fal's balance carry no quantities, so those tiles show a dash and what they do know. Claude Code's tile counts the messages, costs the subscription, and notes what the tokens would have cost at API list price.`, render: activityCard, skeleton: { tiles: 8, tile: 150 } },
  { id: 'sources', title: () => 'Sources', queries: ['sources'], sub: () => 'Where the numbers come from, the last day each has data, when the snapshot last read it, and what reading costs: Cost Explorer bills a cent a call, two a day, the one line this page adds to the bill. Modal is read by its own daily job, fal as a balance once a day, the film ledgers from their bucket, Claude Code from the transcripts tools/claude-usage-sync.py sums on the Mac, and the Stripe donations live with a restricted key.', render: sourcesCard, skeleton: { rows: 8, row: 64 } },
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
  body.setAttribute('aria-busy', 'true');
  card.querySelector('h2').textContent = def.title(range);
  const answers = Promise.all(def.queries.map((name) => data.query(app, name, null, { range })));
  answers.catch(() => {});
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
    fadeIn(body, motion().short3);
    hold(card, def.id, now);
  }
  try {
    const results = await answers;
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
      fadeIn(body);
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
