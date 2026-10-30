/**
 * Stripe, the donate site's writer: the write-side sibling of `stripe.mjs`. It makes the products,
 * prices and payment links the donate pages send people to: `POST https://api.stripe.com/v1/products`,
 * `/prices`, `/payment_links` and the `active=false` updates that retire a link or a price, each with
 * `Authorization: Bearer <STRIPE_WRITE_KEY>` and, on a create, an `Idempotency-Key` so a retry never
 * makes a second object. The key is a restricted one, Products write and Payment Links write and
 * nothing else (Prices are written under Products), so it cannot read a charge, a customer or a balance;
 * `listProducts` is the one read, and it names only the account's own catalogue. Nothing read here is
 * ever passed to a page as is.
 *
 * A refused or failed call is an `UpstreamError` with the status and the first 200 characters of
 * Stripe's body, with the key itself blanked should Stripe ever echo it.
 */

import { UpstreamError } from "../http.mjs";

export const STRIPE_API = "https://api.stripe.com/v1";

export function createStripeWriter({ key: apiKey, fetch, log = console }) {
  const configured = typeof apiKey === "string" && apiKey !== "";
  const headers = { accept: "application/json", authorization: `Bearer ${apiKey}`, "user-agent": "csarko-admin" };
  const blank = (s) => (configured ? String(s).split(apiKey).join("[key]") : String(s));

  async function send(path, init) {
    const res = await fetch(`${STRIPE_API}${path}`, init);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const message = `Stripe ${res.status} on ${path.split("?")[0]}: ${blank(body).slice(0, 200)}`;
      log.error(message);
      throw new UpstreamError(message);
    }
    return res.json();
  }

  /** One GET, the JSON body. */
  function get(path, params) {
    return send(`${path}${params ? `?${params}` : ""}`, { headers });
  }

  /** One form-encoded POST, the JSON body; `idempotencyKey` is sent when it is a string. */
  function post(path, fields, idempotencyKey) {
    const body = new URLSearchParams();
    for (const [name, value] of Object.entries(fields)) body.set(name, String(value));
    const h = { ...headers, "content-type": "application/x-www-form-urlencoded" };
    if (typeof idempotencyKey === "string") h["Idempotency-Key"] = idempotencyKey;
    return send(path, { method: "POST", headers: h, body: body.toString() });
  }

  return {
    get configured() {
      return configured;
    },
    /** The active products, `[{ id, name, metadata }]`; one page of 100 is plenty for five. */
    async listProducts() {
      const page = await get("/products", new URLSearchParams({ active: "true", limit: "100" }).toString());
      return Array.isArray(page?.data) ? page.data : [];
    },
    async createProduct({ name, tier, key }) {
      const p = await post("/products", { name, "metadata[tier]": tier }, key);
      return { id: p.id };
    },
    async createPrice({ product, usd, key }) {
      const p = await post("/prices", { product, currency: "usd", unit_amount: usd * 100 }, key);
      return { id: p.id };
    },
    /** A pay-what-you-want price with a floor of `minimumUsd`. */
    async createCustomPrice({ product, minimumUsd, key }) {
      const p = await post("/prices", { product, currency: "usd", "custom_unit_amount[enabled]": "true", "custom_unit_amount[minimum]": minimumUsd * 100 }, key);
      return { id: p.id };
    },
    async createLink({ priceId, door, tier, month, share, redirectUrl, key }) {
      const meta = { door, tier, month, share: String(share) };
      const fields = { "line_items[0][price]": priceId, "line_items[0][quantity]": 1, submit_type: "donate" };
      for (const [k, v] of Object.entries(meta)) fields[`metadata[${k}]`] = v;
      for (const [k, v] of Object.entries(meta)) fields[`payment_intent_data[metadata][${k}]`] = v;
      fields["payment_intent_data[statement_descriptor_suffix]"] = "DONATION";
      fields["after_completion[type]"] = "redirect";
      fields["after_completion[redirect][url]"] = redirectUrl;
      const l = await post("/payment_links", fields, key);
      return { id: l.id, url: l.url };
    },
    async deactivateLink(id) {
      await post(`/payment_links/${id}`, { active: "false" });
    },
    async archivePrice(id) {
      await post(`/prices/${id}`, { active: "false" });
    },
  };
}
