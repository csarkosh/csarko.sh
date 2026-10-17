/**
 * The site's own analytics: lib-visits rows in BigQuery through Log Analytics
 * (`csarko_visits._AllLogs`), and GoatCounter's history in `csarko_history`
 * for windows that reach before the cutover. Each query is a saved SQL file
 * under `queries/`, with `@start`, `@end`, `@prev_start`, `@prev_end` as
 * string parameters the SQL casts to TIMESTAMP; one job a query, cached five
 * minutes by name and window. History rows are merged in code (summed by
 * day, path or name), each query reading one dataset.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { UpstreamError } from "../http.mjs";

const LIVE_TABLE = /`csarko-sh\.csarko_visits\._AllLogs`/g;
const HISTORY_TABLE = /`csarko-sh\.csarko_history\.goatcounter_history`/g;

/**
 * Runs a saved SQL file by name with string parameters, its table names
 * rewritten to the configured datasets, as plain rows; cached `ttlMs` by
 * name and parameters. The arkos collector runs its files through this too.
 */
export function createRunner({ bigquery, projectId, dataset, historyDataset, cache, ttlMs = 300_000, queriesDir = join(process.cwd(), "queries") }) {
  const sqlOf = (name) => {
    const sql = readFileSync(join(queriesDir, `${name}.sql`), "utf8");
    return sql.replace(LIVE_TABLE, `\`${projectId}.${dataset}._AllLogs\``).replace(HISTORY_TABLE, `\`${projectId}.${historyDataset}.goatcounter_history\``);
  };

  return async function run(name, params) {
    const key = `visits:${name}:${JSON.stringify(params)}`;
    return cache.get(key, ttlMs, async () => {
      try {
        const [rows] = await bigquery.query({ query: sqlOf(name), params, useLegacySql: false });
        return rows.map(plainRow);
      } catch (error) {
        throw new UpstreamError(`BigQuery ${name} failed: ${error?.message ?? error}`, { cause: error });
      }
    });
  };
}

