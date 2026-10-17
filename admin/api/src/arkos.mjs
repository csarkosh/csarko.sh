/**
 * Arkos IDE's answers, shaped from the rows the arkos collector reads
 * (`queries/arkos-*.sql`): pure functions, no network, so every rule here is
 * tested with fixtures. The shapes are `admin/CONTRACT.md`'s Arkos section;
 * the journey's rules are the design spec's section 3.
 *
 * Counting Macs without an id happens in SQL (arkos-installs.sql,
 * arkos-kpis.sql): a check on day `i` of a window is that Mac's first in the
 * window exactly when `rd = -1` or `rd > i`, so the rows come here already
 * counted. Everything about a session's events (steps, paths, milestones,
 * next steps, features) is done here, over the newest 5,000 session rows.
 */

import { stepsOf, RESTORE_SECS } from "./steps.mjs";
import { DAY_MS, isoDate, addDays } from "./time.mjs";

/** Columns after the launch in the paths flow. */
export const PATH_DEPTH = 5;
/** Labels a paths column keeps before the rest become Other. */
export const PATH_TOP = 6;
export const NEXT_LABELS = 8;
export const NEXT_TO = 5;
export const SESSION_LIST = 50;
export const COHORTS = 8;
export const TREND_WEEKS = 12;
/** Crash-free sessions under this share, over 7 days, make the health dot a warning. */
export const CRASHFREE_WARNING = 98;
export const ENDS = ["quit", "lost", "unknown"];
export const ENDED = "Ended";
export const OTHER = "Other";

const num = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const count = (v) => num(v) ?? 0;

/** A JSON column: BigQuery hands TO_JSON_STRING back as text; a fixture may hold the object itself. */
export function parseJson(v) {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

/** `quit`, `lost` or `unknown`: anything else a report could carry reads as unknown. */
export const endOf = (v) => (v === "quit" || v === "lost" ? v : "unknown");

/** An install week (days since 1970, a multiple of 7, so a Thursday) as its date. */
export const weekDate = (iw) => (iw === null ? null : isoDate(iw * DAY_MS));
/** The install-week bucket an instant falls in, in the same days-since-1970 unit as `iw`. */
export const weekOf = (ms) => Math.floor(Math.floor(ms / DAY_MS) / 7) * 7;

/**
 * Two Arkos versions compared numerically by their dotted parts (`0.10.0`
 * after `0.9.2`), falling back to the text for anything else; for sorting
 * newest first, call it as `(a, b) => compareVersions(b, a)`.
 */
export function compareVersions(a, b) {
  const parts = (v) => String(v ?? "").split(/[^0-9]+/).filter(Boolean).map(Number);
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] ?? -1) - (pb[i] ?? -1);
    if (d !== 0) return d;
  }
  return String(a ?? "").localeCompare(String(b ?? ""));
}

/** One arkos-sessions.sql row as a session: numbers as numbers, JSON parsed. */
export function sessionOf(row) {
  const focus = parseJson(row.focus);
  const ev = parseJson(row.ev);
  return {
    received: row.received,
    receivedMs: Date.parse(row.received),
    ver: row.ver ?? null,
    osv: num(row.osv),
    arch: row.arch ?? null,
    len: num(row.len),
    end: endOf(row.ended),
    rd: num(row.rd),
    iw: num(row.iw),
    focus: focus !== null && typeof focus === "object" && !Array.isArray(focus) ? focus : {},
    ev: Array.isArray(ev) ? ev : [],
    dropped: count(row.ev_dropped),
    rejected: count(row.ev_rejected),
  };
}

const isFirst = (s) => s.rd === -1;
const nameOf = (v) => (v === null || v === undefined ? "unknown" : String(v));

