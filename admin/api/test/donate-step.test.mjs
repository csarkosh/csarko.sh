// admin/api/test/donate-step.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { createDonateStep } from "../src/donate/step.mjs";
import { createPricesBucket } from "../src/donate/bucket.mjs";
import { TIER_KEYS } from "../src/donate/doors.mjs";

const NOW = Date.parse("2026-10-31T10:00:12Z");
const TODAY = "2026-10-31";
const PERIOD = { from: "2026-10-01", to: "2026-10-30", repricedOn: "2026-10-31" };
const SHIPPED = ["arkos", "macstats", "visits", "last-trail", "hallway", "all"];
// The window on Oct 31 is Oct 1 to Oct 30: the row of Sep 30 and the row of Oct 31 fall outside it.
const ROWS = [
  { day: "2026-10-05", provider: "aws", line: "BoxUsage:g4dn.xlarge", amount: 200 },
  { day: "2026-10-20", provider: "gcp", where: "csarko-sh", service: "Cloud Run", amount: 87.4 },
  { day: "2026-09-30", provider: "aws", line: "BoxUsage:g4dn.xlarge", amount: 500 },
  { day: "2026-10-31", provider: "aws", line: "BoxUsage:g4dn.xlarge", amount: 500 },
];
const quiet = { error() {}, warn() {} };
/** A published object for `period`, with every shipped door (or `doors`). */
const published = (period, doors = SHIPPED, extra = {}) => ({ period, pool: 288, at: `${period.repricedOn}T10:00:12.000Z`, tiers: [], custom: {}, products: {}, doors: Object.fromEntries(doors.map((d) => [d, { links: {} }])), ...extra });

/** A fake writer that records calls and fails on the nth create when told to. */
function fakeWriter(calls, { products = [], failAt = null, prices = [], links = [], failOn = [] } = {}) {
  let n = 0;
  const next = (prefix) => { n += 1; if (failAt !== null && n === failAt) throw new Error(`Stripe 500 on ${prefix}`); return `${prefix}_${n}`; };
  return {
    configured: true,
    async listProducts() { calls.push(["listProducts"]); return products; },
    async createProduct(a) { calls.push(["createProduct", a]); return { id: next("prod") }; },
    async createPrice(a) { calls.push(["createPrice", a]); return { id: next("price") }; },
    async createCustomPrice(a) { calls.push(["createCustomPrice", a]); return { id: next("price") }; },
    async createLink(a) { calls.push(["createLink", a]); const id = next("plink"); return { id, url: `https://buy.stripe.com/${id}` }; },
    async listPrices() { return prices; },
    async listLinks() { return links; },
    async deactivateLink(id) { calls.push(["deactivateLink", id]); if (failOn.includes(id)) throw new Error(`Stripe 500 on ${id}`); },
    async archivePrice(id) { calls.push(["archivePrice", id]); if (failOn.includes(id)) throw new Error(`Stripe 500 on ${id}`); },
  };
}
/** A fake bucket over one object. */
function fakeBucket(initial = null) {
  let json = initial;
  return { configured: true, writes: 0, async read() { return json; }, async write(j) { json = j; this.writes += 1; }, get json() { return json; } };
}

