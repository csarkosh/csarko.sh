import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createFinanceQueries, isFinanceQueryName, FINANCE_QUERY_NAMES, SOURCE_ENV, parseRange } from "../src/finance-queries.mjs";
import { createQueries } from "../src/queries.mjs";
import { createMemoryStore } from "../src/store.mjs";
import { createCache } from "../src/cache.mjs";
import { shapeUsage } from "../src/collectors/github-billing.mjs";
import { createLedgers } from "../src/collectors/ledgers.mjs";
import { CATEGORY_KEYS } from "../src/finance/categories.mjs";
import { PROJECT_KEYS } from "../src/finance/projects.mjs";

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));
const AWS = fixture("finance-aws");
const GCP = fixture("finance-gcp");
const GITHUB = shapeUsage(fixture("finance-github-usage").usageItems);
const MODAL = fixture("finance-modal");
const FAL = fixture("finance-fal-balances");
const LEDGERS = fixture("finance-ledgers");
// The 28th, late: the day's snapshot (10:00Z) holds Cost Explorer rows through the 27th and the forecast made that morning.
const NOW = Date.parse("2026-10-28T23:10:00Z");
const SNAPSHOT_AT = "2026-10-28T10:00:00Z";
const log = { error() {}, warn() {}, log() {} };
const HINTS = { aws: "AWS_COST_ROLE_ARN", gcp: "BILLING_DATASET", github: "GITHUB_TOKEN", modal: "MODAL_TOKEN_ID", fal: "FAL_ADMIN_KEY" };

/** A fake Storage client over the ledger fixture, for the ledgers collector. */
function fakeStorage(calls) {
  const files = Object.entries(LEDGERS).map(([slug, l]) => ({ name: `${slug}/ledger.json`, metadata: { updated: l.updated }, async download() { return [Buffer.from(JSON.stringify(l.body))]; } }));
  return { bucket() { return { async getFiles() { calls.push("ledgers:list"); return [files]; } }; } };
}

/** Fake collectors: configured ones answer from the fixtures; Cost Explorer and GitHub count their calls. */
function fakes({ awsOn = true, gcpOn = true, githubOn = true, falOn = true, ledgersOn = true, modalOn = true, gcpFail = false, forecastFail = false, awsFail = false, falFail = false, ledgersFail = false, falBalance = 46.37 } = {}) {
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
    fal: { configured: falOn, async balance() { calls.push("fal:balance"); if (falFail) throw new Error("fal 403 on /v1/account/billing: scope"); return { balance: falBalance, currency: "USD" }; } },
    ledgers: ledgersOn
      ? createLedgers({ bucket: "csarko-sh-film-ledgers", cache: createCache(), storage: ledgersFail ? { bucket() { return { async getFiles() { throw new Error("permission denied"); } }; } } : fakeStorage(calls), log })
      : { configured: false },
    modalConfigured: modalOn,
    store: createMemoryStore(),
  };
}

/**
 * A store holding the fal balance the job read each day since Sep 30 and, on the 28th, the
 * fixtures as the finance part, as the two jobs would have written it (Modal's part first).
 */
async function seeded(deps, { date = "2026-10-28", kpi = { monthToDate: 238.71, idleRunRate: 10.62, last30: 250.65, forecast: 263.49 }, modal = MODAL, fal = true } = {}) {
  if (fal) {
    for (const [day, balance] of Object.entries(FAL.balances)) {
      if (day >= date) continue;
      await deps.store.writeSnapshot(day, { at: `${day}T10:00:00Z`, finance: { at: `${day}T10:00:00Z`, fal: { at: `${day}T10:00:00Z`, balance, currency: "USD", lastDay: day } } });
    }
  }
  const falPart = fal ? { at: SNAPSHOT_AT, balance: FAL.balances[date] ?? 46.37, currency: "USD", lastDay: date } : null;
  await deps.store.writeSnapshot(date, { at: SNAPSHOT_AT, visits7: 10, finance: { at: SNAPSHOT_AT, aws: AWS, github: GITHUB, fal: falPart, ...(modal === null ? {} : { modal }), awsCalls: 3, kpi } });
  return deps;
}

const make = (deps) => createFinanceQueries({ ...deps, now: () => NOW, log });

test("the eight query names, the env each source is configured by, and the range parser the routes use", () => {
  assert.deepEqual(FINANCE_QUERY_NAMES, ["summary", "categories", "idle", "daily", "activity", "sources", "projects", "films"]);
  assert.ok(isFinanceQueryName("projects") && isFinanceQueryName("films"));
  assert.ok(!isFinanceQueryName("visits"));
  assert.deepEqual(SOURCE_ENV, { ...HINTS, ledgers: "FILM_LEDGERS_BUCKET" });
  assert.equal(parseRange("13m"), "13m");
});

