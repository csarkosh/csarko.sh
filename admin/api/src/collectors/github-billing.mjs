/**
 * GitHub's usage (the enhanced billing platform): `GET /users/<owner>/settings/billing/usage`
 * for the current month and the one before, with the API's GitHub token, which needs the
 * fine-grained Plan: read permission. The repositories are public, so the net is $0 and the
 * gross is what the minutes and storage would cost if they were private. Read by the daily
 * snapshot job; a request reads the snapshot. Not configured without the token.
 */

const API = "https://api.github.com";
const OWNER_RE = /^[A-Za-z0-9-]+$/;

export function createGitHubBilling({ token, owner, fetch, cache, now = Date.now, ttlMs = 300_000 }) {
  const account = typeof owner === "string" && OWNER_RE.test(owner) ? owner : null;
  const configured = typeof token === "string" && token !== "" && account !== null;

  async function call(path) {
    const headers = { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "csarko-admin", authorization: `Bearer ${token}` };
    const res = await fetch(`${API}${path}`, { headers });
    if (!res.ok) throw new Error(`github ${res.status} on ${path}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
    return res.json();
  }

  const monthItems = (year, month) => cache.get(`github-billing:${account}:${year}-${month}`, ttlMs, async () => {
    const body = await call(`/users/${account}/settings/billing/usage?year=${year}&month=${month}`);
    return Array.isArray(body?.usageItems) ? body.usageItems : [];
  });

  return {
    get configured() {
      return configured;
    },
    /** `{ months, days, lastDay }` over the current and previous month's usage items (see shapeUsage). */
    async usage() {
      const d = new Date(now());
      const y = d.getUTCFullYear();
      const m = d.getUTCMonth() + 1;
      const [py, pm] = m === 1 ? [y - 1, 12] : [y, m - 1];
      const [cur, prev] = await Promise.all([monthItems(y, m), monthItems(py, pm)]);
      return shapeUsage([...prev, ...cur]);
    },
  };
}

/* ---- pure mappings ---- */

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const round4 = (n) => Math.round(n * 1e4) / 1e4;

/**
 * Usage items (`date, product, sku, quantity, unitType, pricePerUnit, grossAmount,
 * discountAmount, netAmount, repositoryName`) folded into one row a month a product a SKU a
 * repository and one a day the same, each `{ product, sku, repo, quantity, unitType, gross, net }`
 * (`repo` the repository without the owner, `game-dayhike`, null for an account-level item; the
 * finance page's projects axis reads it), plus the last day any item names.
 */
export function shapeUsage(items) {
  const months = new Map();
  const days = new Map();
  let lastDay = null;
  const fold = (map, when, field, it) => {
    const repo = repoOf(it.repositoryName);
    const key = `${when}\u0000${it.product}\u0000${it.sku}\u0000${repo ?? ""}`;
    const row = map.get(key) ?? { [field]: when, product: String(it.product ?? ""), sku: String(it.sku ?? ""), repo, quantity: 0, unitType: it.unitType ?? null, gross: 0, net: 0 };
    row.quantity += num(it.quantity);
    row.gross += num(it.grossAmount);
    row.net += num(it.netAmount);
    map.set(key, row);
  };
  for (const it of Array.isArray(items) ? items : []) {
    const day = String(it?.date ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    fold(months, day.slice(0, 7), "month", it);
    fold(days, day, "day", it);
    if (lastDay === null || day > lastDay) lastDay = day;
  }
  const finish = (map) => [...map.values()].map((r) => ({ ...r, quantity: round4(r.quantity), gross: round4(r.gross), net: round4(r.net) })).sort((a, b) => (a.month ?? a.day).localeCompare(b.month ?? b.day) || a.product.localeCompare(b.product) || a.sku.localeCompare(b.sku) || String(a.repo).localeCompare(String(b.repo)));
  return { months: finish(months), days: finish(days), lastDay };
}

/** `game-dayhike` of `csarkosh/game-dayhike`; null when the item names no repository. */
export function repoOf(repositoryName) {
  const s = String(repositoryName ?? "").trim();
  if (s === "") return null;
  return s.includes("/") ? s.slice(s.lastIndexOf("/") + 1) : s;
}
