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

test("the apps site rewrites /v to the visits collector beside Arkos's report routes, so a visit there joins the site's", () => {
  const apps = fb.hosting.find((h) => h.site === "csarko-sh-apps");
  assert.deepEqual(apps.rewrites.find((r) => r.source === "/v"), { source: "/v", run: { serviceId: "csarko-visits", region: "us-west1" } });
  assert.ok(apps.rewrites.some((r) => r.source === "/a") && apps.rewrites.some((r) => r.source === "/a/check"), "the report routes stay");
  const csp = apps.headers.find((h) => h.source === "**").headers.find((h) => h.key === "Content-Security-Policy").value;
  assert.ok(csp.includes("script-src 'self';") && csp.includes("connect-src 'self';"), "the beacon is same-origin: nothing new in the CSP");
});

test("the old project pages land on /projects with their own kind's chip checked", () => {
  for (const kind of ["apps", "film", "games"]) {
    assert.ok(site.redirects.some((r) => r.source === `/${kind}` && r.destination === `/projects?filter=${kind}` && r.type === 301), kind);
  }
});

// The old React site's /contact still shows in Google (position 2.6, Search Console 2026-11-12)
// and was the one retired path that answered 404; the home page's Contact section replaced it.
test("the old /contact page lands on the home page's Contact section", () => {
  assert.ok(site.redirects.some((r) => r.source === "/contact" && r.destination === "/#contact" && r.type === 301));
});

test("every other /apps address lands on the Apps filter; only the old pictures keep their files", () => {
  const i = (pred) => site.redirects.findIndex(pred);
  const pictures = i((r) => r.regex === "^/apps/(?P<file>[^/]+\\.(?:jpg|jpeg|png|webp|avif))$" && r.destination === "/projects/:file");
  const rest = i((r) => r.source === "/apps/**" && r.destination === "/projects?filter=apps" && r.type === 301);
  assert.ok(pictures >= 0, "the old pictures still redirect to their files");
  assert.ok(rest > pictures, "the catch-all comes after the pictures (the first match wins)");
  assert.ok(!site.redirects.some((r) => r.source === "/apps/:file*"), "no /apps page lands on a /projects/<name> that does not exist");
});

test("the donate site: its own entry, a CSP that reaches only the prices bucket, the beacon rewrite and no redirect", () => {
  const donate = fb.hosting.find((h) => h.site === "csarko-sh-donate");
  assert.equal(donate.public, "donate/public");
  assert.equal(donate.cleanUrls, true);
  assert.equal(donate.trailingSlash, false);
  assert.deepEqual(donate.rewrites, [{ source: "/v", run: { serviceId: "csarko-visits", region: "us-west1" } }]);
  assert.equal(donate.redirects, undefined);
  const csp = donate.headers.find((h) => h.source === "**").headers.find((h) => h.key === "Content-Security-Policy").value;
  assert.ok(csp.includes("connect-src 'self' https://storage.googleapis.com;"));
  assert.ok(csp.includes("script-src 'self';"));
  assert.ok(csp.includes("form-action 'none'"));
  assert.ok(!csp.includes("stripe"), "Stripe is a navigation, not a request from the page");
});
