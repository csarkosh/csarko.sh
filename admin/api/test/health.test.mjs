import { test } from "node:test";
import assert from "node:assert/strict";
import { assessHealth } from "../src/health.mjs";
import { certDaysLeft } from "../src/collectors/uptime.mjs";

const now = Date.parse("2026-10-12T12:00:00Z");
const good = { up: true, lighthousePerformance: 98, indexed: { indexed: 16, total: 16 }, notFound: [{ path: "/x", visitors: 2 }], sitemapFetchedAt: "2026-10-10T00:00:00Z", certDaysLeft: 60, now };

test("good when everything passes", () => {
  assert.deepEqual(assessHealth(good), { status: "good", note: "all checks pass" });
});

test("warning when one check slips", () => {
  assert.equal(assessHealth({ ...good, lighthousePerformance: 93 }).status, "warning");
  assert.equal(assessHealth({ ...good, lighthousePerformance: 95 }).status, "good", "95 is the floor for good");
  assert.equal(assessHealth({ ...good, indexed: { indexed: 14, total: 16 } }).status, "warning");
  assert.equal(assessHealth({ ...good, notFound: [{ path: "/old", visitors: 6 }] }).status, "warning");
  assert.equal(assessHealth({ ...good, notFound: [{ path: "/old", visitors: 5 }] }).status, "good", "a handful is five");
  assert.equal(assessHealth({ ...good, sitemapFetchedAt: "2026-10-01T00:00:00Z" }).status, "warning");
  assert.equal(assessHealth({ ...good, certDaysLeft: 10 }).status, "warning");
  const r = assessHealth({ ...good, indexed: { indexed: 14, total: 16 } });
  assert.match(r.note, /2 of 16 pages not indexed/);
});

test("critical when the site is down or performance drops under 90", () => {
  assert.deepEqual(assessHealth({ ...good, up: false }), { status: "critical", note: "site down" });
  assert.equal(assessHealth({ ...good, lighthousePerformance: 89 }).status, "critical");
  assert.equal(assessHealth({ ...good, lighthousePerformance: 90 }).status, "warning", "90 is a warning, not critical");
  assert.equal(assessHealth({ ...good, certDaysLeft: 0 }).status, "critical");
  const both = assessHealth({ ...good, up: false, indexed: { indexed: 1, total: 16 } });
  assert.equal(both.status, "critical");
  assert.match(both.note, /^site down; 15 of 16/);
});

test("unknown values never degrade the status but are named in the note", () => {
  const r = assessHealth({ up: true, lighthousePerformance: null, indexed: null, notFound: null, sitemapFetchedAt: null, certDaysLeft: null, now });
  assert.equal(r.status, "good");
  assert.equal(r.note, "all checks pass, unknown: lighthouse, indexing, 404s, sitemap fetch");
});

test("certDaysLeft counts whole days", () => {
  assert.equal(certDaysLeft("Dec 31 23:59:59 2026 GMT", now), 80);
  assert.equal(certDaysLeft("2026-10-11T00:00:00Z", now), -2);
  assert.equal(certDaysLeft("garbage", now), null);
});