test("summary: the five providers, the totals, Modal net of its credits, fal from the balance's fall, the forecast as AWS's plus GCP's run-rate plus the nets to date and fal's run-rate", async () => {
  const deps = await seeded(fakes());
  const s = await make(deps).summary("month");
  assert.equal(s.at, "2026-10-28T23:10:00.000Z");
  assert.equal(s.month, "2026-10");
  assert.equal(s.goalUsd, undefined, "no goal");
  assert.deepEqual(s.providers.map((p) => [p.provider, p.label]), [["aws", "AWS"], ["gcp", "Google Cloud"], ["github", "GitHub"], ["modal", "Modal"], ["fal", "fal"]]);
  const [aws, gcp, github, modal, fal] = s.providers;
  assert.deepEqual(aws, { provider: "aws", label: "AWS", mtd: 30.96, forecast: 32.38, lastMonth: 94.34, lastDay: "2026-10-27" });
  assert.equal(aws.forecast, Math.round((30.96 + AWS.forecast.remaining) * 100) / 100, "month to date plus Cost Explorer's remaining");
  assert.deepEqual([gcp.mtd, gcp.lastMonth, gcp.lastDay], [104.05, 23.04, "2026-10-27"]);
  assert.ok(Math.abs(gcp.forecast - (104.05 / 27) * 31) < 0.02, "GCP: run-rate over the 27 days it has billed");
  assert.deepEqual(github, { provider: "github", label: "GitHub", mtd: 0, forecast: 0, lastMonth: 0, lastDay: "2026-10-27", gross: 73.67 });
  assert.deepEqual(modal, { provider: "modal", label: "Modal", mtd: 50.06, forecast: 50.06, lastMonth: 43.49, lastDay: "2026-10-24", gross: 80.06, credits: 30 }, "$80.06 of usage less $30 of credits; September's $73.49 likewise");
  assert.deepEqual(fal, { provider: "fal", label: "fal", mtd: 53.63, forecast: 61.58, lastMonth: 0.72, lastDay: "2026-10-27", balance: 46.37 }, "the balance fell $53.63 after the $100 purchase, which is not spend");
  assert.ok(Math.abs(fal.forecast - (53.63 / 27) * 31) < 0.02, "fal: run-rate over the days with a reading");
  assert.deepEqual([s.total.mtd, s.total.lastMonth, s.total.idleRunRate], [238.71, 161.59, 10.62]);
  assert.ok(Math.abs(s.total.forecast - (aws.forecast + gcp.forecast + github.forecast + modal.forecast + fal.forecast)) <= 0.011, "the total is rounded once");
  assert.equal(s.notConfigured, undefined);
  assert.equal(s.errors, undefined);
  assert.deepEqual(deps.calls, ["gcp:daily", "gcp:monthly", "gcp:lastDay"], "GCP live; the rest from the snapshots, Cost Explorer and fal never called on a request");
});

test("summary with range=last names the previous month and no forecast; 90 and 13m keep the current month", async () => {
  const q = make(await seeded(fakes()));
  const last = await q.summary("last");
  assert.equal(last.month, "2026-09");
  assert.deepEqual([last.total.mtd, last.total.forecast, last.total.lastMonth], [161.59, null, 34.58]);
  assert.ok(last.providers.every((p) => p.forecast === null));
  assert.equal(last.providers[0].mtd, 94.34, "September: the domain renewal and two rig days");
  assert.equal(last.providers[2].gross, 13.26);
  assert.deepEqual([last.providers[3].mtd, last.providers[3].gross], [43.49, 73.49]);
  assert.deepEqual([last.providers[4].mtd, last.providers[4].balance], [0.72, 46.37], "the balance is always the latest reading");
  assert.equal((await q.summary("90")).month, "2026-10");
  assert.equal((await q.summary("13m")).total.forecast, (await q.summary("month")).total.forecast);
});

test("categories: 13 months aligned, every category, Modal in compute and fal in AI, the partial months and the unmapped line", async () => {
  const q = make(await seeded(fakes()));
  const c = await q.categories("13m");
  assert.equal(c.months.length, 13);
  assert.deepEqual([c.months[0], c.months.at(-1)], ["2025-10", "2026-10"]);
  assert.deepEqual(c.categories.map((x) => x.key), CATEGORY_KEYS);
  assert.ok(c.categories.every((x) => x.byMonth.length === 13 && x.byMonth.every((v) => typeof v === "number")));
  const by = (key) => c.categories.find((x) => x.key === key).byMonth;
  assert.deepEqual(by("compute").slice(-3), [0, 51.19, 76.5], "the rigs plus Modal's net: 7.7 + 43.49, 26.44 + 50.06");
  assert.deepEqual(by("ai").slice(-2), [0.72, 118.43], "Veo through Vertex plus fal");
  assert.deepEqual(by("domains").slice(-2), [76, 0]);
  assert.deepEqual(by("loadBalancing").slice(-1), [10.96], "eighteen days of the forwarding rule");
  assert.deepEqual(c.partial, c.months.slice(0, 12), "every month before the export's first");
  assert.deepEqual(c.other.map((o) => o.line), ["Log Storage cost"]);
  const month = await q.categories("month");
  assert.deepEqual(month.months, ["2026-10"]);
  assert.deepEqual(month.partial, []);
  assert.deepEqual(month.other, [{ provider: "gcp", line: "Log Storage cost", amount: 0.54 }]);
  const sum = month.categories.reduce((n, x) => n + x.byMonth[0], 0);
  assert.ok(Math.abs(sum - 238.71) < 0.05, "the categories add up to the month");
});

