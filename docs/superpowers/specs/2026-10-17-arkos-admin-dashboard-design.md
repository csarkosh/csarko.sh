# The Arkos IDE admin dashboard

*2026-10-17. Step 4 of ide-arkos' telemetry spec (`docs/superpowers/specs/2026-10-16-telemetry-design.md`
in that repository): the dashboard, last. Cyrus, 2026-10-17: "The key here is to map the user journey.
We can keep the other metrics that don't require [consent]. This way, we can see how it's being used
and optimize it better."*

## 1. What it is for

One page, `admin.csarko.sh/ide-arkos/`, that says how Arkos is used so it can be improved: what people do
first after a launch, what they do next, which features they find and how they reach them, where a session
stalls or crashes, and whether people come back. Beside the journey, the counts that need no consent: how
many Macs run Arkos, how many are new, which versions, macOS versions and processors.

It reads the rows the collector already writes (`csarko_visits._AllLogs`, `json_payload.app = 'arkos'`):

| Kind | Consent | Gives |
|---|---|---|
| `check` | none, one per Mac per day | active Macs, new installs, returning after a gap, version, macOS, processor |
| `session` | usage reports `on` | the journey: every event in order with its time, focus time per surface, length, how it ended, install week, days since the last session |
| `crash` | each one agreed to | crash groups by cause and version |

The data cannot identify anyone (ide-arkos `docs/telemetry.md`); this page is private (the admin
allowlist), which is the disclosure's "the service account of his own admin service". Nothing here is
published, so the disclosure's merge-under-ten rule for publication does not apply to it.

## 2. Counting Macs without an id

A check's `rd` is the days since that Mac's previous check (`-1` the first time), and a Mac sends at most
one check a day through the collector. So, in a window of days `0..n-1`, a check on day `i` is that Mac's
first in the window exactly when `rd = -1` or `rd > i`. Counting those rows counts distinct Macs in the
window, with no id stored (Omaha's `rd` trick). Daily actives are the day's checks. New installs are
`rd = -1`; returning after a gap is `rd >= 7`.

## 3. The journey

A session report's `ev` is the run's events in order with seconds since its start. Each event becomes a
**step** with a label (`steps.mjs` in the API, one table):

| Event | Step label | Detail |
|---|---|---|
| `launch` | Launched | `how` |
| `pane_open` | Terminal tab / File tab / Browser tab | `how` (palette, key, click, explorer, link, restore) |
| `pane_close` | Closed a tab | `kind` |
| `window_open`, `window_close` | New window / Closed a window | |
| `agent_launch` | Claude started / Claude resumed / Other agent | |
| `agent_state` | Agent asked for input | `agent` |
| `view` | Viewed markdown / code / plain text / ... | `mode` |
| `md` | Markdown: table edit / Mermaid / ... | |
| `palette` | Palette: `<command>` | |
| `settings` | Changed a setting | `key` |
| `theme` | Chose a theme | `builtin` |
| `update` | Update `<step>` | |
| `notice` | Notice: `<kind>` | |
| `error` | Error: `<kind>` | |
| `help` | Help: `<what>` | |

Restored tabs at launch (`pane_open how=restore` in the first seconds) are folded into the launch step
("Launched, 3 tabs restored"), since they are not choices. Consecutive identical steps collapse.

The page shows the journey four ways, each answering a question:

1. **Paths** (what do people do, in what order): a flow of the first five steps after the launch, across
   all sessions in the range. Each column holds its six most common steps plus Other and Ended (with how:
   quit, lost, unknown); bands between columns are sized by sessions. Hovering or focusing a node gives its
   sessions and share. New installs' first sessions (`rd = -1`) can be shown alone.
2. **Milestones** (how far do sessions get, and how fast): the share of sessions that reach each of
   Launched, Opened a tab, Started an agent, Agent asked for input, Opened a file, Used two or more panes,
   Used the browser, and the median time to reach it; first sessions beside all sessions.
3. **What comes next** (where to smooth the way): for the most common steps, what the next step is, as
   shares. A step most often followed by Ended, an error or a help page is a place to look at.
4. **Recent sessions** (one run in full): the newest sessions, each as its steps on a time line with the
   focus split and how it ended, like the csarko.sh page's journeys.

Around them: **Features** (sessions using each palette command, markdown feature, setting and help page,
and how tabs are opened: palette, key or click, which says whether the shortcuts are found), **Time**
(focus seconds per surface, session lengths, how sessions end), **Friction** (errors per session by kind,
lost sessions as the crash estimate, events dropped or refused), and **Return** (days since the previous
session, and install-week cohorts by week of use).

## 4. The API

The csarko-admin service serves it under a prefix, `/arkos/admin/kpis` and `/arkos/admin/query/<name>`,
so `apps.json` names `<service>/arkos` as Arkos's API and the shell's two-route contract holds. Queries:
`installs`, `journey`, `sessions`, `crashes` (shapes in `admin/CONTRACT.md`). Each is one SQL file under
`admin/api/queries/arkos-*.sql`; the journey's aggregation (steps, paths, milestones, next steps,
features) is done in code over the session rows of the range, capped at the 5,000 newest, so it is tested
with fixtures. Same conventions as every route: auth, CORS, five-minute cache, `null` plus
`notConfigured.visits` when the dataset is not set.

## 5. The page

`admin/public/ide-arkos/` (index.html, page.js), a csarko.sh admin page in every respect (AGENTS.md "Admin
pages"): the same nav, trail `Admin › Arkos IDE`, range row, cards that are skeletons until their query
answers, `?preview` from `admin/public/sample/ide-arkos/`. The flow is hand-drawn SVG (no library), with
tokens for its colours in both themes, a table equivalent for screen readers, and horizontal scroll inside
its card on a phone.

Cards, in order: Installs (tiles and the per-day chart), Paths, Milestones, What comes next, Features, Time,
Friction, Return, Crashes, Recent sessions.

## 6. Cyrus's own use

*Cyrus, 2026-10-17: "I want it to include myself. I'm dog fooding it for personal things and
professional. It should distinguish me from actual users though."* A row is his when a release on
his Mac says `ch = dogfood` (an empty `~/.config/arkos/dogfood`, ide-arkos's telemetry crate) or
the collector marked it `s.own` because it came from one of his addresses (`--ignore-ips`, which
still drops his website beacons; lib-visits v0.4.0). Every query takes `who`: `users` (default),
`me`, `all`; the page has a Whose row beside the range (Users, You, Both, `?who=` opens on one).
The index card counts users only.

## 7. Not now

- Publishing aggregates (the disclosure's promise; nothing is published).
- Symbolicating crash frames on the page: offsets are listed, `atos` stays a hand step.
