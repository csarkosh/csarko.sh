import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createCache } from "../src/cache.mjs";
import { createGoatCounter, visitsOf, perDayOf, pageRowsOf, eventRowsOf, eventKindOf, outboundRateOf, outboundOf, namedRowsOf } from "../src/collectors/goatcounter.mjs";
import { hourlyRange } from "../src/time.mjs";

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));
const total = fixture("goatcounter-total");
const hits = fixture("goatcounter-hits").hits;

test("stats/total maps to site visits (events excluded) and per-day rows with no pageview figure", () => {
  assert.equal(visitsOf(total), 181);
  const perDay = perDayOf(total);
  assert.equal(perDay.length, 7);
  assert.deepEqual(perDay[0], { day: "2026-10-06", visits: 20, pageviews: null });
  assert.equal(visitsOf({ stats: total.stats }), 181, "falls back to the per-day sum without totals");
});

test("stats/hits splits into pages and events", () => {
  const pages = pageRowsOf(hits);
  assert.deepEqual(pages.map((p) => p.path), ["/", "/research/stylized-shader-looks", "/games", "/docs/old-slug", "/wp-login.php"]);
  assert.deepEqual(pages[0], { path: "/", title: "Cyrus Sarkosh, Senior Software Engineer", visitors: 120, pageviews: null });
  const events = eventRowsOf(hits);
  assert.deepEqual(events.map((e) => [e.name, e.kind, e.visitors]), [
    ["out-linkedin", "out", 18],
    ["out-github", "out", 12],
    ["play-dayhike", "play", 9],
    ["read-stylized-shader-looks", "read", 6],
    ["watch-who-is-standing-in-my-hallway", "watch", 4],
    ["signup", "other", 1],
  ]);
  assert.equal(eventKindOf("/nav-research"), "nav");
  assert.equal(outboundOf(hits), 30);
  assert.equal(outboundRateOf(hits), 30 / 120);
  assert.equal(outboundRateOf(hits.filter((h) => h.path !== "/")), null, "no home-page visitors, no rate");
});

test("a dashboard panel maps to named rows", () => {
  assert.deepEqual(namedRowsOf(fixture("goatcounter-locations").stats), [
    { name: "United States", visitors: 130 },
    { name: "Germany", visitors: 20 },
    { name: "(unknown)", visitors: 5 },
  ]);
});

test("hourlyRange is rounded to the hour and the previous range abuts the current one", () => {
  const r = hourlyRange(7, Date.parse("2026-10-12T15:42:11Z"));
  assert.deepEqual(r, { days: 7, start: "2026-10-05T16:00:00Z", end: "2026-10-12T16:00:00Z", prevStart: "2026-09-28T16:00:00Z", prevEnd: "2026-10-05T16:00:00Z" });
});

test("the client sends the bearer token, caches by URL, paginates hits and backs off once on a 429", async () => {
  let t = 0;
  const calls = [];
  const slept = [];
  const responses = new Map();
  const json = (body, status = 200, headers = {}) => ({ ok: status < 400, status, headers: new Map(Object.entries(headers)), json: async () => body, text: async () => JSON.stringify(body) });
  const fetch = async (url, init) => {
    calls.push({ url, auth: init.headers.authorization });
    const queued = responses.get(url);
    if (queued && queued.length > 0) return queued.shift();
    const u = new URL(url);
    if (u.pathname.endsWith("/stats/hits")) {
      const excluded = u.searchParams.getAll("exclude_paths");
      if (excluded.length === 0) return json({ hits: hits.slice(0, 6), more: true });
      return json({ hits: hits.slice(6), more: false });
    }
    return json(total);
  };
  const gc = createGoatCounter({ site: "csarko", token: "tok", fetch, cache: createCache({ now: () => t }), now: () => t, sleep: async (ms) => { slept.push(ms); t += ms; } });
  assert.equal(gc.configured, true);

  const all = await gc.hits("2026-10-05T16:00:00Z", "2026-10-12T16:00:00Z");
  assert.equal(all.length, hits.length);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].auth, "Bearer tok");
  assert.ok(calls[1].url.includes("exclude_paths=1"), "the second page excludes the ids already seen");

  await gc.total("a", "b");
  await gc.total("a", "b");
  assert.equal(calls.length, 3, "the second total is served from the cache");

  const url = `https://csarko.goatcounter.com/api/v0/stats/toprefs?start=a&end=b&limit=100`;
  responses.set(url, [json({ error: "rate" }, 429, { "x-rate-limit-reset": "3" })]);
  const refs = await gc.page("toprefs", "a", "b");
  assert.equal(refs.length, total.stats.length, "the retry got the default stub's body");
  assert.ok(slept.includes(3000), "waited the X-Rate-Limit-Reset seconds");
});

test("the queue starts at most three requests a second", async () => {
  let t = 0;
  const starts = [];
  const slept = [];
  const fetch = async () => {
    starts.push(t);
    return { ok: true, status: 200, headers: new Map(), json: async () => ({ stats: [] }) };
  };
  const gc = createGoatCounter({ site: "x", token: "t", fetch, cache: createCache({ now: () => t }), now: () => t, sleep: async (ms) => { slept.push(ms); t += ms; } });
  await Promise.all(["a", "b", "c", "d", "e", "f", "g"].map((p) => gc.page(p, "s", "e")));
  assert.deepEqual(starts, [0, 0, 0, 1000, 1000, 1000, 2000]);
});
