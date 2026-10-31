/**
 * The monthly step of the donate site: once last month's bill is in, turn its pool into three prices
 * (a share each) and a custom one, make a Stripe payment link for every door and tier, and publish
 * the result as the one JSON object the pages read. It is safe to rerun at any hour. The lookups
 * are the duplicate guard: before creating anything the step looks for what an earlier run made, a
 * product by its `metadata[donate]` and tier, a price by its `lookup_key` (`donate:<month>:<tier>`,
 * which also carries the pool the price was cut from, so a rerun after the data moved publishes the
 * pool Stripe holds), a link by its month, door and tier. A price's and a link's idempotency key
 * carries the day (`donate:price:<month>:<tier>:<today>`, `donate:link:<month>:<door>:<tier>:<today>`),
 * so it guards only a retry within one run: Stripe replays a key's first answer for 24 hours, a 500
 * included, and a key without the day would make the next day's run meet the same failure.
 *
 * The budget: the snapshot route has 60 s for everything it does, so the step must stay well under
 * 30 s. A first run is about eight sequential creates (the products and prices) and then one batch of
 * four concurrent link creates per door, the doors still one after another, instead of about thirty
 * sequential calls.
 *
 * Nothing is written to the bucket until every create has succeeded. A run that writes a month
 * retires nothing. The first later run that finds the month done sweeps instead, deactivating the
 * links and archiving the prices of every month older than the previous one, each failure logged
 * and left for the next day. The previous month's stay live for one more month: the deployed
 * pages bake its links in as their fallback, and the site is redeployed once a month after the new
 * prices land, so a visitor whose fetch fails still meets a live checkout. A door shipped
 * mid-month gets its links at the month's current prices and touches nothing else.
 */

import { addMonths, cents } from "../finance/rows.mjs";
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
      const found = existing.find((p) => p.active !== false && p.metadata?.donate === "1" && p.metadata?.tier === t.key);
      const id = found ? found.id : (await writer.createProduct({ name: t.name, tier: t.key, key: `donate:product:${t.key}` }))?.id;
      products[t.key] = need(id, `product id for ${t.key}`);
    }
    return products;
  }

  /** The month's prices: those already in Stripe reused, the rest created at the pool they were cut from. */
  async function pricesFor(month, monthlyRows, today) {
    const existing = new Map((await writer.listPrices()).filter((p) => typeof p.lookup_key === "string").map((p) => [p.lookup_key, p]));
    const lookupOf = (tier) => `donate:${month}:${tier}`;
    const foundPools = TIER_KEYS.map((t) => Number(existing.get(lookupOf(t))?.metadata?.pool)).filter((n) => Number.isFinite(n));
    const pool = foundPools.length > 0 ? foundPools[0] : cents(poolOf(monthlyRows, month));
    const products = await productsOf();
    const metadataOf = (tier) => ({ donate: "1", month, tier, pool: String(pool) });

    const tiers = [];
    for (const p of pricesOf(pool)) {
      const found = existing.get(lookupOf(p.tier));
      const id = found ? found.id : (await writer.createPrice({ product: products[p.tier], usd: p.usd, key: `donate:price:${month}:${p.tier}:${today}`, lookupKey: lookupOf(p.tier), metadata: metadataOf(p.tier) }))?.id;
      tiers.push({ ...p, priceId: need(id, `price id for ${p.tier}`) });
    }
    const foundOwn = existing.get(lookupOf(CUSTOM.key));
    const ownId = foundOwn ? foundOwn.id : (await writer.createCustomPrice({ product: products[CUSTOM.key], minimumUsd: CUSTOM.minimumUsd, key: `donate:price:${month}:${CUSTOM.key}:${today}`, lookupKey: lookupOf(CUSTOM.key), metadata: metadataOf(CUSTOM.key) }))?.id;
    return { pool, tiers, custom: { priceId: need(ownId, "custom price id"), minimumUsd: CUSTOM.minimumUsd }, products };
  }

  /**
   * A door's four links: the active ones already made for this month reused, the rest created
   * concurrently (one batch a door, for the budget above).
   */
  async function linksFor(door, month, tiers, custom, existing, today) {
    const priceIds = { ...Object.fromEntries(tiers.map((t) => [t.tier, t.priceId])), [CUSTOM.key]: custom.priceId };
    const made = await Promise.all(TIER_KEYS.map(async (tier) => {
      const found = existing.find((l) => l.metadata?.month === month && l.metadata?.door === door && l.metadata?.tier === tier);
      const link = found ?? await writer.createLink({
        priceId: priceIds[tier], door, tier, month, share: SHARES[tier] ?? 0,
        redirectUrl: `${DONATE_URL}/thanks?door=${door}`,
        key: `donate:link:${month}:${door}:${tier}:${today}`,
      });
      return [tier, { id: need(link?.id, `link id for ${door}/${tier}`), url: need(link?.url, `link url for ${door}/${tier}`) }];
    }));
    return { links: Object.fromEntries(made) };
  }

  /**
   * Links and prices two or more months older than `month` retired (the previous month's are kept
   * for the baked fallback); each failure logged, none fatal.
   */
  async function sweep(month) {
    const swept = { links: 0, prices: 0 };
    const keep = addMonths(month, -1);
    const monthOfKey = (key) => /^donate:(\d{4}-\d{2}):/.exec(key)?.[1] ?? null;
    try {
      const attempt = async (what, fn, counter) => {
        try {
          await fn();
          swept[counter] += 1;
        } catch (error) {
          log.error(`donate: retiring ${what} failed`, error);
        }
      };
      for (const l of await writer.listLinks()) {
        if (l.metadata?.donate === "1" && typeof l.metadata.month === "string" && l.metadata.month < keep) await attempt(`link ${l.id}`, () => writer.deactivateLink(l.id), "links");
      }
      for (const p of await writer.listPrices()) {
        const old = typeof p.lookup_key === "string" ? monthOfKey(p.lookup_key) : null;
        if (old !== null && old < keep) await attempt(`price ${p.id}`, () => writer.archivePrice(p.id), "prices");
      }
    } catch (error) {
      log.error("donate: listing the old months' objects to retire failed", error);
    }
    return swept;
  }

  return {
    get configured() {
      return Boolean(writer?.configured && bucket?.configured);
    },
    async run({ monthlyRows, failed = [], today, gcpFirstDay = null }) {
      const current = await bucket.read();
      const d = decide({
        today, failed, gcpFirstDay,
        current: current ? { month: current.month, doors: Object.keys(current.doors ?? {}) } : null,
        doors: shippedDoors().map((x) => x.door),
      });
      if (!d.run) {
        const out = { ran: false, reason: d.reason, record: recordOf(current) };
        if (d.reason === "done" && current) out.swept = await sweep(current.month);
        return out;
      }

      const base = d.newMonth
        ? await pricesFor(d.month, monthlyRows, today)
        : { pool: current.pool, tiers: current.tiers, custom: current.custom, products: current.products };
      const existingLinks = d.pending.length > 0 ? await writer.listLinks() : [];
      const doors = d.newMonth ? {} : { ...current.doors };
      for (const door of d.pending) doors[door] = await linksFor(door, d.month, base.tiers, base.custom, existingLinks, today);

      const next = {
        month: d.month, pool: base.pool, at: d.newMonth ? new Date(now()).toISOString() : current.at,
        tiers: base.tiers, custom: base.custom, products: base.products, doors,
      };
      await bucket.write(next);
      return { ran: true, reason: d.reason, record: recordOf(next) };
    },
  };
}
