import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createFinanceQueries, isFinanceQueryName, FINANCE_QUERY_NAMES, parseRange } from "../src/finance-queries.mjs";
import { createQueries } from "../src/queries.mjs";
import { createMemoryStore } from "../src/store.mjs";
import { shapeUsage } from "../src/collectors/github-billing.mjs";
import { CATEGORY_KEYS } from "../src/finance/categories.mjs";

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));
const AWS = fixture("finance-aws");
const GCP = fixture("finance-gcp");
const GITHUB = shapeUsage(fixture("finance-github-usage").usageItems);
// The 28th, late: the day's snapshot (10:00Z) holds Cost Explorer rows through the 27th and the forecast made that morning.
const NOW = Date.parse("2026-10-28T23:10:00Z");
const SNAPSHOT_AT = "2026-10-28T10:00:00Z";
const log = { error() {}, warn() {}, log() {} };

/** Fake collectors: configured ones answer from the fixtures; Cost Explorer and GitHub count their calls. */
function fakes({ awsOn = true, gcpOn = true, githubOn = true, gcpFail = false, forecastFail = false, awsFail = false } = {}) {
  const calls = [];
  return {
    calls,
    awsCost: {
      configured: awsOn,
      async monthlyByUsage() { calls.push("aws:monthly"); if (awsFail) throw new Error("Cost Explorer GetCostAndUsageCommand failed: throttled"); return { rows: AWS.monthly, calls: 1 }; },
      async dailyByUsage() { calls.push("aws:daily"); return { rows: AWS.daily, calls: 2 }; },
      async forecast() { calls.push("aws:forecast"); if (forecastFail) throw new Error("Cost Explorer GetCostForecastCommand failed: DataUnavailableException"); return { forecast: AWS.forecast, calls: 1 }; },
    },
    gcpBilling: {
      configured: gcpOn,
      async daily() { calls.push("gcp:daily"); if (gcpFail) throw new Error("BigQuery finance-daily failed: quota"); return GCP.daily; },
      async monthly() { calls.push("gcp:monthly"); return GCP.monthly; },
      async lastDay() { calls.push("gcp:lastDay"); return GCP.lastDay; },
      async firstDay() { calls.push("gcp:firstDay"); return GCP.firstDay ?? "2026-10-02"; },
    },
    githubBilling: { configured: githubOn, async usage() { calls.push("github:usage"); return GITHUB; } },
    store: createMemoryStore(),
  };
}

/** A store holding the 28th's snapshot with the fixtures as its finance part, as the job would have written it. */
async function seeded(deps, { date = "2026-10-28", kpi = { monthToDate: 120.5, idleRunRate: 24.1, last30: 131.2, forecast: 150.3 } } = {}) {
  await deps.store.writeSnapshot(date, { at: SNAPSHOT_AT, visits7: 10, finance: { at: SNAPSHOT_AT, aws: AWS, github: GITHUB, awsCalls: 3, kpi } });
  return deps;
}

const make = (deps) => createFinanceQueries({ ...deps, now: () => NOW, log, goalUsd: 5 });

test("the six query names and the range parser the routes use", () => {
  assert.deepEqual(FINANCE_QUERY_NAMES, ["summary", "categories", "idle", "daily", "activity", "sources"]);
  assert.ok(isFinanceQueryName("idle"));
  assert.ok(!isFinanceQueryName("visits"));
  assert.equal(parseRange("13m"), "13m");
});

