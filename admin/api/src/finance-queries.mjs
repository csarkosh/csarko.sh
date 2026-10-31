/**
 * The finance page's routes under `/finance/admin/*`: the index card, the ten queries and the
 * one manual series (`admin/CONTRACT.md`, the Finance section), plus `snapshotPart()`, the step
 * the daily snapshot runs. Tested with fake collectors and the in-memory store, like queries.mjs.
 *
 * Who is read when. AWS Cost Explorer costs $0.01 a call, so only `snapshotPart()` calls it
 * (two calls a day, a third for the forecast until the 28th) and stores the rows under the day's
 * snapshot as `finance.aws`; GitHub's usage goes under `finance.github` and fal's credit balance
 * under `finance.fal` from the same job; Modal's billing report is written under `finance.modal`
 * by its own job (`admin/finance-modal/`, Python, since Modal has no REST billing endpoint), and
 * Claude Code's transcript usage under `finance.claude` by `tools/claude-usage-sync.py` on the Mac
 * (the subscription fee itself, the spend, is the manual series `claude-subscription`).
 * Every query reads those from the latest snapshot, fal's spend from the run of snapshots (a
 * day's spend is the balance's fall, `finance/fal.mjs`), GCP live from BigQuery (free at this
 * size) and the film ledgers live from their bucket (cached five minutes). The snapshot also
 * stores the KPI values of the day (`finance.kpi`), which the index card's twelve-week
 * trends read, as the csarko.sh card's do.
 *
 * Income (Cyrus, 2026-10-30): donations arrive through Stripe and are read live with a restricted
 * key (`collectors/stripe.mjs`, cached five minutes), shaped by `finance/income.mjs` into amounts
 * and days only. `summary` carries them as `income` and `total.net`, the `income` query is the
 * page's card, `donations` is the third KPI, and the snapshot stores the day's net
 * (`finance.kpi.donations`) and a small `finance.stripe` summary for the trend. Tips by door
 * (2026-10-30): the snapshot also runs the donate step (`donate/step.mjs`), which every seven days
 * makes new Stripe prices from the last 30 days' spend (amended Oct 31; it was once a month from the
 * month's) and stores its record as `finance.donate` (carried forward on the days it does nothing);
 * the `income` query splits the range by door.
 *
 * The shaping is pure, in `src/finance/`: categories, rows, months (the range and the
 * categories table), idle, daily, activity, projects, films, fal (the series), claude (the fee's
 * rows and the usage), income (the donations), kpis (health). This file only fetches and assembles.
 */

import { parseRange, monthsOf, categoriesTable, monthTotals, monthGross, runRateForecast, GCP_EXPORT_FROM } from "./finance/months.mjs";
import { PROVIDERS, PROVIDER_LABELS, awsRows, gcpRows, githubRows, modalRows, falRows, cents, monthOf, addMonths, lastBilledDay } from "./finance/rows.mjs";
import { idleLines } from "./finance/idle.mjs";
import { dailySeries, trailingTotals, SERIES_DAYS } from "./finance/daily.mjs";
import { activityItems } from "./finance/activity.mjs";
import { projectsTable } from "./finance/projects.mjs";
import { filmsOf } from "./finance/films.mjs";
import { falSeries } from "./finance/fal.mjs";
import { CLAUDE_SUBSCRIPTION_KEY, subscriptionSeries, subscriptionFor, claudeRows, claudeUsage, usageForMonths, usageDays } from "./finance/claude.mjs";
import { financeHealth } from "./finance/kpis.mjs";
import { donationsOf, incomeDays, incomeMonths, incomeFor, incomeByDoor, recentOf, payoutsOf, balanceOf, lastDonationDay, INCOME_DAYS, RECENT_COUNT } from "./finance/income.mjs";
import { CALL_COST_USD } from "./collectors/aws-cost.mjs";
import { weeklyTrend, TREND_WEEKS } from "./queries.mjs";
import { addDays, isoDate } from "./time.mjs";

