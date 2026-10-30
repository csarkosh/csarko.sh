/**
 * The monthly step of the donate site: once last month's bill is in, turn its pool into four prices
 * (a share each) and a custom one, make a Stripe payment link for every door and tier, and publish
 * the result as the one JSON object the pages read. It is idempotent: every Stripe create carries
 * a key named for the month, door and tier, so a rerun after a failure gets back what the first
 * run made, and nothing is written to the bucket until every create has succeeded. Last month's
 * links and prices are retired only after the new ones exist, so a visitor never meets a dead link;
 * a retirement that fails is logged and left for a person, because the new prices are already live.
 * A door shipped mid-month gets its links at the month's current prices and touches nothing else.
 */

import { cents } from "../finance/rows.mjs";
import { CUSTOM, DONATE_URL, TIERS, TIER_KEYS, shippedDoors } from "./doors.mjs";
import { decide, poolOf, pricesOf } from "./prices.mjs";

const SHARES = Object.fromEntries(TIERS.map((t) => [t.key, t.share]));

/** The writer returns what Stripe gave; an id that is not a non-empty string is a failed create. */
function need(value, what) {
  if (typeof value !== "string" || value === "") throw new Error(`donate: Stripe returned no ${what}`);
  return value;
}

export function createDonateStep({ writer, bucket, now = Date.now, log = console }) {
  const recordOf = (json) =>
    json ? { month: json.month, pool: json.pool, at: json.at, doors: Object.keys(json.doors ?? {}) } : null;

  async function productsOf() {
    const existing = await writer.listProducts();
    const products = {};
    for (const t of [...TIERS, CUSTOM]) {
      const found = existing.find((p) => p.active !== false && p.metadata?.tier === t.key);
      products[t.key] = found
        ? need(found.id, `product id for ${t.key}`)
        : need((await writer.createProduct({ name: t.name, tier: t.key, key: `donate:product:${t.key}` })).id, `product id for ${t.key}`);
    }
    return products;
  }

  async function pricesFor(month, pool) {
    const products = await productsOf();
    const tiers = [];
    for (const p of pricesOf(pool)) {
      const priceId = need((await writer.createPrice({ product: products[p.tier], usd: p.usd, key: `donate:price:${month}:${p.tier}` })).id, `price id for ${p.tier}`);
      tiers.push({ ...p, priceId });
    }
    const customId = need((await writer.createCustomPrice({ product: products[CUSTOM.key], minimumUsd: CUSTOM.minimumUsd, key: `donate:price:${month}:${CUSTOM.key}` })).id, "custom price id");
    return { tiers, custom: { priceId: customId, minimumUsd: CUSTOM.minimumUsd }, products };
  }

  async function linksFor(door, month, tiers, custom) {
    const priceIds = { ...Object.fromEntries(tiers.map((t) => [t.tier, t.priceId])), [CUSTOM.key]: custom.priceId };
    const links = {};
    for (const tier of TIER_KEYS) {
      const link = await writer.createLink({
        priceId: priceIds[tier], door, tier, month, share: SHARES[tier] ?? 0,
        redirectUrl: `${DONATE_URL}/thanks?door=${door}`,
        key: `donate:link:${month}:${door}:${tier}`,
      });
      links[tier] = { id: need(link?.id, `link id for ${door}/${tier}`), url: need(link?.url, `link url for ${door}/${tier}`) };
    }
    return { links };
  }

  /** Last month's links deactivated and prices archived; each failure logged, none fatal. */
  async function retire(old) {
    const attempt = async (what, fn) => {
      try {
        await fn();
      } catch (error) {
        log.error(`donate: retiring ${what} failed`, error);
      }
    };
    for (const door of Object.values(old.doors ?? {})) {
      for (const link of Object.values(door.links ?? {})) if (link?.id) await attempt(`link ${link.id}`, () => writer.deactivateLink(link.id));
    }
    for (const t of old.tiers ?? []) if (t?.priceId) await attempt(`price ${t.priceId}`, () => writer.archivePrice(t.priceId));
    if (old.custom?.priceId) await attempt(`price ${old.custom.priceId}`, () => writer.archivePrice(old.custom.priceId));
  }

  return {
    get configured() {
      return Boolean(writer?.configured && bucket?.configured);
    },
    async run({ monthlyRows, failed, today }) {
      const current = await bucket.read();
      const d = decide({
        today, failed,
        current: current ? { month: current.month, doors: Object.keys(current.doors ?? {}) } : null,
        doors: shippedDoors().map((x) => x.door),
      });
      if (!d.run) return { ran: false, reason: d.reason, record: recordOf(current) };

      let base;
      if (d.newMonth) {
        const pool = cents(poolOf(monthlyRows, d.month));
        base = { pool, ...(await pricesFor(d.month, pool)) };
      } else {
        base = { pool: current.pool, tiers: current.tiers, custom: current.custom, products: current.products };
      }
      const doors = d.newMonth ? {} : { ...current.doors };
      for (const door of d.pending) doors[door] = await linksFor(door, d.month, base.tiers, base.custom);

      const next = {
        month: d.month, pool: base.pool, at: new Date(now()).toISOString(),
        tiers: base.tiers, custom: base.custom, products: base.products, doors,
      };
      if (!d.newMonth) { next.month = current.month; next.at = current.at; }
      if (d.newMonth && current !== null) await retire(current);
      await bucket.write(next);
      return { ran: true, reason: d.reason, record: recordOf(next) };
    },
  };
}
