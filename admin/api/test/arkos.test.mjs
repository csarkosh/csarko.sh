import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stepOf, stepsOf, STEP_TABLE, CONTINUED } from "../src/steps.mjs";
import {
  journeyOf, pathsOf, milestoneTimesOf, milestonesOf, median, nextOf, cohortsOf, weekDate, weekOf, sessionOf,
  sessionsListOf, crashesOf, installsOf, kpisOf, arkosHealth, compareVersions, crashFree, PATH_DEPTH,
} from "../src/arkos.mjs";

const rows = JSON.parse(readFileSync(new URL("./fixtures/arkos-rows.json", import.meta.url), "utf8"));
const NOW = Date.parse("2026-10-17T15:30:00Z");
const ev = (n, t, d) => (d === undefined ? { n, t } : { n, t, d });
/** A session as the aggregates take it, from a list of events. */
const session = (events, extra = {}) => {
  const s = sessionOf({ received: "2026-10-17T12:00:00Z", ended: "quit", rd: 1, ev: events, ...extra });
  return { ...s, steps: stepsOf(s.ev) };
};
const journey = () => journeyOf(rows["arkos-sessions"], { days: 7, previousSessions: 3, cap: 5000, nowMs: NOW });

test("every event in the design's step table has a label, a group and its detail", () => {
  const cases = [
    [ev("launch", 0, { how: "updated" }), "Launched", "launch", "updated"],
    [ev("pane_open", 1, { kind: "terminal", how: "key" }), "Terminal tab", "tab", "key"],
    [ev("pane_open", 1, { kind: "viewer", how: "explorer" }), "File tab", "tab", "explorer"],
    [ev("pane_open", 1, { kind: "browser", how: "link" }), "Browser tab", "tab", "link"],
    [ev("pane_close", 1, { kind: "viewer" }), "Closed a tab", "tab", "viewer"],
    [ev("window_open", 1), "New window", "window", null],
    [ev("window_close", 1), "Closed a window", "window", null],
    [ev("agent_launch", 1, { agent: "claude", how: "new" }), "Claude started", "agent", null],
    [ev("agent_launch", 1, { agent: "claude", how: "resume" }), "Claude resumed", "agent", null],
    [ev("agent_launch", 1, { agent: "other", how: "resume" }), "Other agent", "agent", "resume"],
    [ev("agent_state", 1, { agent: "claude", state: "waiting" }), "Agent asked for input", "agent", "claude"],
    [ev("view", 1, { format: "markdown", mode: "raw" }), "Viewed markdown", "view", "raw"],
    [ev("view", 1, { format: "too_large" }), "Viewed a large file", "view", null],
    [ev("md", 1, { feature: "table_edit" }), "Markdown: table edit", "md", null],
    [ev("md", 1, { feature: "mermaid" }), "Markdown: Mermaid", "md", null],
    [ev("palette", 1, { command: "toggle_maximize" }), "Palette: toggle maximize", "palette", null],
    [ev("settings", 1, { key: "font.family" }), "Changed a setting", "settings", "font.family"],
    [ev("theme", 1, { builtin: true }), "Chose a theme", "settings", "built-in"],
    [ev("theme", 1, { builtin: "false" }), "Chose a theme", "settings", "own"],
    [ev("update", 1, { step: "rolled_back" }), "Update rolled back", "update", null],
    [ev("notice", 1, { kind: "config_error" }), "Notice: config error", "notice", null],
    [ev("error", 1, { kind: "chrome_missing" }), "Error: chrome missing", "error", null],
    [ev("help", 1, { what: "telemetry" }), "Help: telemetry", "help", null],
  ];
  for (const [e, label, group, detail] of cases) assert.deepEqual(stepOf(e), { t: e.t, label, group, detail }, e.n);
  assert.deepEqual(Object.keys(STEP_TABLE).sort(), ["agent_launch", "agent_state", "error", "help", "launch", "md", "notice", "palette", "pane_close", "pane_open", "settings", "theme", "update", "view", "window_close", "window_open"]);
  assert.deepEqual(stepOf(ev("brand_new", 3)), { t: 3, label: "brand_new", group: "other", detail: null }, "a newer release's event keeps its name");
  assert.equal(stepOf("nope"), null);
});

