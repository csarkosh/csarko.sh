import { test } from "node:test";
import assert from "node:assert/strict";
import { createAwsCost, rowsOf, FORECAST_LAST_DAY, CALL_COST_USD } from "../src/collectors/aws-cost.mjs";

const NOW = Date.parse("2026-10-28T10:00:00Z");
const quiet = { error() {}, warn() {}, log() {} };

const group = (line, service, amount, quantity, unit = "Hrs") => ({ Keys: [line, service], Metrics: { UnblendedCost: { Amount: String(amount), Unit: "USD" }, UsageQuantity: { Amount: String(quantity), Unit: unit } } });

/** A fake Cost Explorer client: records each command, answers two pages for the usage call and a total for the forecast. */
function fakeClient(sent, { fail = false } = {}) {
  return {
    async send(command) {
      sent.push({ name: command.constructor.name, input: command.input });
      if (fail) throw new Error("User is not authorized to perform ce:GetCostAndUsage");
      if (command.constructor.name === "GetCostForecastCommand") return { Total: { Amount: "1.42", Unit: "USD" }, ForecastResultsByTime: [] };
      const second = Boolean(command.input.NextPageToken);
      return {
        ResultsByTime: [{
          TimePeriod: { Start: command.input.Granularity === "DAILY" ? "2026-10-27" : "2026-10-01", End: "x" },
          Estimated: true,
          Groups: second
            ? [group("USE1-EBS:SnapshotUsage", "EC2 - Other", "0.0097", "0.194", "GB-Mo")]
            : [group("BoxUsage:g4dn.xlarge", "Amazon Elastic Compute Cloud - Compute", "3.156", "6"), group("Tax", "Tax", "0", "0", "Count")],
        }],
        ...(second ? {} : { NextPageToken: "page-2" }),
      };
    },
  };
}

test("not configured without a role ARN; configured with one, or in local mode", () => {
  assert.equal(createAwsCost({ roleArn: null, log: quiet }).configured, false);
  assert.equal(createAwsCost({ roleArn: "arn:aws:iam::705624689046:role/csarko-admin-costs", log: quiet }).configured, true);
  const local = createAwsCost({ roleArn: null, local: true, log: quiet });
  assert.deepEqual([local.configured, local.local], [true, true]);
  assert.equal(CALL_COST_USD, 0.01);
});

test("monthlyByUsage: 13 months to tomorrow, MONTHLY, both metrics, usage type and service, every page, calls counted", async () => {
  const sent = [];
  const ce = createAwsCost({ roleArn: "arn", now: () => NOW, log: quiet, client: fakeClient(sent) });
  const { rows, calls } = await ce.monthlyByUsage();
  assert.equal(calls, 2);
  assert.equal(sent.length, 2);
  assert.equal(sent[0].name, "GetCostAndUsageCommand");
  assert.deepEqual(sent[0].input, {
    TimePeriod: { Start: "2025-10-01", End: "2026-10-29" },
    Granularity: "MONTHLY",
    Metrics: ["UnblendedCost", "UsageQuantity"],
    GroupBy: [{ Type: "DIMENSION", Key: "USAGE_TYPE" }, { Type: "DIMENSION", Key: "SERVICE" }],
  });
  assert.equal(sent[1].input.NextPageToken, "page-2");
  assert.deepEqual(rows, [
    { month: "2026-10", service: "Amazon Elastic Compute Cloud - Compute", line: "BoxUsage:g4dn.xlarge", amount: 3.156, quantity: 6, unit: "Hrs" },
    { month: "2026-10", service: "EC2 - Other", line: "USE1-EBS:SnapshotUsage", amount: 0.0097, quantity: 0.194, unit: "GB-Mo" },
  ], "a group with no cost and no usage is dropped");
  assert.deepEqual((await ce.monthlyByUsage(3)).rows.length, 2);
  assert.equal(sent[2].input.TimePeriod.Start, "2026-08-01");
});

test("dailyByUsage: the last 60 days to tomorrow, DAILY, rows carry the day", async () => {
  const sent = [];
  const ce = createAwsCost({ roleArn: "arn", now: () => NOW, log: quiet, client: fakeClient(sent) });
  const { rows, calls } = await ce.dailyByUsage();
  assert.equal(calls, 2);
  assert.deepEqual(sent[0].input.TimePeriod, { Start: "2026-08-30", End: "2026-10-29" });
  assert.equal(sent[0].input.Granularity, "DAILY");
  assert.equal(rows[0].day, "2026-10-27");
  assert.equal(rows[0].month, undefined);
  assert.equal((await ce.dailyByUsage(7)).calls, 2);
  assert.equal(sent[2].input.TimePeriod.Start, "2026-10-22");
});

test("forecast: from today to the first of next month until the 28th, then null without a call", async () => {
  const sent = [];
  const ce = createAwsCost({ roleArn: "arn", now: () => NOW, log: quiet, client: fakeClient(sent) });
  assert.deepEqual(await ce.forecast(), { forecast: { from: "2026-10-28", to: "2026-11-01", remaining: 1.42 }, calls: 1 });
  assert.deepEqual(sent[0], { name: "GetCostForecastCommand", input: { TimePeriod: { Start: "2026-10-28", End: "2026-11-01" }, Metric: "UNBLENDED_COST", Granularity: "MONTHLY" } });
  assert.equal(FORECAST_LAST_DAY, 28);
  const late = createAwsCost({ roleArn: "arn", now: () => Date.parse("2026-10-29T10:00:00Z"), log: quiet, client: fakeClient(sent) });
  assert.deepEqual(await late.forecast(), { forecast: null, calls: 0 });
  assert.equal(sent.length, 1, "no call after the 28th");
  const dec = createAwsCost({ roleArn: "arn", now: () => Date.parse("2026-12-05T10:00:00Z"), log: quiet, client: fakeClient(sent) });
  assert.equal((await dec.forecast()).forecast.to, "2027-01-01");
});

test("a refused call is an UpstreamError naming the command", async () => {
  const ce = createAwsCost({ roleArn: "arn", now: () => NOW, log: quiet, client: fakeClient([], { fail: true }) });
  await assert.rejects(ce.dailyByUsage(), { name: "UpstreamError", message: /^Cost Explorer GetCostAndUsageCommand failed: User is not authorized/ });
  await assert.rejects(ce.forecast(), { name: "UpstreamError", message: /^Cost Explorer GetCostForecastCommand failed/ });
});

test("rowsOf maps every period and group, rounding to six decimals", () => {
  const out = { ResultsByTime: [
    { TimePeriod: { Start: "2026-10-26", End: "2026-10-27" }, Groups: [group("DNS-Queries", "Amazon Route 53", "0.0020001234", "5000", "Queries")] },
    { TimePeriod: { Start: "2026-10-27", End: "2026-10-28" }, Groups: [] },
  ] };
  assert.deepEqual(rowsOf(out, "DAILY"), [{ day: "2026-10-26", service: "Amazon Route 53", line: "DNS-Queries", amount: 0.002, quantity: 5000, unit: "Queries" }]);
  assert.deepEqual(rowsOf({}, "MONTHLY"), []);
});
