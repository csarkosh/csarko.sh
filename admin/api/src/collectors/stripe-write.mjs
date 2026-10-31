/**
 * Stripe, the donate site's writer: the write-side sibling of `stripe.mjs`. It makes the products,
 * prices and payment links the donate pages send people to: `POST https://api.stripe.com/v1/products`,
 * `/prices`, `/payment_links` and the `active=false` updates that retire a link or a price, each with
 * `Authorization: Bearer <STRIPE_WRITE_KEY>` and, on a create, an `Idempotency-Key` so a retry never
 * makes a second object. The key is a restricted one, Products write and Payment Links write and
 * nothing else (Prices are written under Products), so it cannot read a charge, a customer or a balance;
 * the reads (`listProducts`, `listPrices`, `listLinks`) name only the account's own catalogue and the
 * step uses them to find what an earlier run already made, since an idempotency key lives only 24
 * hours and a price's `lookup_key` and every object's `metadata[donate]=1` outlive it. Nothing read
 * here is ever passed to a page as is.
 *
 * A refused or failed call is an `UpstreamError` with the status and the first 200 characters of
 * Stripe's body, with the key itself blanked should Stripe ever echo it.
 */

import { UpstreamError } from "../http.mjs";

export const STRIPE_API = "https://api.stripe.com/v1";

/** The form fields of a price's lookup key and metadata. */
function tagging(lookupKey, metadata) {
  const fields = {};
  if (typeof lookupKey === "string") {
    fields.lookup_key = lookupKey;
    fields.transfer_lookup_key = "true";
  }
  for (const [k, v] of Object.entries(metadata ?? {})) fields[`metadata[${k}]`] = v;
  return fields;
}

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

  /** Every item of a list endpoint, newest first, following `starting_after` while `has_more`. */
  async function listAll(path, extra = {}) {
    const out = [];
    let after = null;
    for (let page = 0; page < 50; page += 1) {
      const params = new URLSearchParams({ ...extra, limit: "100" });
      if (after !== null) params.set("starting_after", after);
      const body = await get(path, params.toString());
      const data = Array.isArray(body?.data) ? body.data : [];
      out.push(...data);
      if (!body?.has_more || data.length === 0) break;
      after = data[data.length - 1].id;
    }
    return out;
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
      const p = await post("/products", { name, "metadata[tier]": tier, "metadata[donate]": "1" }, key);
      return { id: p.id };
    },
    /** The active prices, every page, newest first. */
    listPrices() {
      return listAll("/prices", { active: "true" });
    },
    /** The active payment links, every page, newest first. */
    listLinks() {
      return listAll("/payment_links", { active: "true" });
    },
    /** A fixed price; `lookupKey` (taken over from an inactive holder) and `metadata` are optional. */
    async createPrice({ product, usd, key, lookupKey, metadata }) {
      const p = await post("/prices", { product, currency: "usd", unit_amount: usd * 100, ...tagging(lookupKey, metadata) }, key);
      return { id: p.id };
    },
    /** A pay-what-you-want price with a floor of `minimumUsd`. */
    async createCustomPrice({ product, minimumUsd, key, lookupKey, metadata }) {
      const p = await post("/prices", { product, currency: "usd", "custom_unit_amount[enabled]": "true", "custom_unit_amount[minimum]": minimumUsd * 100, ...tagging(lookupKey, metadata) }, key);
      return { id: p.id };
    },
    async createLink({ priceId, door, tier, period, share, redirectUrl, key }) {
      const meta = { door, tier, period, share: String(share) };
      const fields = { "line_items[0][price]": priceId, "line_items[0][quantity]": 1, submit_type: "donate", "metadata[donate]": "1" };
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