test("tabs restored in the launch's first 5 seconds fold into the launch, and so do the files they show", () => {
  const steps = stepsOf([
    ev("launch", 0, { how: "normal" }),
    ev("pane_open", 1, { kind: "terminal", how: "restore" }),
    ev("pane_open", 2, { kind: "viewer", how: "restore" }),
    ev("view", 2, { format: "markdown", mode: "rendered" }),
    ev("pane_open", 5, { kind: "terminal", how: "restore" }),
    ev("pane_open", 6, { kind: "terminal", how: "restore" }),
    ev("view", 9, { format: "code", mode: "raw" }),
  ]);
  assert.deepEqual(steps.map((s) => [s.t, s.label, s.detail]), [[0, "Launched", "normal, 3 tabs restored"], [6, "Terminal tab", "restore"], [9, "Viewed code", "raw"]], "a restore after 5 s is a step of its own");
  assert.equal(stepsOf([ev("launch", 0), ev("pane_open", 1, { kind: "browser", how: "restore" })])[0].detail, "1 tab restored");
});

test("a restore logged before the launch still folds into it", () => {
  const steps = stepsOf([ev("pane_open", 0, { kind: "terminal", how: "restore" }), ev("launch", 0, { how: "normal" }), ev("agent_launch", 3, { agent: "claude", how: "new" })]);
  assert.deepEqual(steps.map((s) => [s.label, s.detail]), [["Launched", "normal, 1 tab restored"], ["Claude started", null]]);
});

test("a report without a launch starts with a Continued step at its first event", () => {
  const steps = stepsOf([ev("pane_open", 40, { kind: "terminal", how: "restore" }), ev("agent_launch", 41, { agent: "claude", how: "resume" })]);
  assert.deepEqual(steps.map((s) => [s.t, s.label, s.group, s.detail]), [[40, CONTINUED, "launch", "1 tab restored"], [41, "Claude resumed", "agent", null]]);
  assert.deepEqual(stepsOf([]), []);
  assert.deepEqual(stepsOf(null), []);
});

test("consecutive identical steps collapse: by label for the journey, by label and detail with a count for one session", () => {
  const events = [
    ev("launch", 0, { how: "normal" }),
    ev("pane_open", 10, { kind: "terminal", how: "key" }),
    ev("pane_open", 11, { kind: "terminal", how: "key" }),
    ev("pane_open", 12, { kind: "terminal", how: "click" }),
    ev("settings", 20, { key: "theme.dark" }),
    ev("settings", 21, { key: "theme.dark" }),
    ev("settings", 22, { key: "theme.dark" }),
    ev("pane_open", 30, { kind: "terminal", how: "key" }),
  ];
  assert.deepEqual(stepsOf(events).map((s) => [s.t, s.label]), [[0, "Launched"], [10, "Terminal tab"], [20, "Changed a setting"], [30, "Terminal tab"]], "only consecutive steps collapse");
  assert.deepEqual(stepsOf(events, { collapse: "count" }).map((s) => [s.t, s.label, s.detail]), [
    [0, "Launched", "normal"], [10, "Terminal tab", "key, x2"], [12, "Terminal tab", "click"], [20, "Changed a setting", "theme.dark, x3"], [30, "Terminal tab", "key"],
  ]);
  assert.equal(stepsOf([ev("launch", 0), ev("window_open", 1), ev("window_open", 2)], { collapse: "count" })[1].detail, "x2", "a count alone when there was no detail");
});

