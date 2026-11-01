### Task 8: The admin API's BigQuery collector and the saved SQL

**Files:**
- Create: `admin/api/src/collectors/visits.mjs`, `admin/api/queries/visits.sql`, `admin/api/queries/pages.sql`, `admin/api/queries/referrers.sql`, `admin/api/queries/events.sql`, `admin/api/queries/audience.sql`, `admin/api/queries/history-visits.sql`, `admin/api/queries/history-pages.sql`, `admin/api/queries/history-referrers.sql`, `admin/api/queries/history-events.sql`, `admin/api/test/visits.test.mjs`, `admin/api/test/fixtures/visits-rows.json`
- Modify: `admin/api/package.json` (add `"@google-cloud/bigquery": "9.2.0"`), `admin/api/Dockerfile` (add `COPY queries ./queries` after `COPY src ./src`)

**Interfaces:**
- Produces: `createVisits({ bigquery, projectId, dataset, historyDataset, historyUntil, cache, now, log, queriesDir })` returning `{ configured, visits(range), pages(range), referrers(range), events(range), audience(range) }` where `range` is `hourlyRange`'s object (`start`, `end`, `prevStart`, `prevEnd` hour stamps). Shapes:
  - `visits(range)` → `{ current: { visits, perDay: [{ day, visits }] }, previous: { visits, perDay } }`
  - `pages(range)` → `[{ path, title, visitors, engagedMedian, reached }]` (reached a 0 to 1 share or null)
  - `referrers(range)` → `{ referrers: [{ name, visitors }] (name "" for direct), campaigns: [{ campaign, visitors }], paths: [{ from, to, visitors }] }`
  - `events(range)` → `{ rows: [{ name, visitors }], homeVisitors }` (current window only; callers pass a previous-window range for deltas)
  - `audience(range)` → `{ countries, sizes, browsers, systems, languages, themes, viewports, touch, timezones }`, each `[{ name, visitors }]`
  - History is merged inside `visits`, `pages`, `referrers`, `events` when `range.start < historyUntil`.

- [ ] **Step 1: The SQL files**

Every live file reads `` `csarko-sh.csarko_visits._AllLogs` `` and the collector rewrites project and dataset; every history file reads `` `csarko-sh.csarko_history.goatcounter_history` ``. Parameters are strings; the SQL casts with `TIMESTAMP()`.

`queries/visits.sql`:
```sql
-- Visits a day for the current window [start, end) and the previous one [prev_start, start).
-- A visit is the collector's daily hash; a row without one (no address resolved) counts by its page id.
WITH views AS (
  SELECT
    DATE(timestamp) AS day,
    IF(timestamp >= TIMESTAMP(@start), 'current', 'previous') AS window,
    COALESCE(JSON_VALUE(json_payload.s.visit), JSON_VALUE(json_payload.id)) AS visit
  FROM `csarko-sh.csarko_visits._AllLogs`
  WHERE timestamp >= TIMESTAMP(@prev_start) AND timestamp < TIMESTAMP(@end)
    AND JSON_VALUE(json_payload.n) = 'view'
    AND IFNULL(JSON_VALUE(json_payload.s.bot), 'false') != 'true'
)
SELECT window, day, COUNT(DISTINCT visit) AS visits
FROM views
GROUP BY window, day
ORDER BY day
```

