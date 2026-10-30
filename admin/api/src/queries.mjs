/**
 * The eight saved queries, the index's KPIs and the daily snapshot: each
 * one asks the collectors it needs and shapes the answer for the page
 * (`admin/CONTRACT.md`). Nothing here talks to the network directly; the
 * collectors do, through the shared cache, so this file is tested with
 * fakes. The snapshot also runs the finance step when `finance`
 * (finance-queries.mjs) is given, merging its part into the day's document.
 *
 * Two conventions keep a half-configured service useful. A source whose
 * credential is missing yields `null` for its part of the answer and a
 * `notConfigured: { <part>: "<ENV NAME>" }` hint, never a 500, so the page
 * can say which secret to add. A source that is configured but fails yields
 * `null` and an `errors: { <part>: "<message>" }` entry when the answer has
 * other parts worth showing; a query with one source throws, which the route
 * turns into a 500.
 */

import * as gscMap from "./collectors/gsc.mjs";
import { groupReferrers } from "./referrers.mjs";
import { pathsOf, normalizePath } from "./collectors/sitemap.mjs";
import { assessHealth } from "./health.mjs";
import { addDays, isoDate, hourlyRange, dailyRangeThrough } from "./time.mjs";

export const QUERY_NAMES = ["visits", "pages", "referrers", "events", "journeys", "audience", "search", "reach", "health"];
export const MANUAL_KEYS = ["substack"];
export const APP_NAME = "csarko.sh";
export const TREND_WEEKS = 12;

// toc, doc, next, series and end are a doc page's own links (its contents, a link in its text to
// another doc, Keep reading, the series line and the link after the author box); section is a
// section read for 5 s (2026-10-23).
const EVENT_KINDS = ["out", "play", "watch", "read", "nav", "start", "filter", "toc", "doc", "next", "series", "end", "section"];
/** The kind of an event name from its prefix: `out-github` is an outbound click, `read-<slug>` a read to the end; `link-<host>` (an unnamed link out) is `out` too. */
export function eventKindOf(name) {
  const prefix = String(name).split("-")[0];
  if (prefix === "link") return "out";
  return EVENT_KINDS.includes(prefix) ? prefix : "other";
}
/** Outbound clicks, the count: every out-* and link-* row's clicks summed (the KPI and the snapshot's `outbound7`). */
const outboundOf = (rows) => rows.filter((r) => eventKindOf(r.name) === "out").reduce((n, r) => n + (r.clicks ?? r.visitors), 0);

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

