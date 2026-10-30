import { test, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createApp } from "../src/app.mjs";
import { UpstreamError } from "../src/http.mjs";
import { IpLimiter } from "../src/limiter.mjs";

const TOKEN = "a-signed-id-token-for-an-allowed-account";
const adminAuth = { enabled: true, async verify(token) { return token === TOKEN ? { email: "cyrus@example.com" } : null; } };
const calls = [];
const queries = {
  async kpis() { return { app: "csarko.sh", kpis: [] }; },
  async visits(days, tz) { calls.push(["visits", days, tz]); return { days }; },
  async pages(days) { return { days }; },
  async referrers(days) { return { days }; },
  async events(days) { return { days }; },
  async audience(days) { if (days === 90) throw new UpstreamError("BigQuery audience failed: quota"); return { days }; },
  async search(days) { return { days }; },
  async reach(days) { if (days === 90) throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ETIMEDOUT" } }); return { days }; },
  async health(days) { if (days === 90) throw new Error("boom"); return { days }; },
  async manual(key, value) { calls.push(["manual", key, value]); return { ok: true, at: "t" }; },
  async snapshot() { calls.push(["snapshot"]); return { date: "2026-10-12" }; },
};
const arkos = {
  async kpis() { return { app: "ide-arkos", kpis: [] }; },
  async installs(days, who) { calls.push(["arkos-installs", days, who]); return { days }; },
  async journey(days) { if (days === 90) throw new UpstreamError("BigQuery arkos-sessions failed: quota"); return { days }; },
  async sessions(days) { return { rows: [], days }; },
  async crashes(days) { return { total: 0, days }; },
};
const finance = {
  async kpis() { return { app: "finance", kpis: [] }; },
  async summary(range) { calls.push(["finance-summary", range]); return { range }; },
  async categories(range) { return { range }; },
  async idle(range) { return { range }; },
  async daily(range) { if (range === "13m") throw new UpstreamError("BigQuery finance-daily failed: quota"); return { range }; },
  async activity(range) { return { range }; },
  async sources(range) { return { range }; },
  async projects(range) { return { range }; },
  async films(range) { return { range }; },
  async claude(range) { calls.push(["finance-claude", range]); return { range }; },
  async manual(key, value) { calls.push(["finance-manual", key, value]); return { key, value, at: "t" }; },
  async snapshotPart() { calls.push(["finance-snapshot"]); return { finance: {} }; },
};
const oidc = { async verify(token, audiences) { return token === "oidc-ok" && audiences.length > 0 ? { email: "s@x" } : null; } };
const log = { error() {}, warn() {}, log() {} };

function serve(config, capacity = 100) {
  const app = createApp({ config: { allowedOrigins: ["https://admin.csarko.sh"], serviceUrl: null, ...config }, queries, arkos, finance, limiter: new IpLimiter({ capacity, refillPerSecond: 0 }), adminAuth: config.adminAuth === undefined ? adminAuth : config.adminAuth, oidc, log });
  const server = http.createServer(app);
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

async function call(server, method, path, { headers = {}, body, ip } = {}) {
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers: { ...(ip ? { "x-forwarded-for": ip } : {}), ...headers }, body });
  const text = await res.text();
  return { status: res.status, headers: res.headers, body: text === "" ? null : JSON.parse(text) };
}

const auth = (ip = "1.1.1.1") => ({ headers: { authorization: `Bearer ${TOKEN}` }, ip });
const servers = [];
after(() => servers.forEach((s) => s.close()));