test("projects: the four projects aligned with the months, the films from Vertex, cinema-* apps and fal", async () => {
  const q = make(await seeded(fakes()));
  const p = await q.projects("90");
  assert.deepEqual(p.months, ["2026-08", "2026-09", "2026-10"]);
  assert.deepEqual(p.projects.map((x) => x.key), PROJECT_KEYS);
  assert.deepEqual(p.partial, ["2026-08", "2026-09"]);
  const by = (key) => p.projects.find((x) => x.key === key).byMonth;
  assert.deepEqual(by("films"), [0, 36.3, 160.5], "September's cinema-spike net; October's Veo 64.80 + cinema-spike's 42.07 share + fal 53.63");
  assert.deepEqual(by("other"), [18.88, 18.27, 10.96], "magicpixel's forwarding rule");
  assert.deepEqual(by("site")[2], 21.74, "csarko-sh's egress and Cloud Run, the zone and its queries");
  assert.deepEqual(by("dayhike")[2], 45.51);
  const total = p.projects.reduce((n, x) => n + x.byMonth[2], 0);
  assert.ok(Math.abs(total - 238.71) < 0.05, "the projects add up to the month");
  assert.equal(p.notConfigured, undefined);
  const off = await make(fakes({ awsOn: false, gcpOn: false, githubOn: false, modalOn: false, falOn: false })).projects("month");
  assert.ok(off.projects.every((x) => x.byMonth.every((v) => v === 0)));
  assert.deepEqual(off.notConfigured, HINTS);
});

test("idle: the lines sorted by perMonth, the stopped forwarding rule at zero with its last day, the run-rate, no goal, Modal and fal ignored", async () => {
  const q = make(await seeded(fakes()));
  const r = await q.idle();
  assert.deepEqual([r.runRate, r.goalUsd, r.asOf], [10.62, undefined, "2026-10-27"]);
  assert.deepEqual(Object.keys(r), ["runRate", "asOf", "lines"]);
  assert.deepEqual(r.lines[0], { provider: "aws", line: "EBS:VolumeUsage.gp3", category: "storage", where: "us-east-1", perDay: 0.1707, perMonth: 5.12, stoppedOn: null });
  const rule = r.lines.at(-1);
  assert.deepEqual(rule, { provider: "gcp", line: "Cloud Load Balancer Forwarding Rule Minimum Global", category: "loadBalancing", where: "magicpixel-487014", perDay: 0, perMonth: 0, stoppedOn: "2026-10-18" });
  assert.ok(r.lines.every((l) => ["storage", "dns", "loadBalancing"].includes(l.category)), "idle categories only");
  assert.ok(r.lines.every((l) => l.provider === "aws" || l.provider === "gcp"), "Modal and fal are activity");
  assert.ok(r.lines.some((l) => l.line === "USE1-EBS:SnapshotUsage" && l.perMonth === 0.29), "the rig image");
  for (let i = 1; i < r.lines.length; i += 1) assert.ok(r.lines[i - 1].perMonth >= r.lines[i].perMonth);
  assert.equal(Math.round(r.lines.reduce((n, l) => n + l.perMonth, 0) * 100) / 100, r.runRate);
});

