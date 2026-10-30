import { test } from "node:test";
import assert from "node:assert/strict";
import { CATEGORIES, CATEGORY_KEYS, categorize, kindOf } from "../src/finance/categories.mjs";
import { awsRegionOf, awsRows, gcpRows, githubRows, cents, fine, addMonths, daysInMonth, monthsBetween, lastBilledDay } from "../src/finance/rows.mjs";
import { parseRange, monthsOf, partialMonths, categoriesTable, monthTotals, runRateForecast, RANGES } from "../src/finance/months.mjs";
import { idleLines } from "../src/finance/idle.mjs";
import { dailySeries, median, trailingTotals } from "../src/finance/daily.mjs";
import { activityItems, toGiB, toHours } from "../src/finance/activity.mjs";
import { financeHealth } from "../src/finance/kpis.mjs";

/* ---- categories ---- */

test("the eleven categories, in the contract's order, each idle, activity or fixed", () => {
  assert.deepEqual(CATEGORY_KEYS, ["compute", "serverless", "hosting", "loadBalancing", "storage", "ai", "dns", "domains", "ci", "tax", "other"]);
  assert.deepEqual(CATEGORIES.map((c) => c.kind), ["activity", "activity", "activity", "idle", "idle", "activity", "idle", "fixed", "activity", "activity", "activity"]);
  assert.ok(CATEGORIES.every((c) => typeof c.label === "string" && c.label.length > 0));
  assert.equal(kindOf("storage"), "idle");
  assert.equal(kindOf("nope"), "activity", "an unknown key reads as other");
});

test("every October 2026 AWS usage type lands in a category, none in other", () => {
  const expected = {
    "BoxUsage:g4dn.xlarge": "compute",
    "EBS:VolumeUsage.gp3": "storage",
    HostedZone: "dns",
    "USW2-EBS:SnapshotUsage": "storage",
    "USE2-EBS:SnapshotUsage": "storage",
    "us-west-2-KMS-Keys": "dns",
    "USE1-AWSSecretsManager-Secrets": "dns",
    "EBS:SnapshotUsage": "storage",
    "USE1-PublicIPv4:InUseAddress": "hosting",
    "DNS-Queries": "hosting",
    "USW2-TimedStorage-ByteHrs": "storage",
    "Route53-Domains": "domains",
    Tax: "tax",
    "USW2-Requests-Tier2": "storage",
  };
  for (const [line, category] of Object.entries(expected)) assert.equal(categorize({ provider: "aws", service: "", line }), category, line);
  assert.equal(categorize({ provider: "aws", service: "Amazon Registrar", line: "Route53-Domains" }), "domains");
  assert.equal(categorize({ provider: "aws", service: "Amazon Elastic Compute Cloud - Compute", line: "USW2-BoxUsage:g4dn.xlarge" }), "compute", "a region prefix does not hide the usage type");
});

test("every October 2026 GCP SKU lands in a category, none in other", () => {
  const expected = [
    ["Vertex AI", "Veo 3 Fast 720p Audio Video Generation", "ai"],
    ["Firebase Hosting", "Outgoing Bandwidth", "hosting"],
    ["Networking", "Cloud Load Balancer Forwarding Rule Minimum Global", "loadBalancing"],
    ["Compute Engine", "Balanced PD Capacity", "storage"],
    ["Cloud Run", "Services CPU (Instance-based billing) in us-west1", "serverless"],
    ["Compute Engine", "Nvidia L4 GPU running in Americas", "compute"],
    ["Compute Engine", "Licensing Fee for NVIDIA Quadro Virtual Workstation (GPU cost)", "compute"],
    ["Firebase Hosting", "Storage", "storage"],
    ["Compute Engine", "Licensing Fee for Windows Server 2025 Datacenter Edition on VM", "compute"],
    ["Cloud Run", "Services CPU (Request-based billing)", "serverless"],
    ["Cloud Run Functions", "CPU Allocation Time", "serverless"],
    ["Generative Language API", "Gemini 2.5 Pro Input", "ai"],
    ["Cloud Storage", "Standard Storage US Multi-region", "storage"],
    ["Artifact Registry", "Artifact Registry Storage", "storage"],
    ["Networking", "Network Egress via Carrier Peering", "hosting"],
  ];
  for (const [service, line, category] of expected) assert.equal(categorize({ provider: "gcp", service, line }), category, `${service}: ${line}`);
});