test("summary: the month, every provider, the totals, the forecast as AWS's plus GCP's run-rate plus GitHub's net", async () => {
  const deps = await seeded(fakes());
  const s = await make(deps).summary("month");
  assert.equal(s.at, "2026-10-28T23:10:00.000Z");
  assert.deepEqual([s.month, s.goalUsd], ["2026-10", 5]);
  assert.deepEqual(s.providers.map((p) => [p.provider, p.label]), [["aws", "AWS"], ["gcp", "Google Cloud"], ["github", "GitHub"]]);
  const [aws, gcp, github] = s.providers;
  assert.deepEqual(aws, { provider: "aws", label: "AWS", mtd: 30.96, forecast: 32.38, lastMonth: 94.34, lastDay: "2026-10-27" });
  assert.equal(aws.forecast, Math.round((30.96 + AWS.forecast.remaining) * 100) / 100, "month to date plus Cost Explorer's remaining");
  assert.deepEqual([gcp.mtd, gcp.lastMonth, gcp.lastDay], [104.05, 23.04, "2026-10-27"]);
  assert.ok(Math.abs(gcp.forecast - (104.05 / 27) * 31) < 0.02, "GCP: run-rate over the 27 days it has billed");
  assert.deepEqual(github, { provider: "github", label: "GitHub", mtd: 0, forecast: 0, lastMonth: 0, lastDay: "2026-10-27", gross: 73.67 });
  assert.deepEqual([s.total.mtd, s.total.lastMonth, s.total.idleRunRate], [135.02, 117.38, 10.62]);
  assert.ok(Math.abs(s.total.forecast - (aws.forecast + gcp.forecast + github.forecast)) <= 0.011, "the total is rounded once");
  assert.equal(s.notConfigured, undefined);
  assert.equal(s.errors, undefined);
  assert.deepEqual(deps.calls, ["gcp:daily", "gcp:monthly", "gcp:lastDay"], "GCP live; AWS and GitHub from the snapshot, Cost Explorer never called on a request");
});

test("summary with range=last names the previous month and no forecast; 90 and 13m keep the current month", async () => {
  const q = make(await seeded(fakes()));
  const last = await q.summary("last");
  assert.equal(last.month, "2026-09");
  assert.deepEqual([last.total.mtd, last.total.forecast, last.total.lastMonth], [117.38, null, 34.58]);
  assert.ok(last.providers.every((p) => p.forecast === null));
  assert.equal(last.providers[0].mtd, 94.34, "September: the domain renewal and two rig days");
  assert.equal(last.providers[2].gross, 13.26);
  assert.equal((await q.summary("90")).month, "2026-10");
  assert.equal((await q.summary("13m")).total.forecast, (await q.summary("month")).total.forecast);
});

test("categories: 13 months aligned, every category, the partial months and the unmapped line", async () => {
  const q = make(await seeded(fakes()));
  const c = await q.categories("13m");
  assert.equal(c.months.length, 13);
  assert.deepEqual([c.months[0], c.months.at(-1)], ["2025-10", "2026-10"]);
  assert.deepEqual(c.categories.map((x) => x.key), CATEGORY_KEYS);
  assert.ok(c.categories.every((x) => x.byMonth.length === 13 && x.byMonth.every((v) => typeof v === "number")));
  const by = (key) => c.categories.find((x) => x.key === key).byMonth;
  assert.deepEqual(by("compute").slice(-3), [0, 7.7, 26.44]);
  assert.deepEqual(by("ai").slice(-1), [64.8]);
  assert.deepEqual(by("domains").slice(-2), [76, 0]);
  assert.deepEqual(by("loadBalancing").slice(-1), [10.96], "eighteen days of the forwarding rule");
  assert.deepEqual(c.partial, c.months.slice(0, 12), "every month before the export's first");
  assert.deepEqual(c.other.map((o) => o.line), ["Log Storage cost"]);
  const month = await q.categories("month");
  assert.deepEqual(month.months, ["2026-10"]);
  assert.deepEqual(month.partial, []);
  assert.deepEqual(month.other, [{ provider: "gcp", line: "Log Storage cost", amount: 0.54 }]);
  const sum = month.categories.reduce((n, x) => n + x.byMonth[0], 0);
  assert.ok(Math.abs(sum - 135.02) < 0.05, "the categories add up to the month");
});