test("a new period: four products, four prices, four links a door, one JSON, the record", async () => {
  const calls = [];
  const bucket = fakeBucket();
  const step = createDonateStep({ writer: fakeWriter(calls), bucket, now: () => NOW, log: quiet });
  const out = await step.run({ dailyRows: ROWS, failed: [], today: TODAY, gcpConfigured: true, gcpLastDay: "2026-10-24" });
  assert.equal(out.ran, true);
  assert.deepEqual(out.record, { period: PERIOD, pool: 287.4, at: "2026-10-31T10:00:12.000Z", doors: SHIPPED });
  const j = bucket.json;
  assert.deepEqual(Object.keys(j), ["period", "pool", "at", "tiers", "custom", "products", "doors"]);
  assert.deepEqual(j.period, PERIOD);
  assert.deepEqual(j.tiers.map((t) => [t.tier, t.usd, t.label]), [["prompt", 3, "about 1%"], ["context", 9, "about 3%"], ["run", 29, "about 10%"]]);
  assert.ok(j.tiers.every((t) => t.priceId.startsWith("price_")));
  assert.deepEqual(Object.keys(j.products), TIER_KEYS);
  assert.equal(j.custom.minimumUsd, 1);
  assert.deepEqual(Object.keys(j.doors["arkos"].links), TIER_KEYS);
  assert.equal(calls.filter((c) => c[0] === "createLink").length, 24);
  const own = calls.find((c) => c[0] === "createLink" && c[1].tier === "own" && c[1].door === "all")[1];
  assert.equal(own.redirectUrl, "https://donate.csarko.sh/thanks?door=all");
  assert.equal(own.key, "donate:link:2026-10-31:all:own:2026-10-31");
  assert.equal(own.period, "2026-10-31");
  assert.ok(!("month" in own));
  const price = calls.find((c) => c[0] === "createPrice")[1];
  assert.equal(price.key, "donate:price:2026-10-31:prompt:2026-10-31");
  assert.equal(price.lookupKey, "donate:2026-10-31:prompt");
  assert.deepEqual(price.metadata, { donate: "1", period: "2026-10-31", tier: "prompt", pool: "287.4" });
  assert.equal(calls.find((c) => c[0] === "createCustomPrice")[1].key, "donate:price:2026-10-31:own:2026-10-31");
  assert.equal(calls.find((c) => c[0] === "createProduct")[1].key, "donate:product:prompt", "a product's key carries no day");
  assert.equal(calls.filter((c) => c[0] === "deactivateLink").length, 0, "nothing to deactivate the first time");
  assert.ok(!JSON.stringify(j).includes("@"));
});

test("existing products are reused by their tier metadata", async () => {
  const calls = [];
  const products = TIER_KEYS.map((t, i) => ({ id: `prod_old${i}`, name: t, metadata: { tier: t, donate: "1" } }));
  await createDonateStep({ writer: fakeWriter(calls, { products }), bucket: fakeBucket(), now: () => NOW, log: quiet }).run({ dailyRows: ROWS, failed: [], today: TODAY });
  assert.equal(calls.filter((c) => c[0] === "createProduct").length, 0);
  assert.equal(calls.find((c) => c[0] === "createPrice")[1].product, "prod_old0");
});

test("done, a failed provider and the GCP hold leave Stripe and the bucket alone and carry the record", async () => {
  const calls = [];
  const current = published(PERIOD);
  const bucket = fakeBucket(current);
  const step = createDonateStep({ writer: fakeWriter(calls), bucket, now: () => NOW, log: quiet });
  assert.deepEqual(await step.run({ dailyRows: ROWS, failed: [], today: "2026-11-06" }), { ran: false, reason: "done", record: { period: PERIOD, pool: 288, at: "2026-10-31T10:00:12.000Z", doors: SHIPPED }, swept: { links: 0, prices: 0 } });
  const fresh = () => createDonateStep({ writer: fakeWriter(calls), bucket: fakeBucket(), now: () => NOW, log: quiet });
  assert.equal((await fresh().run({ dailyRows: ROWS, failed: ["gcp"], today: TODAY })).reason, "waiting on gcp");
  assert.equal((await fresh().run({ dailyRows: ROWS, failed: [], today: TODAY, gcpConfigured: true, gcpLastDay: "2026-10-23" })).reason, "waiting on GCP rows through 2026-10-24");
  assert.equal((await fresh().run({ dailyRows: ROWS, failed: [], today: TODAY, gcpConfigured: true, gcpLastDay: null })).reason, "waiting on GCP rows through 2026-10-24");
  assert.equal(calls.length, 0);
  assert.equal(bucket.writes, 0);
});

test("the weekly turn: six days on is done, seven days on is a new period over the new window, and it retires nothing", async () => {
  const calls = [];
  const bucket = fakeBucket(published(PERIOD));
  const rows = [...ROWS, { day: "2026-11-06", provider: "aws", line: "BoxUsage:g4dn.xlarge", amount: 12.6 }];
  const six = await createDonateStep({ writer: fakeWriter(calls), bucket, now: () => Date.parse("2026-11-06T10:00:00Z"), log: quiet }).run({ dailyRows: rows, failed: [], today: "2026-11-06" });
  assert.equal(six.reason, "done");
  const seven = await createDonateStep({ writer: fakeWriter(calls), bucket, now: () => Date.parse("2026-11-07T10:00:00Z"), log: quiet }).run({ dailyRows: rows, failed: [], today: "2026-11-07" });
  assert.deepEqual([seven.ran, seven.reason], [true, "new period"]);
  assert.deepEqual(bucket.json.period, { from: "2026-10-08", to: "2026-11-06", repricedOn: "2026-11-07" });
  // Oct 8 to Nov 6: the Oct 20 row, the Oct 31 row and the Nov 6 row; Oct 5 has left the window.
  assert.equal(bucket.json.pool, 600);
  assert.equal(bucket.json.at, "2026-11-07T10:00:00.000Z");
  assert.equal(calls.find((c) => c[0] === "createPrice")[1].lookupKey, "donate:2026-11-07:prompt");
  assert.equal(calls.filter((c) => c[0] === "deactivateLink" || c[0] === "archivePrice").length, 0, "the run that writes a period retires nothing");
});