/** Tallies of sessions and occurrences by a key: `add(key, fields)` once per occurrence, `session` the session it came from. */
function tally() {
  const map = new Map();
  return {
    add(key, fields, session) {
      let row = map.get(key);
      if (!row) map.set(key, (row = { ...fields, sessions: 0, count: 0, seen: new Set() }));
      row.count += 1;
      if (!row.seen.has(session)) {
        row.seen.add(session);
        row.sessions += 1;
      }
    },
    rows() {
      return [...map.values()].map(({ seen, ...r }) => r).sort((a, b) => b.sessions - a.sessions || b.count - a.count || String(a.name).localeCompare(String(b.name)));
    },
  };
}

// --- paths ------------------------------------------------------------------

/**
 * The paths flow over `sessions` (each with `steps`, collapsed by label, and
 * `end`): column 0 is each session's start (Launched, or Continued for a
 * report that began mid-run), columns 1..PATH_DEPTH the steps after it. A
 * column keeps its PATH_TOP most common labels, the rest as Other, plus
 * Ended for the sessions whose steps ran out there, with how they ended; an
 * ended session is in no later column. Links join consecutive columns by
 * node id, counting sessions.
 */
export function pathsOf(sessions) {
  const columns = [];
  const links = new Map();
  const placed = sessions.map(() => []);
  for (let c = 0; c <= PATH_DEPTH; c += 1) {
    const counts = new Map();
    sessions.forEach((s, i) => {
      const step = s.steps[c];
      if (step && (c === 0 || placed[i][c - 1]?.label !== ENDED)) counts.set(step.label, (counts.get(step.label) ?? 0) + 1);
    });
    const kept = new Set([...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, PATH_TOP).map(([label]) => label));
    const nodes = new Map();
    const node = (label, group) => {
      const id = `${c}:${label}`;
      if (!nodes.has(id)) nodes.set(id, { id, label, group, sessions: 0, ...(label === ENDED ? { ends: { quit: 0, lost: 0, unknown: 0 } } : {}) });
      return nodes.get(id);
    };
    sessions.forEach((s, i) => {
      if (c > 0 && placed[i][c - 1] === undefined) return;
      if (c > 0 && placed[i][c - 1].label === ENDED) return;
      const step = s.steps[c];
      let n;
      if (step) n = kept.has(step.label) ? node(step.label, step.group) : node(OTHER, "other");
      else if (c === 0) return;
      else {
        n = node(ENDED, "end");
        n.ends[s.end] += 1;
      }
      n.sessions += 1;
      placed[i][c] = n;
      if (c > 0) {
        const key = `${placed[i][c - 1].id}\u0000${n.id}`;
        links.set(key, (links.get(key) ?? 0) + 1);
      }
    });
    const rank = (n) => (n.label === ENDED ? 2 : n.label === OTHER ? 1 : 0);
    const list = [...nodes.values()].sort((a, b) => rank(a) - rank(b) || b.sessions - a.sessions || a.label.localeCompare(b.label));
    if (list.length === 0) break;
    columns.push(list);
  }
  return {
    columns,
    links: [...links.entries()].map(([key, n]) => {
      const [from, to] = key.split("\u0000");
      return { from, to, sessions: n };
    }),
  };
}

// --- milestones -------------------------------------------------------------

export const MILESTONES = [
  { key: "launch", label: "Launched" },
  { key: "tab", label: "Opened a tab" },
  { key: "agent", label: "Started an agent" },
  { key: "waiting", label: "An agent asked for input" },
  { key: "file", label: "Opened a file" },
  { key: "panes", label: "Worked in two panes" },
  { key: "browser", label: "Used the browser pane" },
];

/**
 * The seconds from the report's start at which one session first reached
 * each milestone (absent when it never did), read from its raw events:
 * `launch` a launch event; `tab` a tab opened by a choice (not a restore);
 * `agent` an agent launched; `waiting` an agent asking for input; `file` a
 * File tab opened by a choice, or the viewer showing a file after the
 * launch's restore window (restored tabs show their files at launch, which
 * is not a choice); `panes` a palette `split`, or a tab opened by a choice
 * while another is open (restored ones included); `browser` a Browser tab
 * opened by a choice. Times are relative to the report's first event.
 */
