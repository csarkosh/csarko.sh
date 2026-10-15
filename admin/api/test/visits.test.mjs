import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createCache } from "../src/cache.mjs";
import { createVisits, sumBy, plainRow, utcDates } from "../src/collectors/visits.mjs";
import { UpstreamError } from "../src/http.mjs";

const rows = JSON.parse(readFileSync(new URL("./fixtures/visits-rows.json", import.meta.url), "utf8"));
const queriesDir = new URL("../queries/", import.meta.url).pathname;

// Each saved SQL file starts with a distinct comment; the fake matches on the file's first line,
// so a test knows which file ran.
function fakeBigQuery(calls = []) {
  const first = (name) => readFileSync(`${queriesDir}${name}.sql`, "utf8").split("\n")[0];
  return {
    async query({ query, params }) {
      const name = Object.keys(rows).find((n) => query.startsWith(first(n)));
      if (!name) throw new Error(`no fixture for query starting ${query.slice(0, 60)}`);
      assert.ok(query.includes("`p.d._AllLogs`") || query.includes("`p.h.goatcounter_history`"), "tables rewritten");
      calls.push({ name, params });
      return [rows[name]];
    },
  };
}

const range = { start: "2026-10-13T00:00:00Z", end: "2026-10-16T00:00:00Z", prevStart: "2026-10-10T00:00:00Z", prevEnd: "2026-10-13T00:00:00Z" };
const make = (opts = {}) => {
  const calls = [];
  const v = createVisits({ bigquery: fakeBigQuery(calls), projectId: "p", dataset: "d", historyDataset: "h", historyUntil: "2026-10-14T00:00:00Z", cache: createCache(), queriesDir, ...opts });
  return { v, calls };
};

test("visits sums live and history rows by day and window, and a row without a visit still counts", async () => {
  const { v, calls } = make();
  const r = await v.visits(range);
  assert.deepEqual(r.current.perDay, [{ day: "2026-10-13", visits: 0, pageviews: null }, { day: "2026-10-14", visits: 6, pageviews: null }, { day: "2026-10-15", visits: 2, pageviews: null }]);
  assert.equal(r.current.visits, 8);
  assert.deepEqual(r.previous.perDay.map((d) => [d.day, d.visits]), [["2026-10-10", 3], ["2026-10-11", 4], ["2026-10-12", 0]]);
  assert.equal(r.previous.visits, 7);
  assert.deepEqual(calls.map((c) => c.name), ["visits", "history-visits"]);
  assert.deepEqual(calls[0].params, { start: range.start, end: range.end, prev_start: range.prevStart, prev_end: range.prevEnd });
  assert.deepEqual(calls[1].params, { ...calls[0].params, until: "2026-10-14T00:00:00Z" });
});

test("history is asked for by each query's own lower bound, as instants", async () => {
  const { v, calls } = make({ historyUntil: "2026-10-11T00:00:00Z" });
  await v.visits(range);
  await v.pages(range);
  assert.deepEqual(calls.map((c) => c.name), ["visits", "history-visits", "pages"]);
});

test("history is not queried when the window starts after the cutover", async () => {
  const { v, calls } = make({ historyUntil: "2026-10-01T00:00:00Z" });
  await v.visits(range);
  assert.deepEqual(calls.map((c) => c.name), ["visits"]);
});

test("pages merge history by path and keep engaged time and reached share from live rows", async () => {
  const { v } = make();
  const r = await v.pages(range);
  assert.deepEqual(r[0], { path: "/", title: "Home", visitors: 16, pageviews: null, engagedMedian: 12, reached: null });
  assert.equal(r[1].reached, 0.5);
});

test("referrers split into referrers (direct as empty name), campaigns and internal paths", async () => {
  const { v } = make();
  const r = await v.referrers(range);
  assert.deepEqual(r.referrers, [{ name: "google.com", visitors: 10 }, { name: "", visitors: 4 }]);
  assert.deepEqual(r.campaigns, [{ campaign: "substack", visitors: 1 }]);
  assert.deepEqual(r.paths, [{ from: "/", to: "/games", visitors: 2 }]);
});

test("events fold history and lift the home-page visitors out of the rows", async () => {
  const { v } = make();
  const r = await v.events(range);
  assert.deepEqual(r.rows, [{ name: "out-github", visitors: 5 }, { name: "read-a", visitors: 1 }]);
  assert.equal(r.homeVisitors, 10);
});

test("audience groups by dimension", async () => {
  const { v } = make();
  const r = await v.audience(range);
  assert.deepEqual(r.themes, [{ name: "dark", visitors: 4 }]);
  assert.deepEqual(r.sizes, []);
});

test("a BigQuery failure is an upstream error, and the same window is cached", async () => {
  const { v, calls } = make();
  await v.audience(range);
  await v.audience(range);
  assert.equal(calls.filter((c) => c.name === "audience").length, 1);
  const broken = createVisits({ bigquery: { async query() { throw new Error("quota"); } }, projectId: "p", dataset: "d", historyDataset: "h", historyUntil: null, cache: createCache(), queriesDir });
  await assert.rejects(broken.audience(range), (e) => e instanceof UpstreamError && /BigQuery audience failed: quota/.test(e.message));
});

test("sumBy and plainRow", () => {
  assert.deepEqual(sumBy([{ k: "a", n: 1 }, { k: "b", n: 5 }, { k: "a", n: 2 }], "k", "n"), [{ k: "b", n: 5 }, { k: "a", n: 3 }]);
  assert.deepEqual(plainRow({ day: { value: "2026-10-14" }, n: 2, s: null }), { day: "2026-10-14", n: 2, s: null });
});

test("utcDates covers every date an hour-aligned window touches, so both windows are the same length", () => {
  assert.deepEqual(utcDates("2026-10-13T00:00:00Z", "2026-10-16T00:00:00Z"), ["2026-10-13", "2026-10-14", "2026-10-15"]);
  assert.equal(utcDates("2026-10-08T14:00:00Z", "2026-10-15T14:00:00Z").length, 8);
  assert.equal(utcDates("2026-10-01T14:00:00Z", "2026-10-08T14:00:00Z").length, 8);
});
