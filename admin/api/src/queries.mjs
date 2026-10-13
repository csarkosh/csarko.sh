/**
 * The eight saved queries, the index's KPIs and the daily snapshot: each
 * one asks the collectors it needs and shapes the answer for the page
 * (`admin/CONTRACT.md`). Nothing here talks to the network directly; the
 * collectors do, through the shared cache, so this file is tested with
 * fakes.
 *
 * Two conventions keep a half-configured service useful. A source whose
 * credential is missing yields `null` for its part of the answer and a
 * `notConfigured: { <part>: "<ENV NAME>" }` hint, never a 500, so the page
 * can say which secret to add. A source that is configured but fails yields
 * `null` and an `errors: { <part>: "<message>" }` entry when the answer has
 * other parts worth showing; a query with one source throws, which the route
 * turns into a 500.
 */

import * as gcMap from "./collectors/goatcounter.mjs";
import * as gscMap from "./collectors/gsc.mjs";
import { groupReferrers } from "./referrers.mjs";
import { pathsOf, normalizePath } from "./collectors/sitemap.mjs";
import { assessHealth } from "./health.mjs";
import { addDays, isoDate, hourlyRange, dailyRange } from "./time.mjs";

export const QUERY_NAMES = ["visits", "pages", "referrers", "events", "audience", "search", "reach", "health"];
export const MANUAL_KEYS = ["substack"];
export const APP_NAME = "csarko.sh";
export const TREND_WEEKS = 12;

export function isQueryName(name) {
  return QUERY_NAMES.includes(name);
}

export function isManualKey(key) {
  return MANUAL_KEYS.includes(key);
}

/**
 * Twelve weekly values from daily snapshots: for each of the last twelve
 * weeks ending today, the `field` of the latest snapshot in that week. The
 * snapshot's 7-day counters are rolling, so the snapshot taken on a week's
 * last day is that week's total; an earlier one is the closest we have, and
 * a week with no snapshot is zero, not missing, so the sparkline keeps its
 * twelve slots.
 */
export function weeklyTrend(snapshots, field, today, weeks = TREND_WEEKS) {
  const out = [];
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const weekEnd = addDays(today, -7 * i);
    const weekStart = addDays(weekEnd, -6);
    let pick = null;
    for (const s of snapshots) if (s.date >= weekStart && s.date <= weekEnd && (pick === null || s.date > pick.date)) pick = s;
    const value = pick === null ? 0 : Number(pick[field]);
    out.push(Number.isFinite(value) ? value : 0);
  }
  return out;
}

/** The snapshot of `daysAgo` days back, or the nearest older one within a week, or null. */
export function snapshotAgo(snapshots, today, daysAgo = 7) {
  const target = addDays(today, -daysAgo);
  const floor = addDays(target, -6);
  let pick = null;
  for (const s of snapshots) if (s.date <= target && s.date >= floor && (pick === null || s.date > pick.date)) pick = s;
  return pick;
}

