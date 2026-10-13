/**
 * Google Search Console, the port of the `general:search-console` skill's
 * `gsc.py` (its three calls: searchAnalytics.query, urlInspection.index
 * inspect, sitemaps.get). Same service account, same read-only scope; the
 * key arrives as the `GSC_SA_KEY` secret's content.
 *
 * `gsc.py` leans on `google-auth` for the token; there is no such library
 * allowed here, so the credential is minted by hand: a JWT signed RS256 with
 * the key's private key (`iss` the account, `aud` its token URI, `scope` the
 * read-only scope, one hour) and exchanged at the token URI for a bearer
 * token, which is cached until a minute before it expires.
 *
 * Quotas (Google, 2026-10): searchAnalytics 1,200 queries a minute a site;
 * URL inspection 2,000 a day a property. The site has 29 URLs and the
 * inspection result is cached six hours, so a day costs about 120.
 */

import { createSign } from "node:crypto";
import { HOUR } from "../cache.mjs";

export const READ_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const WEBMASTERS = "https://www.googleapis.com/webmasters/v3";
const SEARCHCONSOLE = "https://searchconsole.googleapis.com/v1";
const INDEXED_VERDICTS = new Set(["PASS", "PARTIAL"]);

export const GSC_LAG = "Search Console runs 2 to 3 days behind";

function b64url(input) {
  return Buffer.from(input).toString("base64url");
}

/** The signed assertion the token endpoint accepts for a service account. */
export function signedJwt(key, scope, nowSec, lifetimeSec = 3600) {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({ iss: key.client_email, scope, aud: key.token_uri ?? "https://oauth2.googleapis.com/token", iat: nowSec, exp: nowSec + lifetimeSec }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const signature = signer.sign(key.private_key).toString("base64url");
  return `${header}.${claims}.${signature}`;
}

export function isIndexed(status) {
  return INDEXED_VERDICTS.has(status?.verdict);
}

export function createGsc({ key, property, fetch, cache, now = Date.now, ttlMs = 300_000, inspectTtlMs = 6 * HOUR, inspectConcurrency = 4 }) {
  const configured = key !== null && key !== undefined;
  const siteSegment = encodeURIComponent(property);

  async function accessToken() {
    return cache.get(`gsc:token:${key.client_email}`, 55 * 60_000, async () => {
      const assertion = signedJwt(key, READ_SCOPE, Math.floor(now() / 1000));
      const res = await fetch(key.token_uri ?? "https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString(),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || typeof body.access_token !== "string") throw new Error(`gsc token ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
      return body.access_token;
    });
  }

  async function call(url, payload, method = payload ? "POST" : "GET") {
    const token = await accessToken();
    const res = await fetch(url, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(payload ? { "content-type": "application/json" } : {}) },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    });
    if (!res.ok) throw new Error(classifyApiError(res.status, await res.text().catch(() => "")));
    return res.json();
  }

  function cached(keyText, ttl, load) {
    return cache.get(`gsc:${keyText}`, ttl, load);
  }

  return {
    get configured() {
      return configured;
    },
    property,
    /** searchAnalytics.query rows for `dimensions` over the dates, `[{ keys, clicks, impressions, ctr, position }]`. */
    query({ startDate, endDate, dimensions, rowLimit = 25000 }) {
      const payload = { startDate, endDate, dimensions, rowLimit, dataState: "all" };
      return cached(`query:${JSON.stringify(payload)}`, ttlMs, async () => {
        const res = await call(`${WEBMASTERS}/sites/${siteSegment}/searchAnalytics/query`, payload);
        return Array.isArray(res.rows) ? res.rows : [];
      });
    },
    /** The index status of one URL, `{ verdict, coverageState, lastCrawlTime, ... }`. */
    inspect(url) {
      return cached(`inspect:${url}`, inspectTtlMs, async () => {
        const res = await call(`${SEARCHCONSOLE}/urlInspection/index:inspect`, { inspectionUrl: url, siteUrl: property });
        return res?.inspectionResult?.indexStatusResult ?? {};
      });
    },
    /** Every URL inspected, a few at a time, as `{ indexed, total, missing }`. */
    async indexedOf(urls) {
      const results = new Array(urls.length);
      let next = 0;
      const worker = async () => {
        for (;;) {
          const i = next;
          next += 1;
          if (i >= urls.length) return;
          results[i] = await this.inspect(urls[i]);
        }
      };
      await Promise.all(Array.from({ length: Math.min(inspectConcurrency, urls.length) }, worker));
      const missing = urls.filter((_, i) => !isIndexed(results[i]));
      return { indexed: urls.length - missing.length, total: urls.length, missing };
    },
    /** sitemaps.get for the feed, `{ lastDownloaded, errors, warnings }`. */
    sitemap(feedUrl) {
      return cached(`sitemap:${feedUrl}`, ttlMs, async () => {
        const res = await call(`${WEBMASTERS}/sites/${siteSegment}/sitemaps/${encodeURIComponent(feedUrl)}`);
        return { lastDownloaded: res.lastDownloaded ?? null, errors: Number(res.errors ?? 0), warnings: Number(res.warnings ?? 0) };
      });
    },
  };
}

