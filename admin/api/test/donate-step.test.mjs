// admin/api/test/donate-step.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { createDonateStep } from "../src/donate/step.mjs";
import { createPricesBucket } from "../src/donate/bucket.mjs";
import { TIER_KEYS } from "../src/donate/doors.mjs";

const NOW = Date.parse("2026-11-03T10:00:12Z");
const ROWS = [{ month: "2026-10", provider: "aws", line: "BoxUsage:g4dn.xlarge", amount: 200 }, { month: "2026-10", provider: "gcp", where: "csarko-sh", service: "Cloud Run", amount: 87.4 }];

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

test("a new month: five products, five prices, five links a door, one JSON, the record", async () => {
  const calls = [];
  const bucket = fakeBucket();
  const step = createDonateStep({ writer: fakeWriter(calls), bucket, now: () => NOW, log: { error() {}, warn() {} } });
  const out = await step.run({ monthlyRows: ROWS, failed: [], today: "2026-11-03" });
  assert.equal(out.ran, true);
  assert.deepEqual(out.record, { month: "2026-10", pool: 287.4, at: "2026-11-03T10:00:12.000Z", doors: ["arkos", "macstats", "visits", "last-trail", "hallway", "all"] });
  const j = bucket.json;
  assert.deepEqual(j.tiers.map((t) => [t.tier, t.usd, t.label]), [["prompt", 3, "about 1%"], ["context", 9, "about 3%"], ["run", 29, "about 10%"], ["finetune", 87, "about 30%"]]);
  assert.ok(j.tiers.every((t) => t.priceId.startsWith("price_")));
  assert.deepEqual(Object.keys(j.products), TIER_KEYS);
  assert.equal(j.custom.minimumUsd, 1);
  assert.deepEqual(Object.keys(j.doors["arkos"].links), TIER_KEYS);
  assert.equal(calls.filter((c) => c[0] === "createLink").length, 30);
  const own = calls.find((c) => c[0] === "createLink" && c[1].tier === "own" && c[1].door === "all")[1];
  assert.equal(own.redirectUrl, "https://donate.csarko.sh/thanks?door=all");
  assert.equal(own.key, "donate:link:2026-10:all:own:2026-11-03");
  assert.equal(calls.find((c) => c[0] === "createPrice")[1].key, "donate:price:2026-10:prompt:2026-11-03");
  assert.equal(calls.find((c) => c[0] === "createCustomPrice")[1].key, "donate:price:2026-10:own:2026-11-03");
  assert.equal(calls.find((c) => c[0] === "createProduct")[1].key, "donate:product:prompt", "a product's key carries no day");
  assert.equal(calls.filter((c) => c[0] === "deactivateLink").length, 0, "nothing to deactivate the first time");
  assert.ok(!JSON.stringify(j).includes("@"));
});

test("existing products are reused by their tier metadata", async () => {
  const calls = [];
  const products = TIER_KEYS.map((t, i) => ({ id: `prod_old${i}`, name: t, metadata: { tier: t, donate: "1" } }));
  await createDonateStep({ writer: fakeWriter(calls, { products }), bucket: fakeBucket(), now: () => NOW, log: { error() {}, warn() {} } }).run({ monthlyRows: ROWS, failed: [], today: "2026-11-03" });
  assert.equal(calls.filter((c) => c[0] === "createProduct").length, 0);
  assert.equal(calls.find((c) => c[0] === "createPrice")[1].product, "prod_old0");
});

test("done, before the 3rd and a failed provider leave Stripe and the bucket alone and carry the record", async () => {
  const calls = [];
  const current = { month: "2026-10", pool: 288, at: "2026-11-03T10:00:12.000Z", tiers: [], custom: {}, products: {}, doors: Object.fromEntries(["arkos", "macstats", "visits", "last-trail", "hallway", "all"].map((d) => [d, { links: {} }])) };
  const bucket = fakeBucket(current);
  const step = createDonateStep({ writer: fakeWriter(calls), bucket, now: () => NOW, log: { error() {}, warn() {} } });
  assert.deepEqual(await step.run({ monthlyRows: ROWS, failed: [], today: "2026-11-05" }), { ran: false, reason: "done", record: { month: "2026-10", pool: 288, at: "2026-11-03T10:00:12.000Z", doors: Object.keys(current.doors) }, swept: { links: 0, prices: 0 } });
  assert.equal((await createDonateStep({ writer: fakeWriter(calls), bucket: fakeBucket(), now: () => NOW, log: { error() {}, warn() {} } }).run({ monthlyRows: ROWS, failed: [], today: "2026-11-02" })).reason, "before the 3rd");
  assert.equal((await createDonateStep({ writer: fakeWriter(calls), bucket: fakeBucket(), now: () => NOW, log: { error() {}, warn() {} } }).run({ monthlyRows: ROWS, failed: ["gcp"], today: "2026-11-04" })).reason, "waiting on gcp");
  assert.equal(calls.length, 0);
  assert.equal(bucket.writes, 0);
});