export function milestoneTimesOf(ev, restoreSecs = RESTORE_SECS) {
  const events = (Array.isArray(ev) ? ev : []).filter((e) => e !== null && typeof e === "object" && typeof e.n === "string");
  const at = {};
  if (events.length === 0) return at;
  const t0 = num(events[0].t) ?? 0;
  const reach = (key, t) => {
    if (at[key] === undefined) at[key] = Math.max(0, t - t0);
  };
  let open = 0;
  for (const e of events) {
    const t = num(e.t) ?? t0;
    const d = e.d !== null && typeof e.d === "object" ? e.d : {};
    if (e.n === "launch") reach("launch", t);
    else if (e.n === "pane_open") {
      const chosen = d.how !== "restore";
      if (chosen) {
        reach("tab", t);
        if (open >= 1) reach("panes", t);
        if (d.kind === "viewer") reach("file", t);
        if (d.kind === "browser") reach("browser", t);
      }
      open += 1;
    } else if (e.n === "pane_close") open = Math.max(0, open - 1);
    else if (e.n === "agent_launch") reach("agent", t);
    else if (e.n === "agent_state") reach("waiting", t);
    else if (e.n === "view" && t - t0 > restoreSecs) reach("file", t);
    else if (e.n === "palette" && d.command === "split") reach("panes", t);
  }
  return at;
}

/** The middle value, the mean of the two middle ones for an even count, rounded to a second; null for none. */
export function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return Math.round(sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2);
}

export function milestonesOf(sessions) {
  const times = sessions.map((s) => ({ first: isFirst(s), at: milestoneTimesOf(s.ev) }));
  return MILESTONES.map(({ key, label }) => {
    const all = times.filter((x) => x.at[key] !== undefined);
    const first = all.filter((x) => x.first);
    return { key, label, sessions: all.length, first: first.length, medianSecs: median(all.map((x) => x.at[key])), firstMedianSecs: median(first.map((x) => x.at[key])) };
  });
}

// --- next steps -------------------------------------------------------------

/**
 * For the NEXT_LABELS labels the most sessions had, the NEXT_TO steps that
 * most often came right after one (Ended after the last), each counted once
 * per session.
 */
export function nextOf(sessions) {
  const having = new Map();
  const after = new Map();
  const groups = new Map([[ENDED, "end"]]);
  sessions.forEach((s, i) => {
    s.steps.forEach((step, k) => {
      groups.set(step.label, groups.get(step.label) ?? step.group);
      if (!having.has(step.label)) having.set(step.label, new Set());
      having.get(step.label).add(i);
      const next = s.steps[k + 1]?.label ?? ENDED;
      if (!after.has(step.label)) after.set(step.label, new Map());
      const m = after.get(step.label);
      if (!m.has(next)) m.set(next, new Set());
      m.get(next).add(i);
    });
  });
  return [...having.entries()]
    .map(([label, set]) => ({ label, sessions: set.size }))
    .sort((a, b) => b.sessions - a.sessions || a.label.localeCompare(b.label))
    .slice(0, NEXT_LABELS)
    .map(({ label, sessions: n }) => ({
      label,
      group: groups.get(label),
      sessions: n,
      to: [...after.get(label).entries()]
        .map(([to, set]) => ({ label: to, group: groups.get(to), sessions: set.size }))
        .sort((a, b) => b.sessions - a.sessions || a.label.localeCompare(b.label))
        .slice(0, NEXT_TO),
    }));
}

// --- features, focus, lengths, friction, return -------------------------------

/**
 * Sessions that used each feature and how many times. Restores are left out
 * of `opened`, and the views of the launch's restore window (restored tabs
 * showing their files) out of `views`, as in the steps.
 */