`queries/pages.sql`:
```sql
-- Pages by visitors in [start, end), with the engaged time and the share that reached the end
-- from each page load's last leave.
WITH views AS (
  SELECT
    JSON_VALUE(json_payload.id) AS id,
    JSON_VALUE(json_payload.p) AS path,
    JSON_VALUE(json_payload.t) AS title,
    COALESCE(JSON_VALUE(json_payload.s.visit), JSON_VALUE(json_payload.id)) AS visit
  FROM `csarko-sh.csarko_visits._AllLogs`
  WHERE timestamp >= TIMESTAMP(@start) AND timestamp < TIMESTAMP(@end)
    AND JSON_VALUE(json_payload.n) = 'view'
    AND IFNULL(JSON_VALUE(json_payload.s.bot), 'false') != 'true'
),
leaves AS (
  SELECT
    JSON_VALUE(json_payload.id) AS id,
    ARRAY_AGG(STRUCT(
      SAFE_CAST(JSON_VALUE(json_payload.e) AS INT64) AS e,
      JSON_VALUE(json_payload.re) = 'true' AS re
    ) ORDER BY timestamp DESC LIMIT 1)[OFFSET(0)] AS last
  FROM `csarko-sh.csarko_visits._AllLogs`
  WHERE timestamp >= TIMESTAMP(@start) AND timestamp < TIMESTAMP(@end)
    AND JSON_VALUE(json_payload.n) = 'leave'
  GROUP BY id
)
SELECT
  v.path,
  ANY_VALUE(v.title) AS title,
  COUNT(DISTINCT v.visit) AS visitors,
  APPROX_QUANTILES(l.last.e, 2)[OFFSET(1)] AS engaged_median,
  SAFE_DIVIDE(COUNTIF(l.last.re), COUNTIF(l.id IS NOT NULL)) AS reached
FROM views v
LEFT JOIN leaves l USING (id)
GROUP BY v.path
ORDER BY visitors DESC
LIMIT 200
```

`queries/referrers.sql`:
```sql
-- Where visits came from in [start, end): external hosts and direct, the campaign tags, and the
-- site's own edges (the previous page to this one).
WITH views AS (
  SELECT
    JSON_VALUE(json_payload.p) AS path,
    COALESCE(JSON_VALUE(json_payload.s.visit), JSON_VALUE(json_payload.id)) AS visit,
    JSON_VALUE(json_payload.s.rk) AS rk,
    JSON_VALUE(json_payload.s.rh) AS rh,
    JSON_VALUE(json_payload.s.rp) AS rp,
    COALESCE(JSON_VALUE(json_payload.cr), JSON_VALUE(json_payload.us)) AS campaign
  FROM `csarko-sh.csarko_visits._AllLogs`
  WHERE timestamp >= TIMESTAMP(@start) AND timestamp < TIMESTAMP(@end)
    AND JSON_VALUE(json_payload.n) = 'view'
    AND IFNULL(JSON_VALUE(json_payload.s.bot), 'false') != 'true'
)
SELECT 'referrer' AS kind, IF(rk = 'direct', '', IFNULL(rh, '')) AS name, '' AS target, COUNT(DISTINCT visit) AS visitors
FROM views WHERE rk IN ('direct', 'external') GROUP BY name
UNION ALL
SELECT 'campaign', campaign, '', COUNT(DISTINCT visit) FROM views WHERE campaign IS NOT NULL GROUP BY campaign
UNION ALL
SELECT 'internal', rp, path, COUNT(DISTINCT visit) FROM views WHERE rk = 'internal' AND rp IS NOT NULL GROUP BY rp, path
ORDER BY visitors DESC
```