test("paths: six columns, the top six labels of each plus Other, and Ended with how sessions ended", () => {
  // Column 1 has eight labels: A three times, B twice, then one each; G and H fall to Other.
  const picks = ["A", "A", "A", "B", "B", "C", "D", "E", "F", "G", "H"];
  const sessions = picks.map((p, i) => ({ end: i === 0 ? "lost" : "quit", steps: [{ label: "Launched", group: "launch" }, { label: p, group: "palette" }, ...(i < 3 ? [{ label: "Z", group: "help" }] : [])] }));
  const { columns, links } = pathsOf(sessions);
  assert.equal(columns.length, 4, "columns stop once every session has ended");
  assert.deepEqual(columns[0], [{ id: "0:Launched", label: "Launched", group: "launch", sessions: 11 }]);
  assert.deepEqual(columns[1].map((n) => [n.id, n.sessions]), [["1:A", 3], ["1:B", 2], ["1:C", 1], ["1:D", 1], ["1:E", 1], ["1:F", 1], ["1:Other", 2]]);
  assert.equal(columns[1].at(-1).group, "other");
  assert.deepEqual(columns[2], [{ id: "2:Z", label: "Z", group: "help", sessions: 3 }, { id: "2:Ended", label: "Ended", group: "end", sessions: 8, ends: { quit: 8, lost: 0, unknown: 0 } }]);
  assert.deepEqual(columns[3], [{ id: "3:Ended", label: "Ended", group: "end", sessions: 3, ends: { quit: 2, lost: 1, unknown: 0 } }]);
  const link = (from, to) => links.find((l) => l.from === from && l.to === to)?.sessions;
  assert.equal(link("0:Launched", "1:A"), 3);
  assert.equal(link("0:Launched", "1:Other"), 2);
  assert.equal(link("1:A", "2:Z"), 3);
  assert.equal(link("1:B", "2:Ended"), 2);
  assert.equal(link("1:Other", "2:Ended"), 2);
  assert.equal(links.reduce((n, l) => n + (l.from.startsWith("0:") ? l.sessions : 0), 0), 11, "every session leaves column 0 once");
});

test("paths never go past PATH_DEPTH columns after the launch, and an ended session is in no later column", () => {
  const long = { end: "quit", steps: Array.from({ length: 10 }, (_, i) => ({ label: `S${i}`, group: "palette" })) };
  const short = { end: "lost", steps: [{ label: "S0", group: "palette" }] };
  const { columns, links } = pathsOf([long, short]);
  assert.equal(columns.length, PATH_DEPTH + 1);
  assert.deepEqual(columns[1].map((n) => n.label), ["S1", "Ended"]);
  assert.deepEqual(columns[1][1].ends, { quit: 0, lost: 1, unknown: 0 });
  assert.ok(columns.slice(2).every((c) => c.every((n) => n.label !== "Ended")), "the ended session does not reappear");
  assert.equal(links.filter((l) => l.to.endsWith(":Ended")).length, 1);
});

test("the journey over the fixture: paths for all sessions and for first sessions alone", () => {
  const j = journey();
  assert.equal(j.sessions, 5);
  assert.equal(j.firstSessions, 2);
  assert.deepEqual(j.previous, { sessions: 3 });
  assert.equal(j.capped, false);
  assert.deepEqual(j.paths.columns.map((c) => c.map((n) => `${n.label}:${n.sessions}`)), [
    ["Launched:4", "Continued:1"],
    ["Terminal tab:3", "Claude resumed:1", "Other agent:1"],
    ["Claude started:2", "Agent asked for input:1", "Notice: update ready:1", "Viewed code:1"],
    ["Agent asked for input:1", "Error: session lost:1", "File tab:1", "Ended:2"],
    ["Viewed markdown:1", "Ended:2"],
    ["Markdown: Mermaid:1"],
  ]);
  assert.deepEqual(j.paths.columns[3].at(-1).ends, { quit: 1, lost: 0, unknown: 1 });
  assert.deepEqual(j.paths.first.columns.map((c) => c.map((n) => `${n.label}:${n.sessions}`)), [
    ["Launched:2"], ["Terminal tab:2"], ["Claude started:2"], ["Agent asked for input:1", "Error: session lost:1"], ["Ended:2"],
  ]);
  assert.deepEqual(j.paths.first.columns[4][0].ends, { quit: 1, lost: 1, unknown: 0 });
  assert.equal(journeyOf(rows["arkos-sessions"], { days: 7, previousSessions: 0, cap: 5, nowMs: NOW }).capped, true, "capped when the cap was reached");
});

