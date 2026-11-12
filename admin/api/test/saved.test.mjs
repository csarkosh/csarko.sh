import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { savedId, createSaver, SAVED_PARAMS, SAVED_MAX_BYTES } from "../src/saved.mjs";
import { savedId as browserSavedId, SAVED_PARAMS as BROWSER_PARAMS } from "../../public/saved-id.js";
import { createMemoryStore } from "../src/store.mjs";
import { createApp } from "../src/app.mjs";
import { IpLimiter } from "../src/limiter.mjs";

const log = { error() {}, warn() {}, log() {} };

test("the server and the browser build the same id for every request the pages make", () => {
  assert.deepEqual(SAVED_PARAMS, BROWSER_PARAMS);
  const cases = [
    ["csarko.sh", "/admin/kpis", { tz: "America/New_York" }],
    ["csarko.sh", "/admin/query/visits", { days: "7", tz: "America/New_York" }],
    ["csarko.sh", "/admin/query/journeys", { days: "90", tz: "Europe/London" }],
    ["ide-arkos", "/admin/query/journey", { days: "30", tz: "America/New_York", who: "all" }],
    ["ide-arkos", "/admin/kpis", {}],
  ];
  for (const [slug, path, params] of cases) {
    const server = savedId(slug, path, new URLSearchParams(params));
    assert.equal(browserSavedId(slug, path, params), server, `${slug}${path}`);
    assert.ok(!server.includes("/"), "a Firestore id holds no slash");
  }
  assert.equal(decodeURIComponent(savedId("csarko.sh", "/admin/query/visits", new URLSearchParams({ tz: "UTC", days: "7", extra: "x" }))), "csarko.sh/admin/query/visits?days=7&tz=UTC", "sorted, unknown parameters dropped");
});

test("the saver writes clean answers, skips partial or oversized ones, and never throws", async () => {
  const store = createMemoryStore();
  const saver = createSaver({ store, now: () => Date.parse("2026-11-12T03:00:00Z"), log });
  assert.equal(await saver.save("a", { visits: 3 }), true);
  assert.deepEqual(await store.getSaved("a"), { at: "2026-11-12T03:00:00.000Z", body: '{"visits":3}' });
  assert.equal(await saver.save("b", { visits: null, errors: { visits: "BigQuery failed" } }), false, "a partial answer is not shown first");
  assert.equal(await saver.save("c", { big: "x".repeat(SAVED_MAX_BYTES) }), false);
  assert.equal(await store.getSaved("b"), null);
  const broken = createSaver({ store: { async writeSaved() { throw new Error("quota"); } }, log });
  assert.equal(await broken.save("d", { ok: 1 }), false);
});

test("the csarko.sh and Arkos routes save what they answer under the request's id; Billing's do not", async () => {
  const saves = [];
  const saver = { async save(id, body) { saves.push([decodeURIComponent(id), body]); return true; } };
  const queries = { async kpis() { return { app: "csarko.sh" }; }, async visits(days, tz) { return { days, tz }; } };
  const arkos = { async kpis() { return { app: "ide-arkos" }; }, async journey(days, who) { return { days, who }; } };
  const finance = { async kpis() { return { app: "finance" }; } };
  const app = createApp({
    config: { allowedOrigins: ["https://admin.csarko.sh"], serviceUrl: null },
    queries, arkos, finance, saver,
    limiter: new IpLimiter({ capacity: 100, refillPerSecond: 0 }),
    adminAuth: { enabled: true, async verify(t) { return t === "ok" ? { email: "a" } : null; } },
    oidc: null, log,
  });
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const get = (path) => fetch(`http://127.0.0.1:${server.address().port}${path}`, { headers: { authorization: "Bearer ok", origin: "https://admin.csarko.sh" } });
  try {
    assert.equal((await get("/admin/query/visits?days=7&tz=America%2FNew_York")).status, 200);
    await get("/admin/kpis?tz=America%2FNew_York");
    await get("/arkos/admin/query/journey?days=30&who=all&tz=America%2FNew_York");
    await get("/finance/admin/kpis");
    assert.deepEqual(saves, [
      ["csarko.sh/admin/query/visits?days=7&tz=America/New_York", { days: 7, tz: "America/New_York" }],
      ["csarko.sh/admin/kpis?tz=America/New_York", { app: "csarko.sh" }],
      ["ide-arkos/admin/query/journey?days=30&tz=America/New_York&who=all", { days: 30, who: "all" }],
    ]);
  } finally {
    server.close();
  }
});
