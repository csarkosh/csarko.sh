import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createCache } from "../src/cache.mjs";
import { createVisits, journeyOf, stitchJourneys, sumBy, plainRow, utcDates, zoneDates } from "../src/collectors/visits.mjs";
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
  assert.deepEqual(r.current.perDay, [{ day: "2026-10-13", visits: 0, readers: null, pageviews: null }, { day: "2026-10-14", visits: 6, readers: 2, pageviews: null }, { day: "2026-10-15", visits: 2, readers: 2, pageviews: null }]);
  assert.equal(r.current.visits, 8);
  assert.equal(r.current.readers, 4, "readers from lib-visits' rows only");
  assert.equal(r.current.readersSince, "2026-10-14T00:00:00Z", "the window reaches before the cutover");
  assert.deepEqual(r.previous.perDay.map((d) => [d.day, d.visits]), [["2026-10-10", 3], ["2026-10-11", 4], ["2026-10-12", 0]]);
  assert.equal(r.previous.visits, 7);
  assert.deepEqual(calls.map((c) => c.name), ["visits", "history-visits"]);
  assert.deepEqual(calls[0].params, { start: range.start, end: range.end, prev_start: range.prevStart, prev_end: range.prevEnd, tz: "UTC" }, "UTC when no zone is asked for");
  assert.deepEqual(calls[1].params, { ...calls[0].params, until: "2026-10-14T00:00:00Z" });
});