test("GitHub products, the spec's baseline lines and the fallback to other", () => {
  assert.equal(categorize({ provider: "github", service: "actions", line: "Actions Linux" }), "ci");
  assert.equal(categorize({ provider: "github", service: "git_lfs", line: "LFS Storage" }), "ci");
  assert.equal(categorize({ provider: "github", service: "copilot", line: "Copilot Business" }), "other");
  assert.equal(categorize({ provider: "gcp", service: "Cloud Logging", line: "Log Storage cost" }), "other");
  assert.equal(categorize({ provider: "aws", service: "Amazon Simple Queue Service", line: "Requests-RBP" }), "other");
  assert.equal(categorize({ provider: "aws" }), "other", "missing fields do not throw");
  assert.equal(categorize({ provider: "stripe", service: "x", line: "y" }), "other");
});

/* ---- rows ---- */

test("an AWS usage type's region: its prefix, global for Route 53 and tax, us-east-1 otherwise", () => {
  assert.equal(awsRegionOf("USW2-EBS:SnapshotUsage"), "us-west-2");
  assert.equal(awsRegionOf("USE1-PublicIPv4:InUseAddress"), "us-east-1");
  assert.equal(awsRegionOf("us-west-2-KMS-Keys"), "us-west-2");
  assert.equal(awsRegionOf("EUC1-BoxUsage:t3.micro"), "eu-central-1");
  assert.equal(awsRegionOf("HostedZone", "Amazon Route 53"), "global");
  assert.equal(awsRegionOf("Route53-Domains", "Amazon Registrar"), "global");
  assert.equal(awsRegionOf("Tax", "Tax"), "global");
  assert.equal(awsRegionOf("BoxUsage:g4dn.xlarge", "Amazon Elastic Compute Cloud - Compute"), "us-east-1");
  assert.equal(awsRegionOf("EBS:VolumeUsage.gp3", "EC2 - Other"), "us-east-1");
});

test("the three sources become one row shape; GitHub's amount is the net and keeps the gross", () => {
  const [a] = awsRows([{ day: "2026-10-22", service: "Amazon Elastic Compute Cloud - Compute", line: "BoxUsage:g4dn.xlarge", amount: "3.156", quantity: 6, unit: "Hrs" }]);
  assert.deepEqual(a, { provider: "aws", day: "2026-10-22", service: "Amazon Elastic Compute Cloud - Compute", line: "BoxUsage:g4dn.xlarge", where: "us-east-1", category: "compute", amount: 3.156, quantity: 6, unit: "Hrs", gross: null });
  const [g] = gcpRows([{ month: "2026-10", project: "fps-csarko", service: "Vertex AI", sku: "Veo 3 Fast 720p Audio Video Generation", unit: "count", net: 64.8, amount: 648 }]);
  assert.deepEqual([g.provider, g.month, g.where, g.category, g.amount, g.quantity], ["gcp", "2026-10", "fps-csarko", "ai", 64.8, 648]);
  const [h] = githubRows([{ month: "2026-10", product: "actions", sku: "Actions Linux", quantity: 9185, unitType: "Minutes", gross: 73.48, net: 0 }]);
  assert.deepEqual([h.provider, h.category, h.amount, h.gross, h.unit, h.where], ["github", "ci", 0, 73.48, "Minutes", null]);
  assert.deepEqual(awsRows(null), []);
  assert.equal(lastBilledDay([{ day: "2026-10-27", amount: 0 }, { day: "2026-10-26", amount: 0.1 }, { day: "2026-10-20", amount: 1 }]), "2026-10-26", "a zero row is not a billed day");
  assert.equal(lastBilledDay([]), null);
});

test("rounding: cents and four decimals, never -0", () => {
  assert.equal(cents(21.1978), 21.2);
  assert.equal(cents(-0.001), 0);
  assert.ok(!Object.is(cents(-0.001), -0));
  assert.equal(cents("x"), 0);
  assert.equal(fine(0.52185), 0.5219);
  assert.equal(addMonths("2026-01", -1), "2025-12");
  assert.equal(addMonths("2025-10", 12), "2026-10");
  assert.equal(daysInMonth("2026-02"), 28);
  assert.deepEqual(monthsBetween("2025-11", "2026-01"), ["2025-11", "2025-12", "2026-01"]);
});

