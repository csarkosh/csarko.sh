/**
 * YouTube Analytics API v2 (2026-11-01): what only the channel owner can see, per film. Views,
 * engaged views (added 2026-11-03: the views that stayed past a Short's first seconds; the rest
 * swiped away), watch time, average view duration and percentage viewed, subscribers gained, the retention
 * curve, where the views came from (traffic source types, and for External the sites and
 * pages, so a Reddit post shows up by its URL), and who watched (added 2026-11-12: views and
 * engaged views by country and by device, and the age and gender shares). `youtube.mjs` stays the public Data API
 * collector; this one reads the owner's numbers with the owner's consent.
 *
 * The credential is `YOUTUBE_OAUTH`, JSON `{ client_id, client_secret, refresh_token }`, minted
 * once on the Mac by admin/tools/youtube-consent.mjs for the one read-only scope. As in
 * `gsc.mjs`, no Google auth library: the refresh token is traded for an access token at
 * Google's token endpoint by hand, cached 55 minutes. A refused refresh (`invalid_grant`: the
 * consent was revoked, or the consent screen went back to Testing and the token expired after
 * seven days) says how to mint a new one rather than surfacing as a bare 400.
 *
 * Every report is `GET /v2/reports?ids=channel==MINE&...` and answers a table:
 * `columnHeaders` (`{ name, columnType, dataType }`, dimensions first) and `rows`, one array of
 * values per row in the headers' order, absent when there is nothing to report. `rowsOf` turns
 * that into objects, and the mappers below shape each report; they are tested against fixtures
 * written by hand in that documented shape. The numbers move once a day, so reports are cached
 * an hour, and the daily snapshot is the only caller once one exists (queries.mjs `films`).
 *
 * Quota: the Analytics API has its own, far above the twenty or so calls a day the snapshot
 * makes for two films.
 */

import { HOUR } from "../cache.mjs";
import { addDays } from "../time.mjs";

export const READ_SCOPE = "https://www.googleapis.com/auth/yt-analytics.readonly";
export const TOKEN_URL = "https://oauth2.googleapis.com/token";
export const REPORTS_URL = "https://youtubeanalytics.googleapis.com/v2/reports";
export const ANALYTICS_LAG = "YouTube Analytics runs 2 to 3 days behind";
export const CONSENT_EXPIRED = "YouTube consent expired or was revoked: run admin/tools/youtube-consent.mjs";
/** The per-video metrics, in the order the totals and daily reports ask for them. */
export const VIDEO_METRICS = ["views", "engagedViews", "estimatedMinutesWatched", "averageViewDuration", "averageViewPercentage", "subscribersGained", "likes", "shares", "comments"];
/** The traffic source reports' metrics (the retention report takes no views, engaged or not). */
export const SOURCE_METRICS = "views,engagedViews,estimatedMinutesWatched";
/** The External detail report's limit (the API's maximum for insightTrafficSourceDetail). */
export const EXTERNAL_LIMIT = 25;
/** The top videos report's limit: every upload of a small channel. */
const TOP_LIMIT = 200;