test("a done run sweeps the periods repriced more than 35 days before the current one", async () => {
  const calls = [];
  // The current period was repriced on Dec 5, so the horizon is Oct 31: Oct 30 (36 days old) goes, Nov 1 (34 days old) stays.
  const tag = (period, door, tier, id) => ({ id, url: "u", metadata: { donate: "1", period, door, tier } });
  const links = [tag("2026-10-30", "arkos", "prompt", "plink_s1"), tag("2026-10-30", "all", "own", "plink_s2"), tag("2026-11-01", "arkos", "prompt", "plink_k1"), tag("2026-12-05", "arkos", "prompt", "plink_n1"), { id: "plink_m", url: "u", metadata: { donate: "1", month: "2026-09" } }];
  const prices = [
    ...TIER_KEYS.map((t, i) => ({ id: `price_s${i + 1}`, lookup_key: `donate:2026-10-30:${t}` })),
    ...TIER_KEYS.map((t, i) => ({ id: `price_k${i + 1}`, lookup_key: `donate:2026-11-01:${t}` })),
    { id: "price_n1", lookup_key: "donate:2026-12-05:prompt" }, { id: "price_x", lookup_key: null },
  ];
  const current = published({ from: "2026-11-05", to: "2026-12-04", repricedOn: "2026-12-05" });
  const out = await createDonateStep({ writer: fakeWriter(calls, { links, prices }), bucket: fakeBucket(current), now: () => Date.parse("2026-12-06T10:00:00Z"), log: quiet }).run({ dailyRows: ROWS, failed: [], today: "2026-12-06" });
  assert.deepEqual([out.ran, out.reason, out.swept], [false, "done", { links: 2, prices: 4 }]);
  assert.deepEqual(calls.filter((c) => c[0] === "deactivateLink").map((c) => c[1]), ["plink_s1", "plink_s2"]);
  assert.deepEqual(calls.filter((c) => c[0] === "archivePrice").map((c) => c[1]), ["price_s1", "price_s2", "price_s3", "price_s4"]);
});

test("a sweep that fails on one link and one price logs it, goes on and counts only what it retired", async () => {
  const calls = [];
  const errors = [];
  const tag = (id) => ({ id, url: "u", metadata: { donate: "1", period: "2026-09-01", door: "arkos", tier: "prompt" } });
  const links = [tag("plink_a"), tag("plink_b")];
  const prices = [{ id: "price_a", lookup_key: "donate:2026-09-01:prompt" }, { id: "price_b", lookup_key: "donate:2026-09-01:run" }];
  const out = await createDonateStep({ writer: fakeWriter(calls, { links, prices, failOn: ["plink_a", "price_b"] }), bucket: fakeBucket(published(PERIOD)), now: () => NOW, log: { error: (...a) => errors.push(a), warn() {} } }).run({ dailyRows: ROWS, failed: [], today: "2026-11-02" });
  assert.deepEqual(out.swept, { links: 1, prices: 1 });
  assert.equal(calls.length, 4);
  assert.equal(errors.length, 2);
});

test("a bucket write that throws retires nothing and propagates", async () => {
  const calls = [];
  const bucket = fakeBucket();
  bucket.write = async () => { throw new Error("GCS 503"); };
  await assert.rejects(createDonateStep({ writer: fakeWriter(calls), bucket, now: () => NOW, log: quiet }).run({ dailyRows: ROWS, failed: [], today: TODAY }), /GCS 503/);
  assert.equal(calls.filter((c) => c[0] === "deactivateLink" || c[0] === "archivePrice").length, 0);
});

test("an empty id or an empty url from the writer is a failure and nothing is written", async () => {
  for (const bad of [{ createPrice: async () => ({ id: "" }) }, { createProduct: async () => ({ id: null }) }, { createLink: async () => ({ id: "plink_1", url: "" }) }, { createLink: async () => ({ id: "", url: "u" }) }, { createLink: async () => null }]) {
    const bucket = fakeBucket();
    await assert.rejects(createDonateStep({ writer: { ...fakeWriter([]), ...bad }, bucket, now: () => NOW, log: quiet }).run({ dailyRows: ROWS, failed: [], today: TODAY }), /Stripe returned no/);
    assert.equal(bucket.writes, 0);
  }
});