test("daily: 60 days ending on the latest billed day with modal and fal columns, the median, the flags and the top line", async () => {
  const q = make(await seeded(fakes()));
  const { days } = await q.daily();
  assert.equal(days.length, 60);
  assert.deepEqual([days[0].day, days.at(-1).day], ["2026-08-29", "2026-10-27"]);
  assert.deepEqual(Object.keys(days[0]), ["day", "aws", "gcp", "github", "modal", "fal", "total", "median14", "flagged", "top"]);
  assert.equal(days[0].median14, null, "no day before the first");
  const renewal = days.find((d) => d.day === "2026-09-16");
  assert.deepEqual([renewal.flagged, renewal.top], [true, { provider: "aws", line: "Route53-Domains", amount: 76 }]);
  const veo = days.find((d) => d.day === "2026-10-24");
  assert.deepEqual([veo.flagged, veo.top.line, veo.top.amount, veo.modal, veo.fal], [true, "Veo 3 Fast 720p Audio Video Generation", 14.2, 2.81, 3.1]);
  assert.ok(Math.abs(veo.total - (veo.aws + veo.gcp + veo.github + veo.modal + veo.fal)) <= 0.021, "the total is the day's, rounded once; the rounded parts may differ by a cent");
  const spike = days.find((d) => d.day === "2026-10-17");
  assert.deepEqual([spike.modal, spike.fal, spike.top], [13.69, 2.3, { provider: "modal", line: "cinema-spike", amount: 11.82 }], "Modal's biggest day: 21.90 of usage at the month's 50.06/80.06 share");
  const purchase = days.find((d) => d.day === "2026-10-09");
  assert.equal(purchase.fal, 0, "the $100 purchase is not spend");
  assert.equal(days.find((d) => d.day === "2026-09-30").fal, 0.72, "the last 72 cents of the earlier balance");
  const first = days.find((d) => d.day === "2026-10-10");
  assert.deepEqual([first.github, first.fal, first.top], [0, 4.2, { provider: "fal", line: "fal credits used", amount: 4.2 }], "the first fal day after the purchase");
  const quiet = days.find((d) => d.day === "2026-10-05");
  assert.deepEqual([quiet.flagged, quiet.modal, quiet.fal], [false, 0, 0]);
});

test("activity: the seven items for the month and for 90 days, Modal's apps by usage", async () => {
  const q = make(await seeded(fakes()));
  const { items } = await q.activity("month");
  assert.deepEqual(items.map((i) => [i.key, i.quantity, i.cost, i.unitPrice]), [
    ["rigHours", 40.3, 21.2, 0.526],
    ["egressGiB", 134.96, 18.76, 0.139],
    ["cloudRunCpuHours", 118.13, 3.43, 0.029],
    ["ciMinutes", 9185, 0, 0.008],
    ["aiGenerations", 648, 64.8, 0.1],
    ["modalGpu", null, 80.06, null],
    ["falGenerations", null, 53.63, null],
  ]);
  assert.equal(items[3].gross, 73.67);
  assert.deepEqual(items[5].apps, [
    { app: "cinema-spike", cost: 67.28 }, { app: "dayhike-record", cost: 6.64 }, { app: "dayhike-gate", cost: 4.29 },
    { app: "dayhike-suite-spike", cost: 1.03 }, { app: "dayhike-gpu-spike", cost: 0.8 }, { app: "dayhike-rig-probe", cost: 0.02 },
  ]);
  assert.deepEqual([items[5].unit, items[5].per, items[6].unit, items[6].per], ["", "", "", ""]);
  const ninety = await q.activity("90");
  assert.equal(ninety.items[0].quantity, 54.94, "September's two rig days join");
  assert.equal(ninety.items[3].quantity, 10825);
  assert.deepEqual([ninety.items[5].cost, ninety.items[6].cost], [153.55, 54.35], "September's Modal usage and fal's last 72 cents join");
});

test("films: one entry a ledger, largest first, the labels, the cap, by provider and by model; asOf the newest file", async () => {
  const deps = await seeded(fakes());
  const f = await make(deps).films();
  assert.equal(f.asOf, "2026-10-28T20:32:39Z");
  assert.deepEqual(f.films.map((x) => [x.key, x.label, x.total, x.capUsd]), [
    ["last-trail", "The Last Trail", 146.75, 150],
    ["ranger-radio", "Ranger Radio, the earlier cut of The Last Trail", 65.32, 150],
    ["rowan-rockslide", "Pipeline spike: rowan-rockslide", 16.34, 150],
    ["rowan-speech", "Pipeline spike: rowan-speech", 0.93, 20],
    ["last-trail-thing-body", "The Last Trail, thing-body takes", 0.06, 150],
    ["last-trail-thing-face17", "The Last Trail, thing-face17 takes", 0.05, 150],
    ["last-trail-thing17", "The Last Trail, thing17 takes", 0.05, 150],
    ["last-trail-dad", "The Last Trail, dad takes", 0.03, 150],
  ]);
  const lastTrail = f.films[0];
  assert.deepEqual(lastTrail.byProvider, { modal: 22.19, fal: 31.86, gcp: 92.7 }, "Veo at the ledger's list rate; Seedance, Nano Banana and ElevenLabs through fal; the rest on Modal");
  assert.deepEqual(lastTrail.byModel[0], { model: "veo-3.1-fast-generate-001", provider: "gcp", usd: 92.7, calls: 3, seconds: 6137 });
  assert.deepEqual(lastTrail.byModel.map((m) => m.model), ["veo-3.1-fast-generate-001", "nano-banana-2-edit", "Edit", "Seedance-2.5", "A2V", "LTX", "T2I", "elevenlabs-sfx-v2"]);
  const everyModel = new Map();
  for (const film of f.films) for (const m of film.byModel) everyModel.set(m.model, Math.round(((everyModel.get(m.model) ?? 0) + m.usd) * 100) / 100);
  assert.deepEqual(Object.fromEntries(everyModel), { "veo-3.1-fast-generate-001": 96.3, "nano-banana-2-edit": 24.72, Edit: 29.78, "Seedance-2.5": 29.55, A2V: 14.02, LTX: 23.54, T2I: 1.81, "elevenlabs-sfx-v2": 0.08, Wan: 9.73 }, "October 2026 across all films");
  assert.deepEqual(deps.calls.filter((c) => c === "ledgers:list").length, 1);
  await make(deps).films();
  assert.deepEqual(deps.calls.filter((c) => c === "ledgers:list").length, 1, "cached five minutes");
  assert.equal(f.notConfigured, undefined);
  assert.deepEqual(await make(fakes({ ledgersOn: false })).films(), { asOf: null, films: null, notConfigured: { ledgers: "FILM_LEDGERS_BUCKET" } });
  assert.deepEqual(await make(fakes({ ledgersFail: true })).films(), { asOf: null, films: null, errors: { ledgers: "ledgers: listing gs://csarko-sh-film-ledgers failed: permission denied" } });
});