export function createQueries({ gc, gsc, youtube, github, hn, psi, uptime, hosting, sitemap, store, config, now = Date.now, log = console }) {
  /** Runs one part of an answer, reporting a missing credential or a failure instead of throwing. */
  async function part(hints, name, envName, configured, fn) {
    if (!configured) {
      hints.notConfigured[name] = envName;
      return null;
    }
    try {
      return await fn();
    } catch (error) {
      log.error(`admin: ${name} failed`, error);
      hints.errors[name] = error instanceof Error ? error.message : String(error);
      return null;
    }
  }

  const hints = () => ({ notConfigured: {}, errors: {} });
  const withHints = (body, h) => ({
    ...body,
    ...(Object.keys(h.notConfigured).length > 0 ? { notConfigured: h.notConfigured } : {}),
    ...(Object.keys(h.errors).length > 0 ? { errors: h.errors } : {}),
  });

  const requireGc = () => {
    if (!gc.configured) return { notConfigured: { goatcounter: "GOATCOUNTER_TOKEN" } };
    return null;
  };

  async function sitemapPaths(h) {
    const urls = await part(h, "sitemap", "SITEMAP_URL", true, () => sitemap.urls());
    return urls === null ? null : pathsOf(urls);
  }

  async function notFoundOf(hits, h) {
    const paths = await sitemapPaths(h);
    if (paths === null) return null;
    return gcMap.pageRowsOf(hits)
      .filter((r) => r.visitors > 0 && !paths.has(normalizePath(r.path)))
      .map((r) => ({ path: r.path, visitors: r.visitors }));
  }

  const queries = {
    async visits(days) {
      const range = hourlyRange(days, now());
      const empty = requireGc();
      if (empty) return { days, from: range.start, to: range.end, current: null, previous: null, ...empty };
      const [cur, prev] = await Promise.all([gc.total(range.start, range.end), gc.total(range.prevStart, range.prevEnd)]);
      const shape = (t) => ({ visits: gcMap.visitsOf(t), pageviews: null, perDay: gcMap.perDayOf(t) });
      return { days, from: range.start, to: range.end, current: shape(cur), previous: shape(prev) };
    },

    async pages(days) {
      const empty = requireGc();
      if (empty) return { rows: null, ...empty };
      const range = hourlyRange(days, now());
      const h = hints();
      const [hits, paths] = await Promise.all([gc.hits(range.start, range.end), sitemapPaths(h)]);
      const rows = gcMap.pageRowsOf(hits).map((r) => ({ ...r, inSitemap: paths === null ? null : paths.has(normalizePath(r.path)) }));
      return withHints({ rows }, h);
    },

    async referrers(days) {
      const empty = requireGc();
      if (empty) return { groups: null, rows: null, campaigns: null, ...empty };
      const range = hourlyRange(days, now());
      const [refs, campaigns] = await Promise.all([gc.page("toprefs", range.start, range.end), gc.page("campaigns", range.start, range.end)]);
      return { ...groupReferrers(refs), campaigns: gcMap.namedRowsOf(campaigns).map((c) => ({ campaign: c.name, visitors: c.visitors })) };
    },

    async events(days) {
      const empty = requireGc();
      if (empty) return { rows: null, outboundRate: null, ...empty };
      const range = hourlyRange(days, now());
      const hits = await gc.hits(range.start, range.end);
      return { rows: gcMap.eventRowsOf(hits), outboundRate: gcMap.outboundRateOf(hits) };
    },

    async audience(days) {
      const empty = requireGc();
      if (empty) return { countries: null, sizes: null, browsers: null, systems: null, languages: null, ...empty };
      const range = hourlyRange(days, now());
      const panel = (name) => gc.page(name, range.start, range.end, 50).then(gcMap.namedRowsOf);
      const [countries, sizes, browsers, systems, languages] = await Promise.all(["locations", "sizes", "browsers", "systems", "languages"].map(panel));
      return { countries, sizes, browsers, systems, languages };
    },

    async search(days) {
      const base = { lag: gscMap.GSC_LAG };
      if (!gsc.configured) return { ...base, perDay: null, totals: null, previous: null, queries: null, pages: null, indexed: null, sitemap: null, notConfigured: { search: "GSC_SA_KEY" } };
      const r = dailyRange(days, now());
      const h = hints();
      const [dateRows, prevRows, queryRows, pageRows, urls] = await Promise.all([
        gsc.query({ startDate: r.startDate, endDate: r.endDate, dimensions: ["date"] }),
        gsc.query({ startDate: r.prevStartDate, endDate: r.prevEndDate, dimensions: ["date"] }),
        gsc.query({ startDate: r.startDate, endDate: r.endDate, dimensions: ["query"], rowLimit: 100 }),
        gsc.query({ startDate: r.startDate, endDate: r.endDate, dimensions: ["page"], rowLimit: 100 }),
        part(h, "sitemap", "SITEMAP_URL", true, () => sitemap.urls()),
      ]);
      const perDay = gscMap.perDayOf(dateRows, r.startDate, r.endDate);
      const prevTotals = gscMap.totalsOf(gscMap.perDayOf(prevRows, r.prevStartDate, r.prevEndDate));
      const [indexed, sitemapState] = await Promise.all([
        urls === null ? null : part(h, "indexed", "GSC_SA_KEY", true, () => gsc.indexedOf(urls)),
        part(h, "sitemapState", "GSC_SA_KEY", true, () => gsc.sitemap(config.sitemapUrl)),
      ]);
      return withHints({
        ...base,
        from: r.startDate,
        to: r.endDate,
        perDay,
        totals: gscMap.totalsOf(perDay),
        previous: { clicks: prevTotals.clicks, impressions: prevTotals.impressions },
        queries: gscMap.topRowsOf(queryRows, "query"),
        pages: gscMap.topRowsOf(pageRows, "page").map(({ page, clicks, impressions }) => ({ page, clicks, impressions })),
        indexed,
        sitemap: sitemapState,
      }, h);
    },

    async reach() {
      const h = hints();
      const today = isoDate(now());
      const [snapshots, channel, repos, mentions, series] = await Promise.all([
        store.listSnapshots(addDays(today, -14), today),
        part(h, "youtube", "YOUTUBE_KEY", youtube.configured, () => youtube.channel()),
        part(h, "github", "GITHUB_REPOS", github.repos.length > 0, () => github.all()),
        part(h, "hn", "HN", true, () => hn.mentions()),
        store.getManual("substack"),
      ]);
      if (repos !== null && !github.configured) h.notConfigured.githubTraffic = "GITHUB_TOKEN";
      const ago = snapshotAgo(snapshots, today, 7);
      const yt = channel === null ? null : { ...channel, prev: ago?.youtube ? { subscribers: ago.youtube.subscribers ?? null, views: ago.youtube.views ?? null } : null };
      return withHints({ youtube: yt, github: repos, hn: mentions, substack: { series } }, h);
    },

    async health(days = 7) {
      const h = hints();
      const range = hourlyRange(days, now());
      const [live, latest, lastDeployAt, hits, urls, sitemapState] = await Promise.all([
        uptime.check(),
        store.latestSnapshot(),
        part(h, "hosting", "HOSTING_SITE", true, () => hosting.lastDeployAt()),
        part(h, "goatcounter", "GOATCOUNTER_TOKEN", gc.configured, () => gc.hits(range.start, range.end)),
        part(h, "sitemap", "SITEMAP_URL", true, () => sitemap.urls()),
        part(h, "sitemapState", "GSC_SA_KEY", gsc.configured, () => gsc.sitemap(config.sitemapUrl)),
      ]);
      let lighthousePerformance = latest?.lighthousePerformance ?? null;
      let lighthouseAt = typeof latest?.lighthousePerformance === "number" ? latest.at ?? null : null;
      if (latest === null) {
        // No snapshot yet: run Lighthouse once (cached an hour) so the card is not empty on day one.
        const score = await part(h, "lighthouse", "PSI_KEY", psi.configured, () => psi.performance());
        lighthousePerformance = score?.performance ?? null;
        lighthouseAt = score?.at ?? null;
      }
      const notFound = hits === null ? null : await notFoundOf(hits, h);
      const indexedFull = urls === null ? null : await part(h, "indexed", "GSC_SA_KEY", gsc.configured, () => gsc.indexedOf(urls));
      const indexed = indexedFull === null ? null : { indexed: indexedFull.indexed, total: indexedFull.total };
      const sitemapFetchedAt = sitemapState?.lastDownloaded ?? null;
      const overall = assessHealth({ ...live, lighthousePerformance, indexed, notFound, sitemapFetchedAt, now: now() });
      return withHints({
        up: live.up,
        status: live.status,
        ttfbMs: live.ttfbMs,
        certDaysLeft: live.certDaysLeft,
        lighthousePerformance,
        lighthouseAt,
        lastDeployAt,
        notFound,
        sitemapFetchedAt,
        indexed,
        overall,
      }, h);
    },

    async kpis() {
      const h = hints();
      const today = isoDate(now());
      const range = hourlyRange(7, now());
      const daily = dailyRange(28, now());
      const [snapshots, visits, outbound, search, health] = await Promise.all([
        store.listSnapshots(addDays(today, -7 * TREND_WEEKS + 1), today),
        part(h, "visits", "GOATCOUNTER_TOKEN", gc.configured, async () => {
          const [cur, prev] = await Promise.all([gc.total(range.start, range.end), gc.total(range.prevStart, range.prevEnd)]);
          return { value: gcMap.visitsOf(cur), prev: gcMap.visitsOf(prev) };
        }),
        part(h, "outbound", "GOATCOUNTER_TOKEN", gc.configured, async () => {
          const [cur, prev] = await Promise.all([gc.hits(range.start, range.end), gc.hits(range.prevStart, range.prevEnd)]);
          return { value: gcMap.outboundOf(cur), prev: gcMap.outboundOf(prev) };
        }),
        part(h, "search", "GSC_SA_KEY", gsc.configured, async () => {
          const [cur, prev] = await Promise.all([
            gsc.query({ startDate: daily.startDate, endDate: daily.endDate, dimensions: ["date"] }),
            gsc.query({ startDate: daily.prevStartDate, endDate: daily.prevEndDate, dimensions: ["date"] }),
          ]);
          return { cur: gscMap.totalsOf(gscMap.perDayOf(cur, daily.startDate, daily.endDate)), prev: gscMap.totalsOf(gscMap.perDayOf(prev, daily.prevStartDate, daily.prevEndDate)) };
        }),
        part(h, "health", "SITE_URL", true, () => queries.health(7)),
      ]);
      const kpi = (key, label, value, prev, field) => ({ key, label, value, prev, unit: "", trend: weeklyTrend(snapshots, field, today) });
      return withHints({
        app: APP_NAME,
        at: new Date(now()).toISOString(),
        kpis: [
          kpi("visits", "Visits, 7 days", visits?.value ?? null, visits?.prev ?? null, "visits7"),
          kpi("search", "Search clicks, 28 days", search?.cur.clicks ?? null, search?.prev.clicks ?? null, "searchClicks7"),
          kpi("impressions", "Impressions, 28 days", search?.cur.impressions ?? null, search?.prev.impressions ?? null, "impressions7"),
          kpi("outbound", "Outbound clicks, 7 days", outbound?.value ?? null, outbound?.prev ?? null, "outbound7"),
        ],
        health: health?.overall ?? { status: "warning", note: "health check failed" },
      }, h);
    },

    /** Today's snapshot, every collector once; merged into `snapshots/<date>` so a rerun on the same day refreshes rather than duplicates. */
    async snapshot() {
      const h = hints();
      const t = now();
      const date = isoDate(t);
      const range = hourlyRange(7, t);
      const d28 = dailyRange(28, t);
      const d7 = dailyRange(7, t);
      const gscTotals = (r) => gsc.query({ startDate: r.startDate, endDate: r.endDate, dimensions: ["date"] }).then((rows) => gscMap.totalsOf(gscMap.perDayOf(rows, r.startDate, r.endDate)));
      const [total, hits, s28, s7, channel, repos, score, live] = await Promise.all([
        part(h, "visits", "GOATCOUNTER_TOKEN", gc.configured, () => gc.total(range.start, range.end)),
        part(h, "events", "GOATCOUNTER_TOKEN", gc.configured, () => gc.hits(range.start, range.end)),
        part(h, "search28", "GSC_SA_KEY", gsc.configured, () => gscTotals(d28)),
        part(h, "search7", "GSC_SA_KEY", gsc.configured, () => gscTotals(d7)),
        part(h, "youtube", "YOUTUBE_KEY", youtube.configured, () => youtube.channel()),
        part(h, "github", "GITHUB_REPOS", github.repos.length > 0, () => github.all()),
        part(h, "lighthouse", "PSI_KEY", psi.configured, () => psi.performance()),
        uptime.check(),
      ]);
      const githubDoc = {};
      for (const r of repos ?? []) {
        githubDoc[r.repo] = { stars: r.stars, views14: r.traffic?.views ?? null, uniques14: r.traffic?.uniques ?? null, clones14: r.traffic?.clones ?? null };
      }
      const doc = {
        at: new Date(t).toISOString(),
        visits7: total === null ? null : gcMap.visitsOf(total),
        pageviews7: null,
        searchClicks28: s28?.clicks ?? null,
        impressions28: s28?.impressions ?? null,
        searchClicks7: s7?.clicks ?? null,
        impressions7: s7?.impressions ?? null,
        outbound7: hits === null ? null : gcMap.outboundOf(hits),
        youtube: channel === null ? null : { subscribers: channel.subscribers, views: channel.views },
        github: githubDoc,
        lighthousePerformance: score?.performance ?? null,
        up: live.up,
        ttfbMs: live.ttfbMs,
        ...(Object.keys(h.notConfigured).length > 0 ? { notConfigured: h.notConfigured } : {}),
        ...(Object.keys(h.errors).length > 0 ? { errors: h.errors } : {}),
      };
      return store.writeSnapshot(date, doc);
    },

    /** Appends one hand-entered point to `manual/<key>`. */
    async manual(key, value) {
      const at = new Date(now()).toISOString();
      await store.appendManual(key, { at, value });
      return { ok: true, at };
    },
  };

  return queries;
}
