// admin/api/test/donate-prices.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { TIERS, CUSTOM, TIER_KEYS, DOORS, doorOf, doorByKey, shippedDoors, DONATE_URL, PRICES_URL } from "../src/donate/doors.mjs";
import { poolOf, priceOf, pricesOf, decide, PRICE_DAY, LATE_DAY } from "../src/donate/prices.mjs";

test("four tiers at 1, 3, 10 and 30 percent, then the custom row", () => {
  assert.deepEqual(TIERS.map((t) => [t.key, t.name, t.share]), [["prompt", "A prompt", 0.01], ["context", "A long context window", 0.03], ["run", "A whole agent run", 0.1], ["finetune", "A fine-tune", 0.3]]);
  assert.deepEqual(CUSTOM, { key: "own", name: "Your own number", minimumUsd: 1 });
  assert.deepEqual(TIER_KEYS, ["prompt", "context", "run", "finetune", "own"]);
});

test("a $287.40 month gives $3, $9, $29 and $87, labelled about n%", () => {
  assert.deepEqual(pricesOf(287.4).map((p) => [p.tier, p.usd, p.label]), [["prompt", 3, "about 1%"], ["context", 9, "about 3%"], ["run", 29, "about 10%"], ["finetune", 87, "about 30%"]]);
  assert.equal(priceOf(300, 0.01), 3, "an exact dollar is not rounded up to the next");
  assert.equal(priceOf(0, 0.3), 1, "the floor");
});

test("the pool is last month's rows less the commercial project, never negative", () => {
  const rows = [
    { month: "2026-10", provider: "aws", line: "BoxUsage:g4dn.xlarge", amount: 200 },
    { month: "2026-10", provider: "gcp", where: "csarko-sh", service: "Cloud Run", amount: 87.4 },
    { month: "2026-09", provider: "aws", line: "BoxUsage:g4dn.xlarge", amount: 999 },
    { month: "2026-10", provider: "gcp", where: "magicpixel-487014", service: "Compute Engine", amount: 50, project: "commercial" },
  ];
  assert.equal(poolOf(rows, "2026-10"), 287.4);
  assert.equal(poolOf([{ month: "2026-10", provider: "gcp", where: "csarko-sh", amount: -12 }], "2026-10"), 0);
  assert.deepEqual(pricesOf(0).map((p) => p.usd), [1, 1, 1, 1]);
});

test("the doors: seven, their URLs and sources, Day Hike not shipped", () => {
  assert.deepEqual(DOORS.map((d) => [d.door, d.slug, d.path]), [
    ["arkos", "ide-arkos", "/arkos"], ["macstats", "app-macstats", "/macstats"], ["visits", "lib-visits", "/visits"],
    ["last-trail", "the-last-trail", "/last-trail"], ["hallway", "who-is-standing-in-my-hallway", "/hallway"], ["all", null, "/"], ["dayhike", "day-hike", "/dayhike"],
  ]);
  assert.deepEqual(shippedDoors().map((d) => d.door), ["arkos", "macstats", "visits", "last-trail", "hallway", "all"]);
  assert.equal(doorOf("ide-arkos").door, "arkos");
  assert.equal(doorOf("nope"), null);
  assert.equal(doorByKey("all").picture.source, "donate/body-of-work.png");
  assert.equal(doorByKey("last-trail").picture.focusY, 0.3);
  assert.equal(doorByKey("dayhike").picture, null);
  for (const d of DOORS) {
    assert.equal(d.captions.length, 4, d.door);
    assert.ok(d.headline && d.lead && d.thanks && d.back.label && d.back.href.startsWith("https://"), d.door);
    assert.ok(!/—|@/.test(JSON.stringify(d)), `${d.door}: no em-dash, no address`);
  }
  assert.equal(doorByKey("arkos").lead, "Arkos is free. If it saved you a few hours, cover a slice of the cloud bill that builds it and everything else here.");
  assert.equal(DONATE_URL, "https://donate.csarko.sh");
  assert.equal(PRICES_URL, "https://storage.googleapis.com/csarko-sh-donate-prices/prices.json");
});

test("decide: done, before the 3rd, waiting on a provider until the 7th, a new month, a door added mid-month", () => {
  const doors = ["arkos", "all"];
  const oct = { month: "2026-10", doors: ["arkos", "all"] };
  assert.deepEqual(decide({ today: "2026-11-05", current: oct, failed: [], doors }), { run: false, reason: "done", month: "2026-10", newMonth: false, pending: [] });
  assert.equal(decide({ today: "2026-11-02", current: null, failed: [], doors }).reason, "before the 3rd");
  assert.equal(decide({ today: "2026-11-03", current: null, failed: ["aws"], doors }).reason, "waiting on aws");
  assert.equal(decide({ today: "2026-11-07", current: null, failed: ["aws"], doors }).run, true, "from the 7th it runs with what is there");
  assert.deepEqual(decide({ today: "2026-11-03", current: { month: "2026-09", doors }, failed: [], doors }), { run: true, reason: "new month", month: "2026-10", newMonth: true, pending: doors });
  assert.deepEqual(decide({ today: "2026-11-12", current: { month: "2026-10", doors: ["arkos"] }, failed: [], doors: ["arkos", "all", "dayhike"] }), { run: true, reason: "doors added", month: "2026-10", newMonth: false, pending: ["all", "dayhike"] });
  assert.equal(PRICE_DAY, 3);
  assert.equal(LATE_DAY, 7);
});