`queries/events.sql`:
```sql
-- Named clicks, outbound links by host, docs read to the end (from the leave beacon), and the
-- home page's visitors, in [start, end).
WITH base AS (
  SELECT json_payload AS j, COALESCE(JSON_VALUE(json_payload.s.visit), JSON_VALUE(json_payload.id)) AS visit
  FROM `csarko-sh.csarko_visits._AllLogs`
  WHERE timestamp >= TIMESTAMP(@start) AND timestamp < TIMESTAMP(@end)
    AND IFNULL(JSON_VALUE(json_payload.s.bot), 'false') != 'true'
)
SELECT name, COUNT(DISTINCT visit) AS visitors FROM (
  SELECT JSON_VALUE(j.ev) AS name, visit FROM base
  WHERE JSON_VALUE(j.n) = 'click' AND JSON_VALUE(j.ev) IS NOT NULL
  UNION ALL
  SELECT CONCAT('link-', REGEXP_EXTRACT(JSON_VALUE(j.u), r'^https?://([^/]+)')), visit FROM base
  WHERE JSON_VALUE(j.n) = 'click' AND JSON_VALUE(j.ev) IS NULL AND JSON_VALUE(j.u) IS NOT NULL
  UNION ALL
  SELECT CONCAT('read-', REGEXP_EXTRACT(JSON_VALUE(j.p), r'^/research/([^/]+)$')), visit FROM base
  WHERE JSON_VALUE(j.n) = 'leave' AND JSON_VALUE(j.re) = 'true' AND REGEXP_CONTAINS(JSON_VALUE(j.p), r'^/research/[^/]+$')
  UNION ALL
  SELECT '(home)', visit FROM base WHERE JSON_VALUE(j.n) = 'view' AND JSON_VALUE(j.p) = '/'
)
WHERE name IS NOT NULL
GROUP BY name
ORDER BY visitors DESC
```

`queries/audience.sql`:
```sql
-- Who the visitors are, by dimension, in [start, end).
WITH views AS (
  SELECT
    COALESCE(JSON_VALUE(json_payload.s.visit), JSON_VALUE(json_payload.id)) AS visit,
    JSON_VALUE(json_payload.s.cc) AS country,
    JSON_VALUE(json_payload.sw) AS size,
    JSON_VALUE(json_payload.s.bn) AS browser,
    JSON_VALUE(json_payload.s.os) AS system,
    COALESCE(JSON_VALUE(json_payload.lg), JSON_VALUE(json_payload.s.lg)) AS language,
    JSON_VALUE(json_payload.th) AS theme,
    CASE
      WHEN SAFE_CAST(JSON_VALUE(json_payload.vw) AS INT64) < 400 THEN 'under 400'
      WHEN SAFE_CAST(JSON_VALUE(json_payload.vw) AS INT64) < 800 THEN '400 to 799'
      WHEN SAFE_CAST(JSON_VALUE(json_payload.vw) AS INT64) < 1200 THEN '800 to 1199'
      WHEN SAFE_CAST(JSON_VALUE(json_payload.vw) AS INT64) IS NOT NULL THEN '1200 and up'
    END AS viewport,
    IF(JSON_VALUE(json_payload.tp) = 'true', 'touch', 'pointer') AS touch,
    JSON_VALUE(json_payload.tz) AS timezone
  FROM `csarko-sh.csarko_visits._AllLogs`
  WHERE timestamp >= TIMESTAMP(@start) AND timestamp < TIMESTAMP(@end)
    AND JSON_VALUE(json_payload.n) = 'view'
    AND IFNULL(JSON_VALUE(json_payload.s.bot), 'false') != 'true'
)
SELECT dim, name, COUNT(DISTINCT visit) AS visitors FROM (
  SELECT 'countries' AS dim, country AS name, visit FROM views
  UNION ALL SELECT 'sizes', size, visit FROM views
  UNION ALL SELECT 'browsers', browser, visit FROM views
  UNION ALL SELECT 'systems', system, visit FROM views
  UNION ALL SELECT 'languages', language, visit FROM views
  UNION ALL SELECT 'themes', theme, visit FROM views
  UNION ALL SELECT 'viewports', viewport, visit FROM views
  UNION ALL SELECT 'touch', touch, visit FROM views
  UNION ALL SELECT 'timezones', timezone, visit FROM views
)
WHERE name IS NOT NULL AND name != ''
GROUP BY dim, name
ORDER BY dim, visitors DESC
```

