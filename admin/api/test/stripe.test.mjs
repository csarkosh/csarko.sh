import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createCache } from "../src/cache.mjs";
import { UpstreamError } from "../src/http.mjs";
import { createStripe, STRIPE_API, DEFAULT_SINCE_DAYS } from "../src/collectors/stripe.mjs";

const STRIPE = JSON.parse(readFileSync(new URL("./fixtures/finance-stripe.json", import.meta.url), "utf8"));
const KEY = "rk_live_51Abc_restricted_key_value";
const NOW = Date.parse("2026-10-28T23:10:00Z");

/** A fake Stripe: `pages` maps a path to the list pages it answers in turn (the first without `starting_after`, the next with the last id). */
function fakeFetch(calls, { pages = {}, balance = STRIPE.balance, status = 200, body = null } = {}) {
  return async (url, init) => {
    const u = new URL(url);
    calls.push({ url, path: u.pathname, params: Object.fromEntries(u.searchParams), headers: init?.headers ?? {} });
    if (status >= 400) return { ok: false, status, text: async () => JSON.stringify(body ?? { error: { message: `Invalid API Key provided: ${KEY}`, type: "invalid_request_error" } }) };
    if (u.pathname === "/v1/balance") return { ok: true, status: 200, json: async () => balance };
    const list = pages[u.pathname] ?? [];
    const after = u.searchParams.get("starting_after");
    const page = after === null ? list[0] : list.find((p, i) => i > 0 && list[i - 1].data.at(-1).id === after);
    return { ok: true, status: 200, json: async () => page ?? { object: "list", data: [], has_more: false } };
  };
}

const make = (calls, opts) => createStripe({ key: KEY, fetch: fakeFetch(calls, opts), cache: createCache(), now: () => NOW });

test("not configured without the key", () => {
  assert.equal(createStripe({ key: null, fetch: fakeFetch([]), cache: createCache() }).configured, false);
  assert.equal(createStripe({ key: "", fetch: fakeFetch([]), cache: createCache() }).configured, false);
  assert.equal(createStripe({ key: KEY, fetch: fakeFetch([]), cache: createCache() }).configured, true);
});

test("transactions: every page with created[gte] and limit 100, paged by starting_after while has_more, the Bearer header and no Stripe-Version, newest first, cached", async () => {
  const calls = [];
  const [a, b, c, d, ...rest] = STRIPE.transactions;
  const pages = { "/v1/balance_transactions": [
    { object: "list", data: [a, b, c], has_more: true },
    { object: "list", data: [d, ...rest], has_more: false },
  ] };
  const stripe = make(calls, { pages });
  const since = 1759276800;
  const out = await stripe.transactions(since);
  assert.equal(out.length, STRIPE.transactions.length, "both pages");
  assert.deepEqual(out.map((t) => t.id), STRIPE.transactions.map((t) => t.id), "newest first");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].path, "/v1/balance_transactions");
  assert.ok(calls[0].url.startsWith(`${STRIPE_API}/balance_transactions?`));
  assert.deepEqual(calls[0].params, { limit: "100", "created[gte]": String(since), "expand[]": "data.source" });
  assert.equal(calls[0].params["expand[]"], "data.source");
  assert.deepEqual(calls[1].params, { limit: "100", "created[gte]": String(since), "expand[]": "data.source", starting_after: c.id }, "the second page starts after the first's last id");
  assert.deepEqual(calls[0].headers, { accept: "application/json", authorization: `Bearer ${KEY}`, "user-agent": "csarko-admin" }, "no Stripe-Version: the account's default applies");
  await stripe.transactions(since);
  assert.equal(calls.length, 2, "cached");
  await stripe.transactions(since - 1);
  assert.equal(calls.length, 4, "another window is another read, both pages again");
});

test("transactions with no since reaches 400 days back; payouts page the same way; balance is one call", async () => {
  const calls = [];
  const stripe = make(calls, { pages: { "/v1/payouts": [{ object: "list", data: STRIPE.payouts, has_more: false }] } });
  await stripe.transactions();
  assert.equal(calls[0].params["created[gte]"], String(Math.floor(NOW / 1000) - DEFAULT_SINCE_DAYS * 86_400));
  assert.equal(calls[0].params["expand[]"], "data.source");
  const payouts = await stripe.payouts(1788000000);
  assert.deepEqual(payouts.map((p) => p.id), ["po_1Qp2", "po_1Qp1"]);
  assert.equal(calls[1].path, "/v1/payouts");
  assert.deepEqual(calls[1].params, { limit: "100", "created[gte]": "1788000000" });
  assert.deepEqual(await stripe.balance(), STRIPE.balance);
  assert.equal(calls[2].url, `${STRIPE_API}/balance`);
  assert.deepEqual(calls[2].params, {});
});

test("a 401 is an UpstreamError with the status and the body's first 200 characters, the key blanked, and is not cached", async () => {
  const calls = [];
  const stripe = make(calls, { status: 401 });
  await assert.rejects(stripe.transactions(1), (e) => {
    assert.ok(e instanceof UpstreamError);
    assert.match(e.message, /^Stripe 401 on \/balance_transactions: /);
    assert.ok(!e.message.includes(KEY), "never the key");
    assert.ok(e.message.includes("[key]"));
    return true;
  });
  await assert.rejects(stripe.balance(), /Stripe 401 on \/balance: /);
  await assert.rejects(stripe.transactions(1));
  assert.equal(calls.filter((c) => c.path === "/v1/balance_transactions").length, 2, "a failure is retried, not remembered");
  const long = [];
  await assert.rejects(make(long, { status: 500, body: { error: { message: "x".repeat(500) } } }).payouts(1), (e) => e.message.length < 260);
});