test("sources: six rows; configured, last day, the snapshot time, this month's Cost Explorer calls, Modal's own time, the ledgers' count", async () => {
  const deps = await seeded(fakes());
  await deps.store.writeSnapshot("2026-10-27", { at: "2026-10-27T10:00:00Z", finance: { at: "2026-10-27T10:00:00Z", aws: { ...AWS, calls: 3 }, github: GITHUB, fal: { balance: 48.77, currency: "USD" }, awsCalls: 3, kpi: {} } });
  await deps.store.writeSnapshot("2026-09-30", { at: "2026-09-30T10:00:00Z", finance: { at: "2026-09-30T10:00:00Z", aws: AWS, github: GITHUB, fal: { balance: 0.72, currency: "USD" }, awsCalls: 2, kpi: {} } });
  const { sources, notConfigured, errors } = await make(deps).sources();
  assert.equal(notConfigured, undefined);
  assert.equal(errors, undefined);
  assert.deepEqual(sources.map((s) => s.key), ["aws", "gcp", "github", "modal", "fal", "ledgers"]);
  assert.deepEqual(sources[0], { key: "aws", label: "AWS Cost Explorer", configured: true, lastDay: "2026-10-27", snapshotAt: SNAPSHOT_AT, callsThisMonth: 6, callCostUsd: 0.06, note: "Two calls a day from the snapshot job, $0.01 each; a third for the forecast until the 28th." });
  assert.deepEqual(sources[1], { key: "gcp", label: "Google Cloud billing export", configured: true, lastDay: "2026-10-27", snapshotAt: null, callsThisMonth: null, callCostUsd: null, note: "BigQuery, read live; rows from 2026-10-02 on." });
  assert.deepEqual(sources[2], { key: "github", label: "GitHub usage", configured: true, lastDay: "2026-10-27", snapshotAt: SNAPSHOT_AT, callsThisMonth: null, callCostUsd: null, note: "From the snapshot; public repositories bill $0." });
  assert.deepEqual(sources[3], { key: "modal", label: "Modal billing report", configured: true, lastDay: "2026-10-24", snapshotAt: "2026-10-28T10:02:00Z", callsThisMonth: null, callCostUsd: null, note: "The workspace report, per app per day, written by the daily job." });
  assert.deepEqual(sources[4], { key: "fal", label: "fal credit balance", configured: true, lastDay: "2026-10-27", snapshotAt: SNAPSHOT_AT, callsThisMonth: null, callCostUsd: null, note: "The balance once a day; a day's spend is its fall." });
  assert.deepEqual(sources[5], { key: "ledgers", label: "Film ledgers", configured: true, lastDay: null, snapshotAt: "2026-10-28T20:32:39Z", callsThisMonth: null, callCostUsd: null, note: "8 ledgers in the bucket; the time is the newest file's." });
  const off = await make(fakes({ awsOn: false, gcpOn: false, githubOn: false, modalOn: false, falOn: false, ledgersOn: false })).sources();
  assert.deepEqual(off.sources.map((s) => [s.configured, s.lastDay, s.snapshotAt]), Array.from({ length: 6 }, () => [false, null, null]));
  assert.equal(off.sources[5].note, "The film pipeline's priced calls, one ledger a film, in the bucket.");
});

