import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createCache } from "../src/cache.mjs";
import { createLedgers, parseLedger, slugOf, LEDGER_GLOB } from "../src/collectors/ledgers.mjs";

const LEDGERS = JSON.parse(readFileSync(new URL("./fixtures/finance-ledgers.json", import.meta.url), "utf8"));
const log = { error() {}, warn() {}, log() {} };

/** A fake Storage client: `bucket(name).getFiles({ matchGlob })` answering the fixture's objects, each with `download()` and `metadata.updated`. */
function fakeStorage(calls, { extra = [], fail = false } = {}) {
  const files = [
    ...Object.entries(LEDGERS).map(([slug, l]) => ({ name: `${slug}/ledger.json`, metadata: { updated: l.updated }, async download() { return [Buffer.from(JSON.stringify(l.body))]; } })),
    ...extra,
  ];
  return {
    bucket(name) {
      calls.push({ bucket: name });
      return {
        async getFiles(opts) {
          calls.push({ getFiles: opts });
          if (fail) throw new Error("permission denied");
          return [files];
        },
      };
    },
  };
}

test("not configured without a bucket; gs:// and a trailing slash are tolerated", () => {
  assert.equal(createLedgers({ bucket: null, cache: createCache(), storage: fakeStorage([]), log }).configured, false);
  const l = createLedgers({ bucket: "gs://csarko-sh-film-ledgers/", cache: createCache(), storage: fakeStorage([]), log });
  assert.deepEqual([l.configured, l.bucket], [true, "csarko-sh-film-ledgers"]);
});

test("list reads every <film>/ledger.json, both shapes, with the object's update time, sorted by slug and cached", async () => {
  const calls = [];
  const bad = { name: "broken/ledger.json", metadata: { updated: "2026-10-01T00:00:00.000Z" }, async download() { return [Buffer.from("{not json")]; } };
  const notLedger = { name: "notes/ledger.json", metadata: {}, async download() { return [Buffer.from(JSON.stringify({ hello: 1 }))]; } };
  const other = { name: "last-trail/take-03.mp4", metadata: {}, async download() { throw new Error("never read"); } };
  const ledgers = createLedgers({ bucket: "csarko-sh-film-ledgers", cache: createCache(), storage: fakeStorage(calls, { extra: [bad, notLedger, other] }), log });
  const list = await ledgers.list();
  assert.deepEqual(calls, [{ bucket: "csarko-sh-film-ledgers" }, { getFiles: { matchGlob: LEDGER_GLOB } }]);
  assert.equal(LEDGER_GLOB, "*/ledger.json");
  assert.deepEqual(list.map((l) => l.slug), ["last-trail", "last-trail-dad", "last-trail-thing-body", "last-trail-thing-face17", "last-trail-thing17", "ranger-radio", "rowan-rockslide", "rowan-speech"], "the two unreadable ones skipped, the clip ignored");
  const lastTrail = list.find((l) => l.slug === "last-trail");
  assert.deepEqual([lastTrail.rows.length, lastTrail.budgetUsd, lastTrail.updated], [13, null, "2026-10-28T20:32:39Z"]);
  assert.equal(Math.round(lastTrail.rows.reduce((n, r) => n + r.usd, 0) * 100) / 100, 146.75);
  const speech = list.find((l) => l.slug === "rowan-speech");
  assert.deepEqual([speech.rows.length, speech.budgetUsd], [3, 20], "the object shape carries its budget");
  await ledgers.list();
  assert.equal(calls.length, 2, "cached");
});

test("a failed listing throws naming the bucket", async () => {
  const ledgers = createLedgers({ bucket: "csarko-sh-film-ledgers", cache: createCache(), storage: fakeStorage([], { fail: true }), log });
  await assert.rejects(ledgers.list(), /listing gs:\/\/csarko-sh-film-ledgers failed: permission denied/);
});

test("parseLedger and slugOf", () => {
  assert.deepEqual(parseLedger("[{\"model\":\"T2I\",\"usd\":0.03}]"), { rows: [{ model: "T2I", usd: 0.03 }], budgetUsd: null });
  assert.deepEqual(parseLedger({ rows: [{ usd: 1 }, null, 3], budget_usd: 25 }), { rows: [{ usd: 1 }], budgetUsd: 25 });
  assert.deepEqual(parseLedger({ rows: [], budgetUsd: 10 }), { rows: [], budgetUsd: 10 });
  assert.deepEqual(parseLedger({ rows: [], budget_usd: "x" }), { rows: [], budgetUsd: null });
  assert.equal(parseLedger("nope"), null);
  assert.equal(parseLedger({ budget_usd: 5 }), null);
  assert.equal(parseLedger(42), null);
  assert.deepEqual([slugOf("last-trail/ledger.json"), slugOf("ledger.json"), slugOf("a/b/ledger.json"), slugOf("last-trail/notes.json"), slugOf(null)], ["last-trail", null, null, null, null]);
});