test("a rerun finds the period's prices by lookup key: no price is created and the pool is the one they were cut from", async () => {
  const calls = [];
  const prices = TIER_KEYS.map((t, i) => ({ id: `price_f${i}`, lookup_key: `donate:2026-10-31:${t}`, metadata: { donate: "1", period: "2026-10-31", tier: t, pool: "300" } }));
  const bucket = fakeBucket();
  await createDonateStep({ writer: fakeWriter(calls, { prices }), bucket, now: () => NOW, log: quiet }).run({ dailyRows: ROWS, failed: [], today: TODAY });
  assert.equal(calls.filter((c) => c[0] === "createPrice" || c[0] === "createCustomPrice").length, 0);
  assert.equal(bucket.json.pool, 300);
  assert.deepEqual(bucket.json.tiers.map((t) => [t.usd, t.priceId]), [[3, "price_f0"], [9, "price_f1"], [30, "price_f2"]]);
  assert.equal(bucket.json.custom.priceId, "price_f3");
});

test("some of the period's prices found: those reused, the rest created at the found pool, with lookup keys and metadata", async () => {
  const calls = [];
  const prices = [{ id: "price_f0", lookup_key: "donate:2026-10-31:prompt", metadata: { pool: "300" } }];
  await createDonateStep({ writer: fakeWriter(calls, { prices }), bucket: fakeBucket(), now: () => NOW, log: quiet }).run({ dailyRows: ROWS, failed: [], today: TODAY });
  const made = calls.filter((c) => c[0] === "createPrice");
  assert.deepEqual(made.map((c) => c[1].usd), [9, 30]);
  assert.equal(made[0][1].lookupKey, "donate:2026-10-31:context");
  assert.deepEqual(made[0][1].metadata, { donate: "1", period: "2026-10-31", tier: "context", pool: "300" });
  assert.equal(calls.find((c) => c[0] === "createCustomPrice")[1].lookupKey, "donate:2026-10-31:own");
});

test("a door with two of its four links already in Stripe gets two new ones", async () => {
  const calls = [];
  const links = ["prompt", "own"].map((tier) => ({ id: `plink_f_${tier}`, url: `https://buy.stripe.com/f_${tier}`, metadata: { donate: "1", period: "2026-10-31", door: "arkos", tier } }));
  const bucket = fakeBucket();
  await createDonateStep({ writer: fakeWriter(calls, { links }), bucket, now: () => NOW, log: quiet }).run({ dailyRows: ROWS, failed: [], today: TODAY });
  assert.deepEqual(calls.filter((c) => c[0] === "createLink" && c[1].door === "arkos").map((c) => c[1].tier), ["context", "run"]);
  assert.equal(bucket.json.doors.arkos.links.prompt.id, "plink_f_prompt");
  assert.equal(bucket.json.doors.arkos.links.own.url, "https://buy.stripe.com/f_own");
});

test("a door added between turns gets its links at the current period's prices; nothing else is touched", async () => {
  const calls = [];
  const tiers = [{ tier: "prompt", share: 0.01, priceId: "price_1" }, { tier: "context", share: 0.03, priceId: "price_2" }, { tier: "run", share: 0.1, priceId: "price_3" }];
  const current = published(PERIOD, SHIPPED.filter((d) => d !== "all"), { tiers, custom: { priceId: "price_4", minimumUsd: 1 } });
  const bucket = fakeBucket(current);
  const out = await createDonateStep({ writer: fakeWriter(calls), bucket, now: () => Date.parse("2026-11-03T10:00:00Z"), log: quiet }).run({ dailyRows: ROWS, failed: [], today: "2026-11-03", gcpConfigured: true, gcpLastDay: null });
  assert.equal(out.reason, "doors added", "a door added waits on nothing");
  assert.deepEqual(calls.map((c) => c[0]).filter((n) => n !== "createLink"), []);
  assert.equal(calls.length, 4);
  assert.ok(calls.every((c) => c[1].door === "all" && c[1].period === "2026-10-31"));
  assert.equal(calls.find((c) => c[1].tier === "context")[1].priceId, "price_2");
  assert.equal(calls.find((c) => c[1].tier === "context")[1].key, "donate:link:2026-10-31:all:context:2026-11-03");
  assert.deepEqual(Object.keys(bucket.json.doors), SHIPPED);
  assert.deepEqual([bucket.json.period, bucket.json.pool, bucket.json.at], [PERIOD, 288, "2026-10-31T10:00:12.000Z"]);
});

