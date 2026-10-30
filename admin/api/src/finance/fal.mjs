/**
 * fal's spend from its credit balance. fal's per-model report is enterprise-only, so the snapshot
 * job reads the prepaid balance once a day (`collectors/fal.mjs`) and stores it as
 * `finance.fal = { at, balance, currency, lastDay }`; the spend is derived here from the run of
 * snapshots, pure over `[{ date, finance: { fal: { balance } } }]`.
 *
 * Between two consecutive snapshots the balance fell (spend) or rose (a credit purchase, never
 * spend). The fall is the spend of the days from the earlier snapshot's day up to the day before
 * the later one, spread evenly when the job skipped a day; a rise is recorded as `purchase` on
 * the earlier snapshot's day. The latest snapshot's day has no spend yet (nothing has been read
 * after it), so the series ends the day before it: that is fal's `lastDay`. A gap that held both
 * a purchase and spend shows only their net.
 */

import { cents } from "./rows.mjs";
import { addDays } from "../time.mjs";

/**
 * `{ balance, currency, lastDay, days }` from snapshots that carry a fal part (others are
 * skipped), or null when none does. `days` is one entry a day from the first snapshot's day to
 * the day before the latest, `{ day, spend, purchase, balance }` (`balance` the reading on that
 * day, null on a day the job skipped); `balance` and `currency` are the latest reading's.
 */
export function falSeries(snapshots) {
  const readings = (Array.isArray(snapshots) ? snapshots : [])
    .filter((s) => s && typeof s.date === "string" && typeof s.finance?.fal?.balance === "number" && Number.isFinite(s.finance.fal.balance))
    .map((s) => ({ day: s.date, balance: s.finance.fal.balance, currency: s.finance.fal.currency ?? "USD" }))
    .sort((a, b) => a.day.localeCompare(b.day));
  if (readings.length === 0) return null;
  const days = [];
  for (let i = 0; i < readings.length - 1; i += 1) {
    const from = readings[i];
    const to = readings[i + 1];
    const change = from.balance - to.balance;
    const span = Math.max(1, Math.round((Date.parse(`${to.day}T00:00:00Z`) - Date.parse(`${from.day}T00:00:00Z`)) / 86_400_000));
    for (let n = 0; n < span; n += 1) {
      const day = addDays(from.day, n);
      days.push({
        day,
        spend: change > 0 ? change / span : 0,
        purchase: change < 0 && n === 0 ? -change : 0,
        balance: n === 0 ? from.balance : null,
      });
    }
  }
  const latest = readings.at(-1);
  return {
    balance: latest.balance,
    currency: latest.currency,
    lastDay: days.length > 0 ? days.at(-1).day : null,
    days: days.map((d) => ({ day: d.day, spend: cents(d.spend), purchase: cents(d.purchase), balance: d.balance })),
  };
}