export function createQueries({ visits, gsc, youtube, github, hn, psi, uptime, hosting, sitemap, store, config, finance = null, now = Date.now, log = console }) {
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

  /** A Search Console range ending on the last day Google has finished, not today (see time.mjs). */
  async function searchRange(days, nowMs = now()) {
    return dailyRangeThrough(days, await gsc.completeThrough(isoDate(nowMs)));
  }

  const requireVisits = () => (visits.configured ? null : { notConfigured: { visits: "VISITS_DATASET" } });

  async function sitemapPaths(h) {
    const urls = await part(h, "sitemap", "SITEMAP_URL", true, () => sitemap.urls());
    return urls === null ? null : pathsOf(urls);
  }

  async function notFoundOf(rows, h) {
    const paths = await sitemapPaths(h);
    if (paths === null) return null;
    return rows.filter((r) => r.visitors > 0 && !paths.has(normalizePath(r.path))).map((r) => ({ path: r.path, visitors: r.visitors }));
  }

  const queries = {
    // The perDay rows are cut on the reader's days (`tz`, the page's zone; `dayLabel` names it,
    // "utc" for UTC), and days=1 is the last 24 hours, not a calendar day.
    async visits(days, tz = "UTC") {
      const range = hourlyRange(days, now());
      const head = { days, from: range.start, to: range.end, dayLabel: tz === "UTC" ? "utc" : tz, ...(days === 1 ? { label: "last 24 hours" } : {}) };
      const empty = requireVisits();
      if (empty) return { ...head, current: null, previous: null, ...empty };
      const { current, previous } = await visits.visits(range, tz);
      return { ...head, current, previous };
    },

    async pages(days) {
      const empty = requireVisits();
      if (empty) return { rows: null, ...empty };
      const range = hourlyRange(days, now());
      const h = hints();
      const [rows, paths] = await Promise.all([visits.pages(range), sitemapPaths(h)]);
      return withHints({ rows: rows.map((r) => ({ ...r, inSitemap: paths === null ? null : paths.has(normalizePath(r.path)) })) }, h);
    },

    async referrers(days) {
      const empty = requireVisits();
      if (empty) return { groups: null, rows: null, campaigns: null, paths: null, ...empty };
      const range = hourlyRange(days, now());
      const r = await visits.referrers(range);
      return { ...groupReferrers(r.referrers.map((x) => ({ name: x.name, count: x.visitors }))), campaigns: r.campaigns, paths: r.paths };
    },

    async events(days) {
      const empty = requireVisits();
      if (empty) return { rows: null, outboundVisitors: null, outboundRate: null, ...empty };
      const range = hourlyRange(days, now());
      const e = await visits.events(range);
      const rows = e.rows.map((r) => ({ name: r.name, kind: eventKindOf(r.name), visitors: r.visitors, clicks: r.clicks }));
      // Distinct visitors who clicked out at all over the home page's, so it cannot pass 100%.
      return { rows, outboundVisitors: e.outboundVisitors, outboundRate: e.homeVisitors > 0 ? Math.min(1, e.outboundVisitors / e.homeVisitors) : null };
    },

    async journeys(days) {
      const empty = requireVisits();
      if (empty) return { rows: null, ...empty };
      return { rows: await visits.journeys(hourlyRange(days, now())) };
    },

    async audience(days) {
      const empty = requireVisits();
      if (empty) return { countries: null, sizes: null, browsers: null, systems: null, languages: null, themes: null, viewports: null, touch: null, timezones: null, ...empty };
      return visits.audience(hourlyRange(days, now()));
    },

    async search(days) {
      const base = { lag: gscMap.GSC_LAG };
      if (!gsc.configured) return { ...base, perDay: null, totals: null, previous: null, queries: null, pages: null, indexed: null, sitemap: null, notConfigured: { search: "GSC_SA_KEY" } };
      const r = await searchRange(days);
      const h = hints();
      const [dateRows, prevRows, queryRows, pageRows, urls, latest] = await Promise.all([
        gsc.query({ startDate: r.startDate, endDate: r.endDate, dimensions: ["date"] }),
        gsc.query({ startDate: r.prevStartDate, endDate: r.prevEndDate, dimensions: ["date"] }),
        gsc.query({ startDate: r.startDate, endDate: r.endDate, dimensions: ["query"], rowLimit: 100 }),
        gsc.query({ startDate: r.startDate, endDate: r.endDate, dimensions: ["page"], rowLimit: 100 }),
        part(h, "sitemap", "SITEMAP_URL", true, () => sitemap.urls()),
        store.latestSnapshot(),
      ]);
      const perDay = gscMap.perDayOf(dateRows, r.startDate, r.endDate);
      const prevTotals = gscMap.totalsOf(gscMap.perDayOf(prevRows, r.prevStartDate, r.prevEndDate));
      // The indexing result is the daily snapshot's (see health()); live only before the first snapshot.
      const stored = latest?.indexed ?? null;
      const [indexed, sitemapState] = await Promise.all([
        stored ?? (urls === null ? null : part(h, "indexed", "GSC_SA_KEY", true, () => gsc.indexedOf(urls))),
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
        indexedAt: indexed === null ? null : stored === null ? new Date(now()).toISOString() : latest.at ?? null,
        sitemap: sitemapState,
      }, h);
    },

    async reach() {
      const h = hints();
      const today = isoDate(now());
      const [snapshots, channel, repos, mentions, series] = await Promise.all([
        store.listSnapshots(addDays(today, -14), today),
        part(h, "youtube", "YOUTUBE_KEY", youtube.configured, () => youtube.channel()),
        part(h, "github", "GITHUB_OWNER", github.enabled, () => github.all()),
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
      const [live, latest, lastDeployAt, pageRows, urls, sitemapState] = await Promise.all([
        uptime.check(),
        store.latestSnapshot(),
        part(h, "hosting", "HOSTING_SITE", true, () => hosting.lastDeployAt()),
        part(h, "visits", "VISITS_DATASET", visits.configured, () => visits.pages(range)),
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
      const notFound = pageRows === null ? null : await notFoundOf(pageRows, h);
      // Indexing comes from the snapshot as well: a URL inspection takes 5 to
      // 7 s, so the sitemap's 33 cost a cold instance a minute when they ran
      // on the request (seen 2026-10-13: 60 s and a 504). The daily job
      // inspects them once; a request inspects live only while no snapshot
      // holds a result, as on day one.
      const stored = latest?.indexed ?? null;
      const indexedFull = stored ?? (urls === null ? null : await part(h, "indexed", "GSC_SA_KEY", gsc.configured, () => gsc.indexedOf(urls)));
      const indexed = indexedFull === null ? null : { indexed: indexedFull.indexed, total: indexedFull.total };
      const indexedAt = indexedFull === null ? null : stored === null ? new Date(now()).toISOString() : latest.at ?? null;
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
        indexedAt,
        overall,
      }, h);
    },

    async kpis() {
      const h = hints();
      const today = isoDate(now());
      const range = hourlyRange(7, now());
      const [snapshots, visitsKpi, outbound, search, health] = await Promise.all([
        store.listSnapshots(addDays(today, -7 * TREND_WEEKS + 1), today),
        part(h, "visits", "VISITS_DATASET", visits.configured, async () => {
          const { current, previous } = await visits.visits(range);
          return { value: current.visits, prev: previous.visits };
        }),
        part(h, "outbound", "VISITS_DATASET", visits.configured, async () => {
          const prevRange = { ...range, start: range.prevStart, end: range.prevEnd, prevStart: range.prevStart, prevEnd: range.prevStart };
          const [cur, prev] = await Promise.all([visits.events(range), visits.events(prevRange)]);
          return { value: outboundOf(cur.rows), prev: outboundOf(prev.rows) };
        }),
        part(h, "search", "GSC_SA_KEY", gsc.configured, async () => {
          const daily = await searchRange(28);
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
          kpi("visits", "Visits, 7 days", visitsKpi?.value ?? null, visitsKpi?.prev ?? null, "visits7"),
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
      const gscTotals = (days) => searchRange(days, t).then((r) => gsc.query({ startDate: r.startDate, endDate: r.endDate, dimensions: ["date"] }).then((rows) => gscMap.totalsOf(gscMap.perDayOf(rows, r.startDate, r.endDate))));
      const [total, evs, s28, s7, channel, repos, score, live, urls] = await Promise.all([
        part(h, "visits", "VISITS_DATASET", visits.configured, () => visits.visits(range)),
        part(h, "events", "VISITS_DATASET", visits.configured, () => visits.events(range)),
        part(h, "search28", "GSC_SA_KEY", gsc.configured, () => gscTotals(28)),
        part(h, "search7", "GSC_SA_KEY", gsc.configured, () => gscTotals(7)),
        part(h, "youtube", "YOUTUBE_KEY", youtube.configured, () => youtube.channel()),
        part(h, "github", "GITHUB_OWNER", github.enabled, () => github.all()),
        part(h, "lighthouse", "PSI_KEY", psi.configured, () => psi.performance()),
        uptime.check(),
        part(h, "sitemap", "SITEMAP_URL", true, () => sitemap.urls()),
      ]);
      // The one place the sitemap's URLs are inspected (5 to 7 s each, in
      // parallel): once a day here, read by health() and search() after.
      const indexed = urls === null ? null : await part(h, "indexed", "GSC_SA_KEY", gsc.configured, () => gsc.indexedOf(urls));
      // The finance step (finance-queries.mjs `snapshotPart`): the day's Cost Explorer calls and
      // GitHub usage, stored under `finance`. Its own sources carry their own hints inside it; a
      // failure of the step as a whole is `errors.finance` and the rest of the day is still written.
      const financePart = finance === null ? null : await part(h, "finance", "AWS_COST_ROLE_ARN", true, () => finance.snapshotPart());
      const githubDoc = {};
      for (const r of repos ?? []) {
        githubDoc[r.repo] = { stars: r.stars, views14: r.traffic?.views ?? null, uniques14: r.traffic?.uniques ?? null, clones14: r.traffic?.clones ?? null };
      }
      const doc = {
        at: new Date(t).toISOString(),
        visits7: total === null ? null : total.current.visits,
        pageviews7: null,
        searchClicks28: s28?.clicks ?? null,
        impressions28: s28?.impressions ?? null,
        searchClicks7: s7?.clicks ?? null,
        impressions7: s7?.impressions ?? null,
        outbound7: evs === null ? null : outboundOf(evs.rows),
        youtube: channel === null ? null : { subscribers: channel.subscribers, views: channel.views },
        github: githubDoc,
        lighthousePerformance: score?.performance ?? null,
        indexed: indexed === null ? null : { indexed: indexed.indexed, total: indexed.total, missing: indexed.missing },
        up: live.up,
        ttfbMs: live.ttfbMs,
        ...(financePart ?? {}),
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
