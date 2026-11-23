/**
 * The public site's sitemap, which is the list of pages that exist: a path
 * the visits log has that is not in it is a 404 somebody actually hit (the 404
 * page has no canonical, so the log records the path asked for), and the
 * `indexed n of m` card counts against it. Fetched once an hour.
 */

import { HOUR } from "../cache.mjs";

export function createSitemap({ url, fetch, cache, ttlMs = HOUR }) {
  return {
    url,
    /** Every `<loc>` in document order. */
    urls() {
      return cache.get(`sitemap:${url}`, ttlMs, async () => {
        const res = await fetch(url, { headers: { accept: "application/xml, text/xml" } });
        if (!res.ok) throw new Error(`sitemap ${res.status} on ${url}`);
        const text = await res.text();
        // A host with no sitemap can answer 200 with a page instead (games.csarko.sh's catch-all
        // rewrite serves its redirect page at /sitemap.xml, 2026-11-23): that is no list of pages,
        // and reading it as an empty one called every page of the host a 404.
        if (!isSitemap(text)) throw new NotASitemap(url);
        return locsOf(text);
      });
    },
  };
}

/** A host's answer at its sitemap address that is not a sitemap: the host has none. */
export class NotASitemap extends Error {
  constructor(url) {
    super(`no sitemap at ${url} (the answer is not a urlset or sitemapindex)`);
    this.name = "NotASitemap";
  }
}

/** Whether a body is a sitemap or a sitemap index, as opposed to an HTML page served in its place. */
export function isSitemap(text) {
  return /<(?:[\w-]+:)?(?:urlset|sitemapindex)[\s>]/.test(String(text));
}

/** The `<loc>` texts of a sitemap. A regex is enough here: the file is the site's own and has one shape. */
export function locsOf(xml) {
  const out = [];
  for (const match of String(xml).matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) out.push(decodeEntities(match[1]));
  return out;
}

function decodeEntities(text) {
  return text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

/** The paths of the sitemap's URLs, so the visits log's paths can be checked against them: `/`, `/research/<slug>`. */
export function pathsOf(urls) {
  const paths = new Set();
  for (const u of urls) {
    try {
      const path = new URL(u).pathname.replace(/\/+$/, "") || "/";
      paths.add(path);
    } catch {
      // Not a URL: skip it rather than fail the page over one bad line.
    }
  }
  return paths;
}

/** A visits-log path with its query string and trailing slash dropped, the way the sitemap spells it. */
export function normalizePath(path) {
  const bare = String(path).split(/[?#]/)[0].replace(/\/+$/, "");
  return bare === "" ? "/" : bare;
}
