import { test } from "node:test";
import assert from "node:assert/strict";
import { utcOfLocalHour } from "../goatcounter-api.mjs";

test("a New York wall-clock hour becomes its UTC hour, across both daylight-saving changes", () => {
  assert.equal(utcOfLocalHour("2026-10-14", 15, "America/New_York"), "2026-10-14T19:00:00Z");
  assert.equal(utcOfLocalHour("2026-10-13", 20, "America/New_York"), "2026-10-14T00:00:00Z");
  assert.equal(utcOfLocalHour("2026-11-01", 0, "America/New_York"), "2026-11-01T04:00:00Z");
  assert.equal(utcOfLocalHour("2026-11-01", 3, "America/New_York"), "2026-11-01T08:00:00Z");
  assert.equal(utcOfLocalHour("2026-03-08", 3, "America/New_York"), "2026-03-08T07:00:00Z");
  assert.equal(utcOfLocalHour("2026-10-14", 15, "UTC"), "2026-10-14T15:00:00Z");
});