test("the routes", async () => {
  const server = await serve({});
  servers.push(server);

  const health = await call(server, "GET", "/health");
  assert.equal(health.status, 200);
  assert.equal(health.body.ok, true);
  assert.equal(health.headers.get("cache-control"), "no-store");
  assert.equal(health.headers.get("content-type"), "application/json; charset=utf-8");

  assert.equal((await call(server, "GET", "/")).status, 404);
  assert.equal((await call(server, "GET", "/admin")).status, 404);

  assert.equal((await call(server, "GET", "/admin/kpis", { ip: "2.2.2.2" })).status, 401, "no token");
  assert.equal((await call(server, "GET", "/admin/kpis", { headers: { authorization: "Bearer nope" }, ip: "2.2.2.2" })).status, 401, "wrong token");

  const kpis = await call(server, "GET", "/admin/kpis", auth());
  assert.equal(kpis.status, 200);
  assert.equal(kpis.body.app, "csarko.sh");

  const q = await call(server, "GET", "/admin/query/visits?days=30", auth());
  assert.equal(q.status, 200);
  assert.deepEqual(q.body, { days: 30 });
  assert.deepEqual((await call(server, "GET", "/admin/query/visits", auth())).body, { days: 7 }, "default range");
  assert.equal((await call(server, "GET", "/admin/query/visits?days=14", auth())).status, 400);
  assert.deepEqual(calls.at(-1), ["visits", 7, "UTC"], "no tz is UTC");
  assert.equal((await call(server, "GET", "/admin/query/visits?days=7&tz=America%2FLos_Angeles", auth())).status, 200);
  assert.deepEqual(calls.at(-1), ["visits", 7, "America/Los_Angeles"], "the reader's zone reaches the query");
  assert.equal((await call(server, "GET", "/admin/query/visits?days=7&tz=Mars%2FOlympus", auth())).status, 400);
  assert.equal((await call(server, "GET", "/admin/query/nope", auth())).status, 404);
  assert.equal((await call(server, "GET", "/admin/query/Visits", auth())).status, 404);
  assert.equal((await call(server, "POST", "/admin/query/visits", auth())).status, 405);

  const failed = await call(server, "GET", "/admin/query/health?days=90", auth("3.3.3.3"));
  assert.equal(failed.status, 500);
  assert.deepEqual(failed.body, { error: "boom" });

  const upstream = await call(server, "GET", "/admin/query/audience?days=90", auth("3.3.3.3"));
  assert.equal(upstream.status, 502, "a vendor that failed is a bad gateway, not our 500");
  assert.deepEqual(upstream.body, { error: "BigQuery audience failed: quota" });
  const unnamed = await call(server, "GET", "/admin/query/reach?days=90", auth("3.3.3.3"));
  assert.equal(unnamed.status, 502, "any collector's failed fetch is a bad gateway too");
  assert.deepEqual(unnamed.body, { error: "an upstream service was unreachable (ETIMEDOUT)" });

  const manual = await call(server, "POST", "/admin/manual/substack", { ...auth("4.4.4.4"), headers: { ...auth().headers, "content-type": "application/json" }, body: JSON.stringify({ value: 12 }) });
  assert.equal(manual.status, 200);
  assert.deepEqual(manual.body, { ok: true, at: "t" });
  assert.deepEqual(calls.at(-1), ["manual", "substack", 12]);
  assert.equal((await call(server, "POST", "/admin/manual/substack", { ...auth("4.4.4.4"), body: '{"value":"12"}' })).status, 400);
  assert.equal((await call(server, "POST", "/admin/manual/other", { ...auth("4.4.4.4"), body: '{"value":1}' })).status, 404);
  assert.equal((await call(server, "GET", "/admin/manual/substack", auth("4.4.4.4"))).status, 405);
});

test("snapshot accepts the admin token or the scheduler's OIDC token", async () => {
  const server = await serve({});
  servers.push(server);
  assert.equal((await call(server, "POST", "/admin/snapshot", auth("5.5.5.5"))).status, 200);
  assert.equal((await call(server, "POST", "/admin/snapshot", { headers: { authorization: "Bearer oidc-ok" }, ip: "5.5.5.5" })).status, 200);
  assert.equal((await call(server, "POST", "/admin/snapshot", { headers: { authorization: "Bearer oidc-bad" }, ip: "5.5.5.5" })).status, 401);
  assert.equal((await call(server, "GET", "/admin/kpis", { headers: { authorization: "Bearer oidc-ok" }, ip: "5.5.5.5" })).status, 401, "the OIDC token opens only the snapshot route");
  assert.equal((await call(server, "GET", "/admin/snapshot", auth("6.6.6.6"))).status, 405);
});