export function featuresOf(sessions) {
  const t = { opened: tally(), palette: tally(), md: tally(), views: tally(), settings: tally(), help: tally(), agents: tally() };
  sessions.forEach((s, i) => {
    const t0 = num(s.ev.find((e) => e && typeof e === "object")?.t) ?? 0;
    for (const e of s.ev) {
      const d = e?.d !== null && typeof e?.d === "object" ? e.d : {};
      switch (e?.n) {
        case "pane_open":
          if (d.how !== "restore") t.opened.add(`${d.kind}\u0000${d.how}`, { name: nameOf(d.kind), how: d.how ?? null }, i);
          break;
        case "palette": t.palette.add(nameOf(d.command), { name: nameOf(d.command) }, i); break;
        case "md": t.md.add(nameOf(d.feature), { name: nameOf(d.feature) }, i); break;
        case "view": if ((num(e.t) ?? t0) - t0 > RESTORE_SECS) t.views.add(`${d.format}\u0000${d.mode}`, { name: nameOf(d.format), mode: d.mode ?? null }, i); break;
        case "settings": t.settings.add(nameOf(d.key), { name: nameOf(d.key) }, i); break;
        case "help": t.help.add(nameOf(d.what), { name: nameOf(d.what) }, i); break;
        case "agent_launch": t.agents.add(`${d.agent}\u0000${d.how}`, { name: nameOf(d.agent), how: d.how ?? null }, i); break;
        default: break;
      }
    }
  });
  return Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v.rows()]));
}

/** Events of one name tallied by `d.kind` (errors, notices). */
function kindsOf(sessions, name) {
  const t = tally();
  sessions.forEach((s, i) => {
    for (const e of s.ev) if (e?.n === name) t.add(nameOf(e.d?.kind), { name: nameOf(e.d?.kind) }, i);
  });
  return t.rows();
}

export function focusOf(sessions) {
  const map = new Map();
  for (const s of sessions) {
    for (const [name, raw] of Object.entries(s.focus)) {
      const secs = num(raw);
      if (secs === null || secs <= 0) continue;
      const row = map.get(name) ?? { name, secs: 0, sessions: 0 };
      row.secs += secs;
      row.sessions += 1;
      map.set(name, row);
    }
  }
  return [...map.values()].sort((a, b) => b.secs - a.secs || a.name.localeCompare(b.name));
}

const LENGTHS = [["<1m", 60], ["1-10m", 600], ["10-60m", 3600], ["1-4h", 14_400], ["4h+", Infinity]];
export function lengthsOf(sessions) {
  const out = LENGTHS.map(([name]) => ({ name, sessions: 0 }));
  for (const s of sessions) if (s.len !== null) out[LENGTHS.findIndex(([, under]) => s.len < under)].sessions += 1;
  return out;
}

export function endsOf(sessions) {
  const out = { quit: 0, lost: 0, unknown: 0 };
  for (const s of sessions) out[s.end] += 1;
  return out;
}

/** Sessions by `rd`, days since that copy's previous session: -1 first, 0 the same day. */
export function sessionRhythmOf(sessions) {
  const names = ["first", "same day", "1", "2-6", "7+"];
  const out = names.map((name) => ({ name, sessions: 0 }));
  for (const s of sessions) {
    const rd = s.rd;
    if (rd === null || rd < -1) continue;
    const i = rd === -1 ? 0 : rd === 0 ? 1 : rd === 1 ? 2 : rd <= 6 ? 3 : 4;
    out[i].sessions += 1;
  }
  return out;
}

/**
 * Install-week cohorts: sessions by `iw` and by weeks since it (the report's
 * receipt bucketed into the same Thursday weeks, minus `iw`, over 7). The
 * COHORTS newest install weeks, oldest first, each zero-filled up to the
 * week under way at `nowMs` so the triangle has its true shape. A week that
 * ended before the range began (`startMs`) was not measured, so it is
 * `null`, not 0. A report dated before its install week (a wrong clock) is
 * left out.
 */
