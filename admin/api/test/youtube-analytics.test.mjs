import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createCache } from "../src/cache.mjs";
import {
  createYouTubeAnalytics, rowsOf, totalsOf, dailyOf, retentionOf, sourcesOf, externalOf, classifyTokenError, classifyApiError,
  CONSENT_EXPIRED, TOKEN_URL, REPORTS_URL, VIDEO_METRICS,
} from "../src/collectors/youtube-analytics.mjs";

// Hand-written in the documented v2 response shape (see the fixture's _note): no live access.
const FIX = JSON.parse(readFileSync(new URL("./fixtures/youtube-analytics-reports.json", import.meta.url), "utf8"));
const OAUTH = { client_id: "fake.apps.googleusercontent.com", client_secret: "fake-secret", refresh_token: "1//fake-refresh" };

function fakeFetch(calls, { token = { status: 200, body: { access_token: "at-1", expires_in: 3599, token_type: "Bearer" } }, report = () => FIX.totals, reportStatus = 200 } = {}) {
  return async (url, init = {}) => {
    calls.push({ url, method: init.method ?? "GET", body: init.body, auth: init.headers?.authorization });
    if (url === TOKEN_URL) return { ok: token.status < 400, status: token.status, json: async () => token.body, text: async () => JSON.stringify(token.body) };
    const body = report(new URL(url));
    return { ok: reportStatus < 400, status: reportStatus, json: async () => body, text: async () => JSON.stringify(body) };
  };
}

test("not configured without the consent", () => {
  assert.equal(createYouTubeAnalytics({ oauth: null, fetch: fakeFetch([]), cache: createCache() }).configured, false);
  assert.equal(createYouTubeAnalytics({ oauth: OAUTH, fetch: fakeFetch([]), cache: createCache() }).configured, true);
});

test("the refresh token is traded once for an access token, then each report is a GET on channel==MINE", async () => {
  const calls = [];
  const yta = createYouTubeAnalytics({ oauth: OAUTH, fetch: fakeFetch(calls), cache: createCache() });
  const totals = await yta.totals(null, "2026-10-24", "2026-10-30");
  assert.equal(totals.get("C1XsDuJE4MQ").views, 1312);
  assert.equal(calls[0].url, TOKEN_URL);
  assert.equal(calls[0].method, "POST");
  assert.deepEqual(Object.fromEntries(new URLSearchParams(calls[0].body)), { client_id: OAUTH.client_id, client_secret: OAUTH.client_secret, refresh_token: OAUTH.refresh_token, grant_type: "refresh_token" });
  const report = new URL(calls[1].url);
  assert.equal(`${report.origin}${report.pathname}`, REPORTS_URL);
  assert.equal(calls[1].auth, "Bearer at-1");
  assert.deepEqual(Object.fromEntries(report.searchParams), { ids: "channel==MINE", startDate: "2026-10-24", endDate: "2026-10-30", dimensions: "video", metrics: VIDEO_METRICS.join(","), sort: "-views", maxResults: "200" });

  await yta.totals(null, "2026-10-24", "2026-10-30");
  assert.equal(calls.length, 2, "the report is cached");
  await yta.totals(["C1XsDuJE4MQ", "jBh7F1knRAA"], "2026-10-24", "2026-10-30");
  assert.equal(new URL(calls.at(-1).url).searchParams.get("filters"), "video==C1XsDuJE4MQ,jBh7F1knRAA");
  assert.equal(calls.filter((c) => c.url === TOKEN_URL).length, 1, "one token for every call");
});

test("each report asks for the documented dimensions, metrics and filters", async () => {
  const calls = [];
  const yta = createYouTubeAnalytics({ oauth: OAUTH, fetch: fakeFetch(calls, { report: (u) => FIX[{ day: "daily", elapsedVideoTimeRatio: "retention", insightTrafficSourceType: "sources", insightTrafficSourceDetail: "external" }[u.searchParams.get("dimensions")]] }), cache: createCache() });
  const params = () => Object.fromEntries(new URL(calls.at(-1).url).searchParams);

  const daily = await yta.daily("C1XsDuJE4MQ", "2026-10-28", "2026-10-31");
  assert.deepEqual(params(), { ids: "channel==MINE", startDate: "2026-10-28", endDate: "2026-10-31", dimensions: "day", metrics: VIDEO_METRICS.join(","), filters: "video==C1XsDuJE4MQ", sort: "day" });
  assert.deepEqual(daily.map((d) => [d.day, d.views]), [["2026-10-28", 0], ["2026-10-29", 410], ["2026-10-30", 0], ["2026-10-31", 122]]);

  const retention = await yta.retention("C1XsDuJE4MQ", "2026-10-29", "2026-10-30");
  assert.deepEqual(params(), { ids: "channel==MINE", startDate: "2026-10-29", endDate: "2026-10-30", dimensions: "elapsedVideoTimeRatio", metrics: "audienceWatchRatio,relativeRetentionPerformance", filters: "video==C1XsDuJE4MQ", sort: "elapsedVideoTimeRatio" });
  assert.equal(retention[0].ratio, 0.01);

  const sources = await yta.sources("C1XsDuJE4MQ", "2026-10-24", "2026-10-30");
  assert.deepEqual(params(), { ids: "channel==MINE", startDate: "2026-10-24", endDate: "2026-10-30", dimensions: "insightTrafficSourceType", metrics: "views,engagedViews,estimatedMinutesWatched", filters: "video==C1XsDuJE4MQ", sort: "-views" });
  assert.equal(sources[0].source, "SHORTS");

  const external = await yta.external("C1XsDuJE4MQ", "2026-10-24", "2026-10-30");
  assert.deepEqual(params(), { ids: "channel==MINE", startDate: "2026-10-24", endDate: "2026-10-30", dimensions: "insightTrafficSourceDetail", metrics: "views,engagedViews,estimatedMinutesWatched", filters: "video==C1XsDuJE4MQ;insightTrafficSourceType==EXT_URL", sort: "-views", maxResults: "25" });
  assert.equal(external[0].url, "https://www.reddit.com/r/horror/comments/abc123/the_last_trail/");
});