test("CORS: an allowed origin is echoed, a preflight answers 204, a foreign origin gets 403", async () => {
  const server = await serve({});
  servers.push(server);
  const ok = await call(server, "GET", "/admin/kpis", { ...auth("7.7.7.7"), headers: { ...auth().headers, origin: "https://admin.csarko.sh" } });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("access-control-allow-origin"), "https://admin.csarko.sh");
  assert.equal(ok.headers.get("vary"), "origin");

  const pre = await call(server, "OPTIONS", "/admin/kpis", { headers: { origin: "https://admin.csarko.sh", "access-control-request-method": "GET" }, ip: "7.7.7.7" });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get("access-control-allow-methods"), "GET, POST, OPTIONS");
  assert.equal(pre.headers.get("access-control-allow-headers"), "authorization, content-type");
  assert.equal(pre.headers.get("access-control-max-age"), "86400");

  const foreign = await call(server, "GET", "/admin/kpis", { ...auth("7.7.7.7"), headers: { ...auth().headers, origin: "https://evil.example" } });
  assert.equal(foreign.status, 403);
  assert.equal(foreign.headers.get("access-control-allow-origin"), null);
});

test("the rate limit answers 429 past the burst, per address", async () => {
  const server = await serve({}, 5);
  servers.push(server);
  for (let i = 0; i < 5; i += 1) assert.equal((await call(server, "GET", "/admin/kpis", auth("8.8.8.8"))).status, 200);
  const limited = await call(server, "GET", "/admin/kpis", auth("8.8.8.8"));
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "1");
  assert.equal((await call(server, "GET", "/admin/kpis", auth("9.9.9.9"))).status, 200, "another address is unaffected");
});

test("with an empty allowlist every admin route answers 503 and /health still works", async () => {
  const server = await serve({ adminAuth: { enabled: false, async verify() { return null; } } });
  servers.push(server);
  assert.equal((await call(server, "GET", "/health")).status, 200);
  const r = await call(server, "GET", "/admin/kpis", auth());
  assert.equal(r.status, 503);
  assert.deepEqual(r.body, { error: "admin readers not configured" });
  assert.equal((await call(server, "POST", "/admin/snapshot", { headers: { authorization: "Bearer oidc-ok" } })).status, 503);
});