test("kpis: four KPIs in dollars with no goal in the label, previous periods, twelve-week trends from the snapshots' kpi values, health from the sources and the days", async () => {
  const deps = await seeded(fakes());
  // The store replaces `finance` whole, so an earlier day's kpi values are written beside its fal reading, as the job does.
  const withKpi = async (date, kpi) => {
    const prior = (await deps.store.listSnapshots(date, date))[0];
    await deps.store.writeSnapshot(date, { finance: { ...(prior?.finance ?? {}), kpi } });
  };
  await withKpi("2026-10-20", { monthToDate: 60, idleRunRate: 26.3, last30: 90, forecast: 70 });
  await withKpi("2026-10-21", { monthToDate: 62, idleRunRate: 26.2, last30: 91, forecast: 71 });
  await withKpi("2026-08-10", { monthToDate: 5, idleRunRate: 25, last30: 24, forecast: 25 });
  const k = await make(deps).kpis();
  assert.deepEqual([k.app, k.at], ["finance", "2026-10-28T23:10:00.000Z"]);
  assert.deepEqual(k.kpis.map((x) => [x.key, x.label, x.unit]), [
    ["monthToDate", "Month to date", "USD"], ["idleRunRate", "Idle run-rate", "USD"], ["last30", "Last 30 days", "USD"], ["forecast", "Forecast", "USD"],
  ]);
  const [mtd, idle, last30, forecast] = k.kpis;
  assert.equal(mtd.value, 238.71);
  assert.equal(mtd.prev, 154.8, "September through the 28th: AWS, GCP and Modal's net through the 28th");
  assert.deepEqual([idle.value, idle.prev, idle.good], [10.62, 23.67, "down"]);
  assert.deepEqual([last30.value, last30.prev], [250.65, 152.92]);
  assert.equal(forecast.value, (await make(deps).summary("month")).total.forecast);
  assert.equal(forecast.prev, 161.59, "last month's total");
  assert.ok(k.kpis.every((x) => x.trend.length === 12));
  assert.deepEqual(mtd.trend.slice(-2), [62, 238.71], "the latest snapshot of each week; 2026-10-21 for the week before this one");
  assert.equal(idle.trend[0], 25, "2026-08-10 falls in the first of the twelve weeks");
  assert.equal(mtd.trend[5], 0, "a week with no snapshot is 0");
  assert.deepEqual(k.health, { status: "good", note: "5 sources answered; no day of the last 7 out of line" });
  assert.equal(k.notConfigured, undefined);
  const failing = await make(await seeded(fakes({ gcpFail: true }))).kpis();
  assert.deepEqual(failing.health, { status: "warning", note: "A source failed: gcp" });
  assert.deepEqual(failing.errors, { gcp: "BigQuery finance-daily failed: quota" });
});

test("snapshotPart: the Cost Explorer calls and the forecast, GitHub's usage, fal's balance, Modal's part carried over from the day's document, the day's KPI values", async () => {
  const deps = fakes();
  // Modal's job ran ten minutes earlier and wrote its part into today's document; the earlier days hold fal's readings.
  await seeded(deps, { date: "2026-10-27", modal: null });
  await deps.store.writeSnapshot("2026-10-28", { finance: { modal: MODAL } });
  const finance = make(deps);
  const part = await finance.snapshotPart();
  assert.deepEqual(Object.keys(part), ["finance"]);
  const f = part.finance;
  assert.equal(f.at, "2026-10-28T23:10:00.000Z");
  assert.deepEqual(deps.calls.sort(), ["aws:daily", "aws:forecast", "aws:monthly", "fal:balance", "gcp:daily", "gcp:lastDay", "gcp:monthly", "github:usage"]);
  assert.deepEqual([f.aws.monthly.length, f.aws.daily.length, f.aws.forecast, f.aws.calls, f.aws.lastDay, f.awsCalls], [AWS.monthly.length, AWS.daily.length, AWS.forecast, 4, "2026-10-27", 4]);
  assert.deepEqual([f.github.months.length, f.github.days.length, f.github.lastDay], [GITHUB.months.length, GITHUB.days.length, "2026-10-27"]);
  assert.deepEqual(f.fal, { at: "2026-10-28T23:10:00.000Z", balance: 46.37, currency: "USD", lastDay: "2026-10-28" });
  assert.deepEqual(f.modal, MODAL, "the store replaces `finance` whole, so the Modal part is carried into it");
  assert.deepEqual(f.kpi, { monthToDate: 238.71, idleRunRate: 10.62, last30: 250.65, forecast: 263.49 }, "every provider counted, fal's series with today's reading");
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
  assert.deepEqual(doc.finance.modal, MODAL);
  assert.equal(doc.errors?.finance, undefined);
  const broken = await createQueries({ ...base, finance: { async snapshotPart() { throw new Error("sts: not authorized"); } } }).snapshot();
  assert.equal(broken.up, true, "the rest of the day is still written");
  assert.equal(broken.errors.finance, "sts: not authorized");
  assert.equal((await createQueries(base).snapshot()).finance?.at, f.at, "without a finance step the merged document keeps the earlier part");
});