test("a revoked or expired consent says to run the consent script, not a bare 400", async () => {
  const revoked = { status: 400, body: { error: "invalid_grant", error_description: "Token has been expired or revoked." } };
  const yta = createYouTubeAnalytics({ oauth: OAUTH, fetch: fakeFetch([], { token: revoked }), cache: createCache() });
  await assert.rejects(yta.totals(null, "2026-10-24", "2026-10-30"), (e) => e.message === CONSENT_EXPIRED);
  assert.equal(CONSENT_EXPIRED, "YouTube consent expired or was revoked: run admin/tools/youtube-consent.mjs");
  assert.match(classifyTokenError(401, { error: "invalid_client" }), /client was deleted/);
  assert.equal(classifyTokenError(500, {}), "youtube analytics token 500");
  for (const m of [classifyTokenError(400, revoked.body), classifyTokenError(401, { error: "invalid_client" })]) assert.ok(!m.includes("fake"), "never echoes the credential");
});

test("a refused report names the thing to fix, and a 401 drops the cached token", async () => {
  const calls = [];
  const yta = createYouTubeAnalytics({ oauth: OAUTH, fetch: fakeFetch(calls, { reportStatus: 401, report: () => ({ error: { code: 401, message: "Invalid Credentials" } }) }), cache: createCache() });
  await assert.rejects(yta.totals(null, "2026-10-24", "2026-10-30"), /401: the access token was refused/);
  await assert.rejects(yta.totals(null, "2026-10-24", "2026-10-30"), /401/);
  assert.equal(calls.filter((c) => c.url === TOKEN_URL).length, 2, "a fresh token after a 401");
  assert.match(classifyApiError(403, JSON.stringify({ error: { code: 403, message: "Request had insufficient authentication scopes.", status: "PERMISSION_DENIED", errors: [{ reason: "insufficientPermissions" }] } })), /missing the scope https:\/\/www.googleapis.com\/auth\/yt-analytics.readonly/);
  assert.match(classifyApiError(403, JSON.stringify({ error: { code: 403, message: "YouTube Analytics API has not been used in project 1 before or it is disabled.", errors: [{ reason: "accessNotConfigured" }] } })), /not enabled on the project/);
  assert.match(classifyApiError(403, JSON.stringify({ error: { code: 403, message: "Forbidden", errors: [{ reason: "forbidden" }] } })), /pick @csarkosh/);
  assert.match(classifyApiError(400, JSON.stringify({ error: { code: 400, message: "The query is not supported." } })), /^youtube analytics 400: The query is not supported\.$/);
  assert.match(classifyApiError(502, "<html>bad gateway</html>"), /^youtube analytics 502: <html>/);
});

test("rowsOf names each row's values by the column headers; no rows is []", () => {
  assert.deepEqual(rowsOf(FIX.sources)[0], { insightTrafficSourceType: "EXT_URL", views: 96, engagedViews: 81, estimatedMinutesWatched: 70 });
  assert.deepEqual(rowsOf(FIX.empty), [], "the API leaves rows out when there are none");
  assert.deepEqual(rowsOf({}), []);
  assert.deepEqual(rowsOf(null), []);
});

test("the mappers shape each documented report", () => {
  const totals = totalsOf(FIX.totals);
  assert.equal(totals.size, 3);
  assert.deepEqual(totals.get("jBh7F1knRAA"), { views: 288, engagedViews: 201, estimatedMinutesWatched: 61, averageViewDuration: 12, averageViewPercentage: 79.4, subscribersGained: 1, likes: 14, shares: 0, comments: 2 });

  const daily = dailyOf(FIX.daily, "2026-10-29", "2026-11-01");
  assert.equal(daily.length, 4, "every day of the range");
  assert.deepEqual(daily[1], { day: "2026-10-30", views: 0, engagedViews: 0, estimatedMinutesWatched: 0, averageViewDuration: 0, averageViewPercentage: 0, subscribersGained: 0, likes: 0, shares: 0, comments: 0 });
  assert.equal(daily[2].averageViewPercentage, 70.5);

  const retention = retentionOf(FIX.retention);
  assert.deepEqual(retention.map((r) => r.ratio), [0.01, 0.02, 0.5, 0.99, 1], "in order of the runtime");
  assert.deepEqual(retention[0], { ratio: 0.01, watch: 1.04, relative: 0.66 });

  assert.deepEqual(sourcesOf(FIX.sources).map((s) => s.source), ["SHORTS", "EXT_URL", "SUBSCRIBER", "YT_CHANNEL"], "most views first, then watch time");
  assert.deepEqual(sourcesOf(FIX.sources)[0], { source: "SHORTS", views: 1080, engaged: 612, minutes: 760 }, "the views that stayed past the first seconds beside all views");
  assert.deepEqual(externalOf(FIX.external).map((e) => e.views), [48, 27, 21]);
  assert.deepEqual(externalOf(FIX.external)[0], { url: "https://www.reddit.com/r/horror/comments/abc123/the_last_trail/", views: 48, engaged: 41, minutes: 36 });
  assert.deepEqual(externalOf(FIX.empty), []);
});
