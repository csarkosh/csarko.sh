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

test("every other /apps address lands on the Apps filter; only the old pictures keep their files", () => {
  const i = (pred) => site.redirects.findIndex(pred);
  const pictures = i((r) => r.regex === "^/apps/(?P<file>[^/]+\\.(?:jpg|jpeg|png|webp|avif))$" && r.destination === "/projects/:file");
  const rest = i((r) => r.source === "/apps/**" && r.destination === "/projects?filter=apps" && r.type === 301);
  assert.ok(pictures >= 0, "the old pictures still redirect to their files");
  assert.ok(rest > pictures, "the catch-all comes after the pictures (the first match wins)");
  assert.ok(!site.redirects.some((r) => r.source === "/apps/:file*"), "no /apps page lands on a /projects/<name> that does not exist");
});