export function createYouTubeAnalytics({ oauth, fetch, cache, ttlMs = HOUR }) {
  const configured = oauth !== null && oauth !== undefined;

  async function accessToken() {
    return cache.get(`yta:token:${oauth.client_id}`, 55 * 60_000, async () => {
      const res = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: oauth.client_id, client_secret: oauth.client_secret, refresh_token: oauth.refresh_token, grant_type: "refresh_token" }).toString(),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || typeof body.access_token !== "string") throw new Error(classifyTokenError(res.status, body));
      return body.access_token;
    });
  }

  /** One report: `params` beside ids=channel==MINE, cached by its URL. */
  function report(params) {
    const url = new URL(REPORTS_URL);
    url.searchParams.set("ids", "channel==MINE");
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    return cache.get(`yta:${url.href}`, ttlMs, async () => {
      const token = await accessToken();
      const res = await fetch(url.href, { headers: { authorization: `Bearer ${token}`, accept: "application/json" } });
      if (!res.ok) {
        // A token Google stops honouring inside its hour is dropped, so the next call trades again.
        if (res.status === 401) cache.delete(`yta:token:${oauth.client_id}`);
        throw new Error(classifyApiError(res.status, await res.text().catch(() => "")));
      }
      return res.json();
    });
  }

  return {
    get configured() {
      return configured;
    },
    /**
     * Per video totals over the dates, a Map of video id to `VIDEO_METRICS`. With no `ids`, the
     * channel's top 200 by views (the films and every other upload that had a view); with ids,
     * those videos only.
     */
    async totals(ids, start, end) {
      const filters = Array.isArray(ids) && ids.length > 0 ? `video==${ids.join(",")}` : undefined;
      return totalsOf(await report({ startDate: start, endDate: end, dimensions: "video", metrics: VIDEO_METRICS.join(","), filters, sort: "-views", maxResults: TOP_LIMIT }));
    },
    /** One video by day, every day of the range present (a day with no row is zeros). */
    async daily(id, start, end) {
      return dailyOf(await report({ startDate: start, endDate: end, dimensions: "day", metrics: VIDEO_METRICS.join(","), filters: `video==${id}`, sort: "day" }), start, end);
    },
    /**
     * The retention curve, 100 points: at each hundredth of the runtime, the share of views
     * still watching (`audienceWatchRatio`, past 1 where people rewatch) and how that compares
     * with videos of a similar length (`relativeRetentionPerformance`, 0 to 1, 0.5 the median).
     * One video per call, as the API requires.
     */
    async retention(id, start, end) {
      return retentionOf(await report({ startDate: start, endDate: end, dimensions: "elapsedVideoTimeRatio", metrics: "audienceWatchRatio,relativeRetentionPerformance", filters: `video==${id}`, sort: "elapsedVideoTimeRatio" }));
    },
    /** Views, engaged views and watch time by traffic source type (SHORTS, YT_SEARCH, EXT_URL...), most views first. */
    async sources(id, start, end) {
      return sourcesOf(await report({ startDate: start, endDate: end, dimensions: "insightTrafficSourceType", metrics: SOURCE_METRICS, filters: `video==${id}`, sort: "-views" }));
    },
    /** Views, engaged views and watch time by viewer country (ISO 3166-1 alpha-2), most views first (sorted here, so no `sort` the report might refuse). */
    async countries(id, start, end) {
      return countriesOf(await report({ startDate: start, endDate: end, dimensions: "country", metrics: SOURCE_METRICS, filters: `video==${id}` }));
    },
    /** Views, engaged views and watch time by device type (MOBILE, DESKTOP, TABLET, TV...), most views first. */
    async devices(id, start, end) {
      return devicesOf(await report({ startDate: start, endDate: end, dimensions: "deviceType", metrics: SOURCE_METRICS, filters: `video==${id}` }));
    },
    /**
     * The signed-in viewers' age groups and genders: each pair's share of them, in percent. The
     * demographics report has no views, engaged or not, and no watch time, so it cannot say how
     * long any group watched; YouTube leaves rows out where too few viewers would be shown.
     */
    async demographics(id, start, end) {
      return demographicsOf(await report({ startDate: start, endDate: end, dimensions: "ageGroup,gender", metrics: "viewerPercentage", filters: `video==${id}` }));
    },
    /** External's sites and pages: each URL that sent views, most first, at most 25. */
    async external(id, start, end) {
      return externalOf(await report({ startDate: start, endDate: end, dimensions: "insightTrafficSourceDetail", metrics: SOURCE_METRICS, filters: `video==${id};insightTrafficSourceType==EXT_URL`, sort: "-views", maxResults: EXTERNAL_LIMIT }));
    },
  };
}

/** The token endpoint's refusal, as the thing to do about it. Never echoes the request. */
export function classifyTokenError(status, body) {
  const error = typeof body?.error === "string" ? body.error : "";
  if (error === "invalid_grant") return CONSENT_EXPIRED;
  if (error === "invalid_client" || error === "unauthorized_client") return "YouTube OAuth client was deleted or its secret changed: make a new Desktop client and run admin/tools/youtube-consent.mjs";
  const said = typeof body?.error_description === "string" ? body.error_description : error;
  return `youtube analytics token ${status}${said ? `: ${said.slice(0, 200)}` : ""}`;
}

/** A report's refusal, as the specific thing to fix. */
export function classifyApiError(status, text) {
  let message = "";
  let reason = "";
  try {
    const body = JSON.parse(text);
    message = String(body?.error?.message ?? "");
    reason = String(body?.error?.errors?.[0]?.reason ?? body?.error?.status ?? "");
  } catch {
    message = String(text ?? "");
  }
  if (status === 401) return "youtube analytics 401: the access token was refused; if it persists, run admin/tools/youtube-consent.mjs";
  if (status === 403 && /scope|insufficient/i.test(`${reason} ${message}`)) return `youtube analytics 403: the consent is missing the scope ${READ_SCOPE}; run admin/tools/youtube-consent.mjs`;
  if (status === 403 && /accessNotConfigured|SERVICE_DISABLED|has not been used|is disabled/i.test(`${reason} ${message}`)) return "youtube analytics 403: youtubeanalytics.googleapis.com is not enabled on the project (terraform apply)";
  if (status === 403) return `youtube analytics 403: the signed-in account may not read this channel; consent as the channel's account (pick @csarkosh): ${message.slice(0, 160)}`;
  if (status === 429) return "youtube analytics 429: quota exceeded";
  return `youtube analytics ${status}: ${message.slice(0, 200)}`;
}

