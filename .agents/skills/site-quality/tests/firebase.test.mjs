import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const fb = JSON.parse(readFileSync(new URL("../../../../firebase.json", import.meta.url), "utf8"));
const site = fb.hosting.find((h) => h.public === "public");

test("the site rewrites /v to the visits collector and nothing else", () => {
  assert.deepEqual(site.rewrites, [{ source: "/v", run: { serviceId: "csarko-visits", region: "us-west1" } }]);
});

test("the research redirects and clean URLs are untouched", () => {
  assert.equal(site.cleanUrls, true);
  assert.ok(site.redirects.some((r) => r.source === "/docs/:slug*" && r.destination === "/research/:slug" && r.type === 301));
});

test("no public file would shadow the beacon path", () => {
  for (const name of ["v", "v.html", "v/index.html"]) {
    assert.throws(() => readFileSync(new URL(`../../../../public/${name}`, import.meta.url)), `public/${name} exists`);
  }
});

test("the old project pages land on /projects with their own kind's chip checked", () => {
  for (const kind of ["apps", "film", "games"]) {
    assert.ok(site.redirects.some((r) => r.source === `/${kind}` && r.destination === `/projects?filter=${kind}` && r.type === 301), kind);
  }
});
