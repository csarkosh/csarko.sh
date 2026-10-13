/**
 * GoatCounter, the visitor counter on the public site (`site.json` there).
 *
 * The API is `https://<code>.goatcounter.com/api/v0/`, bearer token, 4
 * requests a second. Every call here goes through one queue that starts at
 * most three a second and through the shared cache (five minutes by URL), so
 * eight cards loading at once cost a handful of requests and never a 429. A
 * 429 that does arrive is honoured once, for `X-Rate-Limit-Reset` seconds.
 *
 * Shapes, from `https://www.goatcounter.com/api.json` (read 2026-10-12):
 *
 *   stats/total      { total, total_events, total_utc, stats: [{ day, daily, hourly[] }] }
 *   stats/hits       { hits: [{ path_id, path, title, event, count, stats: [...] }], more, total }
 *   stats/<page>     { stats: [{ id, name, count, ref_scheme }], more }
 *                    page: toprefs, campaigns, locations, sizes, browsers, systems, languages
 *   paths            { paths: [{ id, path, title, event }], more }   (params Limit, After)
 *
 * GoatCounter counts visits, not pageviews (help/sessions: "GoatCounter only
 * counts visits"), so `count` and `daily` are visitors and no pageview figure
 * exists in the API. The mapping below reports `pageviews: null` rather than
 * copying the visit count into a field that would read as something else.
 */

const RATE_PER_SECOND = 3;

export function createGoatCounter({ site, token, fetch, cache, now = Date.now, sleep = defaultSleep, ttlMs = 300_000, log = console }) {
  const base = `https://${site}.goatcounter.com/api/v0/`;
  const starts = [];
  let tail = Promise.resolve();

  // The queue: a request takes the next slot in which fewer than three
  // requests started during the last second. Slot acquisition is serialised
  // through `tail`; the requests themselves run concurrently.
  function slot() {
    const run = tail.then(async () => {
      for (;;) {
        const t = now();
        while (starts.length > 0 && t - starts[0] >= 1000) starts.shift();
        if (starts.length < RATE_PER_SECOND) break;
        await sleep(starts[0] + 1000 - t);
      }
      starts.push(now());
    });
    tail = run.catch(() => undefined);
    return run;
  }

  async function request(url, retried = false) {
    await slot();
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json" } });
    if (res.status === 429 && !retried) {
      const wait = Math.min(30, Math.max(1, Number(res.headers.get("x-rate-limit-reset") ?? "2")));
      log.warn(`goatcounter: 429, waiting ${wait}s`);
      await sleep(wait * 1000);
      return request(url, true);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`goatcounter ${res.status} on ${url.replace(base, "")}: ${body.slice(0, 200)}`);
    }
    return res.json();
  }

  function get(path, params) {
    const url = new URL(path, base);
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      if (Array.isArray(v)) for (const item of v) url.searchParams.append(k, String(item));
      else url.searchParams.set(k, String(v));
    }
    return cache.get(url.href, ttlMs, () => request(url.href));
  }

  return {
    get configured() {
      return typeof token === "string" && token !== "";
    },
    /** Visits per day for the range. */
    total(start, end) {
      return get("stats/total", { start, end });
    },
    /** Every path with its visitors for the range, pages and events alike, paginated to `maxPages`. */
    async hits(start, end, maxPages = 5) {
      const all = [];
      const seen = [];
      for (let page = 0; page < maxPages; page += 1) {
        const res = await get("stats/hits", { start, end, limit: 100, exclude_paths: seen.length > 0 ? seen : undefined });
        const hits = Array.isArray(res.hits) ? res.hits : [];
        all.push(...hits);
        for (const hit of hits) seen.push(hit.path_id);
        if (!res.more || hits.length === 0) break;
      }
      return all;
    },
    /** One of the dashboard panels: toprefs, campaigns, locations, sizes, browsers, systems, languages. */
    async page(name, start, end, limit = 100) {
      const res = await get(`stats/${name}`, { start, end, limit });
      return Array.isArray(res.stats) ? res.stats : [];
    },
  };
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ---- pure mappings, tested against test/fixtures/goatcounter-*.json ---- */

/** Site visits for a `stats/total` response: visitors without events. */
export function visitsOf(total) {
  if (typeof total?.total === "number") return total.total - (typeof total.total_events === "number" ? total.total_events : 0);
  return perDayOf(total).reduce((sum, d) => sum + d.visits, 0);
}

/** `[{ day, visits, pageviews: null }]`, one entry per day in the response, oldest first. */
export function perDayOf(total) {
  const stats = Array.isArray(total?.stats) ? total.stats : [];
  return stats.map((s) => ({ day: String(s.day).slice(0, 10), visits: Number(s.daily ?? 0), pageviews: null }));
}

/** The pages (not events) of a `stats/hits` list, as rows for the page table, most visited first. */
export function pageRowsOf(hits) {
  return hits
    .filter((h) => h.event !== true)
    .map((h) => ({ path: h.path, title: h.title ?? "", visitors: Number(h.count ?? 0), pageviews: null }))
    .sort((a, b) => b.visitors - a.visitors);
}

const EVENT_KINDS = ["out", "play", "watch", "read", "nav"];

/** The kind of an event name from its prefix: `out-github` is an outbound click, `read-<slug>` a read to the end. */
export function eventKindOf(name) {
  const prefix = String(name).replace(/^\//, "").split("-")[0];
  return EVENT_KINDS.includes(prefix) ? prefix : "other";
}

/** The events of a `stats/hits` list. GoatCounter stores an event's name as its path. */
export function eventRowsOf(hits) {
  return hits
    .filter((h) => h.event === true)
    .map((h) => ({ name: String(h.path).replace(/^\//, ""), kind: eventKindOf(h.path), visitors: Number(h.count ?? 0) }))
    .sort((a, b) => b.visitors - a.visitors);
}

/** Outbound clicks over home-page visitors, or null when nobody reached the home page in the range. */
export function outboundRateOf(hits) {
  const home = hits.find((h) => h.event !== true && h.path === "/");
  const homeVisitors = Number(home?.count ?? 0);
  if (homeVisitors === 0) return null;
  const outbound = eventRowsOf(hits).filter((e) => e.kind === "out").reduce((sum, e) => sum + e.visitors, 0);
  return outbound / homeVisitors;
}

/** Sum of the visitors on `out-*` events. */
export function outboundOf(hits) {
  return eventRowsOf(hits).filter((e) => e.kind === "out").reduce((sum, e) => sum + e.visitors, 0);
}

/** A dashboard panel's stats as `[{ name, visitors }]`. */
export function namedRowsOf(stats) {
  return stats.map((s) => ({ name: s.name ?? "", visitors: Number(s.count ?? 0) })).sort((a, b) => b.visitors - a.visitors);
}
