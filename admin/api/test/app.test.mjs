import { test, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createApp } from "../src/app.mjs";
import { IpLimiter } from "../src/limiter.mjs";

const TOKEN = "a-signed-id-token-for-an-allowed-account";
const adminAuth = { enabled: true, async verify(token) { return token === TOKEN ? { email: "cyrus@example.com" } : null; } };
const calls = [];
const queries = {
  async kpis() { return { app: "csarko.sh", kpis: [] }; },
  async visits(days) { calls.push(["visits", days]); return { days }; },
  async pages(days) { return { days }; },
  async referrers(days) { return { days }; },
  async events(days) { return { days }; },
  async audience(days) { return { days }; },
  async search(days) { return { days }; },
  async reach(days) { return { days }; },
  async health(days) { if (days === 90) throw new Error("boom"); return { days }; },
  async manual(key, value) { calls.push(["manual", key, value]); return { ok: true, at: "t" }; },
  async snapshot() { calls.push(["snapshot"]); return { date: "2026-10-12" }; },
};
const oidc = { async verify(token, audiences) { return token === "oidc-ok" && audiences.length > 0 ? { email: "s@x" } : null; } };
const log = { error() {}, warn() {}, log() {} };

function serve(config, capacity = 100) {
  const app = createApp({ config: { allowedOrigins: ["https://admin.csarko.sh"], serviceUrl: null, ...config }, queries, limiter: new IpLimiter({ capacity, refillPerSecond: 0 }), adminAuth: config.adminAuth === undefined ? adminAuth : config.adminAuth, oidc, log });
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
  assert.equal((await call(server, "GET", "/admin/query/nope", auth())).status, 404);
  assert.equal((await call(server, "GET", "/admin/query/Visits", auth())).status, 404);
  assert.equal((await call(server, "POST", "/admin/query/visits", auth())).status, 405);

  const failed = await call(server, "GET", "/admin/query/health?days=90", auth("3.3.3.3"));
  assert.equal(failed.status, 500);
  assert.deepEqual(failed.body, { error: "boom" });

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
