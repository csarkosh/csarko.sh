/**
 * Hacker News mentions of the site, through Algolia's public HN search (no
 * key). Two searches: stories whose URL contains the host, and comments
 * that mention it. Cached five minutes; the answer is almost always zero
 * and that is fine, the card exists for the day it is not.
 */

const API = "https://hn.algolia.com/api/v1/search";

export function createHackerNews({ query, fetch, cache, ttlMs = 300_000 }) {
  async function search(params) {
    const url = new URL(API);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await fetch(url.href, { headers: { accept: "application/json", "user-agent": "csarko-admin" } });
    if (!res.ok) throw new Error(`hn ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
    return res.json();
  }

  return {
    /** `{ mentions, items: [{ title, url, points, at }] }`. */
    mentions() {
      return cache.get(`hn:${query}`, ttlMs, async () => {
        const [stories, comments] = await Promise.all([
          search({ query, restrictSearchableAttributes: "url", tags: "story", hitsPerPage: "50" }),
          search({ query, tags: "comment", hitsPerPage: "50" }),
        ]);
        return mentionsOf(stories, comments);
      });
    },
  };
}

/* ---- pure mapping ---- */

export function mentionsOf(stories, comments) {
  const items = [];
  for (const h of stories?.hits ?? []) {
    items.push({ title: h.title ?? "", url: h.url ?? `https://news.ycombinator.com/item?id=${h.objectID}`, points: Number(h.points ?? 0), at: h.created_at ?? null, kind: "story" });
  }
  for (const h of comments?.hits ?? []) {
    items.push({ title: h.story_title ? `Comment on: ${h.story_title}` : "Comment", url: `https://news.ycombinator.com/item?id=${h.objectID}`, points: Number(h.points ?? 0), at: h.created_at ?? null, kind: "comment" });
  }
  items.sort((a, b) => String(b.at ?? "").localeCompare(String(a.at ?? "")));
  return { mentions: items.length, items };
}
