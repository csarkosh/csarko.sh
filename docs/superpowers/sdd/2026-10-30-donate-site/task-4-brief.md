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

