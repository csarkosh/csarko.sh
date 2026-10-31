// admin/api/test/stripe-write.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { UpstreamError } from "../src/http.mjs";
import { createStripeWriter } from "../src/collectors/stripe-write.mjs";

const KEY = "rk_live_51Abc_write_key_value";
function fake(calls, { status = 200, body = (c) => ({ id: `${c.path.split("/")[2].slice(0, -1)}_${calls.length}`, url: "https://buy.stripe.com/test" }) } = {}) {
  return async (url, init) => {
    const u = new URL(url);
    const c = { path: u.pathname, method: init?.method ?? "GET", headers: init?.headers ?? {}, body: init?.body ? Object.fromEntries(new URLSearchParams(init.body)) : null, query: Object.fromEntries(u.searchParams) };
    calls.push(c);
    if (status >= 400) return { ok: false, status, text: async () => JSON.stringify({ error: { message: `No such price: ${KEY}` } }) };
    if (c.method === "GET") return { ok: true, status: 200, json: async () => ({ object: "list", data: [{ id: "prod_x", name: "A prompt", metadata: { tier: "prompt" } }], has_more: false }) };
    return { ok: true, status: 200, json: async () => body(c) };
  };
}
const make = (calls, opts) => createStripeWriter({ key: KEY, fetch: fake(calls, opts), log: { error() {} } });

test("not configured without a key", () => {
  assert.equal(createStripeWriter({ key: null, fetch: fake([]) }).configured, false);
  assert.equal(make([]).configured, true);
});

test("a payment link carries the price, the metadata twice, the DONATION suffix, the redirect, submit_type donate and an Idempotency-Key", async () => {
  const calls = [];
  const link = await make(calls).createLink({ priceId: "price_1", door: "arkos", tier: "context", period: "2026-10-31", share: 0.03, redirectUrl: "https://donate.csarko.sh/thanks?door=arkos", key: "donate:link:2026-10-31:arkos:context:2026-10-31" });
  assert.equal(link.url, "https://buy.stripe.com/test");
  assert.ok(typeof link.id === "string" && link.id.length > 0);
  const c = calls[0];
  assert.equal(c.path, "/v1/payment_links");
  assert.equal(c.method, "POST");
  assert.equal(c.headers["Idempotency-Key"], "donate:link:2026-10-31:arkos:context:2026-10-31");
  assert.equal(c.headers["content-type"], "application/x-www-form-urlencoded");
  assert.equal(c.headers.authorization, `Bearer ${KEY}`);
  assert.deepEqual(c.body, {
    "line_items[0][price]": "price_1", "line_items[0][quantity]": "1", submit_type: "donate",
    "metadata[donate]": "1", "metadata[door]": "arkos", "metadata[tier]": "context", "metadata[period]": "2026-10-31", "metadata[share]": "0.03",
    "payment_intent_data[metadata][door]": "arkos", "payment_intent_data[metadata][tier]": "context", "payment_intent_data[metadata][period]": "2026-10-31", "payment_intent_data[metadata][share]": "0.03",
    "payment_intent_data[statement_descriptor_suffix]": "DONATION",
    "after_completion[type]": "redirect", "after_completion[redirect][url]": "https://donate.csarko.sh/thanks?door=arkos",
  });
});

