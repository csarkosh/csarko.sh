### Task 2: The Stripe writer

**Files:**
- Create: `admin/api/src/collectors/stripe-write.mjs`
- Test: `admin/api/test/stripe-write.test.mjs`

**Interfaces:**
- Consumes: `UpstreamError` from `admin/api/src/http.mjs`; the `blank` and `headers` pattern from `collectors/stripe.mjs`.
- Produces: `createStripeWriter({ key, fetch, log = console })` with `configured` and these async methods, every write a `POST` to `https://api.stripe.com/v1/...` with body `application/x-www-form-urlencoded` and an `Idempotency-Key` header when `key` is given:
  - `listProducts(): [{ id, name, metadata }]` → `GET /products?active=true&limit=100`, the response's `data` (one page is enough: five products).
  - `createProduct({ name, tier, key }): { id }` → `POST /products` with `name`, `metadata[tier]`.
  - `createPrice({ product, usd, key }): { id }` → `POST /prices` with `product`, `currency=usd`, `unit_amount=${usd * 100}`.
  - `createCustomPrice({ product, minimumUsd, key }): { id }` → `POST /prices` with `product`, `currency=usd`, `custom_unit_amount[enabled]=true`, `custom_unit_amount[minimum]=${minimumUsd * 100}`.
  - `createLink({ priceId, door, tier, month, share, redirectUrl, key }): { id, url }` → `POST /payment_links` with `line_items[0][price]`, `line_items[0][quantity]=1`, `submit_type=donate`, `metadata[door|tier|month|share]`, `payment_intent_data[metadata][door|tier|month|share]`, `payment_intent_data[statement_descriptor_suffix]=DONATION`, `after_completion[type]=redirect`, `after_completion[redirect][url]=${redirectUrl}`.
  - `deactivateLink(id)` → `POST /payment_links/${id}` with `active=false`; `archivePrice(id)` → `POST /prices/${id}` with `active=false`.
  - Any non-2xx is an `UpstreamError` `Stripe ${status} on ${path}: ${first 200 chars, key blanked}`.

- [ ] **Step 1: Write the failing tests**

```js
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
  const link = await make(calls).createLink({ priceId: "price_1", door: "arkos", tier: "context", month: "2026-10", share: 0.03, redirectUrl: "https://donate.csarko.sh/thanks?door=arkos", key: "donate:link:2026-10:arkos:context" });
  assert.equal(link.url, "https://buy.stripe.com/test");
  assert.ok(typeof link.id === "string" && link.id.length > 0);
  const c = calls[0];
  assert.equal(c.path, "/v1/payment_links");
  assert.equal(c.method, "POST");
  assert.equal(c.headers["Idempotency-Key"], "donate:link:2026-10:arkos:context");
  assert.equal(c.headers["content-type"], "application/x-www-form-urlencoded");
  assert.equal(c.headers.authorization, `Bearer ${KEY}`);
  assert.deepEqual(c.body, {
    "line_items[0][price]": "price_1", "line_items[0][quantity]": "1", submit_type: "donate",
    "metadata[door]": "arkos", "metadata[tier]": "context", "metadata[month]": "2026-10", "metadata[share]": "0.03",
    "payment_intent_data[metadata][door]": "arkos", "payment_intent_data[metadata][tier]": "context", "payment_intent_data[metadata][month]": "2026-10", "payment_intent_data[metadata][share]": "0.03",
    "payment_intent_data[statement_descriptor_suffix]": "DONATION",
    "after_completion[type]": "redirect", "after_completion[redirect][url]": "https://donate.csarko.sh/thanks?door=arkos",
  });
});

test("products, prices, the custom price, deactivation and archiving hit the right paths with the right fields", async () => {
  const calls = [];
  const w = make(calls);
  assert.deepEqual(await w.listProducts(), [{ id: "prod_x", name: "A prompt", metadata: { tier: "prompt" } }], "the list's data, not the envelope");
  await w.createProduct({ name: "A prompt", tier: "prompt", key: "donate:product:prompt" });
  await w.createPrice({ product: "prod_1", usd: 9, key: "donate:price:2026-10:context" });
  await w.createCustomPrice({ product: "prod_5", minimumUsd: 1, key: "donate:price:2026-10:own" });
  await w.deactivateLink("plink_1");
  await w.archivePrice("price_1");
  assert.deepEqual(calls.map((c) => [c.method, c.path]), [["GET", "/v1/products"], ["POST", "/v1/products"], ["POST", "/v1/prices"], ["POST", "/v1/prices"], ["POST", "/v1/payment_links/plink_1"], ["POST", "/v1/prices/price_1"]]);
  assert.deepEqual(calls[0].query, { active: "true", limit: "100" });
  assert.deepEqual(calls[1].body, { name: "A prompt", "metadata[tier]": "prompt" });
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd admin/api && node --test test/stripe-write.test.mjs`
Expected: FAIL, `Cannot find module .../collectors/stripe-write.mjs`.

- [ ] **Step 3: Implement `createStripeWriter` in `stripe-write.mjs`**

One private `post(path, fields, key)` that builds a `URLSearchParams` from `fields` (numbers stringified, `share` as `String(share)`), sets `content-type`, `authorization`, `user-agent: csarko-admin` and `Idempotency-Key` when `key` is a string, and one `get(path, params)`. The module comment states what the restricted key may do (Products write, Payment Links write, nothing else) and that nothing read here is ever passed to a page.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd admin/api && node --test test/stripe-write.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add admin/api/src/collectors/stripe-write.mjs admin/api/test/stripe-write.test.mjs
git commit -m "donate: the Stripe writer, products, prices and payment links behind a restricted key"
```

---

