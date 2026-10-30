# Buy Me Tokens (donate.csarko.sh) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static tip page at donate.csarko.sh whose four prices are shares of last month's real cloud bill, set once a month by the admin snapshot through Stripe Payment Links, with one quiet "Buy me tokens" entrance on every csarko.sh project card and apps page.

**Architecture:** Three pieces. (1) The admin API (`admin/api`, Node 22, Cloud Run) gains a `donate` step inside the Finance snapshot: it reads the pool from the Finance rows, writes Products, Prices and Payment Links through a restricted Stripe key, and publishes one `prices.json` to a public GCS bucket. (2) A fourth Firebase Hosting site, built by `donate/build.mjs` from the shared `standaloneShell`, with the pictures the projects page already uses, the baked prices as fallback and a fetch of the live JSON. (3) Entrances: a `tokensLink` on each `/projects` card, a bar link on each apps page, and a README snippet format that the apps build drops. Everything in Terraform.

**Tech Stack:** Node 22 (`node --test`), Python 3 with Pillow for pictures, Terraform (google, google-beta, aws providers), Firebase Hosting, Stripe REST API (`/v1/products`, `/v1/prices`, `/v1/payment_links`), Google Cloud Storage, Firestore (the existing snapshot store).

**Spec:** `docs/superpowers/specs/2026-10-30-donate-site-design.md`

## Global Constraints