export function cohortsOf(sessions, nowMs, startMs = -Infinity) {
  const byWeek = new Map();
  for (const s of sessions) {
    if (s.iw === null || !Number.isFinite(s.receivedMs)) continue;
    const since = (weekOf(s.receivedMs) - s.iw) / 7;
    if (since < 0) continue;
    if (!byWeek.has(s.iw)) byWeek.set(s.iw, []);
    const weeks = byWeek.get(s.iw);
    weeks[since] = (weeks[since] ?? 0) + 1;
  }
  const current = weekOf(nowMs);
  return [...byWeek.keys()]
    .sort((a, b) => b - a)
    .slice(0, COHORTS)
    .reverse()
    .map((iw) => {
      const counts = byWeek.get(iw);
      const length = Math.max(counts.length, Math.floor((current - iw) / 7) + 1);
      const measured = (i) => (iw + 7 * (i + 1)) * DAY_MS > startMs;
      return { week: weekDate(iw), weeks: Array.from({ length }, (_, i) => (measured(i) ? counts[i] ?? 0 : null)) };
    });
}

// --- the answers ------------------------------------------------------------

/**
 * The journey answer over the range's session rows (newest first, at most
 * `cap` of them; `capped` when the cap was hit) and the previous range's
 * session count. `sessions` and `firstSessions` count the rows the
 * aggregates cover.
 */
export function journeyOf(rows, { days, previousSessions, cap, nowMs }) {
  const sessions = rows.map(sessionOf).map((s) => ({ ...s, steps: stepsOf(s.ev) }));
  const firsts = sessions.filter(isFirst);
  return {
    days,
    sessions: sessions.length,
    firstSessions: firsts.length,
    previous: { sessions: previousSessions },
    capped: rows.length >= cap,
    paths: { ...pathsOf(sessions), first: pathsOf(firsts) },
    milestones: milestonesOf(sessions),
    next: nextOf(sessions),
    features: featuresOf(sessions),
    focus: focusOf(sessions),
    lengths: lengthsOf(sessions),
    ends: endsOf(sessions),
    errorEvents: kindsOf(sessions, "error"),
    notices: kindsOf(sessions, "notice"),
    dropped: sessions.reduce((n, s) => n + s.dropped, 0),
    rejected: sessions.reduce((n, s) => n + s.rejected, 0),
    rhythm: sessionRhythmOf(sessions),
    cohorts: cohortsOf(sessions, nowMs, nowMs - days * DAY_MS),
  };
}

/** The SESSION_LIST newest sessions in full, steps collapsed with counts. */
export function sessionsListOf(rows) {
  return {
    rows: rows.slice(0, SESSION_LIST).map(sessionOf).map((s) => ({
      received: s.received,
      ver: s.ver,
      osv: s.osv,
      arch: s.arch,
      len: s.len,
      end: s.end,
      rd: s.rd,
      iw: weekDate(s.iw),
      focus: Object.fromEntries(Object.entries(s.focus).map(([k, v]) => [k, num(v)]).filter(([, v]) => v !== null)),
      steps: stepsOf(s.ev, { collapse: "count" }),
      dropped: s.dropped,
      rejected: s.rejected,
    })),
  };
}

/** A crash group's short name: its failure point, or for `other` the cause hash's first eight characters. */
export const crashKeyOf = (pk, mh) => (pk === "other" ? `other:${String(mh ?? "").slice(0, 8)}` : String(pk ?? "unknown"));

/**
 * The crashes answer from arkos-crashes.sql's rows (both windows, newest
 * first) and arkos-session-counts.sql's (sessions and lost by window and
 * version). Reports group by `pk`, and by the whole `mh` for `other`. Each group carries the newest report's file, line, frames,
 * Arkos image and commit, so its offsets can be symbolicated.
 */