/** The specific thing to fix, as `gsc.py` words it. */
export function classifyApiError(status, body) {
  const text = String(body ?? "");
  if (status === 403 && text.includes("ACCESS_TOKEN_SCOPE_INSUFFICIENT")) return `gsc 403: the credential is missing the scope ${READ_SCOPE}`;
  if (status === 403 && text.includes("sufficient permission for site")) return "gsc 403: Search Console does not know this service account; add it under Settings > Users and permissions with permission Full";
  if (status === 401) return "gsc 401: the key was rejected; it may have been deleted or the service account disabled";
  if (status === 404) return "gsc 404: no such property; a Domain property is spelled sc-domain:example.com";
  if (status === 429) return "gsc 429: quota exceeded; URL inspection allows 2,000 calls a property a day";
  return `gsc ${status}: ${text.slice(0, 200)}`;
}

/* ---- pure mappings ---- */

/** Per-day rows `[{ day, clicks, impressions, ctr, position }]` from a `date` dimension query, every day of the range present. */
export function perDayOf(rows, startDate, endDate) {
  const byDay = new Map(rows.map((r) => [r.keys?.[0], r]));
  const out = [];
  for (let t = Date.parse(`${startDate}T00:00:00Z`); t <= Date.parse(`${endDate}T00:00:00Z`); t += 86_400_000) {
    const day = new Date(t).toISOString().slice(0, 10);
    const r = byDay.get(day);
    out.push({ day, clicks: Number(r?.clicks ?? 0), impressions: Number(r?.impressions ?? 0), ctr: Number(r?.ctr ?? 0), position: r ? Number(r.position ?? 0) : null });
  }
  return out;
}

/** Totals over per-day rows: CTR recomputed from the sums, position averaged by impressions. */
export function totalsOf(perDay) {
  const clicks = perDay.reduce((s, d) => s + d.clicks, 0);
  const impressions = perDay.reduce((s, d) => s + d.impressions, 0);
  const weighted = perDay.reduce((s, d) => s + (d.position ?? 0) * d.impressions, 0);
  return {
    clicks,
    impressions,
    ctr: impressions === 0 ? 0 : clicks / impressions,
    position: impressions === 0 ? null : weighted / impressions,
  };
}

/** The top `limit` rows of a one-dimension query, keyed by `field`. */
export function topRowsOf(rows, field, limit = 25) {
  return rows
    .map((r) => ({ [field]: String(r.keys?.[0] ?? ""), clicks: Number(r.clicks ?? 0), impressions: Number(r.impressions ?? 0), ctr: Number(r.ctr ?? 0), position: Number(r.position ?? 0) }))
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
    .slice(0, limit);
}
