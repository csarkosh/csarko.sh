import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CATEGORIES, CATEGORY_KEYS, categorize, kindOf } from "../src/finance/categories.mjs";
import { PROVIDERS, PROVIDER_LABELS, awsRegionOf, awsRows, gcpRows, githubRows, modalRows, falRows, cents, fine, addMonths, daysInMonth, monthsBetween, lastBilledDay, FAL_LINE } from "../src/finance/rows.mjs";
import { parseRange, monthsOf, partialMonths, categoriesTable, monthTotals, runRateForecast, RANGES } from "../src/finance/months.mjs";
import { idleLines } from "../src/finance/idle.mjs";
import { dailySeries, median, trailingTotals } from "../src/finance/daily.mjs";
import { activityItems, toGiB, toHours } from "../src/finance/activity.mjs";
import { financeHealth, CRITICAL_DAY_USD } from "../src/finance/kpis.mjs";
import { falSeries } from "../src/finance/fal.mjs";
import { PROJECTS, PROJECT_KEYS, projectOf, projectsTable } from "../src/finance/projects.mjs";
import { filmLabel, providerOf, filmOf, filmsOf, DEFAULT_CAP_USD } from "../src/finance/films.mjs";
import { CLAUDE_SUBSCRIPTION_KEY, CLAUDE_LINE, subscriptionSeries, subscriptionFor, claudeRows, claudeUsage, usageForMonths, usageDays } from "../src/finance/claude.mjs";
import { donationsOf, incomeFor, incomeDays, incomeMonths, recentOf, payoutsOf, balanceOf, lastDonationDay, incomeByDoor } from "../src/finance/income.mjs";

/* ---- categories ---- */

