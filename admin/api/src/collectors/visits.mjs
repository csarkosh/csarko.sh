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

export function createVisits({ bigquery, projectId, dataset, historyDataset, historyUntil, cache, now = Date.now, log = console, ttlMs = 300_000, queriesDir = join(process.cwd(), "queries") }) {
  const sqlOf = (name) => {
    const sql = readFileSync(join(queriesDir, `${name}.sql`), "utf8");
    return sql.replace(LIVE_TABLE, `\`${projectId}.${dataset}._AllLogs\``).replace(HISTORY_TABLE, `\`${projectId}.${historyDataset}.goatcounter_history\``);
  };

  async function run(name, params) {
    const key = `visits:${name}:${JSON.stringify(params)}`;
    return cache.get(key, ttlMs, async () => {
      try {
        const [rows] = await bigquery.query({ query: sqlOf(name), params, useLegacySql: false });
        return rows.map(plainRow);
      } catch (error) {
        throw new UpstreamError(`BigQuery ${name} failed: ${error?.message ?? error}`, { cause: error });
      }
    });
  }

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

    async events(range) {
      const live = await run("events", { start: range.start, end: range.end });
      const all = wantsHistory(range.start) ? [...live, ...(await hist("history-events", { start: range.start, end: range.end }))] : live;
      const rows = sumBy(all.map((r) => ({ name: r.name, visitors: Number(r.visitors) })), "name", "visitors");
      const home = rows.find((r) => r.name === "(home)");
      return { rows: rows.filter((r) => r.name !== "(home)"), homeVisitors: home ? home.visitors : 0 };
    },

    async audience(range) {
      const rows = await run("audience", { start: range.start, end: range.end });
      const out = { countries: [], sizes: [], browsers: [], systems: [], languages: [], themes: [], viewports: [], touch: [], timezones: [] };
      for (const r of rows) if (out[r.dim]) out[r.dim].push({ name: String(r.name), visitors: Number(r.visitors) });
      return out;
    },
  };
}

/** Rows with the same `key` folded into one, their `field` summed, highest first. */
export function sumBy(rows, key, field) {
  const map = new Map();
  for (const r of rows) {
    const k = r[key];
    const seen = map.get(k);
    if (seen) seen[field] += r[field];
    else map.set(k, { ...r });
  }
  return [...map.values()].sort((a, b) => b[field] - a[field]);
}

/** BigQuery wraps dates, timestamps and big numbers in objects with `value`; the API wants plain values. */
/** The UTC dates (`YYYY-MM-DD`) that the instants [from, to) touch, oldest first. */
export function utcDates(from, to) {
  const out = [];
  for (let t = Date.parse(`${from.slice(0, 10)}T00:00:00Z`); t < Date.parse(to); t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

export function plainRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) out[k] = v !== null && typeof v === "object" && "value" in v ? v.value : v;
  return out;
}
