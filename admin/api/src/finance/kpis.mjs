/**
 * The index card's health for the finance page (the contract's `kpis`). There is no spend goal
 * (Cyrus, 2026-10-30: the films drive the cost on purpose), so the dot reads the sources and the
 * unexplained days only: `good` when every configured source answered, `warning` when one failed
 * or a day of the last seven is over three times its trailing median with no compute or AI line
 * to explain it, `critical` when such a day is over $100. Pure over the hints' errors, the daily
 * series (daily.mjs) and the daily line rows (rows.mjs).
 */

export const CRITICAL_DAY_USD = 100;
export const HEALTH_DAYS = 7;

const explains = (r) => r.amount > 0 && (r.category === "compute" || r.category === "ai");

export function financeHealth({ errors = {}, days = [], rows = [], configured = [] }) {
  const recent = days.slice(-HEALTH_DAYS);
  const unexplained = recent.filter((d) => d.flagged && !rows.some((r) => r.day === d.day && explains(r)));
  const failed = Object.keys(errors ?? {});
  if (unexplained.length > 0) {
    const d = unexplained.at(-1);
    const what = d.top ? `, ${d.top.line}` : "";
    if (d.total > CRITICAL_DAY_USD) return { status: "critical", note: `$${d.total.toFixed(2)} on ${d.day} with no compute or AI line to explain it${what}` };
    return { status: "warning", note: `$${d.total.toFixed(2)} on ${d.day}, over three times the trailing median, with no compute or AI line to explain it${what}` };
  }
  if (failed.length > 0) return { status: "warning", note: `${failed.length === 1 ? "A source" : `${failed.length} sources`} failed: ${failed.join(", ")}` };
  const n = configured.length;
  return { status: "good", note: `${n === 0 ? "Every source" : `${n} source${n === 1 ? "" : "s"}`} answered; no day of the last ${HEALTH_DAYS} out of line` };
}
