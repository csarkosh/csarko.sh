/**
 * The price rule of the donate site, pure: the last 30 days' spend (the 30 days ending yesterday,
 * UTC, less the commercial project, which is not free public work) is the pool, each tier is a
 * share of it rounded up to the dollar, and `decide` says whether today's snapshot run should
 * publish new prices. Prices turn every seven days from the last repricing, from the launch day
 * `DONATE_FROM` on; a due turn waits while a collector failed, up to three days late, and while
 * GCP's export has no rows through two days before the window's end (it runs a day or two behind;
 * three is the most tolerated). A door added between turns gets the current prices at the next run.
 */

import { addDays } from "../time.mjs";
import { projectOf } from "../finance/projects.mjs";
import { TIERS, DONATE_FROM, WINDOW_DAYS, REPRICE_DAYS } from "./doors.mjs";

export const FLOOR_USD = 1;
/** How many days late a due turn may wait on a failed collector. */
const LATE_DAYS = 3;
/** How far behind the window's end GCP's export may run. */
const GCP_LAG_DAYS = 2;

/** The window priced on `today`: the 30 days ending yesterday. */
export const windowOf = (today) => ({ from: addDays(today, -WINDOW_DAYS), to: addDays(today, -1) });

/** The unrounded sum of the window's daily rows outside the commercial project, never below 0. */
export function poolOf(dailyRows, window) {
  let sum = 0;
  for (const r of dailyRows) {
    if (typeof r.day !== "string" || r.day < window.from || r.day > window.to) continue;
    if (r.project === "commercial" || projectOf(r) === "commercial") continue;
    sum += r.amount;
  }
  return Math.max(0, sum);
}

/** One tier's price in whole dollars: a share of the pool rounded up, never under the floor. */
export const priceOf = (pool, share) => Math.max(FLOOR_USD, Math.ceil(pool * share - 1e-9));

/** The three tiers priced from the pool. */
export function pricesOf(pool) {
  return TIERS.map((t) => ({ tier: t.key, name: t.name, share: t.share, label: `about ${Math.round(t.share * 100)}%`, usd: priceOf(pool, t.share) }));
}

/**
 * Whether to publish prices today. `current` is the published JSON (its `period` and door keys) or
 * null, `failed` the providers whose collector failed today, `doors` the shipped door keys,
 * `gcpLastDay` the newest day of GCP's export (read only when `gcpConfigured`).
 */
export function decide({ today, current, failed = [], doors, gcpConfigured = false, gcpLastDay = null, from = DONATE_FROM }) {
  const window = windowOf(today);
  const hold = (reason) => ({ run: false, reason, window, newPeriod: false, pending: [] });
  if (today < from) return hold("before the launch day");
  const due = current === null || addDays(current.period.repricedOn, REPRICE_DAYS) <= today;
  if (!due) {
    const published = current.doors ?? [];
    const missing = doors.filter((d) => !published.includes(d));
    if (missing.length === 0) return hold("done");
    return { run: true, reason: "doors added", window, newPeriod: false, pending: missing };
  }
  const gcpThrough = addDays(window.to, -GCP_LAG_DAYS);
  if (gcpConfigured && (gcpLastDay === null || gcpLastDay < gcpThrough)) return hold(`waiting on GCP rows through ${gcpThrough}`);
  if (failed.length > 0 && (current === null || today < addDays(current.period.repricedOn, REPRICE_DAYS + LATE_DAYS))) return hold(`waiting on ${failed.join(", ")}`);
  return { run: true, reason: "new period", window, newPeriod: true, pending: [...doors] };
}