`queries/history-visits.sql`:
```sql
-- GoatCounter's visits a day in [start, end), for the window's part before the cutover.
SELECT IF(hour >= TIMESTAMP(@start), 'current', 'previous') AS window, DATE(hour) AS day, SUM(visits) AS visits
FROM `csarko-sh.csarko_history.goatcounter_history`
WHERE hour >= TIMESTAMP(@prev_start) AND hour < TIMESTAMP(@end) AND NOT event
GROUP BY window, day
ORDER BY day
```
`queries/history-pages.sql`:
```sql
SELECT path, ANY_VALUE(title) AS title, SUM(visits) AS visitors
FROM `csarko-sh.csarko_history.goatcounter_history`
WHERE hour >= TIMESTAMP(@start) AND hour < TIMESTAMP(@end) AND NOT event
GROUP BY path ORDER BY visitors DESC LIMIT 200
```
`queries/history-referrers.sql`:
```sql
SELECT 'referrer' AS kind, IFNULL(ref, '') AS name, '' AS target, SUM(visits) AS visitors
FROM `csarko-sh.csarko_history.goatcounter_history`
WHERE hour >= TIMESTAMP(@start) AND hour < TIMESTAMP(@end) AND NOT event
GROUP BY name ORDER BY visitors DESC
```
`queries/history-events.sql`:
```sql
SELECT REGEXP_REPLACE(path, r'^/', '') AS name, SUM(visits) AS visitors
FROM `csarko-sh.csarko_history.goatcounter_history`
WHERE hour >= TIMESTAMP(@start) AND hour < TIMESTAMP(@end) AND event
GROUP BY name ORDER BY visitors DESC
```

- [ ] **Step 2: The collector**

