// admin/api/test/donate-prices.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { TIERS, CUSTOM, TIER_KEYS, DOORS, doorOf, doorByKey, shippedDoors, DONATE_URL, PRICES_URL, DONATE_FROM, WINDOW_DAYS, REPRICE_DAYS, KEEP_DAYS, GCP_LAG_DAYS } from "../src/donate/doors.mjs";
import { windowOf, poolOf, priceOf, pricesOf, decide } from "../src/donate/prices.mjs";

test("three tiers at 1, 3 and 10 percent, then the custom row", () => {
  assert.deepEqual(TIERS.map((t) => [t.key, t.name, t.share]), [["prompt", "A prompt", 0.01], ["context", "A long context window", 0.03], ["run", "A whole agent run", 0.1]]);
  assert.deepEqual(CUSTOM, { key: "own", name: "Your own number", minimumUsd: 1 });
  assert.deepEqual(TIER_KEYS, ["prompt", "context", "run", "own"]);
});

test("a $287.40 bill gives $3, $9 and $29, labelled about n%", () => {
  assert.deepEqual(pricesOf(287.4).map((p) => [p.tier, p.usd, p.label]), [["prompt", 3, "about 1%"], ["context", 9, "about 3%"], ["run", 29, "about 10%"]]);
  assert.equal(priceOf(300, 0.01), 3, "an exact dollar is not rounded up to the next");
  assert.equal(priceOf(0, 0.1), 1, "the floor");
});

test("the window is the 30 days ending yesterday", () => {
  assert.deepEqual([DONATE_FROM, WINDOW_DAYS, REPRICE_DAYS, KEEP_DAYS], ["2026-10-31", 30, 7, 35]);
  assert.deepEqual(windowOf("2026-10-31"), { from: "2026-10-01", to: "2026-10-30" });
  assert.deepEqual(windowOf("2026-03-01"), { from: "2026-01-30", to: "2026-02-28" });
});

test("the pool is the window's daily rows less the commercial project, never negative", () => {
  const w = { from: "2026-10-01", to: "2026-10-30" };
  const rows = [
    { day: "2026-10-01", provider: "aws", line: "BoxUsage:g4dn.xlarge", amount: 200 },
    { day: "2026-10-30", provider: "gcp", where: "csarko-sh", service: "Cloud Run", amount: 87.4 },
    { day: "2026-09-30", provider: "aws", line: "BoxUsage:g4dn.xlarge", amount: 999 },
    { day: "2026-10-31", provider: "aws", line: "BoxUsage:g4dn.xlarge", amount: 999 },
    { month: "2026-10", provider: "aws", line: "BoxUsage:g4dn.xlarge", amount: 999 },
    { day: "2026-10-15", provider: "gcp", where: "magicpixel-487014", service: "Compute Engine", amount: 50, project: "commercial" },
  ];
  assert.equal(poolOf(rows, w), 287.4);
  assert.equal(poolOf([{ day: "2026-10-12", provider: "gcp", where: "csarko-sh", amount: -12 }], w), 0);
  assert.deepEqual(pricesOf(0).map((p) => p.usd), [1, 1, 1]);
});

test("the doors: seven, their URLs and sources, all shipped", () => {
  assert.deepEqual(DOORS.map((d) => [d.door, d.slug, d.path]), [
    ["arkos", "ide-arkos", "/arkos"], ["macstats", "app-macstats", "/macstats"], ["visits", "lib-visits", "/visits"],
    ["last-trail", "the-last-trail", "/last-trail"], ["hallway", "who-is-standing-in-my-hallway", "/hallway"], ["all", null, "/"], ["dayhike", "day-hike", "/dayhike"],
  ]);
  assert.deepEqual(shippedDoors().map((d) => d.door), ["arkos", "macstats", "visits", "last-trail", "hallway", "all", "dayhike"]);
  assert.equal(doorOf("ide-arkos").door, "arkos");
  assert.equal(doorOf("nope"), null);
  assert.equal(doorByKey("all").picture.source, "donate/body-of-work.png");
  assert.equal(doorByKey("last-trail").picture.focusY, 0.42);
  assert.deepEqual(doorByKey("dayhike").picture, { source: "donate/day-hike.png" });
  for (const d of DOORS) {
    assert.equal(d.captions.length, 3, d.door);
    assert.ok(d.headline && d.lead && d.thanks && d.back.label && d.back.href.startsWith("https://"), d.door);
    assert.ok(!/—|@/.test(JSON.stringify(d)), `${d.door}: no em-dash, no address`);
  }
  assert.equal(doorByKey("arkos").lead, "Arkos is free. If it saved you a few hours, cover a slice of the cloud bill that builds it and everything else here.");
  assert.equal(DONATE_URL, "https://donate.csarko.sh");
  assert.equal(PRICES_URL, "https://storage.googleapis.com/csarko-sh-donate-prices/prices.json");
});

