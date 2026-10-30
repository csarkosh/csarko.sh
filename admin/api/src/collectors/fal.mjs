/**
 * fal's prepaid credit balance: `GET https://api.fal.ai/v1/account/billing?expand=credits` with
 * `Authorization: Key <FAL_ADMIN_KEY>` (a key with the Admin scope, or any with
 * `billing:usage:read`). The documented answer is
 * `{ "username": "...", "credits": { "current_balance": 24.5, "currency": "USD" } }`; the per-model
 * usage report is enterprise-only, so the balance is all there is. Read by the daily snapshot
 * job and stored as `finance.fal`; a day's spend is the balance's fall between two snapshots
 * (`finance/fal.mjs`). Not configured without the key.
 */

export const FAL_BILLING_URL = "https://api.fal.ai/v1/account/billing?expand=credits";

export function createFal({ adminKey, fetch, cache, ttlMs = 300_000 }) {
  const configured = typeof adminKey === "string" && adminKey !== "";

  return {
    get configured() {
      return configured;
    },
    /** `{ balance, currency }`, the balance a number in `currency` (USD). Throws with the status on a refused call. */
    balance() {
      return cache.get("fal:billing", ttlMs, async () => {
        const res = await fetch(FAL_BILLING_URL, { headers: { accept: "application/json", authorization: `Key ${adminKey}`, "user-agent": "csarko-admin" } });
        if (!res.ok) throw new Error(`fal ${res.status} on /v1/account/billing: ${(await res.text().catch(() => "")).slice(0, 200)}`);
        const body = await res.json();
        const out = balanceOf(body);
        if (out === null) throw new Error("fal /v1/account/billing answered without a numeric credit balance");
        return out;
      });
    },
  };
}

/* ---- pure mappings ---- */

const numeric = (v) => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

/**
 * The balance out of the billing answer, read defensively: `credits.current_balance` (the
 * documented field), then `credits.balance`, `balance`, `credit_balance`, `current_balance`.
 * `{ balance, currency }` or null when none is a number.
 */
export function balanceOf(body) {
  if (!body || typeof body !== "object") return null;
  const credits = body.credits && typeof body.credits === "object" ? body.credits : {};
  const candidates = [credits.current_balance, credits.balance, body.balance, body.credit_balance, body.current_balance];
  for (const c of candidates) {
    const n = numeric(c);
    if (n !== null) return { balance: n, currency: String(credits.currency ?? body.currency ?? "USD") };
  }
  return null;
}
