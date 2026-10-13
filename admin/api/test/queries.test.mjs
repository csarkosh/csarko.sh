import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createQueries, weeklyTrend, snapshotAgo } from "../src/queries.mjs";
import { createMemoryStore } from "../src/store.mjs";

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));
const NOW = Date.parse("2026-10-12T15:30:00Z");
const TODAY = "2026-10-12";

/** Fakes for every collector: configured ones answer from the fixtures, the rest are switched off. */
function fakes({ gcOn = true, gscOn = true, youtubeOn = false, githubToken = false, psiOn = false } = {}) {
  const total = fixture("goatcounter-total");
  const hits = fixture("goatcounter-hits").hits;
  const prevTotal = { ...total, total: 160, total_events: 10 };
  const log = { error() {}, warn() {}, log() {} };
  return {
    gc: {
      configured: gcOn,
      async total(start) {
        return start < "2026-10-05" ? prevTotal : total;
      },
      async hits(start) {
        return start < "2026-10-05" ? hits.map((h) => ({ ...h, count: Math.floor(h.count / 2) })) : hits;
      },
      async page(name) {
        return name === "toprefs" ? fixture("goatcounter-toprefs").stats : fixture("goatcounter-locations").stats;
      },
    },
    gsc: {
      configured: gscOn,
      async query({ startDate, endDate, dimensions }) {
        // The previous period, whatever its length, gets one row on its first day.
        if (dimensions[0] === "date") return endDate < "2026-10-06" ? [{ keys: [startDate], clicks: 4, impressions: 90, ctr: 0.04, position: 20 }] : fixture("gsc-dates").rows;
        if (dimensions[0] === "query") return [{ keys: ["stylized shader"], clicks: 2, impressions: 30, ctr: 0.066, position: 8 }];
        return [{ keys: ["https://csarko.sh/research/stylized-shader-looks"], clicks: 2, impressions: 30, ctr: 0.066, position: 8 }];
      },
      async indexedOf(urls) {
        return { indexed: urls.length - 1, total: urls.length, missing: [urls.at(-1)] };
      },
      async sitemap() {
        return { lastDownloaded: "2026-10-11T03:00:00Z", errors: 0, warnings: 0 };
      },
    },
    youtube: { configured: youtubeOn, async channel() { return { subscribers: 40, views: 1200, videos: 2, videosList: [] }; } },
    github: {
      configured: githubToken,
      enabled: true,
      owner: "csarkosh",
      async all() {
        return [{ repo: "csarkosh/game-dayhike", stars: 3, forks: 0, watchers: 1, traffic: githubToken ? { views: 20, uniques: 9, clones: 2, referrers: [] } : null }];
      },
    },
    hn: { async mentions() { return { mentions: 0, items: [] }; } },
    psi: { configured: psiOn, async performance() { return { performance: 97, at: "2026-10-12T15:00:00Z" }; } },
    uptime: { async check() { return { up: true, status: 200, ttfbMs: 120, certDaysLeft: 70 }; } },
    hosting: { async lastDeployAt() { return "2026-10-11T20:00:00Z"; } },
    sitemap: { async urls() { return ["https://csarko.sh/", "https://csarko.sh/games", "https://csarko.sh/research/stylized-shader-looks"]; } },
    store: createMemoryStore(),
    config: { sitemapUrl: "https://csarko.sh/sitemap.xml" },
    now: () => NOW,
    log,
  };
}

