import { test } from "node:test";
import assert from "node:assert/strict";
import { createCache } from "../src/cache.mjs";
import { createGitHub, publicNamesOf } from "../src/collectors/github.mjs";

const quiet = { error() {}, warn() {}, log() {} };

const LISTING = [
  { full_name: "csarkosh/game-dayhike", private: false, fork: false },
  { full_name: "csarkosh/app-macstats", private: false, fork: false },
  { full_name: "csarkosh/some-fork", private: false, fork: true },
  { full_name: "csarkosh/secret", private: true, fork: false },
];

function fakeFetch(calls, { trafficFor = () => true } = {}) {
  return async (url, init) => {
    const path = url.replace("https://api.github.com", "");
    calls.push({ path, auth: Boolean(init?.headers?.authorization) });
    const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });
    if (path.startsWith("/users/csarkosh/repos")) return json(path.includes("page=1") ? LISTING : []);
    const m = /^\/repos\/([^/]+\/[^/]+)(\/traffic\/(views|clones|popular\/referrers))?$/.exec(path);
    if (!m) return json({ message: "no" }, 404);
    const repo = m[1];
    if (!m[2]) return json({ stargazers_count: repo.endsWith("dayhike") ? 3 : 0, forks_count: 0, subscribers_count: 1, private: repo.endsWith("secret") });
    if (!trafficFor(repo)) return json({ message: "Resource not accessible by personal access token" }, 403);
    if (m[3] === "views") return json({ count: 20, uniques: 9 });
    if (m[3] === "clones") return json({ count: 2, uniques: 2 });
    return json([{ referrer: "news.ycombinator.com", count: 5, uniques: 4 }]);
  };
}

test("publicNamesOf keeps public, non-fork repositories only", () => {
  assert.deepEqual(publicNamesOf(LISTING), ["csarkosh/game-dayhike", "csarkosh/app-macstats"]);
  assert.deepEqual(publicNamesOf(null), []);
  assert.deepEqual(publicNamesOf([{ full_name: "x/y" }]), [], "a row that does not say private: false is not trusted");
});

test("the account's public repositories are listed without the token, alphabetical, and read with it", async () => {
  const calls = [];
  const gh = createGitHub({ token: "t", owner: "csarkosh", fetch: fakeFetch(calls), cache: createCache(), log: quiet });
  assert.equal(gh.enabled, true);
  assert.deepEqual(await gh.list(), ["csarkosh/app-macstats", "csarkosh/game-dayhike"]);
  assert.equal(calls[0].auth, false, "the listing is the public one, asked for as anyone would");
  const rows = await gh.all();
  assert.deepEqual(rows.map((r) => r.repo), ["csarkosh/app-macstats", "csarkosh/game-dayhike"]);
  assert.equal(rows[1].stars, 3);
  assert.deepEqual(rows[1].traffic, { views: 20, uniques: 9, clones: 2, referrers: [{ referrer: "news.ycombinator.com", count: 5, uniques: 4 }] });
  assert.equal(calls.filter((c) => c.path.startsWith("/users/")).length, 1, "the listing is one request, then cached");
});

test("a repository the token does not cover keeps its stars and says why the traffic is missing", async () => {
  const gh = createGitHub({ token: "t", owner: "csarkosh", fetch: fakeFetch([], { trafficFor: (repo) => repo.endsWith("dayhike") }), cache: createCache(), log: quiet });
  const rows = await gh.all();
  const mac = rows.find((r) => r.repo === "csarkosh/app-macstats");
  assert.equal(mac.traffic, null);
  assert.match(mac.trafficError, /403/);
  assert.equal(rows.find((r) => r.repo === "csarkosh/game-dayhike").traffic.views, 20);
});

test("no owner, nothing to report; an owner that is not an account name is refused", async () => {
  const none = createGitHub({ token: null, owner: null, fetch: fakeFetch([]), cache: createCache(), log: quiet });
  assert.equal(none.enabled, false);
  assert.deepEqual(await none.all(), []);
  const bad = createGitHub({ token: null, owner: "../x", fetch: fakeFetch([]), cache: createCache(), log: quiet });
  assert.equal(bad.enabled, false);
});