test("milestones: who reached each, and the median seconds to it, all and first sessions", () => {
  const j = journey();
  const m = Object.fromEntries(j.milestones.map((x) => [x.key, [x.sessions, x.first, x.medianSecs, x.firstMedianSecs]]));
  assert.deepEqual(j.milestones.map((x) => x.key), ["launch", "tab", "agent", "waiting", "file", "panes", "browser"]);
  assert.deepEqual(j.milestones.map((x) => x.label), ["Launched", "Opened a tab", "Started an agent", "An agent asked for input", "Opened a file", "Worked in two panes", "Used the browser pane"]);
  assert.deepEqual(m.launch, [4, 2, 0, 0], "the Continued report has no launch");
  assert.deepEqual(m.tab, [4, 2, 16, 16], "restores are not a tab opened: 4, 10, 21, 300");
  assert.deepEqual(m.agent, [4, 2, 16, 42], "0 (a Continued report counts from its first event), 12, 20, 64");
  assert.deepEqual(m.waiting, [2, 1, 170, 200]);
  assert.deepEqual(m.file, [2, 0, 163, null], "the restored file's view at 3 s does not count; 25 and 300");
  assert.deepEqual(m.panes, [2, 0, 153, null]);
  assert.deepEqual(m.browser, [1, 0, 900, null]);
  assert.equal(median([]), null);
  assert.equal(median([5]), 5);
  assert.equal(median([9, 1, 4]), 4);
});

test("the panes milestone: a split, or a tab opened by a choice while another is open", () => {
  const term = (t, how = "key") => ev("pane_open", t, { kind: "terminal", how });
  assert.equal(milestoneTimesOf([ev("launch", 0), term(10), term(20)]).panes, 20, "a second tab while the first is open");
  assert.equal(milestoneTimesOf([ev("launch", 0), term(10), ev("pane_close", 15, { kind: "terminal" }), term(20)]).panes, undefined, "the first was closed");
  assert.equal(milestoneTimesOf([ev("launch", 0), term(1, "restore"), term(30)]).panes, 30, "a restored tab is open, so the first chosen one makes two");
  assert.equal(milestoneTimesOf([ev("launch", 0), term(1, "restore"), term(2, "restore")]).panes, undefined, "restores alone are not a choice");
  assert.equal(milestoneTimesOf([ev("launch", 0), ev("palette", 50, { command: "split" })]).panes, 50);
  assert.equal(milestoneTimesOf([ev("launch", 0), ev("pane_close", 1, { kind: "terminal" }), ev("pane_close", 2, { kind: "terminal" }), term(10), term(11)]).panes, 11, "closes never take the count below zero");
});

test("milestone times: file and browser by a choice, the agent's input", () => {
  const at = milestoneTimesOf([
    ev("launch", 0),
    ev("pane_open", 1, { kind: "browser", how: "restore" }),
    ev("view", 4, { format: "code" }),
    ev("view", 8, { format: "code" }),
    ev("pane_open", 70, { kind: "browser", how: "link" }),
    ev("agent_state", 90, { agent: "claude", state: "waiting" }),
  ]);
  assert.deepEqual(at, { launch: 0, file: 8, browser: 70, tab: 70, panes: 70, waiting: 90 });
  assert.deepEqual(milestoneTimesOf([]), {});
});

