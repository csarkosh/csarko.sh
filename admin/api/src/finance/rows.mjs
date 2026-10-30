/**
 * The one row shape every finance function works over, and how each source becomes it:
 *
 *   { provider, day | month, service, line, where, category, amount, quantity, unit, gross }
 *
 * `provider` is `aws`, `gcp`, `github`, `modal`, `fal` or `claude`; `day` (YYYY-MM-DD, the
 * provider's UTC billing day) on a daily row and `month` (YYYY-MM) on a monthly one; `line` is the
 * usage type, SKU, GitHub SKU, Modal app, fal's one line or the claude.ai subscription; `where` the
 * AWS region, the GCP project id, the Modal app, `subscription` or null; `amount` US dollars net of credits; `quantity` in `unit`; `gross` what GitHub
 * would have charged on private repositories, or a Modal app's usage before the plan's included
 * credits (null elsewhere); `repo` the GitHub repository (null elsewhere). Amounts are kept
 * unrounded here and rounded to cents where the answer is shaped.
 *
 * The sources: Cost Explorer rows from the daily snapshot (`collectors/aws-cost.mjs`), the GCP
 * export's rows from BigQuery (`collectors/gcp-billing.mjs`), GitHub's usage items from the
 * snapshot (`collectors/github-billing.mjs`), Modal's billing report from the snapshot (written by
 * the Python job in `admin/finance-modal/`), fal's credit balance read once a day into the
 * snapshot (`collectors/fal.mjs`, the series derived in `fal.mjs` here), and Claude Code's
 * subscription fee from the hand-entered series (`claude.mjs` here, which makes its rows).
 */

import { categorize } from "./categories.mjs";

export const PROVIDERS = ["aws", "gcp", "github", "modal", "fal", "claude"];
export const PROVIDER_LABELS = { aws: "AWS", gcp: "Google Cloud", github: "GitHub", modal: "Modal", fal: "fal", claude: "Claude Code" };

/** Dollars to cents, as a number; -0 and NaN read as 0. */
export function cents(x) {
  if (typeof x !== "number" || !Number.isFinite(x)) return 0;
  const r = Math.round(x * 100) / 100;
  return r === 0 ? 0 : r;
}

/** Four decimals, for a per-day rate or a unit price. */
export function fine(x) {
  if (typeof x !== "number" || !Number.isFinite(x)) return 0;
  const r = Math.round(x * 10_000) / 10_000;
  return r === 0 ? 0 : r;
}

const num = (v) => {
  const n = typeof v === "number" ? v : v === null || v === undefined || v === "" ? NaN : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/* ---- months and days ---- */

/** `2026-10` of a `2026-10-29` date. */
export const monthOf = (day) => String(day).slice(0, 7);

export function addMonths(month, n) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function daysInMonth(month) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** The months from `from` to `to` inclusive. */
export function monthsBetween(from, to) {
  const out = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m);
  return out;
}

/* ---- AWS ---- */

const REGION_CODES = {
  USE1: "us-east-1", USE2: "us-east-2", USW1: "us-west-1", USW2: "us-west-2", CAN1: "ca-central-1",
  EUW1: "eu-west-1", EUW2: "eu-west-2", EUW3: "eu-west-3", EUC1: "eu-central-1", EUN1: "eu-north-1",
  APN1: "ap-northeast-1", APN2: "ap-northeast-2", APS1: "ap-southeast-1", APS2: "ap-southeast-2", APS3: "ap-south-1",
  SAE1: "sa-east-1", MES1: "me-south-1", AFS1: "af-south-1",
};
const GLOBAL_SERVICE = /Route 53|Registrar|^Tax$/;

/**
 * The region an AWS usage type bills in: its prefix (`USW2-`, `us-west-2-`), else `global` for
 * Route 53's and the registrar's lines and tax, else us-east-1, where an unprefixed usage type
 * bills.
 */
export function awsRegionOf(usageType, service = "") {
  const code = /^([A-Z]{3}\d)-/.exec(usageType);
  if (code) return REGION_CODES[code[1]] ?? code[1].toLowerCase();
  const name = /^([a-z]{2}-[a-z]+-\d)-/.exec(usageType);
  if (name) return name[1];
  if (GLOBAL_SERVICE.test(service) || /^(HostedZone|DNS-Queries|Route53-Domains|Tax)$/.test(usageType)) return "global";
  return "us-east-1";
}

/** The snapshot's Cost Explorer rows (`{ day | month, service, line, amount, quantity, unit }`) as line rows. */
export function awsRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((r) => {
    const service = String(r.service ?? "");
    const line = String(r.line ?? "");
    return {
      provider: "aws",
      ...(r.day ? { day: r.day } : { month: r.month }),
      service,
      line,
      where: awsRegionOf(line, service),
      category: categorize({ provider: "aws", service, line }),
      amount: num(r.amount),
      quantity: num(r.quantity),
      unit: r.unit ?? null,
      gross: null,
      repo: null,
    };
  });
}

/* ---- GCP ---- */

