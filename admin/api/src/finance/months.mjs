/**
 * The range and the month-shaped answers: `parseRange`, the months a range covers, the
 * `categories` table (one row a category, a column a month, the partial months and the unmapped
 * lines) and each provider's month totals for `summary`. Pure functions over line rows
 * (rows.mjs) with a `month` field.
 */

import { CATEGORIES } from "./categories.mjs";
import { PROVIDERS, cents, addMonths, monthsBetween, monthOf, daysInMonth } from "./rows.mjs";

export const RANGES = ["month", "last", "90", "13m"];
/** The day the GCP export was switched on: the fallback for where its rows start when the
 * export cannot say (`gcpBilling.firstDay()`, which reads the real first day, since Google
 * backfills earlier months). Months before the first day carry AWS and GitHub only. */
export const GCP_EXPORT_FROM = "2026-10-29";

/** `range` from the query string: absent is `month`, anything not in RANGES is null (a 400). */
export function parseRange(raw) {
  if (raw === null || raw === undefined || raw === "") return "month";
  return RANGES.includes(raw) ? raw : null;
}

/**
 * The months a range covers, oldest first, `today` a YYYY-MM-DD: `month` the current one,
 * `last` the one before, `90` the current and the two before, `13m` thirteen ending now.
 */
export function monthsOf(range, today) {
  const cur = monthOf(today);
  if (range === "last") return [addMonths(cur, -1)];
  if (range === "90") return monthsBetween(addMonths(cur, -2), cur);
  if (range === "13m") return monthsBetween(addMonths(cur, -12), cur);
  return [cur];
}

/** The months of a range that end before the GCP export began. */
export function partialMonths(months, exportFrom = GCP_EXPORT_FROM) {
  const first = monthOf(exportFrom);
  return months.filter((m) => m < first);
}

/**
 * The `categories` answer's body for `months` over monthly rows: every category in its fixed
 * order with `byMonth` aligned to `months` (0 where nothing billed), the partial months, and the
 * `other` lines summed over the range, largest first.
 */
export function categoriesTable(rows, months, { exportFrom = GCP_EXPORT_FROM } = {}) {
  const index = new Map(months.map((m, i) => [m, i]));
  const sums = new Map(CATEGORIES.map((c) => [c.key, months.map(() => 0)]));
  const other = new Map();
  for (const r of rows) {
    const i = index.get(r.month);
    if (i === undefined) continue;
    sums.get(r.category)[i] += r.amount;
    if (r.category === "other" && r.amount !== 0) {
      const k = `${r.provider}\u0000${r.line}`;
      const o = other.get(k) ?? { provider: r.provider, line: r.line, amount: 0 };
      o.amount += r.amount;
      other.set(k, o);
    }
  }
  return {
    months,
    categories: CATEGORIES.map((c) => ({ key: c.key, label: c.label, kind: c.kind, byMonth: sums.get(c.key).map(cents) })),
    partial: partialMonths(months, exportFrom),
    other: [...other.values()].map((o) => ({ ...o, amount: cents(o.amount) })).sort((a, b) => b.amount - a.amount || a.line.localeCompare(b.line)),
  };
}

/** `{ aws, gcp, github }`: each provider's total for `month` over monthly rows (unrounded; a provider with no rows is 0). */
export function monthTotals(rows, month) {
  const out = Object.fromEntries(PROVIDERS.map((p) => [p, 0]));
  for (const r of rows) if (r.month === month) out[r.provider] += r.amount;
  return out;
}

/** GitHub's gross for `month`: what the repositories would have cost if private. */
export function monthGross(rows, month) {
  let n = 0;
  for (const r of rows) if (r.month === month && r.provider === "github") n += r.gross ?? 0;
  return n;
}

/**
 * The month's forecast for a provider that has no forecasting service: its month to date
 * extrapolated by run-rate over the days it has billed (`lastDay`, the last day it has rows for,
 * in `month`). Null when it has no day in the month yet.
 */
export function runRateForecast(mtd, month, lastDay) {
  if (typeof lastDay !== "string" || monthOf(lastDay) !== month) return null;
  const elapsed = Number(lastDay.slice(8, 10));
  if (!(elapsed > 0)) return null;
  return (mtd / elapsed) * daysInMonth(month);
}