test("visits cuts its days in the reader's zone: the queries get it, and the dates and the cutover's day are that zone's", async () => {
  const { v, calls } = make();
  const r = await v.visits(range, "America/Los_Angeles");
  assert.equal(calls[0].params.tz, "America/Los_Angeles");
  assert.equal(calls[1].params.tz, "America/Los_Angeles", "the history is re-cut too");
  // 2026-10-13T00:00Z is 5 pm on the 12th in Los Angeles, and the window ends 4:59 pm on the 15th.
  assert.deepEqual(r.current.perDay.map((d) => d.day), ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15"]);
  // The cutover, 2026-10-14T00:00Z, falls on the 13th there: days before it have no readers.
  assert.deepEqual(r.current.perDay.map((d) => d.readers === null), [true, false, false, false]);
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

test("after the cutover every day has its readers, zero included, and no readersSince", async () => {
  const { v } = make({ historyUntil: "2026-10-01T00:00:00Z" });
  const r = await v.visits(range);
  assert.deepEqual(r.current.perDay.map((d) => [d.day, d.visits, d.readers]), [["2026-10-13", 0, 0], ["2026-10-14", 5, 2], ["2026-10-15", 2, 2]]);
  assert.equal(r.current.readers, 4);
  assert.equal(r.current.readersSince, null);
  assert.equal(r.previous.readers, 1);
});

test("journeyOf: a reader engaged 5 s on a page, saw two paths or clicked; a glance did none of them", () => {
  const step = (path, secs, stamp = "2026-10-15T15:32:16Z") => ({ stamp, path, title: "", nt: "navigate", secs, depth: null, reached: false, lcp: null, cls: null, inp: null });
  assert.equal(journeyOf(journeyRow({ steps: [step("/", 4)], last_click: null })).reader, false);
  assert.equal(journeyOf(journeyRow({ steps: [step("/", null)], last_click: null })).reader, false);
  assert.equal(journeyOf(journeyRow({ steps: [step("/", 5)], last_click: null })).reader, true);
  assert.equal(journeyOf(journeyRow({ steps: [step("/", null), step("/apps", null, "2026-10-15T15:32:30Z")], last_click: null })).reader, true);
  assert.equal(journeyOf(journeyRow({ steps: [step("/", null)], last_click: { stamp: "2026-10-15T15:33:00Z", ev: "out-github", u: "https://github.com/csarkosh" } })).reader, true);
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

test("events fold history (its one count stands for visitors and clicks) and lift (home) and (outbound) out of the rows", async () => {
  const { v } = make();
  const r = await v.events(range);
  assert.deepEqual(r.rows, [{ name: "out-github", visitors: 5, clicks: 6 }, { name: "link-example.org", visitors: 1, clicks: 1 }, { name: "read-a", visitors: 1, clicks: 1 }]);
  assert.equal(r.homeVisitors, 10);
  assert.equal(r.outboundVisitors, 5, "the live distinct visitors plus the history's out-* counts");
});

test("journeys come newest first, stitched across the UTC midnight roll, with the device and the suspect flag", async () => {
  const { v } = make();
  const rows = await v.journeys(range);
  assert.equal(rows.length, 2, "three visits, two of them one visitor");
  const [suspect, visit] = rows;
  assert.equal(suspect.started, "2026-10-14T23:59:00Z");
  assert.deepEqual(suspect.device, { browser: "Chrome", version: "148", os: "Windows", viewport: [1024, 768], tz: "UTC", theme: "light", touch: false, lang: "en-US" });
  assert.equal(suspect.suspect, true);
  assert.equal(suspect.stitched, 0);
  assert.deepEqual(suspect.steps[0], { path: "/apps", title: "Apps", at: 0, left: null, secs: null, depth: null, read: null, nav: "navigate", lcp: null, cls: null, inp: null });

  assert.equal(visit.started, "2026-10-14T23:50:00Z");
  assert.deepEqual(visit.source, { kind: "external", host: "google.com", campaign: "substack" });
  assert.equal(visit.stitched, 1);
  assert.equal(visit.suspect, false);
  assert.deepEqual(visit.steps.map((s) => [s.path, s.at, s.left, s.secs, s.read, s.lcp, s.inp]), [["/", 0, 30, 30, null, 200, null], ["/research/x", 30, 790, 600, true, 250, 40], ["/games", 790, 805, 20, null, 300, null]]);
  assert.deepEqual(visit.exit, { kind: "click", event: "play-dayhike", url: "https://games.csarko.sh/dayhike", host: "games.csarko.sh" });
  assert.equal(visit.engaged, 650);
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

test("zoneDates names the dates a window touches in a zone, across a DST change too", () => {
  assert.deepEqual(zoneDates("2026-10-13T00:00:00Z", "2026-10-16T00:00:00Z", "UTC"), utcDates("2026-10-13T00:00:00Z", "2026-10-16T00:00:00Z"));
  assert.deepEqual(zoneDates("2026-10-13T07:00:00Z", "2026-10-14T07:00:00Z", "America/Los_Angeles"), ["2026-10-13"], "a Los Angeles midnight to midnight is one day");
  assert.deepEqual(zoneDates("2026-11-01T07:00:00Z", "2026-11-02T08:00:00Z", "America/Los_Angeles"), ["2026-11-01"], "the 25-hour day DST ends on");
  assert.deepEqual(zoneDates("2026-10-22T03:00:00Z", "2026-10-22T05:00:00Z", "Asia/Kolkata"), ["2026-10-22"]);
});

const journeyRow = (over = {}) => ({
  started: "2026-10-15T15:32:16Z",
  source: { rk: "external", rh: "google.com", rp: null, campaign: null },
  device: { bn: "Safari", bv: 18, os: "iOS", vw: "390", vh: "844", tz: "America/New_York", th: "light", tp: "true", lg: "en-US" },
  steps: [
    { stamp: "2026-10-15T15:32:16Z", path: "/", title: "Home", nt: "navigate", secs: 41, depth: 70, reached: false, lcp: "180.0", cls: "0.0", inp: null },
    { stamp: "2026-10-15T15:32:17Z", path: "/", title: "Home", nt: "navigate", secs: null, depth: null, reached: false, lcp: null, cls: null, inp: null },
    { stamp: "2026-10-15T15:32:57Z", path: "/research/x", title: "X", nt: "navigate", secs: "185", depth: "100", reached: true, lcp: "220.0", cls: "0.02", inp: "30.0" },
  ],
  last_click: { stamp: "2026-10-15T15:36:10Z", ev: "out-github", u: "https://www.github.com/csarkosh" },
  ...over,
});

test("journeyOf keeps a page loaded twice within two seconds once, times each step and its leaving, and names the exit", () => {
  const j = journeyOf(journeyRow());
  assert.deepEqual(j.source, { kind: "external", host: "google.com" });
  assert.deepEqual(j.device, { browser: "Safari", version: "18", os: "iOS", viewport: [390, 844], tz: "America/New_York", theme: "light", touch: true, lang: "en-US" });
  assert.deepEqual(j.steps, [
    { path: "/", title: "Home", at: 0, left: 41, secs: 41, depth: 70, read: null, nav: "navigate", lcp: 180, cls: 0, inp: null },
    { path: "/research/x", title: "X", at: 41, left: 234, secs: 185, depth: 100, read: true, nav: "navigate", lcp: 220, cls: 0.02, inp: 30 },
  ]);
  assert.deepEqual(j.exit, { kind: "click", event: "out-github", url: "https://www.github.com/csarkosh", host: "github.com" });
  assert.equal(j.engaged, 226);
  assert.equal(j.stitched, 0);
  assert.equal(j.suspect, false);
});

test("journeyOf: a reload is the same step with the larger time and depth, a doc not read says so, and the last step leaves at + secs", () => {
  const j = journeyOf(journeyRow({
    steps: [
      { stamp: "2026-10-15T15:32:16Z", path: "/research/x", title: "X", nt: "navigate", secs: 10, depth: 20, reached: false, lcp: "300.0", cls: null, inp: null },
      { stamp: "2026-10-15T15:33:00Z", path: "/research/x", title: "X", nt: "reload", secs: 90, depth: 100, reached: false, lcp: "150.0", cls: "0.1", inp: null },
    ],
    last_click: null,
  }));
  assert.deepEqual(j.steps, [{ path: "/research/x", title: "X", at: 0, left: 90, secs: 90, depth: 100, read: false, nav: "navigate", lcp: 300, cls: 0.1, inp: null }]);
  assert.deepEqual(j.exit, { kind: "left" });
  assert.equal(j.engaged, 90);
});

test("journeyOf: a click before the last view is not the exit, a direct visit has no host, an internal one carries its path, no leave means no engaged time", () => {
  const j = journeyOf(journeyRow({ source: { rk: "direct" }, last_click: { stamp: "2026-10-15T15:32:20Z", ev: "out-x", u: "https://x.com/" } }));
  assert.deepEqual(j.source, { kind: "direct" });
  assert.deepEqual(j.exit, { kind: "left" });
  assert.equal(j.steps.at(-1).left, 226, "at 41 plus 185 engaged seconds");
  const quiet = journeyOf(journeyRow({ steps: [{ stamp: "2026-10-15T15:32:16Z", path: "/", title: "Home", nt: null, secs: null, depth: null, reached: false, lcp: null, cls: null, inp: null }], last_click: null }));
  assert.equal(quiet.engaged, null);
  assert.equal(quiet.steps[0].left, null);
  assert.equal(quiet.steps[0].nav, null);
  assert.equal(quiet.suspect, false, "a New York clock is not suspect");
  assert.deepEqual(journeyOf(journeyRow({ source: { rk: "internal", rp: "/", campaign: "substack" } })).source, { kind: "internal", path: "/", campaign: "substack" });
  const unnamed = journeyOf(journeyRow({ last_click: { stamp: "2026-10-15T15:40:00Z", ev: null, u: "https://example.org/a" } }));
  assert.deepEqual(unnamed.exit, { kind: "click", event: null, url: "https://example.org/a", host: "example.org" });
  assert.equal(unnamed.steps.at(-1).left, 464, "the click's time");
});

test("journeyOf: suspect is a UTC clock with no engaged second on any page; vitals alone do not clear it", () => {
  const utc = { bn: "Chrome", bv: "148", os: "Windows", vw: "1024", vh: "768", tz: "UTC", th: "light", tp: "false", lg: "en-US" };
  const bare = { stamp: "2026-10-15T15:32:16Z", path: "/", title: "Home", nt: "navigate", secs: null, depth: null, reached: false, lcp: null, cls: null, inp: null };
  assert.equal(journeyOf(journeyRow({ device: utc, steps: [bare], last_click: null })).suspect, true);
  assert.equal(journeyOf(journeyRow({ device: utc, steps: [{ ...bare, secs: "0", depth: "100" }], last_click: null })).suspect, true, "a leave of zero seconds");
  assert.equal(journeyOf(journeyRow({ device: utc, steps: [{ ...bare, lcp: "900.0" }], last_click: null })).suspect, true, "vitals are what headless browsers send");
  assert.equal(journeyOf(journeyRow({ device: utc, steps: [{ ...bare, secs: 5 }], last_click: null })).suspect, false);
  assert.equal(journeyOf(journeyRow({ device: { ...utc, tz: "Europe/Rome" }, steps: [bare], last_click: null })).suspect, false, "a real timezone");
});

test("journeyOf: the exit compares raw stamps, so a click half a second after the last view is the exit", () => {
  const j = journeyOf(journeyRow({ steps: [{ stamp: "2026-10-15T15:32:16.900Z", path: "/", title: "Home", secs: 3, depth: 50, reached: false }], last_click: { stamp: "2026-10-15T15:32:17.300Z", ev: "out-github", u: "https://github.com/csarkosh" } }));
  assert.equal(j.exit.kind, "click");
});

const stitchable = (started, over = {}) => ({
  started,
  source: { kind: "direct" },
  device: { browser: "Chrome", version: "155", os: "macOS", viewport: [1544, 1256], tz: "America/New_York", theme: "dark", touch: false, lang: "en-US" },
  steps: [{ path: "/", title: "Home", at: 0, left: 50, secs: 50, depth: 80, read: null, nav: "navigate", lcp: 200, cls: 0, inp: null }],
  exit: { kind: "left" },
  engaged: 50,
  stitched: 0,
  suspect: false,
  ...over,
});
const second = (started, over = {}) => stitchable(started, { source: { kind: "internal", path: "/" }, steps: [{ path: "/games", title: "Games", at: 0, left: 10, secs: 10, depth: 30, read: null, nav: "navigate", lcp: 150, cls: 0, inp: null }], exit: { kind: "click", event: "play-dayhike", url: "https://games.csarko.sh/dayhike", host: "games.csarko.sh" }, engaged: 10, ...over });

test("stitchJourneys joins the half that began, after UTC midnight, on the page the first half left, same device, within 30 minutes", () => {
  const a = stitchable("2026-10-14T23:58:00Z");
  const b = second("2026-10-15T00:01:00Z");
  const out = stitchJourneys([b, a]);
  assert.equal(out.length, 1);
  assert.equal(out[0].started, a.started);
  assert.deepEqual(out[0].steps.map((s) => [s.path, s.at, s.left]), [["/", 0, 180], ["/games", 180, 190]]);
  assert.deepEqual(out[0].exit, b.exit, "the second half's exit");
  assert.equal(out[0].engaged, 60);
  assert.equal(out[0].stitched, 1);
  assert.equal(a.steps[0].left, 50, "the inputs are not changed");

  const joins = (over) => stitchJourneys([second("2026-10-15T00:01:00Z", over), a]).length === 1;
  assert.ok(joins({}));
  assert.ok(!joins({ source: { kind: "internal", path: "/games" } }), "a different page");
  assert.ok(!joins({ source: { kind: "external", host: "csarko.sh" } }), "not from our own page");
  assert.ok(!joins({ device: { ...a.device, viewport: [390, 844] } }), "a different device");
  assert.ok(!joins({ started: "2026-10-15T00:40:00Z" }), "more than 30 minutes after the first one left");
  assert.ok(!joins({ suspect: true }), "a suspect half never joins");
  assert.equal(stitchJourneys([second("2026-10-14T23:59:30Z"), a]).length, 2, "both halves on one UTC day: the hash did not roll, so they are two people");
  assert.deepEqual(stitchJourneys([]), []);
});

test("stitchJourneys picks the nearest first half, and a half already stitched three times takes no more", () => {
  // Two people on the same kind of device: A left / at 23:59:40, B is still on / since 23:58 when
  // midnight rolls and B goes on to /games at 00:01:00. B's first half says it left at 00:01:00.
  const a = stitchable("2026-10-14T23:59:10Z", { steps: [{ ...stitchable("x").steps[0], secs: 30, left: 30 }], engaged: 30 });
  const b1 = stitchable("2026-10-14T23:58:00Z", { steps: [{ ...stitchable("x").steps[0], secs: 180, left: 180 }], engaged: 180 });
  const b2 = second("2026-10-15T00:01:00Z");
  const out = stitchJourneys([b2, a, b1]);
  assert.equal(out.length, 2);
  const joined = out.find((j) => j.stitched === 1);
  assert.equal(joined.started, b1.started, "B's halves are one visit, A stays alone");
  assert.equal(out.find((j) => j.stitched === 0).started, a.started);

  const full = stitchable("2026-10-14T23:58:00Z", { stitched: 3 });
  assert.equal(stitchJourneys([second("2026-10-15T00:01:00Z"), full]).length, 2, "three joins is the cap");
});