test("the twelve categories, in the contract's order, each idle, activity or fixed; Claude Code fixed, after the domains", () => {
  assert.deepEqual(CATEGORY_KEYS, ["compute", "serverless", "hosting", "loadBalancing", "storage", "ai", "dns", "domains", "claudeCode", "ci", "tax", "other"]);
  assert.deepEqual(CATEGORIES.map((c) => c.kind), ["activity", "activity", "activity", "idle", "idle", "activity", "idle", "fixed", "fixed", "activity", "activity", "activity"]);
  assert.equal(CATEGORIES.find((c) => c.key === "claudeCode").label, "Claude Code");
  assert.equal(categorize({ provider: "claude", service: "Claude Code", line: CLAUDE_LINE }), "other", "no rule: claude.mjs writes the category itself");
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

test("the six providers in the contract's order with their labels", () => {
  assert.deepEqual(PROVIDERS, ["aws", "gcp", "github", "modal", "fal", "claude"]);
  assert.deepEqual(PROVIDERS.map((p) => PROVIDER_LABELS[p]), ["AWS", "Google Cloud", "GitHub", "Modal", "fal", "Claude Code"]);
});

test("the sources become one row shape; GitHub's amount is the net and keeps the gross and the repository", () => {
  const [a] = awsRows([{ day: "2026-10-22", service: "Amazon Elastic Compute Cloud - Compute", line: "BoxUsage:g4dn.xlarge", amount: "3.156", quantity: 6, unit: "Hrs" }]);
  assert.deepEqual(a, { provider: "aws", day: "2026-10-22", service: "Amazon Elastic Compute Cloud - Compute", line: "BoxUsage:g4dn.xlarge", where: "us-east-1", category: "compute", amount: 3.156, quantity: 6, unit: "Hrs", gross: null, repo: null });
  const [g] = gcpRows([{ month: "2026-10", project: "fps-csarko", service: "Vertex AI", sku: "Veo 3 Fast 720p Audio Video Generation", unit: "count", net: 64.8, amount: 648 }]);
  assert.deepEqual([g.provider, g.month, g.where, g.category, g.amount, g.quantity, g.repo], ["gcp", "2026-10", "fps-csarko", "ai", 64.8, 648, null]);
  const [h] = githubRows([{ month: "2026-10", product: "actions", sku: "Actions Linux", repo: "game-dayhike", quantity: 9185, unitType: "Minutes", gross: 73.48, net: 0 }]);
  assert.deepEqual([h.provider, h.category, h.amount, h.gross, h.unit, h.where, h.repo], ["github", "ci", 0, 73.48, "Minutes", null, "game-dayhike"]);
  assert.equal(githubRows([{ month: "2026-10", product: "actions", sku: "Actions Linux", gross: 1, net: 0 }])[0].repo, null, "an older snapshot's row names no repository");
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
  assert.equal(t.categories.length, 12);
  assert.deepEqual(t.categories.map((c) => c.key), CATEGORY_KEYS);
  assert.deepEqual(t.categories[0], { key: "compute", label: "Compute", kind: "activity", byMonth: [0, 7.7, 26.48] });
  assert.deepEqual(t.categories.find((c) => c.key === "ci").byMonth, [0, 0, 0], "net, not gross");
  assert.deepEqual(t.categories.find((c) => c.key === "other").byMonth, [0, 0.1, 0.3]);
  assert.deepEqual(t.partial, ["2026-08", "2026-09"]);
  assert.deepEqual(t.other, [{ provider: "gcp", line: "Log Storage cost", amount: 0.4 }], "a zero line is not listed; a month outside the range is not counted");
  assert.deepEqual(monthTotals(rows, "2026-10"), { aws: 21.24, gcp: 5.54, github: 0, modal: 0, fal: 0, claude: 0 });
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
  assert.deepEqual(s.days[0], { day: "2026-08-29", aws: 0, gcp: 0, github: null, modal: null, fal: null, claude: null, total: 0, median14: null, flagged: false, top: null });
  const d20 = s.days.find((d) => d.day === day(20));
  assert.deepEqual(d20, { day: "2026-10-20", aws: 4.6, gcp: 25, github: null, modal: null, fal: null, claude: null, total: 29.6, median14: 1, flagged: true, top: { provider: "gcp", line: "Veo 3 Fast 720p Audio Video Generation", amount: 24.4 } });
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

test("unit conversions and the eight items in order, with nulls for a source that is off", () => {
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
  rows.push(
    ...modalRows({ credits: 30, monthly: [{ month: "2026-10", app: "cinema-spike", cost: 67.28 }, { month: "2026-10", app: "dayhike-record", cost: 6.64 }, { month: "2026-10", app: "dayhike-gate", cost: 6.08 }], rows: [] }),
    ...falRows([{ day: "2026-10-12", spend: 9.8, purchase: 0 }, { day: "2026-10-13", spend: 3.1, purchase: 0 }, { day: "2026-10-09", spend: 0, purchase: 100 }], "monthly"),
  );
  rows.push(...claudeRows([{ at: "2026-10-03T00:00:00Z", value: 200 }], "monthly", { today: "2026-10-28" }));
  const items = activityItems(rows, { claudeUsage: { messages: 62534, listValue: 10450.68 } });
  assert.deepEqual(items.map((i) => i.key), ["rigHours", "egressGiB", "cloudRunCpuHours", "ciMinutes", "aiGenerations", "modalGpu", "falGenerations", "claudeCode"]);
  assert.deepEqual(items[7], { key: "claudeCode", label: "Claude Code", quantity: 62534, unit: "messages", cost: 200, unitPrice: null, per: "", listValue: 10450.68 }, "the subscription as the cost, the transcripts' messages and list value beside it");
  assert.deepEqual(activityItems(rows)[7], { key: "claudeCode", label: "Claude Code", quantity: null, unit: "messages", cost: 200, unitPrice: null, per: "", listValue: null }, "the fee is entered but no sync has been read");
  assert.deepEqual(items[5], { key: "modalGpu", label: "Modal GPU", quantity: null, unit: "", cost: 80, unitPrice: null, per: "", apps: [{ app: "cinema-spike", cost: 67.28 }, { app: "dayhike-record", cost: 6.64 }, { app: "dayhike-gate", cost: 6.08 }] }, "the usage before the credits, apps largest first");
  assert.deepEqual(items[6], { key: "falGenerations", label: "fal generations", quantity: null, unit: "", cost: 12.9, unitPrice: null, per: "" }, "spend only, never the purchase");
  assert.deepEqual(items[0], { key: "rigHours", label: "Rig hours", quantity: 40.3, unit: "h", cost: 21.24, unitPrice: 0.527, per: "an hour" });
  assert.deepEqual(items[1], { key: "egressGiB", label: "Hosting egress", quantity: 134.96, unit: "GiB", cost: 18.76, unitPrice: 0.139, per: "a GiB" });
  assert.deepEqual(items[2], { key: "cloudRunCpuHours", label: "Cloud Run CPU", quantity: 83.33, unit: "h", cost: 3.43, unitPrice: 0.0412, per: "an hour, after the free tier" }, "CPU seconds as hours against every serverless dollar");
  assert.deepEqual(items[3], { key: "ciMinutes", label: "CI minutes", quantity: 9185, unit: "min", cost: 0, gross: 73.53, unitPrice: 0.008, per: "a Linux minute if private" });
  assert.deepEqual(items[4], { key: "aiGenerations", label: "AI generations", quantity: 648, unit: "", cost: 64.8, unitPrice: 0.1, per: "a clip" });
  const off = activityItems(rows, { configured: ["aws"] });
  assert.deepEqual(off[1], { key: "egressGiB", label: "Hosting egress", quantity: null, unit: "GiB", cost: null, unitPrice: null, per: "a GiB" });
  assert.deepEqual(off[3], { key: "ciMinutes", label: "CI minutes", quantity: null, unit: "min", cost: null, gross: null, unitPrice: null, per: "a Linux minute if private" });
  assert.equal(off[0].quantity, 40.3);
  assert.deepEqual(off[5], { key: "modalGpu", label: "Modal GPU", quantity: null, unit: "", cost: null, unitPrice: null, per: "", apps: null });
  assert.deepEqual(off[6], { key: "falGenerations", label: "fal generations", quantity: null, unit: "", cost: null, unitPrice: null, per: "" });
  assert.deepEqual(off[7], { key: "claudeCode", label: "Claude Code", quantity: null, unit: "messages", cost: null, unitPrice: null, per: "", listValue: null });
  const none = activityItems([], { configured: ["aws", "gcp", "github"] });
  assert.deepEqual([none[0].quantity, none[0].cost, none[0].unitPrice], [0, 0, null], "a quantity of 0 is a measurement; the unit price is unknown");
});

/* ---- health ---- */

test("health: no goal; good when every source answered, warning when one failed or a flagged day has no compute or AI line, critical over $100", () => {
  assert.equal(CRITICAL_DAY_USD, 100);
  const quiet = Array.from({ length: 10 }, (_, i) => ({ day: day(i + 1), total: 0.9, flagged: false, top: null }));
  const five = ["aws", "gcp", "github", "modal", "fal"];
  assert.deepEqual(financeHealth({ errors: {}, days: quiet, rows: [], configured: five }), { status: "good", note: "5 sources answered; no day of the last 7 out of line" });
  assert.deepEqual(financeHealth({ errors: {}, days: quiet, rows: [], configured: ["gcp"] }), { status: "good", note: "1 source answered; no day of the last 7 out of line" });
  assert.deepEqual(financeHealth({ errors: { aws: "AccessDenied" }, days: quiet, rows: [], configured: five }), { status: "warning", note: "A source failed: aws" });
  assert.deepEqual(financeHealth({ errors: { aws: "x", modal: "y" }, days: quiet, rows: [], configured: five }).note, "2 sources failed: aws, modal");
  const spiked = [...quiet.slice(0, 9), { day: day(10), total: 4.5, flagged: true, top: { provider: "aws", line: "USE1-PublicIPv4:InUseAddress", amount: 4.2 } }];
  assert.deepEqual(financeHealth({ errors: {}, days: spiked, rows: [], configured: five }), { status: "warning", note: "$4.50 on 2026-10-10, over three times the trailing median, with no compute or AI line to explain it, USE1-PublicIPv4:InUseAddress" });
  const rig = awsRows([{ day: day(10), service: "EC2", line: "BoxUsage:g4dn.xlarge", amount: 4.2 }]);
  assert.equal(financeHealth({ errors: {}, days: spiked, rows: rig, configured: five }).status, "good", "a rig day explains itself");
  const big = [...quiet.slice(0, 9), { day: day(10), total: 126.72, flagged: true, top: null }];
  const veo = gcpRows([{ day: day(10), service: "Vertex AI", sku: "Veo 3 Fast 720p Audio Video Generation", net: 124.4 }]);
  assert.equal(financeHealth({ errors: {}, days: big, rows: veo, configured: five }).status, "good", "a Veo batch explains the day, whatever its size");
  const modal = modalRows({ credits: 30, rows: [{ day: day(10), app: "cinema-spike", cost: 90 }], monthly: [{ month: "2026-10", app: "cinema-spike", cost: 90 }] }, "daily");
  assert.equal(financeHealth({ errors: {}, days: big, rows: modal, configured: five }).status, "good", "a Modal app day too");
  assert.deepEqual(financeHealth({ errors: {}, days: big, rows: [], configured: five }), { status: "critical", note: "$126.72 on 2026-10-10 with no compute or AI line to explain it" });
  assert.equal(financeHealth({ errors: { gcp: "quota" }, days: big, rows: [], configured: five }).status, "critical", "an unexplained day outranks a failed source");
  const old = [{ day: day(1), total: 150, flagged: true, top: null }, ...quiet.slice(1)];
  assert.equal(financeHealth({ errors: {}, days: old, rows: [], configured: five }).status, "good", "only the last seven days count");
});

test("Secrets Manager's API requests land with its secrets, not in other (seen live 2026-10-30)", () => {
  assert.equal(categorize({ provider: "aws", service: "AWS Secrets Manager", line: "USE1-AWSSecretsManagerAPIRequest" }), "dns");
});

/* ---- Modal ---- */

test("Modal rows: every app a compute line named by its app, the amount its share of the month's net of the $30 credits, the gross the usage", () => {
  const report = {
    credits: 30,
    monthly: [{ month: "2026-10", app: "cinema-spike", cost: 60 }, { month: "2026-10", app: "dayhike-record", cost: 20 }, { month: "2026-09", app: "cinema-spike", cost: 25 }],
    rows: [{ day: "2026-10-16", app: "cinema-spike", env: "main", cost: 40 }, { day: "2026-10-17", app: "cinema-spike", env: "main", cost: 20 }, { day: "2026-10-17", app: "dayhike-record", env: "main", cost: 20 }, { day: "2026-09-25", app: "cinema-spike", env: "main", cost: 25 }],
  };
  const monthly = modalRows(report, "monthly");
  assert.deepEqual(monthly[0], { provider: "modal", month: "2026-10", service: "Modal", line: "cinema-spike", where: "cinema-spike", category: "compute", amount: 37.5, quantity: 0, unit: null, gross: 60, repo: null }, "60 of 80 usage, 50 net");
  assert.deepEqual([monthly[1].amount, monthly[1].gross], [12.5, 20]);
  assert.deepEqual([monthly[2].amount, monthly[2].gross], [0, 25], "September stayed under the credits: nothing charged");
  assert.equal(Math.round(monthly.filter((r) => r.month === "2026-10").reduce((n, r) => n + r.amount, 0) * 100) / 100, 50);
  const daily = modalRows(report, "daily");
  assert.deepEqual(daily.map((r) => [r.day, r.line, r.amount, r.gross]), [["2026-10-16", "cinema-spike", 25, 40], ["2026-10-17", "cinema-spike", 12.5, 20], ["2026-10-17", "dayhike-record", 12.5, 20], ["2026-09-25", "cinema-spike", 0, 25]], "a day's share uses the month's totals");
  const own = modalRows({ credits: 30, rows: [{ day: "2026-11-02", app: "x", cost: 50 }], monthly: [] }, "daily");
  assert.equal(own[0].amount, 20, "a month the monthly list lacks nets its own daily rows");
  assert.deepEqual(modalRows(null), []);
  assert.deepEqual(modalRows({ at: "x", error: "modal: token refused" }), []);
  assert.equal(modalRows({ rows: [], monthly: [{ month: "2026-10", app: "a", cost: 45 }] })[0].amount, 15, "credits default to $30");
});

/* ---- fal ---- */

const snap = (date, balance) => ({ date, finance: { at: `${date}T10:00:00Z`, fal: { at: `${date}T10:00:00Z`, balance, currency: "USD", lastDay: date } } });

test("fal series: a fall is the earlier day's spend, a rise a purchase, a skipped day spreads the fall; the latest reading has no day yet", () => {
  const s = falSeries([snap("2026-10-10", 100), snap("2026-10-11", 95.8), snap("2026-10-12", 95.8), snap("2026-10-13", 86), { date: "2026-10-14", finance: { at: "x" } }, snap("2026-10-16", 80), snap("2026-10-17", 180), snap("2026-10-18", 170.5)]);
  assert.deepEqual([s.balance, s.currency, s.lastDay], [170.5, "USD", "2026-10-17"]);
  assert.deepEqual(s.days.map((d) => [d.day, d.spend, d.purchase, d.balance]), [
    ["2026-10-10", 4.2, 0, 100],
    ["2026-10-11", 0, 0, 95.8],
    ["2026-10-12", 9.8, 0, 95.8],
    ["2026-10-13", 2, 0, 86],
    ["2026-10-14", 2, 0, null],
    ["2026-10-15", 2, 0, null],
    ["2026-10-16", 0, 100, 80],
    ["2026-10-17", 9.5, 0, 180],
  ]);
  assert.equal(falSeries([snap("2026-10-10", 100)]).lastDay, null, "one reading: no spend yet");
  assert.equal(falSeries([{ date: "2026-10-10", finance: {} }]), null);
  assert.equal(falSeries([]), null);
  const rows = falRows(s.days, "daily");
  assert.deepEqual(rows.map((r) => [r.day, r.amount]), [["2026-10-10", 4.2], ["2026-10-12", 9.8], ["2026-10-13", 2], ["2026-10-14", 2], ["2026-10-15", 2], ["2026-10-17", 9.5]], "days with spend only");
  assert.deepEqual(rows[0], { provider: "fal", day: "2026-10-10", service: "fal", line: FAL_LINE, where: null, category: "ai", amount: 4.2, quantity: 0, unit: null, gross: null, repo: null });
  assert.deepEqual(falRows(s.days, "monthly").map((r) => [r.month, Math.round(r.amount * 100) / 100]), [["2026-10", 29.5]]);
  assert.deepEqual(falRows(null), []);
});

/* ---- projects ---- */

test("projects: the four in order, and the rule table over every provider", () => {
  assert.deepEqual(PROJECT_KEYS, ["films", "dayhike", "site", "commercial", "other"]);
  assert.deepEqual(PROJECTS.map((p) => p.label), ["Films", "Day Hike", "csarko.sh and admin", "Commercial", "Other"]);
  assert.equal(projectOf({ provider: "gcp", where: "magicpixel-487014" }), "other", "nothing is routed to commercial yet");
  const aws = (line, service = "EC2 - Other") => awsRows([{ month: "2026-10", service, line, amount: 1 }])[0];
  assert.equal(projectOf(aws("Route53-Domains", "Amazon Registrar")), "site");
  assert.equal(projectOf(aws("HostedZone", "Amazon Route 53")), "site");
  assert.equal(projectOf(aws("DNS-Queries", "Amazon Route 53")), "site");
  for (const line of ["BoxUsage:g4dn.xlarge", "EBS:VolumeUsage.gp3", "USW2-EBS:SnapshotUsage", "us-west-2-KMS-Keys", "USE1-AWSSecretsManager-Secrets", "USW2-TimedStorage-ByteHrs", "USE1-PublicIPv4:InUseAddress", "Tax"]) assert.equal(projectOf(aws(line)), "dayhike", line);
  const gcp = (project, service, sku) => gcpRows([{ month: "2026-10", project, service, sku, net: 1 }])[0];
  assert.equal(projectOf(gcp("fps-csarko", "Vertex AI", "Veo 3 Fast 720p Audio Video Generation")), "films");
  assert.equal(projectOf(gcp("fps-csarko", "Compute Engine", "Nvidia L4 GPU running in Americas")), "dayhike");
  assert.equal(projectOf(gcp("fps-csarko", "Cloud Run", "Services CPU (Request-based billing)")), "dayhike");
  assert.equal(projectOf(gcp("csarko-sh", "Firebase Hosting", "Outgoing Bandwidth")), "site");
  assert.equal(projectOf(gcp("csarko-sh", "Cloud Run", "Services CPU")), "site");
  assert.equal(projectOf(gcp("magicpixel-487014", "Networking", "Cloud Load Balancer Forwarding Rule Minimum Global")), "other");
  const gh = (repo) => githubRows([{ month: "2026-10", product: "actions", sku: "Actions Linux", repo, gross: 1, net: 0 }])[0];
  assert.deepEqual([projectOf(gh("game-dayhike")), projectOf(gh("csarko.sh")), projectOf(gh("lib-visits")), projectOf(gh(null))], ["dayhike", "site", "other", "other"]);
  const modal = (app) => modalRows({ credits: 0, monthly: [{ month: "2026-10", app, cost: 1 }] })[0];
  assert.deepEqual([projectOf(modal("cinema-spike")), projectOf(modal("dayhike-record")), projectOf(modal("rig-probe"))], ["films", "dayhike", "other"]);
  assert.equal(projectOf(falRows([{ day: "2026-10-12", spend: 1 }], "monthly")[0]), "films");
  assert.equal(projectOf({ provider: "stripe", line: "x" }), "other");

  const rows = [
    aws("Route53-Domains", "Amazon Registrar"), { ...aws("BoxUsage:g4dn.xlarge"), amount: 21.24 }, { ...aws("HostedZone", "Amazon Route 53"), month: "2026-09" },
    { ...gcp("fps-csarko", "Vertex AI", "Veo"), amount: 64.8 }, { ...gcp("csarko-sh", "Firebase Hosting", "Outgoing Bandwidth"), amount: 18.76 }, { ...gcp("magicpixel-487014", "Networking", "Cloud Load Balancer Forwarding Rule Minimum Global"), amount: 10.96 },
    ...modalRows({ credits: 30, monthly: [{ month: "2026-10", app: "cinema-spike", cost: 60 }, { month: "2026-10", app: "dayhike-record", cost: 20 }] }),
    ...falRows([{ day: "2026-10-12", spend: 53.63 }], "monthly"),
    { ...aws("BoxUsage:g4dn.xlarge"), month: "2026-07", amount: 99 },
  ];
  const t = projectsTable(rows, ["2026-08", "2026-09", "2026-10"]);
  assert.deepEqual(t, {
    months: ["2026-08", "2026-09", "2026-10"],
    projects: [
      { key: "films", label: "Films", byMonth: [0, 0, 155.93] },
      { key: "dayhike", label: "Day Hike", byMonth: [0, 0, 33.74] },
      { key: "site", label: "csarko.sh and admin", byMonth: [0, 1, 19.76] },
      { key: "commercial", label: "Commercial", byMonth: [0, 0, 0] },
      { key: "other", label: "Other", byMonth: [0, 0, 10.96] },
    ],
    partial: ["2026-08", "2026-09"],
  });
});

/* ---- films ---- */

test("films: the labels, the provider rule, a film's shape and the list largest first", () => {
  assert.equal(filmLabel("last-trail"), "The Last Trail");
  assert.equal(filmLabel("ranger-radio"), "Ranger Radio, the earlier cut of The Last Trail");
  assert.equal(filmLabel("rowan-rockslide"), "Pipeline spike: rowan-rockslide");
  assert.equal(filmLabel("rowan-speech"), "Pipeline spike: rowan-speech");
  assert.equal(filmLabel("last-trail-thing17"), "The Last Trail, thing17 takes");
  assert.equal(filmLabel("last-trail-"), "last-trail-");
  assert.equal(filmLabel("hallway"), "hallway");
  assert.equal(providerOf({ model: "veo-3.1-fast-generate-001", note: "vertex, list rate" }), "gcp");
  assert.equal(providerOf({ model: "Veo 3", note: "" }), "gcp");
  assert.equal(providerOf({ model: "Edit", note: "via Vertex fallback" }), "gcp");
  assert.equal(providerOf({ model: "Seedance-2.5" }), "fal");
  assert.equal(providerOf({ model: "nano-banana-2-edit" }), "fal");
  assert.equal(providerOf({ model: "Nano Banana 2" }), "fal");
  assert.equal(providerOf({ model: "elevenlabs-sfx-v2" }), "fal");
  for (const model of ["Edit", "LTX", "A2V", "Wan", "T2I"]) assert.equal(providerOf({ model, gpu: "B200" }), "modal", model);
  assert.equal(DEFAULT_CAP_USD, 150);
  const film = filmOf({ slug: "last-trail", rows: [
    { what: "clips", model: "veo-3.1-fast-generate-001", gpu: "api", seconds: 2046, usd: 30.9, note: "vertex" },
    { what: "clips", model: "veo-3.1-fast-generate-001", gpu: "api", seconds: 2046, usd: 30.9, note: "vertex" },
    { what: "frames", model: "Edit", gpu: "A100-80GB", seconds: 1800, usd: 1.25, note: "" },
    { what: "clips", model: "Seedance-2.5", gpu: "api", seconds: 300, usd: 7.06, note: "" },
    { what: "sfx", model: "elevenlabs-sfx-v2", gpu: "api", seconds: 8, usd: 0.012, note: "" },
    null,
  ] });
  assert.deepEqual(film, {
    key: "last-trail", label: "The Last Trail", total: 70.12, capUsd: 150,
    byProvider: { modal: 1.25, fal: 7.07, gcp: 61.8 },
    byModel: [
      { model: "veo-3.1-fast-generate-001", provider: "gcp", usd: 61.8, calls: 2, seconds: 4092 },
      { model: "Seedance-2.5", provider: "fal", usd: 7.06, calls: 1, seconds: 300 },
      { model: "Edit", provider: "modal", usd: 1.25, calls: 1, seconds: 1800 },
      { model: "elevenlabs-sfx-v2", provider: "fal", usd: 0.01, calls: 1, seconds: 8 },
    ],
  });
  assert.equal(filmOf({ slug: "rowan-speech", rows: [], budgetUsd: 20 }).capUsd, 20);
  assert.equal(filmOf({ slug: "x", rows: [], budgetUsd: 0 }).capUsd, 150);
  const all = filmsOf([
    { slug: "rowan-speech", rows: [{ model: "LTX", usd: 0.42 }], budgetUsd: null, updated: "2026-10-17T20:36:24Z" },
    { slug: "last-trail", rows: [{ model: "Edit", usd: 18.49 }], budgetUsd: null, updated: "2026-10-28T20:32:39Z" },
    { slug: "empty", rows: [], budgetUsd: null, updated: null },
  ]);
  assert.equal(all.asOf, "2026-10-28T20:32:39Z", "the newest file's time");
  assert.deepEqual(all.films.map((f) => [f.key, f.total]), [["last-trail", 18.49], ["rowan-speech", 0.42], ["empty", 0]]);
  assert.deepEqual(filmsOf([]), { asOf: null, films: [] });
});

/* ---- Claude Code ---- */

test("the subscription series: sorted, bad entries dropped; a month takes the latest entry at or before its end", () => {
  assert.equal(CLAUDE_SUBSCRIPTION_KEY, "claude-subscription");
  const series = subscriptionSeries([{ at: "2026-10-27T03:20:00Z", value: 200 }, { at: "2026-09-05T12:00:00Z", value: 100 }, { at: "2026-09-06T00:00:00Z", value: "x" }, null, { at: "2026-09-07T00:00:00Z", value: -1 }]);
  assert.deepEqual(series, [{ at: "2026-09-05T12:00:00Z", value: 100 }, { at: "2026-10-27T03:20:00Z", value: 200 }]);
  assert.equal(subscriptionFor(series, "2026-08"), null, "before the first entry");
  assert.deepEqual(subscriptionFor(series, "2026-09"), { at: "2026-09-05T12:00:00Z", value: 100 }, "entered on the 5th, it applies to the whole month");
  assert.deepEqual(subscriptionFor(series, "2026-10"), { at: "2026-10-27T03:20:00Z", value: 200 }, "the plan change applies from its month");
  assert.deepEqual(subscriptionFor(series, "2027-03"), { at: "2026-10-27T03:20:00Z", value: 200 }, "and on");
  assert.deepEqual(subscriptionSeries(null), []);
  assert.equal(subscriptionFor([], "2026-10"), null);
});

test("the fee as rows: one a month for 13 months from the first entry, category claudeCode and project other; a day is fee / daysInMonth and a month's days sum to the fee", () => {
  const series = subscriptionSeries([{ at: "2026-09-05T12:00:00Z", value: 100 }, { at: "2026-10-27T03:20:00Z", value: 200 }]);
  const monthly = claudeRows(series, "monthly", { today: "2026-10-28" });
  assert.deepEqual(monthly.map((r) => [r.month, r.amount]), [["2026-09", 100], ["2026-10", 200]], "August has no entry, so no line");
  assert.deepEqual(monthly[1], { provider: "claude", month: "2026-10", service: "Claude Code", line: CLAUDE_LINE, where: "subscription", category: "claudeCode", amount: 200, quantity: 0, unit: null, gross: null, repo: null });
  assert.equal(projectOf(monthly[1]), "other");
  assert.equal(kindOf(monthly[1].category), "fixed", "idle logic ignores it");
  const daily = claudeRows(series, "daily", { today: "2026-10-28" });
  assert.deepEqual([daily[0].day, daily.at(-1).day], ["2026-09-01", "2026-10-28"], "from the first of the previous month (earlier than 60 days back here) through today");
  assert.ok(daily.every((r) => r.category === "claudeCode" && r.where === "subscription"));
  const sep = daily.filter((r) => r.day.startsWith("2026-09"));
  assert.equal(sep.length, 30);
  assert.ok(Math.abs(sep[0].amount - 100 / 30) < 1e-9);
  assert.equal(cents(sep.reduce((n, r) => n + r.amount, 0)), 100, "September's days sum to September's fee");
  const oct = daily.filter((r) => r.day.startsWith("2026-10"));
  assert.equal(oct.length, 28);
  assert.ok(Math.abs(oct[0].amount - 200 / 31) < 1e-9, "spread over the 31 days of the month, not the 28 so far");
  assert.equal(cents(oct.reduce((n, r) => n + r.amount, 0)), cents((200 / 31) * 28));
  const late = claudeRows(subscriptionSeries([{ at: "2026-10-27T03:20:00Z", value: 200 }]), "daily", { today: "2026-10-28" });
  assert.deepEqual([late[0].day, late.length], ["2026-10-01", 28], "entered on the 27th, the month's earlier days are paid for too");
  assert.deepEqual(claudeRows([], "daily", { today: "2026-10-28" }), []);
  assert.deepEqual(claudeRows(undefined, "monthly", { today: "2026-10-28" }), []);
  const thirteen = claudeRows(subscriptionSeries([{ at: "2024-01-01T00:00:00Z", value: 20 }]), "monthly", { today: "2026-10-28" });
  assert.equal(thirteen.length, 13);
  assert.deepEqual([thirteen[0].month, thirteen.at(-1).month], ["2025-10", "2026-10"]);
  const table = categoriesTable(monthly, ["2026-08", "2026-09", "2026-10"]);
  assert.deepEqual(table.categories.find((c) => c.key === "claudeCode").byMonth, [0, 100, 200]);
  assert.deepEqual(table.other, [], "it is its own category, not an unmapped line");
  assert.equal(monthTotals(monthly, "2026-10").claude, 200);
  const series60 = dailySeries(daily, { today: "2026-10-28", configured: ["claude"] });
  assert.deepEqual([series60.asOf, series60.days.at(-1).claude, series60.days.at(-1).total], ["2026-10-28", 6.45, 6.45]);
  assert.equal(idleLines(daily, { today: "2026-10-28" }).lines.length, 0, "a fixed line is never idle");
});

test("the usage part: checked, summed by model over months (largest first) and laid out by day with 0s where none", () => {
  assert.equal(claudeUsage(null), null);
  assert.equal(claudeUsage({ at: "x", rows: [] }), null, "no monthly rows is no part");
  const part = {
    at: "2026-10-28T03:16:05Z", lastDay: "2026-10-28", files: 3, pricing: "list",
    rows: [
      { day: "2026-10-27", model: "claude-fable-5-1", input: 10, cacheWrite: 20, cacheRead: 30, output: 40, messages: 5, usd: 1.5 },
      { day: "2026-10-27", model: "claude-opus-5-5", input: 1, cacheWrite: 2, cacheRead: 3, output: 4, messages: 2, usd: 0.25 },
      { day: "2026-10-28", model: "claude-fable-5-1", input: 10, cacheWrite: 20, cacheRead: 30, output: 40, messages: 3, usd: 2 },
      { day: "2026-08-31", model: "claude-fable-5-1", input: 1, cacheWrite: 1, cacheRead: 1, output: 1, messages: 1, usd: 9 },
    ],
    monthly: [
      { month: "2026-09", model: "claude-fable-5-1", input: 100, cacheWrite: 200, cacheRead: 300, output: 400, messages: 50, usd: 12 },
      { month: "2026-10", model: "claude-fable-5-1", input: 20, cacheWrite: 40, cacheRead: 60, output: 80, messages: 8, usd: 3.5 },
      { month: "2026-10", model: "claude-opus-5-5", input: 1, cacheWrite: 2, cacheRead: 3, output: 4, messages: 2, usd: 0.25 },
    ],
  };
  const usage = claudeUsage(part);
  assert.deepEqual([usage.at, usage.lastDay, usage.files, usage.pricing, usage.rows.length, usage.monthly.length], ["2026-10-28T03:16:05Z", "2026-10-28", 3, "list", 4, 3]);
  const oct = usageForMonths(usage, ["2026-10"]);
  assert.deepEqual(oct, { listValue: 3.75, messages: 10, byModel: [
    { model: "claude-fable-5-1", input: 20, cacheWrite: 40, cacheRead: 60, output: 80, messages: 8, usd: 3.5 },
    { model: "claude-opus-5-5", input: 1, cacheWrite: 2, cacheRead: 3, output: 4, messages: 2, usd: 0.25 },
  ] });
  const ninety = usageForMonths(usage, ["2026-08", "2026-09", "2026-10"]);
  assert.deepEqual([ninety.listValue, ninety.messages], [15.75, 60]);
  assert.deepEqual(ninety.byModel[0], { model: "claude-fable-5-1", input: 120, cacheWrite: 240, cacheRead: 360, output: 480, messages: 58, usd: 15.5 }, "summed over the range");
  assert.deepEqual(usageForMonths(usage, ["2026-07"]), { listValue: 0, messages: 0, byModel: [] });
  const days = usageDays(usage, { today: "2026-10-28" });
  assert.equal(days.length, 60);
  assert.deepEqual([days[0].day, days.at(-1).day], ["2026-08-30", "2026-10-28"], "ending on the part's last day; the 31 August row is outside");
  assert.deepEqual(days.at(-2), { day: "2026-10-27", usd: 1.75, messages: 7, byModel: { "claude-fable-5-1": 1.5, "claude-opus-5-5": 0.25 } });
  assert.deepEqual(days.at(-1), { day: "2026-10-28", usd: 2, messages: 3, byModel: { "claude-fable-5-1": 2 } });
  assert.deepEqual(days[10], { day: "2026-09-09", usd: 0, messages: 0, byModel: {} }, "a day with no use is present at 0");
  assert.equal(usageDays({ ...usage, lastDay: null }, { today: "2026-10-30" }).at(-1).day, "2026-10-30", "no last day: today");
});

/* ---- income (the donations through Stripe) ---- */

const STRIPE = JSON.parse(readFileSync(new URL("./fixtures/finance-stripe.json", import.meta.url), "utf8"));

test("donationsOf: charges and payments are donations in dollars on their UTC day, a refund subtracts (gross and net negative, fee as given), a payout is not income, newest first, no identity", () => {
  const rows = donationsOf(STRIPE.transactions);
  assert.equal(rows.length, 7, "eight transactions less the payout");
  assert.deepEqual(rows[0], { day: "2026-10-28", created: 1793212930, gross: 25, fees: 1.03, net: 23.97, currency: "usd", refund: false, door: "arkos" });
  assert.deepEqual(rows.map((r) => r.day), ["2026-10-28", "2026-10-25", "2026-10-20", "2026-10-13", "2026-10-07", "2026-10-06", "2026-09-29"]);
  const refund = rows.find((r) => r.refund);
  assert.deepEqual(refund, { day: "2026-10-07", created: 1791370800, gross: -15, fees: 0, net: -15, currency: "usd", refund: true, door: null });
  assert.deepEqual(Object.keys(rows[0]).sort(), ["created", "currency", "day", "door", "fees", "gross", "net", "refund"], "no description, source or customer: the door is the one thing taken from the charge");
  assert.deepEqual(donationsOf([{ type: "payment_refund", amount: 500, fee: 0, net: 500, created: 1791370800, currency: "usd" }])[0].gross, -5, "a refund is negative whichever sign Stripe gives it");
  assert.deepEqual(donationsOf([{ type: "stripe_fee", amount: -200, fee: 0, net: -200, created: 1791370800 }, { type: "adjustment", amount: 100, created: 1791370800 }, null, { type: "charge" }]), [], "nothing else counts, and a transaction without a time is skipped");
  assert.deepEqual(donationsOf([]), []);
  assert.deepEqual(donationsOf(undefined), []);
  assert.equal(donationsOf([{ type: "charge", amount: 333, fee: 40, net: 293, created: 1791370800 }])[0].fees, 0.4, "cents, not floating noise");
  assert.equal(donationsOf([{ type: "charge", amount: 1, fee: 1, net: 0, created: 1791370800 }])[0].net, 0);
});

test("incomeFor: the month's totals and average; a refund moves the amounts and not the count; empty is zeros with a null average", () => {
  const rows = donationsOf(STRIPE.transactions);
  assert.deepEqual(incomeFor(rows, ["2026-10"]), { gross: 60, fees: 3.69, net: 56.31, count: 5, average: 12 }, "$75 given, $15 refunded; five gave");
  assert.deepEqual(incomeFor(rows, ["2026-09"]), { gross: 10, fees: 0.59, net: 9.41, count: 1, average: 10 });
  assert.deepEqual(incomeFor(rows, ["2026-08", "2026-09", "2026-10"]), { gross: 70, fees: 4.28, net: 65.72, count: 6, average: 11.67 });
  assert.deepEqual(incomeFor(rows, ["2026-08"]), { gross: 0, fees: 0, net: 0, count: 0, average: null });
  assert.deepEqual(incomeFor([], ["2026-10"]), { gross: 0, fees: 0, net: 0, count: 0, average: null });
});

test("incomeDays: 60 days ending today, every day present with zeros; incomeMonths: thirteen ending this month", () => {
  const rows = donationsOf(STRIPE.transactions);
  const days = incomeDays(rows, { today: "2026-10-28" });
  assert.equal(days.length, 60);
  assert.deepEqual([days[0].day, days.at(-1).day], ["2026-08-30", "2026-10-28"]);
  assert.deepEqual(days[0], { day: "2026-08-30", gross: 0, fees: 0, net: 0, count: 0 });
  assert.deepEqual(days.at(-1), { day: "2026-10-28", gross: 25, fees: 1.03, net: 23.97, count: 1 });
  assert.deepEqual(days.find((d) => d.day === "2026-10-07"), { day: "2026-10-07", gross: -15, fees: 0, net: -15, count: 0 }, "the refund's day is negative");
  assert.equal(days.reduce((n, d) => n + d.count, 0), 6, "every donation since Aug 30 is on its day");
  assert.deepEqual(incomeDays([], { today: "2026-10-28", count: 3 }), [{ day: "2026-10-26", gross: 0, fees: 0, net: 0, count: 0 }, { day: "2026-10-27", gross: 0, fees: 0, net: 0, count: 0 }, { day: "2026-10-28", gross: 0, fees: 0, net: 0, count: 0 }]);
  const months = incomeMonths(rows, { today: "2026-10-28" });
  assert.equal(months.length, 13);
  assert.deepEqual([months[0].month, months.at(-1).month], ["2025-10", "2026-10"]);
  assert.deepEqual(months.at(-1), { month: "2026-10", gross: 60, fees: 3.69, net: 56.31, count: 5 });
  assert.deepEqual(months.at(-2), { month: "2026-09", gross: 10, fees: 0.59, net: 9.41, count: 1 });
  assert.ok(months.slice(0, 11).every((m) => m.gross === 0 && m.count === 0));
});

test("recentOf: the newest donations, refunds left out, with day, gross, net and currency and no other field ever", () => {
  const rows = donationsOf(STRIPE.transactions);
  const recent = recentOf(rows, 20);
  assert.equal(recent.length, 6);
  assert.deepEqual(recent[0], { day: "2026-10-28", gross: 25, net: 23.97, currency: "usd" });
  assert.ok(recent.every((r) => Object.keys(r).sort().join() === "currency,day,gross,net"));
  assert.ok(recent.every((r) => r.gross > 0));
  assert.deepEqual(recentOf(rows, 2).map((r) => r.day), ["2026-10-28", "2026-10-25"]);
  assert.deepEqual(recentOf([], 20), []);
  assert.ok(!JSON.stringify(recent).match(/Donation|ch_|txn_|py_|reader/), "nothing of Stripe's descriptions or ids");
});

test("payoutsOf and balanceOf: arrival days in dollars with Stripe's status, newest first; the balance for one currency", () => {
  assert.deepEqual(payoutsOf(STRIPE.payouts), [{ day: "2026-10-31", amount: 37.93, status: "pending" }, { day: "2026-10-18", amount: 18.38, status: "paid" }]);
  assert.deepEqual(payoutsOf([STRIPE.payouts[1], STRIPE.payouts[0]])[0].status, "pending", "sorted by arrival");
  assert.deepEqual(payoutsOf([]), []);
  assert.deepEqual(payoutsOf([{ amount: 1 }, null]), [], "no arrival date, no payout");
  assert.deepEqual(balanceOf(STRIPE.balance), { available: 0, pending: 37.93, currency: "usd" });
  assert.deepEqual(balanceOf({ available: [{ amount: 1050, currency: "usd" }, { amount: 900, currency: "eur" }], pending: [] }), { available: 10.5, pending: 0, currency: "usd" });
  assert.deepEqual(balanceOf({ available: [{ amount: 900, currency: "eur" }], pending: [] }, "eur"), { available: 9, pending: 0, currency: "eur" });
  assert.deepEqual(balanceOf(null), { available: 0, pending: 0, currency: "usd" });
  assert.equal(lastDonationDay(donationsOf(STRIPE.transactions)), "2026-10-28");
  assert.equal(lastDonationDay(donationsOf([STRIPE.transactions[5]])), null, "a refund alone names no donation day");
  assert.equal(lastDonationDay([]), null);
});

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