/* ---- months and the categories table ---- */

test("parseRange accepts month, last, 90 and 13m, defaults to month and refuses the rest", () => {
  assert.deepEqual(RANGES, ["month", "last", "90", "13m"]);
  assert.deepEqual([parseRange(null), parseRange(""), parseRange(undefined)], ["month", "month", "month"]);
  assert.deepEqual(["month", "last", "90", "13m"].map(parseRange), ["month", "last", "90", "13m"]);
  for (const bad of ["7", "30", "12m", "Month", "year", "90d", "all"]) assert.equal(parseRange(bad), null, bad);
});

test("the months of a range, across a year boundary", () => {
  assert.deepEqual(monthsOf("month", "2026-10-28"), ["2026-10"]);
  assert.deepEqual(monthsOf("last", "2026-01-15"), ["2025-12"]);
  assert.deepEqual(monthsOf("90", "2026-01-15"), ["2025-11", "2025-12", "2026-01"]);
  const thirteen = monthsOf("13m", "2026-10-28");
  assert.equal(thirteen.length, 13);
  assert.deepEqual([thirteen[0], thirteen.at(-1)], ["2025-10", "2026-10"]);
  assert.deepEqual(partialMonths(["2026-08", "2026-09", "2026-10", "2026-11"]), ["2026-08", "2026-09"], "months before the export's first month");
});

test("categoriesTable: every category present and aligned, zeros never null, other lines summed", () => {
  const rows = [
    ...awsRows([{ month: "2026-09", service: "EC2", line: "BoxUsage:g4dn.xlarge", amount: 7.7 }, { month: "2026-10", service: "EC2", line: "BoxUsage:g4dn.xlarge", amount: 21.24 }]),
    ...gcpRows([{ month: "2026-10", service: "Compute Engine", sku: "Nvidia L4 GPU running in Americas", net: 5.24 }, { month: "2026-10", service: "Cloud Logging", sku: "Log Storage cost", net: 0.3 }, { month: "2026-09", service: "Cloud Logging", sku: "Log Storage cost", net: 0.1 }, { month: "2026-10", service: "Mystery", sku: "Free thing", net: 0 }]),
    ...githubRows([{ month: "2026-10", product: "actions", sku: "Actions Linux", gross: 73.48, net: 0 }]),
    ...awsRows([{ month: "2026-07", service: "EC2", line: "BoxUsage:g4dn.xlarge", amount: 99 }]),
  ];
  const t = categoriesTable(rows, ["2026-08", "2026-09", "2026-10"]);
  assert.deepEqual(t.months, ["2026-08", "2026-09", "2026-10"]);
  assert.equal(t.categories.length, 11);
  assert.deepEqual(t.categories.map((c) => c.key), CATEGORY_KEYS);
  assert.deepEqual(t.categories[0], { key: "compute", label: "Compute", kind: "activity", byMonth: [0, 7.7, 26.48] });
  assert.deepEqual(t.categories.find((c) => c.key === "ci").byMonth, [0, 0, 0], "net, not gross");
  assert.deepEqual(t.categories.find((c) => c.key === "other").byMonth, [0, 0.1, 0.3]);
  assert.deepEqual(t.partial, ["2026-08", "2026-09"]);
  assert.deepEqual(t.other, [{ provider: "gcp", line: "Log Storage cost", amount: 0.4 }], "a zero line is not listed; a month outside the range is not counted");
  assert.deepEqual(monthTotals(rows, "2026-10"), { aws: 21.24, gcp: 5.54, github: 0 });
});

test("a run-rate forecast extrapolates the month to date over the days billed", () => {
  assert.equal(Math.round(runRateForecast(27, "2026-10", "2026-10-27") * 100) / 100, 31);
  assert.equal(runRateForecast(10, "2026-10", "2026-09-30"), null, "no day in the month yet");
  assert.equal(runRateForecast(10, "2026-10", null), null);
});

/* ---- idle ---- */