test("Arkos under /arkos: the index card and its four queries, through the same auth", async () => {
  const server = await serve({});
  servers.push(server);
  assert.equal((await call(server, "GET", "/arkos", auth("10.0.0.1"))).status, 404);
  assert.equal((await call(server, "GET", "/arkos/admin", auth("10.0.0.1"))).status, 404);
  assert.equal((await call(server, "GET", "/arkos/admin/kpis", { ip: "10.0.0.2" })).status, 401, "no token");
  assert.equal((await call(server, "GET", "/arkos/admin/query/journey", { headers: { authorization: "Bearer nope" }, ip: "10.0.0.2" })).status, 401, "wrong token");

  const kpis = await call(server, "GET", "/arkos/admin/kpis", auth("10.0.0.1"));
  assert.equal(kpis.status, 200);
  assert.equal(kpis.body.app, "ide-arkos");
  assert.equal(kpis.headers.get("cache-control"), "no-store");

  for (const name of ["installs", "journey", "sessions", "crashes"]) {
    const r = await call(server, "GET", `/arkos/admin/query/${name}?days=30`, auth("10.0.0.1"));
    assert.equal(r.status, 200, name);
    assert.equal(r.body.days, 30, name);
  }
  assert.deepEqual(calls.at(-1), ["arkos-installs", 30, "users"], "the Arkos source answered, not the csarko.sh one; users by default");
  assert.equal((await call(server, "GET", "/arkos/admin/query/installs?days=7&who=me", auth("10.0.0.1"))).status, 200);
  assert.deepEqual(calls.at(-1), ["arkos-installs", 7, "me"], "who passed through");
  const badWho = await call(server, "GET", "/arkos/admin/query/installs?days=7&who=cyrus", auth("10.0.0.1"));
  assert.deepEqual([badWho.status, badWho.body.error], [400, "who must be users, me or all"]);
  assert.equal((await call(server, "GET", "/arkos/admin/query/installs", auth("10.0.0.1"))).body.days, 7, "default range");
  assert.equal((await call(server, "GET", "/arkos/admin/query/installs?days=14", auth("10.0.0.1"))).status, 400);
  assert.equal((await call(server, "GET", "/arkos/admin/query/installs?days=abc", auth("10.0.0.1"))).status, 400);
  assert.equal((await call(server, "GET", "/arkos/admin/query/nope", auth("10.0.0.1"))).status, 404);
  assert.equal((await call(server, "GET", "/arkos/admin/query/visits", auth("10.0.0.1"))).status, 404, "the csarko.sh queries are not Arkos's");
  assert.equal((await call(server, "GET", "/admin/query/journey", auth("10.0.0.1"))).status, 404, "nor Arkos's the csarko.sh ones");
  assert.equal((await call(server, "POST", "/arkos/admin/query/journey", auth("10.0.0.1"))).status, 405);
  assert.equal((await call(server, "POST", "/arkos/admin/kpis", auth("10.0.0.1"))).status, 405);
  assert.equal((await call(server, "POST", "/arkos/admin/snapshot", auth("10.0.0.1"))).status, 404, "no snapshot or manual routes under the prefix");
  assert.equal((await call(server, "POST", "/arkos/admin/snapshot", { headers: { authorization: "Bearer oidc-ok" }, ip: "10.0.0.1" })).status, 401, "the scheduler's token opens nothing here");
  assert.equal((await call(server, "POST", "/arkos/admin/manual/substack", { ...auth("10.0.0.1"), body: '{"value":1}' })).status, 404);

  const upstream = await call(server, "GET", "/arkos/admin/query/journey?days=90", auth("10.0.0.3"));
  assert.equal(upstream.status, 502);
  assert.deepEqual(upstream.body, { error: "BigQuery arkos-sessions failed: quota" });
});

test("Arkos: CORS, preflight, foreign origin, rate limit and the empty allowlist in the same order", async () => {
  const server = await serve({}, 3);
  servers.push(server);
  const origin = "https://admin.csarko.sh";
  const ok = await call(server, "GET", "/arkos/admin/query/crashes", { ...auth("11.0.0.1"), headers: { ...auth().headers, origin } });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("access-control-allow-origin"), origin);
  const pre = await call(server, "OPTIONS", "/arkos/admin/kpis", { headers: { origin, "access-control-request-method": "GET" }, ip: "11.0.0.1" });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get("access-control-allow-headers"), "authorization, content-type");
  const foreign = await call(server, "GET", "/arkos/admin/kpis", { ...auth("11.0.0.1"), headers: { ...auth().headers, origin: "https://evil.example" } });
  assert.equal(foreign.status, 403);
  assert.equal(foreign.headers.get("access-control-allow-origin"), null);
  const denied = await call(server, "GET", "/arkos/admin/kpis", { headers: { origin }, ip: "11.0.0.2" });
  assert.equal(denied.status, 401);
  assert.equal(denied.headers.get("access-control-allow-origin"), origin, "a 401 still carries CORS so the page can read it");

  for (let i = 0; i < 2; i += 1) assert.equal((await call(server, "GET", "/arkos/admin/kpis", auth("11.0.0.3"))).status, 200);
  assert.equal((await call(server, "GET", "/admin/kpis", auth("11.0.0.3"))).status, 200, "one bucket an address, whichever prefix");
  assert.equal((await call(server, "GET", "/arkos/admin/kpis", auth("11.0.0.3"))).status, 429);

  const closed = await serve({ adminAuth: { enabled: false, async verify() { return null; } } });
  servers.push(closed);
  assert.equal((await call(closed, "GET", "/arkos/admin/kpis", auth())).status, 503);
  assert.equal((await call(closed, "GET", "/arkos/admin/query/nope", auth())).status, 503, "503 before the route is looked at");
  assert.equal((await call(closed, "GET", "/arkos/admin/kpis", { headers: { origin: "https://evil.example" } })).status, 403, "the origin before the 503");
});

