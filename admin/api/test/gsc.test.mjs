import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { generateKeyPairSync, createVerify } from "node:crypto";
import { createCache } from "../src/cache.mjs";
import { createGsc, signedJwt, isIndexed, perDayOf, totalsOf, topRowsOf, classifyApiError } from "../src/collectors/gsc.mjs";
import { dailyRange } from "../src/time.mjs";
import { locsOf, pathsOf, normalizePath } from "../src/collectors/sitemap.mjs";

const rows = JSON.parse(readFileSync(new URL("./fixtures/gsc-dates.json", import.meta.url), "utf8")).rows;

function testKey() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    key: { client_email: "gsc-reader@csarko-sh.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }), token_uri: "https://oauth2.googleapis.com/token" },
    publicKey,
  };
}

test("signedJwt is an RS256 assertion for the service account", () => {
  const { key, publicKey } = testKey();
  const jwt = signedJwt(key, "scope-x", 1_700_000_000);
  const [h, c, s] = jwt.split(".");
  assert.deepEqual(JSON.parse(Buffer.from(h, "base64url")), { alg: "RS256", typ: "JWT" });
  assert.deepEqual(JSON.parse(Buffer.from(c, "base64url")), { iss: key.client_email, scope: "scope-x", aud: key.token_uri, iat: 1_700_000_000, exp: 1_700_003_600 });
  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${h}.${c}`);
  assert.equal(verifier.verify(publicKey, Buffer.from(s, "base64url")), true);
});

test("the client exchanges the assertion once, then calls the three endpoints with the bearer token", async () => {
  const { key } = testKey();
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url, method: init.method ?? "GET", auth: init.headers?.authorization, body: init.body });
    const ok = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => "" });
    if (url === key.token_uri) return ok({ access_token: "at-1", expires_in: 3600 });
    if (url.includes("/searchAnalytics/query")) return ok({ rows });
    if (url.includes("urlInspection")) return ok({ inspectionResult: { indexStatusResult: { verdict: JSON.parse(init.body).inspectionUrl.endsWith("/games") ? "NEUTRAL" : "PASS" } } });
    if (url.includes("/sitemaps/")) return ok({ lastDownloaded: "2026-10-11T03:00:00Z", errors: "0", warnings: "1" });
    return { ok: false, status: 404, text: async () => "nope" };
  };
  const gsc = createGsc({ key, property: "sc-domain:csarko.sh", fetch, cache: createCache(), now: () => 1_700_000_000_000 });
  assert.equal(gsc.configured, true);

  const got = await gsc.query({ startDate: "2026-10-06", endDate: "2026-10-12", dimensions: ["date"] });
  assert.equal(got.length, 3);
  assert.equal(calls[0].url, key.token_uri);
  assert.match(calls[0].body, /grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=/);
  assert.equal(calls[1].url, "https://www.googleapis.com/webmasters/v3/sites/sc-domain%3Acsarko.sh/searchAnalytics/query");
  assert.equal(calls[1].auth, "Bearer at-1");
  assert.deepEqual(JSON.parse(calls[1].body), { startDate: "2026-10-06", endDate: "2026-10-12", dimensions: ["date"], rowLimit: 25000, dataState: "all" });

  const indexed = await gsc.indexedOf(["https://csarko.sh/", "https://csarko.sh/games", "https://csarko.sh/research"]);
  assert.deepEqual(indexed, { indexed: 2, total: 3, missing: ["https://csarko.sh/games"] });
  await gsc.indexedOf(["https://csarko.sh/"]);
  assert.equal(calls.filter((c) => c.url.includes("urlInspection")).length, 3, "inspections are cached");

  const sitemap = await gsc.sitemap("https://csarko.sh/sitemap.xml");
  assert.deepEqual(sitemap, { lastDownloaded: "2026-10-11T03:00:00Z", errors: 0, warnings: 1 });
  assert.equal(calls.at(-1).url, "https://www.googleapis.com/webmasters/v3/sites/sc-domain%3Acsarko.sh/sitemaps/https%3A%2F%2Fcsarko.sh%2Fsitemap.xml");
  assert.equal(calls.filter((c) => c.url === key.token_uri).length, 1, "one token for every call");
});

test("isIndexed and the error wording", () => {
  assert.equal(isIndexed({ verdict: "PASS" }), true);
  assert.equal(isIndexed({ verdict: "PARTIAL" }), true);
  assert.equal(isIndexed({ verdict: "NEUTRAL" }), false);
  assert.equal(isIndexed(undefined), false);
  assert.match(classifyApiError(403, "sufficient permission for site"), /Users and permissions/);
  assert.match(classifyApiError(429, ""), /2,000/);
});

test("per-day rows fill every day of the range, totals recompute CTR and weight position by impressions", () => {
  const r = dailyRange(7, Date.parse("2026-10-12T15:30:00Z"));
  assert.deepEqual(r, { days: 7, startDate: "2026-10-06", endDate: "2026-10-12", prevStartDate: "2026-09-29", prevEndDate: "2026-10-05" });
  const perDay = perDayOf(rows, r.startDate, r.endDate);
  assert.equal(perDay.length, 7);
  assert.deepEqual(perDay[1], { day: "2026-10-07", clicks: 1, impressions: 80, ctr: 0.0125, position: 22 });
  assert.deepEqual(perDay[2], { day: "2026-10-08", clicks: 0, impressions: 0, ctr: 0, position: null });
  const totals = totalsOf(perDay);
  assert.equal(totals.clicks, 6);
  assert.equal(totals.impressions, 300);
  assert.equal(totals.ctr, 0.02);
  assert.ok(Math.abs(totals.position - (18.2 * 120 + 22 * 80 + 15 * 100) / 300) < 1e-9);
  assert.deepEqual(totalsOf([]), { clicks: 0, impressions: 0, ctr: 0, position: null });
  const top = topRowsOf([{ keys: ["b"], clicks: 1, impressions: 5 }, { keys: ["a"], clicks: 3, impressions: 9, ctr: 0.3, position: 2 }], "query", 1);
  assert.deepEqual(top, [{ query: "a", clicks: 3, impressions: 9, ctr: 0.3, position: 2 }]);
});

test("the sitemap's locs and paths", () => {
  const xml = `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://csarko.sh/</loc></url><url><loc> https://csarko.sh/research/a&amp;b </loc></url></urlset>`;
  const locs = locsOf(xml);
  assert.deepEqual(locs, ["https://csarko.sh/", "https://csarko.sh/research/a&b"]);
  assert.deepEqual([...pathsOf(locs)], ["/", "/research/a&b"]);
  assert.equal(normalizePath("/games/?ref=x"), "/games");
  assert.equal(normalizePath("/"), "/");
});