const day = (n) => `2026-10-${String(n).padStart(2, "0")}`;
const idleRow = (provider, line, d, amount, extra = {}) => (provider === "aws"
  ? awsRows([{ day: d, service: "EC2 - Other", line, amount }])[0]
  : gcpRows([{ day: d, project: extra.project ?? "magicpixel-487014", service: extra.service ?? "Networking", sku: line, net: amount }])[0]);

test("idle lines: the seven-day average times 30, a stopped line kept a week at zero, an older one dropped, activity lines ignored", () => {
  const rows = [];
  for (let n = 1; n <= 27; n += 1) rows.push(idleRow("aws", "USE1-EBS:SnapshotUsage", day(n), 0.0097));
  for (let n = 1; n <= 18; n += 1) rows.push(idleRow("gcp", "Cloud Load Balancer Forwarding Rule Minimum Global", day(n), 0.609));
  for (let n = 1; n <= 12; n += 1) rows.push(idleRow("aws", "USW2-TimedStorage-ByteHrs", day(n), 0.003));
  for (let n = 22; n <= 27; n += 1) rows.push(awsRows([{ day: day(n), service: "EC2", line: "BoxUsage:g4dn.xlarge", amount: 3.1 }])[0]);
  rows.push(idleRow("gcp", "Balanced PD Capacity", day(27), 0.004, { project: "fps-csarko", service: "Compute Engine" }));
  rows.push(idleRow("aws", "EBS:VolumeUsage.gp3", day(27), 0));
  const r = idleLines(rows, { today: "2026-10-28" });
  assert.equal(r.asOf, "2026-10-27");
  assert.deepEqual(r.lines.map((l) => l.line), ["USE1-EBS:SnapshotUsage", "Balanced PD Capacity", "Cloud Load Balancer Forwarding Rule Minimum Global"]);
  assert.deepEqual(r.lines[0], { provider: "aws", line: "USE1-EBS:SnapshotUsage", category: "storage", where: "us-east-1", perDay: 0.0097, perMonth: 0.29, stoppedOn: null });
  assert.deepEqual(r.lines[1], { provider: "gcp", line: "Balanced PD Capacity", category: "storage", where: "fps-csarko", perDay: 0.0006, perMonth: 0.02, stoppedOn: null }, "one day billed of seven averages over seven");
  assert.deepEqual(r.lines[2], { provider: "gcp", line: "Cloud Load Balancer Forwarding Rule Minimum Global", category: "loadBalancing", where: "magicpixel-487014", perDay: 0, perMonth: 0, stoppedOn: "2026-10-18" });
  assert.equal(r.runRate, 0.31);
  const shifted = idleLines(rows, { today: "2026-10-28", shiftDays: 7 });
  assert.equal(shifted.asOf, "2026-10-20");
  // GCP's window then ends on the 20th (its last billed day, the 27th, less seven): five billed days of seven.
  assert.deepEqual(shifted.lines.find((l) => l.line.startsWith("Cloud Load")).perMonth, 13.05, "a week earlier the forwarding rule was still billing");
  assert.deepEqual(idleLines([], { today: "2026-10-28" }), { asOf: "2026-10-28", runRate: 0, lines: [] });
});

test("each provider's window ends on its own last billed day", () => {
  const rows = [];
  for (let n = 15; n <= 27; n += 1) rows.push(idleRow("aws", "USE1-EBS:SnapshotUsage", day(n), 0.01));
  for (let n = 15; n <= 25; n += 1) rows.push(idleRow("gcp", "Balanced PD Capacity", day(n), 0.004, { project: "fps-csarko", service: "Compute Engine" }));
  const r = idleLines(rows, { today: "2026-10-28" });
  assert.equal(r.asOf, "2026-10-27");
  assert.equal(r.lines.find((l) => l.provider === "gcp").perDay, 0.004, "the export runs two days behind; its line is not thinned by the days it has not reported");
});

/* ---- daily ---- */