test("idle: the lines sorted by perMonth, the stopped forwarding rule at zero with its last day, the run-rate", async () => {
  const q = make(await seeded(fakes()));
  const r = await q.idle();
  assert.deepEqual([r.runRate, r.goalUsd, r.asOf], [10.62, 5, "2026-10-27"]);
  assert.deepEqual(r.lines[0], { provider: "aws", line: "EBS:VolumeUsage.gp3", category: "storage", where: "us-east-1", perDay: 0.1707, perMonth: 5.12, stoppedOn: null });
  const rule = r.lines.at(-1);
  assert.deepEqual(rule, { provider: "gcp", line: "Cloud Load Balancer Forwarding Rule Minimum Global", category: "loadBalancing", where: "magicpixel-487014", perDay: 0, perMonth: 0, stoppedOn: "2026-10-18" });
  assert.ok(r.lines.every((l) => ["storage", "dns", "loadBalancing"].includes(l.category)), "idle categories only");
  assert.ok(r.lines.some((l) => l.line === "USE1-EBS:SnapshotUsage" && l.perMonth === 0.29), "the rig image");
  for (let i = 1; i < r.lines.length; i += 1) assert.ok(r.lines[i - 1].perMonth >= r.lines[i].perMonth);
  assert.equal(Math.round(r.lines.reduce((n, l) => n + l.perMonth, 0) * 100) / 100, r.runRate);
});

test("daily: 60 days ending on the latest billed day, the median, the flags and the top line", async () => {
  const q = make(await seeded(fakes()));
  const { days } = await q.daily();
  assert.equal(days.length, 60);
  assert.deepEqual([days[0].day, days.at(-1).day], ["2026-08-29", "2026-10-27"]);
  assert.deepEqual(Object.keys(days[0]), ["day", "aws", "gcp", "github", "total", "median14", "flagged", "top"]);
  assert.equal(days[0].median14, null, "no day before the first");
  const renewal = days.find((d) => d.day === "2026-09-16");
  assert.deepEqual([renewal.flagged, renewal.top], [true, { provider: "aws", line: "Route53-Domains", amount: 76 }]);
  const veo = days.find((d) => d.day === "2026-10-24");
  assert.deepEqual([veo.flagged, veo.top.line, veo.top.amount], [true, "Veo 3 Fast 720p Audio Video Generation", 14.2]);
  assert.ok(Math.abs(veo.total - (veo.aws + veo.gcp + veo.github)) <= 0.011, "the total is the day's, rounded once; the rounded parts may differ by a cent");
  const quiet = days.find((d) => d.day === "2026-10-10");
  assert.deepEqual([quiet.flagged, quiet.github], [false, 0]);
});

test("activity: the five items for the month and for 90 days", async () => {
  const q = make(await seeded(fakes()));
  const { items } = await q.activity("month");
  assert.deepEqual(items.map((i) => [i.key, i.quantity, i.cost, i.unitPrice]), [
    ["rigHours", 40.3, 21.2, 0.526],
    ["egressGiB", 134.96, 18.76, 0.139],
    ["cloudRunCpuHours", 118.13, 3.43, 0.029],
    ["ciMinutes", 9185, 0, 0.008],
    ["aiGenerations", 648, 64.8, 0.1],
  ]);
  assert.equal(items[3].gross, 73.67);
  const ninety = await q.activity("90");
  assert.equal(ninety.items[0].quantity, 54.94, "September's two rig days join");
  assert.equal(ninety.items[3].quantity, 10825);
});