`admin/api/src/collectors/visits.mjs`:
```js
/**
 * The site's own analytics: lib-visits rows in BigQuery through Log Analytics
 * (`csarko_visits._AllLogs`), and GoatCounter's history in `csarko_history`
 * for windows that reach before the cutover. Each query is a saved SQL file
 * under `queries/`, with `@start`, `@end`, `@prev_start`, `@prev_end` as
 * string parameters the SQL casts to TIMESTAMP; one job a query, cached five
 * minutes by name and window. History rows are merged in code (summed by
 * day, path or name), since the two datasets are in different locations.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { UpstreamError } from "../http.mjs";

const LIVE_TABLE = /`csarko-sh\.csarko_visits\._AllLogs`/g;
const HISTORY_TABLE = /`csarko-sh\.csarko_history\.goatcounter_history`/g;

export function createVisits({ bigquery, projectId, dataset, historyDataset, historyUntil, cache, now = Date.now, log = console, ttlMs = 300_000, queriesDir = join(process.cwd(), "queries") }) {
  const sqlOf = (name) => {
    const sql = readFileSync(join(queriesDir, `${name}.sql`), "utf8");
    return sql.replace(LIVE_TABLE, `\`${projectId}.${dataset}._AllLogs\``).replace(HISTORY_TABLE, `\`${projectId}.${historyDataset}.goatcounter_history\``);
  };

  async function run(name, params) {
    const key = `visits:${name}:${JSON.stringify(params)}`;
    return cache.get(key, ttlMs, async () => {
      try {
        const [rows] = await bigquery.query({ query: sqlOf(name), params, useLegacySql: false });
        return rows.map(plainRow);
      } catch (error) {
        throw new UpstreamError(`BigQuery ${name} failed: ${error?.message ?? error}`, { cause: error });
      }
    });
  }

  const wantsHistory = (range) => Boolean(historyDataset && historyUntil && range.prevStart < historyUntil);
  const win = (range) => ({ start: range.start, end: range.end, prev_start: range.prevStart, prev_end: range.prevEnd });

  return {
    get configured() {
      return Boolean(bigquery && dataset);
    },

    async visits(range) {
      const live = await run("visits", win(range));
      const rows = wantsHistory(range) ? [...live, ...(await run("history-visits", win(range)))] : live;
      const shape = (window) => {
        const byDay = new Map();
        for (const r of rows) if (r.window === window) byDay.set(r.day, (byDay.get(r.day) ?? 0) + Number(r.visits));
        const perDay = [...byDay.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([day, visits]) => ({ day, visits, pageviews: null }));
        return { visits: perDay.reduce((n, d) => n + d.visits, 0), pageviews: null, perDay };
      };
      return { current: shape("current"), previous: shape("previous") };
    },

    async pages(range) {
      const live = await run("pages", { start: range.start, end: range.end });
      const rows = live.map((r) => ({ path: r.path, title: r.title ?? "", visitors: Number(r.visitors), pageviews: null, engagedMedian: r.engaged_median === null || r.engaged_median === undefined ? null : Number(r.engaged_median), reached: r.reached === null || r.reached === undefined ? null : Number(r.reached) }));
      if (!wantsHistory(range)) return rows;
      const history = await run("history-pages", { start: range.start, end: range.end });
      return sumBy([...rows, ...history.map((r) => ({ path: r.path, title: r.title ?? "", visitors: Number(r.visitors), pageviews: null, engagedMedian: null, reached: null }))], "path", "visitors");
    },

    async referrers(range) {
      const live = await run("referrers", { start: range.start, end: range.end });
      const all = wantsHistory(range) ? [...live, ...(await run("history-referrers", { start: range.start, end: range.end }))] : live;
      const of = (kind) => all.filter((r) => r.kind === kind);
      return {
        referrers: sumBy(of("referrer").map((r) => ({ name: r.name ?? "", visitors: Number(r.visitors) })), "name", "visitors"),
        campaigns: of("campaign").map((r) => ({ campaign: r.name, visitors: Number(r.visitors) })),
        paths: of("internal").map((r) => ({ from: r.name, to: r.target, visitors: Number(r.visitors) })),
      };
    },

    async events(range) {
      const live = await run("events", { start: range.start, end: range.end });
      const all = wantsHistory(range) ? [...live, ...(await run("history-events", { start: range.start, end: range.end }))] : live;
      const rows = sumBy(all.map((r) => ({ name: r.name, visitors: Number(r.visitors) })), "name", "visitors");
      const home = rows.find((r) => r.name === "(home)");
      return { rows: rows.filter((r) => r.name !== "(home)"), homeVisitors: home ? home.visitors : 0 };
    },

    async audience(range) {
      const rows = await run("audience", { start: range.start, end: range.end });
      const out = { countries: [], sizes: [], browsers: [], systems: [], languages: [], themes: [], viewports: [], touch: [], timezones: [] };
      for (const r of rows) if (out[r.dim]) out[r.dim].push({ name: String(r.name), visitors: Number(r.visitors) });
      return out;
    },
  };
}

/** Rows with the same `key` folded into one, their `field` summed, highest first. */
export function sumBy(rows, key, field) {
  const map = new Map();
  for (const r of rows) {
    const k = r[key];
    const seen = map.get(k);
    if (seen) seen[field] += r[field];
    else map.set(k, { ...r });
  }
  return [...map.values()].sort((a, b) => b[field] - a[field]);
}