test("median, the 60-day series, the median of the 14 days before, flags and the top line", () => {
  assert.equal(median([]), null);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  const rows = [];
  for (let n = 1; n <= 27; n += 1) {
    rows.push(idleRow("gcp", "Cloud Load Balancer Forwarding Rule Minimum Global", day(n), 0.6));
    rows.push(idleRow("aws", "USE1-EBS:SnapshotUsage", day(n), 0.4));
  }
  rows.push(awsRows([{ day: day(20), service: "EC2", line: "BoxUsage:g4dn.xlarge", amount: 4.2 }])[0]);
  rows.push(gcpRows([{ day: day(20), project: "fps-csarko", service: "Vertex AI", sku: "Veo 3 Fast 720p Audio Video Generation", net: 24.4 }])[0]);
  rows.push(awsRows([{ day: day(3), service: "EC2", line: "BoxUsage:g4dn.xlarge", amount: 2.5 }])[0]);
  const s = dailySeries(rows, { today: "2026-10-28", configured: ["aws", "gcp"] });
  assert.equal(s.asOf, "2026-10-27");
  assert.equal(s.days.length, 60);
  assert.deepEqual([s.days[0].day, s.days.at(-1).day], ["2026-08-29", "2026-10-27"], "every day present, the empty ones at 0");
  assert.deepEqual(s.days[0], { day: "2026-08-29", aws: 0, gcp: 0, github: null, total: 0, median14: null, flagged: false, top: null });
  const d20 = s.days.find((d) => d.day === day(20));
  assert.deepEqual(d20, { day: "2026-10-20", aws: 4.6, gcp: 25, github: null, total: 29.6, median14: 1, flagged: true, top: { provider: "gcp", line: "Veo 3 Fast 720p Audio Video Generation", amount: 24.4 } });
  const d3 = s.days.find((d) => d.day === day(3));
  assert.equal(d3.median14, 0, "the fourteen days before are mostly the empty days of the window's start");
  assert.equal(d3.flagged, true, "$3.50 against a zero median, over the $1 floor");
  const d21 = s.days.find((d) => d.day === day(21));
  assert.equal(d21.median14, 1, "a spike does not move the median");
  assert.equal(d21.flagged, false);
  const quiet = dailySeries(rows.filter((r) => r.amount < 1), { today: "2026-10-28", configured: ["aws", "gcp"] });
  assert.ok(quiet.days.every((d) => !d.flagged), "a $1 day is never flagged even at three times a tiny median");
  assert.deepEqual(trailingTotals(s.days, 7), { value: 7, prev: 35.6 }, "the week before holds the spike");
  assert.deepEqual(trailingTotals(s.days.slice(-5), 7).prev, null);
});

/* ---- activity ---- */