test("sources: configured, last day, the snapshot time and this month's Cost Explorer calls summed over its snapshots", async () => {
  const deps = await seeded(fakes());
  await deps.store.writeSnapshot("2026-10-27", { at: "2026-10-27T10:00:00Z", finance: { at: "2026-10-27T10:00:00Z", aws: { ...AWS, calls: 3 }, github: GITHUB, awsCalls: 3, kpi: {} } });
  await deps.store.writeSnapshot("2026-09-30", { at: "2026-09-30T10:00:00Z", finance: { at: "2026-09-30T10:00:00Z", aws: AWS, github: GITHUB, awsCalls: 2, kpi: {} } });
  const { sources, notConfigured, errors } = await make(deps).sources();
  assert.equal(notConfigured, undefined);
  assert.equal(errors, undefined);
  assert.deepEqual(sources.map((s) => s.key), ["aws", "gcp", "github"]);
  assert.deepEqual(sources[0], { key: "aws", label: "AWS Cost Explorer", configured: true, lastDay: "2026-10-27", snapshotAt: SNAPSHOT_AT, callsThisMonth: 6, callCostUsd: 0.06, note: "Two calls a day from the snapshot job, $0.01 each; a third for the forecast until the 28th." });
  assert.deepEqual(sources[1], { key: "gcp", label: "Google Cloud billing export", configured: true, lastDay: "2026-10-27", snapshotAt: null, callsThisMonth: null, callCostUsd: null, note: "BigQuery, read live; rows from 2026-10-02 on." });
  assert.deepEqual(sources[2], { key: "github", label: "GitHub usage", configured: true, lastDay: "2026-10-27", snapshotAt: SNAPSHOT_AT, callsThisMonth: null, callCostUsd: null, note: "From the snapshot; public repositories bill $0." });
});

test("kpis: four KPIs in dollars, previous periods, twelve-week trends from the snapshots' kpi values, health", async () => {
  const deps = await seeded(fakes());
  await deps.store.writeSnapshot("2026-10-20", { finance: { kpi: { monthToDate: 60, idleRunRate: 26.3, last30: 90, forecast: 70 } } });
  await deps.store.writeSnapshot("2026-10-21", { finance: { kpi: { monthToDate: 62, idleRunRate: 26.2, last30: 91, forecast: 71 } } });
  await deps.store.writeSnapshot("2026-08-10", { finance: { kpi: { monthToDate: 5, idleRunRate: 25, last30: 24, forecast: 25 } } });
  const k = await make(deps).kpis();
  assert.deepEqual([k.app, k.at], ["finance", "2026-10-28T23:10:00.000Z"]);
  assert.deepEqual(k.kpis.map((x) => [x.key, x.label, x.unit]), [
    ["monthToDate", "Month to date", "USD"], ["idleRunRate", "Idle run-rate, goal $5", "USD"], ["last30", "Last 30 days", "USD"], ["forecast", "Forecast", "USD"],
  ]);
  const [mtd, idle, last30, forecast] = k.kpis;
  assert.equal(mtd.value, 135.02);
  assert.equal(mtd.prev, 115.16, "September through the 28th");
  assert.deepEqual([idle.value, idle.prev, idle.good], [10.62, 23.67, "down"]);
  assert.deepEqual([last30.value, last30.prev], [138.31, 117.33]);
  assert.equal(forecast.value, (await make(deps).summary("month")).total.forecast);
  assert.equal(forecast.prev, 117.38, "last month's total");
  assert.ok(k.kpis.every((x) => x.trend.length === 12));
  assert.deepEqual(mtd.trend.slice(-2), [62, 120.5], "the latest snapshot of each week; 2026-10-21 for the week before this one");
  assert.equal(idle.trend[0], 25, "2026-08-10 falls in the first of the twelve weeks");
  assert.equal(mtd.trend[5], 0, "a week with no snapshot is 0");
  assert.deepEqual(k.health, { status: "warning", note: "Idle run-rate $10.62 a month, over the $5 goal" });
  assert.equal(k.notConfigured, undefined);
});

