/**
 * Claude Code as a provider (Cyrus, 2026-10-30: "its own category"). Claude Code runs on a
 * claude.ai subscription, a flat monthly fee the code cannot read, so the fee is entered on the
 * page as the manual series `claude-subscription` (`[{ at, value }]`, the latest value the monthly
 * fee in USD). That fee is the spend: one line a month, category `claudeCode`, project other,
 * spread evenly over the month's days in the daily series so the stack and the tables agree. A
 * month uses the latest entry at or before its end, so a plan change applies from its month, and
 * a month before the first entry has no line.
 *
 * Beside the spend, the value: `tools/claude-usage-sync.py`, run on the Mac, sums the local
 * transcripts' tokens per day and per model, prices them at the first-party API list price and
 * writes `finance.claude = { at, lastDay, files, rows, monthly, pricing }` into the day's snapshot
 * (`rows` the last 60 days, `monthly` 13 months, each `{ day | month, model, input, cacheWrite,
 * cacheRead, output, messages, usd }`). `usd` is what the same tokens would cost as API calls: the
 * plan's value, never a bill, shown beside the fee as context. Pure functions over the series and
 * the part; finance-queries.mjs fetches both.
 */

import { cents, monthOf, addMonths, daysInMonth, monthsBetween } from "./rows.mjs";
import { SERIES_DAYS } from "./daily.mjs";
import { addDays } from "../time.mjs";

export const CLAUDE_SUBSCRIPTION_KEY = "claude-subscription";
export const CLAUDE_SERVICE = "Claude Code";
export const CLAUDE_LINE = "claude.ai subscription";
export const CLAUDE_WHERE = "subscription";
/** The months a monthly row is made for: the `13m` range, the longest a query asks for. */
const MONTHS = 13;
const TOKEN_FIELDS = ["input", "cacheWrite", "cacheRead", "output", "messages"];

const num = (v) => {
  const n = typeof v === "number" ? v : v === null || v === undefined || v === "" ? NaN : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/* ---- the subscription ---- */

/** The manual series as `[{ at, value }]` sorted by `at`, entries with a finite non-negative value only. */
export function subscriptionSeries(raw) {
  return (Array.isArray(raw) ? raw : [])
    .filter((e) => e && typeof e.at === "string" && typeof e.value === "number" && Number.isFinite(e.value) && e.value >= 0)
    .map((e) => ({ at: e.at, value: e.value }))
    .sort((a, b) => a.at.localeCompare(b.at));
}

/** The entry a month's fee comes from: the latest one entered at or before the month's end, or null before the first. */
export function subscriptionFor(series, month) {
  let out = null;
  for (const e of series) if (monthOf(e.at) <= month) out = e;
  return out;
}

/**
 * The fee as line rows (rows.mjs): `monthly` one row a month for the 13 months ending on
 * `today`'s, each the month's fee; `daily` one row a day from the earlier of 60 days ago and the
 * first of the previous month through today, each `fee / daysInMonth`, kept unrounded so a month's
 * days sum to its fee and the answers round once. A month with no entry yet has no row.
 */
export function claudeRows(series, which = "monthly", { today } = {}) {
  if (!Array.isArray(series) || series.length === 0 || typeof today !== "string") return [];
  const row = (when, amount) => ({ provider: "claude", ...when, service: CLAUDE_SERVICE, line: CLAUDE_LINE, where: CLAUDE_WHERE, category: "claudeCode", amount, quantity: 0, unit: null, gross: null, repo: null });
  const cur = monthOf(today);
  if (which === "monthly") {
    const out = [];
    for (const month of monthsBetween(addMonths(cur, -(MONTHS - 1)), cur)) {
      const s = subscriptionFor(series, month);
      if (s !== null) out.push(row({ month }, s.value));
    }
    return out;
  }
  const sixty = addDays(today, -(SERIES_DAYS - 1));
  const prev = `${addMonths(cur, -1)}-01`;
  const out = [];
  for (let day = sixty < prev ? sixty : prev; day <= today; day = addDays(day, 1)) {
    const month = monthOf(day);
    const s = subscriptionFor(series, month);
    if (s !== null) out.push(row({ day }, s.value / daysInMonth(month)));
  }
  return out;
}

/* ---- the usage ---- */

/** The snapshot's part, checked: `{ at, lastDay, files, rows, monthly, pricing }`, or null when it is absent or has no monthly rows. */
export function claudeUsage(part) {
  if (!part || typeof part !== "object" || !Array.isArray(part.monthly)) return null;
  return {
    at: typeof part.at === "string" ? part.at : null,
    lastDay: typeof part.lastDay === "string" ? part.lastDay : null,
    files: typeof part.files === "number" && Number.isFinite(part.files) ? part.files : null,
    rows: Array.isArray(part.rows) ? part.rows : [],
    monthly: part.monthly,
    pricing: typeof part.pricing === "string" ? part.pricing : null,
  };
}

/**
 * `{ listValue, messages, byModel }` over the part's monthly rows in `months`: the list-price
 * value and the messages summed, and `byModel` one entry a model with its tokens, messages and
 * `usd` summed over those months, largest `usd` first.
 */
export function usageForMonths(usage, months) {
  const wanted = new Set(months);
  const by = new Map();
  let listValue = 0;
  let messages = 0;
  for (const r of usage.monthly) {
    if (!r || !wanted.has(String(r.month))) continue;
    const model = String(r.model ?? "?");
    const m = by.get(model) ?? { model, input: 0, cacheWrite: 0, cacheRead: 0, output: 0, messages: 0, usd: 0 };
    for (const k of TOKEN_FIELDS) m[k] += num(r[k]);
    m.usd += num(r.usd);
    listValue += num(r.usd);
    messages += num(r.messages);
    by.set(model, m);
  }
  return {
    listValue: cents(listValue),
    messages: Math.round(messages),
    byModel: [...by.values()].map((m) => ({ ...m, usd: cents(m.usd) })).sort((a, b) => b.usd - a.usd || a.model.localeCompare(b.model)),
  };
}

/**
 * The last `count` days ending on the part's last day (`today` when it has none), every day
 * present: `{ day, usd, messages, byModel }`, `byModel` the day's models by `usd`, largest first,
 * empty on a day with no use.
 */
export function usageDays(usage, { today, count = SERIES_DAYS } = {}) {
  const asOf = usage.lastDay ?? today;
  const first = addDays(asOf, -(count - 1));
  const byDay = new Map();
  for (const r of usage.rows) {
    if (!r || typeof r.day !== "string" || r.day < first || r.day > asOf) continue;
    const d = byDay.get(r.day) ?? { usd: 0, messages: 0, byModel: new Map() };
    const model = String(r.model ?? "?");
    d.usd += num(r.usd);
    d.messages += num(r.messages);
    d.byModel.set(model, (d.byModel.get(model) ?? 0) + num(r.usd));
    byDay.set(r.day, d);
  }
  const out = [];
  for (let day = first; day <= asOf; day = addDays(day, 1)) {
    const d = byDay.get(day);
    const models = d ? [...d.byModel.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])) : [];
    out.push({ day, usd: cents(d?.usd ?? 0), messages: Math.round(d?.messages ?? 0), byModel: Object.fromEntries(models.map(([m, v]) => [m, cents(v)])) });
  }
  return out;
}
