import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDays, isAllowedOrigin, preflightHeaders } from "../src/http.mjs";
import { parseManualValue } from "../src/app.mjs";
import { readConfig, parseServiceAccountKey, secret } from "../src/config.mjs";

test("days is absent (7) or one of the four ranges; anything else is refused", () => {
  assert.equal(parseDays(null), 7);
  assert.equal(parseDays(""), 7);
  for (const d of ["1", "7", "30", "90"]) assert.equal(parseDays(d), Number(d));
  for (const d of ["0", "2", "14", "365", "-7", "7.5", "abc", "7; drop", "007"]) assert.equal(parseDays(d), null, d);
});

test("a missing origin passes, a listed one passes, anything else is refused", () => {
  const allowed = ["https://admin.csarko.sh", "http://localhost:8788"];
  assert.equal(isAllowedOrigin(undefined, allowed), true);
  assert.equal(isAllowedOrigin("https://admin.csarko.sh", allowed), true);
  assert.equal(isAllowedOrigin("https://csarko.sh", allowed), false);
  assert.equal(isAllowedOrigin("null", allowed), false);
  assert.equal(preflightHeaders("https://admin.csarko.sh")["access-control-allow-headers"], "authorization, content-type");
});

test("a manual value is a finite non-negative number and nothing else", () => {
  assert.equal(parseManualValue('{"value": 12}'), 12);
  assert.equal(parseManualValue('{"value": 0}'), 0);
  assert.equal(parseManualValue('{"value": "12"}'), null);
  assert.equal(parseManualValue('{"value": -1}'), null);
  assert.equal(parseManualValue('{"value": null}'), null);
  assert.equal(parseManualValue("12"), null);
  assert.equal(parseManualValue("not json"), null);
  assert.equal(parseManualValue(null), null);
});

test("an empty or placeholder credential is not configured; the allowlist is parsed", () => {
  const quiet = { error() {} };
  assert.equal(secret("unset"), null);
  assert.equal(secret("  unset  "), null);
  assert.equal(secret(""), null);
  assert.equal(secret(undefined), null);
  assert.equal(secret("unset-but-real"), "unset-but-real");
  const config = readConfig({ ADMIN_EMAILS: "", GOATCOUNTER_TOKEN: "unset", YOUTUBE_KEY: "", GITHUB_TOKEN: " unset ", PSI_KEY: "unset", GSC_SA_KEY: "unset" }, quiet);
  assert.deepEqual(config.adminEmails, [], "no readers");
  assert.equal(config.goatcounter.token, null);
  assert.equal(config.youtube.key, null);
  assert.equal(config.github.token, null);
  assert.equal(config.psiKey, null);
  assert.equal(config.gsc.key, null);
  const real = readConfig({ ADMIN_EMAILS: "A@b.c, d@e.f", FIREBASE_PROJECT: "csarko-sh", GOATCOUNTER_TOKEN: "tok" }, quiet);
  assert.deepEqual(real.adminEmails, ["a@b.c", "d@e.f"]);
  assert.equal(real.firebaseProject, "csarko-sh");
  assert.equal(real.goatcounter.token, "tok");
});

test("defaults and lists", () => {
  const quiet = { error() {} };
  const config = readConfig({}, quiet);
  assert.equal(config.goatcounter.site, "csarko");
  assert.equal(config.gsc.property, "sc-domain:csarko.sh");
  assert.equal(config.sitemapUrl, "https://csarko.sh/sitemap.xml");
  assert.deepEqual(config.allowedOrigins, ["https://admin.csarko.sh", "http://localhost:8788"]);
  assert.equal(config.github.owner, "csarkosh", "every public repo of the account, not a fixed list");
  assert.equal(config.port, 8080);
  const custom = readConfig({ GITHUB_OWNER: " someone ", ALLOWED_ORIGINS: "http://localhost:5173", SITE_URL: "https://example.test/" }, quiet);
  assert.equal(custom.github.owner, "someone");
  assert.deepEqual(custom.allowedOrigins, ["http://localhost:5173"]);
  assert.equal(custom.sitemapUrl, "https://example.test/sitemap.xml");
});

test("the Search Console key must be the JSON content of a service account key", () => {
  const errors = [];
  const log = { error: (m) => errors.push(m) };
  assert.equal(parseServiceAccountKey("/path/to/key.json", log), null);
  assert.equal(parseServiceAccountKey('{"type":"service_account"}', log), null);
  assert.deepEqual(parseServiceAccountKey('{"client_email":"a@b","private_key":"k"}', log), { client_email: "a@b", private_key: "k" });
  assert.equal(errors.length, 2);
});
