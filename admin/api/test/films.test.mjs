import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FILMS, PERIODS, LAG_DAYS, collectFilms, filmsAnswer, filmsDays, isFilmsPart } from "../src/films.mjs";
import { emptyMetrics, ANALYTICS_LAG } from "../src/collectors/youtube-analytics.mjs";
import { filmsFromDocs, filmsJsonText } from "../../tools/films-json.mjs";

const TODAY = "2026-11-01";
const AT = "2026-11-01T06:00:00.000Z";
const LAST = { slug: "the-last-trail", title: "The Last Trail", videoId: "C1XsDuJE4MQ", published: "2026-10-29", runtime: "0:56" };
const HALL = { slug: "who-is-standing-in-my-hallway", title: "Who is standing in my hallway?", videoId: "jBh7F1knRAA", published: "2026-09-17", runtime: "0:16" };
const quiet = { error() {}, warn() {}, log() {} };

/** A fake collector: a film's views are 100 a day in the current period and 50 in the one before; one other upload. */
function fakeAnalytics({ fail = {} } = {}) {
  const calls = [];
  const m = (views) => ({ ...emptyMetrics(), views, estimatedMinutesWatched: views / 2, averageViewPercentage: 75 });
  const span = (start, end) => (Date.parse(end) - Date.parse(start)) / 86_400_000 + 1;
  return {
    calls,
    configured: true,
    async totals(ids, start, end) {
      calls.push(["totals", ids, start, end]);
      if (fail.totals) throw new Error("youtube analytics 500: boom");
      const days = span(start, end);
      const current = end === "2026-10-30";
      return new Map([["C1XsDuJE4MQ", m(days * (current ? 100 : 50))], ["jBh7F1knRAA", m(days * 3)], ["other-upload1", m(days)]]);
    },
    async daily(id, start, end) {
      calls.push(["daily", id, start, end]);
      if (fail.daily) throw new Error("daily refused");
      const out = [];
      for (let t = Date.parse(start); t <= Date.parse(end); t += 86_400_000) out.push({ day: new Date(t).toISOString().slice(0, 10), ...m(id === "C1XsDuJE4MQ" ? 100 : 3) });
      return out;
    },
    async retention(id, start, end) {
      calls.push(["retention", id, start, end]);
      if (fail.retention) throw new Error("retention refused");
      return Array.from({ length: 100 }, (_, i) => ({ ratio: (i + 1) / 100, watch: 1 - i / 200, relative: 0.5 }));
    },
    async sources(id, start, end) {
      calls.push(["sources", id, start, end]);
      return [{ source: "SHORTS", views: 90, minutes: 40 }, { source: "EXT_URL", views: 10, minutes: 5 }];
    },
    async external(id, start, end) {
      calls.push(["external", id, start, end]);
      if (fail.external) throw new Error("external refused");
      return [{ url: "https://www.reddit.com/r/horror/comments/abc/", views: 8, minutes: 4 }];
    },
  };
}

test("films.json is the film list docs/films gives, read the way the site's build reads it", () => {
  assert.equal(readFileSync(new URL("../src/films.json", import.meta.url), "utf8"), filmsJsonText(filmsFromDocs()), "stale: run node admin/tools/films-json.mjs");
  assert.deepEqual(FILMS, [LAST, HALL], "newest first");
});

