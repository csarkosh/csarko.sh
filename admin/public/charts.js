/**
 * The admin pages' marks, in plain DOM and hand-written SVG: stat tiles with a delta
 * and a sparkline, columns per day with the previous range ghosted behind them,
 * horizontal bars, and the table every number is also reachable through. No library.
 *
 * Colour is the site's tokens only (theme.css): the one series is the accent, the
 * previous range a ghost of --faint, the chrome hairlines; the ordinal ramp for a funnel
 * is the accent mixed toward the surface. Text is text tokens, never the series colour.
 * Every value shown in a tooltip is also in a label or a table, so nothing is gated.
 *
 * Motion is motion.js's (Material 3, on the theme's tokens): a fold is an accordion, and a card
 * whose height changes eases to it.
 */

import { accordion, easeHeight, fadeIn, fadeOut, glideList } from '/motion.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** An element with attributes and children; strings become text nodes, never markup. */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children) if (child !== null && child !== undefined) node.append(child);
  return node;
}

function svg(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

const ARROW_UP = 'M12 19V5M5 12l7-7 7 7';
const ARROW_DOWN = 'M12 5v14M19 12l-7 7-7-7';
const ARROW_FLAT = 'M5 12h14';

function icon(d) {
  const node = svg('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2.4', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' });
  node.append(svg('path', { d }));
  return node;
}

/** 1,284 / 12.9K / 4.2M: the stat tile's figure. */
export function compact(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '–';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (abs >= 10_000) return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  if (Number.isInteger(value)) return value.toLocaleString('en-US');
  return value.toLocaleString('en-US', { maximumFractionDigits: abs < 10 ? 2 : 1 });
}

/** A share as text: 8.4%, 12%, 0%. `part`/`whole` as counts, or a single ratio in [0, 1]. */
export function pct(part, whole = 1) {
  if (!whole || !Number.isFinite(part)) return '0%';
  const share = (part / whole) * 100;
  if (share > 0 && share < 10) return `${share.toFixed(1).replace(/\.0$/, '')}%`;
  return `${Math.round(share)}%`;
}

/** 42s ago, 5 min ago, 3 h ago, 2 d ago, for an ISO string or epoch ms. */
export function ago(when, now = Date.now()) {
  const ms = typeof when === 'string' ? Date.parse(when) : when;
  if (!Number.isFinite(ms)) return '';
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 90) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

/**
 * The change from `prev` to `value`: +12% when prev is large enough for a share to mean
 * something, otherwise the absolute change (+3, −1). Up takes the accent and down the
 * warning, unless `good` is "down" (position, errors). Arrow plus text plus aria-label,
 * so the direction is never colour alone.
 */
export function delta(value, prev, { good = 'up', unit = '', vs = 'previous period', percent } = {}) {
  if (typeof value !== 'number' || typeof prev !== 'number' || !Number.isFinite(value) || !Number.isFinite(prev)) {
    return el('span', { class: 'delta', 'aria-label': 'no previous value' }, icon(ARROW_FLAT), 'no previous');
  }
  const change = value - prev;
  const usePercent = percent ?? (Math.abs(prev) >= 10);
  const magnitude = usePercent ? `${Math.round((Math.abs(change) / Math.abs(prev)) * 100)}%` : `${compact(Math.abs(change))}${unit}`;
  const direction = change === 0 ? 'flat' : change > 0 ? 'up' : 'down';
  const tone = direction === 'flat' ? 'flat' : (direction === 'up') === (good === 'up') ? 'up' : 'down';
  const sign = direction === 'flat' ? '' : direction === 'up' ? '+' : '−';
  const text = direction === 'flat' ? 'no change' : `${sign}${magnitude}`;
  const node = el('span', { class: `delta ${tone}`, 'aria-label': direction === 'flat' ? `no change from ${vs}` : `${direction} ${magnitude} from ${compact(prev)}${unit} the ${vs}` },
    icon(direction === 'flat' ? ARROW_FLAT : direction === 'up' ? ARROW_UP : ARROW_DOWN),
    text,
    el('span', { class: 'vs', 'aria-hidden': 'true' }, ` vs ${compact(prev)}${unit}`));
  return node;
}

/** A 12-point sparkline, 1px: the trend in --faint, the latest step and point in the accent. */
export function sparkline(values, { width = 120, height = 28, label = '' } = {}) {
  const points = (values ?? []).filter((v) => typeof v === 'number' && Number.isFinite(v));
  const node = svg('svg', { class: 'spark', viewBox: `0 0 ${width} ${height}`, role: 'img' });
  const title = svg('title');
  if (points.length < 2) {
    title.textContent = label || 'No trend yet';
    node.append(title);
    return node;
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const pad = 3;
  const x = (i) => pad + (i / (points.length - 1)) * (width - pad * 2);
  const y = (v) => pad + (1 - (v - min) / span) * (height - pad * 2);
  const coords = points.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  node.setAttribute('aria-label', label || `${points.length} weeks: low ${compact(min)}, high ${compact(max)}, latest ${compact(points[points.length - 1])}`);
  title.textContent = node.getAttribute('aria-label');
  node.append(title);
  node.append(svg('polyline', { class: 'line', points: coords.slice(0, -1).join(' ') }));
  node.append(svg('polyline', { class: 'line now', points: coords.slice(-2).join(' ') }));
  node.append(svg('circle', { class: 'dot', cx: x(points.length - 1).toFixed(1), cy: y(points[points.length - 1]).toFixed(1), r: 2.5 }));
  return node;
}

/**
 * A stat tile: label, value (compacted when a number), an optional delta node, note and
 * 12-week trend. `unit` sits after the value in a smaller weight.
 */
export function tile(label, value, { delta: change, trend, note, unit = '', trendLabel } = {}) {
  const shown = typeof value === 'number' ? compact(value) : (value ?? '–');
  const valueNode = el('div', { class: 'value' }, shown);
  if (unit) valueNode.append(el('small', {}, unit));
  const node = el('div', { class: 'tile' }, el('div', { class: 'label' }, label), valueNode);
  if (change) node.append(el('div', { class: 'delta-row' }, change));
  if (note) node.append(el('p', { class: 'note' }, note));
  if (trend && trend.length >= 2) node.append(el('div', { class: 'trend' }, sparkline(trend, { label: trendLabel ?? `${label}, 12 weeks: low ${compact(Math.min(...trend))}, high ${compact(Math.max(...trend))}, latest ${compact(trend[trend.length - 1])}` })));
  return node;
}

/**
 * The chart's tooltip. It fades and lifts in (theme.css `.tooltip.on`); moving from one mark to
 * the next glides it there (`.glide`) instead of fading it out and in again, so a hide is held for
 * a frame in case a show follows straight away, as it does between neighbouring marks.
 */
function tooltip(host) {
  const node = el('div', { class: 'tooltip', 'aria-hidden': 'true' });
  host.append(node);
  let leaving = 0;
  return {
    show(x, y, lines) {
      cancelAnimationFrame(leaving);
      node.classList.toggle('glide', node.classList.contains('on'));
      node.replaceChildren(...lines.map((line) => el('div', {}, el('span', { class: `key${line.ghost ? ' ghost' : ''}` }), el('span', { class: 'v' }, line.v), ' ', el('span', { class: 'k' }, line.k))));
      node.classList.add('on');
      const w = host.clientWidth;
      node.style.left = `${Math.max(0, Math.min(x + 12, w - node.offsetWidth - 4))}px`;
      node.style.top = `${Math.max(0, y - node.offsetHeight - 10)}px`;
    },
    hide() {
      cancelAnimationFrame(leaving);
      leaving = requestAnimationFrame(() => node.classList.remove('on', 'glide'));
    },
  };
}

/** Clean ticks: 1, 2 or 5 times a power of ten, about four of them, the top at or past the data. */
function ticksFor(max) {
  if (max <= 0) return [0, 1];
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
  const ticks = [];
  for (let v = 0; v < max + step; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return ticks;
}

/**
 * Columns from one baseline, one per entry: thin marks capped at 24px, rounded at the data
 * end, a 2px surface gap between neighbours, the extreme labelled. With `previous` (a
 * number per entry) the range before is drawn behind each column as a ghost, and a legend
 * names the two. Each slot is a focusable hit target with a title and a tooltip.
 */
export function columns(bars, { height = 180, width = null, unit = '', previous = null, label = '', previousLabel = 'Previous range', currentLabel = 'This range', format = compact } = {}) {
  const host = el('div', { class: 'chart' });
  const values = bars.map((b) => b.value);
  const ghosts = previous ? previous.map((v) => (typeof v === 'number' ? v : 0)) : [];
  const total = values.reduce((n, v) => n + v, 0);
  const summary = label || `${bars.length} columns, ${format(total)}${unit} in all, highest ${format(Math.max(0, ...values))}${unit}`;
  const tip = tooltip(host);
  let drawn = 0;

  // The drawing's width in its own units is the host's width in pixels, so text renders at
  // its size at every viewport instead of scaling with the card. Redrawn when the host resizes.
  const draw = (W) => {
    const pad = { l: 40, r: 8, t: 16, b: 26 };
    const innerW = W - pad.l - pad.r;
    const innerH = height - pad.t - pad.b;
    const ticks = ticksFor(Math.max(0, ...values, ...ghosts));
    const max = ticks[ticks.length - 1] || 1;
    const root = svg('svg', { viewBox: `0 0 ${W} ${height}`, width: W, height, role: 'img', 'aria-label': summary });
    // Its own height, whatever the width it was drawn at: the first draw (at 640, before the
    // host is measured) would otherwise scale to the card's width for a frame, and the card
    // under it with it.
    root.style.height = `${height}px`;
    const y = (v) => pad.t + innerH - (v / max) * innerH;
    ticks.forEach((v, i) => {
      root.append(svg('line', { x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v), class: i === 0 ? 'axis-line' : 'grid-line' }));
      const tick = svg('text', { x: pad.l - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'tick' });
      tick.textContent = format(v);
      root.append(tick);
    });
    const slot = innerW / Math.max(1, bars.length);
    const thick = Math.min(24, Math.max(3, slot - 2));
    const best = values.reduce((m, v, i) => (v > (values[m] ?? -1) ? i : m), 0);
    const labelEvery = Math.max(1, Math.ceil((bars.length * 44) / innerW));
    bars.forEach((bar, i) => {
      const x = pad.l + slot * i + (slot - thick) / 2;
      const top = y(bar.value);
      const h = Math.max(0, pad.t + innerH - top);
      if (previous) {
        const gTop = y(ghosts[i] ?? 0);
        const gh = Math.max(0, pad.t + innerH - gTop);
        const extra = Math.min(6, slot - thick);
        if (gh > 0) root.append(svg('rect', { class: 'ghost', x: x - extra / 2, y: gTop, width: thick + extra, height: gh, rx: 2 }));
      }
      const r = Math.min(4, thick / 2, h);
      const rect = svg('path', {
        class: 'bar',
        d: h <= 0 ? '' : `M${x},${top + r} a${r},${r} 0 0 1 ${r},-${r} h${thick - 2 * r} a${r},${r} 0 0 1 ${r},${r} v${h - r} h${-thick} z`,
      });
      root.append(rect);
      if (i === best && bar.value > 0) {
        const dl = svg('text', { x: x + thick / 2, y: top - 5, 'text-anchor': 'middle', class: 'dlabel' });
        dl.textContent = format(bar.value);
        root.append(dl);
      }
      if (i % labelEvery === 0) {
        const tick = svg('text', { x: x + thick / 2, y: height - 8, 'text-anchor': 'middle', class: 'tick' });
        tick.textContent = bar.label;
        root.append(tick);
      }
      const hit = svg('rect', { class: 'hit', x: pad.l + slot * i, y: pad.t, width: slot, height: innerH, tabindex: 0 });
      const title = svg('title');
      title.textContent = `${bar.detail ?? bar.label}: ${bar.value.toLocaleString('en-US')}${unit}${previous ? `, previous ${(ghosts[i] ?? 0).toLocaleString('en-US')}${unit}` : ''}`;
      hit.append(title);
      const show = () => {
        rect.classList.add('hover');
        const lines = [{ v: `${bar.value.toLocaleString('en-US')}${unit}`, k: bar.detail ?? bar.label }];
        if (previous) lines.push({ v: `${(ghosts[i] ?? 0).toLocaleString('en-US')}${unit}`, k: previousLabel.toLowerCase(), ghost: true });
        tip.show(x + thick / 2, Math.min(top, previous ? y(ghosts[i] ?? 0) : top), lines);
      };
      const hide = () => { rect.classList.remove('hover'); tip.hide(); };
      hit.addEventListener('pointerenter', show);
      hit.addEventListener('focus', show);
      hit.addEventListener('pointerleave', hide);
      hit.addEventListener('blur', hide);
      root.append(hit);
    });
    const old = host.querySelector('svg');
    if (old) old.replaceWith(root); else host.prepend(root);
    drawn = W;
  };

  if (width) draw(width);
  else {
    draw(640);
    const observer = new ResizeObserver(() => {
      const W = Math.max(240, Math.round(host.clientWidth));
      if (W && Math.abs(W - drawn) > 1) draw(W);
    });
    observer.observe(host);
  }
  if (previous) {
    host.append(el('ul', { class: 'legend', 'aria-label': 'Legend' },
      el('li', {}, el('span', { class: 'swatch', 'aria-hidden': 'true' }), currentLabel),
      el('li', {}, el('span', { class: 'swatch ghost', 'aria-hidden': 'true' }), previousLabel)));
  }
  return host;
}

/**
 * Horizontal bars: a name, a track and the value at the tip, each row focusable with a
 * title. `ramp` colours the rows down the ordinal ramp (a funnel); otherwise every bar is
 * the accent. `share` adds each row's share of `total` (or of the first row) after the value.
 */
export function bars(rows, { unit = '', ramp = false, share = false, total = null, label = '', format = compact } = {}) {
  const list = el('ul', { class: 'bars', role: 'list', 'aria-label': label || undefined });
  const max = Math.max(0, ...rows.map((r) => r.value));
  const base = total ?? rows[0]?.value ?? 0;
  rows.forEach((row, i) => {
    const width = max > 0 ? Math.max((row.value / max) * 100, row.value > 0 ? 1 : 0) : 0;
    const fill = el('span', { class: `fill${ramp ? ` ord-${Math.min(i + 1, 4)}` : ''}${row.value <= 0 ? ' empty-fill' : ''}`, 'aria-hidden': 'true' });
    fill.style.width = `${width}%`;
    const n = el('span', { class: 'n' }, `${row.value.toLocaleString('en-US')}${unit}`);
    if (share && base > 0 && i > 0) n.append(el('small', {}, pct(row.value, base)));
    const item = el('li', { tabindex: 0, title: `${row.detail ?? row.name}: ${row.value.toLocaleString('en-US')}${unit}` },
      el('span', { class: 'name' }, row.name),
      el('span', { class: 'track' }, fill),
      n);
    list.append(item);
  });
  return list;
}

/**
 * A table of rows. `columns`: [{ key, label, num, wrap, render(value, row) }]. Cells are
 * text (or a node from `render`), never markup: the data is the vendors' and the visitors'.
 */
export function table(columns, rows, empty = 'Nothing in this range.') {
  if (!rows || rows.length === 0) return el('p', { class: 'empty' }, empty);
  const head = el('tr', {}, ...columns.map((c) => el('th', { scope: 'col', class: [c.num ? 'num' : '', c.wrap ? 'wrap-cell' : ''].join(' ').trim() || null }, c.label)));
  const body = rows.map((row) => el('tr', {}, ...columns.map((c) => {
    const value = row[c.key];
    const shown = c.render ? c.render(value, row) : value === null || value === undefined ? '' : typeof value === 'number' ? value.toLocaleString('en-US') : String(value);
    return el('td', { class: [c.num ? 'num' : '', c.wrap ? 'wrap-cell' : ''].join(' ').trim() || null }, shown);
  })));
  return el('div', { class: 'scroll', tabindex: 0 }, el('table', {}, el('thead', {}, head), el('tbody', {}, ...body)));
}

/** The folded table under a chart: a <details> whose summary names it, opening as an accordion. */
export function folded(summary, body, { open = false } = {}) {
  const node = el('details', { class: 'folded', open: open || null }, el('summary', {}, summary));
  for (const part of Array.isArray(body) ? body : [body]) if (part) node.append(part);
  accordion(node);
  return node;
}

/**
 * A list a chip row filters (csarko.sh's journeys, Arkos's recent sessions): the first `shown`
 * of the rows kept, the rest folded under `more(n)`, and `empty` when none is kept. `update(kept)`
 * draws a new set, a subset of `rows` in order: after the first, the entries glide (motion.js
 * glideList) and the fold and the empty line fade in or out with the space they take easing. Each
 * row's node is made once by `render(row)`, so a fold the reader opened inside it stays open,
 * and is matched across a change by `id(row)`, a string from the row's own fields, made unique
 * here by a repeat count. Returns `{ node, update }`.
 */
export function filteredList(rows, { id, render, shown, more, empty }) {
  const keys = new Map();
  const repeats = new Map();
  for (const row of rows) {
    const base = id(row);
    const n = repeats.get(base) ?? 0;
    repeats.set(base, n + 1);
    keys.set(row, n ? `${base}#${n}` : base);
  }
  const nodes = new Map();
  const item = (row) => {
    if (!nodes.has(row)) {
      const node = render(row);
      node.dataset.key = keys.get(row);
      nodes.set(row, node);
    }
    return nodes.get(row);
  };
  const keyOf = (node) => node.dataset.key ?? null;
  const head = el('ol', { class: 'journeys', role: 'list' });
  const rest = el('ol', { class: 'journeys', role: 'list' });
  const fold = folded('', rest);
  const none = el('p', { class: 'empty' }, empty);
  fold.hidden = true;
  none.hidden = true;
  const tail = el('div', { class: 'j-tail' }, none, fold);
  // Parts fading out, hidden once the fade is done.
  const leaving = new Set();
  const toggle = (part, on, animate) => {
    if (on) {
      if (!part.hidden && !leaving.has(part)) return;
      leaving.delete(part);
      part.hidden = false;
      if (animate) fadeIn(part);
      return;
    }
    if (part.hidden || leaving.has(part)) return;
    const out = animate ? fadeOut(part) : null;
    if (!out) {
      part.hidden = true;
      return;
    }
    leaving.add(part);
    out.finished.then(() => { if (leaving.delete(part)) part.hidden = true; }, () => {});
  };
  // The tail's height once what is leaving has gone.
  const tailHeight = () => {
    const going = [...leaving];
    going.forEach((part) => { part.hidden = true; });
    const height = tail.getBoundingClientRect().height;
    going.forEach((part) => { part.hidden = false; });
    return height;
  };
  let drawn = false;
  const update = (kept) => {
    const animate = drawn;
    drawn = true;
    const first = kept.slice(0, shown).map(item);
    const after = kept.slice(shown).map(item);
    // From the height the tail is drawn at; then its ease in flight goes, so the height it goes to
    // is measured as it is laid out without one (easeHeight would re-measure it with the leaving
    // parts still in, and snap when they go).
    const from = tail.getBoundingClientRect().height;
    heightEases(tail).forEach((a) => a.cancel());
    const fill = (list, items) => () => list.replaceChildren(...items);
    if (animate) {
      glideList(head, fill(head, first), keyOf);
      glideList(rest, fill(rest, after), keyOf);
    } else {
      fill(head, first)();
      fill(rest, after)();
    }
    fold.querySelector('summary').textContent = more(after.length);
    toggle(none, !kept.length, animate);
    toggle(fold, after.length > 0, animate);
    const to = tailHeight();
    if (animate && Math.abs(to - from) >= 1) easeHeight(tail, from, to);
  };
  return { node: el('div', { class: 'j-list' }, head, tail), update };
}

/** A status mark: dot and word together. */
export function status(level, text) {
  const tone = ['good', 'warning', 'critical'].includes(level) ? level : 'unknown';
  const word = tone === 'unknown' ? 'Unknown' : tone[0].toUpperCase() + tone.slice(1);
  return el('span', { class: `status ${tone}` }, el('span', { class: 'dot', 'aria-hidden': 'true' }), el('b', {}, word), text ? el('span', {}, text) : null);
}

/** A warning line with its icon: the card's own error. */
export function errorLine(text, detail) {
  const warning = svg('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2.4', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' });
  warning.append(svg('path', { d: 'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z' }), svg('path', { d: 'M12 9v4M12 17h.01' }));
  return el('p', { class: 'error', role: 'status' }, warning, el('span', {}, text, detail ? el('span', { class: 'detail' }, ` ${detail}`) : null));
}

/**
 * The shape of what a card is waiting for, shown while its queries run, in the Material
 * skeleton's manner (Cyrus, 2026-10-29: https://mui.com/material-ui/react-skeleton/): each
 * part the shape of the content it stands for, in a tint of the text colour that pulses.
 * Parts, top to bottom: `chips` filter buttons, `tiles` stat tiles, a `chart` (true, or its
 * height), `bars` labelled bars (split over `cols` columns with a heading each, as `.cols`
 * lays them), `rows` table rows, `items` list entries (a heading line, a line of chips and a
 * block, `item` px from one to the next), `lines` of text, then `folds` folded tables. `tile`
 * and `row` are a card's tile and table-row heights, where they differ from the usual. Hidden from screen
 * readers; the card's body says "Loading" to them (see `loading()`).
 */
export function skeleton(shape = {}) {
  // A card of headed sections is a list of shapes, each after the first under a heading line.
  if (Array.isArray(shape)) {
    return el('div', { class: 'skeleton', 'aria-hidden': 'true' }, ...shape.flatMap((part, i) =>
      [...(part.heading ?? i > 0 ? [el('div', { class: 'skel text section' })] : []), ...skeleton(part).childNodes]));
  }
  return skeletonOf(shape);
}

function skeletonOf({ chips = 0, tiles = 0, tile = 136, chart = false, bars = 0, cols = 0, rows = 0, row = 42, items = 0, item = 312, lines = 0, folds = 0 } = {}) {
  const sk = (cls, attrs = {}) => el('div', { class: `skel ${cls}`, ...attrs });
  const parts = [];
  if (chips > 0) parts.push(el('div', { class: 'skel-row' }, ...Array.from({ length: chips }, () => sk('pill'))));
  if (tiles > 0) {
    parts.push(el('div', { class: 'skel-tiles' }, ...Array.from({ length: tiles }, () =>
      // Only the lines a tile of this height holds: a label and the figure, then a line or two.
      el('div', { class: 'skel-tile', style: `height:${tile}px` }, sk('text label'), sk('text figure'), ...(tile >= 130 ? [sk('text'), sk('text short')] : tile >= 110 ? [sk('text short')] : [])))));
  }
  if (chart) parts.push(sk('rect chart', typeof chart === 'number' ? { style: `height:${chart}px` } : {}));
  const barList = (n) => el('div', { class: 'skel-list' }, ...Array.from({ length: n }, (_, i) =>
    el('div', { class: 'skel-bar' }, sk('text'), sk('rect bar', { style: `width:${[92, 70, 54, 40, 30, 22, 16, 12][i % 8]}%` }), sk('text num'))));
  if (bars > 0 && cols > 1) {
    const each = Math.ceil(bars / cols);
    parts.push(el('div', { class: 'cols' }, ...Array.from({ length: cols }, () => el('div', { class: 'skel-list' }, sk('text label'), barList(each)))));
  } else if (bars > 0) parts.push(barList(bars));
  if (rows > 0) {
    parts.push(el('div', { class: 'skel-list' }, sk('text head'), ...Array.from({ length: rows }, (_, i) =>
      el('div', { class: 'skel-trow', style: `height:${row}px` }, sk(`text${i % 3 === 2 ? ' short' : ''}`), sk('text num'), sk('text num')))));
  }
  for (let i = 0; i < items; i += 1) {
    parts.push(el('div', { class: 'skel-item', style: `height:${item}px` }, sk('text short'), el('div', { class: 'skel-row' }, sk('pill'), sk('pill'), sk('pill')), sk('rounded block')));
  }
  for (let i = 0; i < lines; i += 1) parts.push(sk(`text${i % 3 === 2 ? ' short' : ''}`));
  for (let i = 0; i < folds; i += 1) parts.push(sk('text fold'));
  return el('div', { class: 'skeleton', 'aria-hidden': 'true' }, ...parts);
}

/** A card body that is loading: busy for assistive tech, a skeleton for everyone else. */
export function loading(shape) {
  return el('div', { class: 'body', 'aria-busy': 'true' }, el('p', { class: 'sr-only' }, 'Loading'), skeleton(shape));
}

/*
 * Cards never jump (Cyrus, 2026-10-29). A card's content is the size of its data, which no
 * skeleton can know, so each card remembers the height it last had in this view (the page,
 * its query, so the range and the filters, and the window's width to 40 px) in this
 * browser's localStorage, beside the sign-in's own entries. `hold()` gives a loading card
 * that height and fills the space with skeleton lines; `settle()`, once the content is in,
 * lets it go and remembers the new height. A view seen before therefore loads in place; a
 * view never seen falls back to the skeleton's own shape. Storage refused (a private
 * window) costs only the memory.
 *
 * Where a card's height does change (a view never seen, a range whose height is another), it
 * eases there (motion.js easeHeight) rather than snapping, and what it remembers is always the
 * height it ends at, never one from the middle of an ease. A card not yet drawn (the shells
 * before the first frame) takes its height at once: nothing was on screen to move from.
 */
const HOLD = 'admin:hold:';
const holdKey = (id) => `${HOLD}${location.pathname}|${id}|${[...new URLSearchParams(location.search)].sort().map(([k, v]) => `${k}=${v}`).join('&')}|${Math.round(innerWidth / 40)}`;
const recall = (id) => {
  try {
    return Number(localStorage.getItem(holdKey(id))) || 0;
  } catch {
    return 0;
  }
};

// The cards that have been on screen: they ease to a new height, the rest take it.
const drawn = new WeakSet();
function markDrawn(card) {
  if (drawn.has(card)) return true;
  // Two frames: the first runs before the paint that shows the card, the second after it.
  requestAnimationFrame(() => requestAnimationFrame(() => drawn.add(card)));
  return false;
}

// A height ease in flight on `card` itself, or with `within`, on anything in it (a fold, a list's glide).
const heightEases = (card, within = false) => card.getAnimations({ subtree: within })
  .filter((a) => a.playState === 'running' && a.effect?.getKeyframes().some((k) => 'height' in k));

// From the height `card` is drawn at to the one it has now (`from` read before the change), when
// it has been on screen and the change is a pixel or more.
function easeTo(card, from, ease) {
  const to = card.getBoundingClientRect().height;
  return ease && Math.abs(to - from) >= 1 ? easeHeight(card, from, to) : null;
}

/**
 * Hold `card` at the height it last had in this view (else at `fallback`, its height now,
 * on a reload): exactly that height, the skeleton filled down to it with lines or clipped
 * at it, so the space is the content's before the content comes. A card on screen eases from
 * the height it is drawn at.
 */
export function hold(card, id, fallback = 0) {
  watching.get(card)?.disconnect();
  watching.delete(card);
  const height = recall(id) || fallback;
  if (!height) return;
  const ease = markDrawn(card);
  const from = card.getBoundingClientRect().height;
  heightEases(card).forEach((a) => a.cancel());
  card.style.height = `${height}px`;
  card.style.overflow = 'hidden';
  easeTo(card, from, ease);
  const shape = card.querySelector('.skeleton');
  if (!shape) return;
  // As many text lines as fit between the skeleton's foot and the card's padding, at the height
  // it is going to (an ease draws it at another meanwhile).
  const probe = shape.appendChild(el('div', { class: 'skel text' }));
  const box = probe.getBoundingClientRect();
  const step = box.height + parseFloat(getComputedStyle(probe).marginTop) + parseFloat(getComputedStyle(probe).marginBottom);
  probe.remove();
  const room = card.getBoundingClientRect().top + height - parseFloat(getComputedStyle(card).paddingBottom) - shape.getBoundingClientRect().bottom;
  const n = step > 0 ? Math.max(0, Math.min(400, Math.floor(room / step))) : 0;
  for (let i = 0; i < n; i += 1) shape.append(el('div', { class: `skel text${i % 4 === 3 ? ' short' : ''}` }));
}

// A card's content can settle after it goes in (a chart sized to its box, a font), so its
// height is remembered again as it changes for a moment after; not for longer, or a fold
// the reader opens would be remembered open.
const watching = new WeakMap();
const SETTLING_MS = 1500;

/**
 * The content is in: let the card take its own height, and remember it for this view. The
 * height is measured before the card eases to it, and while anything in the card eases its
 * height, the readings after are skipped: what is remembered is where the card ends.
 */
export function settle(card, id) {
  watching.get(card)?.disconnect();
  watching.delete(card);
  const ease = markDrawn(card);
  const from = card.getBoundingClientRect().height;
  heightEases(card).forEach((a) => a.cancel());
  card.style.height = '';
  card.style.overflow = '';
  const key = holdKey(id);
  const keep = () => {
    const height = card.getBoundingClientRect().height;
    // Hidden (the sign-in gate is up) it measures 0, which is no height to come back to.
    if (!height) return;
    try {
      localStorage.setItem(key, String(Math.round(height * 100) / 100));
    } catch {
      // No storage: the next load falls back to the skeleton's shape.
    }
  };
  keep();
  const eased = easeTo(card, from, ease);
  if (typeof ResizeObserver !== 'function') return;
  const watch = new ResizeObserver(() => { if (!heightEases(card, true).length) keep(); });
  watch.observe(card);
  watching.set(card, watch);
  // The last frame of an ease draws the height it ends at, which the observer may not report again.
  eased?.finished.then(() => { if (watching.get(card) === watch) keep(); }, () => {});
  setTimeout(() => { if (watching.get(card) === watch) { watch.disconnect(); watching.delete(card); } }, SETTLING_MS);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "5 Oct" from "2026-10-05". */
export function shortDay(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}` : String(iso ?? '');
}