/* ---- pure mappings (from the documented v2 report shape: { columnHeaders, rows }) ---- */

const num = (v) => {
  const n = Number(v);
  return v === null || v === undefined || !Number.isFinite(n) ? 0 : n;
};

/** A report's rows as objects keyed by the column names; no rows (the API leaves the key out) is []. */
export function rowsOf(table) {
  const names = (Array.isArray(table?.columnHeaders) ? table.columnHeaders : []).map((h) => String(h?.name ?? ""));
  if (names.length === 0 || !Array.isArray(table?.rows)) return [];
  return table.rows.filter(Array.isArray).map((row) => Object.fromEntries(names.map((name, i) => [name, row[i] ?? null])));
}

/** The metrics of one row, every `VIDEO_METRICS` field a number (a missing one 0). */
export function metricsOf(row) {
  return Object.fromEntries(VIDEO_METRICS.map((m) => [m, num(row?.[m])]));
}

/** A video totals with nothing in the range: zeros. */
export const emptyMetrics = () => metricsOf({});

/** The per video report as a Map of video id to its metrics. */
export function totalsOf(table) {
  return new Map(rowsOf(table).filter((r) => typeof r.video === "string" && r.video).map((r) => [r.video, metricsOf(r)]));
}

/** The by-day report as one row a day from `start` to `end`, `{ day, ...metrics }`, a missing day zeros. */
export function dailyOf(table, start, end) {
  const byDay = new Map(rowsOf(table).map((r) => [String(r.day), r]));
  const out = [];
  for (let day = start; day <= end; day = addDays(day, 1)) out.push({ day, ...metricsOf(byDay.get(day)) });
  return out;
}

/** The retention report as `[{ ratio, watch, relative }]` by ratio (0.01 to 1, a hundredth of the runtime each). */
export function retentionOf(table) {
  return rowsOf(table)
    .map((r) => ({ ratio: num(r.elapsedVideoTimeRatio), watch: num(r.audienceWatchRatio), relative: r.relativeRetentionPerformance === null || r.relativeRetentionPerformance === undefined ? null : num(r.relativeRetentionPerformance) }))
    .sort((a, b) => a.ratio - b.ratio);
}

/** The traffic sources report as `[{ source, views, engaged, minutes }]`, most views first. */
export function sourcesOf(table) {
  return rowsOf(table)
    .map((r) => ({ source: String(r.insightTrafficSourceType ?? ""), views: num(r.views), engaged: num(r.engagedViews), minutes: num(r.estimatedMinutesWatched) }))
    .sort((a, b) => b.views - a.views || b.minutes - a.minutes);
}

/** External's detail report as `[{ url, views, engaged, minutes }]`, most views first. */
export function externalOf(table) {
  return rowsOf(table)
    .map((r) => ({ url: String(r.insightTrafficSourceDetail ?? ""), views: num(r.views), engaged: num(r.engagedViews), minutes: num(r.estimatedMinutesWatched) }))
    .filter((r) => r.url !== "")
    .sort((a, b) => b.views - a.views || b.minutes - a.minutes);
}

/** A views, engaged views and watch time report as `[{ <key>, views, engaged, minutes }]`, most views first. */
function viewsBy(table, dimension, key) {
  return rowsOf(table)
    .map((r) => ({ [key]: String(r[dimension] ?? ""), views: num(r.views), engaged: num(r.engagedViews), minutes: num(r.estimatedMinutesWatched) }))
    .filter((r) => r[key] !== "")
    .sort((a, b) => b.views - a.views || b.minutes - a.minutes);
}

/** The country report as `[{ country, views, engaged, minutes }]`, most views first. */
export const countriesOf = (table) => viewsBy(table, "country", "country");

/** The device type report as `[{ device, views, engaged, minutes }]`, most views first. */
export const devicesOf = (table) => viewsBy(table, "deviceType", "device");

/** The demographics report as `[{ age, gender, percent }]` (age13-17..., female/male/user_specified), youngest first. */
export function demographicsOf(table) {
  return rowsOf(table)
    .map((r) => ({ age: String(r.ageGroup ?? ""), gender: String(r.gender ?? ""), percent: num(r.viewerPercentage) }))
    .filter((r) => r.age !== "" && r.gender !== "")
    .sort((a, b) => a.age.localeCompare(b.age) || a.gender.localeCompare(b.gender));
}
