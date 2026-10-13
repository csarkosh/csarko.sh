import { test } from "node:test";
import assert from "node:assert/strict";
import { createCache } from "../src/cache.mjs";
import { createHosting, lastReleaseOf } from "../src/collectors/hosting.mjs";

const METADATA = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";

function fakeFetch(log, { expiresIn = 3600 } = {}) {
  let tokens = 0;
  return async (url, init) => {
    log.push({ url, auth: init?.headers?.authorization ?? null });
    const ok = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
    if (url === METADATA) {
      tokens += 1;
      return ok({ access_token: `tok-${tokens}`, expires_in: expiresIn, token_type: "Bearer" });
    }
    if (init?.headers?.authorization === "Bearer tok-1" || init?.headers?.authorization === "Bearer tok-2") {
      return ok({ releases: [{ releaseTime: "2026-10-11T20:00:00Z" }] });
    }
    return { ok: false, status: 401, json: async () => ({}), text: async () => '{"error":{"code":401}}' };
  };
}

test("the metadata token is kept only as long as the metadata server says, then fetched again", async () => {
  let clock = 1_000_000;
  const log = [];
  const cache = createCache({ now: () => clock });
  const hosting = createHosting({ site: "csarko-sh", fetch: fakeFetch(log, { expiresIn: 300 }), cache, ttlMs: 1, now: () => clock });
  assert.equal(await hosting.lastDeployAt(), "2026-10-11T20:00:00Z");
  clock += 100_000; // 100 s on: the 300 s token still has more than a minute left
  assert.equal(await hosting.lastDeployAt(), "2026-10-11T20:00:00Z");
  assert.equal(log.filter((l) => l.url === METADATA).length, 1, "one token so far");
  clock += 150_000; // 250 s in all: inside the last minute, so a fresh token is fetched
  assert.equal(await hosting.lastDeployAt(), "2026-10-11T20:00:00Z");
  assert.equal(log.filter((l) => l.url === METADATA).length, 2, "a second token");
  assert.equal(log.at(-1).auth, "Bearer tok-2");
});

test("without a metadata server the answer is null, and a refused call is an error the card reports", async () => {
  const none = createHosting({ site: "csarko-sh", fetch: async () => { throw new Error("ENOTFOUND"); }, cache: createCache() });
  assert.equal(await none.lastDeployAt(), null);
  const refused = createHosting({ site: "csarko-sh", fetch: async (url) => (url === METADATA ? { ok: true, json: async () => ({ access_token: "stale", expires_in: 3600 }) } : { ok: false, status: 401, text: async () => "{}" }), cache: createCache() });
  await assert.rejects(() => refused.lastDeployAt(), /hosting 401/);
});

test("lastReleaseOf reads the newest release's time", () => {
  assert.equal(lastReleaseOf({ releases: [{ releaseTime: "2026-10-11T20:00:00Z" }] }), "2026-10-11T20:00:00Z");
  assert.equal(lastReleaseOf({ releases: [] }), null);
  assert.equal(lastReleaseOf(null), null);
});
