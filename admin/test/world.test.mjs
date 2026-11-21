import { test } from "node:test";
import assert from "node:assert/strict";
import { projection, source } from "../tools/world-map.mjs";
import { project } from "../public/world.js";
import { readFileSync } from "node:fs";

test("world.js is the tool's output, not a stale copy", () => {
  assert.equal(readFileSync(new URL("../public/world.js", import.meta.url), "utf8"), source());
});

test("the page's projection places a city where d3-geo's does", () => {
  const d3 = projection();
  for (const [lon, lat] of [[-122.3, 47.8], [-74, 40.7], [139.7, 35.7], [-58.4, -34.6], [151.2, -33.9], [-179.9, 64], [179.9, -10], [0, 0], [37.6, 55.8]]) {
    const [x, y] = project(lon, lat);
    const [ex, ey] = d3([lon, lat]);
    assert.ok(Math.abs(x - ex) < 0.01 && Math.abs(y - ey) < 0.01, `${lon},${lat}: ${x},${y} against ${ex},${ey}`);
  }
});