test("a Stripe failure midway writes nothing and rethrows; a same-day rerun uses the same idempotency keys, the next day's its own", async () => {
  const calls = [];
  const bucket = fakeBucket();
  await assert.rejects(createDonateStep({ writer: fakeWriter(calls, { failAt: 12 }), bucket, now: () => NOW, log: quiet }).run({ dailyRows: ROWS, failed: [], today: TODAY }), /Stripe 500/);
  assert.equal(bucket.writes, 0);
  const keys = (list) => list.filter((c) => c[1]?.key).map((c) => c[1].key);
  assert.ok(keys(calls).filter((k) => !k.startsWith("donate:product:")).every((k) => k.startsWith("donate:price:2026-10-31:") || k.startsWith("donate:link:2026-10-31:")));
  const same = [];
  await createDonateStep({ writer: fakeWriter(same), bucket, now: () => NOW, log: quiet }).run({ dailyRows: ROWS, failed: [], today: TODAY });
  assert.deepEqual(keys(same).slice(0, keys(calls).length), keys(calls));
  // A replayed 500 cannot cost a second day: the next day's keys are new, products' aside.
  const next = [];
  await createDonateStep({ writer: fakeWriter(next), bucket: fakeBucket(), now: () => NOW, log: quiet }).run({ dailyRows: ROWS, failed: [], today: "2026-11-01" });
  assert.ok(keys(next).filter((k) => !k.startsWith("donate:product:")).every((k) => k.endsWith(":2026-11-01")));
  assert.equal(keys(next).filter((k) => keys(calls).includes(k)).length, 4, "only the four product keys repeat");
});

test("the bucket: a missing object reads as null, a write carries the content type and a no-cache header", async () => {
  const saved = [];
  const storage = { bucket: (name) => ({ file: (obj) => ({
    async download() { const e = new Error("No such object"); e.code = 404; throw e; },
    async save(body, opts) { saved.push({ name, obj, body: JSON.parse(body), opts }); },
  }) }) };
  const b = createPricesBucket({ bucket: "csarko-sh-donate-prices", projectId: "csarko-sh", storage, log: { error() {} } });
  assert.equal(b.configured, true);
  assert.equal(await b.read(), null);
  await b.write({ period: { from: "2026-10-01", to: "2026-10-30", repricedOn: "2026-10-31" } });
  assert.equal(saved[0].name, "csarko-sh-donate-prices");
  assert.equal(saved[0].obj, "prices.json");
  assert.deepEqual(saved[0].body, { period: { from: "2026-10-01", to: "2026-10-30", repricedOn: "2026-10-31" } });
  assert.equal(saved[0].opts.contentType, "application/json");
  assert.equal(saved[0].opts.metadata.cacheControl, "no-cache");
  assert.equal(createPricesBucket({ bucket: null, projectId: "csarko-sh" }).configured, false);
});

test("the bucket rethrows a read that fails with anything but a 404", async () => {
  const storage = { bucket: () => ({ file: () => ({ async download() { const e = new Error("denied"); e.code = 403; throw e; } }) }) };
  const b = createPricesBucket({ bucket: "csarko-sh-donate-prices", storage, log: { error() {} } });
  await assert.rejects(b.read(), /denied/);
});

test("the launch-day hold: a run on Oct 30 touches neither Stripe nor the bucket; Oct 31 prices", async () => {
  const calls = [];
  const bucket = fakeBucket();
  const step = createDonateStep({ writer: fakeWriter(calls), bucket, now: () => Date.parse("2026-10-30T20:00:00Z"), log: quiet });
  const out = await step.run({ dailyRows: ROWS, failed: [], today: "2026-10-30" });
  assert.deepEqual(out, { ran: false, reason: "before the launch day", record: null });
  assert.deepEqual(calls, []);
  assert.equal(bucket.writes, 0);
  const on = await createDonateStep({ writer: fakeWriter(calls), bucket, now: () => NOW, log: quiet }).run({ dailyRows: ROWS, failed: [], today: TODAY });
  assert.deepEqual([on.ran, on.record.period], [true, PERIOD]);
});