export function createVisits({ bigquery, projectId, dataset, historyDataset, historyUntil, cache, now = Date.now, log = console, ttlMs = 300_000, queriesDir = join(process.cwd(), "queries") }) {
  const run = createRunner({ bigquery, projectId, dataset, historyDataset, cache, ttlMs, queriesDir });

  const wantsHistory = (bound) => Boolean(historyDataset && historyUntil && Date.parse(bound) < Date.parse(historyUntil));
  const hist = (name, params) => run(name, { ...params, until: historyUntil });
  const win = (range) => ({ start: range.start, end: range.end, prev_start: range.prevStart, prev_end: range.prevEnd });

  return {
    get configured() {
      return Boolean(bigquery && dataset);
    },

    async visits(range) {
      const live = await run("visits", win(range));
      const rows = wantsHistory(range.prevStart) ? [...live, ...(await hist("history-visits", win(range)))] : live;
      // Every UTC date the window touches, zeros included: the dashboard lines the
      // previous window up with the current one by index, and both span the same dates.
      const shape = (w, from, to) => {
        const byDay = new Map();
        for (const r of rows) if (r.win === w) byDay.set(r.day, (byDay.get(r.day) ?? 0) + Number(r.visits));
        const perDay = utcDates(from, to).map((day) => ({ day, visits: byDay.get(day) ?? 0, pageviews: null }));
        return { visits: perDay.reduce((n, d) => n + d.visits, 0), pageviews: null, perDay };
      };
      return { current: shape("current", range.start, range.end), previous: shape("previous", range.prevStart, range.prevEnd) };
    },

    async pages(range) {
      const live = await run("pages", { start: range.start, end: range.end });
      const rows = live.map((r) => ({ path: r.path, title: r.title ?? "", visitors: Number(r.visitors), pageviews: null, engagedMedian: r.engaged_median === null || r.engaged_median === undefined ? null : Number(r.engaged_median), reached: r.reached === null || r.reached === undefined ? null : Number(r.reached) }));
      if (!wantsHistory(range.start)) return rows;
      const history = await hist("history-pages", { start: range.start, end: range.end });
      return sumBy([...rows, ...history.map((r) => ({ path: r.path, title: r.title ?? "", visitors: Number(r.visitors), pageviews: null, engagedMedian: null, reached: null }))], "path", "visitors");
    },

    async referrers(range) {
      const live = await run("referrers", { start: range.start, end: range.end });
      const all = wantsHistory(range.start) ? [...live, ...(await hist("history-referrers", { start: range.start, end: range.end }))] : live;
      const of = (kind) => all.filter((r) => r.kind === kind);
      return {
        referrers: sumBy(of("referrer").map((r) => ({ name: r.name ?? "", visitors: Number(r.visitors) })), "name", "visitors"),
        campaigns: of("campaign").map((r) => ({ campaign: r.name, visitors: Number(r.visitors) })),
        paths: of("internal").map((r) => ({ from: r.name, to: r.target, visitors: Number(r.visitors) })),
      };
    },

    // Each name with its distinct visits and its clicks (events.sql); GoatCounter's history has one
    // count a name, which stands for both. "(home)" and "(outbound)" are lifted out: the home page's
    // visitors, and the distinct visits that clicked any out-* or link-* (summed from the history's
    // out-* rows, the closest it has).
    async events(range) {
      const live = await run("events", { start: range.start, end: range.end });
      const liveRows = live.map((r) => ({ name: r.name, visitors: Number(r.visitors), clicks: Number(r.clicks) }));
      const historyRows = wantsHistory(range.start) ? (await hist("history-events", { start: range.start, end: range.end })).map((r) => ({ name: r.name, visitors: Number(r.visitors), clicks: Number(r.visitors) })) : [];
      const rows = sumBy([...liveRows, ...historyRows], "name", "visitors", "clicks");
      const lifted = (name) => rows.find((r) => r.name === name)?.visitors ?? 0;
      const outboundVisitors = lifted("(outbound)") + historyRows.filter((r) => r.name.startsWith("out-")).reduce((n, r) => n + r.visitors, 0);
      return { rows: rows.filter((r) => !r.name.startsWith("(")), homeVisitors: lifted("(home)"), outboundVisitors };
    },

    // The most recent visits as journeys (journeys.sql), consecutive ones of the same visitor
    // stitched back together. lib-visits rows only: GoatCounter's history holds no visit's
    // sequence, so nothing before the cutover can be shown.
    async journeys(range) {
      const rows = await run("journeys", { start: range.start, end: range.end });
      return stitchJourneys(rows.map(journeyOf));
    },

    async audience(range) {
      const rows = await run("audience", { start: range.start, end: range.end });
      const out = { countries: [], sizes: [], browsers: [], systems: [], languages: [], themes: [], viewports: [], touch: [], timezones: [] };
      for (const r of rows) if (out[r.dim]) out[r.dim].push({ name: String(r.name), visitors: Number(r.visitors) });
      return out;
    },
  };
}

const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
const flag = (v) => v === true || v === "true";
const maxOf = (a, b) => (a === null ? b : b === null ? a : Math.max(a, b));
/** The only pages with a `data-read-end` marker, so the only ones whose `read` means anything. */
const READ_PATH = /^\/research\/[^/]+$/;
const STITCH_GAP_MS = 30 * 60_000;
const secondsFrom = (startedMs, stamp) => Math.max(0, Math.round((Date.parse(stamp) - startedMs) / 1000));