test("snapshotPart: a failed forecast keeps the rows and says so; a failed usage call nulls AWS; fal failing is its own part; nothing configured", async () => {
  const soft = await make(fakes({ forecastFail: true })).snapshotPart();
  assert.equal(soft.finance.aws.forecast, null);
  assert.equal(soft.finance.aws.calls, 4, "the failed call still cost a cent");
  assert.match(soft.finance.errors.awsForecast, /DataUnavailableException/);
  assert.equal(soft.finance.kpi.monthToDate, 135.02, "no Modal part today and fal has one reading, so no spend yet");
  const hard = await make(fakes({ awsFail: true })).snapshotPart();
  assert.equal(hard.finance.aws, null);
  assert.match(hard.finance.errors.aws, /throttled/);
  assert.equal(hard.finance.awsCalls, 4);
  assert.equal(hard.finance.kpi.monthToDate, 104.05, "GCP and GitHub still give a value");
  const noFal = await make(fakes({ falFail: true })).snapshotPart();
  assert.equal(noFal.finance.fal, null);
  assert.match(noFal.finance.errors.fal, /fal 403/);
  assert.equal(noFal.finance.aws.calls, 4);
  const off = await make(fakes({ awsOn: false, githubOn: false, gcpOn: false, falOn: false, modalOn: false })).snapshotPart();
  assert.deepEqual(off.finance, { at: "2026-10-28T23:10:00.000Z", aws: null, github: null, fal: null, awsCalls: 0, kpi: { monthToDate: null, idleRunRate: null, last30: null, forecast: null }, notConfigured: { aws: "AWS_COST_ROLE_ARN", github: "GITHUB_TOKEN", gcp: "BILLING_DATASET", fal: "FAL_ADMIN_KEY" } });
});

test("not configured: every part null with its hint, the shapes kept, nothing fetched", async () => {
  const deps = fakes({ awsOn: false, gcpOn: false, githubOn: false, modalOn: false, falOn: false, ledgersOn: false });
  const q = make(deps);
  const s = await q.summary("month");
  assert.deepEqual(s.total, { mtd: null, forecast: null, lastMonth: null, idleRunRate: null });
  assert.deepEqual(s.providers[0], { provider: "aws", label: "AWS", mtd: null, forecast: null, lastMonth: null, lastDay: null });
  assert.deepEqual(s.providers[2].gross, null);
  assert.deepEqual(s.providers[3], { provider: "modal", label: "Modal", mtd: null, forecast: null, lastMonth: null, lastDay: null, gross: null, credits: null });
  assert.deepEqual(s.providers[4], { provider: "fal", label: "fal", mtd: null, forecast: null, lastMonth: null, lastDay: null, balance: null });
  assert.deepEqual(s.notConfigured, HINTS);
  const c = await q.categories("90");
  assert.equal(c.categories.length, 11);
  assert.ok(c.categories.every((x) => x.byMonth.every((v) => v === 0)));
  assert.deepEqual(c.notConfigured, HINTS);
  assert.deepEqual(await q.idle(), { runRate: null, asOf: "2026-10-28", lines: null, notConfigured: HINTS });
  assert.deepEqual(await q.daily(), { days: null, notConfigured: HINTS });
  const a = await q.activity("month");
  assert.ok(a.items.every((i) => i.quantity === null && i.cost === null && i.unitPrice === null));
  assert.equal(a.items.length, 7);
  assert.deepEqual(a.notConfigured, HINTS);
  const src = await q.sources();
  assert.deepEqual(src.sources.map((x) => [x.configured, x.lastDay, x.callsThisMonth]), Array.from({ length: 6 }, () => [false, null, null]));
  const k = await q.kpis();
  assert.ok(k.kpis.every((x) => x.value === null && x.prev === null && x.trend.length === 12 && x.trend.every((v) => v === 0)));
  assert.deepEqual(k.health, { status: "warning", note: "Not configured (AWS_COST_ROLE_ARN)" });
  assert.deepEqual(k.notConfigured, { ...HINTS, monthToDate: "AWS_COST_ROLE_ARN", idleRunRate: "AWS_COST_ROLE_ARN", last30: "AWS_COST_ROLE_ARN", forecast: "AWS_COST_ROLE_ARN" });
  assert.deepEqual(deps.calls, []);
});

test("half configured: GCP alone answers, the rest null with hints, totals sum what is there", async () => {
  const q = make(fakes({ awsOn: false, githubOn: false, modalOn: false, falOn: false }));
  const s = await q.summary("month");
  assert.deepEqual(s.providers.map((p) => p.mtd), [null, 104.05, null, null, null]);
  assert.equal(s.total.mtd, 104.05);
  assert.deepEqual(s.notConfigured, { aws: "AWS_COST_ROLE_ARN", github: "GITHUB_TOKEN", modal: "MODAL_TOKEN_ID", fal: "FAL_ADMIN_KEY" });
  const { days } = await q.daily();
  assert.deepEqual([days.at(-1).aws, typeof days.at(-1).gcp, days.at(-1).github, days.at(-1).modal, days.at(-1).fal], [null, "number", null, null, null]);
  const a = await q.activity("month");
  assert.deepEqual([a.items[0].quantity, a.items[1].quantity, a.items[3].quantity, a.items[5].cost, a.items[6].cost], [null, 134.96, null, null, null]);
});

