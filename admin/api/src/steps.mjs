/**
 * Arkos session events as journey steps: the one table behind the journey
 * map (the design spec's section 3, ide-arkos `docs/telemetry.md` for the
 * events and their `d` values; their ids read with spaces, `new terminal`). Each event becomes `{ t, label, group,
 * detail }`: the label is what the paths, milestones and next steps count
 * by, the group colours it on the page, the detail is shown beside it.
 *
 * Two rules make a run read as choices rather than noise. Tabs restored at
 * launch (`pane_open how=restore` within RESTORE_SECS of the start) are not
 * choices, so they fold into the start step ("normal, 3 tabs restored"), and
 * so do the files those tabs show (`view` in the same seconds).
 * Consecutive identical steps collapse into one: by label for the journey's
 * aggregates, by label and detail with a count (`x3`) for one session shown
 * in full.
 */

/** Restores this many seconds after the start, or fewer, belong to the launch. */
export const RESTORE_SECS = 5;

const PANES = { terminal: "Terminal tab", viewer: "File tab", browser: "Browser tab" };
const VIEWS = { markdown: "Viewed markdown", code: "Viewed code", plain: "Viewed plain text", image: "Viewed an image", video: "Viewed a video", binary: "Viewed a binary file", too_large: "Viewed a large file" };
const MD = { table_edit: "table edit", mermaid: "Mermaid", details: "details", checklist: "checklist", remote_image: "remote image", video: "video", inline_diff: "inline diff" };
const words = (v) => String(v).replaceAll("_", " ");
const str = (v) => (v === null || v === undefined || v === "" ? null : String(v));

/**
 * The step table: event name to `(d) => [label, group, detail]`. An event
 * whose value is not one Arkos sends still gets a label (its raw value), so a
 * newer release's value shows up rather than vanishing.
 */
export const STEP_TABLE = {
  launch: (d) => ["Launched", "launch", str(d.how)],
  pane_open: (d) => [PANES[d.kind] ?? `Tab: ${str(d.kind) ?? "unknown"}`, "tab", str(d.how)],
  pane_close: (d) => ["Closed a tab", "tab", str(d.kind)],
  window_open: () => ["New window", "window", null],
  window_close: () => ["Closed a window", "window", null],
  agent_launch: (d) => [d.agent === "claude" ? (d.how === "resume" ? "Claude resumed" : "Claude started") : "Other agent", "agent", d.agent === "claude" ? null : str(d.how)],
  agent_state: (d) => ["Agent asked for input", "agent", str(d.agent)],
  view: (d) => [VIEWS[d.format] ?? `Viewed ${words(d.format ?? "a file")}`, "view", str(d.mode)],
  md: (d) => [`Markdown: ${MD[d.feature] ?? words(d.feature ?? "unknown")}`, "md", null],
  palette: (d) => [`Palette: ${words(d.command ?? "unknown")}`, "palette", null],
  settings: (d) => ["Changed a setting", "settings", str(d.key)],
  theme: (d) => ["Chose a theme", "settings", d.builtin === true || d.builtin === "true" ? "built-in" : d.builtin === false || d.builtin === "false" ? "own" : null],
  update: (d) => [`Update ${words(d.step ?? "unknown")}`, "update", null],
  notice: (d) => [`Notice: ${words(d.kind ?? "unknown")}`, "notice", null],
  error: (d) => [`Error: ${words(d.kind ?? "unknown")}`, "error", null],
  help: (d) => [`Help: ${words(d.what ?? "unknown")}`, "help", null],
};

/** A report that starts without a launch (a window that reconnected to the daemon, or usage reports turned on mid-run) starts here. */
export const CONTINUED = "Continued";

/** One event as a step, or null for something that is not an event. An unknown name keeps its name as the label. */
export function stepOf(event) {
  if (event === null || typeof event !== "object" || typeof event.n !== "string") return null;
  const d = event.d !== null && typeof event.d === "object" ? event.d : {};
  const t = Number.isFinite(Number(event.t)) ? Number(event.t) : 0;
  const row = STEP_TABLE[event.n];
  const [label, group, detail] = row ? row(d) : [event.n, "other", null];
  return { t, label, group, detail };
}

const isRestore = (e) => e?.n === "pane_open" && e.d?.how === "restore";

/**
 * A report's events as steps, the start first. The first step is the launch
 * or, when the report has none before its first other event, a `Continued`
 * step at that event's time. Restores within RESTORE_SECS of the start fold
 * into it, counted in its detail, and views in those seconds (the restored
 * tabs showing their files) are dropped. With `collapse: "label"` consecutive steps
 * of one label become the first of them; with `collapse: "count"` steps of
 * one label and detail do, with `xN` in the detail. Events that are not
 * objects are skipped.
 */
export function stepsOf(ev, { collapse = "label" } = {}) {
  const events = (Array.isArray(ev) ? ev : []).filter((e) => e !== null && typeof e === "object" && typeof e.n === "string");
  if (events.length === 0) return [];
  const launchAt = events.findIndex((e) => e.n === "launch");
  const firstOther = events.findIndex((e) => !isRestore(e));
  let start;
  let rest;
  if (launchAt !== -1 && (launchAt <= firstOther || firstOther === -1)) {
    start = stepOf(events[launchAt]);
    rest = events.filter((_, i) => i !== launchAt);
  } else {
    start = { t: stepOf(events[0]).t, label: CONTINUED, group: "launch", detail: null };
    rest = events;
  }
  let restored = 0;
  const steps = [start];
  for (const e of rest) {
    const s = stepOf(e);
    if (isRestore(e) && s.t - start.t <= RESTORE_SECS) {
      restored += 1;
      continue;
    }
    if (e.n === "view" && s.t - start.t <= RESTORE_SECS) continue;
    steps.push(s);
  }
  if (restored > 0) start.detail = [start.detail, `${restored} ${restored === 1 ? "tab" : "tabs"} restored`].filter(Boolean).join(", ");
  return collapse === "count" ? collapseCounting(steps) : collapseByLabel(steps);
}

function collapseByLabel(steps) {
  const out = [];
  for (const s of steps) if (out.length === 0 || out[out.length - 1].label !== s.label) out.push(s);
  return out;
}

function collapseCounting(steps) {
  const out = [];
  for (const s of steps) {
    const prev = out[out.length - 1];
    if (prev && prev.label === s.label && prev.detail === s.detail) prev.n += 1;
    else out.push({ ...s, n: 1 });
  }
  return out.map(({ n, ...s }) => (n > 1 ? { ...s, detail: [s.detail, `x${n}`].filter(Boolean).join(", ") } : s));
}