test("next steps: the most common labels, each with what came right after, counting sessions", () => {
  const j = journey();
  assert.deepEqual(j.next.slice(0, 4).map((x) => [x.label, x.sessions]), [["Launched", 4], ["Terminal tab", 3], ["Agent asked for input", 2], ["Claude started", 2]]);
  assert.equal(j.next.length, 8);
  assert.deepEqual(j.next[0].to, [{ label: "Terminal tab", group: "tab", sessions: 3 }, { label: "Claude resumed", group: "agent", sessions: 1 }]);
  assert.deepEqual(j.next[2].to, [{ label: "Ended", group: "end", sessions: 1 }, { label: "File tab", group: "tab", sessions: 1 }]);
  // Twice in one session still counts that session once; six different next steps keep five.
  const s = session([ev("launch", 0), ...["split", "find", "doctor", "about", "save_file", "new_window"].flatMap((c, i) => [ev("pane_open", 10 + 2 * i, { kind: "terminal", how: "key" }), ev("palette", 11 + 2 * i, { command: c })])]);
  const term = nextOf([s]).find((x) => x.label === "Terminal tab");
  assert.equal(term.sessions, 1);
  assert.equal(term.to.length, 5);
  assert.ok(term.to.every((x) => x.sessions === 1));
});

test("features, focus, lengths, ends, friction and rhythm over the fixture", () => {
  const j = journey();
  assert.deepEqual(j.features.opened, [
    { name: "terminal", how: "key", sessions: 2, count: 3 },
    { name: "browser", how: "palette", sessions: 1, count: 1 },
    { name: "terminal", how: "palette", sessions: 1, count: 1 },
    { name: "viewer", how: "explorer", sessions: 1, count: 1 },
  ], "restores are left out");
  assert.deepEqual(j.features.palette, [{ name: "split", sessions: 1, count: 1 }]);
  assert.deepEqual(j.features.md, [{ name: "mermaid", sessions: 1, count: 1 }]);
  assert.deepEqual(j.features.views, [{ name: "code", mode: "raw", sessions: 1, count: 1 }, { name: "markdown", mode: "rendered", sessions: 1, count: 1 }], "the restored tab's view is not counted");
  assert.deepEqual(j.features.settings, [{ name: "theme.dark", sessions: 1, count: 2 }]);
  assert.deepEqual(j.features.help, [{ name: "keybindings", sessions: 1, count: 1 }]);
  assert.deepEqual(j.features.agents, [{ name: "claude", how: "new", sessions: 2, count: 2 }, { name: "claude", how: "resume", sessions: 1, count: 1 }, { name: "other", how: "new", sessions: 1, count: 1 }]);
  assert.deepEqual(j.focus, [{ name: "terminal", secs: 3800, sessions: 3 }, { name: "viewer", secs: 900, sessions: 1 }, { name: "browser", secs: 50, sessions: 1 }, { name: "settings", secs: 20, sessions: 1 }], "a zero is not a session that had it");
  assert.deepEqual(j.lengths, [{ name: "<1m", sessions: 1 }, { name: "1-10m", sessions: 1 }, { name: "10-60m", sessions: 1 }, { name: "1-4h", sessions: 2 }, { name: "4h+", sessions: 0 }]);
  assert.deepEqual(j.ends, { quit: 3, lost: 1, unknown: 1 });
  assert.deepEqual(j.errorEvents, [{ name: "session_lost", sessions: 1, count: 1 }]);
  assert.deepEqual(j.notices, [{ name: "update_ready", sessions: 1, count: 1 }]);
  assert.equal(j.dropped, 2);
  assert.equal(j.rejected, 1, "a string number is read as a number");
  assert.deepEqual(j.rhythm, [{ name: "first", sessions: 2 }, { name: "same day", sessions: 1 }, { name: "1", sessions: 1 }, { name: "2-6", sessions: 1 }, { name: "7+", sessions: 0 }]);
});

test("install weeks are Thursdays, days since 1970 in multiples of 7", () => {
  assert.equal(weekDate(20734), "2026-10-08");
  assert.equal(new Date(`${weekDate(20734)}T00:00:00Z`).getUTCDay(), 4);
  assert.equal(weekDate(0), "1970-01-01");
  assert.equal(weekDate(null), null);
  assert.equal(weekOf(Date.parse("2026-10-14T23:59:59Z")), 20734, "Wednesday is still the week that began the Thursday before");
  assert.equal(weekOf(Date.parse("2026-10-15T00:00:00Z")), 20741);
});

