// admin/api/test/donate-step.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { createDonateStep } from "../src/donate/step.mjs";
import { createPricesBucket } from "../src/donate/bucket.mjs";
import { TIER_KEYS } from "../src/donate/doors.mjs";

const NOW = Date.parse("2026-11-03T10:00:12Z");
const ROWS = [{ month: "2026-10", provider: "aws", line: "BoxUsage:g4dn.xlarge", amount: 200 }, { month: "2026-10", provider: "gcp", where: "csarko-sh", service: "Cloud Run", amount: 87.4 }];

/** A fake writer that records calls and fails on the nth create when told to. */
function fakeWriter(calls, { products = [], failAt = null } = {}) {
  let n = 0;
  const next = (prefix) => { n += 1; if (failAt !== null && n === failAt) throw new Error(`Stripe 500 on ${prefix}`); return `${prefix}_${n}`; };
  return {
    configured: true,
    async listProducts() { calls.push(["listProducts"]); return products; },
    async createProduct(a) { calls.push(["createProduct", a]); return { id: next("prod") }; },
    async createPrice(a) { calls.push(["createPrice", a]); return { id: next("price") }; },
    async createCustomPrice(a) { calls.push(["createCustomPrice", a]); return { id: next("price") }; },
    async createLink(a) { calls.push(["createLink", a]); const id = next("plink"); return { id, url: `https://buy.stripe.com/${id}` }; },
    async deactivateLink(id) { calls.push(["deactivateLink", id]); },
    async archivePrice(id) { calls.push(["archivePrice", id]); },
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
  assert.equal(own.key, "donate:link:2026-10:all:own");
  assert.equal(calls.find((c) => c[0] === "createPrice")[1].key, "donate:price:2026-10:prompt");
  assert.equal(calls.filter((c) => c[0] === "deactivateLink").length, 0, "nothing to deactivate the first time");
  assert.ok(!JSON.stringify(j).includes("@"));
});

test("existing products are reused by their tier metadata", async () => {
  const calls = [];
  const products = TIER_KEYS.map((t, i) => ({ id: `prod_old${i}`, name: t, metadata: { tier: t } }));
  await createDonateStep({ writer: fakeWriter(calls, { products }), bucket: fakeBucket(), now: () => NOW, log: { error() {}, warn() {} } }).run({ monthlyRows: ROWS, failed: [], today: "2026-11-03" });
  assert.equal(calls.filter((c) => c[0] === "createProduct").length, 0);
  assert.equal(calls.find((c) => c[0] === "createPrice")[1].product, "prod_old0");
});

test("done, before the 3rd and a failed provider leave Stripe and the bucket alone and carry the record", async () => {
  const calls = [];
  const current = { month: "2026-10", pool: 288, at: "2026-11-03T10:00:12.000Z", tiers: [], custom: {}, products: {}, doors: Object.fromEntries(["arkos", "macstats", "visits", "last-trail", "hallway", "all"].map((d) => [d, { links: {} }])) };
  const bucket = fakeBucket(current);
  const step = createDonateStep({ writer: fakeWriter(calls), bucket, now: () => NOW, log: { error() {}, warn() {} } });
  assert.deepEqual(await step.run({ monthlyRows: ROWS, failed: [], today: "2026-11-05" }), { ran: false, reason: "done", record: { month: "2026-10", pool: 288, at: "2026-11-03T10:00:12.000Z", doors: Object.keys(current.doors) } });
  assert.equal((await createDonateStep({ writer: fakeWriter(calls), bucket: fakeBucket(), now: () => NOW, log: { error() {}, warn() {} } }).run({ monthlyRows: ROWS, failed: [], today: "2026-11-02" })).reason, "before the 3rd");
  assert.equal((await createDonateStep({ writer: fakeWriter(calls), bucket: fakeBucket(), now: () => NOW, log: { error() {}, warn() {} } }).run({ monthlyRows: ROWS, failed: ["gcp"], today: "2026-11-04" })).reason, "waiting on gcp");
  assert.equal(calls.length, 0);
  assert.equal(bucket.writes, 0);
});

test("the next month: new prices and links first, then last month's links deactivated and prices archived", async () => {
  const calls = [];
  const oct = { month: "2026-10", pool: 288, at: "x", tiers: [{ tier: "prompt", priceId: "price_o1" }, { tier: "context", priceId: "price_o2" }, { tier: "run", priceId: "price_o3" }, { tier: "finetune", priceId: "price_o4" }], custom: { priceId: "price_o5", minimumUsd: 1 }, products: {}, doors: { arkos: { links: { prompt: { id: "plink_o1", url: "u" } } }, all: { links: { own: { id: "plink_o2", url: "u" } } } } };
  const bucket = fakeBucket(oct);
  const nov = [{ month: "2026-11", provider: "aws", line: "BoxUsage:g4dn.xlarge", amount: 100 }];
  await createDonateStep({ writer: fakeWriter(calls), bucket, now: () => Date.parse("2026-12-03T10:00:00Z"), log: { error() {}, warn() {} } }).run({ monthlyRows: nov, failed: [], today: "2026-12-03" });
  assert.equal(bucket.json.month, "2026-11");
  assert.equal(bucket.json.pool, 100);
  const names = calls.map((c) => c[0]);
  assert.ok(names.lastIndexOf("createLink") < names.indexOf("deactivateLink"), "the new links exist before the old go");
  assert.deepEqual(calls.filter((c) => c[0] === "deactivateLink").map((c) => c[1]), ["plink_o1", "plink_o2"]);
  assert.deepEqual(calls.filter((c) => c[0] === "archivePrice").map((c) => c[1]), ["price_o1", "price_o2", "price_o3", "price_o4", "price_o5"]);
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

test("a Stripe failure midway writes nothing and rethrows; the rerun uses the same idempotency keys", async () => {
  const calls = [];
  const bucket = fakeBucket();
  const log = { error() {}, warn() {} };
  await assert.rejects(createDonateStep({ writer: fakeWriter(calls, { failAt: 12 }), bucket, now: () => NOW, log }).run({ monthlyRows: ROWS, failed: [], today: "2026-11-03" }), /Stripe 500/);
  assert.equal(bucket.writes, 0);
  const again = [];
  await createDonateStep({ writer: fakeWriter(again), bucket, now: () => NOW, log }).run({ monthlyRows: ROWS, failed: [], today: "2026-11-04" });
  const keys = (list) => list.filter((c) => c[1]?.key).map((c) => c[1].key);
  assert.deepEqual(keys(again).slice(0, keys(calls).length), keys(calls));
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
