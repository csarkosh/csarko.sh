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

const httpsUrl = (u) => {
  try {
    return typeof u === 'string' && new URL(u).protocol === 'https:';
  } catch {
    return false;
  }
};

/**
 * The prices a door shows. `baked` is the build's copy for this door ({ door, month, pool, tiers:
 * [{ tier, usd, label }], links: { <tier>: url } }); `fetched` is the bucket's whole prices.json,
 * or whatever the fetch produced. The live one wins when it is a month at least as new as the baked
 * one and carries this door with an https link for every tier the baked one has (so the button can
 * never say one tier's price and pay another's); it is reshaped to the baked shape. Otherwise the
 * baked prices stand, marked stale, so the page says which month they are from.
 */
export function pickPrices(baked, fetched, door) {
  const fallback = { prices: baked, stale: true };
  if (!isObject(fetched) || typeof fetched.month !== 'string' || !MONTH.test(fetched.month)) return fallback;
  if (fetched.month < baked.month || !own(fetched.doors, door) || !isObject(fetched.doors[door])) return fallback;
  const live = fetched.doors[door].links;
  if (!isObject(live)) return fallback;
  const links = {};
  for (const tier of Object.keys(baked.links)) {
    const url = own(live, tier) && isObject(live[tier]) ? live[tier].url : null;
    if (!httpsUrl(url)) return fallback;
    links[tier] = url;
  }
  // Every tier the baked prices show needs a live price too, or its row and button would go stale.
  const tiers = [];
  for (const { tier } of baked.tiers) {
    const t = Array.isArray(fetched.tiers) ? fetched.tiers.find((x) => isObject(x) && x.tier === tier) : null;
    if (!t || !Number.isFinite(t.usd)) return fallback;
    tiers.push({ tier, usd: t.usd, label: String(t.label ?? '') });
  }
  if (!Number.isFinite(fetched.pool)) return fallback;
  return { prices: { door, month: fetched.month, pool: fetched.pool, tiers, links }, stale: false };
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