test("cohorts: sessions by install week and weeks since, zero-filled to the week under way, null before the range", () => {
  assert.deepEqual(journey().cohorts, [
    { week: "2026-09-24", weeks: [null, null, 0, 1] },
    { week: "2026-10-08", weeks: [1, 2] },
    { week: "2026-10-15", weeks: [1] },
  ]);
  const at = (received, iw) => ({ ...sessionOf({ received, iw }), steps: [] });
  const many = Array.from({ length: 10 }, (_, i) => at("2026-10-16T00:00:00Z", 20741 - 7 * i));
  const cohorts = cohortsOf([...many, at("2026-10-01T00:00:00Z", 20741)], NOW);
  assert.equal(cohorts.length, 8, "the eight newest install weeks");
  assert.equal(cohorts[0].week, weekDate(20741 - 49), "oldest first");
  assert.deepEqual(cohorts.at(-1), { week: "2026-10-15", weeks: [1] }, "a report from before its install week (a wrong clock) is left out");
  assert.deepEqual(cohortsOf([at("2026-10-16T00:00:00Z", null)], NOW), [], "no install week, no cohort");
});

test("sessions list: the 50 newest in full, steps with counts, iw as its date", () => {
  const { rows: list } = sessionsListOf(rows["arkos-sessions"]);
  assert.equal(list.length, 5);
  assert.deepEqual(list[0], {
    received: "2026-10-17T14:05:12Z", ver: "0.5.1", osv: 15, arch: "arm64", len: 5400, end: "quit", rd: 1, iw: "2026-10-08",
    focus: { terminal: 3100, viewer: 900 },
    steps: [
      { t: 0, label: "Launched", group: "launch", detail: "normal, 3 tabs restored" },
      { t: 12, label: "Claude resumed", group: "agent", detail: null },
      { t: 140, label: "Agent asked for input", group: "agent", detail: "claude" },
      { t: 300, label: "File tab", group: "tab", detail: "explorer" },
      { t: 301, label: "Viewed markdown", group: "view", detail: "rendered" },
      { t: 320, label: "Markdown: Mermaid", group: "md", detail: null },
      { t: 400, label: "Palette: split", group: "palette", detail: null },
      { t: 900, label: "Browser tab", group: "tab", detail: "palette" },
      { t: 950, label: "Changed a setting", group: "settings", detail: "theme.dark, x2" },
      { t: 1000, label: "Help: keybindings", group: "help", detail: null },
    ],
    dropped: 2, rejected: 0,
  });
  assert.deepEqual([list[4].osv, list[4].len, list[4].rd, list[4].iw], [15, 700, -1, "2026-10-08"], "string numbers become numbers");
  assert.equal(list[3].dropped, 0, "a missing count is 0");
  const sixty = Array.from({ length: 60 }, (_, i) => ({ ...rows["arkos-sessions"][1], received: `2026-10-17T10:${String(59 - i).padStart(2, "0")}:00Z` }));
  assert.equal(sessionsListOf(sixty).rows.length, 50);
  assert.equal(sessionOf({ received: "x", ended: "crashed", ev: "not json" }).end, "unknown");
});