test("the next month: new prices and links, nothing retired; the next done run sweeps last month's links and prices", async () => {
  const calls = [];
  const tag = (month, door, tier, id) => ({ id, url: "u", metadata: { donate: "1", month, door, tier } });
  const links = [tag("2026-10", "arkos", "prompt", "plink_o1"), tag("2026-10", "all", "own", "plink_o2"), tag("2026-11", "arkos", "prompt", "plink_n1")];
  const prices = [...["prompt", "context", "run", "finetune", "own"].map((t, i) => ({ id: `price_o${i + 1}`, lookup_key: `donate:2026-10:${t}` })), { id: "price_n1", lookup_key: "donate:2026-11:prompt" }, { id: "price_x", lookup_key: null }];
  const oct = { month: "2026-10", pool: 288, at: "x", tiers: [], custom: { priceId: "price_o5", minimumUsd: 1 }, products: {}, doors: { arkos: { links: {} }, all: { links: {} } } };
  const bucket = fakeBucket(oct);
  const log = { error() {}, warn() {} };
  const nov = [{ month: "2026-11", provider: "aws", line: "BoxUsage:g4dn.xlarge", amount: 100 }];
  await createDonateStep({ writer: fakeWriter(calls), bucket, now: () => Date.parse("2026-12-03T10:00:00Z"), log }).run({ monthlyRows: nov, failed: [], today: "2026-12-03" });
  assert.equal(bucket.json.month, "2026-11");
  assert.equal(bucket.json.pool, 100);
  assert.equal(calls.filter((c) => c[0] === "deactivateLink" || c[0] === "archivePrice").length, 0, "the run that writes the month retires nothing");
  const out = await createDonateStep({ writer: fakeWriter(calls, { links, prices }), bucket, now: () => Date.parse("2026-12-04T10:00:00Z"), log }).run({ monthlyRows: nov, failed: [], today: "2026-12-04" });
  assert.deepEqual([out.ran, out.reason, out.swept], [false, "done", { links: 2, prices: 5 }]);
  assert.deepEqual(calls.filter((c) => c[0] === "deactivateLink").map((c) => c[1]), ["plink_o1", "plink_o2"]);
  assert.deepEqual(calls.filter((c) => c[0] === "archivePrice").map((c) => c[1]), ["price_o1", "price_o2", "price_o3", "price_o4", "price_o5"]);
});

test("a sweep that fails on one link and one price logs it, goes on and counts only what it retired", async () => {
  const calls = [];
  const errors = [];
  const tag = (id) => ({ id, url: "u", metadata: { donate: "1", month: "2026-09", door: "arkos", tier: "prompt" } });
  const links = [tag("plink_a"), tag("plink_b")];
  const prices = [{ id: "price_a", lookup_key: "donate:2026-09:prompt" }, { id: "price_b", lookup_key: "donate:2026-09:run" }];
  const cur = { month: "2026-10", pool: 288, at: "x", tiers: [], custom: {}, products: {}, doors: Object.fromEntries(["arkos", "macstats", "visits", "last-trail", "hallway", "all"].map((d) => [d, { links: {} }])) };
  const out = await createDonateStep({ writer: fakeWriter(calls, { links, prices, failOn: ["plink_a", "price_b"] }), bucket: fakeBucket(cur), now: () => NOW, log: { error: (...a) => errors.push(a), warn() {} } }).run({ monthlyRows: ROWS, failed: [], today: "2026-11-05" });
  assert.deepEqual(out.swept, { links: 1, prices: 1 });
  assert.equal(calls.length, 4);
  assert.equal(errors.length, 2);
});