test("a film's video id comes from either watch URL form", () => {
  const dir = mkdtempSync(join(tmpdir(), "films-"));
  try {
    const film = (watch, title, released) => `---\ndescription: A test film used only by this test, long enough for the description rule of seventy characters.\nwatch: ${watch}\nreleased: ${released}\nruntime: 0:30\nalt: A still.\ntags: Horror\nmodel: Video model: Test\n---\n# ${title}\n\nBody.\n`;
    writeFileSync(join(dir, "long-one.md"), film("https://www.youtube.com/watch?v=AbCdEfGhIjK", "A long one", "2026-01-02"));
    writeFileSync(join(dir, "short-one.md"), film("https://youtube.com/shorts/ZyXwVuTsRqP", "A short one", "2026-01-03"));
    assert.deepEqual(filmsFromDocs(dir), [
      { slug: "short-one", title: "A short one", videoId: "ZyXwVuTsRqP", published: "2026-01-03", runtime: "0:30" },
      { slug: "long-one", title: "A long one", videoId: "AbCdEfGhIjK", published: "2026-01-02", runtime: "0:30" },
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("collectFilms makes every report once, the ranges ending two days back, and keeps every other upload", async () => {
  const analytics = fakeAnalytics();
  const youtube = { configured: true, async channel() { return { videosList: [{ id: "C1XsDuJE4MQ", title: "The Last Trail" }, { id: "no-views-yet", title: "A trailer" }, { id: "other-upload1", title: "A vlog" }] }; } };
  const part = await collectFilms({ analytics, youtube, films: [LAST, HALL], today: TODAY, at: AT, log: quiet });
  assert.equal(LAG_DAYS, 2);
  assert.equal(part.through, "2026-10-30");
  assert.equal(part.at, AT);
  assert.equal(part.lag, ANALYTICS_LAG);
  assert.ok(isFilmsPart(part));

  const kinds = (k) => analytics.calls.filter((c) => c[0] === k);
  assert.equal(kinds("totals").length, 6, "each period and the one before it, every upload at once");
  assert.deepEqual(kinds("totals").map((c) => [c[2], c[3]]).sort(), [
    ["2026-05-04", "2026-08-01"], ["2026-08-02", "2026-10-30"], ["2026-09-01", "2026-09-30"], ["2026-10-01", "2026-10-30"], ["2026-10-17", "2026-10-23"], ["2026-10-24", "2026-10-30"],
  ].sort());
  assert.equal(kinds("daily").length, 2);
  assert.deepEqual(kinds("daily")[0].slice(2), ["2026-08-02", "2026-10-30"], "90 days of daily rows");
  assert.deepEqual(kinds("retention").map((c) => c.slice(1)), [["C1XsDuJE4MQ", "2026-10-29", "2026-10-30"], ["jBh7F1knRAA", "2026-09-17", "2026-10-30"]], "from the film's release");
  assert.equal(kinds("sources").length, 6);
  assert.equal(kinds("external").length, 6);
  assert.equal(analytics.calls.length, 22, "about twenty calls for two films");

  const [last, hall] = part.films;
  assert.deepEqual(Object.keys(last.periods), ["7", "30", "90"]);
  assert.equal(last.periods["7"].totals.views, 700);
  assert.equal(last.periods["7"].prev.views, 350);
  assert.equal(last.daily.length, 90);
  assert.equal(last.retention.length, 100);
  assert.equal(last.periods["30"].external[0].url, "https://www.reddit.com/r/horror/comments/abc/");
  assert.equal(last.errors, undefined);
  assert.equal(hall.title, "Who is standing in my hallway?");

  assert.deepEqual(part.others.map((o) => [o.videoId, o.title]), [["other-upload1", "A vlog"], ["no-views-yet", "A trailer"]], "never dropped, a video with no views included");
  assert.deepEqual(part.others[1].periods["7"].totals, emptyMetrics());
  assert.ok(!JSON.stringify(part).includes("undefined"));
  const walk = (v) => { assert.notEqual(v, undefined, "Firestore refuses undefined"); if (v && typeof v === "object") Object.values(v).forEach(walk); };
  walk(part);
});

test("a film's retention, sources or External failing is its own error; totals or daily failing fails the step", async () => {
  const part = await collectFilms({ analytics: fakeAnalytics({ fail: { retention: true, external: true } }), films: [LAST], today: TODAY, at: AT, log: quiet });
  assert.deepEqual(part.films[0].errors, { retention: "retention refused", external: "external refused" });
  assert.equal(part.films[0].retention, null);
  assert.equal(part.films[0].periods["7"].external, null);
  assert.equal(part.films[0].periods["7"].sources.length, 2, "the rest is kept");
  assert.deepEqual(part.others.map((o) => o.videoId), ["jBh7F1knRAA", "other-upload1"], "without YOUTUBE_KEY the others come from the top videos report");
  assert.equal(part.others[1].title, null);

  await assert.rejects(collectFilms({ analytics: fakeAnalytics({ fail: { totals: true } }), films: [LAST], today: TODAY, at: AT, log: quiet }), /boom/);
  await assert.rejects(collectFilms({ analytics: fakeAnalytics({ fail: { daily: true } }), films: [LAST], today: TODAY, at: AT, log: quiet }), /daily refused/);
});

test("filmsAnswer cuts the stored part to the range; there is no day view, so 1 is 7", async () => {
  const stored = await collectFilms({ analytics: fakeAnalytics(), films: [LAST, HALL], today: TODAY, at: AT, log: quiet });
  const week = filmsAnswer(stored, 7);
  assert.deepEqual({ days: week.days, from: week.from, to: week.to, at: week.at, lag: week.lag }, { days: 7, from: "2026-10-24", to: "2026-10-30", at: AT, lag: ANALYTICS_LAG });
  assert.equal(week.films[0].daily.length, 7);
  assert.equal(week.films[0].daily.at(-1).day, "2026-10-30");
  assert.equal(week.films[0].totals.views, 700);
  assert.equal(week.films[0].prev.views, 350);
  assert.deepEqual(Object.keys(week.films[0]), ["slug", "title", "videoId", "published", "runtime", "totals", "prev", "daily", "retention", "sources", "external"]);
  assert.deepEqual(Object.keys(week.others[0]), ["videoId", "title", "totals", "prev"]);

  const quarter = filmsAnswer(stored, 90);
  assert.equal(quarter.films[0].daily.length, 90);
  assert.equal(quarter.films[0].totals.views, 9000);
  assert.equal(quarter.from, "2026-08-02");
  assert.deepEqual(filmsAnswer(stored, 1), week);
  assert.deepEqual(PERIODS.map(filmsDays), PERIODS);
  assert.equal(filmsDays(1), 7);
});
