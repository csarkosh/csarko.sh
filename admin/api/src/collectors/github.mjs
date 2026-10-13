/**
 * GitHub, for the public repositories only (`game-dayhike`,
 * `electron-gamepatch`; Cyrus, 2026-10-12: never a private one). Stars,
 * forks and watchers come from `GET /repos/{r}`, which works without a
 * token; the traffic endpoints (views, clones, referrers, 14 days at GitHub)
 * need the fine-grained token. A repository that turns out to be private is
 * refused outright and logged once, so a mistaken `GITHUB_REPOS` entry can
 * never put a private project's numbers on the page.
 */

const API = "https://api.github.com";
const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export function createGitHub({ token, repos, fetch, cache, ttlMs = 300_000, log = console }) {
  const refused = new Set();

  async function call(path, withToken) {
    const headers = { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "csarko-admin" };
    if (withToken && token) headers.authorization = `Bearer ${token}`;
    const res = await fetch(`${API}${path}`, { headers });
    if (!res.ok) throw new Error(`github ${res.status} on ${path}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
    return res.json();
  }

  return {
    repos: repos.filter((r) => REPO_RE.test(r)),
    get configured() {
      return typeof token === "string" && token !== "";
    },
    /** `{ repo, stars, forks, watchers, traffic }`, or null for a repository that must not be reported. */
    repo(repo) {
      return cache.get(`github:${repo}`, ttlMs, async () => {
        const meta = await call(`/repos/${repo}`, true);
        if (meta.private === true) {
          if (!refused.has(repo)) {
            refused.add(repo);
            log.error(`github: ${repo} is private and will not be reported; remove it from GITHUB_REPOS`);
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
    /** Every configured repository, private ones dropped. */
    async all() {
      const rows = await Promise.all(this.repos.map((r) => this.repo(r)));
      return rows.filter((r) => r !== null);
    },
  };
}

/* ---- pure mappings ---- */

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