test("a bucket write that throws retires nothing and propagates", async () => {
  const calls = [];
  const bucket = fakeBucket();
  bucket.write = async () => { throw new Error("GCS 503"); };
  await assert.rejects(createDonateStep({ writer: fakeWriter(calls), bucket, now: () => NOW, log: { error() {}, warn() {} } }).run({ monthlyRows: ROWS, failed: [], today: "2026-11-03" }), /GCS 503/);
  assert.equal(calls.filter((c) => c[0] === "deactivateLink" || c[0] === "archivePrice").length, 0);
});

test("an empty id or an empty url from the writer is a failure and nothing is written", async () => {
  const log = { error() {}, warn() {} };
  for (const bad of [{ createPrice: async () => ({ id: "" }) }, { createProduct: async () => ({ id: null }) }, { createLink: async () => ({ id: "plink_1", url: "" }) }, { createLink: async () => ({ id: "", url: "u" }) }, { createLink: async () => null }]) {
    const bucket = fakeBucket();
    await assert.rejects(createDonateStep({ writer: { ...fakeWriter([]), ...bad }, bucket, now: () => NOW, log }).run({ monthlyRows: ROWS, failed: [], today: "2026-11-03" }), /Stripe returned no/);
    assert.equal(bucket.writes, 0);
  }
});

test("a rerun finds the month's prices by lookup key: no price is created and the pool is the one they were cut from", async () => {
  const calls = [];
  const prices = TIER_KEYS.map((t, i) => ({ id: `price_f${i}`, lookup_key: `donate:2026-10:${t}`, metadata: { donate: "1", month: "2026-10", tier: t, pool: "300" } }));
  const bucket = fakeBucket();
  await createDonateStep({ writer: fakeWriter(calls, { prices }), bucket, now: () => NOW, log: { error() {}, warn() {} } }).run({ monthlyRows: ROWS, failed: [], today: "2026-11-04" });
  assert.equal(calls.filter((c) => c[0] === "createPrice" || c[0] === "createCustomPrice").length, 0);
  assert.equal(bucket.json.pool, 300);
  assert.deepEqual(bucket.json.tiers.map((t) => [t.usd, t.priceId]), [[3, "price_f0"], [9, "price_f1"], [30, "price_f2"], [90, "price_f3"]]);
  assert.equal(bucket.json.custom.priceId, "price_f4");
});

test("some of the month's prices found: those reused, the rest created at the found pool, with lookup keys and metadata", async () => {
  const calls = [];
  const prices = [{ id: "price_f0", lookup_key: "donate:2026-10:prompt", metadata: { pool: "300" } }];
  await createDonateStep({ writer: fakeWriter(calls, { prices }), bucket: fakeBucket(), now: () => NOW, log: { error() {}, warn() {} } }).run({ monthlyRows: ROWS, failed: [], today: "2026-11-04" });
  const made = calls.filter((c) => c[0] === "createPrice");
  assert.deepEqual(made.map((c) => c[1].usd), [9, 30, 90]);
  assert.equal(made[0][1].lookupKey, "donate:2026-10:context");
  assert.deepEqual(made[0][1].metadata, { donate: "1", month: "2026-10", tier: "context", pool: "300" });
  assert.equal(calls.find((c) => c[0] === "createCustomPrice")[1].lookupKey, "donate:2026-10:own");
});

test("a door with two of its five links already in Stripe gets three new ones", async () => {
  const calls = [];
  const links = ["prompt", "own"].map((tier) => ({ id: `plink_f_${tier}`, url: `https://buy.stripe.com/f_${tier}`, metadata: { donate: "1", month: "2026-10", door: "arkos", tier } }));
  const bucket = fakeBucket();
  await createDonateStep({ writer: fakeWriter(calls, { links }), bucket, now: () => NOW, log: { error() {}, warn() {} } }).run({ monthlyRows: ROWS, failed: [], today: "2026-11-04" });
  assert.deepEqual(calls.filter((c) => c[0] === "createLink" && c[1].door === "arkos").map((c) => c[1].tier), ["context", "run", "finetune"]);
  assert.equal(bucket.json.doors.arkos.links.prompt.id, "plink_f_prompt");
  assert.equal(bucket.json.doors.arkos.links.own.url, "https://buy.stripe.com/f_own");
});