test("crashes: grouped by pk and the whole mh, newest report's details, joined with sessions by version", () => {
  const c = crashesOf(rows["arkos-crashes"], rows["arkos-session-counts"]);
  assert.equal(c.total, 3);
  assert.equal(c.previous, 1);
  assert.equal(c.sessions, 5);
  assert.equal(c.lost, 1);
  assert.deepEqual(c.byVersion, [{ ver: "0.5.1", crashes: 1, sessions: 4, lost: 1 }, { ver: "0.5.0", crashes: 2, sessions: 1, lost: 0 }], "newest version first, the previous window left out");
  assert.deepEqual(c.groups.map((g) => [g.key, g.count]), [["other:b5bb9d80", 2], ["daemon_socket", 1]]);
  const g = c.groups[0];
  assert.equal(g.mh, "b5bb9d8014a0f9b1d61e21e796d78dccdf1352f23cd32812f4850b878ae4944c");
  assert.deepEqual([g.file, g.line, g.commit], ["/src/crates/arkos/src/md_view.rs", 812, "4f2a9c1"], "the newest report's");
  assert.deepEqual(g.versions, ["0.5.1", "0.5.0"]);
  assert.deepEqual([g.first, g.last], ["2026-10-15T10:00:00Z", "2026-10-17T09:12:00Z"]);
  assert.deepEqual(g.up, { "<10m": 2 });
  assert.deepEqual(g.frames, [[0, 1843200], [0, 1790466]]);
  assert.deepEqual(g.image, ["arkos", "6c3f0e2a9b8d4c7e1f5a0b9c8d7e6f5a", 48234496]);
  assert.equal(c.groups[1].mh, null, "a named failure point has no hash");
  // Two causes that share the first eight characters are still two groups.
  const twin = { ...rows["arkos-crashes"][0], mh: "b5bb9d80" + "0".repeat(56) };
  assert.equal(crashesOf([rows["arkos-crashes"][0], twin], []).groups.length, 2);
  // The image is the Arkos binary even when it is not listed first.
  const other = crashesOf([{ ...rows["arkos-crashes"][2], received: "2026-10-18T00:00:00Z" }], []);
  assert.deepEqual(other.groups[0].image, ["arkos", "bbbb", 2]);
  assert.deepEqual(crashesOf([], []), { total: 0, previous: 0, sessions: 0, lost: 0, byVersion: [], groups: [] });
});

test("installs: every day of both windows, zeros included, Macs by their first check", () => {
  const range = { days: 7, startDate: "2026-10-11", endDate: "2026-10-17", prevStartDate: "2026-10-04", prevEndDate: "2026-10-10" };
  const r = installsOf(rows["arkos-installs"], range);
  assert.deepEqual([r.days, r.from, r.to], [7, "2026-10-11", "2026-10-17"]);
  assert.deepEqual(r.current.perDay.map((d) => [d.day, d.active, d.new, d.back]), [
    ["2026-10-11", 3, 1, 0], ["2026-10-12", 0, 0, 0], ["2026-10-13", 4, 1, 1], ["2026-10-14", 0, 0, 0], ["2026-10-15", 0, 0, 0], ["2026-10-16", 0, 0, 0], ["2026-10-17", 2, 0, 0],
  ]);
  assert.deepEqual({ ...r.current, perDay: undefined }, { active: 5, new: 2, back: 1, checks: 9, perDay: undefined }, "active is the rd count summed, not the checks");
  assert.equal(r.previous.perDay.length, 7);
  assert.equal(r.previous.perDay[0].day, "2026-10-04");
  assert.deepEqual([r.previous.active, r.previous.checks], [2, 2]);
  assert.deepEqual(r.rhythm, [{ name: "new", checks: 2 }, { name: "1", checks: 6 }, { name: "2-6", checks: 0 }, { name: "7+", checks: 1 }]);
  assert.deepEqual(r.versions, [{ name: "0.5.1", macs: 4 }, { name: "0.5.0", macs: 1 }]);
  assert.deepEqual(r.macos, [{ name: "15", macs: 5 }]);
  assert.deepEqual(r.arch, [{ name: "arm64", macs: 4 }, { name: "unknown", macs: 1 }]);
  const one = installsOf([], { days: 1, startDate: "2026-10-17", endDate: "2026-10-17", prevStartDate: "2026-10-16", prevEndDate: "2026-10-16" });
  assert.deepEqual(one.current.perDay, [{ day: "2026-10-17", active: 0, new: 0, back: 0 }]);
  assert.deepEqual(one.previous.perDay, [{ day: "2026-10-16", active: 0, new: 0, back: 0 }]);
});