test("snapshotPart: the two Cost Explorer calls and the forecast, GitHub's usage, the day's KPI values, merged into the day's document", async () => {
  const deps = fakes();
  const finance = make(deps);
  const part = await finance.snapshotPart();
  assert.deepEqual(Object.keys(part), ["finance"]);
  const f = part.finance;
  assert.equal(f.at, "2026-10-28T23:10:00.000Z");
  assert.deepEqual(deps.calls.sort(), ["aws:daily", "aws:forecast", "aws:monthly", "gcp:daily", "gcp:lastDay", "gcp:monthly", "github:usage"]);
  assert.deepEqual([f.aws.monthly.length, f.aws.daily.length, f.aws.forecast, f.aws.calls, f.aws.lastDay, f.awsCalls], [AWS.monthly.length, AWS.daily.length, AWS.forecast, 4, "2026-10-27", 4]);
  assert.deepEqual([f.github.months.length, f.github.days.length, f.github.lastDay], [GITHUB.months.length, GITHUB.days.length, "2026-10-27"]);
  assert.deepEqual(f.kpi, { monthToDate: 135.02, idleRunRate: 10.62, last30: 138.31, forecast: 151.85 });
  assert.equal(f.notConfigured, undefined);
  assert.equal(f.errors, undefined);

  // Through the csarko.sh snapshot: the part lands in the day's document beside the rest, and a failing step is errors.finance.
  const quiet = { configured: false };
  const base = {
    visits: quiet, gsc: quiet, youtube: quiet, github: { enabled: false, configured: false }, hn: { async mentions() { return { mentions: 0, items: [] }; } },
    psi: quiet, uptime: { async check() { return { up: true, status: 200, ttfbMs: 100, certDaysLeft: 60 }; } }, hosting: { async lastDeployAt() { return null; } },
    sitemap: { async urls() { return []; } }, store: deps.store, config: { sitemapUrl: "https://csarko.sh/sitemap.xml" }, now: () => NOW, log,
  };
  const doc = await createQueries({ ...base, finance }).snapshot();
  assert.equal(doc.date, "2026-10-28");
  assert.equal(doc.up, true);
  assert.deepEqual(doc.finance.kpi, f.kpi);
  assert.equal(doc.errors?.finance, undefined);
  const broken = await createQueries({ ...base, finance: { async snapshotPart() { throw new Error("sts: not authorized"); } } }).snapshot();
  assert.equal(broken.up, true, "the rest of the day is still written");
  assert.equal(broken.errors.finance, "sts: not authorized");
  assert.equal((await createQueries(base).snapshot()).finance?.at, f.at, "without a finance step the merged document keeps the earlier part");
});

test("snapshotPart: a failed forecast keeps the rows and says so; a failed usage call nulls AWS with its error; GitHub failing is its own part", async () => {
  const soft = await make(fakes({ forecastFail: true })).snapshotPart();
  assert.equal(soft.finance.aws.forecast, null);
  assert.equal(soft.finance.aws.calls, 4, "the failed call still cost a cent");
  assert.match(soft.finance.errors.awsForecast, /DataUnavailableException/);
  assert.equal(soft.finance.kpi.monthToDate, 135.02);
  const hard = await make(fakes({ awsFail: true })).snapshotPart();
  assert.equal(hard.finance.aws, null);
  assert.match(hard.finance.errors.aws, /throttled/);
  assert.equal(hard.finance.awsCalls, 4);
  assert.equal(hard.finance.kpi.monthToDate, 104.05, "GCP and GitHub still give a value");
  const off = await make(fakes({ awsOn: false, githubOn: false, gcpOn: false })).snapshotPart();
  assert.deepEqual(off.finance, { at: "2026-10-28T23:10:00.000Z", aws: null, github: null, awsCalls: 0, kpi: { monthToDate: null, idleRunRate: null, last30: null, forecast: null }, notConfigured: { aws: "AWS_COST_ROLE_ARN", github: "GITHUB_TOKEN", gcp: "BILLING_DATASET" } });
});