test("Modal is configured by its part in the snapshot: absent and MODAL_CONFIGURED unset is not configured; absent with it set, or present with an error, is an error", async () => {
  // Not configured: no part, no flag; the rest answers.
  const none = await make(await seeded(fakes({ modalOn: false }), { modal: null })).summary("month");
  assert.deepEqual(none.notConfigured, { modal: "MODAL_TOKEN_ID" });
  assert.equal(none.providers[3].mtd, null);
  assert.equal(none.total.mtd, 188.65, "the other four");
  // The part is there although the flag is not: the report is used.
  const unflagged = await make(await seeded(fakes({ modalOn: false }))).summary("month");
  assert.equal(unflagged.notConfigured, undefined);
  assert.equal(unflagged.providers[3].mtd, 50.06);
  // The job exists but has not written today: an error, not a hint.
  const missing = await make(await seeded(fakes(), { modal: null })).summary("month");
  assert.deepEqual(missing.errors, { modal: "The latest snapshot (2026-10-28) has no Modal billing report" });
  assert.equal(missing.notConfigured, undefined);
  // The job failed and wrote its error.
  const failed = await make(await seeded(fakes(), { modal: { at: "2026-10-28T10:02:00Z", error: "modal billing report: token refused" } })).summary("month");
  assert.deepEqual(failed.errors, { modal: "modal billing report: token refused" });
  assert.equal(failed.providers[3].mtd, null);
  const src = await make(await seeded(fakes(), { modal: { at: "2026-10-28T10:02:00Z", error: "x" } })).sources();
  assert.deepEqual([src.sources[3].configured, src.sources[3].lastDay, src.sources[3].snapshotAt], [true, null, "2026-10-28T10:02:00Z"]);
});

test("fal: configured with no reading yet is an error; one reading has no spend; a purchase day is never spend", async () => {
  const fresh = make(fakes());
  const s = await fresh.summary("month");
  assert.equal(s.providers[4].mtd, null);
  assert.equal(s.errors.fal, "No snapshot yet: the daily job has not read the balance");
  const deps = fakes();
  await deps.store.writeSnapshot("2026-10-28", { at: SNAPSHOT_AT, finance: { at: SNAPSHOT_AT, aws: AWS, github: GITHUB, fal: { at: SNAPSHOT_AT, balance: 46.37, currency: "USD", lastDay: "2026-10-28" }, awsCalls: 3, kpi: {} } });
  const one = await make(deps).summary("month");
  assert.deepEqual([one.providers[4].mtd, one.providers[4].lastDay, one.providers[4].balance, one.providers[4].forecast], [0, null, 46.37, null], "a reading, no fall yet");
  assert.equal(one.errors?.fal, undefined);
});

test("configured but no snapshot yet, or a snapshot without the source: null with an error naming why; a failing BigQuery job likewise", async () => {
  const empty = make(fakes({ falOn: false, modalOn: false }));
  const s = await empty.summary("month");
  assert.equal(s.providers[0].mtd, null);
  assert.deepEqual(s.errors, { aws: "No snapshot yet: the daily job has not run", github: "No snapshot yet: the daily job has not run" });
  assert.deepEqual(s.notConfigured, { modal: "MODAL_TOKEN_ID", fal: "FAL_ADMIN_KEY" });
  assert.equal(s.providers[1].mtd, 104.05, "GCP is live and unaffected");

  const deps = fakes();
  await deps.store.writeSnapshot("2026-10-28", { at: SNAPSHOT_AT, finance: { at: SNAPSHOT_AT, aws: null, github: GITHUB, modal: MODAL, fal: { balance: 46.37, currency: "USD" }, awsCalls: 2, kpi: {}, errors: { aws: "Cost Explorer GetCostAndUsageCommand failed: AccessDenied" } } });
  const partial = await make(deps).summary("month");
  assert.deepEqual(partial.errors, { aws: "Cost Explorer GetCostAndUsageCommand failed: AccessDenied" }, "the job's own error for that source");
  assert.equal(partial.providers[2].gross, 73.67);

  const failing = make(await seeded(fakes({ gcpFail: true })));
  const d = await failing.daily();
  assert.deepEqual(d.errors, { gcp: "BigQuery finance-daily failed: quota" });
  assert.equal(d.days.at(-1).gcp, null);
  assert.equal(typeof d.days.at(-1).aws, "number");
  assert.equal(typeof d.days.at(-1).modal, "number");
});