/**
 * One journeys.sql row as the API's journey (the shape is in admin/CONTRACT.md under `journeys`).
 * `steps` are the visit's views in order; a page loaded again within two seconds, or by a reload
 * (`nt='reload'`), is the same step with the larger engaged time and depth. `at` is seconds from the
 * first view; `left` is when the visitor left that page, in the same seconds: the next step's `at`,
 * else the exit click's time, else `at + secs` when the page sent a leave, else null. `read` is the
 * leave's reached-the-end, and only on a /research/<slug> page (null elsewhere). `exit` is the last
 * outbound click when it came on or after the last view, else { kind: "left" }. `engaged` sums the
 * known `secs` (null with none). `suspect` marks a visit that looks like automation: a UTC clock, no
 * leave and no vitals from any page. `stitched` is 0 here; stitchJourneys() counts the visits it
 * joined onto this one.
 */
export function journeyOf(row) {
  const r = plainRow(row);
  const started = Date.parse(r.started);
  const steps = [];
  let lastStampMs = started;
  for (const raw of r.steps ?? []) {
    const s = plainRow(raw);
    lastStampMs = Math.max(lastStampMs, Date.parse(s.stamp) || started);
    const step = {
      path: s.path,
      title: s.title ?? "",
      at: secondsFrom(started, s.stamp),
      left: null,
      secs: num(s.secs),
      depth: num(s.depth),
      read: READ_PATH.test(s.path ?? "") ? flag(s.reached) : null,
      nav: s.nt ?? null,
      lcp: num(s.lcp),
      cls: num(s.cls),
      inp: num(s.inp),
    };
    const prev = steps[steps.length - 1];
    if (prev && prev.path === step.path && (step.at - prev.at <= 2 || step.nav === "reload")) {
      prev.secs = maxOf(prev.secs, step.secs);
      prev.depth = maxOf(prev.depth, step.depth);
      prev.read = prev.read === null ? null : prev.read || step.read;
      prev.lcp = prev.lcp ?? step.lcp;
      prev.cls = prev.cls ?? step.cls;
      prev.inp = prev.inp ?? step.inp;
      continue;
    }
    steps.push(step);
  }
  const src = plainRow(r.source ?? {});
  const source = { kind: src.rk === "external" ? "external" : src.rk === "internal" ? "internal" : "direct" };
  if (source.kind === "external") source.host = src.rh ?? "(unknown)";
  if (source.kind === "internal" && src.rp) source.path = src.rp;
  if (src.campaign) source.campaign = src.campaign;
  const d = plainRow(r.device ?? {});
  const device = { browser: d.bn ?? null, version: d.bv === null || d.bv === undefined ? null : String(d.bv), os: d.os ?? null, viewport: [num(d.vw), num(d.vh)], tz: d.tz ?? null, theme: d.th ?? null, touch: flag(d.tp), lang: d.lg ?? null };
  const click = r.last_click ? plainRow(r.last_click) : null;
  let exit = { kind: "left" };
  // The raw stamps: a rounded `at` would call a click half a second after the last view earlier than it.
  if (click && Date.parse(click.stamp) >= lastStampMs) {
    let host = null;
    try { host = new URL(click.u).host.replace(/^www\./, ""); } catch { /* a path-only url keeps no host */ }
    exit = { kind: "click", event: click.ev ?? null, url: click.u ?? null, host };
  }
  steps.forEach((s, i) => {
    if (i + 1 < steps.length) s.left = steps[i + 1].at;
    else if (exit.kind === "click") s.left = Math.max(s.at, secondsFrom(started, click.stamp));
    else if (s.secs !== null) s.left = s.at + s.secs;
  });
  return { started: r.started, source, device, steps, exit, engaged: engagedOf(steps), stitched: 0, suspect: suspectOf(device, steps) };
}

const engagedOf = (steps) => {
  const timed = steps.filter((s) => s.secs !== null);
  return timed.length ? timed.reduce((n, s) => n + s.secs, 0) : null;
};
// Headless browsers do send leaves and vitals, so the tell is a UTC clock with no engaged second on any page.
const suspectOf = (device, steps) => device.tz === "UTC" && !steps.some((s) => s.secs > 0);
const sameDevice = (a, b) => a.browser === b.browser && a.version === b.version && a.os === b.os && a.tz === b.tz && String(a.viewport) === String(b.viewport);
const STITCH_MAX = 3;   // visits joined onto one, at most
const STEP_CAP = 40;    // journeys.sql's cap on steps a visit
const utcDay = (ms) => new Date(ms).toISOString().slice(0, 10);

