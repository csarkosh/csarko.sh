import { test } from "node:test";
import assert from "node:assert/strict";
import { createCache } from "../src/cache.mjs";
import { createFal, balanceOf, FAL_BILLING_URL } from "../src/collectors/fal.mjs";

/** The documented answer of GET /v1/account/billing?expand=credits (fal's OpenAPI page, read 2026-10-30). */
const DOCUMENTED = { username: "csarkosh", credits: { current_balance: 46.37, currency: "USD" } };

function fakeFetch(calls, { status = 200, body = DOCUMENTED } = {}) {
  return async (url, init) => {
    calls.push({ url, headers: init?.headers ?? {} });
    return { ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) };
  };
}

test("not configured without the admin key", () => {
  assert.equal(createFal({ adminKey: null, fetch: fakeFetch([]), cache: createCache() }).configured, false);
  assert.equal(createFal({ adminKey: "", fetch: fakeFetch([]), cache: createCache() }).configured, false);
  assert.equal(createFal({ adminKey: "k", fetch: fakeFetch([]), cache: createCache() }).configured, true);
});

test("balance calls the billing endpoint with expand=credits and the Key header, cached", async () => {
  const calls = [];
  const fal = createFal({ adminKey: "fal_admin_x", fetch: fakeFetch(calls), cache: createCache() });
  assert.deepEqual(await fal.balance(), { balance: 46.37, currency: "USD" });
  assert.equal(calls[0].url, FAL_BILLING_URL);
  assert.equal(calls[0].url, "https://api.fal.ai/v1/account/billing?expand=credits");
  assert.deepEqual(calls[0].headers, { accept: "application/json", authorization: "Key fal_admin_x", "user-agent": "csarko-admin" });
  await fal.balance();
  assert.equal(calls.length, 1, "cached");
});

test("a refused call throws with the status; an answer without a balance throws too", async () => {
  await assert.rejects(createFal({ adminKey: "k", fetch: fakeFetch([], { status: 403, body: { error: { type: "authorization_error", message: "scope" } } }), cache: createCache() }).balance(), /fal 403 on \/v1\/account\/billing/);
  await assert.rejects(createFal({ adminKey: "k", fetch: fakeFetch([], { body: { username: "x" } }), cache: createCache() }).balance(), /without a numeric credit balance/);
});

test("balanceOf reads the documented field first and the likely variants after", () => {
  assert.deepEqual(balanceOf(DOCUMENTED), { balance: 46.37, currency: "USD" });
  assert.deepEqual(balanceOf({ credits: { balance: "12.5", currency: "EUR" } }), { balance: 12.5, currency: "EUR" });
  assert.deepEqual(balanceOf({ balance: 3 }), { balance: 3, currency: "USD" });
  assert.deepEqual(balanceOf({ credit_balance: 0 }), { balance: 0, currency: "USD" }, "an empty balance is a measurement");
  assert.deepEqual(balanceOf({ current_balance: 7.25, currency: "USD" }), { balance: 7.25, currency: "USD" });
  assert.equal(balanceOf({ username: "x" }), null);
  assert.equal(balanceOf({ credits: { current_balance: "lots" } }), null);
  assert.equal(balanceOf(null), null);
});