export { parseRange };
export const FINANCE_QUERY_NAMES = ["summary", "categories", "idle", "daily", "activity", "sources", "projects", "films", "claude", "income"];
/** The hand-entered series the finance page writes (`POST /finance/admin/manual/<key>`): the claude.ai subscription's monthly fee. */
export const FINANCE_MANUAL_KEYS = [CLAUDE_SUBSCRIPTION_KEY];
export const FINANCE_APP = "finance";
/** What configures each source, for `notConfigured`: an environment variable, except Modal's (the job's secret: the API reports it from the snapshot) and Claude Code's (the manual series the fee is entered in). */
export const SOURCE_ENV = { aws: "AWS_COST_ROLE_ARN", gcp: "BILLING_DATASET", github: "GITHUB_TOKEN", modal: "MODAL_TOKEN_ID", fal: "FAL_ADMIN_KEY", claude: CLAUDE_SUBSCRIPTION_KEY, ledgers: "FILM_LEDGERS_BUCKET", stripe: "STRIPE_KEY", donate: "STRIPE_WRITE_KEY" };
export const SOURCE_LABELS = { aws: "AWS Cost Explorer", gcp: "Google Cloud billing export", github: "GitHub usage", modal: "Modal billing report", fal: "fal credit balance", claude: "Claude Code transcripts", ledgers: "Film ledgers", stripe: "Stripe donations", donate: "Tip prices" };
/** The Sources card's note for Stripe: the privacy rule, in one line. */
export const STRIPE_NOTE = "Read live from Stripe with a restricted key; amounts only, never who gave.";
/** The error when the subscription is entered but no snapshot carries the transcripts' usage. */
export const CLAUDE_NO_SYNC = "No usage sync yet: run tools/claude-usage-sync.py";
/** The providers whose forecast is a real one (Cost Explorer's, GCP's run-rate); GitHub's net to date, Modal's net to date, fal's run-rate and Claude Code's fee count only beside one of these. */
const REAL_FORECASTS = ["aws", "gcp"];

export function isFinanceQueryName(name) {
  return FINANCE_QUERY_NAMES.includes(name);
}

export function isFinanceManualKey(key) {
  return FINANCE_MANUAL_KEYS.includes(key);
}

const quiet = { configured: false };

