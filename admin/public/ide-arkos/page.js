/**
 * The Arkos IDE dashboard (docs/superpowers/specs/2026-10-17-arkos-admin-dashboard-design.md):
 * a range row, then the cards in order, each loading its own query and showing its own error
 * line. First the Macs that run Arkos (the daily update check, which needs no consent), then the
 * journey from the usage reports people opt into: the paths through a session, how far sessions
 * get, what follows each step, what is used, the time, the friction, who comes back, the crashes,
 * and the newest sessions in full.
 *
 * Cyrus dogfoods Arkos, so a second row picks whose use the cards show: users (everyone but him),
 * his own Macs, or both (the default); `?who=users` or `?who=me` opens on one.
 *
 * The API is csarko-admin under `/arkos` (shapes in admin/CONTRACT.md, "Arkos IDE"). A part it
 * cannot answer is `null` with `notConfigured` naming the secret, or an `errors` entry; every card
 * renders those in place, never as a blank or a 0.
 */

import { accountMenu, requireSession } from '/auth.js';
import { ago, bars, columns, compact, delta, el, errorLine, folded, loading, pct, shortDay, table, tile } from '/charts.js';
import { RANGES, loadApps, preview, source } from '/data.js';

const SLUG = 'ide-arkos';
const root = document.getElementById('top');
const grid = document.getElementById('cards');
const rangeRow = document.getElementById('range');
const whoRow = document.getElementById('who');
const whoNote = document.getElementById('who-note');
const account = document.getElementById('account');

const data = source();
let app = null;
let range = 7;
const WHOS = [
  { who: 'users', label: 'Users', note: 'Everyone but you. Your Macs are kept out: they say dogfood (an empty ~/.config/arkos/dogfood), or their rows came from your home addresses.' },
  { who: 'me', label: 'You', note: 'Only your own Macs: the ones that say dogfood, and rows from your home addresses.' },
  { who: 'all', label: 'Both', note: 'Everyone, you included.' },
];
const whoAsked = new URLSearchParams(location.search).get('who');
let who = WHOS.some((w) => w.who === whoAsked) ? whoAsked : 'all';
let generation = 0;
// Seven cards read the one journey answer: each query is asked once per range and whose use.
let asked = new Map();
const query = (name, days) => {
  const key = `${name}:${days}:${who}`;
  if (!asked.has(key)) asked.set(key, data.query(app, name, days, { who }));
  return asked.get(key);
};

const rangeText = (days) => (days === 1 ? 'the last 24 hours' : `the last ${days} days`);
const previousText = (days) => (days === 1 ? 'the 24 hours before' : `the ${days} days before`);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const num = (v) => (isNum(v) ? v : 0);
const str = (v) => (v === null || v === undefined ? '' : String(v));
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');
const dayBars = (perDay, key) => perDay.map((r) => ({ label: shortDay(r.day), value: num(r[key]), detail: r.day }));
const missing = (answer, ...parts) => parts.map((p) => answer?.notConfigured?.[p]).find(Boolean) ?? null;
const notConfigured = (env, what = '') => el('p', { class: 'empty' }, `${what ? `${what}: ` : ''}Not configured${env ? ` (${env})` : ''}`);
function errorLines(...answers) {
  const lines = [];
  for (const a of answers) {
    if (!a?.errors || Array.isArray(a.errors)) continue;
    for (const [part, message] of Object.entries(a.errors)) lines.push(errorLine(`${part} failed.`, str(message)));
  }
  return lines;
}

