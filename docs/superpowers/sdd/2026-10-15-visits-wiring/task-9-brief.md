### Task 9: The queries read the collector; GoatCounter leaves the API

**Files:**
- Modify: `admin/api/src/queries.mjs` (the five query functions, `requireGc`, `notFoundOf`, `health`, `kpis`, `snapshot`, the imports at 17-20, the `createQueries` signature at 80), `admin/api/src/config.mjs:67`, `admin/api/src/server.mjs:20,39-50,71`, `admin/api/test/queries.test.mjs`, `admin/api/test/app.test.mjs:17,79`, `admin/api/test/http.test.mjs:41-57`, `admin/api/.env.local.example:6`
- Delete: `admin/api/src/collectors/goatcounter.mjs`, `admin/api/test/goatcounter.test.mjs`, `admin/api/test/fixtures/goatcounter-*.json` (keep `goatcounter-toprefs.json` only if `test/referrers.test.mjs` needs it; otherwise convert that test's rows inline)

**Interfaces:**
- Consumes: `createVisits` from Task 8.
- Produces, on the wire (CONTRACT.md updates in Task 11): `visits` as before; `pages.rows` gain `engagedMedian` and `reached`; `referrers` gains `paths: [{ from, to, visitors }]`; `events` as before; `audience` gains `themes`, `viewports`, `touch`, `timezones`; the hint key `visits` / env `VISITS_DATASET`.

- [ ] **Step 1: Config and server**

`config.mjs:67` becomes:
```js
    visits: { dataset: text(env.VISITS_DATASET, ""), historyDataset: text(env.VISITS_HISTORY_DATASET, ""), historyUntil: text(env.VISITS_HISTORY_UNTIL, "") || null },
```
`server.mjs`: replace the goatcounter import with `import { BigQuery } from "@google-cloud/bigquery"; import { createVisits } from "./collectors/visits.mjs";`; in `createQueries({...})` replace `gc: createGoatCounter(...)` with
```js
    visits: createVisits({ bigquery: config.visits.dataset ? new BigQuery({ projectId: config.projectId }) : null, projectId: config.projectId, dataset: config.visits.dataset, historyDataset: config.visits.historyDataset, historyUntil: config.visits.historyUntil, cache, log }),
```
and in the `unconfigured` list replace the GOATCOUNTER line with `!config.visits.dataset && "VISITS_DATASET"`.

- [ ] **Step 2: `queries.mjs`**

Imports: drop `gcMap`; keep `groupReferrers`, `pathsOf`/`normalizePath`, `assessHealth`, time helpers. Signature: `createQueries({ visits, gsc, youtube, github, hn, psi, uptime, hosting, sitemap, store, config, now = Date.now, log })`.

Replace `requireGc` with:
```js
  const requireVisits = () => (visits.configured ? null : { notConfigured: { visits: "VISITS_DATASET" } });
```
Replace `notFoundOf(hits, h)` with:
```js
  async function notFoundOf(rows, h) {
    const paths = await sitemapPaths(h);
    if (paths === null) return null;
    return rows.filter((r) => r.visitors > 0 && !paths.has(normalizePath(r.path))).map((r) => ({ path: r.path, visitors: r.visitors }));
  }
```
The five queries:
```js
    async visits(days) {
      const range = hourlyRange(days, now());
      const empty = requireVisits();
      if (empty) return { days, from: range.start, to: range.end, current: null, previous: null, ...empty };
      const { current, previous } = await visits.visits(range);
      return { days, from: range.start, to: range.end, current, previous };
    },

    async pages(days) {
      const empty = requireVisits();
      if (empty) return { rows: null, ...empty };
      const range = hourlyRange(days, now());
      const h = hints();
      const [rows, paths] = await Promise.all([visits.pages(range), sitemapPaths(h)]);
      return withHints({ rows: rows.map((r) => ({ ...r, inSitemap: paths === null ? null : paths.has(normalizePath(r.path)) })) }, h);
    },

    async referrers(days) {
      const empty = requireVisits();
      if (empty) return { groups: null, rows: null, campaigns: null, paths: null, ...empty };
      const range = hourlyRange(days, now());
      const r = await visits.referrers(range);
      return { ...groupReferrers(r.referrers.map((x) => ({ name: x.name, count: x.visitors }))), campaigns: r.campaigns, paths: r.paths };
    },

    async events(days) {
      const empty = requireVisits();
      if (empty) return { rows: null, outboundRate: null, ...empty };
      const range = hourlyRange(days, now());
      const e = await visits.events(range);
      const rows = e.rows.map((r) => ({ name: r.name, kind: eventKindOf(r.name), visitors: r.visitors }));
      const outbound = rows.filter((r) => r.kind === "out").reduce((n, r) => n + r.visitors, 0);
      return { rows, outboundRate: e.homeVisitors > 0 ? outbound / e.homeVisitors : null };
    },

    async audience(days) {
      const empty = requireVisits();
      if (empty) return { countries: null, sizes: null, browsers: null, systems: null, languages: null, themes: null, viewports: null, touch: null, timezones: null, ...empty };
      return visits.audience(hourlyRange(days, now()));
    },
```
Add near the top of the file (it was in the GoatCounter module):
```js
const EVENT_KINDS = ["out", "play", "watch", "read", "nav"];
/** The kind of an event name from its prefix: `out-github` is an outbound click, `read-<slug>` a read to the end. */
export function eventKindOf(name) {
  const prefix = String(name).split("-")[0];
  return EVENT_KINDS.includes(prefix) ? prefix : "other";
}
const outboundOf = (rows) => rows.filter((r) => eventKindOf(r.name) === "out").reduce((n, r) => n + r.visitors, 0);
```
`health`: the `hits` part becomes `part(h, "visits", "VISITS_DATASET", visits.configured, () => visits.pages(range))` and `const notFound = hits === null ? null : await notFoundOf(hits, h);` stays (rows now).
`kpis`: the `visits` part becomes
```js
        part(h, "visits", "VISITS_DATASET", visits.configured, async () => {
          const { current, previous } = await visits.visits(range);
          return { value: current.visits, prev: previous.visits };
        }),
        part(h, "outbound", "VISITS_DATASET", visits.configured, async () => {
          const prevRange = { ...range, start: range.prevStart, end: range.prevEnd, prevStart: range.prevStart, prevEnd: range.prevStart };
          const [cur, prev] = await Promise.all([visits.events(range), visits.events(prevRange)]);
          return { value: outboundOf(cur.rows), prev: outboundOf(prev.rows) };
        }),
```
`snapshot`: `total` becomes `part(h, "visits", "VISITS_DATASET", visits.configured, () => visits.visits(range))` and `hits` becomes `part(h, "events", "VISITS_DATASET", visits.configured, () => visits.events(range))`; the doc fields: `visits7: total === null ? null : total.current.visits`, `outbound7: hits === null ? null : outboundOf(hits.rows)`.

- [ ] **Step 3: Tests**

`test/queries.test.mjs`: replace the GoatCounter fake and fixtures with a fake `visits` collector returning the shapes from Task 8's interfaces (`configured: true`; `visits()` → `{ current: { visits: 181, perDay: [...] }, previous: ... }`, `pages()` → rows incl. `/docs/old-slug` and `/wp-login.php` so the 404 logic keeps its cases, `referrers()`, `events()` with `out-linkedin 18`, `out-github 12`, `play-dayhike 9`, `read-stylized-shader-looks 6`, `watch-who-is-standing-in-my-hallway 4`, `signup 1` and `homeVisitors: 120`, `audience()`); keep every existing assertion's meaning (`events` kinds and the outbound rate `30 / 120`, `notFound` from the sitemap, the kpi and snapshot `notConfigured` hint names now `visits`, `events`, `outbound` with env `VISITS_DATASET`). Add a test that `eventKindOf("link-example.com")` is `other` and that `referrers().paths` passes through. `test/app.test.mjs:17,79`: the thrown `UpstreamError` message becomes `"BigQuery audience failed: quota"`. `test/http.test.mjs:41-57`: assert `config.visits.dataset` is `""` when unset and `"csarko_visits"` when `VISITS_DATASET` is set. `test/referrers.test.mjs`: if it reads `goatcounter-toprefs.json`, inline three rows instead and delete the fixture. Delete `test/goatcounter.test.mjs` and the other `goatcounter-*.json` fixtures. `.env.local.example`: replace the GOATCOUNTER lines with `VISITS_DATASET=csarko_visits`, `VISITS_HISTORY_DATASET=csarko_history`, `VISITS_HISTORY_UNTIL=2026-10-16T00:00:00Z`.

Run: `cd admin/api && npm test 2>&1 | grep -E "^# (pass|fail)|^not ok"`
Expected: all pass, no `not ok`. `grep -rn goatcounter admin/api/src admin/api/test` prints nothing.

- [ ] **Step 4: Commit**

```bash
git add -A admin/api/src admin/api/test admin/api/.env.local.example
git commit -m "admin API: the site's queries read BigQuery, GoatCounter leaves

visits, pages, referrers, events and audience come from the visits
collector, as do the KPI, the snapshot and the 404 list; pages carry
engaged time and the share read to the end, referrers the site's own
edges, audience the theme, viewport, touch and timezone."
```
(`git add -A` scoped to those three paths is the one place it is used, for the deletions; confirm `git status` shows nothing else staged.)

---