/**
 * Consecutive journeys of one visitor joined back into one. The collector's visit hash rolls at
 * UTC midnight, so a visit under way then shows up as two: the second starts from one of the
 * site's own pages (source.kind 'internal', source.path the page the first one ended on), on the
 * same device (browser, version, os, viewport, tz), its first view on a later UTC date than the
 * first one's last view, within 30 minutes of when the first one left its last page (`left`,
 * else `at`). Of several candidates the nearest wins; a suspect journey never joins; a journey
 * takes at most three others and forty steps. The second's steps go onto the first with `at` and
 * `left` moved by the real gap between the two starts, the first's last step now left at the
 * second's first `at`; the first takes the second's exit, adds its engaged seconds and counts it
 * in `stitched`. Takes and gives journeys newest first.
 */
export function stitchJourneys(journeys) {
  const out = [];
  for (const j of [...journeys].sort((a, b) => Date.parse(a.started) - Date.parse(b.started))) {
    const startedMs = Date.parse(j.started);
    let onto = null;
    let nearest = Infinity;
    if (j.source.kind === "internal" && j.source.path && j.steps.length && !j.suspect) {
      for (const a of out) {
        const last = a.steps[a.steps.length - 1];
        if (!last || a.suspect || last.path !== j.source.path || !sameDevice(a.device, j.device)) continue;
        if (a.stitched >= STITCH_MAX || a.steps.length + j.steps.length > STEP_CAP) continue;
        const aStarted = Date.parse(a.started);
        if (utcDay(aStarted + last.at * 1000) === utcDay(startedMs)) continue;
        const gap = startedMs - (aStarted + (last.left ?? last.at) * 1000);
        if (gap < -2000 || gap > STITCH_GAP_MS || gap >= nearest) continue;
        nearest = gap;
        onto = a;
      }
    }
    if (!onto) {
      out.push({ ...j, steps: j.steps.map((s) => ({ ...s })) });
      continue;
    }
    const gap = Math.round((startedMs - Date.parse(onto.started)) / 1000);
    onto.steps[onto.steps.length - 1].left = gap + j.steps[0].at;
    for (const s of j.steps) onto.steps.push({ ...s, at: s.at + gap, left: s.left === null ? null : s.left + gap });
    onto.exit = j.exit;
    onto.engaged = onto.engaged === null && j.engaged === null ? null : (onto.engaged ?? 0) + (j.engaged ?? 0);
    onto.stitched += 1 + j.stitched;
    onto.suspect = suspectOf(onto.device, onto.steps);
  }
  return out.reverse();
}

/** Rows with the same `key` folded into one, their `field` (and any `more` fields) summed, highest `field` first. */
export function sumBy(rows, key, field, ...more) {
  const map = new Map();
  for (const r of rows) {
    const k = r[key];
    const seen = map.get(k);
    if (seen) for (const f of [field, ...more]) seen[f] += r[f];
    else map.set(k, { ...r });
  }
  return [...map.values()].sort((a, b) => b[field] - a[field]);
}

/** The UTC dates (`YYYY-MM-DD`) that the instants [from, to) touch, oldest first. */
export function utcDates(from, to) {
  const out = [];
  for (let t = Date.parse(`${from.slice(0, 10)}T00:00:00Z`); t < Date.parse(to); t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

/** BigQuery wraps dates, timestamps and big numbers in objects with `value`; the API wants plain values. */
export function plainRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) out[k] = v !== null && typeof v === "object" && "value" in v ? v.value : v;
  return out;
}