test("weeklyTrend takes the latest snapshot of each week and zero where there is none", () => {
  const snapshots = [
    { date: "2026-10-12", visits7: 181 },
    { date: "2026-10-11", visits7: 170 },
    { date: "2026-10-04", visits7: 150 },
    { date: "2026-09-30", visits7: 140 },
    { date: "2026-09-25", visits7: 130 },
    { date: "2026-07-25", visits7: 99 },
  ];
  const trend = weeklyTrend(snapshots, "visits7", TODAY);
  assert.equal(trend.length, 12);
  assert.deepEqual(trend.slice(-2), [150, 181], "10-04 outranks 09-30 in the week ending 10-05, and 10-12 outranks 10-11");
  assert.equal(trend[9], 130, "the week ending 09-28");
  assert.equal(trend[0], 99, "the first of the twelve weeks is 07-21 to 07-27");
  assert.deepEqual(trend.slice(1, 9), [0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(weeklyTrend([], "visits7", TODAY), new Array(12).fill(0));
  assert.deepEqual(weeklyTrend([{ date: TODAY, visits7: null }], "visits7", TODAY).at(-1), 0, "a null counter reads as zero");
});

test("snapshotAgo finds the snapshot seven days back or the nearest older within a week", () => {
  const snapshots = [{ date: "2026-10-05" }, { date: "2026-10-03" }, { date: "2026-09-20" }];
  assert.equal(snapshotAgo(snapshots, TODAY, 7).date, "2026-10-05");
  assert.equal(snapshotAgo(snapshots.slice(1), TODAY, 7).date, "2026-10-03");
  assert.equal(snapshotAgo(snapshots.slice(2), TODAY, 7), null);
});

test("kpis assembles the four cards from the sources and the trend from the snapshots", async () => {
  const deps = fakes();
  await deps.store.writeSnapshot("2026-10-05", { visits7: 150, searchClicks7: 3, impressions7: 200, outbound7: 12 });
  await deps.store.writeSnapshot("2026-10-12", { visits7: 181, searchClicks7: 6, impressions7: 300, outbound7: 30 });
  const q = createQueries(deps);
  const body = await q.kpis();
  assert.equal(body.app, "csarko.sh");
  assert.equal(body.at, "2026-10-12T15:30:00.000Z");
  assert.deepEqual(body.kpis.map((k) => [k.key, k.label, k.value, k.prev, k.unit]), [
    ["visits", "Visits, 7 days", 181, 150, ""],
    ["search", "Search clicks, 28 days", 6, 4, ""],
    ["impressions", "Impressions, 28 days", 300, 90, ""],
    ["outbound", "Outbound clicks, 7 days", 30, 15, ""],
  ]);
  for (const k of body.kpis) assert.equal(k.trend.length, 12);
  assert.deepEqual(body.kpis[0].trend.slice(-2), [150, 181]);
  assert.deepEqual(body.kpis[1].trend.slice(-2), [3, 6]);
  assert.deepEqual(body.kpis[3].trend.slice(-2), [12, 30]);
  assert.deepEqual(body.kpis[0].trend.slice(0, 10), new Array(10).fill(0));
  assert.equal(body.health.status, "warning", "one sitemap URL is not indexed and a 404 path has 7 hits");
  assert.match(body.health.note, /1 of 3 pages not indexed/);
  assert.equal(body.notConfigured, undefined);
});

test("kpis with no credentials has null values, zero trends and a notConfigured hint, never a throw", async () => {
  const deps = fakes({ gcOn: false, gscOn: false });
  const body = await createQueries(deps).kpis();
  assert.deepEqual(body.kpis.map((k) => k.value), [null, null, null, null]);
  assert.deepEqual(body.kpis[0].trend, new Array(12).fill(0));
  assert.deepEqual(body.notConfigured, { visits: "GOATCOUNTER_TOKEN", outbound: "GOATCOUNTER_TOKEN", search: "GSC_SA_KEY" });
  assert.equal(body.health.status, "good");
  assert.match(body.health.note, /unknown: lighthouse, indexing, 404s, sitemap fetch/);
});

test("the GoatCounter queries have the contract's shapes", async () => {
  const q = createQueries(fakes());
  const visits = await q.visits(7);
  assert.equal(visits.days, 7);
  assert.equal(visits.from, "2026-10-05T16:00:00Z");
  assert.equal(visits.current.visits, 181);
  assert.equal(visits.previous.visits, 150);
  assert.equal(visits.current.pageviews, null);
  assert.equal(visits.current.perDay.length, 7);

  const pages = await q.pages(7);
  assert.deepEqual(pages.rows.map((r) => [r.path, r.inSitemap]), [["/", true], ["/research/stylized-shader-looks", true], ["/games", true], ["/docs/old-slug", false], ["/wp-login.php", false]]);

  const referrers = await q.referrers(7);
  assert.equal(referrers.groups.length, 7);
  assert.equal(referrers.campaigns[0].campaign, "United States", "the fake answers every panel with the locations fixture");

  const events = await q.events(7);
  assert.equal(events.rows[0].name, "out-linkedin");
  assert.equal(events.outboundRate, 0.25);

  const audience = await q.audience(7);
  assert.deepEqual(Object.keys(audience), ["countries", "sizes", "browsers", "systems", "languages"]);
  assert.equal(audience.countries[0].name, "United States");
});

test("a GoatCounter query without a token says which secret is missing", async () => {
  const q = createQueries(fakes({ gcOn: false }));
  const visits = await q.visits(30);
  assert.equal(visits.current, null);
  assert.deepEqual(visits.notConfigured, { goatcounter: "GOATCOUNTER_TOKEN" });
  assert.deepEqual((await q.pages(7)).notConfigured, { goatcounter: "GOATCOUNTER_TOKEN" });
});

test("search has the lag note, per-day rows for every day, totals, previous, tops, indexed and sitemap", async () => {
  const search = await createQueries(fakes()).search(7);
  assert.equal(search.lag, "Search Console runs 2 to 3 days behind");
  assert.equal(search.perDay.length, 7);
  assert.equal(search.perDay[0].day, "2026-10-06");
  assert.deepEqual(search.totals, { clicks: 6, impressions: 300, ctr: 0.02, position: (18.2 * 120 + 22 * 80 + 15 * 100) / 300 });
  assert.deepEqual(search.previous, { clicks: 4, impressions: 90 });
  assert.equal(search.queries[0].query, "stylized shader");
  assert.deepEqual(search.pages[0], { page: "https://csarko.sh/research/stylized-shader-looks", clicks: 2, impressions: 30 });
  assert.deepEqual(search.indexed, { indexed: 2, total: 3, missing: ["https://csarko.sh/research/stylized-shader-looks"] });
  assert.deepEqual(search.sitemap, { lastDownloaded: "2026-10-11T03:00:00Z", errors: 0, warnings: 0 });
  const off = await createQueries(fakes({ gscOn: false })).search(7);
  assert.equal(off.perDay, null);
  assert.deepEqual(off.notConfigured, { search: "GSC_SA_KEY" });
});

test("reach reports each source, the GitHub traffic hint without a token, and YouTube's prev from the snapshot", async () => {
  const deps = fakes({ youtubeOn: true });
  await deps.store.writeSnapshot("2026-10-05", { youtube: { subscribers: 35, views: 1000 } });
  await deps.store.appendManual("substack", { at: "2026-10-01T00:00:00Z", value: 12 });
  const reach = await createQueries(deps).reach(7);
  assert.deepEqual(reach.youtube.prev, { subscribers: 35, views: 1000 });
  assert.equal(reach.github[0].traffic, null);
  assert.deepEqual(reach.notConfigured, { githubTraffic: "GITHUB_TOKEN" });
  assert.deepEqual(reach.hn, { mentions: 0, items: [] });
  assert.deepEqual(reach.substack.series, [{ at: "2026-10-01T00:00:00Z", value: 12 }]);
  const off = await createQueries(fakes()).reach(7);
  assert.equal(off.youtube, null);
  assert.equal(off.notConfigured.youtube, "YOUTUBE_KEY");
});

test("health reads Lighthouse from the latest snapshot, or runs it once when there is none", async () => {
  const deps = fakes({ psiOn: true });
  const q = createQueries(deps);
  const first = await q.health(7);
  assert.equal(first.lighthousePerformance, 97, "no snapshot yet: live run");
  assert.equal(first.lighthouseAt, "2026-10-12T15:00:00Z");
  assert.equal(first.up, true);
  assert.equal(first.ttfbMs, 120);
  assert.equal(first.certDaysLeft, 70);
  assert.equal(first.lastDeployAt, "2026-10-11T20:00:00Z");
  assert.deepEqual(first.notFound, [{ path: "/docs/old-slug", visitors: 7 }, { path: "/wp-login.php", visitors: 2 }]);
  assert.equal(first.sitemapFetchedAt, "2026-10-11T03:00:00Z");
  assert.deepEqual(first.indexed, { indexed: 2, total: 3 });
  assert.equal(first.indexedAt, "2026-10-12T15:30:00.000Z", "no snapshot yet: inspected live, now");
  assert.equal(first.overall.status, "warning");

  await deps.store.writeSnapshot("2026-10-12", {
    at: "2026-10-12T10:00:00.000Z",
    lighthousePerformance: 91,
    indexed: { indexed: 1, total: 3, missing: ["https://csarko.sh/games", "https://csarko.sh/research/stylized-shader-looks"] },
  });
  deps.psi.performance = async () => { throw new Error("must not run"); };
  deps.gsc.indexedOf = async () => { throw new Error("must not inspect on a request once a snapshot holds the result"); };
  const second = await q.health(7);
  assert.equal(second.lighthousePerformance, 91);
  assert.equal(second.lighthouseAt, "2026-10-12T10:00:00.000Z");
  assert.deepEqual(second.indexed, { indexed: 1, total: 3 }, "the snapshot's inspection, not a live one");
  assert.equal(second.indexedAt, "2026-10-12T10:00:00.000Z");
  assert.match(second.overall.note, /2 of 3 pages not indexed/);

  const search = await q.search(28);
  assert.deepEqual(search.indexed, { indexed: 1, total: 3, missing: ["https://csarko.sh/games", "https://csarko.sh/research/stylized-shader-looks"] }, "search reads the same stored result");
  assert.equal(search.indexedAt, "2026-10-12T10:00:00.000Z");
});

test("snapshot writes today's document with every counter and is idempotent for the day", async () => {
  const deps = fakes({ youtubeOn: true, githubToken: true, psiOn: true });
  const q = createQueries(deps);
  const doc = await q.snapshot();
  assert.equal(doc.date, TODAY);
  assert.equal(doc.at, "2026-10-12T15:30:00.000Z");
  assert.equal(doc.visits7, 181);
  assert.equal(doc.pageviews7, null);
  assert.equal(doc.searchClicks28, 6);
  assert.equal(doc.impressions28, 300);
  assert.equal(doc.searchClicks7, 6);
  assert.equal(doc.outbound7, 30);
  assert.deepEqual(doc.youtube, { subscribers: 40, views: 1200 });
  assert.deepEqual(doc.github, { "csarkosh/game-dayhike": { stars: 3, views14: 20, uniques14: 9, clones14: 2 } });
  assert.equal(doc.lighthousePerformance, 97);
  assert.deepEqual(doc.indexed, { indexed: 2, total: 3, missing: ["https://csarko.sh/research/stylized-shader-looks"] }, "the sitemap is inspected here, once a day");
  assert.equal(doc.up, true);
  assert.equal(doc.ttfbMs, 120);
  assert.equal(doc.notConfigured, undefined);
  const again = await q.snapshot();
  assert.equal((await deps.store.listSnapshots("2026-01-01", "2026-12-31")).length, 1);
  assert.deepEqual(again, doc);

  const partial = await createQueries(fakes({ gcOn: false })).snapshot();
  assert.equal(partial.visits7, null);
  assert.equal(partial.outbound7, null);
  assert.deepEqual(partial.notConfigured, { visits: "GOATCOUNTER_TOKEN", events: "GOATCOUNTER_TOKEN", youtube: "YOUTUBE_KEY", lighthouse: "PSI_KEY" });
});

test("manual appends with the time and the store caps the series", async () => {
  const deps = fakes();
  const q = createQueries(deps);
  const r = await q.manual("substack", 12);
  assert.deepEqual(r, { ok: true, at: "2026-10-12T15:30:00.000Z" });
  for (let i = 0; i < 450; i += 1) await deps.store.appendManual("substack", { at: "x", value: i });
  assert.equal((await deps.store.getManual("substack")).length, 400);
});