test("the rd rule lives in the SQL: a check on day i is a Mac's first in the window when rd = -1 or rd > i", () => {
  const sql = (name) => readFileSync(new URL(`../queries/${name}.sql`, import.meta.url), "utf8");
  assert.match(sql("arkos-installs"), /rd = -1 OR rd > DATE_DIFF\(day, DATE\(TIMESTAMP\(IF\(win = 'current', @start, @prev_start\)\)\), DAY\)/);
  assert.match(sql("arkos-kpis"), /rd = -1 OR rd > i/);
  assert.match(sql("arkos-kpis"), /MOD\(DATE_DIFF\(DATE\(timestamp\), DATE\(TIMESTAMP\(@start\)\), DAY\), 7\) AS i/);
});

test("kpis: the last week against the one before, 12-week trends, crash-free with one decimal", () => {
  const k = kpisOf(rows["arkos-kpis"], { app: "ide-arkos", at: "2026-10-17T15:30:00.000Z" });
  assert.equal(k.app, "ide-arkos");
  assert.deepEqual(k.kpis.map((x) => [x.key, x.label, x.value, x.prev, x.unit]), [
    ["active", "Active Macs, 7 days", 8, 6, ""],
    ["new", "New installs, 7 days", 4, 3, ""],
    ["sessions", "Sessions, 7 days", 200, 50, ""],
    ["crashfree", "Crash-free sessions, 7 days", 98.5, 100, "%"],
  ]);
  assert.ok(k.kpis.every((x) => x.trend.length === 12 && x.trend.every((v) => typeof v === "number")));
  assert.deepEqual(k.kpis[0].trend, [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 8]);
  assert.deepEqual(k.kpis[3].trend, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100, 98.5], "a week without sessions is 0 in the trend");
  assert.deepEqual(k.health, { status: "good", note: "2 crashes in 7 days, none on 0.10.0 in the last 24 hours" }, "0.10.0 is newer than 0.9.2, and the crash today was on 0.5.0");
  const none = kpisOf([], { app: "ide-arkos", at: "t" });
  assert.equal(none.kpis[3].value, null, "no sessions, no crash-free share");
  assert.deepEqual(none.health, { status: "good", note: "No crashes in 7 days" });
  assert.equal(crashFree(3, 1), 66.7);
  assert.equal(crashFree(0, 0), null);
});

test("health: critical for a crash on the newest version in 24 hours, warning under 98% crash-free, else good", () => {
  const map = (o) => new Map(Object.entries(o));
  assert.deepEqual(arkosHealth({ crashfree: 99.9, crashes7: 2, crashes24: map({ "0.5.1": 2 }), newest: "0.5.1" }), { status: "critical", note: "2 crashes on 0.5.1 in the last 24 hours" });
  assert.deepEqual(arkosHealth({ crashfree: 100, crashes7: 1, crashes24: map({ "0.5.1": 1 }), newest: "0.5.1" }), { status: "critical", note: "1 crash on 0.5.1 in the last 24 hours" });
  assert.deepEqual(arkosHealth({ crashfree: 97.9, crashes7: 1, crashes24: map({ "0.5.0": 1 }), newest: "0.5.1" }), { status: "warning", note: "Crash-free sessions 97.9% over 7 days, under 98%" });
  assert.equal(arkosHealth({ crashfree: 98, crashes7: 0, crashes24: map({}), newest: "0.5.1" }).status, "good", "98% is not under 98%");
  assert.equal(arkosHealth({ crashfree: null, crashes7: 0, crashes24: map({}), newest: null }).note, "No crashes in 7 days");
  const fromRows = kpisOf([{ dim: "week", week: 11, sessions: 10, lost: 0, crashes: 1 }, { dim: "crash24", ver: "1.0.0", crashes: 1 }, { dim: "seen", ver: "1.0.0" }], { app: "a", at: "t" });
  assert.equal(fromRows.health.status, "critical");
});

test("versions compare by their numbers", () => {
  assert.ok(compareVersions("0.10.0", "0.9.2") > 0);
  assert.ok(compareVersions("1.0.0", "1.0.0") === 0);
  assert.deepEqual(["0.5.0", "0.10.1", "0.5.1", "0.9.9"].sort((a, b) => compareVersions(b, a)), ["0.10.1", "0.9.9", "0.5.1", "0.5.0"]);
});
