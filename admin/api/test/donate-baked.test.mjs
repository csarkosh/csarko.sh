// admin/api/test/donate-baked.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { bakedPeriodOf, createBakedPeriod } from "../src/donate/baked.mjs";

const page = (json) => `<!doctype html><html><head><script type="application/json" id="prices">${json}</script></head></html>`;

test("the baked period is read from the page's prices block", () => {
  assert.equal(bakedPeriodOf(page(JSON.stringify({ door: "all", period: { from: "2026-10-01", to: "2026-10-30", repricedOn: "2026-10-31" } }))), "2026-10-31");
});

test("a page without a prices block, with broken JSON or without a day reads as unknown", () => {
  assert.equal(bakedPeriodOf("<html></html>"), null);
  assert.equal(bakedPeriodOf(page("{not json")), null);
  assert.equal(bakedPeriodOf(page(JSON.stringify({ period: { repricedOn: "soon" } }))), null);
  assert.equal(bakedPeriodOf(42), null);
});

test("the live page is fetched once, and an answer other than 200 reads as unknown", async () => {
  const seen = [];
  const ok = createBakedPeriod({ fetch: async (url) => { seen.push(url); return { ok: true, status: 200, text: async () => page(JSON.stringify({ period: { repricedOn: "2026-11-07" } })) }; } });
  assert.equal(await ok(), "2026-11-07");
  assert.deepEqual(seen, ["https://donate.csarko.sh/"]);
  const down = createBakedPeriod({ fetch: async () => ({ ok: false, status: 503, text: async () => "" }) });
  assert.equal(await down(), null);
});