/** BigQuery wraps dates, timestamps and big numbers in objects with `value`; the API wants plain values. */
export function plainRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) out[k] = v !== null && typeof v === "object" && "value" in v ? v.value : v;
  return out;
}
```

- [ ] **Step 3: The test, with a fake BigQuery**

`admin/api/test/fixtures/visits-rows.json`:
```json
{
  "visits": [
    { "window": "previous", "day": { "value": "2026-10-10" }, "visits": 3 },
    { "window": "current", "day": { "value": "2026-10-14" }, "visits": 5 },
    { "window": "current", "day": { "value": "2026-10-15" }, "visits": 2 }
  ],
  "history-visits": [
    { "window": "previous", "day": { "value": "2026-10-09" }, "visits": 4 },
    { "window": "current", "day": { "value": "2026-10-14" }, "visits": 1 }
  ],
  "pages": [
    { "path": "/", "title": "Home", "visitors": 6, "engaged_median": 12, "reached": null },
    { "path": "/research/a", "title": "A", "visitors": 2, "engaged_median": 90, "reached": 0.5 }
  ],
  "history-pages": [{ "path": "/", "title": "Home", "visitors": 10 }],
  "referrers": [
    { "kind": "referrer", "name": "", "target": "", "visitors": 4 },
    { "kind": "referrer", "name": "google.com", "target": "", "visitors": 3 },
    { "kind": "campaign", "name": "substack", "target": "", "visitors": 1 },
    { "kind": "internal", "name": "/", "target": "/games", "visitors": 2 }
  ],
  "history-referrers": [{ "kind": "referrer", "name": "google.com", "target": "", "visitors": 7 }],
  "events": [
    { "name": "out-github", "visitors": 2 },
    { "name": "read-a", "visitors": 1 },
    { "name": "(home)", "visitors": 6 }
  ],
  "history-events": [{ "name": "out-github", "visitors": 3 }],
  "audience": [
    { "dim": "countries", "name": "US", "visitors": 5 },
    { "dim": "themes", "name": "dark", "visitors": 4 },
    { "dim": "touch", "name": "pointer", "visitors": 6 }
  ]
}
```

`admin/api/test/visits.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createCache } from "../src/cache.mjs";
import { createVisits, sumBy, plainRow } from "../src/collectors/visits.mjs";
import { UpstreamError } from "../src/http.mjs";

const rows = JSON.parse(readFileSync(new URL("./fixtures/visits-rows.json", import.meta.url), "utf8"));
const queriesDir = new URL("../queries/", import.meta.url).pathname;

function fake(calls = []) {
  return {
    async query({ query, params }) {
      const name = Object.keys(rows).find((n) => query.includes(n === "visits" || n === "pages" || n === "referrers" || n === "events" || n === "audience" ? "_AllLogs" : "goatcounter_history") && query.includes(`-- ${n}`) || false);
      throw new Error("use the name header");
    },
  };
}

// Each saved SQL file starts with a comment; the fake matches on the rewritten table and the
// file's first line, so a test knows which file ran.
function fakeBigQuery(calls = []) {
  const first = (name) => readFileSync(`${queriesDir}${name}.sql`, "utf8").split("\n")[0];
  return {
    async query({ query, params }) {
      const name = Object.keys(rows).find((n) => query.startsWith(first(n)));
      if (!name) throw new Error(`no fixture for query starting ${query.slice(0, 60)}`);
      assert.ok(query.includes("`p.d._AllLogs`") || query.includes("`p.h.goatcounter_history`"), "tables rewritten");
      calls.push({ name, params });
      return [rows[name]];
    },
  };
}

const range = { start: "2026-10-13T00:00:00Z", end: "2026-10-16T00:00:00Z", prevStart: "2026-10-10T00:00:00Z", prevEnd: "2026-10-13T00:00:00Z" };
const make = (opts = {}) => {
  const calls = [];
  const v = createVisits({ bigquery: fakeBigQuery(calls), projectId: "p", dataset: "d", historyDataset: "h", historyUntil: "2026-10-14T00:00:00Z", cache: createCache(), queriesDir, ...opts });
  return { v, calls };
};

test("visits sums live and history rows by day and window, and a row without a visit still counts", async () => {
  const { v, calls } = make();
  const r = await v.visits(range);
  assert.deepEqual(r.current.perDay, [{ day: "2026-10-14", visits: 6, pageviews: null }, { day: "2026-10-15", visits: 2, pageviews: null }]);
  assert.equal(r.current.visits, 8);
  assert.deepEqual(r.previous.perDay.map((d) => d.day), ["2026-10-09", "2026-10-10"]);
  assert.deepEqual(calls.map((c) => c.name), ["visits", "history-visits"]);
  assert.deepEqual(calls[0].params, { start: range.start, end: range.end, prev_start: range.prevStart, prev_end: range.prevEnd });
});

