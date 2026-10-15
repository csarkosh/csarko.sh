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
        return locsOf(await res.text());
      });
    },
  };
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
