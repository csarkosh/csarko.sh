/**
 * What activity bought (spec section 4, card 5): five items for a range, each a quantity, its
 * cost and the unit price, so the next session can be budgeted. Pure over monthly line rows
 * (rows.mjs) restricted to the range's months.
 *
 *   rigHours          AWS BoxUsage hours and their cost
 *   egressGiB         Firebase Hosting outgoing bandwidth in GiB and its cost
 *   cloudRunCpuHours  Cloud Run CPU hours (the CPU SKUs' seconds) against every serverless dollar
 *   ciMinutes         GitHub Actions minutes; cost is the net, `gross` what private repos would pay
 *   aiGenerations     Vertex AI and Gemini usage, counted in the SKU's own unit
 */

import { PROVIDERS, cents, fine } from "./rows.mjs";

const GIB = 2 ** 30;

/** A quantity in bytes-ish units as GiB; an unknown unit is taken as already GiB. */
export function toGiB(amount, unit) {
  const u = String(unit ?? "").toLowerCase();
  if (u === "byte" || u === "bytes") return amount / GIB;
  if (u === "gigabyte") return (amount * 1e9) / GIB;
  if (u === "mebibyte") return amount / 1024;
  if (u === "megabyte") return (amount * 1e6) / GIB;
  return amount;
}

/** A time quantity as hours; an unknown unit is taken as hours. */
export function toHours(amount, unit) {
  const u = String(unit ?? "").toLowerCase();
  if (u === "second" || u === "seconds") return amount / 3600;
  if (u === "minute" || u === "minutes") return amount / 60;
  return amount;
}

const ITEMS = [
  { key: "rigHours", label: "Rig hours", unit: "h", per: "an hour", provider: "aws" },
  { key: "egressGiB", label: "Hosting egress", unit: "GiB", per: "a GiB", provider: "gcp" },
  { key: "cloudRunCpuHours", label: "Cloud Run CPU", unit: "h", per: "an hour, after the free tier", provider: "gcp" },
  { key: "ciMinutes", label: "CI minutes", unit: "min", per: "a Linux minute if private", provider: "github" },
  { key: "aiGenerations", label: "AI generations", unit: "", per: "a clip", provider: "gcp" },
];

const isRig = (r) => r.provider === "aws" && /BoxUsage:/.test(r.line);
const isEgress = (r) => r.provider === "gcp" && r.service === "Firebase Hosting" && r.category === "hosting";
const isServerless = (r) => r.provider === "gcp" && r.category === "serverless";
const isCpu = (r) => isServerless(r) && /CPU/i.test(r.line);
const isCi = (r) => r.provider === "github" && r.category === "ci";
const isCiMinutes = (r) => isCi(r) && r.service.toLowerCase() === "actions" && /minute/i.test(String(r.unit ?? ""));
const isAi = (r) => r.provider === "gcp" && r.category === "ai";

/**
 * The five items, in order, over `rows` (already cut to the range's months). A provider not in
 * `configured` leaves its item's `quantity` and `cost` null; `unitPrice` is cost over quantity
 * (gross over quantity for CI, whose net is 0 on public repositories), null when the quantity is 0.
 */
export function activityItems(rows, { configured = PROVIDERS } = {}) {
  const sum = (test, field = "amount") => rows.reduce((n, r) => (test(r) ? n + (r[field] ?? 0) : n), 0);
  const measured = {
    rigHours: () => ({ quantity: sum(isRig, "quantity"), cost: sum(isRig) }),
    egressGiB: () => ({ quantity: rows.reduce((n, r) => (isEgress(r) ? n + toGiB(r.quantity, r.unit) : n), 0), cost: sum(isEgress) }),
    cloudRunCpuHours: () => ({ quantity: rows.reduce((n, r) => (isCpu(r) ? n + toHours(r.quantity, r.unit) : n), 0), cost: sum(isServerless) }),
    ciMinutes: () => ({ quantity: sum(isCiMinutes, "quantity"), cost: sum(isCi), gross: sum(isCi, "gross") }),
    aiGenerations: () => ({ quantity: sum(isAi, "quantity"), cost: sum(isAi) }),
  };
  return ITEMS.map((item) => {
    const base = { key: item.key, label: item.label };
    if (!configured.includes(item.provider)) {
      return { ...base, quantity: null, unit: item.unit, cost: null, ...(item.key === "ciMinutes" ? { gross: null } : {}), unitPrice: null, per: item.per };
    }
    const m = measured[item.key]();
    const priced = item.key === "ciMinutes" ? m.gross : m.cost;
    const quantity = item.unit === "min" || item.unit === "" ? Math.round(m.quantity) : Math.round(m.quantity * 100) / 100;
    return {
      ...base,
      quantity,
      unit: item.unit,
      cost: cents(m.cost),
      ...(item.key === "ciMinutes" ? { gross: cents(m.gross) } : {}),
      unitPrice: m.quantity > 0 ? fine(priced / m.quantity) : null,
      per: item.per,
    };
  });
}