/** The export's rows from BigQuery (`{ day | month, project, service, sku, net, amount, unit }`) as line rows. */
export function gcpRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((r) => {
    const service = String(r.service ?? "");
    const line = String(r.sku ?? "");
    return {
      provider: "gcp",
      ...(r.day ? { day: r.day } : { month: r.month }),
      service,
      line,
      where: r.project ?? null,
      category: categorize({ provider: "gcp", service, line }),
      amount: num(r.net),
      quantity: num(r.amount),
      unit: r.unit ?? null,
      gross: null,
      repo: null,
    };
  });
}

/* ---- GitHub ---- */

/** The snapshot's GitHub rows (`{ day | month, product, sku, repo, quantity, unitType, gross, net }`) as line rows; `amount` is the net. */
export function githubRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((r) => {
    const service = String(r.product ?? "");
    const line = String(r.sku ?? "");
    return {
      provider: "github",
      ...(r.day ? { day: r.day } : { month: r.month }),
      service,
      line,
      where: null,
      category: categorize({ provider: "github", service, line }),
      amount: num(r.net),
      quantity: num(r.quantity),
      unit: r.unitType ?? null,
      gross: num(r.gross),
      repo: typeof r.repo === "string" && r.repo !== "" ? r.repo : null,
    };
  });
}

/* ---- Modal ---- */

/** Modal's Starter plan includes this much usage a month; the job writes the figure as `credits`. */
export const MODAL_CREDITS_USD = 30;

/**
 * The snapshot's Modal report as line rows, one an app a day (`rows`: `{ day, app, env, cost }`)
 * or an app a month (`monthly`: `{ month, app, cost }`), every app a `compute` line whose `where`
 * is the app. `cost` is the usage; what is charged is the month's usage less the plan's included
 * credits, floored at zero, so `amount` is each row's share of that net (the month's net over its
 * usage, applied to every row of the month) and `gross` the usage itself. A day's share uses the
 * month's totals from `monthly` when it has the month, else the daily rows' own sum.
 */
export function modalRows(report, which = "monthly") {
  if (!report || typeof report !== "object") return [];
  const credits = typeof report.credits === "number" && report.credits >= 0 ? report.credits : MODAL_CREDITS_USD;
  const monthly = Array.isArray(report.monthly) ? report.monthly : [];
  const daily = Array.isArray(report.rows) ? report.rows : [];
  const usage = new Map();
  for (const r of monthly) if (r?.month) usage.set(String(r.month), (usage.get(String(r.month)) ?? 0) + num(r.cost));
  if (which === "daily") {
    const own = new Map();
    for (const r of daily) if (r?.day) own.set(monthOf(r.day), (own.get(monthOf(r.day)) ?? 0) + num(r.cost));
    for (const [m, v] of own) if (!usage.has(m)) usage.set(m, v);
  }
  const share = (month) => {
    const u = usage.get(month) ?? 0;
    return u > 0 ? Math.max(0, u - credits) / u : 0;
  };
  const source = which === "daily" ? daily : monthly;
  return source.filter((r) => r && (which === "daily" ? r.day : r.month)).map((r) => {
    const app = String(r.app ?? "");
    const month = which === "daily" ? monthOf(r.day) : String(r.month);
    const cost = num(r.cost);
    return {
      provider: "modal",
      ...(which === "daily" ? { day: String(r.day) } : { month }),
      service: "Modal",
      line: app,
      where: app,
      category: "compute",
      amount: cost * share(month),
      quantity: 0,
      unit: null,
      gross: cost,
      repo: null,
    };
  });
}

/* ---- fal ---- */

export const FAL_LINE = "fal credits used";

/**
 * fal's daily series (`fal.mjs` `falSeries`: `{ day, spend, purchase, balance }`) as line rows,
 * one a day that spent anything, category `ai`; `which` is `daily` or `monthly` (the days folded
 * by month). A purchase is never an amount.
 */
export function falRows(days, which = "daily") {
  const list = (Array.isArray(days) ? days : []).filter((d) => d?.day && num(d.spend) > 0);
  const row = (when, spend) => ({ provider: "fal", ...when, service: "fal", line: FAL_LINE, where: null, category: "ai", amount: spend, quantity: 0, unit: null, gross: null, repo: null });
  if (which === "daily") return list.map((d) => row({ day: d.day }, num(d.spend)));
  const byMonth = new Map();
  for (const d of list) byMonth.set(monthOf(d.day), (byMonth.get(monthOf(d.day)) ?? 0) + num(d.spend));
  return [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, spend]) => row({ month }, spend));
}

/* ---- sums ---- */

/** The sum of `amount` over the rows that pass `test`. */
export function sumAmount(rows, test = () => true) {
  let n = 0;
  for (const r of rows) if (test(r)) n += r.amount;
  return n;
}

/** The latest `day` among rows that billed anything (amount not 0), or null. */
export function lastBilledDay(rows) {
  let last = null;
  for (const r of rows) if (r.day && r.amount !== 0 && (last === null || r.day > last)) last = r.day;
  return last;
}