/** Seconds as "41s", "3m 05s", "2h 10m". */
function duration(s) {
  if (!isNum(s)) return '–';
  const n = Math.max(0, Math.round(s));
  if (n < 60) return `${n}s`;
  if (n < 3600) return `${Math.floor(n / 60)}m ${String(n % 60).padStart(2, '0')}s`;
  return `${Math.floor(n / 3600)}h ${String(Math.floor((n % 3600) / 60)).padStart(2, '0')}m`;
}
/** Seconds as m:ss or h:mm:ss: a step's place in its session. */
function clock(s) {
  const n = Math.max(0, Math.round(num(s)));
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const sec = String(n % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}
/** Hours, for summed focus time. */
const hours = (secs) => Math.round((num(secs) / 3600) * 10) / 10;

/** What no usage reports in the range looks like: say why, since they are opt-in. */
const NO_SESSIONS = 'No usage reports in this range yet. They are opt-in (Settings > Privacy in Arkos), so this fills as people turn them on.';
const NO_OWN_SESSIONS = 'None of yours in this range. Turn usage reports on (Settings > Privacy in Arkos) on each of your Macs.';
const noSessions = (answer) => [...errorLines(answer), el('p', { class: 'empty' }, who === 'me' ? NO_OWN_SESSIONS : NO_SESSIONS)];

// Copy shared by the journey cards' subs.
const OPT_IN = 'From the usage reports people opt into, one per run of a window.';

// ---------------------------------------------------------------- installs

const RHYTHM_NAMES = { new: 'First check', 1: 'Back the next day', '2-6': 'Back after 2 to 6 days', '7+': 'Back after a week or more' };

function installsCard([installs], days) {
  const cur = installs.current;
  const prev = installs.previous;
  if (!cur) return [notConfigured(missing(installs, 'visits'))];
  const tiles = el('div', { class: 'tiles' },
    tile('Active Macs', cur.active, { delta: delta(cur.active, prev?.active, { vs: previousText(days) }) }),
    tile('New installs', cur.new, { delta: delta(cur.new, prev?.new, { vs: previousText(days) }) }),
    tile('Back after a week or more', cur.back, { delta: delta(cur.back, prev?.back, { vs: previousText(days) }) }),
    tile('Update checks', cur.checks, { delta: delta(cur.checks, prev?.checks, { vs: previousText(days) }) }));
  const perDay = cur.perDay ?? [];
  const prevDays = prev?.perDay ?? [];
  const chart = columns(dayBars(perDay, 'active'), {
    previous: prev ? perDay.map((_, i) => num(prevDays[i]?.active)) : null,
    label: `Macs that checked in each day, ${rangeText(days)}`,
    currentLabel: cap(rangeText(days)),
    previousLabel: cap(previousText(days)),
  });
  const breakdown = (title, rows, unit) => el('div', {},
    el('h3', {}, title),
    rows?.length ? bars(rows.map((r) => ({ name: str(r.name), value: num(r[unit]) })), { share: true, total: rows.reduce((n, r) => n + num(r[unit]), 0), label: title }) : el('p', { class: 'empty' }, 'Nothing in this range.'));
  const rhythm = (installs.rhythm ?? []).map((r) => ({ name: RHYTHM_NAMES[r.name] ?? str(r.name), checks: r.checks }));
  return [...errorLines(installs), tiles, chart,
    el('div', { class: 'cols' },
      breakdown('Versions', installs.versions, 'macs'),
      breakdown('macOS', (installs.macos ?? []).map((r) => ({ ...r, name: `macOS ${r.name}` })), 'macs'),
      breakdown('Processor', (installs.arch ?? []).map((r) => ({ ...r, name: r.name === 'arm64' ? 'Apple silicon' : r.name === 'x86_64' ? 'Intel' : r.name })), 'macs'),
      breakdown('How often they check in', rhythm, 'checks')),
    folded('Per day as a table', table([
      { key: 'day', label: 'Day' },
      { key: 'active', label: 'Macs', num: true },
      { key: 'new', label: 'New', num: true },
      { key: 'back', label: 'Back after a week', num: true },
    ], perDay))];
}

// ---------------------------------------------------------------- paths: the flow

const SVG_NS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

/** Which colour a step's node takes: the agent and tab steps lead, errors warn, the end and Other recede. */
const GROUP_TONE = { agent: 'g-1', tab: 'g-2', launch: 'g-1', view: 'g-3', md: 'g-3', palette: 'g-3', window: 'g-4', close: 'g-4', settings: 'g-4', theme: 'g-4', help: 'g-4', update: 'g-4', notice: 'g-4', error: 'g-warn', end: 'g-end', other: 'g-end' };
const toneOf = (group) => GROUP_TONE[group] ?? 'g-4';
const endsText = (ends) => (ends ? Object.entries(ends).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`).join(' · ') : '');

/** A column's nodes, most sessions first, with Other and Ended at the foot. */
function ordered(nodes) {
  const rank = (n) => (n.label === 'Ended' ? 2 : n.label === 'Other' ? 1 : 0);
  return [...nodes].sort((a, b) => rank(a) - rank(b) || num(b.sessions) - num(a.sessions));
}

/**
 * The paths as a flow: one column per step after the launch, each step a bar sized by the
 * sessions that took it, bands between columns sized by the sessions that went from one step
 * to the next. Hand-written SVG at the host's width, never narrower than the steps' labels
 * need (the card scrolls sideways on a phone). Hovering or focusing a step lights its bands.
 */
function flow(paths, { label }) {
  const cols = (paths.columns ?? []).map(ordered);
  const links = paths.links ?? [];
  const host = el('div', { class: 'flow scroll', tabindex: 0 });
  if (cols.length < 2) return host;
  const total = cols[0].reduce((n, x) => n + num(x.sessions), 0) || 1;
  const byId = new Map();
  let drawn = 0;

  const draw = (hostW) => {
    // Every label sits right of its bar, so the last column keeps room for its own.
    const labelRoom = 150;
    const W = Math.max(hostW, cols.length * 140 + labelRoom);
    const nodeW = 10;
    const gap = 12;
    const minH = 4;
    const pad = { l: 2, r: 2, t: 8, b: 8 };
    const innerH = 340;
    const scale = innerH / total;
    const stepX = (W - pad.l - pad.r - nodeW - labelRoom) / (cols.length - 1);
    // Heights first, so the drawing is as tall as its fullest column.
    let H = 0;
    cols.forEach((col, i) => {
      let y = pad.t;
      for (const n of col) {
        const h = Math.max(minH, num(n.sessions) * scale);
        byId.set(n.id, { node: n, col: i, x: pad.l + i * stepX, y, h, out: 0, in: 0 });
        y += h + gap;
      }
      H = Math.max(H, y - gap + pad.b);
    });
    const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': label, class: 'fl' });
    const bandLayer = svg('g');
    const nodeLayer = svg('g');
    root.append(bandLayer, nodeLayer);
    // Bands leave a step in the order of where they arrive, and arrive in the order of where
    // they left, so they cross as little as the layout allows.
    const sorted = links.map((l) => ({ ...l, s: byId.get(l.from), t: byId.get(l.to) })).filter((l) => l.s && l.t);
    const bySource = [...sorted].sort((a, b) => a.s.col - b.s.col || a.t.y - b.t.y);
    const byTarget = [...sorted].sort((a, b) => a.t.col - b.t.col || a.s.y - b.s.y);
    const outAt = new Map();
    const inAt = new Map();
    for (const l of bySource) { outAt.set(l, l.s.y + l.s.out); l.s.out += num(l.sessions) * scale; }
    for (const l of byTarget) { inAt.set(l, l.t.y + l.t.in); l.t.in += num(l.sessions) * scale; }
    const bands = [];
    for (const l of sorted) {
      const w = num(l.sessions) * scale;
      const x0 = l.s.x + nodeW;
      const x1 = l.t.x;
      const xm = (x0 + x1) / 2;
      const y0 = outAt.get(l);
      const y1 = inAt.get(l);
      const band = svg('path', {
        class: `fl-band${l.t.node.label === 'Ended' ? ' end' : ''}`,
        d: `M${x0},${y0} C${xm},${y0} ${xm},${y1} ${x1},${y1} L${x1},${y1 + w} C${xm},${y1 + w} ${xm},${y0 + w} ${x0},${y0 + w} Z`,
      });
      const title = svg('title');
      title.textContent = `${l.s.node.label} then ${l.t.node.label}: ${num(l.sessions).toLocaleString('en-US')} sessions`;
      band.append(title);
      band.dataset.from = l.from;
      band.dataset.to = l.to;
      bands.push(band);
      bandLayer.append(band);
    }
    const light = (id) => {
      root.classList.toggle('dim', id !== null);
      for (const b of bands) b.classList.toggle('on', id !== null && (b.dataset.from === id || b.dataset.to === id));
    };
    for (const [id, p] of byId) {
      const n = p.node;
      const g = svg('g', { class: 'fl-step', tabindex: 0 });
      const rect = svg('rect', { class: `fl-node ${toneOf(n.group)}`, x: p.x, y: p.y, width: nodeW, height: p.h, rx: 2 });
      const share = pct(num(n.sessions), total);
      const title = svg('title');
      const ends = endsText(n.ends);
      title.textContent = `Step ${p.col}: ${n.label}, ${num(n.sessions).toLocaleString('en-US')} sessions (${share})${ends ? `, ${ends}` : ''}`;
      g.append(title, rect);
      // A bar too thin for a line of text keeps its label in the title and the table.
      if (p.h >= 13) {
        const text = svg('text', { class: 'fl-label', x: p.x + nodeW + 6, y: p.y + p.h / 2 + 4 });
        text.textContent = n.label;
        const count = svg('tspan', { class: 'fl-n' });
        count.textContent = ` ${compact(num(n.sessions))}`;
        text.append(count);
        g.append(text);
      }
      g.addEventListener('pointerenter', () => light(id));
      g.addEventListener('focus', () => light(id));
      g.addEventListener('pointerleave', () => light(null));
      g.addEventListener('blur', () => light(null));
      nodeLayer.append(g);
    }
    const old = host.querySelector('svg');
    if (old) old.replaceWith(root); else host.append(root);
    drawn = hostW;
  };

  draw(960);
  new ResizeObserver(() => {
    const w = Math.round(host.clientWidth);
    if (w && Math.abs(w - drawn) > 1) draw(w);
  }).observe(host);
  return host;
}

/** The flow's links as rows, for the table under it and for screen readers. */
function pathRows(paths) {
  const nodes = new Map((paths.columns ?? []).flat().map((n) => [n.id, n]));
  const col = (id) => Number(String(id).split(':')[0]);
  return (paths.links ?? [])
    .map((l) => ({ step: `${col(l.from)} to ${col(l.to)}`, from: nodes.get(l.from)?.label ?? l.from, to: nodes.get(l.to)?.label ?? l.to, sessions: num(l.sessions), ends: endsText(nodes.get(l.to)?.ends) }))
    .sort((a, b) => a.step.localeCompare(b.step) || b.sessions - a.sessions);
}

function pathsCard([journey]) {
  if (!journey.paths) return [notConfigured(missing(journey, 'visits'))];
  if (!num(journey.sessions)) return noSessions(journey);
  let showFirst = false;
  const host = el('div');
  const render = () => {
    const paths = showFirst ? journey.paths.first : journey.paths;
    const n = showFirst ? num(journey.firstSessions) : num(journey.sessions);
    if (!paths?.columns?.length || !n) {
      host.replaceChildren(el('p', { class: 'empty' }, 'No first sessions in this range.'));
      return;
    }
    host.replaceChildren(
      flow(paths, { label: `The first steps of ${n} ${showFirst ? 'first ' : ''}sessions after the launch, left to right; the table below has every band.` }),
      folded('Paths as a table', table([
        { key: 'step', label: 'Step' },
        { key: 'from', label: 'From', wrap: true },
        { key: 'to', label: 'Then', wrap: true },
        { key: 'sessions', label: 'Sessions', num: true },
        { key: 'ends', label: 'How it ended' },
      ], pathRows(paths))));
  };
  const buttons = [['All sessions', false], ['First sessions only', true]].map(([text, first]) => {
    const b = el('button', { type: 'button', 'aria-pressed': String(first === showFirst) }, text);
    b.addEventListener('click', () => {
      showFirst = first;
      for (const other of buttons) other.setAttribute('aria-pressed', String(other === b));
      render();
    });
    return b;
  });
  render();
  const capped = journey.capped ? el('p', { class: 'note' }, 'Only the 5,000 newest sessions in this range are counted.') : null;
  return [...errorLines(journey), el('div', { class: 'j-filters', role: 'group', 'aria-label': 'Which sessions' }, ...buttons), host, capped].filter(Boolean);
}

// ---------------------------------------------------------------- milestones

/** A share as a thin bar and its figure, for a table cell. */
function shareBar(part, whole, tone = '') {
  const w = whole > 0 ? Math.max(0, Math.min(100, (part / whole) * 100)) : 0;
  const fill = el('span', { class: `fill${tone}`, 'aria-hidden': 'true' });
  fill.style.width = `${w}%`;
  return el('span', { class: 'mbar' }, el('span', { class: 'track' }, fill), el('span', { class: 'n' }, whole > 0 ? pct(part, whole) : '–'));
}

function milestonesCard([journey]) {
  if (!journey.milestones) return [notConfigured(missing(journey, 'visits'))];
  if (!num(journey.sessions)) return noSessions(journey);
  const all = num(journey.sessions);
  const first = num(journey.firstSessions);
  const rows = journey.milestones.map((m) => ({ ...m }));
  return [...errorLines(journey), table([
    { key: 'label', label: 'Milestone', wrap: true },
    { key: 'sessions', label: `All sessions (${compact(all)})`, render: (v) => shareBar(num(v), all) },
    { key: 'medianSecs', label: 'Median time to it', num: true, render: (v) => (isNum(v) ? duration(v) : '–') },
    { key: 'first', label: `First sessions (${compact(first)})`, render: (v) => shareBar(num(v), first, ' first') },
    { key: 'firstMedianSecs', label: 'Median, first', num: true, render: (v) => (isNum(v) ? duration(v) : '–') },
  ], rows)];
}

// ---------------------------------------------------------------- what comes next

function nextCard([journey]) {
  if (!journey.next) return [notConfigured(missing(journey, 'visits'))];
  if (!num(journey.sessions)) return noSessions(journey);
  const blocks = journey.next.map((step) => {
    const from = num(step.sessions);
    return el('div', { class: 'next' },
      el('h3', {}, step.label, el('small', {}, ` ${compact(from)} sessions`)),
      bars((step.to ?? []).map((t) => ({ name: t.label, value: num(t.sessions), detail: `${step.label} then ${t.label}` })), { share: true, total: from, label: `After ${step.label}` }));
  });
  return [...errorLines(journey), el('div', { class: 'cols' }, ...blocks)];
}

// ---------------------------------------------------------------- features

const HOW_NAMES = { palette: 'palette', key: 'shortcut', click: 'click', explorer: 'file tree', link: 'link' };
const KIND_NAMES = { terminal: 'Terminal', viewer: 'File', browser: 'Browser' };

function featuresCard([journey]) {
  const f = journey.features;
  if (!f) return [notConfigured(missing(journey, 'visits'))];
  if (!num(journey.sessions)) return noSessions(journey);
  const all = num(journey.sessions);
  const block = (title, rows, name = (r) => str(r.name)) => el('div', {},
    el('h3', {}, title),
    rows?.length
      ? bars(rows.slice(0, 10).map((r) => ({ name: name(r), value: num(r.sessions), detail: `${name(r)}: ${num(r.sessions)} sessions, ${num(r.count)} times` })), { share: true, total: all, label: title })
      : el('p', { class: 'empty' }, 'None in this range.'));
  const more = (title, rows, name) => (rows?.length > 10 ? folded(`${title}: all ${rows.length}`, table([
    { key: 'name', label: 'Name', wrap: true, render: (_, r) => name(r) },
    { key: 'sessions', label: 'Sessions', num: true },
    { key: 'count', label: 'Times', num: true },
  ], rows)) : null);
  const opened = (r) => `${KIND_NAMES[r.name] ?? cap(str(r.name))} by ${HOW_NAMES[r.how] ?? str(r.how)}`;
  const agent = (r) => `${r.name === 'claude' ? 'Claude' : 'Other agent'}, ${r.how === 'resume' ? 'resumed' : 'new'}`;
  const view = (r) => `${cap(str(r.name))}${r.mode ? `, ${r.mode}` : ''}`;
  const plain = (r) => str(r.name).replaceAll('_', ' ');
  return [...errorLines(journey),
    el('p', { class: 'note' }, 'Each as the share of all sessions that used it at least once.'),
    el('div', { class: 'cols' },
      block('How tabs are opened', f.opened, opened),
      block('Agents', f.agents, agent),
      block('Palette commands', f.palette, plain),
      block('Files viewed', f.views, view),
      block('Markdown features', f.md, plain),
      block('Settings changed', f.settings),
      block('Help opened', f.help, plain)),
    more('Palette commands', f.palette, plain),
    more('Settings changed', f.settings, (r) => str(r.name))].filter(Boolean);
}

// ---------------------------------------------------------------- time

const LENGTH_NAMES = { '<1m': 'Under a minute', '1-10m': '1 to 10 minutes', '10-60m': '10 to 60 minutes', '1-4h': '1 to 4 hours', '4h+': '4 hours or more' };
const SURFACE_NAMES = { terminal: 'Terminal', viewer: 'Files', browser: 'Browser', settings: 'Settings' };

function timeCard([journey]) {
  if (!journey.focus) return [notConfigured(missing(journey, 'visits'))];
  if (!num(journey.sessions)) return noSessions(journey);
  const focus = journey.focus.map((r) => ({ name: SURFACE_NAMES[r.name] ?? str(r.name), value: hours(r.secs), detail: `${SURFACE_NAMES[r.name] ?? r.name}: ${hours(r.secs)} hours in front, in ${num(r.sessions)} sessions` }));
  const focusTotal = focus.reduce((n, r) => n + r.value, 0);
  const ends = journey.ends ?? {};
  const endRows = [['quit', 'Quit'], ['lost', 'Lost (crash or force quit)'], ['unknown', 'Unknown (sealed later)']].map(([k, name]) => ({ name, value: num(ends[k]) }));
  return [...errorLines(journey),
    el('div', { class: 'cols' },
      el('div', {}, el('h3', {}, 'Hours in front, by surface'), focus.length ? bars(focus, { unit: ' h', share: true, total: focusTotal, label: 'Hours in front by surface' }) : el('p', { class: 'empty' }, 'None.')),
      el('div', {}, el('h3', {}, 'Session length'), bars((journey.lengths ?? []).map((r) => ({ name: LENGTH_NAMES[r.name] ?? r.name, value: num(r.sessions) })), { share: true, total: num(journey.sessions), label: 'Session length' })),
      el('div', {}, el('h3', {}, 'How sessions end'), bars(endRows, { share: true, total: num(journey.sessions), label: 'How sessions end' })))];
}

// ---------------------------------------------------------------- friction

function frictionCard([journey]) {
  if (!journey.errorEvents) return [notConfigured(missing(journey, 'visits'))];
  if (!num(journey.sessions)) return noSessions(journey);
  const all = num(journey.sessions);
  const lost = num(journey.ends?.lost);
  const tiles = el('div', { class: 'tiles compact' },
    tile('Lost sessions', lost, { note: `${pct(lost, all)} of sessions: crashes and force quits` }),
    tile('Events refused', num(journey.rejected), { note: 'By Arkos’ own allowlist: a bug if not 0' }),
    tile('Events past the cap', num(journey.dropped), { note: 'Beyond 200 in one session' }));
  const plain = (r) => str(r.name).replaceAll('_', ' ');
  return [...errorLines(journey), tiles,
    el('div', { class: 'cols' },
      el('div', {}, el('h3', {}, 'Errors people saw'), journey.errorEvents.length ? bars(journey.errorEvents.map((r) => ({ name: plain(r), value: num(r.sessions), detail: `${plain(r)}: ${num(r.sessions)} sessions, ${num(r.count)} times` })), { share: true, total: all, label: 'Errors by sessions' }) : el('p', { class: 'empty' }, 'None in this range.')),
      el('div', {}, el('h3', {}, 'Notices in the bell'), journey.notices?.length ? bars(journey.notices.map((r) => ({ name: plain(r), value: num(r.sessions) })), { share: true, total: all, label: 'Notices by sessions' }) : el('p', { class: 'empty' }, 'None in this range.')))];
}

// ---------------------------------------------------------------- return

const SESSION_RHYTHM = { first: 'First session', 'same day': 'Same day as the last', 1: 'The next day', '2-6': 'After 2 to 6 days', '7+': 'After a week or more' };

function returnCard([journey]) {
  if (!journey.rhythm) return [notConfigured(missing(journey, 'visits'))];
  if (!num(journey.sessions)) return noSessions(journey);
  const cohorts = journey.cohorts ?? [];
  const width = Math.max(0, ...cohorts.map((c) => c.weeks?.length ?? 0));
  const cols = [{ key: 'week', label: 'Installed the week of', render: (v) => shortDay(v) }];
  for (let i = 0; i < width; i += 1) {
    cols.push({ key: `w${i}`, label: i === 0 ? 'That week' : `Week ${i}`, num: true, render: (v, row) => (isNum(v) ? el('span', { class: 'cohort', style: `--share:${row.w0 ? Math.round((v / row.w0) * 100) : 0}%` }, `${v}`) : '') });
  }
  const rows = cohorts.map((c) => Object.fromEntries([['week', c.week], ...(c.weeks ?? []).map((v, i) => [`w${i}`, v])]));
  return [...errorLines(journey),
    el('div', { class: 'cols' },
      el('div', {}, el('h3', {}, 'Days since the last session'), bars(journey.rhythm.map((r) => ({ name: SESSION_RHYTHM[r.name] ?? str(r.name), value: num(r.sessions) })), { share: true, total: num(journey.sessions), label: 'Days since the last session' })),
      el('div', {}, el('h3', {}, 'Sessions by install week'), table(cols, rows, 'No cohorts in this range.'),
        el('p', { class: 'note' }, 'The install week is the week of a copy’s first session, Thursday to Wednesday, the same for everyone who started that week. Weeks before the range are blank: they were not measured.')))];
}

// ---------------------------------------------------------------- crashes

function crashesCard([crashes], days) {
  if (crashes.total === null || crashes.total === undefined) return [notConfigured(missing(crashes, 'visits'))];
  const sessions = num(crashes.sessions);
  const lost = num(crashes.lost);
  const tiles = el('div', { class: 'tiles' },
    tile('Crash reports', num(crashes.total), { delta: delta(num(crashes.total), crashes.previous, { good: 'down', vs: previousText(days) }) }),
    tile('Lost sessions', lost, { note: sessions ? `${pct(lost, sessions)} of ${compact(sessions)} sessions` : 'No usage reports' }),
    tile('Crash-free sessions', sessions ? Math.round((1 - lost / sessions) * 1000) / 10 : '–', { unit: sessions ? '%' : '' }));
  const groups = crashes.groups ?? [];
  const where = (g) => el('span', { class: 'page-cell' }, el('span', { class: 'mono' }, `${str(g.file) || 'unknown file'}${isNum(g.line) ? `:${g.line}` : ''}`), el('small', {}, g.pk === 'other' ? `panic, message hash ${str(g.mh).slice(0, 12)}` : `failure point ${str(g.pk)}`));
  const groupTable = table([
    { key: 'file', label: 'Where', wrap: true, render: (_, g) => where(g) },
    { key: 'count', label: 'Reports', num: true },
    { key: 'versions', label: 'Versions', render: (v) => (v ?? []).join(', ') },
    { key: 'up', label: 'Up for', render: (v) => Object.entries(v ?? {}).map(([k, n]) => `${k} ×${n}`).join(' · ') },
    { key: 'last', label: 'Last', render: (v) => ago(v) },
  ], groups, 'No crash reports in this range.');
  const frames = groups.length ? folded('Stacks to symbolicate (newest report of each)', groups.map((g) => el('div', { class: 'stack' },
    el('p', { class: 'note mono' }, `${str(g.file)}${isNum(g.line) ? `:${g.line}` : ''} · commit ${str(g.commit)} · image ${(g.image ?? []).join(' ')}`),
    el('pre', { class: 'mono' }, (g.frames ?? []).map(([i, off]) => `#${i} 0x${num(off).toString(16)}`).join('\n'))))) : null;
  return [...errorLines(crashes), tiles,
    el('h3', {}, 'By version'),
    table([
      { key: 'ver', label: 'Version' },
      { key: 'crashes', label: 'Crash reports', num: true },
      { key: 'sessions', label: 'Sessions', num: true },
      { key: 'lost', label: 'Lost', num: true },
      { key: 'rate', label: 'Crash-free', num: true, render: (_, r) => (num(r.sessions) ? `${Math.round((1 - num(r.lost) / num(r.sessions)) * 1000) / 10}%` : '–') },
    ], crashes.byVersion ?? [], 'Nothing in this range.'),
    el('h3', {}, 'By cause'), groupTable, frames].filter(Boolean);
}

// ---------------------------------------------------------------- recent sessions

const NY_CLOCK = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
function wallClock(ms, now) {
  if (!Number.isFinite(ms)) return '';
  const p = Object.fromEntries(NY_CLOCK.formatToParts(ms).filter((x) => x.type !== 'literal').map((x) => [x.type, x.value]));
  const date = now - ms > 6 * 86_400_000 ? ` ${p.day} ${p.month}` : '';
  return `${p.weekday}${date} ${p.hour}:${p.minute} ${str(p.dayPeriod).toLowerCase()}`;
}
const END_NAMES = { quit: 'Quit', lost: 'Lost: a crash or a force quit', unknown: 'Ended unknown: sealed later' };
const STEPS_SHOWN = 14;

/** One session: when, how long, the steps on a time line, the steps in order, the focus split, how it ended. */
function session(s, now) {
  const len = Math.max(1, num(s.len));
  const received = Date.parse(str(s.received));
  const started = Number.isFinite(received) ? received - len * 1000 : NaN;
  const steps = Array.isArray(s.steps) ? s.steps : [];
  const head = el('p', { class: 'j-head' },
    el('span', { class: 'j-when' }, wallClock(started, now)),
    ` · ${ago(received, now)} · ${duration(s.len)} · ${steps.length} step${steps.length === 1 ? '' : 's'}`);
  const firstRun = s.rd === -1;
  const meta = el('div', { class: 'j-meta' },
    el('span', { class: 'j-device mono' }, [`Arkos ${str(s.ver)}`, isNum(s.osv) ? `macOS ${s.osv}` : '', s.arch === 'arm64' ? 'Apple silicon' : s.arch === 'x86_64' ? 'Intel' : str(s.arch), s.iw ? `installed the week of ${shortDay(s.iw)}` : ''].filter(Boolean).join(' · ')),
    el('span', { class: 'tags j-chips' },
      firstRun ? el('span', { class: 'badge' }, 'first session') : isNum(s.rd) ? el('span', { class: 'badge' }, s.rd === 0 ? 'same day as the last' : `${s.rd} day${s.rd === 1 ? '' : 's'} since the last`) : null,
      s.end === 'lost' ? el('span', { class: 'badge warn' }, 'lost') : null,
      num(s.rejected) ? el('span', { class: 'badge warn' }, `${s.rejected} refused`) : null));
  // The time line: each step a tick at its time, in its step's colour.
  const line = el('div', { class: 's-line', role: 'img', 'aria-label': `${steps.length} steps over ${duration(len)}` });
  for (const st of steps) {
    const tick = el('span', { class: `s-tick ${toneOf(st.group)}`, title: `${clock(st.t)} ${st.label}${st.detail ? `, ${st.detail}` : ''}` });
    tick.style.left = `${Math.min(100, (num(st.t) / len) * 100)}%`;
    line.append(tick);
  }
  const stepItem = (st) => el('li', { class: `s-step ${toneOf(st.group)}` }, el('span', { class: 's-t mono' }, clock(st.t)), el('span', { class: 's-label' }, st.label), st.detail ? el('span', { class: 's-detail' }, str(st.detail)) : null);
  const list = el('ol', { class: 's-steps' }, ...steps.slice(0, STEPS_SHOWN).map(stepItem),
    el('li', { class: `s-step ${s.end === 'lost' ? 'g-warn' : 'g-end'}` }, el('span', { class: 's-t mono' }, clock(len)), el('span', { class: 's-label' }, END_NAMES[s.end] ?? `Ended ${str(s.end)}`)));
  const rest = steps.length > STEPS_SHOWN ? folded(`The other ${steps.length - STEPS_SHOWN} steps`, el('ol', { class: 's-steps', start: STEPS_SHOWN + 1 }, ...steps.slice(STEPS_SHOWN).map(stepItem))) : null;
  const focus = Object.entries(s.focus ?? {}).filter(([, v]) => num(v) > 0);
  const focusTotal = focus.reduce((n, [, v]) => n + num(v), 0);
  const strip = focus.length
    ? el('div', { class: 'j-strip', role: 'img', 'aria-label': `In front: ${focus.map(([k, v]) => `${SURFACE_NAMES[k] ?? k} ${duration(v)}`).join(', ')}` },
      ...focus.map(([k, v], i) => el('span', { style: `flex:${num(v)} 1 0`, class: `ord-${Math.min(4, i + 1)}`, title: `${SURFACE_NAMES[k] ?? k}: ${duration(v)} (${pct(num(v), focusTotal)})` })))
    : null;
  const legend = focus.length ? el('p', { class: 'note s-legend' }, `In front: ${focus.map(([k, v]) => `${SURFACE_NAMES[k] ?? k} ${duration(v)}`).join(' · ')}`) : null;
  return el('li', { class: 'journey' }, head, meta, line, list, rest, strip, legend);
}

const SESSIONS_SHOWN = 8;
const SESSION_FILTERS = [
  { id: 'first', label: 'Only first sessions', keep: (s) => s.rd === -1 },
  { id: 'lost', label: 'Only lost', keep: (s) => s.end === 'lost' },
  { id: 'long', label: 'Only an hour or more', keep: (s) => num(s.len) >= 3600 },
];

function sessionsCard([sessions]) {
  if (!sessions.rows) return [notConfigured(missing(sessions, 'visits'))];
  if (!sessions.rows.length) return noSessions(sessions);
  const now = Date.now();
  const state = Object.fromEntries(SESSION_FILTERS.map((f) => [f.id, false]));
  const hidden = el('span', { class: 'j-hidden', role: 'status' });
  const host = el('div', { class: 'j-list' });
  const list = (items) => el('ol', { class: 'journeys', role: 'list' }, ...items.map((s) => session(s, now)));
  const render = () => {
    const kept = sessions.rows.filter((s) => SESSION_FILTERS.every((f) => !state[f.id] || f.keep(s)));
    const n = sessions.rows.length - kept.length;
    hidden.textContent = n ? `${n} hidden` : '';
    host.replaceChildren(...[
      kept.length ? list(kept.slice(0, SESSIONS_SHOWN)) : el('p', { class: 'empty' }, 'Every session in this range is hidden by the filters.'),
      kept.length > SESSIONS_SHOWN ? folded(`More sessions · ${kept.length - SESSIONS_SHOWN}`, list(kept.slice(SESSIONS_SHOWN))) : null,
    ].filter(Boolean));
  };
  const buttons = SESSION_FILTERS.map((f) => {
    const b = el('button', { type: 'button', 'aria-pressed': 'false' }, f.label);
    b.addEventListener('click', () => {
      state[f.id] = !state[f.id];
      b.setAttribute('aria-pressed', String(state[f.id]));
      render();
    });
    return b;
  });
  render();
  return [...errorLines(sessions), el('div', { class: 'j-filters', role: 'group', 'aria-label': 'Session filters' }, ...buttons, hidden), host];
}

// ---------------------------------------------------------------- the cards

const CARDS = [
  { id: 'installs', title: 'Macs running Arkos', queries: ['installs'], sub: (d) => `Every copy checks for updates once a day, and that check is all this card counts: it needs no consent and carries no id. A Mac is counted once in ${d === 1 ? 'today so far (UTC), against yesterday' : `the last ${d} UTC days`} from its check’s days since the last one. Versions, macOS and processor count each Mac once.`, render: installsCard, skeleton: { tiles: 4, chart: true } },
  { id: 'paths', title: 'Paths through a session', queries: ['journey'], sub: () => `What people do after a launch, in order: each column is the next step, each band the sessions that went from one step to the next. Each column shows its six most common steps; Other gathers the rest. Restored tabs count as part of the launch; Ended is where a session stopped. ${OPT_IN}`, render: pathsCard, skeleton: { chart: true, lines: 2 } },
  { id: 'milestones', title: 'How far sessions get', queries: ['journey'], sub: () => 'The share of sessions that reached each milestone at any point, and the median time from the launch to the first time, for all sessions and for first sessions (a copy’s first run with usage reports on).', render: milestonesCard, skeleton: { lines: 7 } },
  { id: 'next', title: 'What comes next', queries: ['journey'], sub: () => 'For the most common steps, what people did right after, as a share of the sessions that took the step. A step often followed by Ended, an error or a help page is a place to smooth.', render: nextCard, skeleton: { lines: 8 } },
  { id: 'features', title: 'What gets used', queries: ['journey'], sub: () => 'Features by the sessions that used them, and how tabs get opened: by the palette, a shortcut or a click, which says whether the shortcuts are found.', render: featuresCard, skeleton: { lines: 8 } },
  { id: 'time', title: 'Time', half: true, queries: ['journey'], sub: () => 'Hours the window was in front, by surface; how long sessions run; how they end.', render: timeCard, skeleton: { lines: 6 } },
  { id: 'friction', title: 'Friction', half: true, queries: ['journey'], sub: () => 'What went wrong where people saw it, and sessions lost to a crash or a force quit.', render: frictionCard, skeleton: { tiles: 3, lines: 4 } },
  { id: 'return', title: 'Coming back', queries: ['journey'], sub: () => 'How long since a copy’s previous session, and the sessions of each install week in the weeks after it. No id is kept: both come from what each report says about its own copy.', render: returnCard, skeleton: { lines: 6 } },
  { id: 'crashes', title: 'Crashes', queries: ['crashes'], sub: () => 'Crash reports people agreed to send, grouped by where the panic happened, with the offsets to symbolicate against the release’s dSYM. Lost sessions are the runs that ended without a quit, reported or not.', render: crashesCard, skeleton: { tiles: 3, lines: 5 } },
  { id: 'sessions', title: 'Recent sessions', queries: ['sessions'], sub: () => 'The newest sessions in full, newest first: each step at its time since the launch, how long the window was in front on each surface, and how it ended. Times are New York’s; a session is reported after it ends, so it started its length before it arrived.', render: sessionsCard, skeleton: { lines: 6 } },
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
  if (!body.querySelector('.skeleton')) card.classList.add('loading');
  body.setAttribute('aria-busy', 'true');
  try {
    const results = await Promise.all(def.queries.map((name) => query(name, range)));
    if (gen !== generation) return;
    const sub = def.sub(range, results[0]);
    card.querySelector('.sub').textContent = sub;
    card.querySelector('.sub').hidden = !sub;
    body.replaceChildren(...def.render(results, range));
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
 * Every card loads on its own and shows its own error line; the journey cards share one
 * query, asked once per range. A failed answer is asked again on the next load.
 */
async function load() {
  generation += 1;
  const gen = generation;
  asked = new Map();
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

function whoButtons() {
  const note = () => { whoNote.textContent = WHOS.find((w) => w.who === who).note; };
  const buttons = WHOS.map((w) => {
    const b = el('button', { type: 'button', 'aria-pressed': String(w.who === who) }, w.label);
    b.addEventListener('click', () => {
      if (who === w.who) return;
      who = w.who;
      for (const other of buttons) other.setAttribute('aria-pressed', String(other === b));
      note();
      const url = new URL(location.href);
      if (who === 'all') url.searchParams.delete('who');
      else url.searchParams.set('who', who);
      history.replaceState(null, '', url);
      load();
    });
    return b;
  });
  whoRow.append(...buttons);
  note();
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
whoButtons();
if (preview) {
  accountMenu(account, { preview: true });
  start();
} else {
  requireSession(root, (user) => {
    accountMenu(account, { account: user });
    start();
  });
}