test("without an Arkos or a finance source the prefix is not found", async () => {
  const app = createApp({ config: { allowedOrigins: [], serviceUrl: null }, queries, limiter: new IpLimiter(), adminAuth, oidc, log });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  assert.equal((await call(server, "GET", "/arkos/admin/kpis", auth())).status, 404);
  assert.equal((await call(server, "GET", "/finance/admin/kpis", auth())).status, 404);
});

test("Finance under /finance: the index card, its nine queries with range and the one manual series, through the same auth", async () => {
  const server = await serve({});
  servers.push(server);
  assert.equal((await call(server, "GET", "/finance", auth("12.0.0.1"))).status, 404);
  assert.equal((await call(server, "GET", "/finance/admin", auth("12.0.0.1"))).status, 404);
  assert.equal((await call(server, "GET", "/finance/admin/kpis", { ip: "12.0.0.2" })).status, 401, "no token");
  assert.equal((await call(server, "GET", "/finance/admin/query/summary", { headers: { authorization: "Bearer nope" }, ip: "12.0.0.2" })).status, 401, "wrong token");

  const kpis = await call(server, "GET", "/finance/admin/kpis", auth("12.0.0.1"));
  assert.equal(kpis.status, 200);
  assert.equal(kpis.body.app, "finance");
  assert.equal(kpis.headers.get("cache-control"), "no-store");

  for (const name of ["summary", "categories", "idle", "daily", "activity", "sources", "projects", "films", "claude"]) {
    const r = await call(server, "GET", `/finance/admin/query/${name}?range=90`, auth("12.0.0.1"));
    assert.equal(r.status, 200, name);
    assert.deepEqual(r.body, { range: "90" }, name);
  }
  assert.deepEqual(calls.at(-1), ["finance-claude", "90"]);
  assert.deepEqual((await call(server, "GET", "/finance/admin/query/claude?range=last", auth("12.0.0.1"))).body, { range: "last" });
  assert.deepEqual((await call(server, "GET", "/finance/admin/query/summary", auth("12.0.0.1"))).body, { range: "month" }, "the default range is the current month");
  assert.deepEqual(calls.at(-1), ["finance-summary", "month"]);
  for (const range of ["last", "13m"]) assert.deepEqual((await call(server, "GET", `/finance/admin/query/summary?range=${range}`, auth("12.0.0.1"))).body, { range });
  const bad = await call(server, "GET", "/finance/admin/query/summary?range=7", auth("12.0.0.1"));
  assert.deepEqual([bad.status, bad.body.error], [400, "range must be month, last, 90 or 13m"]);
  assert.equal((await call(server, "GET", "/finance/admin/query/summary?range=year", auth("12.0.0.1"))).status, 400);
  assert.equal((await call(server, "GET", "/finance/admin/query/summary?days=7", auth("12.0.0.1"))).status, 200, "days is not a finance parameter and is ignored");
  assert.equal((await call(server, "GET", "/finance/admin/query/nope", auth("12.0.0.1"))).status, 404);
  assert.equal((await call(server, "GET", "/finance/admin/query/visits", auth("12.0.0.1"))).status, 404, "the csarko.sh queries are not finance's");
  assert.equal((await call(server, "GET", "/finance/admin/query/journey", auth("12.0.0.1"))).status, 404, "nor Arkos's");
  assert.equal((await call(server, "GET", "/admin/query/summary", auth("12.0.0.1"))).status, 404, "nor finance's the csarko.sh ones");
  assert.equal((await call(server, "GET", "/arkos/admin/query/idle", auth("12.0.0.1"))).status, 404);
  assert.equal((await call(server, "POST", "/finance/admin/query/idle", auth("12.0.0.1"))).status, 405);
  assert.equal((await call(server, "POST", "/finance/admin/kpis", auth("12.0.0.1"))).status, 405);
  assert.equal((await call(server, "POST", "/finance/admin/snapshot", auth("12.0.0.1"))).status, 404, "no snapshot route under the prefix");
  assert.equal((await call(server, "POST", "/finance/admin/snapshot", { headers: { authorization: "Bearer oidc-ok" }, ip: "12.0.0.1" })).status, 401, "the scheduler's token opens nothing here");

  // The one manual series: the claude.ai subscription's monthly fee.
  const fee = await call(server, "POST", "/finance/admin/manual/claude-subscription", { ...auth("12.0.0.5"), headers: { ...auth().headers, "content-type": "application/json" }, body: JSON.stringify({ value: 200 }) });
  assert.equal(fee.status, 200);
  assert.deepEqual(fee.body, { key: "claude-subscription", value: 200, at: "t" });
  assert.deepEqual(calls.at(-1), ["finance-manual", "claude-subscription", 200]);
  assert.equal((await call(server, "POST", "/finance/admin/manual/claude-subscription", { ...auth("12.0.0.5"), body: '{"value":0}' })).status, 200, "a cancelled plan is $0");
  assert.equal((await call(server, "POST", "/finance/admin/manual/claude-subscription", { ...auth("12.0.0.5"), body: '{"value":"200"}' })).status, 400, "a string is not a value");
  assert.equal((await call(server, "POST", "/finance/admin/manual/claude-subscription", { ...auth("12.0.0.5"), body: '{"value":-1}' })).status, 400);
  assert.equal((await call(server, "POST", "/finance/admin/manual/claude-subscription", { ...auth("12.0.0.5"), body: "nope" })).status, 400);
  assert.equal((await call(server, "POST", "/finance/admin/manual/claude-subscription", { ...auth("12.0.0.5"), body: JSON.stringify({ value: Infinity }) })).status, 400);
  assert.equal((await call(server, "POST", "/finance/admin/manual/substack", { ...auth("12.0.0.5"), body: '{"value":1}' })).status, 404, "the csarko.sh series is not finance's");
  assert.equal((await call(server, "POST", "/finance/admin/manual/claude", { ...auth("12.0.0.5"), body: '{"value":1}' })).status, 404);
  assert.equal((await call(server, "POST", "/admin/manual/claude-subscription", { ...auth("12.0.0.5"), body: '{"value":1}' })).status, 404, "nor finance's the csarko.sh one");
  assert.equal((await call(server, "GET", "/finance/admin/manual/claude-subscription", auth("12.0.0.5"))).status, 405);
  assert.equal((await call(server, "POST", "/finance/admin/manual/claude-subscription", { headers: { authorization: "Bearer oidc-ok" }, ip: "12.0.0.5", body: '{"value":1}' })).status, 401, "the admin token only");
  assert.equal((await call(server, "POST", "/finance/admin/manual/claude-subscription", { ip: "12.0.0.6", body: '{"value":1}' })).status, 401);

  const upstream = await call(server, "GET", "/finance/admin/query/daily?range=13m", auth("12.0.0.3"));
  assert.equal(upstream.status, 502);
  assert.deepEqual(upstream.body, { error: "BigQuery finance-daily failed: quota" });

  const origin = "https://admin.csarko.sh";
  const ok = await call(server, "GET", "/finance/admin/query/idle", { ...auth("12.0.0.4"), headers: { ...auth().headers, origin } });
  assert.equal(ok.headers.get("access-control-allow-origin"), origin);
  const pre = await call(server, "OPTIONS", "/finance/admin/kpis", { headers: { origin, "access-control-request-method": "GET" }, ip: "12.0.0.4" });
  assert.equal(pre.status, 204);
  assert.equal((await call(server, "GET", "/finance/admin/kpis", { ...auth("12.0.0.4"), headers: { ...auth().headers, origin: "https://evil.example" } })).status, 403);

  const closed = await serve({ adminAuth: { enabled: false, async verify() { return null; } } });
  servers.push(closed);
  assert.equal((await call(closed, "GET", "/finance/admin/kpis", auth())).status, 503);
});