test("products, prices, the custom price, deactivation and archiving hit the right paths with the right fields", async () => {
  const calls = [];
  const w = make(calls);
  assert.deepEqual(await w.listProducts(), [{ id: "prod_x", name: "A prompt", metadata: { tier: "prompt" } }], "the list's data, not the envelope");
  await w.createProduct({ name: "A prompt", tier: "prompt", key: "donate:product:prompt" });
  await w.createPrice({ product: "prod_1", usd: 9, key: "donate:price:2026-10-31:context:2026-10-31" });
  await w.createCustomPrice({ product: "prod_5", minimumUsd: 1, key: "donate:price:2026-10-31:own:2026-10-31" });
  await w.deactivateLink("plink_1");
  await w.archivePrice("price_1");
  assert.deepEqual(calls.map((c) => [c.method, c.path]), [["GET", "/v1/products"], ["POST", "/v1/products"], ["POST", "/v1/prices"], ["POST", "/v1/prices"], ["POST", "/v1/payment_links/plink_1"], ["POST", "/v1/prices/price_1"]]);
  assert.deepEqual(calls[0].query, { active: "true", limit: "100" });
  assert.deepEqual(calls[1].body, { name: "A prompt", "metadata[tier]": "prompt", "metadata[donate]": "1" });
  assert.deepEqual(calls[2].body, { product: "prod_1", currency: "usd", unit_amount: "900" });
  assert.deepEqual(calls[3].body, { product: "prod_5", currency: "usd", "custom_unit_amount[enabled]": "true", "custom_unit_amount[minimum]": "100" });
  assert.deepEqual(calls[4].body, { active: "false" });
  assert.deepEqual(calls[5].body, { active: "false" });
  assert.equal(calls[4].headers["Idempotency-Key"], undefined, "a deactivation needs no key");
});

test("a refusal is an UpstreamError with the status and the body, the key blanked", async () => {
  const calls = [];
  await assert.rejects(make(calls, { status: 400 }).archivePrice("price_x"), (e) => e instanceof UpstreamError && /^Stripe 400 on \/prices\/price_x: / .test(e.message) && !e.message.includes(KEY) && e.message.includes("[key]"));
});

test("prices carry a lookup key (taken over from an inactive holder) and metadata when given", async () => {
  const calls = [];
  const w = make(calls);
  await w.createPrice({ product: "prod_1", usd: 9, key: "k1", lookupKey: "donate:2026-10-31:context", metadata: { donate: "1", period: "2026-10-31", tier: "context", pool: "300" } });
  await w.createCustomPrice({ product: "prod_5", minimumUsd: 1, key: "k2", lookupKey: "donate:2026-10-31:own", metadata: { donate: "1" } });
  assert.deepEqual(calls[0].body, { product: "prod_1", currency: "usd", unit_amount: "900", lookup_key: "donate:2026-10-31:context", transfer_lookup_key: "true", "metadata[donate]": "1", "metadata[period]": "2026-10-31", "metadata[tier]": "context", "metadata[pool]": "300" });
  assert.deepEqual(calls[1].body, { product: "prod_5", currency: "usd", "custom_unit_amount[enabled]": "true", "custom_unit_amount[minimum]": "100", lookup_key: "donate:2026-10-31:own", transfer_lookup_key: "true", "metadata[donate]": "1" });
});

test("listPrices and listLinks read every active page, following starting_after while has_more", async () => {
  const calls = [];
  const pages = { "/v1/prices": [[{ id: "price_1" }, { id: "price_2" }], [{ id: "price_3" }]], "/v1/payment_links": [[{ id: "plink_1", url: "u" }]] };
  const fetch = async (url) => {
    const u = new URL(url);
    calls.push({ path: u.pathname, query: Object.fromEntries(u.searchParams) });
    const list = pages[u.pathname];
    const i = u.searchParams.has("starting_after") ? 1 : 0;
    return { ok: true, status: 200, json: async () => ({ data: list[i], has_more: i + 1 < list.length }) };
  };
  const w = createStripeWriter({ key: KEY, fetch, log: { error() {} } });
  assert.deepEqual((await w.listPrices()).map((p) => p.id), ["price_1", "price_2", "price_3"]);
  assert.deepEqual(calls.map((c) => c.query), [{ active: "true", limit: "100" }, { active: "true", limit: "100", starting_after: "price_2" }]);
  assert.deepEqual((await w.listLinks()).map((p) => p.id), ["plink_1"]);
  assert.equal(calls[2].path, "/v1/payment_links");
  assert.deepEqual(calls[2].query, { active: "true", limit: "100" });
});
