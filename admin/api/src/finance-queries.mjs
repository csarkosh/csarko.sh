/**
 * The finance page's routes under `/finance/admin/*`: the index card and the six queries
 * (`admin/CONTRACT.md`, the Finance section), plus `snapshotPart()`, the step the daily snapshot
 * runs. Tested with fake collectors and the in-memory store, like queries.mjs.
 *
 * Who is read when. AWS Cost Explorer costs $0.01 a call, so only `snapshotPart()` calls it
 * (two calls a day, a third for the forecast until the 28th) and stores the rows under the day's
 * snapshot as `finance.aws`; GitHub's usage goes under `finance.github` from the same job. Every
 * query reads those from the latest snapshot and GCP live from BigQuery (free at this size).
 * The snapshot also stores the four KPI values of the day (`finance.kpi`), which the index
 * card's twelve-week trends read, as the csarko.sh card's do.
 *
 * The shaping is pure, in `src/finance/`: categories, rows, months (the range and the
 * categories table), idle, daily, activity, kpis (health). This file only fetches and assembles.
 */

import { parseRange, monthsOf, categoriesTable, monthTotals, monthGross, runRateForecast, GCP_EXPORT_FROM } from "./finance/months.mjs";
import { PROVIDERS, PROVIDER_LABELS, awsRows, gcpRows, githubRows, cents, monthOf, addMonths, lastBilledDay } from "./finance/rows.mjs";
import { idleLines } from "./finance/idle.mjs";
import { dailySeries, trailingTotals } from "./finance/daily.mjs";
import { activityItems } from "./finance/activity.mjs";
import { financeHealth } from "./finance/kpis.mjs";
import { CALL_COST_USD } from "./collectors/aws-cost.mjs";
import { weeklyTrend, TREND_WEEKS } from "./queries.mjs";
import { addDays, isoDate } from "./time.mjs";

export { parseRange };
export const FINANCE_QUERY_NAMES = ["summary", "categories", "idle", "daily", "activity", "sources"];
export const FINANCE_APP = "finance";
/** The environment variable that configures each source, for `notConfigured`. */
export const SOURCE_ENV = { aws: "AWS_COST_ROLE_ARN", gcp: "BILLING_DATASET", github: "GITHUB_TOKEN" };
export const SOURCE_LABELS = { aws: "AWS Cost Explorer", gcp: "Google Cloud billing export", github: "GitHub usage" };

export function isFinanceQueryName(name) {
  return FINANCE_QUERY_NAMES.includes(name);
}