const DOORS2 = ["arkos", "all"];
const at = (repricedOn, doors = DOORS2) => ({ period: { from: "x", to: "y", repricedOn }, doors });
const W = (today) => windowOf(today);

test("decide: a first run, done until seven days on, then a new period; a door added between turns", () => {
  assert.deepEqual(decide({ today: "2026-10-31", current: null, doors: DOORS2 }), { run: true, reason: "new period", window: W("2026-10-31"), newPeriod: true, pending: DOORS2 });
  assert.deepEqual(decide({ today: "2026-11-06", current: at("2026-10-31"), doors: DOORS2 }), { run: false, reason: "done", window: W("2026-11-06"), newPeriod: false, pending: [] });
  assert.deepEqual(decide({ today: "2026-11-07", current: at("2026-10-31"), doors: DOORS2 }), { run: true, reason: "new period", window: W("2026-11-07"), newPeriod: true, pending: DOORS2 });
  assert.deepEqual(decide({ today: "2026-11-03", current: at("2026-10-31", ["arkos"]), doors: ["arkos", "all", "dayhike"] }), { run: true, reason: "doors added", window: W("2026-11-03"), newPeriod: false, pending: ["all", "dayhike"] });
});

test("decide: a failed provider holds a due turn up to three days late, then it runs with what is there", () => {
  assert.deepEqual(decide({ today: "2026-11-07", current: at("2026-10-31"), failed: ["aws"], doors: DOORS2 }), { run: false, reason: "waiting on aws", window: W("2026-11-07"), newPeriod: false, pending: [] });
  assert.equal(decide({ today: "2026-11-09", current: at("2026-10-31"), failed: ["aws", "gcp"], doors: DOORS2 }).reason, "waiting on aws, gcp");
  assert.equal(decide({ today: "2026-11-10", current: at("2026-10-31"), failed: ["aws"], doors: DOORS2 }).run, true, "three days late it runs");
  assert.equal(decide({ today: "2026-11-15", current: null, failed: ["aws"], doors: DOORS2 }).reason, "waiting on aws", "a first run always waits");
  assert.equal(decide({ today: "2026-11-03", current: at("2026-10-31", ["arkos"]), failed: ["aws"], doors: DOORS2 }).reason, "doors added", "a door added is not a turn");
});

test("decide: a due turn waits on GCP rows through the window's end less six days", () => {
  const base = { today: "2026-11-07", current: at("2026-10-31"), doors: DOORS2, gcpConfigured: true };
  assert.deepEqual(decide({ ...base, gcpLastDay: "2026-10-30" }), { run: false, reason: "waiting on GCP rows through 2026-10-31", window: W("2026-11-07"), newPeriod: false, pending: [] });
  assert.equal(decide({ ...base, gcpLastDay: null }).reason, "waiting on GCP rows through 2026-10-31");
  assert.equal(decide({ ...base, gcpLastDay: "2026-10-31" }).run, true);
  assert.equal(GCP_LAG_DAYS, 6);
  assert.equal(decide({ ...base, gcpConfigured: false, gcpLastDay: null }).run, true, "GCP not configured: nothing to wait on");
  assert.equal(decide({ ...base, today: "2026-11-06", gcpLastDay: null }).reason, "done", "a period not due still sweeps");
});

test("decide never prices before the launch day", () => {
  assert.deepEqual(decide({ today: "2026-10-30", current: null, doors: DOORS2 }), { run: false, reason: "before the launch day", window: W("2026-10-30"), newPeriod: false, pending: [] });
  assert.equal(decide({ today: "2026-10-31", current: null, doors: DOORS2 }).run, true);
  assert.equal(decide({ today: "2026-10-30", current: null, doors: DOORS2, from: "2026-10-01" }).run, true, "the default guards, not the date");
});