test("history is not queried when the window starts after the cutover", async () => {
  const { v, calls } = make({ historyUntil: "2026-10-01T00:00:00Z" });
  await v.visits(range);
  assert.deepEqual(calls.map((c) => c.name), ["visits"]);
});

test("pages merge history by path and keep engaged time and reached share from live rows", async () => {
  const { v } = make();
  const r = await v.pages(range);
  assert.deepEqual(r[0], { path: "/", title: "Home", visitors: 16, pageviews: null, engagedMedian: 12, reached: null });
  assert.equal(r[1].reached, 0.5);
});

test("referrers split into referrers (direct as empty name), campaigns and internal paths", async () => {
  const { v } = make();
  const r = await v.referrers(range);
  assert.deepEqual(r.referrers, [{ name: "google.com", visitors: 10 }, { name: "", visitors: 4 }]);
  assert.deepEqual(r.campaigns, [{ campaign: "substack", visitors: 1 }]);
  assert.deepEqual(r.paths, [{ from: "/", to: "/games", visitors: 2 }]);
});

test("events fold history and lift the home-page visitors out of the rows", async () => {
  const { v } = make();
  const r = await v.events(range);
  assert.deepEqual(r.rows, [{ name: "out-github", visitors: 5 }, { name: "read-a", visitors: 1 }]);
  assert.equal(r.homeVisitors, 6);
});

test("audience groups by dimension", async () => {
  const { v } = make();
  const r = await v.audience(range);
  assert.deepEqual(r.themes, [{ name: "dark", visitors: 4 }]);
  assert.deepEqual(r.sizes, []);
});

test("a BigQuery failure is an upstream error, and the same window is cached", async () => {
  const { v, calls } = make();
  await v.audience(range);
  await v.audience(range);
  assert.equal(calls.filter((c) => c.name === "audience").length, 1);
  const broken = createVisits({ bigquery: { async query() { throw new Error("quota"); } }, projectId: "p", dataset: "d", historyDataset: "h", historyUntil: null, cache: createCache(), queriesDir });
  await assert.rejects(broken.audience(range), (e) => e instanceof UpstreamError && /BigQuery audience failed: quota/.test(e.message));
});

test("sumBy and plainRow", () => {
  assert.deepEqual(sumBy([{ k: "a", n: 1 }, { k: "b", n: 5 }, { k: "a", n: 2 }], "k", "n"), [{ k: "b", n: 5 }, { k: "a", n: 3 }]);
  assert.deepEqual(plainRow({ day: { value: "2026-10-14" }, n: 2, s: null }), { day: "2026-10-14", n: 2, s: null });
});
```
Delete the first `fake()` helper in that file (it is a leftover sketch; only `fakeBigQuery` is used). For the first-line match to work, give every SQL file a distinct first comment line (the ones above are distinct; `history-pages.sql`, `history-referrers.sql` and `history-events.sql` need one added: `-- GoatCounter's pages ...`, `-- GoatCounter's referrers ...`, `-- GoatCounter's events ...`).

- [ ] **Step 4: Install, run, commit**

Run: `cd admin/api && npm install @google-cloud/bigquery@9.2.0 --save-exact 2>&1 | tail -1 && node --test test/visits.test.mjs 2>&1 | grep -E "^# (pass|fail)"`
Expected: `# pass 8`.

Add `COPY queries ./queries` to the Dockerfile after `COPY src ./src`.

```bash
git add admin/api/package.json admin/api/package-lock.json admin/api/Dockerfile admin/api/src/collectors/visits.mjs admin/api/queries admin/api/test/visits.test.mjs admin/api/test/fixtures/visits-rows.json
git commit -m "admin API: a BigQuery collector for the site's visits

Saved SQL over csarko_visits._AllLogs, one job a query, cached five
minutes by window; GoatCounter's history from csarko_history merged by
day, path or name when the window reaches before the cutover."
```

---

