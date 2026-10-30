/**
 * The idle run-rate (spec section 4, card 3): every line whose category bills while nothing
 * runs, its average daily cost over the last seven billed days and that times 30, and the lines
 * that stopped. Pure over daily line rows (rows.mjs).
 *
 * Each provider's window ends on its own last billed day, since the GCP export runs a day or
 * two behind Cost Explorer: a line is not "gone" because its provider has not reported
 * yesterday yet. A line that billed in the seven days before the window and not in it is kept,
 * at zero, with `stoppedOn` the last day it billed, so a cleanup is seen to have worked; after
 * those seven days it drops off.
 */

import { kindOf } from "./categories.mjs";
import { cents, fine, lastBilledDay } from "./rows.mjs";
import { addDays } from "../time.mjs";

export const WINDOW_DAYS = 7;
export const MONTH_DAYS = 30;

/**
 * `{ asOf, runRate, lines }` over daily rows; `asOf` is the latest day any provider billed
 * (`today` when none did), `runRate` the sum of `perMonth`. `shiftDays` moves every provider's
 * window back that many days (the KPI's previous value asks for the rate a week earlier).
 */
export function idleLines(rows, { today, shiftDays = 0 } = {}) {
  const idle = rows.filter((r) => r.day && kindOf(r.category) === "idle");
  const ends = new Map();
  for (const p of new Set(rows.map((r) => r.provider))) {
    const last = lastBilledDay(rows.filter((r) => r.provider === p));
    if (last !== null) ends.set(p, addDays(last, -shiftDays));
  }
  const asOfAll = [...ends.values()].sort().at(-1) ?? (today ? addDays(today, -shiftDays) : null);

  const groups = new Map();
  for (const r of idle) {
    const end = ends.get(r.provider);
    if (end === undefined || r.day > end || r.day < addDays(end, -(2 * WINDOW_DAYS - 1))) continue;
    const key = `${r.provider}\u0000${r.line}\u0000${r.where ?? ""}`;
    const g = groups.get(key) ?? { provider: r.provider, line: r.line, category: r.category, where: r.where ?? null, recent: 0, lastBilled: null, billedRecently: false };
    const inWindow = r.day > addDays(end, -WINDOW_DAYS);
    if (inWindow) g.recent += r.amount;
    if (r.amount !== 0) {
      if (inWindow) g.billedRecently = true;
      if (g.lastBilled === null || r.day > g.lastBilled) g.lastBilled = r.day;
    }
    groups.set(key, g);
  }

  const lines = [];
  for (const g of groups.values()) {
    if (g.lastBilled === null) continue;
    if (g.billedRecently) {
      const perDay = g.recent / WINDOW_DAYS;
      lines.push({ provider: g.provider, line: g.line, category: g.category, where: g.where, perDay: fine(perDay), perMonth: cents(perDay * MONTH_DAYS), stoppedOn: null });
    } else {
      lines.push({ provider: g.provider, line: g.line, category: g.category, where: g.where, perDay: 0, perMonth: 0, stoppedOn: g.lastBilled });
    }
  }
  lines.sort((a, b) => b.perMonth - a.perMonth || a.line.localeCompare(b.line) || a.provider.localeCompare(b.provider));
  return { asOf: asOfAll, runRate: cents(lines.reduce((n, l) => n + l.perMonth, 0)), lines };
}
