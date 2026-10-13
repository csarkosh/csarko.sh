/**
 * GitHub, for every public repository of one account (`GITHUB_OWNER`,
 * `csarkosh`), found by listing it: `GET /users/{owner}/repos` answers with
 * the public ones only, whoever asks, so a private repository can never be
 * reported (Cyrus, 2026-10-12: never a private one; 2026-10-13: all the
 * public ones, not a fixed list). Forks are left out: their traffic is the
 * upstream's story. The list is cached an hour, each repository's numbers
 * five minutes.
 *
 * Stars, forks and watchers come from `GET /repos/{r}`, which works without
 * a token; the traffic endpoints (views, clones, referrers, 14 days at
 * GitHub) need the fine-grained token with Administration: read on the
 * repository. A repository the token does not cover keeps its stars and
 * carries `trafficError`. Should `GET /repos/{r}` ever say a repository is
 * private, it is refused outright and logged once, belt and braces.
 */

import { HOUR } from "../cache.mjs";

const API = "https://api.github.com";
const OWNER_RE = /^[A-Za-z0-9-]+$/;

export function createGitHub({ token, owner, fetch, cache, ttlMs = 300_000, listTtlMs = HOUR, log = console }) {
  const refused = new Set();
  const account = typeof owner === "string" && OWNER_RE.test(owner) ? owner : null;

  async function call(path, withToken) {
    const headers = { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "csarko-admin" };
    if (withToken && token) headers.authorization = `Bearer ${token}`;
    const res = await fetch(`${API}${path}`, { headers });
    if (!res.ok) throw new Error(`github ${res.status} on ${path}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
    return res.json();
  }

  return {
    /** The account whose public repositories are reported, or null when none is configured. */
    owner: account,
    /** Whether there is anything to report: an account to list. */
    get enabled() {
      return account !== null;
    },
    /** Whether traffic can be read: the token is present. */
    get configured() {
      return typeof token === "string" && token !== "";
    },
    /** The account's public repositories, forks left out, as `owner/name`, alphabetical; cached an hour. */
    list() {
      if (account === null) return Promise.resolve([]);
      return cache.get(`github:list:${account}`, listTtlMs, async () => {
        const names = [];
        for (let page = 1; page <= 10; page += 1) {
          // Without the token on purpose: the public listing is the same for
          // everyone, and it can only ever contain public repositories.
          const rows = await call(`/users/${account}/repos?type=owner&per_page=100&page=${page}`, false);
          names.push(...publicNamesOf(rows));
          if (rows.length < 100) break;
        }
        return names.sort((a, b) => a.localeCompare(b));
      });
    },
    /** `{ repo, stars, forks, watchers, traffic }`, or null for a repository that must not be reported. */
    repo(repo) {
      return cache.get(`github:${repo}`, ttlMs, async () => {
        const meta = await call(`/repos/${repo}`, true);
        if (meta.private === true) {
          if (!refused.has(repo)) {
            refused.add(repo);
            log.error(`github: ${repo} is private and will not be reported`);
          }
          return null;
        }
        const row = { repo, ...metaOf(meta), traffic: null };
        if (!token) return row;
        // Traffic is a separate permission (Administration: read on the repo).
        // A token without it answers 403; stars still count, so the row keeps
        // them and says why the traffic is missing rather than failing whole.
        try {
          const [views, clones, referrers] = await Promise.all([
            call(`/repos/${repo}/traffic/views`, true),
            call(`/repos/${repo}/traffic/clones`, true),
            call(`/repos/${repo}/traffic/popular/referrers`, true),
          ]);
          row.traffic = trafficOf(views, clones, referrers);
        } catch (error) {
          row.trafficError = error instanceof Error ? error.message : String(error);
          if (!refused.has(`${repo}:traffic`)) {
            refused.add(`${repo}:traffic`);
            log.error(`github: ${repo} traffic unavailable (the token needs Administration: read on the repo): ${row.trafficError}`);
          }
        }
        return row;
      });
    },
    /** Every public repository of the account, in the list's order. */
    async all() {
      const rows = await Promise.all((await this.list()).map((r) => this.repo(r)));
      return rows.filter((r) => r !== null);
    },
  };
}

/* ---- pure mappings ---- */

/** The `owner/name` of each public, non-fork repository in a listing; anything else is dropped. */
export function publicNamesOf(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter((r) => r && r.private === false && r.fork !== true && typeof r.full_name === "string")
    .map((r) => r.full_name);
}

export function metaOf(meta) {
  return { stars: Number(meta.stargazers_count ?? 0), forks: Number(meta.forks_count ?? 0), watchers: Number(meta.subscribers_count ?? meta.watchers_count ?? 0) };
}

export function trafficOf(views, clones, referrers) {
  return {
    views: Number(views?.count ?? 0),
    uniques: Number(views?.uniques ?? 0),
    clones: Number(clones?.count ?? 0),
    referrers: (Array.isArray(referrers) ? referrers : []).map((r) => ({ referrer: String(r.referrer ?? ""), count: Number(r.count ?? 0), uniques: Number(r.uniques ?? 0) })),
  };
}