- No em-dash anywhere in page copy, docs or code comments that reach a page; `deploy.sh` and `apps/deploy.sh` already refuse one, `donate/deploy.sh` does too.
- No email address or phone number on any page, in any JSON the page reads, or in any test fixture committed to the repo. Both repos are public.
- Every colour on a page is a theme token in both blocks, except the icon's ten fixed fills, which live in SVG attributes, not CSS (`check.py` scans CSS only).
- The tiers are exactly: `A prompt` 1%, `A long context window` 3%, `A whole agent run` 10%, `A fine-tune` 30%; each price is the pool times its share **rounded up** to the next whole dollar, floored at $1; the fifth row is "Your own number" with a $1 minimum.
- Prices are computed from the month that most recently closed, by the first daily snapshot on or after the 3rd; a failed configured provider delays a day, up to the 7th.
- The pool excludes rows whose project is `commercial`; nothing is routed there yet.
- The charge statement is `CSARKO* DONATION`: the account's shortened descriptor is already `CSARKO`, so every link sets `payment_intent_data[statement_descriptor_suffix]=DONATION`.
- Doors and their URLs: `/arkos` (ide-arkos), `/macstats` (app-macstats), `/visits` (lib-visits), `/last-trail` (the-last-trail), `/hallway` (who-is-standing-in-my-hallway), `/` (the whole body of work, door key `all`), `/dayhike` (day-hike, not shipped until Cyrus's screenshot exists).
- The entrance is the icon plus the words `Buy me tokens`, once per page, body-text size and weight, no accent colour, nothing animated.
- The icon is one 32 by 22 pixel map with `shape-rendering="crispEdges"`, the heart's cleft about a quarter of the height deep, one gold token at the lower right, these ten fills: heart `#6b1113` `#e5484d` `#b32d33` `#ff7a80` `#ffd6d8`, gold `#7a5600` `#f0c040` `#c8962a` `#ffe08a` `#fff7d6`.
- Nothing generated goes live unseen: the icon and the bare door's graphic are shown to Cyrus before they are committed.
- The site launches only after the step's first run has written October's JSON (around Nov 3). `donate/build.mjs` fails without a JSON; `donate/deploy.sh` never uses a local one.
- Terraform: plan first, read every line; the plan may add the new resources and roll the admin service's revision for its new env, and nothing else may change or be destroyed. Apply from `~/Projects/csarko.sh` master.
- Credentials never pass through Terraform or the repo: Cyrus adds the Stripe write key as a secret version himself.
- Privacy: no donor identity reaches the Finance page; the only new field on an income row is `door`.
- Commit after every task's tests pass; the Co-Authored-By line is `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

1. **A month whose net is zero or negative** (credits larger than spend): the four prices must all be $1, the bill sentence must read $0, nothing may throw. Test in Task 1.
2. **The step dies halfway through Stripe** (links made for two doors, then a 500): tomorrow's run must finish the month with no duplicate Products, Prices or Links, and `prices.json` must not have been written by the failed run. Test in Task 3.
3. **The live JSON is unreachable or older than the baked one**: the page must show the baked prices and say which month they are from, never an empty card or a $NaN button. Test in Task 7.
4. **A charge with no `door` metadata** (a Stripe dashboard payment, an old link): the by-door split must count it under `unknown`, and the totals must still equal the plain income totals. Test in Task 4.
5. **`/thanks?door=<junk>`**: the page must fall back to the bare door's link and must not reflect the value into the markup. Test in Task 7.

---

### Task 1: Doors, tiers and prices (pure)

**Files:**
- Create: `admin/api/src/donate/doors.mjs`
- Create: `admin/api/src/donate/prices.mjs`
- Modify: `admin/api/src/finance/projects.mjs:19-24` (the `commercial` key)
- Test: `admin/api/test/donate-prices.test.mjs`
- Modify: `admin/api/test/finance.test.mjs` (the projects tests that pin `PROJECT_KEYS`)

**Interfaces:**
- Consumes: `projectOf(row)`, `cents`, `monthOf`, `addMonths` from `admin/api/src/finance/`.
- Produces (`doors.mjs`):
  - `DONATE_URL = "https://donate.csarko.sh"`, `PRICES_BUCKET = "csarko-sh-donate-prices"`, `PRICES_OBJECT = "prices.json"`, `PRICES_URL = "https://storage.googleapis.com/csarko-sh-donate-prices/prices.json"`.
  - `TIERS: [{ key, name, share }]` in order `prompt` 0.01, `context` 0.03, `run` 0.10, `finetune` 0.30; `CUSTOM = { key: "own", name: "Your own number", minimumUsd: 1 }`; `TIER_KEYS = ["prompt","context","run","finetune","own"]`.
  - `DOORS: [{ door, slug, name, kind, shipped, path, headline, lead, captions: [4 strings], thanks, back: { label, href }, picture: { source, dark?, focusY? } }]` for the seven doors. `path` is `/` for `all`, else `/${door}`. `picture.source` is relative to `.agents/skills/site-quality/assets/` (`apps/ide-arkos.png`, `apps/app-macstats.png`, `apps/lib-visits.png` with `dark: "apps/lib-visits-dark.png"`, `films/the-last-trail.jpg` with `focusY: 0.3`, `films/who-is-standing-in-my-hallway.jpg` with a `focusY` the builder picks, `donate/body-of-work.png` for `all`, `null` for `dayhike`). `shipped` is `true` for all but `dayhike`. The Arkos `lead`, its four captions and its `thanks` are the spec's sentences verbatim; the films' captions are the spec's; the other copy is the builder's, in the same register.
  - `doorOf(slug)` → the door whose `slug` matches, else `null`; `doorByKey(door)` → by `door`, else `null`; `shippedDoors()`.
- Produces (`prices.mjs`):
  - `PRICE_DAY = 3`, `LATE_DAY = 7`, `FLOOR_USD = 1`.
  - `poolOf(monthlyRows, month): number` the unrounded sum of `amount` over rows with `r.month === month` and `projectOf(r) !== "commercial"`, never below 0.
  - `priceOf(pool, share): number` = `Math.max(FLOOR_USD, Math.ceil(pool * share - 1e-9))`.
  - `pricesOf(pool): [{ tier, name, share, label, usd }]` over `TIERS`, `label` = `about ${Math.round(share * 100)}%`.
  - `decide({ today, current, failed, doors }): { run: boolean, reason: string, month: string, newMonth: boolean, pending: string[] }` where `month = addMonths(monthOf(today), -1)`, `current` is the published JSON or `null`, `failed` the provider keys whose collector failed today, `doors` the shipped door keys. Rules, in order: if `current?.month === month` and every door is in `current.doors` → `run: false, reason: "done"`; if day of month `< PRICE_DAY` → `run: false, reason: "before the 3rd"`; if `failed.length > 0` and day `< LATE_DAY` → `run: false, reason: "waiting on ${failed.join(", ")}"`; else `run: true`, `newMonth = current?.month !== month`, `pending` = all doors when `newMonth`, else the doors missing from `current.doors`.

- [ ] **Step 1: Write the failing tests**

```js
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
```

In `finance.test.mjs`, change the projects assertion to `assert.deepEqual(PROJECT_KEYS, ["films", "dayhike", "site", "commercial", "other"])` and add `assert.equal(projectOf({ provider: "gcp", where: "magicpixel-487014" }), "other", "nothing is routed to commercial yet")`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd admin/api && node --test test/donate-prices.test.mjs test/finance.test.mjs`
Expected: FAIL, `Cannot find module .../donate/doors.mjs`, and the `PROJECT_KEYS` assertion.

- [ ] **Step 3: Add `{ key: "commercial", label: "Commercial" }` to `PROJECTS` in `projects.mjs`, between `site` and `other`, with the comment that no rule routes to it yet**

`projectsTable` needs no change: it iterates `PROJECT_KEYS`. The Finance page's palette has four project tones (`--proj-1` to `--proj-4`); add `--proj-5` to both `admin:palette` blocks in `admin/public/theme.css` for the fifth row (a tone the dataviz validator passes at 3:1 against both surfaces; run `check.py --admin` in Task 11).

- [ ] **Step 4: Write `doors.mjs` and `prices.mjs` to the Interfaces block**

`decide` reads the day of month from `today.slice(8, 10)`. The copy is written in Cyrus's register (short, dry, first person); the Arkos sentences are copied from the spec.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd admin/api && npm test`
Expected: all pass, the new file included.

- [ ] **Step 6: Commit**

```bash
git add admin/api/src/donate admin/api/src/finance/projects.mjs admin/api/test/donate-prices.test.mjs admin/api/test/finance.test.mjs admin/public/theme.css
git commit -m "donate: doors, tiers and the price rule, pure"
```

---

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

### Task 3: The prices bucket and the monthly step

**Files:**
- Create: `admin/api/src/donate/bucket.mjs`
- Create: `admin/api/src/donate/step.mjs`
- Test: `admin/api/test/donate-step.test.mjs`

**Interfaces:**
- Consumes: `decide`, `poolOf`, `pricesOf` (Task 1); `TIERS`, `CUSTOM`, `TIER_KEYS`, `shippedDoors`, `DONATE_URL`, `PRICES_OBJECT` (Task 1); the writer (Task 2); `cents` from `finance/rows.mjs`.
- Produces (`bucket.mjs`): `createPricesBucket({ bucket, projectId, storage = null, log = console })` with `configured` (a bucket name is set), `async read(): object | null` (downloads `prices.json`, `null` on a 404, throws otherwise), `async write(json)` (saves `JSON.stringify(json, null, 1)` with `contentType: "application/json"`, `metadata: { cacheControl: "public, max-age=300" }`). `storage` is injected for tests; the real one is `new (await import("@google-cloud/storage")).Storage({ projectId })`, created lazily on first use as `collectors/ledgers.mjs` does.
- Produces (`step.mjs`): `createDonateStep({ writer, bucket, now = Date.now, log = console })` with `configured` (writer and bucket both configured) and `async run({ monthlyRows, failed, today }): { ran: boolean, reason: string, record: { month, pool, at, doors: string[] } | null }`. The published JSON's shape:

```json
{
  "month": "2026-10", "pool": 288, "at": "2026-11-03T10:00:12.000Z",
  "tiers": [{ "tier": "prompt", "name": "A prompt", "share": 0.01, "label": "about 1%", "usd": 3, "priceId": "price_..." }],
  "custom": { "priceId": "price_...", "minimumUsd": 1 },
  "products": { "prompt": "prod_...", "context": "prod_...", "run": "prod_...", "finetune": "prod_...", "own": "prod_..." },
  "doors": { "arkos": { "links": { "prompt": { "id": "plink_...", "url": "https://buy.stripe.com/..." }, "own": { "id": "...", "url": "..." } } } }
}
```

  `record` is `{ month, pool, at, doors: Object.keys(json.doors) }` of the JSON now in the bucket (the new one when it ran, the current one when it did not, `null` when none).

  The algorithm of `run`: `current = await bucket.read()`; `d = decide({ today, current, failed, doors: shippedDoors().map((x) => x.door) })`; if `!d.run` return `{ ran: false, reason: d.reason, record }`. If `d.newMonth`: `pool = cents(poolOf(monthlyRows, d.month))`, `tiers = pricesOf(pool)`; `products` = for each of `[...TIERS, CUSTOM]` the id of the active product whose `metadata.tier` matches from `listProducts()`, else `createProduct({ name, tier, key: "donate:product:<tier>" })`; each tier's `priceId` from `createPrice({ product, usd, key: "donate:price:<month>:<tier>" })`; `custom.priceId` from `createCustomPrice({ product: products.own, minimumUsd: 1, key: "donate:price:<month>:own" })`. Else reuse `current.tiers`, `current.custom`, `current.products`, `current.pool`. For every door in `d.pending`, for each of the five tier keys: `createLink({ priceId, door, tier, month, share (0 for own), redirectUrl: `${DONATE_URL}/thanks?door=${door}`, key: "donate:link:<month>:<door>:<tier>" })`. Build `next` (the current doors kept when not a new month, the pending added). If `d.newMonth && current !== null`: deactivate every link id in `current.doors[*].links[*].id`, archive every `current.tiers[*].priceId` and `current.custom.priceId`, each failure logged and not fatal. `await bucket.write(next)`. Return `{ ran: true, reason: d.reason, record }`. Any Stripe failure before `write` propagates (the caller records it as `errors.donate`), and nothing is written.

- [ ] **Step 1: Write the failing tests**

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd admin/api && node --test test/donate-step.test.mjs`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement `bucket.mjs` and `step.mjs` to the Interfaces block**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd admin/api && node --test test/donate-step.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add admin/api/src/donate/bucket.mjs admin/api/src/donate/step.mjs admin/api/test/donate-step.test.mjs
git commit -m "donate: the monthly step, idempotent, and the public prices object"
```

---

### Task 4: Wire the step into the snapshot; tips by door

**Files:**
- Modify: `admin/api/src/config.mjs` (a `donate` block)
- Modify: `admin/api/src/server.mjs` (build the step, pass `donate`)
- Modify: `admin/api/src/finance-queries.mjs` (`donate` option, `SOURCE_ENV.donate`, `snapshotPart`, the `income` query)
- Modify: `admin/api/src/collectors/stripe.mjs` (`expand[]=data.source` on `transactions`)
- Modify: `admin/api/src/finance/income.mjs` (`door` on a row, `incomeByDoor`)
- Modify: `admin/CONTRACT.md` (the Income section)
- Modify: `admin/api/README.md` (the environment table: `STRIPE_WRITE_KEY`, `DONATE_BUCKET`, `DONATE_URL`)
- Test: `admin/api/test/finance.test.mjs`, `admin/api/test/finance-queries.test.mjs`, `admin/api/test/stripe.test.mjs`, `admin/api/test/fixtures/finance-stripe.json`

**Interfaces:**
- Consumes: `createDonateStep`, `createPricesBucket` (Task 3), `createStripeWriter` (Task 2), `doorByKey` (Task 1).
- Produces:
  - `readConfig` gains `donate: { bucket: text(env.DONATE_BUCKET), url: text(env.DONATE_URL, "https://donate.csarko.sh"), stripeWriteKey: secret(env.STRIPE_WRITE_KEY) }`.
  - `createFinanceQueries({ ..., donate = null })`; `SOURCE_ENV.donate = "STRIPE_WRITE_KEY"`, `SOURCE_LABELS.donate = "Tip prices"`.
  - In `snapshotPart`: `const loaded = assemble({ snapshot: null, aws, gcp, github, modal, fal: falData, claude, today })` (hoisted out of the `kpiValues` call); `const failed = PROVIDERS.filter((p) => h.errors[p] !== undefined || modalHints.errors[p] !== undefined)`; `const donateOut = donate === null ? null : await part(h, "donate", donate.configured, () => donate.run({ monthlyRows: loaded.monthlyRows, failed, today }))`; the returned `finance` gains `donate: donateOut?.record ?? latest?.finance?.donate ?? null` (carried forward like `claude`).
  - `stripe.transactions()` sends `expand[]=data.source` so each balance transaction carries its charge; `donationsOf` adds `door: typeof t.source?.metadata?.door === "string" && t.source.metadata.door !== "" ? t.source.metadata.door : null` and nothing else from `source`.
  - `incomeByDoor(rows, months): [{ door, label, gross, fees, net, count }]`, `door` `"unknown"` for null, `label` from `doorByKey(door)?.name ?? (door === "all" ? "The whole body of work" : "Unknown")`, sorted by `net` descending then `door`.
  - The `income` query gains `byDoor: incomeByDoor(income.rows, months)` and `prices: snapshot?.finance?.donate ? { month, pool, at } : null` (null throughout when Stripe is not configured).

- [ ] **Step 1: Write the failing tests**

In `stripe.test.mjs`, in the transactions test, add `assert.equal(calls[0].params["expand[]"], "data.source")`.

In `finance.test.mjs` add:

```js
import { incomeByDoor } from "../src/finance/income.mjs";
test("income rows carry the charge's door and nothing else from the charge; the by-door split sums to the totals, unknown for a charge without one", () => {
  const rows = donationsOf(STRIPE.transactions);
  assert.ok(rows.some((r) => r.door === "arkos"));
  assert.ok(rows.every((r) => !("source" in r) && !("email" in r) && !("name" in r)));
  const by = incomeByDoor(rows, ["2026-10"]);
  const all = incomeFor(rows, ["2026-10"]);
  assert.equal(by.reduce((n, d) => n + d.net, 0).toFixed(2), all.net.toFixed(2));
  assert.equal(by.reduce((n, d) => n + d.count, 0), all.count);
  assert.deepEqual(by.find((d) => d.door === "unknown").label, "Unknown");
  assert.equal(by.find((d) => d.door === "arkos").label, "Arkos IDE");
  assert.ok(by.every((d, i) => i === 0 || by[i - 1].net >= d.net));
});
```

Edit `fixtures/finance-stripe.json`: give each `charge` transaction a `source: { object: "charge", metadata: { door: "arkos" | "all" } }` and leave one with `source: { object: "charge", metadata: {} }`. No name, email or description anywhere in the fixture.

In `finance-queries.test.mjs`, extend `fakes()` with `donate: { configured: true, async run(a) { calls.push(`donate:run:${a.today}:${a.failed.join("|")}`); return { ran: true, reason: "new month", record: { month: "2026-09", pool: 150, at: "2026-10-28T10:00:00Z", doors: ["arkos"] } }; } }` passed through to `createFinanceQueries`, and add:

```js
test("the snapshot runs the donate step with the month's rows and the failed providers, stores its record and carries it forward", async () => {
  const f = fakes({ gcpFail: true });
  const store = createMemoryStore();
  const q = createFinanceQueries({ ...f, store, now: () => NOW, log });
  const part = await q.snapshotPart();
  assert.ok(f.calls.includes("donate:run:2026-10-28:gcp"));
  assert.deepEqual(part.finance.donate, { month: "2026-09", pool: 150, at: "2026-10-28T10:00:00Z", doors: ["arkos"] });
  await store.writeSnapshot("2026-10-28", part);
  const f2 = fakes();
  f2.donate.run = async () => ({ ran: false, reason: "done", record: null });
  const next = await createFinanceQueries({ ...f2, store, now: () => NOW + 86_400_000, log }).snapshotPart();
  assert.deepEqual(next.finance.donate, part.finance.donate, "a run that did nothing keeps yesterday's record");
});
test("a donate step that throws is errors.donate and the snapshot still has its finance part", async () => {
  const f = fakes();
  f.donate.run = async () => { throw new Error("Stripe 500 on /payment_links"); };
  const part = await createFinanceQueries({ ...f, store: createMemoryStore(), now: () => NOW, log }).snapshotPart();
  assert.equal(part.finance.errors.donate, "Stripe 500 on /payment_links");
  assert.ok(part.finance.aws !== null);
});
test("not configured, the donate step is a hint, not a call", async () => {
  const f = fakes();
  f.donate.configured = false;
  const part = await createFinanceQueries({ ...f, store: createMemoryStore(), now: () => NOW, log }).snapshotPart();
  assert.equal(part.finance.notConfigured.donate, "STRIPE_WRITE_KEY");
  assert.ok(!f.calls.some((c) => c.startsWith("donate:run")));
});
test("income carries the by-door split and the prices record from the snapshot", async () => {
  const f = fakes();
  const store = createMemoryStore();
  await store.writeSnapshot("2026-10-27", { finance: { donate: { month: "2026-09", pool: 150, at: "2026-10-03T10:00:00Z", doors: ["arkos"] } } });
  const out = await createFinanceQueries({ ...f, store, now: () => NOW, log }).income("month");
  assert.ok(Array.isArray(out.byDoor) && out.byDoor.length > 0);
  assert.deepEqual(out.prices, { month: "2026-09", pool: 150, at: "2026-10-03T10:00:00Z" });
  const off = await createFinanceQueries({ ...fakes({ stripeOn: false }), store, now: () => NOW, log }).income("month");
  assert.equal(off.byDoor, null);
  assert.equal(off.prices, null);
});
```

Check the existing `fakes()` callers still pass: `createFinanceQueries` must accept `donate` undefined.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd admin/api && npm test`
Expected: the new assertions fail; everything else still passes.

- [ ] **Step 3: Implement the changes listed in Interfaces, in `config.mjs`, `server.mjs`, `finance-queries.mjs`, `stripe.mjs`, `income.mjs`**

In `server.mjs`: `const donate = createDonateStep({ writer: createStripeWriter({ key: config.donate.stripeWriteKey, fetch, log }), bucket: createPricesBucket({ bucket: config.donate.bucket, projectId: config.projectId, log }), log })`, passed as `donate` to `createFinanceQueries`; add `config.donate.stripeWriteKey === null && "STRIPE_WRITE_KEY"` and `!config.donate.bucket && "DONATE_BUCKET"` to the `unconfigured` list. In `stripe.mjs` the collector comment says the expansion brings the charge's billing details into memory and that `income.mjs` keeps only `door`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd admin/api && npm test`
Expected: PASS.

- [ ] **Step 5: Update `admin/CONTRACT.md` (Income: `byDoor` and `prices` with one example each, the `door` rule, the snapshot's `finance.donate` record and `errors.donate`/`notConfigured.donate`) and `admin/api/README.md` (the three new variables in the environment table, the step in the snapshot's description)**

- [ ] **Step 6: Commit**

```bash
git add admin/api admin/CONTRACT.md
git commit -m "donate: the step runs in the daily snapshot; tips split by door"
```

---

### Task 5: Infrastructure

**Files:**
- Modify: `_infra/modules/gcp-admin-api/variables.tf` (`secret_ids`, `seeded_secret_ids`, new `donate_prices_bucket`, `donate_origin`)
- Modify: `_infra/modules/gcp-admin-api/main.tf` (the bucket, its two IAM members, two env vars)
- Modify: `_infra/modules/gcp-admin-api/outputs.tf` (`donate_prices_bucket`)
- Modify: `_infra/variables.tf` (`donate_domain_name`, `donate_hosting_site_id`)
- Modify: `_infra/main.tf` (`module "gcp_hosting_donate"`, the CNAME, the module inputs)
- Modify: `_infra/outputs.tf` (`donate_hosting_site_id`, `donate_hosting_default_url`, `donate_custom_domain_state`, `donate_site_url`, `donate_prices_bucket`)
- Modify: `firebase.json` (a fourth hosting entry)
- Test: `.agents/skills/site-quality/tests/firebase.test.mjs`

**Interfaces:**
- Produces: Terraform outputs `donate_hosting_site_id` = `csarko-sh-donate`, `donate_hosting_default_url`, `donate_custom_domain_state`, `donate_site_url` = `https://donate.csarko.sh`, `donate_prices_bucket` = `csarko-sh-donate-prices`; the admin service's env `DONATE_BUCKET`, `DONATE_URL`, `STRIPE_WRITE_KEY` (secret `stripe-write-key`, seeded `unset`).
- The bucket: `google_storage_bucket.donate_prices` with `uniform_bucket_level_access = true`, `public_access_prevention = "inherited"`, `force_destroy = false`, `cors { origin = [var.donate_origin, "http://localhost:8789"], method = ["GET"], response_header = ["Content-Type"], max_age_seconds = 3600 }`; `google_storage_bucket_iam_member.donate_public` (`allUsers`, `roles/storage.objectViewer`); `google_storage_bucket_iam_member.admin_writes_donate` (the admin service account, `roles/storage.objectUser`).
- The hosting entry: `site: "csarko-sh-donate"`, `public: "donate/public"`, `ignore: ["**/.*"]`, `cleanUrls: true`, `trailingSlash: false`, no rewrites, no redirects, the apps site's headers with the CSP `default-src 'none'; script-src 'self'; connect-src 'self' https://storage.googleapis.com; img-src 'self'; font-src 'self'; style-src 'self' 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; upgrade-insecure-requests`, the same cache rules as the apps site plus `/icon.svg` at `public, max-age=86400`.

- [ ] **Step 1: Write the failing test**

```js
// appended to .agents/skills/site-quality/tests/firebase.test.mjs
test("the donate site: its own entry, a CSP that reaches only the prices bucket, no rewrite and no redirect", () => {
  const donate = fb.hosting.find((h) => h.site === "csarko-sh-donate");
  assert.equal(donate.public, "donate/public");
  assert.equal(donate.cleanUrls, true);
  assert.equal(donate.trailingSlash, false);
  assert.equal(donate.rewrites, undefined);
  assert.equal(donate.redirects, undefined);
  const csp = donate.headers.find((h) => h.source === "**").headers.find((h) => h.key === "Content-Security-Policy").value;
  assert.ok(csp.includes("connect-src 'self' https://storage.googleapis.com;"));
  assert.ok(csp.includes("script-src 'self';"));
  assert.ok(csp.includes("form-action 'none'"));
  assert.ok(!csp.includes("stripe"), "Stripe is a navigation, not a request from the page");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test .agents/skills/site-quality/tests/firebase.test.mjs`
Expected: FAIL, `donate` undefined.

- [ ] **Step 3: Edit `firebase.json` to the Interfaces block; run the test again**

Expected: PASS.

- [ ] **Step 4: Write the Terraform to the Interfaces block**

Root: `variable "donate_domain_name" { default = "donate.csarko.sh" }`, `variable "donate_hosting_site_id" { default = "csarko-sh-donate" }`; `module "gcp_hosting_donate"` a copy of `gcp_hosting_apps` with the comment that it carries donate.csarko.sh (spec path named); `local.donate_hosting_cname_target`; `cname_records` gains `(var.donate_domain_name) = local.donate_hosting_cname_target`; the admin module gets `donate_origin = "https://${var.donate_domain_name}"`. Module: the variables, the bucket, the IAM members, the env, the output; `secret_ids` gains `stripe-write-key = "STRIPE_WRITE_KEY"` and `seeded_secret_ids` gains `"stripe-write-key"`.

- [ ] **Step 5: Plan, and read every line**

Run: `terraform -chdir=_infra plan -out=/tmp/donate.plan`
Expected: adds `module.gcp_hosting_donate.google_firebase_hosting_site.this`, `module.gcp_hosting_donate.google_firebase_hosting_custom_domain.this`, `module.aws_dns.aws_route53_record.cname["donate.csarko.sh"]`, `module.gcp_admin_api.google_secret_manager_secret.this["stripe-write-key"]`, `...secret_iam_member.admin_reads["stripe-write-key"]`, `...secret_version.seed["stripe-write-key"]`, `...google_storage_bucket.donate_prices`, two `google_storage_bucket_iam_member`; updates in place `module.gcp_admin_api.google_cloud_run_v2_service.admin` (env only). **Nothing destroyed, nothing else changed.** If anything else moves, stop and show Cyrus the plan.

- [ ] **Step 6: Apply, then verify**

Run: `terraform -chdir=_infra apply /tmp/donate.plan`, then `terraform -chdir=_infra output donate_custom_domain_state` (the certificate issues after DNS; `HOST_ACTIVE`/`OWNERSHIP_ACTIVE`/`CERT_ACTIVE` may take minutes to an hour) and `gcloud storage buckets describe gs://csarko-sh-donate-prices --format='value(cors_config)'`.

- [ ] **Step 7: Deploy the API so the new revision carries the step**

Run: `gcloud run deploy csarko-admin --source admin/api --region us-west1 --project csarko-sh`
Then `curl -s https://admin.csarko.sh/finance/` is not the check; the check is the next day's snapshot: `gcloud firestore ...` is slow, so instead trigger one: `gcloud scheduler jobs run csarko-admin-snapshot --location us-west1 --project csarko-sh`, wait a minute, and read the day's document's `finance.notConfigured.donate` (`STRIPE_WRITE_KEY` until Cyrus adds the key) with the admin page's Sources card or `gcloud firestore documents get` equivalent (the Firestore REST: `gcloud auth print-access-token` + `GET https://firestore.googleapis.com/v1/projects/csarko-sh/databases/(default)/documents/snapshots/<today>`).

- [ ] **Step 8: Cyrus's step, asked for in one message: create the restricted key and add it**

In the Stripe dashboard: Developers, API keys, Create restricted key, permissions **Products: Write** and **Payment Links: Write**, everything else None; name `csarko-admin donate`. Then, on the Mac:

```bash
printf '%s' 'rk_live_...' | gcloud secrets versions add stripe-write-key --project=csarko-sh --data-file=-
gcloud secrets versions disable 1 --secret=stripe-write-key --project=csarko-sh
```

No redeploy is needed: the service reads `latest` at the next cold start; force one with `gcloud run services update csarko-admin --region us-west1 --project csarko-sh --update-env-vars=DONATE_URL=https://donate.csarko.sh` (a no-op value change rolls the revision).

- [ ] **Step 9: Commit**

```bash
git add _infra firebase.json .agents/skills/site-quality/tests/firebase.test.mjs
git commit -m "infra: the donate site, its prices bucket and the Stripe write key"
```

---

### Task 6: The icon

**Files:**
- Create: `donate/icon.mjs`
- Test: `donate/test/icon.test.mjs`

**Interfaces:**
- Produces: `PALETTE` (ten letters to the ten fixed fills: `O m s h H` the heart's outline, mid-tone, shadow, highlight, top highlight; `g G c l L` the token's outline, mid-tone, shadow, highlight, top highlight), `PIXELS: string[22]` each 32 characters of palette letters or `.`, `iconSvg({ className = "tokens-icon" } = {}): string` (one `<svg viewBox="0 0 32 22" shape-rendering="crispEdges" aria-hidden="true" class="...">` with one `<rect>` per horizontal run of one colour), `iconSymbol(): string` (`<svg hidden><symbol id="tokens-icon" ...>rects</symbol></svg>`), `iconUse({ className = "tokens-icon" } = {}): string` (`<svg class="..." aria-hidden="true"><use href="#tokens-icon"/></svg>`), `ICON_CSS` (`.tokens-icon { width: calc(1em * 32 / 22); height: 1em; vertical-align: -0.12em; margin-right: 0.35em; flex: none; }`).

- [ ] **Step 1: Write the failing test**

```js
// donate/test/icon.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PALETTE, PIXELS, iconSvg, iconSymbol, iconUse, ICON_CSS } from '../icon.mjs';

test('a 32 by 22 map in the ten fixed colours', () => {
  assert.equal(PIXELS.length, 22);
  assert.ok(PIXELS.every((row) => row.length === 32));
  assert.deepEqual(Object.values(PALETTE).sort(), ['#6b1113', '#7a5600', '#b32d33', '#c8962a', '#e5484d', '#f0c040', '#ff7a80', '#ffd6d8', '#ffe08a', '#fff7d6']);
  const letters = new Set(Object.keys(PALETTE));
  assert.ok(PIXELS.every((row) => [...row].every((c) => c === '.' || letters.has(c))));
});

test('the cleft is about a quarter deep, the lobes start near the top, the token sits at the lower right, no hole in the heart', () => {
  const top = (x) => PIXELS.findIndex((row) => row[x] !== '.');
  assert.ok(top(15) >= 5 && top(16) >= 5, `cleft depth ${top(15)}`);
  assert.ok(top(7) <= 2 && top(23) <= 2, 'the lobes');
  const gold = new Set(['g', 'G', 'c', 'l', 'L']);
  assert.ok(PIXELS.slice(12).some((row) => [...row.slice(20)].some((c) => gold.has(c))), 'a token at the lower right');
  for (const [y, row] of PIXELS.entries()) {
    const heart = [...row].map((c, x) => ['O', 'm', 's', 'h', 'H'].includes(c) ? x : -1).filter((x) => x >= 0);
    if (heart.length === 0 || y < top(15)) continue;
    for (let x = heart[0]; x <= heart.at(-1); x++) assert.notEqual(row[x], '.', `hole at ${x},${y}`);
  }
});

test('the SVG is crisp, hidden from readers, one rect per run, and the symbol and use agree', () => {
  const svg = iconSvg();
  assert.ok(svg.startsWith('<svg viewBox="0 0 32 22" shape-rendering="crispEdges" aria-hidden="true" class="tokens-icon">'));
  assert.ok(svg.includes('fill="#e5484d"'));
  assert.ok(!svg.includes('<script'));
  assert.ok(iconSymbol().includes('<symbol id="tokens-icon" viewBox="0 0 32 22"'));
  assert.equal(iconUse(), '<svg class="tokens-icon" aria-hidden="true"><use href="#tokens-icon"/></svg>');
  assert.ok(ICON_CSS.includes('height: 1em') && ICON_CSS.includes('margin-right: 0.35em'));
  const rects = (svg.match(/<rect /g) || []).length;
  const runs = PIXELS.reduce((n, row) => n + (row.match(/([^.])\1*/g) || []).length, 0);
  assert.equal(rects, runs);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test donate/test/icon.test.mjs`
Expected: FAIL, module not found.

- [ ] **Step 3: Draw the pixels and write `icon.mjs`**

Start from the brainstorm's generator (`.superpowers/brainstorm/42116-1793373577/content/icon-a-cleft-v3.html`, the "deeper" variant: heart from two circles of radius 6 at x = 16 ± 5.4 plus a triangle, rows filled below the cleft; token of radius 6 centred at (19, 9) in that grid), then hand-correct until the test passes and the sprite reads at 16px. Render `donate/test/icon-preview.html` (git-ignored, under `/tmp/`) showing the icon at 1em beside "Buy me tokens" in 14px Inter and at 8x, in both themes, and **show it to Cyrus before committing**. Iterate on his word.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test donate/test/icon.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit (after Cyrus's OK)**

