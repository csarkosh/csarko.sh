/**
 * Donations as income, pure over Stripe's objects (`collectors/stripe.mjs`). A balance transaction
 * of type `charge` or `payment` is a donation: `amount` the gross, `fee` Stripe's cut and `net`
 * what lands in the balance, all in the smallest unit (cents for usd); a `refund` or
 * `payment_refund` subtracts (gross and net negative, the fee as Stripe gives it); nothing else
 * (payouts, adjustments, Stripe's own fees) counts as income. Everything is turned into dollars
 * rounded to cents, and a `day` is the transaction's UTC date.
 *
 * Privacy (the contract: "No donor identity ever reaches the page"): a row here is amounts, a
 * currency and a day. No description, no source or charge id, no customer, no receipt. `recentOf`
 * is the only list the page sees one donation at a time, and it carries `day`, `gross`, `net`
 * and `currency` and nothing else, ever.
 */

import { cents, monthOf, addMonths, monthsBetween } from "./rows.mjs";
import { addDays, isoDate } from "../time.mjs";

export const DONATION_TYPES = ["charge", "payment"];
export const REFUND_TYPES = ["refund", "payment_refund"];
export const INCOME_DAYS = 60;
export const INCOME_MONTHS = 13;
export const RECENT_COUNT = 20;

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
const dollars = (smallest) => cents(num(smallest) / 100);
const dayOf = (unix) => isoDate(num(unix) * 1000);

/**
 * The income rows out of balance transactions, newest first: `{ day, created, gross, fees, net,
 * currency, refund }`, a donation with positive gross and net, a refund with both negative. Counts
 * count donations only: a refund changes the amounts, not how many gave.
 */
export function donationsOf(transactions) {
  const rows = [];
  for (const t of Array.isArray(transactions) ? transactions : []) {
    if (!t || typeof t !== "object" || typeof t.created !== "number") continue;
    const donation = DONATION_TYPES.includes(t.type);
    const refund = REFUND_TYPES.includes(t.type);
    if (!donation && !refund) continue;
    const gross = refund ? -Math.abs(dollars(t.amount)) : dollars(t.amount);
    const net = refund ? -Math.abs(dollars(t.net)) : dollars(t.net);
    rows.push({ day: dayOf(t.created), created: t.created, gross, fees: dollars(t.fee), net, currency: String(t.currency ?? "usd").toLowerCase(), refund });
  }
  return rows.sort((a, b) => b.created - a.created);
}

const sumOf = (rows) => {
  let gross = 0;
  let fees = 0;
  let net = 0;
  let count = 0;
  for (const r of rows) {
    gross += r.gross;
    fees += r.fees;
    net += r.net;
    if (!r.refund) count += 1;
  }
  return { gross: cents(gross), fees: cents(fees), net: cents(net), count };
};

/** The last `count` days ending `today`, every day present, `{ day, gross, fees, net, count }` (0s where none). */
export function incomeDays(rows, { today, count = INCOME_DAYS } = {}) {
  const first = addDays(today, -(count - 1));
  const byDay = new Map();
  for (const r of rows) {
    if (r.day < first || r.day > today) continue;
    (byDay.get(r.day) ?? byDay.set(r.day, []).get(r.day)).push(r);
  }
  const out = [];
  for (let day = first; day <= today; day = addDays(day, 1)) out.push({ day, ...sumOf(byDay.get(day) ?? []) });
  return out;
}

/** The last `count` months ending `today`'s, every month present, `{ month, gross, fees, net, count }`. */
export function incomeMonths(rows, { today, count = INCOME_MONTHS } = {}) {
  const cur = monthOf(today);
  return monthsBetween(addMonths(cur, -(count - 1)), cur).map((month) => ({ month, ...sumOf(rows.filter((r) => monthOf(r.day) === month)) }));
}

/** `{ gross, fees, net, count, average }` over `months`; `average` is gross over the donations, null when none. */
export function incomeFor(rows, months) {
  const set = new Set(months);
  const s = sumOf(rows.filter((r) => set.has(monthOf(r.day))));
  return { ...s, average: s.count > 0 ? cents(s.gross / s.count) : null };
}

/** The newest `n` donations (refunds left out), `{ day, gross, net, currency }` and no other field. */
export function recentOf(rows, n = RECENT_COUNT) {
  return rows.filter((r) => !r.refund).slice(0, n).map((r) => ({ day: r.day, gross: r.gross, net: r.net, currency: r.currency }));
}

/** Stripe's payouts as `{ day, amount, status }`, `day` the arrival date, newest first. */
export function payoutsOf(payouts) {
  return (Array.isArray(payouts) ? payouts : [])
    .filter((p) => p && typeof p === "object" && typeof p.arrival_date === "number")
    .sort((a, b) => b.arrival_date - a.arrival_date)
    .map((p) => ({ day: dayOf(p.arrival_date), amount: dollars(p.amount), status: String(p.status ?? "unknown") }));
}

/** `{ available, pending, currency }` in dollars for one currency out of `GET /v1/balance`. */
export function balanceOf(balance, currency = "usd") {
  const sum = (list) => cents((Array.isArray(list) ? list : []).filter((b) => String(b?.currency ?? "").toLowerCase() === currency).reduce((n, b) => n + num(b.amount), 0) / 100);
  return { available: sum(balance?.available), pending: sum(balance?.pending), currency };
}

/** The newest donation's day among the rows (refunds left out), or null. */
export function lastDonationDay(rows) {
  const d = rows.find((r) => !r.refund);
  return d ? d.day : null;
}
