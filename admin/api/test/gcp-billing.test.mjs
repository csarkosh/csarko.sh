import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createCache } from "../src/cache.mjs";
import { createGcpBilling, EXPORT_TABLE } from "../src/collectors/gcp-billing.mjs";

const queriesDir = new URL("../queries/", import.meta.url).pathname;
const NOW = Date.parse("2026-10-28T23:10:00Z");
const NAMES = ["finance-daily", "finance-monthly", "finance-last-day", "finance-first-day"];

// As in visits.test.mjs: each saved SQL file starts with a distinct comment, so the fake knows which file ran.
function fakeBigQuery(calls, { fail = false, empty = false } = {}) {
  const first = (name) => readFileSync(`${queriesDir}${name}.sql`, "utf8").split("\n")[0];
  return {
    async query({ query, params, useLegacySql }) {
      const name = NAMES.find((n) => query.startsWith(first(n)));
      if (!name) throw new Error(`no fixture for query starting ${query.slice(0, 60)}`);
      assert.equal(useLegacySql, false);
      assert.ok(query.includes("`csarko-sh.billing.export_tbl`"), "table rewritten");
      assert.ok(!query.includes("gcp_billing_export_v1_013AA0_554DB9_BBF90D"), "the placeholder is gone");
      calls.push({ name, params });
      if (fail) throw new Error("quota");
      if (name === "finance-last-day") return [[{ day: empty ? null : "2026-10-27" }]];
      if (name === "finance-first-day") return [[{ day: empty ? null : "2026-08-01" }]];
      if (name === "finance-daily") return [[{ day: "2026-10-27", project: "fps-csarko", service: "Cloud Run", sku: "Services CPU (Request-based billing)", unit: "second", net: 0.08, amount: 9800 }]];
      return [[{ month: "2026-10", project: "fps-csarko", service: "Vertex AI", sku: "Veo 3 Fast 720p Audio Video Generation", unit: "count", net: { value: "64.8" }, amount: 648 }]];
    },
  };
}

const make = (opts = {}) => {
  const calls = [];
  const gcp = createGcpBilling({ bigquery: fakeBigQuery(calls, opts), projectId: "csarko-sh", dataset: "billing", table: "export_tbl", cache: createCache({ now: () => NOW }), now: () => NOW, queriesDir });
  return { gcp, calls };
};

test("configured only with a client, a dataset and a table", () => {
  assert.equal(make().gcp.configured, true);
  assert.equal(createGcpBilling({ bigquery: null, projectId: "p", dataset: "billing", table: "t", cache: createCache() }).configured, false);
  assert.equal(createGcpBilling({ bigquery: {}, projectId: "p", dataset: "", table: "t", cache: createCache() }).configured, false);
  assert.equal(createGcpBilling({ bigquery: {}, projectId: "p", dataset: "billing", table: "", cache: createCache() }).configured, false);
});

test("daily runs finance-daily.sql over the last 60 days to tomorrow, plain rows, cached by window", async () => {
  const { gcp, calls } = make();
  const rows = await gcp.daily();
  assert.deepEqual(calls, [{ name: "finance-daily", params: { start: "2026-08-30", end: "2026-10-29" } }]);
  assert.deepEqual(rows[0], { day: "2026-10-27", project: "fps-csarko", service: "Cloud Run", sku: "Services CPU (Request-based billing)", unit: "second", net: 0.08, amount: 9800 });
  await gcp.daily();
  assert.equal(calls.length, 1, "the second read is the cache's");
  await gcp.daily(7);
  assert.deepEqual(calls[1].params, { start: "2026-10-22", end: "2026-10-29" });
});

test("monthly runs finance-monthly.sql from the first of the month 12 months back; wrapped values come back plain", async () => {
  const { gcp, calls } = make();
  const rows = await gcp.monthly();
  assert.deepEqual(calls, [{ name: "finance-monthly", params: { start: "2025-10-01", end: "2026-10-29" } }]);
  assert.equal(rows[0].net, "64.8", "BigQuery's { value } wrapper is unwrapped");
  await gcp.monthly(3);
  assert.equal(calls[1].params.start, "2026-08-01");
});

test("lastDay runs finance-last-day.sql over the same window and answers null for an empty export", async () => {
  const { gcp, calls } = make();
  assert.equal(await gcp.lastDay(), "2026-10-27");
  assert.deepEqual(calls, [{ name: "finance-last-day", params: { start: "2026-08-30" } }]);
  assert.equal(await make({ empty: true }).gcp.lastDay(), null);
});

test("a failing job is an UpstreamError naming the file, and is not cached", async () => {
  const { gcp, calls } = make({ fail: true });
  await assert.rejects(gcp.daily(), { name: "UpstreamError", message: "BigQuery finance-daily failed: quota" });
  await assert.rejects(gcp.daily(), { name: "UpstreamError" });
  assert.equal(calls.length, 2, "retried, not remembered");
});

test("every finance SQL file reads the export table placeholder and prunes on _PARTITIONTIME", () => {
  for (const name of NAMES) {
    const sql = readFileSync(`${queriesDir}${name}.sql`, "utf8");
    assert.ok(sql.includes("`csarko-sh.billing.gcp_billing_export_v1_013AA0_554DB9_BBF90D`"), `${name} names the export table the runner rewrites`);
    assert.ok(EXPORT_TABLE.test(sql), name);
    EXPORT_TABLE.lastIndex = 0;
    // The first-day query scans the whole table on purpose: where the history starts is not
    // inside any window, and the table is kilobytes a day.
    if (name === "finance-first-day") continue;
    assert.ok(sql.includes("_PARTITIONTIME >= TIMESTAMP(DATE_SUB(DATE(@start), INTERVAL 2 DAY))"), `${name} prunes partitions`);
    assert.ok(sql.includes("usage_start_time >= TIMESTAMP(@start)"), `${name} cuts on usage time`);
  }
  for (const name of ["finance-daily", "finance-monthly"]) {
    const sql = readFileSync(`${queriesDir}${name}.sql`, "utf8");
    assert.ok(sql.includes("SUM(cost) + SUM(IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) AS c), 0)) AS net"), `${name} nets the credits`);
    assert.ok(sql.includes("SUM(usage.amount) AS amount") && sql.includes("usage.unit AS unit"), `${name} carries the usage`);
  }
});

test("firstDay reads the export's first usage day over the whole table and answers null for an empty export", async () => {
  const { gcp, calls } = make();
  assert.equal(await gcp.firstDay(), "2026-08-01");
  assert.deepEqual(calls.at(-1).params, {});
  assert.equal(await make({ empty: true }).gcp.firstDay(), null);
});
