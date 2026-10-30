/**
 * The index card's health for the finance page (the contract's `kpis`): good when the idle
 * run-rate is at or under the goal and no day of the last seven is over three times its trailing
 * median; warning when the run-rate is over the goal; critical when a day of the last seven is
 * over $20 with no compute or AI line to explain it. Pure over the daily series (daily.mjs) and
 * the daily line rows (rows.mjs).
 */

export const CRITICAL_DAY_USD = 20;
export const HEALTH_DAYS = 7;

const explains = (r) => r.amount > 0 && (r.category === "compute" || r.category === "ai");

export function financeHealth({ idleRunRate, goalUsd, days, rows }) {
  const recent = days.slice(-HEALTH_DAYS);
  const unexplained = recent.filter((d) => d.total > CRITICAL_DAY_USD && !rows.some((r) => r.day === d.day && explains(r)));
  if (unexplained.length > 0) {
    const d = unexplained.at(-1);
    return { status: "critical", note: `$${d.total.toFixed(2)} on ${d.day} with no rig or AI line to explain it` };
  }
  if (typeof idleRunRate === "number" && idleRunRate > goalUsd) {
    return { status: "warning", note: `Idle run-rate $${idleRunRate.toFixed(2)} a month, over the $${goalUsd} goal` };
  }
  const flagged = recent.filter((d) => d.flagged);
  if (flagged.length > 0) {
    const d = flagged.at(-1);
    const what = d.top ? `, ${d.top.line}` : "";
    return { status: "warning", note: `$${d.total.toFixed(2)} on ${d.day}, over three times the trailing median${what}` };
  }
  if (typeof idleRunRate !== "number") return { status: "warning", note: "No idle run-rate yet" };
  return { status: "good", note: `Idle run-rate $${idleRunRate.toFixed(2)} a month, under the $${goalUsd} goal` };
}
