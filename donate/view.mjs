// The donate pages' logic that the browser shares with the build: which prices to show, what the
// button says and where the thanks page links back to. Pure and browser-safe (no Node imports):
// the build copies this file to /view.js beside /app.js, which imports it.

/** The tier selected when the page loads, and the one an unknown key falls back to. */
export const DEFAULT_TIER = 'context';
export const OWN_TIER = 'own';
export const PROJECTS_BACK = Object.freeze({ label: 'Back to the projects', href: 'https://csarko.sh/projects' });

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const own = (obj, key) => isObject(obj) && typeof key === 'string' && Object.hasOwn(obj, key);

/** "2026-10" → "October"; anything else → "". */
export function monthName(month) {
  const m = MONTH.exec(String(month ?? ''));
  return m ? MONTHS[Number(m[1]) - 1] : '';
}

/**
 * The prices a door shows. `baked` is the build's copy for this door ({ month, pool, tiers:
 * [{ tier, usd, label }], links: { <tier>: url } }); `fetched` is the bucket's whole prices.json,
 * or whatever the fetch produced. The live one wins when it is a month at least as new as the baked
 * one and carries this door; it is reshaped to the baked shape. Otherwise the baked prices stand,
 * marked stale, so the page says which month they are from.
 */
export function pickPrices(baked, fetched, door) {
  const fallback = { prices: baked, stale: true };
  if (!isObject(fetched) || typeof fetched.month !== 'string' || !MONTH.test(fetched.month)) return fallback;
  if (fetched.month < baked.month || !own(fetched.doors, door) || !isObject(fetched.doors[door].links)) return fallback;
  const links = {};
  for (const [tier, link] of Object.entries(fetched.doors[door].links)) {
    if (own(link, 'url') && typeof link.url === 'string' && !/^\s*javascript:/i.test(link.url)) links[tier] = link.url;
  }
  const tiers = Array.isArray(fetched.tiers)
    ? fetched.tiers.filter((t) => isObject(t) && typeof t.tier === 'string' && Number.isFinite(t.usd)).map(({ tier, usd, label }) => ({ tier, usd, label: String(label ?? '') }))
    : [];
  const pool = Number.isFinite(fetched.pool) ? fetched.pool : baked.pool;
  return { prices: { month: fetched.month, pool, tiers: tiers.length ? tiers : baked.tiers, links }, stale: false };
}

/** The button's words for a tier: its price, or "what you like" for the free row. */
export function buttonLabel(tierKey, prices) {
  if (tierKey === OWN_TIER) return 'Tip what you like';
  const tiers = prices?.tiers ?? [];
  const tier = tiers.find((t) => t.tier === tierKey) ?? tiers.find((t) => t.tier === DEFAULT_TIER);
  return tier ? `Tip $${tier.usd}` : 'Tip what you like';
}

/** The thanks page's one link: the door's own when `door` names one in `doors`, else the projects page. */
export function backLink(door, doors) {
  const back = own(doors, door) ? doors[door].back : null;
  if (isObject(back) && typeof back.label === 'string' && typeof back.href === 'string' && back.href.startsWith('https://')) return back;
  return { ...PROJECTS_BACK };
}

/** The thanks page's line for a door, else the plain one. */
export function thanksLine(door, doors) {
  const line = own(doors, door) ? doors[door].thanks : null;
  return typeof line === 'string' && line ? line : 'Tokens received.';
}
