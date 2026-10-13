import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classifyReferrer, hostOf, groupReferrers } from "../src/referrers.mjs";

const toprefs = JSON.parse(readFileSync(new URL("./fixtures/goatcounter-toprefs.json", import.meta.url), "utf8"));

test("hostOf strips scheme, path and port", () => {
  assert.equal(hostOf("https://www.linkedin.com/feed/"), "www.linkedin.com");
  assert.equal(hostOf("csarko.substack.com/p/first-post"), "csarko.substack.com");
  assert.equal(hostOf("localhost:8788/x"), "localhost");
  assert.equal(hostOf(""), "");
});

test("classifyReferrer puts each host in its group", () => {
  const cases = [
    ["", "direct"],
    ["Google", "search", "g"],
    ["www.google.co.uk", "search"],
    ["bing.com", "search"],
    ["duckduckgo.com", "search"],
    ["search.brave.com", "search"],
    ["r.search.yahoo.com", "search"],
    ["www.ecosia.org", "search"],
    ["www.linkedin.com/feed/", "social"],
    ["lnkd.in", "social"],
    ["t.co", "social"],
    ["twitter.com", "social"],
    ["x.com", "social"],
    ["l.facebook.com", "social"],
    ["www.instagram.com", "social"],
    ["bsky.app", "social"],
    ["mastodon.social", "social"],
    ["hachyderm.io", "social"],
    ["old.reddit.com/r/gamedev", "social"],
    ["news.ycombinator.com", "social"],
    ["Hacker News", "social", "g"],
    ["csarko.substack.com/p/first-post", "newsletter"],
    ["substack.com", "newsletter"],
    ["mail.google.com", "newsletter"],
    ["outlook.live.com", "newsletter"],
    ["github.com/csarkosh/game-dayhike", "code"],
    ["gitlab.com", "code"],
    ["www.npmjs.com", "code"],
    ["www.youtube.com", "video"],
    ["youtu.be", "video"],
    ["example.org/blog", "other"],
    ["(no data)", "direct"],
  ];
  for (const [referrer, group, scheme] of cases) assert.equal(classifyReferrer(referrer, scheme), group, referrer);
});

test("groupReferrers sums the fixture into every group, zeros included", () => {
  const { groups, rows } = groupReferrers(toprefs.stats);
  assert.deepEqual(groups, [
    { group: "search", visitors: 44 },
    { group: "social", visitors: 32 },
    { group: "newsletter", visitors: 14 },
    { group: "code", visitors: 11 },
    { group: "video", visitors: 6 },
    { group: "direct", visitors: 80 },
    { group: "other", visitors: 10 },
  ]);
  assert.equal(rows[0].referrer, "(direct)");
  assert.equal(rows.length, toprefs.stats.length);
  assert.ok(rows.every((r, i) => i === 0 || rows[i - 1].visitors >= r.visitors), "sorted by visitors");
});
