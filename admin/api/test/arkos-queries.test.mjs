import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createCache } from "../src/cache.mjs";
import { createArkos } from "../src/collectors/arkos.mjs";
import { createArkosQueries, dayRange, isArkosQueryName, ARKOS_QUERY_NAMES } from "../src/arkos-queries.mjs";

const rows = JSON.parse(readFileSync(new URL("./fixtures/arkos-rows.json", import.meta.url), "utf8"));
const queriesDir = new URL("../queries/", import.meta.url).pathname;
const NOW = Date.parse("2026-10-17T15:30:00Z");
const log = { error() {}, warn() {}, log() {} };

// As in visits.test.mjs: each saved SQL file starts with a distinct comment, so the fake knows which file ran.
function fakeBigQuery(calls, { fail = false } = {}) {
  const first = (name) => readFileSync(`${queriesDir}${name}.sql`, "utf8").split("\n")[0];
  return {
    async query({ query, params }) {
      const name = Object.keys(rows).find((n) => query.startsWith(first(n)));
      if (!name) throw new Error(`no fixture for query starting ${query.slice(0, 60)}`);
      assert.ok(query.includes("`p.d._AllLogs`") && !query.includes("csarko-sh.csarko_visits"), "table rewritten");
      calls.push({ name, params });
      if (fail) throw new Error("quota");
      return [rows[name]];
    },
  };
}

const make = ({ dataset = "d", fail = false } = {}) => {
  const calls = [];
  const arkos = createArkos({ bigquery: dataset ? fakeBigQuery(calls, { fail }) : null, projectId: "p", dataset, cache: createCache({ now: () => NOW }), queriesDir });
  return { q: createArkosQueries({ arkos, now: () => NOW, log }), calls };
};

test("the four query names", () => {
  assert.deepEqual(ARKOS_QUERY_NAMES, ["installs", "journey", "sessions", "crashes"]);
  assert.ok(isArkosQueryName("journey"));
  assert.ok(!isArkosQueryName("visits"));
});

test("Macs are counted over whole UTC days ending today; days=1 is today against yesterday", () => {
  assert.deepEqual(dayRange(7, NOW), {
    days: 7, startDate: "2026-10-11", endDate: "2026-10-17", prevStartDate: "2026-10-04", prevEndDate: "2026-10-10",
    start: "2026-10-11T00:00:00Z", end: "2026-10-18T00:00:00Z", prevStart: "2026-10-04T00:00:00Z",
  });
  const one = dayRange(1, NOW);
  assert.deepEqual([one.start, one.end, one.prevStart], ["2026-10-17T00:00:00Z", "2026-10-18T00:00:00Z", "2026-10-16T00:00:00Z"]);
});

test("installs runs arkos-installs.sql over the day range and shapes it", async () => {
  const { q, calls } = make();
  const r = await q.installs(7);
  assert.deepEqual(calls, [{ name: "arkos-installs", params: { start: "2026-10-11T00:00:00Z", end: "2026-10-18T00:00:00Z", prev_start: "2026-10-04T00:00:00Z" } }]);
  assert.deepEqual([r.from, r.to, r.current.active, r.current.perDay.length, r.previous.perDay.length], ["2026-10-11", "2026-10-17", 5, 7, 7]);
});

test("journey and sessions share one cached job over the last days times 24 hours; journey adds the counts", async () => {
  const { q, calls } = make();
  const j = await q.journey(7);
  const s = await q.sessions(7);
  assert.deepEqual(calls.map((c) => c.name).sort(), ["arkos-session-counts", "arkos-sessions"]);
  const window = { start: "2026-10-10T16:00:00Z", end: "2026-10-17T16:00:00Z" };
  assert.deepEqual(calls.find((c) => c.name === "arkos-sessions").params, window);
  assert.deepEqual(calls.find((c) => c.name === "arkos-session-counts").params, { ...window, prev_start: "2026-10-03T16:00:00Z" });
  assert.equal(j.days, 7);
  assert.equal(j.sessions, 5);
  assert.deepEqual(j.previous, { sessions: 3 });
  assert.equal(j.capped, false);
  assert.equal(s.rows.length, 5);
  assert.equal(s.rows[0].received, "2026-10-17T14:05:12Z");
});

test("crashes joins crash reports with the session counts", async () => {
  const { q, calls } = make();
  const c = await q.crashes(30);
  assert.deepEqual(calls.map((x) => x.name).sort(), ["arkos-crashes", "arkos-session-counts"]);
  assert.equal(calls[0].params.prev_start, "2026-08-18T16:00:00Z");
  assert.deepEqual([c.total, c.previous, c.sessions, c.lost, c.groups.length], [3, 1, 5, 1, 2]);
});

test("kpis: twelve weeks of days ending today, the last 24 hours for the health rule", async () => {
  const { q, calls } = make();
  const k = await q.kpis();
  assert.deepEqual(calls, [{ name: "arkos-kpis", params: { start: "2026-07-26T00:00:00Z", end: "2026-10-18T00:00:00Z", since: "2026-10-16T16:00:00Z" } }]);
  assert.equal(k.app, "ide-arkos");
  assert.equal(k.at, "2026-10-17T15:30:00.000Z");
  assert.deepEqual(k.kpis.map((x) => x.value), [8, 4, 200, 98.5]);
  assert.equal(k.notConfigured, undefined);
});

test("kpis that fail keep the card: null values, the error under visits, a warning dot", async () => {
  const { q } = make({ fail: true });
  const k = await q.kpis();
  assert.deepEqual(k.kpis.map((x) => [x.value, x.prev, x.trend.length]), [[null, null, 12], [null, null, 12], [null, null, 12], [null, null, 12]]);
  assert.match(k.errors.visits, /BigQuery arkos-kpis failed: quota/);
  assert.equal(k.health.status, "warning");
});

test("a failing query throws for the route to answer 502", async () => {
  const { q } = make({ fail: true });
  await assert.rejects(q.journey(7), { name: "UpstreamError", message: "BigQuery arkos-sessions failed: quota" });
});

test("without VISITS_DATASET every part is null with notConfigured.visits, and nothing runs", async () => {
  const { q, calls } = make({ dataset: "" });
  const hint = { visits: "VISITS_DATASET" };
  const installs = await q.installs(7);
  assert.deepEqual(installs, { days: 7, from: "2026-10-11", to: "2026-10-17", current: null, previous: null, rhythm: null, versions: null, macos: null, arch: null, notConfigured: hint });
  const journey = await q.journey(30);
  assert.equal(journey.days, 30);
  assert.deepEqual(journey.notConfigured, hint);
  for (const key of ["sessions", "firstSessions", "previous", "capped", "paths", "milestones", "next", "features", "focus", "lengths", "ends", "errorEvents", "notices", "dropped", "rejected", "rhythm", "cohorts"]) assert.equal(journey[key], null, key);
  assert.deepEqual(await q.sessions(7), { rows: null, notConfigured: hint });
  assert.deepEqual(await q.crashes(7), { total: null, previous: null, sessions: null, lost: null, byVersion: null, groups: null, notConfigured: hint });
  const k = await q.kpis();
  assert.ok(k.kpis.every((x) => x.value === null && x.prev === null && x.trend.length === 12));
  assert.deepEqual(k.notConfigured, { visits: "VISITS_DATASET", active: "VISITS_DATASET", new: "VISITS_DATASET", sessions: "VISITS_DATASET", crashfree: "VISITS_DATASET" });
  assert.deepEqual(k.health, { status: "warning", note: "Not configured (VISITS_DATASET)" });
  assert.deepEqual(calls, []);
});