test("not configured: every part null with its hint, the shapes kept, nothing fetched", async () => {
  const deps = fakes({ awsOn: false, gcpOn: false, githubOn: false });
  const q = make(deps);
  const hint = { aws: "AWS_COST_ROLE_ARN", gcp: "BILLING_DATASET", github: "GITHUB_TOKEN" };
  const s = await q.summary("month");
  assert.deepEqual(s.total, { mtd: null, forecast: null, lastMonth: null, idleRunRate: null });
  assert.deepEqual(s.providers[0], { provider: "aws", label: "AWS", mtd: null, forecast: null, lastMonth: null, lastDay: null });
  assert.deepEqual(s.providers[2].gross, null);
  assert.deepEqual(s.notConfigured, hint);
  const c = await q.categories("90");
  assert.equal(c.categories.length, 11);
  assert.ok(c.categories.every((x) => x.byMonth.every((v) => v === 0)));
  assert.deepEqual(c.notConfigured, hint);
  assert.deepEqual(await q.idle(), { runRate: null, goalUsd: 5, asOf: "2026-10-28", lines: null, notConfigured: hint });
  assert.deepEqual(await q.daily(), { days: null, notConfigured: hint });
  const a = await q.activity("month");
  assert.ok(a.items.every((i) => i.quantity === null && i.cost === null && i.unitPrice === null));
  assert.deepEqual(a.notConfigured, hint);
  const src = await q.sources();
  assert.deepEqual(src.sources.map((x) => [x.configured, x.lastDay, x.callsThisMonth]), [[false, null, null], [false, null, null], [false, null, null]]);
  const k = await q.kpis();
  assert.ok(k.kpis.every((x) => x.value === null && x.prev === null && x.trend.length === 12 && x.trend.every((v) => v === 0)));
  assert.deepEqual(k.health, { status: "warning", note: "Not configured (AWS_COST_ROLE_ARN)" });
  assert.deepEqual(k.notConfigured, { ...hint, monthToDate: "AWS_COST_ROLE_ARN", idleRunRate: "AWS_COST_ROLE_ARN", last30: "AWS_COST_ROLE_ARN", forecast: "AWS_COST_ROLE_ARN" });
  assert.deepEqual(deps.calls, []);
});

test("half configured: GCP alone answers, AWS and GitHub are null with hints, totals sum what is there", async () => {
  const q = make(fakes({ awsOn: false, githubOn: false }));
  const s = await q.summary("month");
  assert.deepEqual([s.providers[0].mtd, s.providers[1].mtd, s.providers[2].mtd], [null, 104.05, null]);
  assert.equal(s.total.mtd, 104.05);
  assert.deepEqual(s.notConfigured, { aws: "AWS_COST_ROLE_ARN", github: "GITHUB_TOKEN" });
  const { days } = await q.daily();
  assert.deepEqual([days.at(-1).aws, typeof days.at(-1).gcp, days.at(-1).github], [null, "number", null]);
  const a = await q.activity("month");
  assert.deepEqual([a.items[0].quantity, a.items[1].quantity, a.items[3].quantity], [null, 134.96, null]);
});

test("configured but no snapshot yet, or a snapshot without the source: null with an error naming why; a failing BigQuery job likewise", async () => {
  const empty = make(fakes());
  const s = await empty.summary("month");
  assert.equal(s.providers[0].mtd, null);
  assert.deepEqual(s.errors, { aws: "No snapshot yet: the daily job has not run", github: "No snapshot yet: the daily job has not run" });
  assert.equal(s.notConfigured, undefined);
  assert.equal(s.providers[1].mtd, 104.05, "GCP is live and unaffected");

  const deps = fakes();
  await deps.store.writeSnapshot("2026-10-28", { at: SNAPSHOT_AT, finance: { at: SNAPSHOT_AT, aws: null, github: GITHUB, awsCalls: 2, kpi: {}, errors: { aws: "Cost Explorer GetCostAndUsageCommand failed: AccessDenied" } } });
  const partial = await make(deps).summary("month");
  assert.deepEqual(partial.errors, { aws: "Cost Explorer GetCostAndUsageCommand failed: AccessDenied" }, "the job's own error for that source");
  assert.equal(partial.providers[2].gross, 73.67);

  const failing = make(await seeded(fakes({ gcpFail: true })));
  const d = await failing.daily();
  assert.deepEqual(d.errors, { gcp: "BigQuery finance-daily failed: quota" });
  assert.equal(d.days.at(-1).gcp, null);
  assert.equal(typeof d.days.at(-1).aws, "number");
});