export function createFinanceQueries({ awsCost, gcpBilling, githubBilling, fal = quiet, ledgers = quiet, stripe = quiet, donate = null, modalConfigured = false, store, now = Date.now, log = console }) {
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

  /** Where the export's rows start (Google backfills the months before it was switched on), the
   * day it was switched on when the export cannot say or is not configured. */
  const exportFirstDay = async () => {
    if (!gcpBilling.configured) return GCP_EXPORT_FROM;
    try {
      return (await gcpBilling.firstDay()) ?? GCP_EXPORT_FROM;
    } catch {
      return GCP_EXPORT_FROM;
    }
  };

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
   * Modal's part is written by its own job, so whether it is configured is read from the
   * snapshot: a part present with rows is the report; one present as `{ at, error }` is the job's
   * failure; one absent is not configured unless `MODAL_CONFIGURED=1` says the job exists, in
   * which case it has not run yet.
   */
  function modalFromSnapshot(h, snapshot) {
    const fin = snapshot?.finance ?? null;
    const m = fin?.modal ?? null;
    if (m === null) {
      if (!modalConfigured) h.notConfigured.modal = SOURCE_ENV.modal;
      else h.errors.modal = fin === null ? "No snapshot yet: the daily job has not run" : `The latest snapshot (${snapshot.date}) has no ${SOURCE_LABELS.modal}`;
      return null;
    }
    if (typeof m.error === "string" || !Array.isArray(m.rows)) {
      h.errors.modal = typeof m.error === "string" ? m.error : `The latest snapshot (${snapshot.date}) has a ${SOURCE_LABELS.modal} without rows`;
      return null;
    }
    return m;
  }

  /** The snapshots fal's series reads: the last 60 days, stretched back to the first of the previous month so `range=last` sees the whole month. */
  const falWindow = (today) => {
    const sixty = addDays(today, -(SERIES_DAYS - 1));
    const prev = `${addMonths(monthOf(today), -1)}-01`;
    return sixty < prev ? sixty : prev;
  };

  /**
   * fal's part: the series from the snapshots that carry a balance (`finance/fal.mjs`), or null
   * with `notConfigured` without the key, or with an error when no snapshot has read it yet.
   */
  function falFromSnapshots(h, snapshots, extra = null) {
    if (!fal.configured) {
      h.notConfigured.fal = SOURCE_ENV.fal;
      return null;
    }
    const series = falSeries(extra === null ? snapshots : [...snapshots, extra]);
    if (series === null) {
      h.errors.fal = "No snapshot yet: the daily job has not read the balance";
      return null;
    }
    return series;
  }

  /**
   * Claude Code's part: `{ series, usage }`, the subscription series (the spend, `finance/claude.mjs`)
   * and the usage part of the latest snapshot (the value), or null with `notConfigured` when no fee
   * has been entered. An entry with no part yet is the fee alone, `usage` null with `errors.claude`
   * asking for a sync.
   */
  function claudeFrom(h, snapshot, rawSeries) {
    const series = subscriptionSeries(rawSeries);
    if (series.length === 0) {
      h.notConfigured.claude = SOURCE_ENV.claude;
      return null;
    }
    const usage = claudeUsage(snapshot?.finance?.claude);
    if (usage === null) h.errors.claude = CLAUDE_NO_SYNC;
    return { series, usage };
  }

  /** The claude row's extras for `summary`: the month's list-price value and messages, null without a sync. */
  const claudeValue = (claude, month) => {
    const u = claude?.usage ? usageForMonths(claude.usage, [month]) : null;
    return { listValue: u === null ? null : u.listValue, messages: u === null ? null : u.messages };
  };

  /** Unix seconds at the UTC start of a day. */
  const unixOf = (day) => Math.floor(Date.parse(`${day}T00:00:00Z`) / 1000);

  /**
   * The donations: `{ rows, lastDay, balance, payouts }` read live from Stripe, the transactions
   * since the first of the month twelve months back (the 13-month range and the newest 20 are
   * both inside it) and the payouts of the last 60 days when asked for; null with
   * `notConfigured.stripe` without the key, or with `errors.stripe` when Stripe refused.
   */
  function loadIncome(h, today, { payouts = false } = {}) {
    return part(h, "stripe", stripe.configured, async () => {
      const since = unixOf(`${addMonths(monthOf(today), -12)}-01`);
      const [transactions, balance, payoutList] = await Promise.all([
        stripe.transactions(since),
        stripe.balance(),
        payouts ? stripe.payouts(unixOf(addDays(today, -(INCOME_DAYS - 1)))) : null,
      ]);
      const rows = donationsOf(transactions);
      return { rows, lastDay: lastDonationDay(rows), balance: balanceOf(balance), payouts: payoutList === null ? null : payoutsOf(payoutList) };
    });
  }

  /** `summary.income` for `month`: the month's and the previous month's totals, the newest day and the balance. */
  const incomeSummary = (income, month) => {
    if (income === null) return null;
    const of = (m) => {
      const { gross, fees, net, count } = incomeFor(income.rows, [m]);
      return { gross, fees, net, count };
    };
    return { mtd: of(month), lastMonth: of(addMonths(month, -1)), lastDay: income.lastDay, balance: income.balance };
  };

  /**
   * Everything a query may need, loaded once: the latest snapshot, each source's data or null,
   * and the line rows (rows.mjs) by day and by month across the sources that answered.
   */
  async function load(h) {
    const today = isoDate(now());
    const [snapshot, gcpData, snapshots, claudeSeries] = await Promise.all([
      store.latestSnapshot(),
      part(h, "gcp", gcpBilling.configured, gcpLive),
      fal.configured ? store.listSnapshots(falWindow(today), today) : [],
      store.getManual(CLAUDE_SUBSCRIPTION_KEY),
    ]);
    const aws = fromSnapshot(h, snapshot, "aws", awsCost.configured);
    const github = fromSnapshot(h, snapshot, "github", githubBilling.configured);
    const modal = modalFromSnapshot(h, snapshot);
    const falData = falFromSnapshots(h, snapshots);
    const claude = claudeFrom(h, snapshot, claudeSeries);
    return assemble({ snapshot, aws, gcp: gcpData, github, modal, fal: falData, claude, today });
  }

  function assemble({ snapshot, aws, gcp, github, modal, fal: falData, claude, today }) {
    const data = { aws, gcp, github, modal, fal: falData, claude };
    return {
      snapshot,
      data,
      configured: PROVIDERS.filter((p) => data[p] !== null),
      dailyRows: [...awsRows(aws?.daily), ...gcpRows(gcp?.daily), ...githubRows(github?.days), ...modalRows(modal, "daily"), ...falRows(falData?.days, "daily"), ...claudeRows(claude?.series, "daily", { today })],
      monthlyRows: [...awsRows(aws?.monthly), ...gcpRows(gcp?.monthly), ...githubRows(github?.months), ...modalRows(modal, "monthly"), ...falRows(falData?.days, "monthly"), ...claudeRows(claude?.series, "monthly", { today })],
      lastDays: {
        aws: aws === null ? null : aws.lastDay ?? lastBilledDay(awsRows(aws.daily)),
        gcp: gcp === null ? null : gcp.lastDay ?? null,
        github: github === null ? null : github.lastDay ?? null,
        modal: modal === null ? null : modal.lastDay ?? lastBilledDay(modalRows(modal, "daily").map((r) => ({ ...r, amount: r.gross }))),
        fal: falData === null ? null : falData.lastDay,
        claude: claude === null ? null : claude.usage?.lastDay ?? null,
      },
    };
  }

  /**
   * Each provider's forecast for `month` (the current one), from what it offers: AWS's own,
   * GCP's run-rate, GitHub's and Modal's net to date, fal's run-rate over the days it has a reading
   * for, Claude Code's the month's fee (flat, so the month to date is the month).
   */
  function forecastsOf(loaded, month, mtd) {
    const { data, lastDays } = loaded;
    const out = Object.fromEntries(PROVIDERS.map((p) => [p, null]));
    if (data.aws !== null) {
      const f = data.aws.forecast;
      if (f && typeof f.remaining === "number" && monthOf(f.from) === month) out.aws = mtd.aws + f.remaining;
    }
    if (data.gcp !== null) out.gcp = runRateForecast(mtd.gcp, month, lastDays.gcp);
    if (data.github !== null) out.github = mtd.github;
    if (data.modal !== null) out.modal = mtd.modal;
    if (data.fal !== null) out.fal = runRateForecast(mtd.fal, month, lastDays.fal);
    if (data.claude !== null) out.claude = mtd.claude;
    return out;
  }

  /** The forecasts summed, or null unless one of them is a real one: alone, a net to date would read $0.00 after the 28th, when Cost Explorer's is not asked for. */
  const sumForecasts = (forecasts) => {
    if (!REAL_FORECASTS.some((p) => forecasts[p] !== null)) return null;
    return cents(Object.values(forecasts).reduce((n, v) => n + (v ?? 0), 0));
  };

  /** The `donations` KPI over the income: the month's net against last month's, null without Stripe. */
  function donationsKpi(income, today) {
    if (income === null) return null;
    const month = monthOf(today);
    return { value: incomeFor(income.rows, [month]).net, prev: incomeFor(income.rows, [addMonths(month, -1)]).net };
  }

  /**
   * The spend KPI values and their previous periods over loaded data, for `kpis()` and the
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
    return {
      monthToDate: { value: cents(sumConfigured(mtd)), prev: cents(prevToDate) },
      idleRunRate: { value: idleNow.runRate, prev: idleBefore.runRate },
      last30: { value: last30.value, prev: last30.prev },
      forecast: { value: sumForecasts(forecastsOf(loaded, month, mtd)), prev: cents(sumConfigured(last)) },
      series,
      idle: idleNow,
    };
  }

  const queries = {
    async summary(range = "month") {
      const h = hints();
      const today = isoDate(now());
      const [loaded, income] = await Promise.all([load(h), loadIncome(h, today)]);
      const { data, configured, monthlyRows, dailyRows, lastDays } = loaded;
      const months = monthsOf(range, today);
      const month = months.at(-1);
      const prevMonth = addMonths(month, -1);
      const current = month === monthOf(today);
      const mtd = monthTotals(monthlyRows, month);
      const last = monthTotals(monthlyRows, prevMonth);
      const forecasts = current ? forecastsOf(loaded, month, mtd) : Object.fromEntries(PROVIDERS.map((p) => [p, null]));
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
          ...(p === "github" ? { gross: on ? cents(monthGross(monthlyRows, month, "github")) : null } : {}),
          ...(p === "modal" ? { gross: on ? cents(monthGross(monthlyRows, month, "modal")) : null, credits: on ? data.modal.credits ?? null : null } : {}),
          ...(p === "fal" ? { balance: on ? data.fal.balance : null } : {}),
          ...(p === "claude" ? claudeValue(on ? data.claude : null, month) : {}),
        };
      });
      // The totals sum the unrounded amounts, then round once, so they agree with the KPIs' to the cent.
      const sum = (totals) => cents(configured.reduce((n, p) => n + (totals[p] ?? 0), 0));
      const incomeOut = incomeSummary(income, month);
      return withHints({
        at: new Date(now()).toISOString(),
        month,
        total: {
          mtd: configured.length > 0 ? sum(mtd) : null,
          forecast: current ? sumForecasts(forecasts) : null,
          lastMonth: configured.length > 0 ? sum(last) : null,
          idleRunRate: configured.length > 0 ? idle.runRate : null,
          // What the month cost after donations: the spend (0 with no spend source) less the month's net income.
          net: incomeOut === null ? null : cents((configured.length > 0 ? sum(mtd) : 0) - incomeOut.mtd.net),
        },
        providers,
        income: incomeOut,
      }, h);
    },

    /**
     * The donations card: the range's totals and average, the last 60 days, thirteen months, the
     * newest 20 donations (amounts and days, nothing else), the last 60 days' payouts and the
     * balance. Null throughout with the hint when Stripe is not configured or refused.
     */
    async income(range = "month") {
      const h = hints();
      const today = isoDate(now());
      const months = monthsOf(range, today);
      const month = months.at(-1);
      const income = await loadIncome(h, today, { payouts: true });
      if (income === null) {
        return withHints({ month, gross: null, fees: null, net: null, count: null, average: null, lastDay: null, days: null, months: null, recent: null, byDoor: null, prices: null, payouts: null, balance: null }, h);
      }
      const snapshot = await store.latestSnapshot();
      const record = snapshot?.finance?.donate ?? null;
      return withHints({
        month,
        ...incomeFor(income.rows, months),
        lastDay: income.lastDay,
        days: incomeDays(income.rows, { today }),
        months: incomeMonths(income.rows, { today }),
        recent: recentOf(income.rows, RECENT_COUNT),
        byDoor: incomeByDoor(income.rows, months),
        prices: record === null ? null : { period: record.period, pool: record.pool, at: record.at },
        payouts: income.payouts,
        balance: income.balance,
      }, h);
    },

    async categories(range = "month") {
      const h = hints();
      const today = isoDate(now());
      const [{ monthlyRows }, firstDay] = await Promise.all([load(h), exportFirstDay()]);
      return withHints(categoriesTable(monthlyRows, monthsOf(range, today), { exportFrom: firstDay }), h);
    },

    async projects(range = "month") {
      const h = hints();
      const today = isoDate(now());
      const [{ monthlyRows }, firstDay] = await Promise.all([load(h), exportFirstDay()]);
      return withHints(projectsTable(monthlyRows, monthsOf(range, today), { exportFrom: firstDay }), h);
    },

    async idle() {
      const h = hints();
      const today = isoDate(now());
      const { configured, dailyRows } = await load(h);
      if (configured.length === 0) return withHints({ runRate: null, asOf: today, lines: null }, h);
      const r = idleLines(dailyRows, { today });
      return withHints({ runRate: r.runRate, asOf: r.asOf, lines: r.lines }, h);
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
      const { configured, monthlyRows, data } = await load(h);
      const months = monthsOf(range, today);
      const inRange = new Set(months);
      const claude = data.claude?.usage ? usageForMonths(data.claude.usage, months) : null;
      return withHints({ items: activityItems(monthlyRows.filter((r) => inRange.has(r.month)), { configured, claudeUsage: claude }) }, h);
    },

    /**
     * Claude Code's own card: the month's fee and when it was entered, the range's list-price
     * value and messages by model, and the last 60 days of use. Reads the snapshot and the series
     * only, never GCP. The usage is shown even before a fee is entered, with the hint.
     */
    async claude(range = "month") {
      const h = hints();
      const today = isoDate(now());
      const [snapshot, rawSeries] = await Promise.all([store.latestSnapshot(), store.getManual(CLAUDE_SUBSCRIPTION_KEY)]);
      const months = monthsOf(range, today);
      const month = months.at(-1);
      const series = subscriptionSeries(rawSeries);
      if (series.length === 0) h.notConfigured.claude = SOURCE_ENV.claude;
      const sub = subscriptionFor(series, month);
      const usage = claudeUsage(snapshot?.finance?.claude);
      if (usage === null && series.length > 0) h.errors.claude = CLAUDE_NO_SYNC;
      const u = usage === null ? null : usageForMonths(usage, months);
      return withHints({
        month,
        subscriptionUsd: sub === null ? null : cents(sub.value),
        enteredAt: sub === null ? null : sub.at,
        listValue: u === null ? null : u.listValue,
        messages: u === null ? null : u.messages,
        lastDay: usage === null ? null : usage.lastDay,
        syncedAt: usage === null ? null : usage.at,
        files: usage === null ? null : usage.files,
        byModel: u === null ? null : u.byModel,
        days: usage === null ? null : usageDays(usage, { today }),
      }, h);
    },

    /** Appends `{ at, value }` to a manual series (`claude-subscription`: the fee, so it applies from this month) and answers the entry. */
    async manual(key, value) {
      const at = new Date(now()).toISOString();
      await store.appendManual(key, { at, value });
      return { key, value, at };
    },

    async films() {
      const h = hints();
      const list = await part(h, "ledgers", ledgers.configured, () => ledgers.list());
      if (list === null) return withHints({ asOf: null, films: null }, h);
      return withHints(filmsOf(list), h);
    },

    async sources() {
      const h = hints();
      const today = isoDate(now());
      const [snapshot, monthSnapshots, gcpLastDay, gcpFirstDay, falSnapshots, ledgerList, claudeSeries, income] = await Promise.all([
        store.latestSnapshot(),
        store.listSnapshots(`${monthOf(today)}-01`, today),
        part(h, "gcp", gcpBilling.configured, () => gcpBilling.lastDay()),
        exportFirstDay(),
        fal.configured ? store.listSnapshots(falWindow(today), today) : [],
        ledgers.configured ? part(h, "ledgers", true, () => ledgers.list()) : null,
        store.getManual(CLAUDE_SUBSCRIPTION_KEY),
        loadIncome(h, today),
      ]);
      const fin = snapshot?.finance ?? null;
      const snapshotAt = fin?.at ?? null;
      const calls = awsCost.configured ? monthSnapshots.reduce((n, s) => n + (Number(s.finance?.awsCalls ?? s.finance?.aws?.calls) || 0), 0) : null;
      const awsDays = fin?.aws ? awsRows(fin.aws.daily) : [];
      const modal = fin?.modal ?? null;
      const modalOk = modal !== null && Array.isArray(modal.rows);
      const falData = fal.configured ? falSeries(falSnapshots) : null;
      const claudeOn = subscriptionSeries(claudeSeries).length > 0;
      const claudePart = claudeUsage(fin?.claude);
      const none = { callsThisMonth: null, callCostUsd: null };
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
            lastDay: gcpLastDay ?? null, snapshotAt: null, ...none,
            note: `BigQuery, read live; rows from ${gcpFirstDay} on.`,
          },
          {
            key: "github", label: SOURCE_LABELS.github, configured: githubBilling.configured,
            lastDay: fin?.github?.lastDay ?? null, snapshotAt: fin?.github ? snapshotAt : null, ...none,
            note: "From the snapshot; public repositories bill $0.",
          },
          {
            key: "modal", label: SOURCE_LABELS.modal, configured: modalConfigured || modal !== null,
            lastDay: modalOk ? modal.lastDay ?? null : null, snapshotAt: modal !== null ? modal.at ?? snapshotAt : null, ...none,
            note: "The workspace report, per app per day, written by the daily job.",
          },
          {
            key: "fal", label: SOURCE_LABELS.fal, configured: fal.configured,
            lastDay: falData?.lastDay ?? null, snapshotAt: fin?.fal ? snapshotAt : null, ...none,
            note: "The balance once a day; a day's spend is its fall.",
          },
          {
            key: "claude", label: SOURCE_LABELS.claude, configured: claudeOn,
            lastDay: claudePart === null ? null : claudePart.lastDay, snapshotAt: claudePart === null ? null : claudePart.at, ...none,
            note: "Local transcripts, synced by tools/claude-usage-sync.py on the Mac; priced at API list rates as the plan's value.",
          },
          {
            key: "ledgers", label: SOURCE_LABELS.ledgers, configured: ledgers.configured,
            lastDay: null, snapshotAt: ledgerList === null ? null : filmsOf(ledgerList).asOf, ...none,
            note: ledgerList === null ? "The film pipeline's priced calls, one ledger a film, in the bucket." : `${ledgerList.length} ledger${ledgerList.length === 1 ? "" : "s"} in the bucket; the time is the newest file's.`,
          },
          {
            key: "stripe", label: SOURCE_LABELS.stripe, configured: stripe.configured,
            lastDay: income === null ? null : income.lastDay, snapshotAt: null, ...none,
            note: STRIPE_NOTE,
          },
        ],
      }, h);
    },

    async kpis() {
      const h = hints();
      const t = now();
      const today = isoDate(t);
      const [loaded, snapshots, income] = await Promise.all([load(h), store.listSnapshots(addDays(today, -7 * TREND_WEEKS + 1), today), loadIncome(h, today)]);
      const values = kpiValues(loaded, today);
      const donations = donationsKpi(income, today);
      const points = snapshots.map((s) => ({ date: s.date, ...(s.finance?.kpi ?? {}) }));
      const kpi = (key, label, from, extra = {}) => ({
        key, label,
        value: from?.[key]?.value ?? null,
        prev: from?.[key]?.prev ?? null,
        unit: "USD",
        trend: weeklyTrend(points, key, today),
        ...extra,
      });
      const kpis = [
        kpi("monthToDate", "Month to date", values),
        kpi("idleRunRate", "Idle run-rate", values, { good: "down" }),
        kpi("donations", "Donations, net", { donations }, { good: "up" }),
        kpi("forecast", "Forecast", values),
      ];
      // The tile says what would fill it: the spend KPIs name the first missing spend source, the donations tile the Stripe key.
      if (!stripe.configured) h.notConfigured.donations = SOURCE_ENV.stripe;
      let health;
      if (values === null) {
        const hint = PROVIDERS.map((p) => h.notConfigured[p]).find((v) => v) ?? null;
        health = hint ? { status: "warning", note: `Not configured (${hint})` } : { status: "warning", note: "No finance data yet" };
        if (hint) for (const k of kpis) if (k.key !== "donations") h.notConfigured[k.key] = hint;
      } else {
        health = financeHealth({ errors: h.errors, days: values.series.days, rows: loaded.dailyRows, configured: loaded.configured });
      }
      return withHints({ app: FINANCE_APP, at: new Date(t).toISOString(), kpis, health }, h);
    },

    /**
     * The daily snapshot's finance part, `{ finance: {...} }` for the day's document: the Cost
     * Explorer rows (two or three calls), GitHub's usage, fal's balance, Stripe's month to date
     * (`stripe = { at, mtdNet, count, lastDay }`, read live, for the trend), the day's KPI values,
     * and the hints. A source that fails is null with its error; a failure here never fails the
     * snapshot. The store merges a snapshot at the top level, so `finance` is replaced whole: the
     * Modal part its own job wrote into today's document earlier is carried over, and so is the
     * Claude Code part the Mac's sync wrote.
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
      const [github, gcp, falReading, latest, snapshots, claudeSeries, income] = await Promise.all([
        part(h, "github", githubBilling.configured, () => githubBilling.usage()),
        part(h, "gcp", gcpBilling.configured, gcpLive),
        part(h, "fal", fal.configured, () => fal.balance()),
        store.latestSnapshot(),
        fal.configured ? store.listSnapshots(falWindow(today), addDays(today, -1)) : [],
        store.getManual(CLAUDE_SUBSCRIPTION_KEY),
        loadIncome(h, today),
      ]);
      const donations = donationsKpi(income, today);
      const stripePart = income === null ? null : { at: new Date(t).toISOString(), mtdNet: donations.value, count: incomeFor(income.rows, [monthOf(today)]).count, lastDay: income.lastDay };
      const falPart = falReading === null ? null : { at: new Date(t).toISOString(), balance: falReading.balance, currency: falReading.currency, lastDay: today };
      // Today's document may already hold Modal's part (its job runs first) and Claude Code's (the Mac's sync); keep both, and read them for the KPIs.
      const todays = latest !== null && latest.date === today ? latest : null;
      const modalPart = todays?.finance?.modal ?? null;
      // The usage sync runs on the Mac when Cyrus runs it, not daily, so a new day's document
      // carries the newest part forward until the next sync (its `at` says how old it is).
      const claudePart = todays?.finance?.claude ?? latest?.finance?.claude ?? null;
      const modalHints = hints();
      const modal = modalFromSnapshot(modalHints, todays);
      const falHints = hints();
      const falData = falPart === null ? null : falFromSnapshots(falHints, snapshots, { date: today, finance: { fal: falPart } });
      // The fee counts in the day's KPIs; a missing sync is not the job's failure, so its hints stay out of the snapshot.
      const claude = claudeFrom(hints(), claudePart === null ? todays : { ...todays, finance: { ...(todays?.finance ?? {}), claude: claudePart } }, claudeSeries);
      const loaded = assemble({ snapshot: null, aws, gcp, github, modal, fal: falData, claude, today });
      const values = kpiValues(loaded, today);
      // A provider whose read failed has a partial month; the step holds off on it (`donate/step.mjs`).
      const failed = PROVIDERS.filter((p) => h.errors[p] !== undefined || modalHints.errors[p] !== undefined);
      // A due turn also waits while GCP's export has no rows through two days before the window's end.
      const donateOut = donate === null ? null : await part(h, "donate", donate.configured, () =>
        donate.run({ dailyRows: loaded.dailyRows, failed, today, gcpConfigured: gcpBilling.configured, gcpLastDay: loaded.lastDays.gcp }));
      // last30 left the card (2026-10-30) but stays in the day's values, so its history is unbroken should it return.
      const kpi = {
        ...(values === null
          ? { monthToDate: null, idleRunRate: null, last30: null, forecast: null }
          : { monthToDate: values.monthToDate.value, idleRunRate: values.idleRunRate.value, last30: values.last30.value, forecast: values.forecast.value }),
        donations: donations === null ? null : donations.value,
      };
      return {
        finance: withHints({
          at: new Date(t).toISOString(),
          aws,
          github: github === null ? null : { months: github.months, days: github.days, lastDay: github.lastDay },
          fal: falPart,
          stripe: stripePart,
          ...(modalPart !== null ? { modal: modalPart } : {}),
          ...(claudePart !== null ? { claude: claudePart } : {}),
          donate: donateOut?.record ?? latest?.finance?.donate ?? null,
          awsCalls,
          kpi,
        }, h),
      };
    },
  };

  return queries;
}
