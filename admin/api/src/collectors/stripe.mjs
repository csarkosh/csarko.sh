/**
 * Stripe, the donations: `GET https://api.stripe.com/v1/balance_transactions` (every page, with
 * `created[gte]`), `GET /v1/payouts` and `GET /v1/balance`, each with `Authorization: Bearer
 * <STRIPE_KEY>`. The key is a restricted one, read-only on balance transactions, charges and
 * payouts; the account's default API version applies (no `Stripe-Version` header). Read live on
 * a request and cached five minutes, like the other live collectors; the shaping into income is
 * `finance/income.mjs`, which keeps amounts and days only: nothing here is ever passed to the
 * page as is, so no donor's name, email or description leaves the API.
 *
 * A refused or failed call is an `UpstreamError` with the status and the first 200 characters of
 * Stripe's body, with the key itself blanked should Stripe ever echo it.
 */

import { UpstreamError } from "../http.mjs";

export const STRIPE_API = "https://api.stripe.com/v1";
export const PAGE_LIMIT = 100;
/** How far back a list reaches when the caller names no `sinceUnix`: 400 days, past the 13-month range. */
export const DEFAULT_SINCE_DAYS = 400;

export function createStripe({ key, fetch, cache, now = Date.now, ttlMs = 300_000 }) {
  const configured = typeof key === "string" && key !== "";
  const headers = { accept: "application/json", authorization: `Bearer ${key}`, "user-agent": "csarko-admin" };
  const blank = (s) => (configured ? String(s).split(key).join("[key]") : String(s));
  const defaultSince = () => Math.floor(now() / 1000) - DEFAULT_SINCE_DAYS * 86_400;

  /** One GET, the JSON body; throws `UpstreamError` on anything but 2xx. */
  async function get(path, params) {
    const url = `${STRIPE_API}${path}${params ? `?${params}` : ""}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new UpstreamError(`Stripe ${res.status} on ${path}: ${blank(body).slice(0, 200)}`);
    }
    return res.json();
  }

  /** Every page of a list endpoint created at or after `sinceUnix`, newest first. */
  async function listAll(path, sinceUnix) {
    const out = [];
    let after = null;
    for (;;) {
      const params = new URLSearchParams({ limit: String(PAGE_LIMIT), "created[gte]": String(sinceUnix) });
      if (after !== null) params.set("starting_after", after);
      const page = await get(path, params.toString());
      const data = Array.isArray(page?.data) ? page.data : [];
      out.push(...data);
      if (!page?.has_more || data.length === 0) break;
      after = data.at(-1).id;
    }
    return out.sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
  }

  return {
    get configured() {
      return configured;
    },
    /** The balance transactions created at or after `sinceUnix` (seconds), every page, newest first. */
    transactions(sinceUnix = defaultSince()) {
      return cache.get(`stripe:balance_transactions:${sinceUnix}`, ttlMs, () => listAll("/balance_transactions", sinceUnix));
    },
    /** The payouts created at or after `sinceUnix` (seconds), every page, newest first. */
    payouts(sinceUnix = defaultSince()) {
      return cache.get(`stripe:payouts:${sinceUnix}`, ttlMs, () => listAll("/payouts", sinceUnix));
    },
    /** `{ available: [{ amount, currency }], pending: [...] }`, the smallest unit. */
    balance() {
      return cache.get("stripe:balance", ttlMs, () => get("/balance"));
    },
  };
}