export function crashesOf(crashRows, countRows) {
  const current = crashRows.filter((r) => r.win === "current");
  const groups = new Map();
  for (const r of current) {
    const key = crashKeyOf(r.pk, r.mh);
    const by = r.pk === "other" ? `other:${r.mh ?? ""}` : key;
    let g = groups.get(by);
    if (!g) {
      const images = parseJson(r.images);
      const image = Array.isArray(images) ? images.find((im) => Array.isArray(im) && im[0] === "arkos") ?? images[0] ?? null : null;
      const frames = parseJson(r.frames);
      g = { key, pk: r.pk ?? null, mh: r.pk === "other" ? r.mh ?? null : null, file: r.file ?? null, line: num(r.line), versions: new Set(), count: 0, first: r.received, last: r.received, up: {}, frames: Array.isArray(frames) ? frames : [], image, commit: r.commit ?? null };
      groups.set(by, g);
    }
    g.count += 1;
    if (r.ver) g.versions.add(r.ver);
    if (r.received < g.first) g.first = r.received;
    if (r.received > g.last) g.last = r.received;
    if (r.up) g.up[r.up] = (g.up[r.up] ?? 0) + 1;
  }
  const counts = countRows.filter((r) => r.win === "current");
  const byVersion = new Map();
  const ver = (v) => {
    const k = v ?? "unknown";
    if (!byVersion.has(k)) byVersion.set(k, { ver: k, crashes: 0, sessions: 0, lost: 0 });
    return byVersion.get(k);
  };
  for (const r of current) ver(r.ver).crashes += 1;
  for (const r of counts) {
    const row = ver(r.ver);
    row.sessions += count(r.sessions);
    row.lost += count(r.lost);
  }
  return {
    total: current.length,
    previous: crashRows.length - current.length,
    sessions: counts.reduce((n, r) => n + count(r.sessions), 0),
    lost: counts.reduce((n, r) => n + count(r.lost), 0),
    byVersion: [...byVersion.values()].sort((a, b) => compareVersions(b.ver, a.ver)),
    groups: [...groups.values()]
      .map((g) => ({ ...g, versions: [...g.versions].sort((a, b) => compareVersions(b, a)) }))
      .sort((a, b) => b.count - a.count || (b.last > a.last ? 1 : b.last < a.last ? -1 : 0)),
  };
}

const RHYTHM = ["new", "1", "2-6", "7+"];
const largest = (rows) => rows.sort((a, b) => b.macs - a.macs || String(a.name).localeCompare(String(b.name)));

/**
 * The installs answer from arkos-installs.sql's rows over a window of whole
 * UTC days `range` ({ startDate, endDate, prevStartDate, prevEndDate }):
 * every day of both windows present, zeros included, oldest first.
 */
export function installsOf(rows, range) {
  // `installs` is the SQL's name for rd = -1 (NEW is a reserved word there).
  const r = rows.map((x) => ({ ...x, checks: count(x.checks), new: count(x.installs), back: count(x.back), macs: count(x.macs) }));
  const window = (win, from, to) => {
    const byDay = new Map(r.filter((x) => x.dim === "day" && x.win === win).map((x) => [x.name, x]));
    const perDay = [];
    for (let day = from; day <= to; day = addDays(day, 1)) {
      const x = byDay.get(day);
      perDay.push({ day, active: x?.checks ?? 0, new: x?.new ?? 0, back: x?.back ?? 0 });
    }
    const days = [...byDay.values()];
    const sum = (f) => days.reduce((n, x) => n + x[f], 0);
    return { active: sum("macs"), new: sum("new"), back: sum("back"), checks: sum("checks"), perDay };
  };
  const dim = (name) => largest(r.filter((x) => x.dim === name && x.win === "current").map((x) => ({ name: nameOf(x.name), macs: x.macs })));
  const rhythm = new Map(r.filter((x) => x.dim === "rhythm" && x.win === "current").map((x) => [x.name, x.checks]));
  return {
    days: range.days,
    from: range.startDate,
    to: range.endDate,
    current: window("current", range.startDate, range.endDate),
    previous: window("previous", range.prevStartDate, range.prevEndDate),
    rhythm: RHYTHM.map((name) => ({ name, checks: rhythm.get(name) ?? 0 })),
    versions: dim("version"),
    macos: dim("macos"),
    arch: dim("arch"),
  };
}