export function createFinanceQueries({ awsCost, gcpBilling, githubBilling, store, now = Date.now, log = console, goalUsd = 5 }) {
  const hints = () => ({ notConfigured: {}, errors: {} });
  const withHints = (body, h) => ({
    ...body,
    ...(Object.keys(h.notConfigured).length > 0 ? { notConfigured: h.notConfigured } : {}),
    ...(Object.keys(h.errors).length > 0 ? { errors: h.errors } : {}),
  });

  /** Runs one part, reporting a missing credential or a failure instead of throwing. */
  async function part(h, name, configured, fn) {
    if (!configured) {
      h.notConfigured[name] = SOURCE_ENV[name];
      return null;
    }
    try {
      return await fn();
    } catch (error) {
      log.error(`admin: finance ${name} failed`, error);
      h.errors[name] = error instanceof Error ? error.message : String(error);
      return null;
    }
  }

  /** GCP's three jobs at once: `{ daily, monthly, lastDay }` (plain rows and a day). */
  const gcpLive = () => Promise.all([gcpBilling.daily(), gcpBilling.monthly(), gcpBilling.lastDay()]).then(([daily, monthly, lastDay]) => ({ daily, monthly, lastDay }));

  /**
   * A snapshot's part for a source read once a day: the rows when the snapshot has them, else
   * null with the reason under `errors` (no snapshot yet, or the job's own error for that
   * source), or `notConfigured` when the collector has no credential now.
   */
  function fromSnapshot(h, snapshot, key, configured) {
    if (!configured) {
      h.notConfigured[key] = SOURCE_ENV[key];
      return null;
    }
    const fin = snapshot?.finance ?? null;
    if (fin === null) {
      h.errors[key] = "No snapshot yet: the daily job has not run";
      return null;
    }
    if (fin[key] === null || fin[key] === undefined) {
      h.errors[key] = fin.errors?.[key] ?? `The latest snapshot (${snapshot.date}) has no ${SOURCE_LABELS[key]} rows`;
      return null;
    }
    return fin[key];
  }

  /**
   * Everything a query may need, loaded once: the latest snapshot, each source's data or null,
   * and the line rows (rows.mjs) by day and by month across the sources that answered.
   */
  async function load(h, { gcp = true } = {}) {
    const [snapshot, gcpData] = await Promise.all([
      store.latestSnapshot(),
      gcp ? part(h, "gcp", gcpBilling.configured, gcpLive) : null,
    ]);
    const aws = fromSnapshot(h, snapshot, "aws", awsCost.configured);
    const github = fromSnapshot(h, snapshot, "github", githubBilling.configured);
    return assemble({ snapshot, aws, gcp: gcpData, github });
  }

  function assemble({ snapshot, aws, gcp, github }) {
    const data = { aws, gcp, github };
    return {
      snapshot,
      data,
      configured: PROVIDERS.filter((p) => data[p] !== null),
      dailyRows: [...awsRows(aws?.daily), ...gcpRows(gcp?.daily), ...githubRows(github?.days)],
      monthlyRows: [...awsRows(aws?.monthly), ...gcpRows(gcp?.monthly), ...githubRows(github?.months)],
      lastDays: {
        aws: aws === null ? null : aws.lastDay ?? lastBilledDay(awsRows(aws.daily)),
        gcp: gcp === null ? null : gcp.lastDay ?? null,
        github: github === null ? null : github.lastDay ?? null,
      },
    };
  }

  /** Each provider's forecast for `month` (the current one), from what it offers: AWS's own, GCP's run-rate, GitHub's net to date. */
  function forecastsOf(loaded, month, mtd) {
    const { data, lastDays } = loaded;
    const out = { aws: null, gcp: null, github: null };
    if (data.aws !== null) {
      const f = data.aws.forecast;
      if (f && typeof f.remaining === "number" && monthOf(f.from) === month) out.aws = mtd.aws + f.remaining;
    }
    if (data.gcp !== null) out.gcp = runRateForecast(mtd.gcp, month, lastDays.gcp);
    if (data.github !== null) out.github = mtd.github;
    return out;
  }

  /**
   * The four KPI values and their previous periods over loaded data, for `kpis()` and the
   * snapshot: month to date against last month through the same day, the idle run-rate against
   * a week earlier, the last 30 days against the 30 before, the forecast against last month's total.
   */
  function kpiValues(loaded, today) {
    const { configured, dailyRows, monthlyRows } = loaded;
    if (configured.length === 0) return null;
    const month = monthOf(today);
    const prevMonth = addMonths(month, -1);
    const sumConfigured = (totals) => configured.reduce((n, p) => n + (totals[p] ?? 0), 0);
    const mtd = monthTotals(monthlyRows, month);
    const last = monthTotals(monthlyRows, prevMonth);
    const series = dailySeries(dailyRows, { today, configured });
    const idleNow = idleLines(dailyRows, { today });
    const idleBefore = idleLines(dailyRows, { today, shiftDays: 7 });
    const dom = today.slice(8, 10);
    const prevToDate = dailyRows.reduce((n, r) => (r.day && monthOf(r.day) === prevMonth && r.day.slice(8, 10) <= dom ? n + r.amount : n), 0);
    const last30 = trailingTotals(series.days, 30);
    const forecasts = forecastsOf(loaded, month, mtd);
    const known = Object.values(forecasts).filter((v) => v !== null);
    return {
      monthToDate: { value: cents(sumConfigured(mtd)), prev: cents(prevToDate) },
      idleRunRate: { value: idleNow.runRate, prev: idleBefore.runRate },
      last30: { value: last30.value, prev: last30.prev },
      forecast: { value: known.length > 0 ? cents(known.reduce((n, v) => n + v, 0)) : null, prev: cents(sumConfigured(last)) },
      series,
      idle: idleNow,
    };
  }

  const queries = {
    async summary(range = "month") {
      const h = hints();
      const today = isoDate(now());
      const loaded = await load(h);
      const { data, configured, monthlyRows, dailyRows, lastDays } = loaded;
      const months = monthsOf(range, today);
      const month = months.at(-1);
      const prevMonth = addMonths(month, -1);
      const current = month === monthOf(today);
      const mtd = monthTotals(monthlyRows, month);
      const last = monthTotals(monthlyRows, prevMonth);
      const forecasts = current ? forecastsOf(loaded, month, mtd) : { aws: null, gcp: null, github: null };
      const idle = idleLines(dailyRows, { today });
      const providers = PROVIDERS.map((p) => {
        const on = data[p] !== null;
        return {
          provider: p,
          label: PROVIDER_LABELS[p],
          mtd: on ? cents(mtd[p]) : null,
          forecast: on && forecasts[p] !== null ? cents(forecasts[p]) : null,
          lastMonth: on ? cents(last[p]) : null,
          lastDay: on ? lastDays[p] : null,
          ...(p === "github" ? { gross: on ? cents(monthGross(monthlyRows, month)) : null } : {}),
        };
      });
      // The totals sum the unrounded amounts, then round once, so they agree with the KPIs' to the cent.
      const sum = (totals) => cents(configured.reduce((n, p) => n + (totals[p] ?? 0), 0));
      const forecastKnown = providers.some((p) => p.forecast !== null);
      return withHints({
        at: new Date(now()).toISOString(),
        month,
        goalUsd,
        total: {
          mtd: configured.length > 0 ? sum(mtd) : null,
          forecast: current && forecastKnown ? sum(forecasts) : null,
          lastMonth: configured.length > 0 ? sum(last) : null,
          idleRunRate: configured.length > 0 ? idle.runRate : null,
        },
        providers,
      }, h);
    },

    async categories(range = "month") {
      const h = hints();
      const today = isoDate(now());
      const { monthlyRows } = await load(h);
      return withHints(categoriesTable(monthlyRows, monthsOf(range, today)), h);
    },

    async idle() {
      const h = hints();
      const today = isoDate(now());
      const { configured, dailyRows } = await load(h);
      if (configured.length === 0) return withHints({ runRate: null, goalUsd, asOf: today, lines: null }, h);
      const r = idleLines(dailyRows, { today });
      return withHints({ runRate: r.runRate, goalUsd, asOf: r.asOf, lines: r.lines }, h);
    },

    async daily() {
      const h = hints();
      const today = isoDate(now());
      const { configured, dailyRows } = await load(h);
      if (configured.length === 0) return withHints({ days: null }, h);
      return withHints({ days: dailySeries(dailyRows, { today, configured }).days }, h);
    },

    async activity(range = "month") {
      const h = hints();
      const today = isoDate(now());
      const { configured, monthlyRows } = await load(h);
      const months = new Set(monthsOf(range, today));
      return withHints({ items: activityItems(monthlyRows.filter((r) => months.has(r.month)), { configured }) }, h);
    },

    async sources() {
      const h = hints();
      const today = isoDate(now());
      const [snapshot, monthSnapshots, gcpLastDay] = await Promise.all([
        store.latestSnapshot(),
        store.listSnapshots(`${monthOf(today)}-01`, today),
        part(h, "gcp", gcpBilling.configured, () => gcpBilling.lastDay()),
      ]);
      const fin = snapshot?.finance ?? null;
      const snapshotAt = fin?.at ?? null;
      const calls = awsCost.configured ? monthSnapshots.reduce((n, s) => n + (Number(s.finance?.awsCalls ?? s.finance?.aws?.calls) || 0), 0) : null;
      const awsDays = fin?.aws ? awsRows(fin.aws.daily) : [];
      return withHints({
        sources: [
          {
            key: "aws", label: SOURCE_LABELS.aws, configured: awsCost.configured,
            lastDay: fin?.aws ? fin.aws.lastDay ?? lastBilledDay(awsDays) : null,
            snapshotAt: fin?.aws ? snapshotAt : null,
            callsThisMonth: calls, callCostUsd: calls === null ? null : cents(calls * CALL_COST_USD),
            note: "Two calls a day from the snapshot job, $0.01 each; a third for the forecast until the 28th.",
          },
          {
            key: "gcp", label: SOURCE_LABELS.gcp, configured: gcpBilling.configured,
            lastDay: gcpLastDay ?? null, snapshotAt: null, callsThisMonth: null, callCostUsd: null,
            note: `BigQuery, read live; rows from ${GCP_EXPORT_FROM} on.`,
          },
          {
            key: "github", label: SOURCE_LABELS.github, configured: githubBilling.configured,
            lastDay: fin?.github?.lastDay ?? null, snapshotAt: fin?.github ? snapshotAt : null, callsThisMonth: null, callCostUsd: null,
            note: "From the snapshot; public repositories bill $0.",
          },
        ],
      }, h);
    },

    async kpis() {
      const h = hints();
      const t = now();
      const today = isoDate(t);
      const [loaded, snapshots] = await Promise.all([load(h), store.listSnapshots(addDays(today, -7 * TREND_WEEKS + 1), today)]);
      const values = kpiValues(loaded, today);
      const points = snapshots.map((s) => ({ date: s.date, ...(s.finance?.kpi ?? {}) }));
      const kpi = (key, label, extra = {}) => ({
        key, label,
        value: values?.[key]?.value ?? null,
        prev: values?.[key]?.prev ?? null,
        unit: "USD",
        trend: weeklyTrend(points, key, today),
        ...extra,
      });
      const kpis = [
        kpi("monthToDate", "Month to date"),
        kpi("idleRunRate", `Idle run-rate, goal $${goalUsd}`, { good: "down" }),
        kpi("last30", "Last 30 days"),
        kpi("forecast", "Forecast"),
      ];
      let health;
      if (values === null) {
        const hint = h.notConfigured.aws ?? h.notConfigured.gcp ?? h.notConfigured.github ?? null;
        health = hint ? { status: "warning", note: `Not configured (${hint})` } : { status: "warning", note: "No finance data yet" };
        if (hint) for (const k of kpis) h.notConfigured[k.key] = hint;
      } else {
        health = financeHealth({ idleRunRate: values.idleRunRate.value, goalUsd, days: values.series.days, rows: loaded.dailyRows });
      }
      return withHints({ app: FINANCE_APP, at: new Date(t).toISOString(), kpis, health }, h);
    },

    /**
     * The daily snapshot's finance part, `{ finance: {...} }` for the day's document: the Cost
     * Explorer rows (two or three calls), GitHub's usage, the day's four KPI values, and the
     * hints. A source that fails is null with its error; a failure here never fails the snapshot.
     */
    async snapshotPart() {
      const h = hints();
      const t = now();
      const today = isoDate(t);
      let aws = null;
      let awsCalls = 0;
      if (!awsCost.configured) h.notConfigured.aws = SOURCE_ENV.aws;
      else {
        const failures = [];
        const attempt = async (p) => {
          try {
            const r = await p;
            awsCalls += r.calls;
            return r;
          } catch (error) {
            awsCalls += 1;
            log.error("admin: finance aws failed", error);
            failures.push(error instanceof Error ? error.message : String(error));
            return null;
          }
        };
        const [monthly, daily, forecast] = await Promise.all([attempt(awsCost.monthlyByUsage()), attempt(awsCost.dailyByUsage()), attempt(awsCost.forecast())]);
        if (monthly === null || daily === null) h.errors.aws = failures.join("; ");
        else {
          aws = { monthly: monthly.rows, daily: daily.rows, forecast: forecast?.forecast ?? null, calls: awsCalls, lastDay: lastBilledDay(awsRows(daily.rows)) };
          if (forecast === null) h.errors.awsForecast = failures.join("; ");
        }
      }
      const [github, gcp] = await Promise.all([
        part(h, "github", githubBilling.configured, () => githubBilling.usage()),
        part(h, "gcp", gcpBilling.configured, gcpLive),
      ]);
      const values = kpiValues(assemble({ snapshot: null, aws, gcp, github }), today);
      const kpi = values === null
        ? { monthToDate: null, idleRunRate: null, last30: null, forecast: null }
        : { monthToDate: values.monthToDate.value, idleRunRate: values.idleRunRate.value, last30: values.last30.value, forecast: values.forecast.value };
      return {
        finance: withHints({
          at: new Date(t).toISOString(),
          aws,
          github: github === null ? null : { months: github.months, days: github.days, lastDay: github.lastDay },
          awsCalls,
          kpi,
        }, h),
      };
    },
  };

  return queries;
}
