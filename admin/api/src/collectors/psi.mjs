/**
 * Lighthouse's performance score for the home page, from the PageSpeed
 * Insights API (API key, 25,000 runs a day free, each one 20 to 40 seconds).
 * Run once a day by the snapshot and read back from Firestore; a live run
 * happens only when there is no snapshot yet, and that one is cached an
 * hour so a page refresh does not start another. Mobile strategy, as
 * `site-quality`'s own Lighthouse runs use.
 */

import { HOUR } from "../cache.mjs";

const API = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

export function createPsi({ key, siteUrl, fetch, cache, ttlMs = HOUR }) {
  return {
    get configured() {
      return typeof key === "string" && key !== "";
    },
    /** `{ performance (0 to 100), at }` for the home page, or throws. */
    performance() {
      return cache.get(`psi:${siteUrl}`, ttlMs, async () => {
        const url = new URL(API);
        url.searchParams.set("url", `${siteUrl}/`);
        url.searchParams.set("category", "performance");
        url.searchParams.set("strategy", "mobile");
        url.searchParams.set("key", key);
        const res = await fetch(url.href, { headers: { accept: "application/json" } });
        if (!res.ok) throw new Error(`psi ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
        return scoreOf(await res.json());
      });
    },
  };
}

/** Lighthouse reports the category score as 0 to 1; the page shows 0 to 100 like the Lighthouse report does. */
export function scoreOf(body) {
  const raw = body?.lighthouseResult?.categories?.performance?.score;
  return {
    performance: typeof raw === "number" ? Math.round(raw * 100) : null,
    at: body?.analysisUTCTimestamp ?? body?.lighthouseResult?.fetchTime ?? null,
  };
}