/** Crash-free sessions as a percentage with one decimal, null with no sessions. */
export const crashFree = (sessions, lost) => (sessions > 0 ? Math.round((1000 * (sessions - lost)) / sessions) / 10 : null);
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "es"}`;

/**
 * The health dot: critical when a crash report arrived in the last 24 hours
 * for the newest version seen in 7 days, a warning when crash-free sessions
 * over 7 days are under CRASHFREE_WARNING percent, else good.
 */
export function arkosHealth({ crashfree, crashes7, crashes24, newest }) {
  const recent = newest === null ? 0 : crashes24.get(newest) ?? 0;
  if (recent > 0) return { status: "critical", note: `${plural(recent, "crash")} on ${newest} in the last 24 hours` };
  if (crashfree !== null && crashfree < CRASHFREE_WARNING) return { status: "warning", note: `Crash-free sessions ${crashfree}% over 7 days, under ${CRASHFREE_WARNING}%` };
  if (crashes7 === 0) return { status: "good", note: "No crashes in 7 days" };
  return { status: "good", note: `${plural(crashes7, "crash")} in 7 days, none on ${newest ?? "the newest version"} in the last 24 hours` };
}

/**
 * The index card from arkos-kpis.sql's rows: `week` rows (0 the oldest,
 * TREND_WEEKS - 1 the 7 days ending today) with checks, installs (rd = -1), macs (the `rd`
 * count within that week), sessions, lost and crashes; `crash24` rows (crash
 * reports of the last 24 hours by version); `seen` rows (every version seen
 * in the last 7 days). `value` is the last week, `prev` the one before.
 */
export function kpisOf(rows, { app, at }) {
  const weeks = Array.from({ length: TREND_WEEKS }, () => ({ checks: 0, new: 0, macs: 0, sessions: 0, lost: 0, crashes: 0 }));
  for (const r of rows) {
    if (r.dim !== "week") continue;
    const w = num(r.week);
    if (w === null || w < 0 || w >= TREND_WEEKS) continue;
    for (const f of Object.keys(weeks[w])) weeks[w][f] = count(r[f === "new" ? "installs" : f]);
  }
  const crashes24 = new Map(rows.filter((r) => r.dim === "crash24").map((r) => [r.ver, count(r.crashes)]));
  const seen = rows.filter((r) => r.dim === "seen" && r.ver).map((r) => r.ver).sort((a, b) => compareVersions(b, a));
  const last = weeks[TREND_WEEKS - 1];
  const prev = weeks[TREND_WEEKS - 2];
  const series = (f) => weeks.map(f);
  const kpi = (key, label, f, extra = {}) => ({ key, label, value: f(last), prev: f(prev), unit: "", trend: series((w) => f(w) ?? 0), ...extra });
  const crashfree = crashFree(last.sessions, last.lost);
  return {
    app,
    at,
    kpis: [
      kpi("active", "Active Macs, 7 days", (w) => w.macs),
      kpi("new", "New installs, 7 days", (w) => w.new),
      kpi("sessions", "Sessions, 7 days", (w) => w.sessions),
      kpi("crashfree", "Crash-free sessions, 7 days", (w) => crashFree(w.sessions, w.lost), { unit: "%" }),
    ],
    health: arkosHealth({ crashfree, crashes7: last.crashes, crashes24, newest: seen[0] ?? null }),
  };
}