test("unit conversions and the five items in order, with nulls for a source that is off", () => {
  assert.equal(toGiB(2 ** 30, "byte"), 1);
  assert.equal(toGiB(3, "gibibyte"), 3);
  assert.equal(toHours(7200, "second"), 2);
  assert.equal(toHours(90, "minute"), 1.5);
  const rows = [
    ...awsRows([{ month: "2026-10", service: "Amazon Elastic Compute Cloud - Compute", line: "BoxUsage:g4dn.xlarge", amount: 21.24, quantity: 40.3, unit: "Hrs" }]),
    ...gcpRows([
      { month: "2026-10", project: "csarko-sh", service: "Firebase Hosting", sku: "Outgoing Bandwidth", unit: "gibibyte", net: 18.76, amount: 134.96 },
      { month: "2026-10", project: "csarko-sh", service: "Firebase Hosting", sku: "Storage", unit: "gibibyte month", net: 0.1, amount: 1 },
      { month: "2026-10", project: "fps-csarko", service: "Cloud Run", sku: "Services CPU (Request-based billing)", unit: "second", net: 2.4, amount: 300_000 },
      { month: "2026-10", project: "fps-csarko", service: "Cloud Run", sku: "Services Memory (Request-based billing)", unit: "gibibyte second", net: 1.03, amount: 900_000 },
      { month: "2026-10", project: "fps-csarko", service: "Vertex AI", sku: "Veo 3 Fast 720p Audio Video Generation", unit: "count", net: 64.8, amount: 648 },
    ]),
    ...githubRows([
      { month: "2026-10", product: "actions", sku: "Actions Linux", quantity: 9185, unitType: "Minutes", gross: 73.48, net: 0 },
      { month: "2026-10", product: "actions", sku: "Actions Storage", quantity: 6, unitType: "GigabyteHours", gross: 0.05, net: 0 },
    ]),
  ];
  const items = activityItems(rows);
  assert.deepEqual(items.map((i) => i.key), ["rigHours", "egressGiB", "cloudRunCpuHours", "ciMinutes", "aiGenerations"]);
  assert.deepEqual(items[0], { key: "rigHours", label: "Rig hours", quantity: 40.3, unit: "h", cost: 21.24, unitPrice: 0.527, per: "an hour" });
  assert.deepEqual(items[1], { key: "egressGiB", label: "Hosting egress", quantity: 134.96, unit: "GiB", cost: 18.76, unitPrice: 0.139, per: "a GiB" });
  assert.deepEqual(items[2], { key: "cloudRunCpuHours", label: "Cloud Run CPU", quantity: 83.33, unit: "h", cost: 3.43, unitPrice: 0.0412, per: "an hour, after the free tier" }, "CPU seconds as hours against every serverless dollar");
  assert.deepEqual(items[3], { key: "ciMinutes", label: "CI minutes", quantity: 9185, unit: "min", cost: 0, gross: 73.53, unitPrice: 0.008, per: "a Linux minute if private" });
  assert.deepEqual(items[4], { key: "aiGenerations", label: "AI generations", quantity: 648, unit: "", cost: 64.8, unitPrice: 0.1, per: "a clip" });
  const off = activityItems(rows, { configured: ["aws"] });
  assert.deepEqual(off[1], { key: "egressGiB", label: "Hosting egress", quantity: null, unit: "GiB", cost: null, unitPrice: null, per: "a GiB" });
  assert.deepEqual(off[3], { key: "ciMinutes", label: "CI minutes", quantity: null, unit: "min", cost: null, gross: null, unitPrice: null, per: "a Linux minute if private" });
  assert.equal(off[0].quantity, 40.3);
  const none = activityItems([], { configured: ["aws", "gcp", "github"] });
  assert.deepEqual([none[0].quantity, none[0].cost, none[0].unitPrice], [0, 0, null], "a quantity of 0 is a measurement; the unit price is unknown");
});

/* ---- health ---- */

test("health: good under the goal, warning over it or on a flagged day, critical on an unexplained $20 day", () => {
  const quiet = Array.from({ length: 10 }, (_, i) => ({ day: day(i + 1), total: 0.9, flagged: false, top: null }));
  assert.deepEqual(financeHealth({ idleRunRate: 1.05, goalUsd: 5, days: quiet, rows: [] }), { status: "good", note: "Idle run-rate $1.05 a month, under the $5 goal" });
  assert.deepEqual(financeHealth({ idleRunRate: 10.62, goalUsd: 5, days: quiet, rows: [] }), { status: "warning", note: "Idle run-rate $10.62 a month, over the $5 goal" });
  const spiked = [...quiet.slice(0, 9), { day: day(10), total: 4.5, flagged: true, top: { provider: "aws", line: "BoxUsage:g4dn.xlarge", amount: 4.2 } }];
  assert.deepEqual(financeHealth({ idleRunRate: 1, goalUsd: 5, days: spiked, rows: [] }), { status: "warning", note: "$4.50 on 2026-10-10, over three times the trailing median, BoxUsage:g4dn.xlarge" });
  const big = [...quiet.slice(0, 9), { day: day(10), total: 26.72, flagged: true, top: null }];
  const veo = gcpRows([{ day: day(10), service: "Vertex AI", sku: "Veo 3 Fast 720p Audio Video Generation", net: 24.4 }]);
  assert.equal(financeHealth({ idleRunRate: 1, goalUsd: 5, days: big, rows: veo }).status, "warning", "a Veo batch explains the day");
  assert.deepEqual(financeHealth({ idleRunRate: 1, goalUsd: 5, days: big, rows: [] }), { status: "critical", note: "$26.72 on 2026-10-10 with no rig or AI line to explain it" });
  const old = [{ day: day(1), total: 50, flagged: true, top: null }, ...quiet.slice(1)];
  assert.equal(financeHealth({ idleRunRate: 1, goalUsd: 5, days: old, rows: [] }).status, "good", "only the last seven days count");
  assert.deepEqual(financeHealth({ idleRunRate: null, goalUsd: 5, days: quiet, rows: [] }), { status: "warning", note: "No idle run-rate yet" });
});
