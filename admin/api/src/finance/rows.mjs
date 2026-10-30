/**
 * The one row shape every finance function works over, and how each source becomes it:
 *
 *   { provider, day | month, service, line, where, category, amount, quantity, unit, gross }
 *
 * `provider` is `aws`, `gcp` or `github`; `day` (YYYY-MM-DD, the provider's UTC billing day) on
 * a daily row and `month` (YYYY-MM) on a monthly one; `line` is the usage type, SKU or GitHub
 * SKU; `where` the AWS region, the GCP project id or null; `amount` US dollars net of credits;
 * `quantity` in `unit`; `gross` what GitHub would have charged on private repositories (null
 * elsewhere). Amounts are kept unrounded here and rounded to cents where the answer is shaped.
 *
 * The sources: Cost Explorer rows from the daily snapshot (`collectors/aws-cost.mjs`), the GCP
 * export's rows from BigQuery (`collectors/gcp-billing.mjs`), GitHub's usage items from the
 * snapshot (`collectors/github-billing.mjs`).
 */

import { categorize } from "./categories.mjs";

export const PROVIDERS = ["aws", "gcp", "github"];
export const PROVIDER_LABELS = { aws: "AWS", gcp: "Google Cloud", github: "GitHub" };

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
    };
  });
}

/* ---- GitHub ---- */

/** The snapshot's GitHub rows (`{ day | month, product, sku, quantity, unitType, gross, net }`) as line rows; `amount` is the net. */
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
    };
  });
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
