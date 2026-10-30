/**
 * The daily series (spec section 4, card 4): the last 60 days ending on the latest day any
 * source has, one entry a day with each provider's total, the day's total, the median of the
 * 14 days before it, whether the day is out of line and the line that moved it. Pure over
 * daily line rows (rows.mjs).
 */

import { PROVIDERS, cents, lastBilledDay } from "./rows.mjs";
import { addDays } from "../time.mjs";

export const SERIES_DAYS = 60;
export const MEDIAN_DAYS = 14;
export const FLAG_FACTOR = 3;
export const FLAG_FLOOR_USD = 1;

export function median(values) {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * `{ asOf, days }`: `asOf` the latest billed day across the rows (`today` when nothing billed),
 * `days` the `count` days ending there. A provider in `configured` with no rows on a day is 0;
 * one not configured is null and left out of `total`. `median14` is over the available days
 * before (fewer than 14 at the start, null on the first). `flagged` when the total is over three
 * times the median and over $1; `top` the day's largest line.
 */
export function dailySeries(rows, { today, configured = PROVIDERS, count = SERIES_DAYS } = {}) {
  const asOf = lastBilledDay(rows) ?? today;
  const first = addDays(asOf, -(count - 1));
  const byDay = new Map();
  for (const r of rows) {
    if (!r.day || r.day < first || r.day > asOf) continue;
    const d = byDay.get(r.day) ?? { sums: Object.fromEntries(PROVIDERS.map((p) => [p, 0])), top: null };
    d.sums[r.provider] += r.amount;
    if (r.amount > 0 && (d.top === null || r.amount > d.top.amount)) d.top = { provider: r.provider, line: r.line, amount: r.amount };
    byDay.set(r.day, d);
  }
  const days = [];
  const totals = [];
  for (let day = first; day <= asOf; day = addDays(day, 1)) {
    const d = byDay.get(day);
    const entry = { day };
    let total = 0;
    for (const p of PROVIDERS) {
      if (!configured.includes(p)) {
        entry[p] = null;
        continue;
      }
      const v = d?.sums[p] ?? 0;
      entry[p] = cents(v);
      total += v;
    }
    entry.total = cents(total);
    const med = median(totals.slice(-MEDIAN_DAYS));
    entry.median14 = med === null ? null : cents(med);
    entry.flagged = med !== null && total > FLAG_FACTOR * med && total > FLAG_FLOOR_USD;
    entry.top = d?.top ? { provider: d.top.provider, line: d.top.line, amount: cents(d.top.amount) } : null;
    days.push(entry);
    totals.push(total);
  }
  return { asOf, days };
}

/** The sum of `total` over the last `n` days of a series, and over the `n` before those: `{ value, prev }`. */
export function trailingTotals(days, n) {
  const sum = (list) => cents(list.reduce((s, d) => s + d.total, 0));
  const last = days.slice(-n);
  const before = days.slice(-2 * n, -n);
  return { value: sum(last), prev: before.length > 0 ? sum(before) : null };
}
