import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createCache } from "../src/cache.mjs";
import { createGitHubBilling, shapeUsage } from "../src/collectors/github-billing.mjs";

const items = JSON.parse(readFileSync(new URL("./fixtures/finance-github-usage.json", import.meta.url), "utf8")).usageItems;
const NOW = Date.parse("2026-10-28T23:10:00Z");

function fakeFetch(calls, { status = 200 } = {}) {
  return async (url, init) => {
    const u = new URL(url);
    calls.push({ path: u.pathname, query: Object.fromEntries(u.searchParams), headers: init?.headers ?? {} });
    const month = Number(u.searchParams.get("month"));
    const body = { usageItems: items.filter((it) => Number(it.date.slice(5, 7)) === month) };
    return { ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) };
  };
}

test("not configured without the token or a valid owner", () => {
  assert.equal(createGitHubBilling({ token: null, owner: "csarkosh", fetch: fakeFetch([]), cache: createCache() }).configured, false);
  assert.equal(createGitHubBilling({ token: "t", owner: "../x", fetch: fakeFetch([]), cache: createCache() }).configured, false);
  assert.equal(createGitHubBilling({ token: "t", owner: "csarkosh", fetch: fakeFetch([]), cache: createCache() }).configured, true);
});

test("usage reads the current and previous month with the token and GitHub's headers, cached", async () => {
  const calls = [];
  const gh = createGitHubBilling({ token: "ghp_x", owner: "csarkosh", fetch: fakeFetch(calls), cache: createCache({ now: () => NOW }), now: () => NOW });
  const u = await gh.usage();
  assert.deepEqual(calls.map((c) => [c.path, c.query]).sort((a, b) => a[1].month.localeCompare(b[1].month)), [
    ["/users/csarkosh/settings/billing/usage", { year: "2026", month: "10" }],
    ["/users/csarkosh/settings/billing/usage", { year: "2026", month: "9" }],
  ]);
  assert.deepEqual(calls[0].headers, { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "csarko-admin", authorization: "Bearer ghp_x" });
  assert.equal(u.lastDay, "2026-10-27");
  assert.deepEqual(u.months.map((m) => [m.month, m.product, m.sku, m.quantity, m.gross, m.net]), [
    ["2026-09", "actions", "Actions Linux", 1640, 13.12, 0],
    ["2026-09", "git_lfs", "LFS Storage", 2, 0.14, 0],
    ["2026-10", "actions", "Actions Linux", 9185, 73.48, 0],
    ["2026-10", "actions", "Actions Storage", 6.25, 0.05, 0],
    ["2026-10", "git_lfs", "LFS Storage", 2, 0.14, 0],
  ]);
  assert.equal(u.days.length, 16);
  assert.deepEqual(u.days[0], { day: "2026-09-01", product: "git_lfs", sku: "LFS Storage", quantity: 2, unitType: "GigabyteHours", gross: 0.14, net: 0 });
  await gh.usage();
  assert.equal(calls.length, 2, "both months cached");
});

test("January asks for last December", async () => {
  const calls = [];
  const gh = createGitHubBilling({ token: "t", owner: "csarkosh", fetch: fakeFetch(calls), cache: createCache(), now: () => Date.parse("2027-01-03T12:00:00Z") });
  await gh.usage();
  assert.deepEqual(calls.map((c) => `${c.query.year}-${c.query.month}`).sort(), ["2026-12", "2027-1"]);
});

test("a refused request throws with the status; the token needs Plan: read", async () => {
  const gh = createGitHubBilling({ token: "t", owner: "csarkosh", fetch: fakeFetch([], { status: 403 }), cache: createCache(), now: () => NOW });
  await assert.rejects(gh.usage(), /github 403 on \/users\/csarkosh\/settings\/billing\/usage/);
});

test("shapeUsage folds items by month and by day, skips items without a date, and rounds", () => {
  const shaped = shapeUsage([
    { date: "2026-10-02T15:00:00Z", product: "actions", sku: "Actions Linux", quantity: 100.00004, unitType: "Minutes", pricePerUnit: 0.008, grossAmount: 0.8, discountAmount: 0.8, netAmount: 0 },
    { date: "2026-10-02T16:00:00Z", product: "actions", sku: "Actions Linux", quantity: 50, unitType: "Minutes", pricePerUnit: 0.008, grossAmount: 0.4, discountAmount: 0.4, netAmount: 0 },
    { date: "2026-10-03T16:00:00Z", product: "actions", sku: "Actions macOS", quantity: 10, unitType: "Minutes", pricePerUnit: 0.08, grossAmount: 0.8, discountAmount: 0, netAmount: 0.8 },
    { product: "actions", sku: "Actions Linux", quantity: 999 },
  ]);
  assert.deepEqual(shaped.months, [
    { month: "2026-10", product: "actions", sku: "Actions Linux", quantity: 150, unitType: "Minutes", gross: 1.2, net: 0 },
    { month: "2026-10", product: "actions", sku: "Actions macOS", quantity: 10, unitType: "Minutes", gross: 0.8, net: 0.8 },
  ]);
  assert.deepEqual(shaped.days.map((d) => [d.day, d.sku, d.quantity]), [["2026-10-02", "Actions Linux", 150], ["2026-10-03", "Actions macOS", 10]]);
  assert.equal(shaped.lastDay, "2026-10-03");
  assert.deepEqual(shapeUsage(null), { months: [], days: [], lastDay: null });
});