```bash
git add donate/icon.mjs donate/test/icon.test.mjs
git commit -m "donate: the heart and token icon, one pixel map"
```

---

### Task 7: The donate site

**Files:**
- Create: `donate/page.mjs` (pure: the door page, the thanks page, the CSS)
- Create: `donate/view.mjs` (pure, shared with the browser: `pickPrices`, `buttonLabel`, `backLink`)
- Create: `donate/public-src/app.js` (the page's one script, an ES module importing `/view.js`)
- Create: `donate/pictures.py` (landscape pictures: AVIF, WebP, JPEG at two widths, a 16:9 crop around `focusY` for a portrait source)
- Create: `donate/build.mjs`
- Test: `donate/test/page.test.mjs`, `donate/test/view.test.mjs`
- Modify: `.gitignore` (`donate/public/`)
- Modify: `package.json` at the root if one holds the test script; else document `node --test donate/test/*.test.mjs` in `donate/build.mjs`'s header.

**Interfaces:**
- Consumes: `DOORS`, `TIERS`, `CUSTOM`, `TIER_KEYS`, `PRICES_URL`, `DONATE_URL`, `doorByKey`, `shippedDoors` from `admin/api/src/donate/doors.mjs` (relative import `../admin/api/src/donate/doors.mjs`); `standaloneShell`, `themeBlocks`, `escapeHtml` from `.agents/skills/site-quality/scripts/docs_lib.mjs`; `iconSvg`, `ICON_CSS` (Task 6); the `prices.json` shape (Task 3).
- Produces (`view.mjs`): `pickPrices(baked, fetched, door): { prices, stale: boolean }` (`fetched` is the bucket's whole JSON; it wins when it is an object whose `month` is a string `>=` the baked one and whose `doors[door]` exists, reshaped to the baked shape `{ month, pool, tiers: [{ tier, usd, label }], links: { <tierKey>: url } }`; else `baked` with `stale: true`); `buttonLabel(tierKey, prices): string` (`Tip $9` for a tier, `Tip what you like` for `own`); `backLink(door, doors): { label, href }` (the door's `back` when `door` is a key in `doors`, else `{ label: "Back to the projects", href: "https://csarko.sh/projects" }`); `monthName("2026-10")` → `October`.
- Produces (`page.mjs`): `doorPage({ door, prices, picture, theme }): string` and `thanksPage({ theme, doors }): string` (door keys to `back` and `thanks`, baked as `<script type="application/json" id="doors">`; the markup without a script shows `<p class="lead" id="line">Tokens received.</p>` and `<a id="back" href="https://csarko.sh/projects">Back to the projects</a>`, which `app.js` replaces from the door), `DONATE_CSS`. The door page's markup, top to bottom inside `<main id="top" class="wrap"><article class="tip">`: `<p class="kicker">Buy Me Tokens · Arkos IDE</p>` (`Buy Me Tokens` alone for `all`), `<h1>` the headline, `<p class="lead">`, `<picture class="shot">` from `picture`, `<p class="bill">In October the cloud behind all this cost <b>$288</b>. Each tier is a slice of that bill.</p>` (the figure is `Math.round(prices.pool)`, the month `monthName(prices.month)`), a `<fieldset class="tiers">` of five `<label class="tier">` each with `<input type="radio" name="tier" value="<key>">` (`context` checked), the name in `<b>`, the caption in `<small>`, the price in `<span class="price">$9<small>about 3%</small></span>` (the custom row: `<span class="price">any<small>$1 or more</small></span>`, class `tier own`), `<a id="pay" class="btn" href="<context link url>">Tip $9</a>`, `<p class="foot">Payments by Stripe · no account needed</p>`, then `<script type="application/json" id="prices">` holding `{ month, pool, tiers: [{tier, usd, label}], links: { <tierKey>: url } }` for this door only (no ids), and `<script type="module" src="/app.js">`. Styles: the mockup's tip card (`.superpowers/brainstorm/42116-1793373577/content/picture-placement.html`, the `.bmt` rules) rewritten on the site's tokens and type scale; `.tier:has(:checked)` for the selected row; the picture `aspect-ratio: 16 / 9; object-fit: cover`. Everything escaped through `escapeHtml`.
- Produces (`app.js`): on a door page, listens to the radios and sets `#pay`'s `href` and text; fetches `PRICES_URL` (`cache: "no-cache"`), applies `pickPrices`, rewrites the bill's `<b>` and month, each `.price`, each link, and when `stale` appends `<p class="note">Prices are from <month>.</p>` after the bill. On `/thanks`, reads `new URL(location).searchParams.get("door")`, looks it up in `#doors`, and sets the one link's text and `href` through `textContent`/`setAttribute` (never `innerHTML`), and the thanks line.
- Produces (`pictures.py`): `python3 -I donate/pictures.py --source <png|jpg> [--dark <png>] [--focus-y 0.3] --out <dir> --stem <door>` → writes `<stem>-<w>.<hash8>.{avif,webp,jpg}` for widths `(640, 1280)` (plus `<stem>-dark-...` when `--dark`), cropping a source taller than wide to 16:9 with the crop's centre at `focus_y` of the height (clamped), refusing a source that is taller than wide without `--focus-y`; prints JSON `{ "sets": { "light": { "avif": [...], "webp": [...], "jpg": [...] }, "dark": {...} }, "width": 1280, "height": 720 }` where each list is `"<file> <w>w"` srcset entries. Encoding as `build_assets.py`'s `encode()` (import it: `sys.path.insert(0, ".agents/skills/site-quality/scripts")`).
- Produces (`build.mjs`): `node donate/build.mjs [--prices <file>]` → `donate/public/`: fonts and favicons copied as `apps/build.mjs` does, `index.html` (door `all`), `<door>/index.html` per shipped door, `thanks/index.html`, `icon.svg` (`iconSvg()` with an XML prolog, no class), `view.js` (a copy of `view.mjs`), `app.js`, `404.html` (as the apps build makes it), `robots.txt`, `sitemap.xml` listing the door pages. Without `--prices` it fetches `PRICES_URL` and **fails** when the object is missing (`donate: no prices.json yet; the step has not run. Preview with --prices donate/test/fixtures/prices.json`). A shipped door without a picture source on disk fails the build by door name; a portrait source without `focusY` fails by door name; a door that is in `prices.doors` but not shipped is skipped with a log line; a shipped door missing from `prices.doors` fails (`no links for <door> yet; the next snapshot adds them`).

- [ ] **Step 1: Write the failing tests**

```js
// donate/test/view.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickPrices, buttonLabel, backLink, monthName } from '../view.mjs';

const BAKED = { month: '2026-10', pool: 288, tiers: [{ tier: 'prompt', usd: 3, label: 'about 1%' }, { tier: 'context', usd: 9, label: 'about 3%' }, { tier: 'run', usd: 29, label: 'about 10%' }, { tier: 'finetune', usd: 87, label: 'about 30%' }], links: { prompt: 'a', context: 'b', run: 'c', finetune: 'd', own: 'e' } };

test('the live JSON wins when it is this month or newer, the baked one otherwise, marked stale', () => {
  assert.deepEqual(pickPrices(BAKED, null), { prices: BAKED, stale: true });
  assert.deepEqual(pickPrices(BAKED, { month: '2026-09', doors: {} }), { prices: BAKED, stale: true });
  assert.deepEqual(pickPrices(BAKED, 'garbage'), { prices: BAKED, stale: true });
  const live = { month: '2026-11', pool: 300, tiers: BAKED.tiers, doors: { arkos: { links: { prompt: { url: 'x' } } } } };
  assert.equal(pickPrices(BAKED, live, 'arkos').stale, false);
  assert.equal(pickPrices(BAKED, live, 'arkos').prices.links.prompt, 'x');
});

test('the button says the price, or what you like', () => {
  assert.equal(buttonLabel('context', BAKED), 'Tip $9');
  assert.equal(buttonLabel('own', BAKED), 'Tip what you like');
  assert.equal(buttonLabel('nope', BAKED), 'Tip $9', 'an unknown tier falls back to the default one');
});

test('the thanks link: the door’s own, else the projects page; junk never passes through', () => {
  const doors = { arkos: { back: { label: 'Back to Arkos IDE', href: 'https://apps.csarko.sh/ide-arkos' }, thanks: 'Tokens received. The next agent run is on you.' } };
  assert.deepEqual(backLink('arkos', doors), doors.arkos.back);
  assert.deepEqual(backLink('<img onerror=1>', doors), { label: 'Back to the projects', href: 'https://csarko.sh/projects' });
  assert.deepEqual(backLink(null, doors), { label: 'Back to the projects', href: 'https://csarko.sh/projects' });
  assert.equal(monthName('2026-10'), 'October');
});
```

```js
// donate/test/page.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { doorPage, thanksPage, DONATE_CSS } from '../page.mjs';
import { doorByKey } from '../../admin/api/src/donate/doors.mjs';

const THEME = ':root { --bg: #0a0b0e; }\n    @media (prefers-color-scheme: light) { :root { --bg: #f6f7f9; } }';
const PICTURE = { sets: { light: { avif: ['arkos-640.abc.avif 640w', 'arkos-1280.abc.avif 1280w'], webp: ['arkos-640.abc.webp 640w'], jpg: ['arkos-640.abc.jpg 640w', 'arkos-1280.abc.jpg 1280w'] } }, width: 1280, height: 720 };
const PRICES = { month: '2026-10', pool: 288, tiers: [{ tier: 'prompt', name: 'A prompt', share: 0.01, label: 'about 1%', usd: 3 }, { tier: 'context', name: 'A long context window', share: 0.03, label: 'about 3%', usd: 9 }, { tier: 'run', name: 'A whole agent run', share: 0.1, label: 'about 10%', usd: 29 }, { tier: 'finetune', name: 'A fine-tune', share: 0.3, label: 'about 30%', usd: 87 }], links: { prompt: 'https://buy.stripe.com/p', context: 'https://buy.stripe.com/c', run: 'https://buy.stripe.com/r', finetune: 'https://buy.stripe.com/f', own: 'https://buy.stripe.com/o' } };

test('the Arkos door, top to bottom', () => {
  const html = doorPage({ door: doorByKey('arkos'), prices: PRICES, picture: PICTURE, theme: THEME });
  const at = (s) => { const i = html.indexOf(s); assert.ok(i >= 0, s); return i; };
  assert.ok(at('<p class="kicker">Buy Me Tokens · Arkos IDE</p>') < at('<h1>Fund my next agent run</h1>'));
  assert.ok(at('<h1>') < at('<picture class="shot">') && at('<picture class="shot">') < at('<p class="bill">'));
  at('<p class="bill">In October the cloud behind all this cost <b>$288</b>. Each tier is a slice of that bill.</p>');
  assert.ok(html.includes('srcset="arkos-640.abc.avif 640w, arkos-1280.abc.avif 1280w"'));
  assert.ok(html.includes('width="1280" height="720"'));
  assert.equal((html.match(/<input type="radio" name="tier"/g) || []).length, 5);
  assert.ok(html.includes('value="context" checked'));
  assert.ok(html.includes('<b>A long context window</b><small>a whole feature, read end to end</small>'));
  assert.ok(html.includes('<span class="price">$9<small>about 3%</small></span>'));
  assert.ok(html.includes('<a id="pay" class="btn" href="https://buy.stripe.com/c">Tip $9</a>'));
  assert.ok(html.includes('Payments by Stripe · no account needed'));
  assert.ok(at('<script type="application/json" id="prices">') < at('<script type="module" src="/app.js">'));
  assert.ok(!html.includes('plink_') && !html.includes('price_'), 'no Stripe ids on the page');
  assert.ok(!/—/.test(html) && !/[a-z0-9._%+-]+@[a-z0-9-]+\.[a-z]{2,}/i.test(html.replace(/@font-face|@media/g, '')));
  assert.ok(html.includes('<title>Buy Me Tokens · Arkos IDE</title>'));
  assert.ok(html.includes('<link rel="canonical" href="https://donate.csarko.sh/arkos" />'));
});

test('the bare door says Buy Me Tokens alone and is canonical at the root', () => {
  const html = doorPage({ door: doorByKey('all'), prices: PRICES, picture: PICTURE, theme: THEME });
  assert.ok(html.includes('<p class="kicker">Buy Me Tokens</p>'));
  assert.ok(html.includes('<link rel="canonical" href="https://donate.csarko.sh/" />'));
});

test('the thanks page bakes every shipped door’s line and link, escaped', () => {
  const html = thanksPage({ theme: THEME, doors: { arkos: { back: doorByKey('arkos').back, thanks: doorByKey('arkos').thanks }, all: { back: { label: 'Back to the projects', href: 'https://csarko.sh/projects' }, thanks: 'Tokens received.' } } });
  assert.ok(html.includes('<script type="application/json" id="doors">'));
  assert.ok(html.includes('Tokens received. The next agent run is on you.'));
  assert.ok(html.includes('<a id="back" href="https://csarko.sh/projects">Back to the projects</a>'));
});

test('the CSS is tokens only and sizes the picture 16:9', () => {
  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(DONATE_CSS.replace(/#(top|pay|back|prices|doors)\b/g, '')));
  assert.ok(DONATE_CSS.includes('aspect-ratio: 16 / 9'));
  assert.ok(DONATE_CSS.includes('.tier:has(:checked)'));
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test donate/test/*.test.mjs`
Expected: FAIL, modules not found (the icon test passes).

- [ ] **Step 3: Write `view.mjs`, `page.mjs`, `public-src/app.js`, `pictures.py` and `build.mjs` to the Interfaces block; add `donate/public/` to `.gitignore`; create `donate/test/fixtures/prices.json` (the Task 3 shape for the six shipped doors with `https://buy.stripe.com/test_<door>_<tier>` URLs and placeholder ids)**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test donate/test/*.test.mjs`
Expected: PASS.

- [ ] **Step 5: Build with the fixture and look**

Run: `node donate/build.mjs --prices donate/test/fixtures/prices.json && (cd donate/public && python3 -m http.server 8789)` then screenshots of `/`, `/arkos`, `/last-trail`, `/thanks?door=arkos` at 1280 and 390 wide in both themes with headless Chrome (`.agents/skills/preview/scripts/preview.sh` shows the flags), and check: the picture is landscape on every door, the Last Trail crop keeps the woman and the radio in frame, the selected tier is visible, the button says `Tip $9`, nothing overflows at 390. Show Cyrus the screenshots in one message with the icon from Task 6 if not yet shown.

- [ ] **Step 6: Commit**

```bash
git add donate .gitignore
git commit -m "donate: the tip page, its build and the thanks page"
```

---

### Task 8: The bare door's graphic

**Files:**
- Create: `donate/scripts/compose.py`
- Create: `.agents/skills/site-quality/assets/donate/body-of-work.png` (the output, committed)

**Interfaces:**
- Produces: a 1920 by 1080 PNG, in the site's dark palette (`#0a0b0e` background, `#7dd3c0` accent as a thin rule or glow only), composed deterministically by `python3 -I donate/scripts/compose.py` from the committed pictures: the three app heroes (`assets/apps/ide-arkos.png`, `app-macstats.png`, `lib-visits-dark.png`) and the two posters (`assets/films/*.jpg`), laid as five tilted cards fanned left to right, each with a 1px `#1f2430` border and soft shadow, the posters cropped to 4:5, with no words. Shown to Cyrus before committing.

- [ ] **Step 1: Write `compose.py`** (Pillow; fixed seed; every coordinate a constant at the top)

- [ ] **Step 2: Run it, open the PNG, and show Cyrus**

Run: `python3 -I donate/scripts/compose.py && open .agents/skills/site-quality/assets/donate/body-of-work.png`
If he asks for an image model's version instead, the brief is: "a landscape still life of a terminal window, a menu bar gauge, a game controller silhouette in dark woods, and a film clapper, dark teal palette, no text", generated in `~/Projects/film-generation`'s tooling, saved to the same path; the compose script then stays as the fallback and the plan notes which was used.

- [ ] **Step 3: Rebuild the site with the fixture and look at `/`** (Task 7 Step 5)

- [ ] **Step 4: Commit (after Cyrus's OK)**

```bash
git add donate/scripts/compose.py .agents/skills/site-quality/assets/donate/body-of-work.png
git commit -m "donate: the bare door's picture"
```

---

### Task 9: The deploy script and the launch gate

**Files:**
- Create: `donate/deploy.sh`
- Modify: `.agents/skills/deploy/SKILL.md` (one line: donate.csarko.sh deploys with `donate/deploy.sh`, like apps)

**Interfaces:**
- Produces: `donate/deploy.sh` on `apps/deploy.sh`'s pattern: Terraform outputs `gcp_project_id`, `donate_hosting_site_id`, `donate_hosting_default_url`, `donate_site_url`; `grep` that `firebase.json` names the site; `node donate/build.mjs` (never `--prices`); guards over `donate/public/**/*.html`: no email, no phone, no em-dash, no `<script` except `type="application/json"` and `src="/app.js"`; deploy `--only hosting:$SITE`; verify every `*/index.html`, `index.html`, `icon.svg` and `app.js` byte for byte on the default URL and the custom domain, and that `curl -sI https://storage.googleapis.com/csarko-sh-donate-prices/prices.json` answers 200 with `access-control-allow-origin` when sent `Origin: https://donate.csarko.sh`.

- [ ] **Step 1: Write `deploy.sh`; `bash -n donate/deploy.sh`; run it once with no prices object present and confirm it stops at the build with the "no prices.json yet" message**

- [ ] **Step 2: Commit**

```bash
git add donate/deploy.sh .agents/skills/deploy/SKILL.md
git commit -m "donate: the deploy script; it refuses to ship without the month's prices"
```

- [ ] **Step 3: The launch, on or after Nov 3, once a snapshot has written `prices.json`**

Check: `curl -s https://storage.googleapis.com/csarko-sh-donate-prices/prices.json | python3 -c 'import json,sys; j=json.load(sys.stdin); print(j["month"], j["pool"], list(j["doors"]))'` prints `2026-10 <pool> [six doors]`. If the pool looks wrong against the Finance page's October total, stop and show Cyrus before deploying. Then, in this order: set `DONATE_LIVE = true` in `admin/api/src/donate/doors.mjs` (the launch flag; while it is `false` the entrances on csarko.sh and apps.csarko.sh render nothing), run `.agents/skills/site-quality/scripts/generate-assets.sh`, and commit (`git add admin/api/src/donate/doors.mjs public && git commit -m "Buy me tokens: launch, the entrances go live"`); `donate/deploy.sh`, then open `https://donate.csarko.sh/arkos`, pick the second tier, and confirm the Stripe checkout page opens with the right amount and `Donate` on its button (do **not** pay); then `.agents/skills/deploy/scripts/deploy.sh` and `apps/deploy.sh` (Task 10 Step 6), so no entrance goes live before its door. `gcloud run deploy csarko-admin` is not needed for the flag: the API never reads it. Report to Cyrus.

---

### Task 10: The entrances on csarko.sh and apps.csarko.sh

**Files:**
- Modify: `.agents/skills/site-quality/scripts/docs_lib.mjs` (`tokensLink`, the symbol in `projectsPage`, `PROJECTS_CSS`, `standaloneShell` link icons)
- Modify: `.agents/skills/site-quality/scripts/check.py:59` (`BUDGET_HTML_PROJECTS = 60_000`, dated comment)
- Modify: `apps/product.mjs` (the bar link, the README snippet dropped)
- Modify: `AGENTS.md` (the `tokens-<slug>` events; the `donate/` row; the Infrastructure DNS bullet naming the donate CNAME; the `admin/` row's one clause about the donate step)
- Test: `.agents/skills/site-quality/tests/docs_lib.test.mjs`, `apps/test/product.test.mjs`

**Interfaces:**
- Consumes: `doorOf`, `DONATE_URL` (Task 1, imported from `../../../../admin/api/src/donate/doors.mjs`), `iconSymbol`, `iconUse`, `iconSvg`, `ICON_CSS` (Task 6, from `../../../../donate/icon.mjs`).
- Produces (`docs_lib.mjs`): `tokensLink(project)` → for a project whose `doorOf(project.slug)` is shipped, `<a class="card-tokens" href="${DONATE_URL}${door.path}" data-visits-event="tokens-${project.slug}">${iconUse()}Buy me tokens</a>`, else `''`; `projectCard` puts it last in `.card-links`; `projectsPage` emits `iconSymbol()` once, right after `<main>` opens, when any card has the link; `PROJECTS_CSS` gains `.card-tokens { position: relative; z-index: 1; display: inline-flex; align-items: center; font-size: 14px; font-weight: 400; color: var(--muted); text-decoration: none; }`, `.card-tokens:hover, .card-tokens:focus-visible { color: var(--text); }` and `ICON_CSS`. `standaloneShell`'s `links` tuples accept a fourth element, `icon` (HTML prefixed inside the anchor), and its CSS gains `ICON_CSS`.
- Produces (`product.mjs`): the bar `links` gain `['Buy me tokens', `${DONATE_URL}${door.path}`, true, iconSvg()]` after GitHub and before the release, when the app's door is shipped; `prepareReadme` drops any line that is only a Markdown link whose URL starts with `https://donate.csarko.sh` (with or without an `<img>` in its text) before anything else runs, so the snippet never reaches `imagesOf` or the leftover-HTML check.
- The README snippet, documented in `AGENTS.md` under a new "Buy me tokens" bullet in Content rules, is exactly:

```markdown
[<img src="https://donate.csarko.sh/icon.svg" alt="" height="16"> Buy me tokens](https://donate.csarko.sh/arkos)
```

  placed once, as the last line before the licence section, in each repository's README (the other repositories are follow-ups, not this plan).

- [ ] **Step 1: Write the failing tests**

In `docs_lib.test.mjs`, beside the other `projectsPage` tests, with its `game`, `film` and `app` helpers and `themeBlocks(INDEX)`:

```js
test('every shipped project card carries one quiet Buy me tokens link to its door; Day Hike none yet; the symbol once', () => {
  const html = projectsPage([game('day-hike'), app('ide-arkos', ['repo: https://github.com/csarkosh/ide-arkos']), film('the-last-trail')], themeBlocks(INDEX));
  assert.equal((html.match(/<symbol id="tokens-icon"/g) || []).length, 1);
  assert.ok(html.includes('<a class="card-tokens" href="https://donate.csarko.sh/arkos" data-visits-event="tokens-ide-arkos"><svg class="tokens-icon" aria-hidden="true"><use href="#tokens-icon"/></svg>Buy me tokens</a>'));
  assert.ok(html.includes('href="https://donate.csarko.sh/last-trail" data-visits-event="tokens-the-last-trail"'));
  assert.ok(!html.includes('tokens-day-hike'));
  const card = html.slice(html.indexOf('id="ide-arkos"'), html.indexOf('</li>', html.indexOf('id="ide-arkos"')));
  assert.equal((card.match(/Buy me tokens/g) || []).length, 1);
  assert.ok(html.indexOf('card-source') < html.indexOf('card-tokens'), 'after Source on GitHub');
});
```

In `product.test.mjs`, with the lib-visits `app` object and the `images` map the "productPage puts the buttons in Setup" test builds (copy those two lines):

```js
test('the bar carries Buy me tokens with the icon, and the README snippet is dropped so it reads once', () => {
  const readme = `${README}\n\n[<img src="https://donate.csarko.sh/icon.svg" alt="" height="16"> Buy me tokens](https://donate.csarko.sh/visits)\n\n## License\n\nGPL-3.0\n`;
  const prepared = prepareReadme(readme, { blob: BLOB });
  assert.ok(!prepared.text.includes('donate.csarko.sh'));
  const html = productPage({ app, prepared, release: RELEASE, images, theme: THEME });
  assert.equal((html.match(/Buy me tokens/g) || []).length, 1);
  assert.ok(/<li><a href="https:\/\/donate\.csarko\.sh\/visits" class="external" target="_blank" rel="noopener"><svg viewBox="0 0 32 22" shape-rendering="crispEdges"[^>]*><rect [\s\S]*?<\/svg>Buy me tokens<\/a><\/li>/.test(html));
  assert.ok(html.indexOf('>GitHub</a>') < html.indexOf('Buy me tokens') && html.indexOf('Buy me tokens') < html.indexOf(`>${RELEASE.tag}</a>`));
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test .agents/skills/site-quality/tests/docs_lib.test.mjs apps/test/product.test.mjs`
Expected: the two new tests FAIL.

- [ ] **Step 3: Implement the Interfaces block in `docs_lib.mjs` and `product.mjs`; raise `BUDGET_HTML_PROJECTS` to `60_000` with the comment `# the Buy me tokens link and its one symbol (2026-10-3x)`**

- [ ] **Step 4: Run the tests, rebuild, check, look**

Run: `node --test .agents/skills/site-quality/tests/docs_lib.test.mjs apps/test/product.test.mjs && .agents/skills/site-quality/scripts/generate-assets.sh && python3 .agents/skills/site-quality/scripts/check.py && .agents/skills/preview/scripts/preview.sh --shots`
Expected: PASS; check.py green (`/projects` under budget, the colour rule untouched since the fills are attributes); in the screenshots the line sits after "Source on GitHub", grey, with the icon at text height, both themes, both widths. Then `node apps/build.mjs` and open `apps/public/lib-visits/index.html`: one "Buy me tokens" in the bar, none in the body.

- [ ] **Step 5: Update `AGENTS.md`**: the Events paragraph (`tokens-<slug>`, "a click on a card's Buy me tokens line"); the Layout table's new `donate/` row (what it is, the spec path, the build and deploy commands, "the repo is public, so the door copy is public"); the `admin/` row's clause ("and the `donate` step that sets the month's tip prices, spec `docs/superpowers/specs/2026-10-30-donate-site-design.md`"); the Content rules bullet "Buy me tokens" (the snippet, the one-line rule, the anti-goal in one sentence); the Infrastructure DNS bullet (`donate` CNAME beside `apps` and `admin`).

- [ ] **Step 6: Deploy the site and the apps site** (after Task 9 Step 3 has made donate.csarko.sh live; the links must not lead to a dead host)

Run: `.agents/skills/deploy/scripts/deploy.sh && apps/deploy.sh`
Expected: both verify byte for byte; `curl -s https://csarko.sh/projects | grep -c 'card-tokens'` prints the number of shipped doors on the page (5).

- [ ] **Step 7: Commit**

```bash
git add .agents/skills/site-quality apps/product.mjs apps/test/product.test.mjs AGENTS.md public
git commit -m "Buy me tokens: one quiet line on every project card and apps page"
```

---

### Task 11: The Finance page: tips by door and the month's prices

**Files:**
- Modify: `admin/public/finance/page.js` (`donationsCard`: a "By door" fold and the prices line; the card's `sub` and `skeleton`)
- Test: `python3 .agents/skills/site-quality/scripts/check.py --admin` (the page's checks drive the Billing page in headless Chrome)

**Interfaces:**
- Consumes: `income.byDoor` and `income.prices` (Task 4); `folded`, `table`, `el`, `money`, `count`, `monthName`, `ago` from the page's helpers.
- Produces: in `donationsCard`, after the balance line, `el('p', { class: 'note' }, ...)` reading `Tip prices follow ${monthName(prices.month)}'s bill, ${money(prices.pool)}, set ${ago(prices.at)}.` when `income.prices` is an object, else `Tip prices: not set yet; the donate step runs on the first snapshot on or after the 3rd.`; a fold `By door · ${byDoor.length}` with columns Door (`label`), Gross, Fees, Net, Donations, empty text `No tips through a door yet.`, placed before the Recent fold; `skeleton.folds` becomes 4; the `sub` gains one sentence: "By door says which project's page the tip came through; nothing more about the giver."

- [ ] **Step 1: Edit `page.js` to the Interfaces block**

- [ ] **Step 2: Run the admin checks and look**

Run: `python3 .agents/skills/site-quality/scripts/check.py --admin && admin/preview.sh --shots`
Expected: green (the fold is a `<details>` through `folded()`, so the motion and skeleton checks hold; the fifth project tone from Task 1 passes the palette check); in the screenshots the Donations card shows the prices line and the fold in both themes.

- [ ] **Step 3: Deploy the admin site**

Run: `admin/deploy.sh`

- [ ] **Step 4: Commit**

```bash
git add admin/public/finance/page.js
git commit -m "finance: tips by door and the month's tip prices on the Donations card"
```

---

### Task 12: October's GCP history, only if the export does not fill it

The export already backfills: on 2026-10-30 it held August in full and September to the 25th, nothing of October yet. This task exists in case October 1 to 28 never arrives.

**Files:**
- Modify: `_infra/modules/gcp-admin-api/main.tf` (`google_bigquery_table.billing_history`)
- Modify: `admin/api/queries/finance-monthly.sql`, `admin/api/queries/finance-first-day.sql` (`UNION ALL` the history table)
- Modify: `admin/api/src/collectors/gcp-billing.mjs` (`HISTORY_TABLE` marker rewritten like `EXPORT_TABLE`)
- Create: `tools/gcp-history-load.py`
- Test: `admin/api/test/gcp-billing.test.mjs`

**Interfaces:**
- The table `csarko-sh.billing.history`: `month STRING, project STRING, service STRING, sku STRING, unit STRING, net FLOAT64, amount FLOAT64, loaded_at TIMESTAMP`, `deletion_protection = true`.
- `finance-monthly.sql` becomes the export's query `UNION ALL SELECT month, project, service, sku, unit, net, amount FROM \`csarko-sh.billing.history\` WHERE month >= FORMAT_DATE('%Y-%m', DATE(@start)) AND month < FORMAT_DATE('%Y-%m', DATE(@end))`, wrapped so the outer `ORDER BY` still applies; `finance-first-day.sql` takes the `MIN` over the export's first day and `MIN(DATE(month || '-01'))` from history.
- `tools/gcp-history-load.py --csv <file> --month 2026-10 --through 28`: reads the console's Cost table CSV (downloaded with the date range set to Oct 1 to Oct 28, grouped by SKU), maps columns by header name through one `COLUMNS` dict at the top (`project`, `service`, `sku`, `unit`, `amount`, `cost`, `credits`), **prints the header and stops** if a needed column is missing, computes `net = cost + credits` per row, refuses to run if `bq query` shows the export already has rows for that month on or before `--through`, and loads with `bq load --source_format=NEWLINE_DELIMITED_JSON csarko-sh:billing.history <ndjson>`. Runs with Cyrus's `gcloud` login; never in the image.

- [ ] **Step 1: On Nov 1 or later, check whether the task is needed**

Run: `bq query --project_id=csarko-sh --use_legacy_sql=false 'SELECT MIN(DATE(usage_start_time)) first_day, MAX(DATE(usage_start_time)) last_day FROM \`csarko-sh.billing.gcp_billing_export_v1_013AA0_554DB9_BBF90D\` WHERE DATE(usage_start_time) BETWEEN "2026-10-01" AND "2026-10-31"'`
If `first_day` is `2026-10-01`, **skip the rest of this task** and note it in the ledger. Otherwise continue.

- [ ] **Step 2: Write the failing test**: in `gcp-billing.test.mjs`, assert `sqlOf`'s output for `finance-monthly` contains `\`csarko-sh.billing.history\`` rewritten to `\`${projectId}.${dataset}.history\`` and no literal `csarko-sh.billing.` remains.

- [ ] **Step 3: Terraform the table (plan: one add, nothing else), edit the two SQL files and the collector, run the tests, deploy the API**

- [ ] **Step 4: Cyrus downloads the CSV** (Billing, Reports, Cost table, date range Oct 1 to Oct 28, group by SKU, Download CSV) to `~/Downloads/`; run `python3 -I tools/gcp-history-load.py --csv ~/Downloads/<file>.csv --month 2026-10 --through 28`; confirm on the Finance page that October's Google Cloud column now reads the full month.

- [ ] **Step 5: Commit**

```bash
git add _infra admin/api tools/gcp-history-load.py
git commit -m "finance: a history table for the months the GCP export does not hold"
```

---

### Task 13: Close out

**Files:**
- Modify: `~/.claude3/projects/-Users-csarko-Projects/memory/donate-site.md` (the state: live date, what is left)
- Cyrus's clicks, asked for in one message when the site is live: Stripe, Settings, Business details, Website → `https://donate.csarko.sh`; Stripe, Settings, Customer emails, "Successful payments" on; YouTube Studio, Customization, Basic info, Links → `Buy me tokens` → `https://donate.csarko.sh/last-trail` (or the bare door); each Short's description gains the plain URL as its last line; the Day Hike screenshot, after which `dayhike.shipped = true` and `picture.source = "apps/day-hike.png"` (a 16:9 PNG under `assets/apps/`), one commit, `donate/deploy.sh`, `deploy.sh`.
- The monthly redeploy, a line in Cyrus's monthly routine and in the message: once the Finance page's prices line says the month's prices have turned (on or after the 3rd), run `donate/deploy.sh`, so the pages' baked fallback points at the new month's links; the sweep keeps last month's live for one more month, so the fallback pays in between (spec section 4, amended Oct 30).
- The four other repositories' entrances (ide-arkos About menu and README, app-macstats README and install caveat, lib-visits README, game-dayhike title screen and README) are follow-ups in their own repositories with the snippet from Task 10.

- [ ] **Step 1: Walk the spec's section 2 list against the live pages**: every shipped door opens, shows its picture landscape, the October bill, four prices and the custom row, and its button opens Stripe with the right amount; `/thanks?door=arkos` links back to Arkos; `/icon.svg` serves; `/projects` cards and the three apps pages carry the line once.

- [ ] **Step 2: Write the memory file and the message to Cyrus with his clicks**

