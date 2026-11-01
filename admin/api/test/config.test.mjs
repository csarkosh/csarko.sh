import { test } from "node:test";
import assert from "node:assert/strict";
import { readConfig, parseOAuth } from "../src/config.mjs";

test("YOUTUBE_OAUTH is the consent's JSON, { client_id, client_secret, refresh_token }; anything else is unset", () => {
  const errors = [];
  const log = { error: (m) => errors.push(m) };
  const good = { client_id: "id.apps.googleusercontent.com", client_secret: "cs-fake", refresh_token: "1//rt-fake" };
  assert.deepEqual(parseOAuth(JSON.stringify(good), log), good);
  assert.deepEqual(parseOAuth(JSON.stringify({ ...good, scope: "extra fields are dropped" }), log), good);
  assert.equal(errors.length, 0);

  for (const raw of [undefined, "", "  ", "unset"]) assert.equal(parseOAuth(raw, log), null, `${raw} is not configured`);
  assert.equal(errors.length, 0, "a missing credential is not an error");

  assert.equal(parseOAuth("1//rt-fake", log), null, "a bare token is not the JSON");
  assert.equal(parseOAuth(JSON.stringify({ client_id: "id", client_secret: "cs" }), log), null, "no refresh token");
  assert.equal(parseOAuth(JSON.stringify({ ...good, refresh_token: "" }), log), null, "an empty refresh token");
  assert.equal(parseOAuth(JSON.stringify({ installed: { client_id: "id", client_secret: "cs" } }), log), null, "the client file itself is not the consent");
  assert.equal(parseOAuth("null", log), null);
  assert.equal(errors.length, 5);
  for (const m of errors) assert.ok(!m.includes("rt-fake") && !m.includes("cs-fake"), "the value is never logged");
});

test("readConfig carries the YouTube Analytics consent, null without one", () => {
  const quiet = { error() {} };
  assert.equal(readConfig({}, quiet).youtubeAnalytics, null);
  assert.equal(readConfig({ YOUTUBE_OAUTH: "unset" }, quiet).youtubeAnalytics, null);
  const oauth = { client_id: "id", client_secret: "cs", refresh_token: "rt" };
  assert.deepEqual(readConfig({ YOUTUBE_OAUTH: JSON.stringify(oauth) }, quiet).youtubeAnalytics, oauth);
});