test("a door added mid-month gets its links at the current prices; nothing else is touched", async () => {
  const calls = [];
  const oct = { month: "2026-10", pool: 288, at: "x", tiers: [{ tier: "prompt", share: 0.01, priceId: "price_1" }, { tier: "context", share: 0.03, priceId: "price_2" }, { tier: "run", share: 0.1, priceId: "price_3" }, { tier: "finetune", share: 0.3, priceId: "price_4" }], custom: { priceId: "price_5", minimumUsd: 1 }, products: {}, doors: Object.fromEntries(["arkos", "macstats", "visits", "last-trail", "hallway"].map((d) => [d, { links: {} }])) };
  const bucket = fakeBucket(oct);
  await createDonateStep({ writer: fakeWriter(calls), bucket, now: () => NOW, log: { error() {}, warn() {} } }).run({ monthlyRows: ROWS, failed: [], today: "2026-11-12" });
  assert.deepEqual(calls.map((c) => c[0]).filter((n) => n !== "createLink"), []);
  assert.equal(calls.length, 5);
  assert.ok(calls.every((c) => c[1].door === "all"));
  assert.equal(calls.find((c) => c[1].tier === "context")[1].priceId, "price_2");
  assert.deepEqual(Object.keys(bucket.json.doors), ["arkos", "macstats", "visits", "last-trail", "hallway", "all"]);
});

test("a Stripe failure midway writes nothing and rethrows; a same-day rerun uses the same idempotency keys, the next day's its own", async () => {
  const calls = [];
  const bucket = fakeBucket();
  const log = { error() {}, warn() {} };
  await assert.rejects(createDonateStep({ writer: fakeWriter(calls, { failAt: 12 }), bucket, now: () => NOW, log }).run({ monthlyRows: ROWS, failed: [], today: "2026-11-03" }), /Stripe 500/);
  assert.equal(bucket.writes, 0);
  const keys = (list) => list.filter((c) => c[1]?.key).map((c) => c[1].key);
  const same = [];
  await createDonateStep({ writer: fakeWriter(same), bucket, now: () => NOW, log }).run({ monthlyRows: ROWS, failed: [], today: "2026-11-03" });
  assert.deepEqual(keys(same).slice(0, keys(calls).length), keys(calls));
  // A replayed 500 cannot cost a second day: the next day's keys are new, products' aside.
  const next = [];
  await createDonateStep({ writer: fakeWriter(next), bucket: fakeBucket(), now: () => NOW, log }).run({ monthlyRows: ROWS, failed: [], today: "2026-11-04" });
  assert.ok(keys(next).filter((k) => !k.startsWith("donate:product:")).every((k) => k.endsWith(":2026-11-04")));
  assert.equal(keys(next).filter((k) => keys(calls).includes(k)).length, 5, "only the five product keys repeat");
});

test("the bucket: a missing object reads as null, a write carries the content type and a five-minute cache", async () => {
  const saved = [];
  const storage = { bucket: (name) => ({ file: (obj) => ({
    async download() { const e = new Error("No such object"); e.code = 404; throw e; },
    async save(body, opts) { saved.push({ name, obj, body: JSON.parse(body), opts }); },
  }) }) };
  const b = createPricesBucket({ bucket: "csarko-sh-donate-prices", projectId: "csarko-sh", storage, log: { error() {} } });
  assert.equal(b.configured, true);
  assert.equal(await b.read(), null);
  await b.write({ month: "2026-10" });
  assert.equal(saved[0].name, "csarko-sh-donate-prices");
  assert.equal(saved[0].obj, "prices.json");
  assert.deepEqual(saved[0].body, { month: "2026-10" });
  assert.equal(saved[0].opts.contentType, "application/json");
  assert.equal(saved[0].opts.metadata.cacheControl, "public, max-age=300");
  assert.equal(createPricesBucket({ bucket: null, projectId: "csarko-sh" }).configured, false);
});

test("the bucket rethrows a read that fails with anything but a 404", async () => {
  const storage = { bucket: () => ({ file: () => ({ async download() { const e = new Error("denied"); e.code = 403; throw e; } }) }) };
  const b = createPricesBucket({ bucket: "csarko-sh-donate-prices", storage, log: { error() {} } });
  await assert.rejects(b.read(), /denied/);
});
