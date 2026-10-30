/**
 * The price rule of the donate site, pure: last month's spend (less the commercial project, which
 * is not free public work) is the pool, each tier is a share of it rounded up to the dollar, and
 * `decide` says whether today's snapshot run should publish new prices. Prices are made once a
 * month, on the 3rd (after the billing sources have settled), later if a collector failed and not
 * past the 7th; a door added mid-month gets that month's prices at the next run.
 */

import { addMonths, monthOf } from "../finance/rows.mjs";
import { projectOf } from "../finance/projects.mjs";
import { TIERS } from "./doors.mjs";

export const PRICE_DAY = 3;
export const LATE_DAY = 7;
export const FLOOR_USD = 1;

/** The unrounded sum of `month`'s rows outside the commercial project, never below 0. */
export function poolOf(monthlyRows, month) {
  let sum = 0;
  for (const r of monthlyRows) {
    if (r.month !== month || r.project === "commercial" || projectOf(r) === "commercial") continue;
    sum += r.amount;
  }
  return Math.max(0, sum);
}

/** One tier's price in whole dollars: a share of the pool rounded up, never under the floor. */
export const priceOf = (pool, share) => Math.max(FLOOR_USD, Math.ceil(pool * share - 1e-9));

/** The four tiers priced from the pool. */
export function pricesOf(pool) {
  return TIERS.map((t) => ({ tier: t.key, name: t.name, share: t.share, label: `about ${Math.round(t.share * 100)}%`, usd: priceOf(pool, t.share) }));
}

/**
 * Whether to publish prices today. `current` is the published JSON or null, `failed` the providers
 * whose collector failed today, `doors` the shipped door keys.
 */
export function decide({ today, current, failed, doors }) {
  const month = addMonths(monthOf(today), -1);
  const published = current?.month === month ? current.doors ?? [] : [];
  const missing = doors.filter((d) => !published.includes(d));
  if (current?.month === month && missing.length === 0) return { run: false, reason: "done", month, newMonth: false, pending: [] };
  const day = Number(today.slice(8, 10));
  if (day < PRICE_DAY) return { run: false, reason: "before the 3rd", month, newMonth: false, pending: [] };
  if (failed.length > 0 && day < LATE_DAY) return { run: false, reason: `waiting on ${failed.join(", ")}`, month, newMonth: false, pending: [] };
  const newMonth = current?.month !== month;
  return { run: true, reason: newMonth ? "new month" : "doors added", month, newMonth, pending: newMonth ? [...doors] : missing };
}
