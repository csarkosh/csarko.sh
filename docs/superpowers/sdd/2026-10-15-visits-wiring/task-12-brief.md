### Task 12: The backfill

**Files:**
- Create: `visits/backfill.mjs`, `visits/test/backfill.test.mjs`

**Interfaces:**
- Produces: `rowsOf(exportText) → [{ hour, path, title, event, ref, visits }]` for either export format; a run that loads them into `csarko_history.goatcounter_history`.

- [ ] **Step 1: The test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { rowsOf } from "../backfill.mjs";

test("the JSON export's hourly hit stats become rows, joined to paths and refs", () => {
  const lines = [
    JSON.stringify({ export_version: "1.0" }),
    JSON.stringify({ path: { id: 1, path: "/", title: "Home" } }),
    JSON.stringify({ path: { id: 2, path: "out-github", title: "", event: true } }),
    JSON.stringify({ ref: { id: 7, ref: "google.com" } }),
    JSON.stringify({ hit_stat: { hour: "2026-10-01T10:00:00Z", path_id: 1, ref_id: 7, count: 3 } }),
    JSON.stringify({ hit_stat: { hour: "2026-10-01T10:00:00Z", path_id: 1, ref_id: 0, count: 2 } }),
    JSON.stringify({ hit_stat: { hour: "2026-10-01T11:00:00Z", path_id: 2, ref_id: 0, count: 1 } }),
  ].join("\n");
  assert.deepEqual(rowsOf(lines), [
    { hour: "2026-10-01T10:00:00Z", path: "/", title: "Home", event: false, ref: "google.com", visits: 3 },
    { hour: "2026-10-01T10:00:00Z", path: "/", title: "Home", event: false, ref: "", visits: 2 },
    { hour: "2026-10-01T11:00:00Z", path: "out-github", title: "", event: true, ref: "", visits: 1 },
  ]);
});

test("the per-hit CSV export is reduced to hourly counts, bots dropped", () => {
  const csv = [
    "2,Path,Title,Event,UserAgent,Browser,System,Session,Bot,Referrer,Referrer scheme,Screen size,Location,FirstVisit,Date",
    '"/","Home","false","","Firefox 128","macOS","s1","0","https://google.com/","h","1920","US","1","2026-10-01 10:05:00"',
    '"/","Home","false","","Firefox 128","macOS","s2","0","https://google.com/","h","1920","US","1","2026-10-01 10:50:00"',
    '"/","Home","false","","bot","","s3","150","","","0","","1","2026-10-01 10:51:00"',
    '"out-github","","true","","Firefox 128","macOS","s1","0","","","1920","US","0","2026-10-01 11:00:00"',
  ].join("\n");
  assert.deepEqual(rowsOf(csv), [
    { hour: "2026-10-01T10:00:00Z", path: "/", title: "Home", event: false, ref: "google.com", visits: 2 },
    { hour: "2026-10-01T11:00:00Z", path: "out-github", title: "", event: true, ref: "", visits: 1 },
  ]);
});
```

- [ ] **Step 2: The script**

```js
#!/usr/bin/env node
// visits/backfill.mjs: GoatCounter's export into csarko_history.goatcounter_history, once.
//
//   node visits/backfill.mjs export.json.gz        # or export.csv.gz, or the uncompressed file
//   node visits/backfill.mjs export.json.gz --load # also runs bq load
//
// Either export format reduces to hourly counts per path and referrer, which is what the
// dashboard's trends need. Audience history is not carried over.

import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";

const PROJECT = "csarko-sh";
const TABLE = "csarko_history.goatcounter_history";

const hourOf = (stamp) => {
  const d = new Date(stamp.includes("T") ? stamp : `${stamp.replace(" ", "T")}Z`);
  d.setUTCMinutes(0, 0, 0);
  return d.toISOString().replace(".000Z", "Z");
};
const hostOf = (ref) => {
  const m = /^[a-z][a-z0-9+.-]*:\/\/([^/?#@]+@)?([^/?#:]+)/i.exec(ref);
  return (m ? m[2] : ref).replace(/^www\./, "").toLowerCase();
};

/** `[{ hour, path, title, event, ref, visits }]` from the JSON-lines or the CSV export. */
export function rowsOf(text) {
  const t = text.trimStart();
  return t.startsWith("{") ? fromJson(t) : fromCsv(t);
}

function fromJson(text) {
  const paths = new Map();
  const refs = new Map([[0, ""]]);
  const sums = new Map();
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const o = JSON.parse(line);
    if (o.path) paths.set(o.path.id, o.path);
    else if (o.ref) refs.set(o.ref.id, hostOf(o.ref.ref ?? ""));
    else if (o.hit_stat) {
      const h = o.hit_stat;
      const key = `${hourOf(h.hour)}\t${h.path_id}\t${h.ref_id ?? 0}`;
      sums.set(key, (sums.get(key) ?? 0) + Number(h.count));
    }
  }
  return [...sums.entries()].map(([key, visits]) => {
    const [hour, pathId, refId] = key.split("\t");
    const p = paths.get(Number(pathId)) ?? { path: `#${pathId}`, title: "" };
    return { hour, path: p.path, title: p.title ?? "", event: Boolean(p.event), ref: refs.get(Number(refId)) ?? "", visits };
  });
}

function fromCsv(text) {
  const [header, ...lines] = text.split("\n").filter((l) => l.trim());
  const cols = parseCsvLine(header);
  const idx = (name) => cols.indexOf(name);
  const sums = new Map();
  const meta = new Map();
  for (const line of lines) {
    const f = parseCsvLine(line);
    if (Number(f[idx("Bot")] ?? 0) > 0) continue;
    const hour = hourOf(f[idx("Date")]);
    const path = f[idx("Path")];
    const ref = hostOf(f[idx("Referrer")] ?? "");
    const key = `${hour}\t${path}\t${ref}`;
    sums.set(key, (sums.get(key) ?? 0) + 1);
    meta.set(path, { title: f[idx("Title")] ?? "", event: f[idx("Event")] === "true" });
  }
  return [...sums.entries()].map(([key, visits]) => {
    const [hour, path, ref] = key.split("\t");
    const m = meta.get(path);
    return { hour, path, title: m.title, event: m.event, ref, visits };
  });
}

function parseCsvLine(line) {
  const out = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const [file, flag] = process.argv.slice(2);
  if (!file) { console.error("usage: node visits/backfill.mjs <export file> [--load]"); process.exit(2); }
  let bytes = readFileSync(file);
  if (file.endsWith(".gz")) bytes = gunzipSync(bytes);
  const rows = rowsOf(bytes.toString("utf8"));
  const out = "/tmp/goatcounter-history.jsonl";
  writeFileSync(out, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  console.log(`${rows.length} rows, ${rows.reduce((n, r) => n + r.visits, 0)} visits, ${new Set(rows.map((r) => r.hour.slice(0, 10))).size} days -> ${out}`);
  if (flag === "--load") {
    execFileSync("bq", ["load", "--project_id", PROJECT, "--source_format=NEWLINE_DELIMITED_JSON", "--replace", TABLE, out], { stdio: "inherit" });
    console.log(`loaded into ${PROJECT}.${TABLE}`);
  }
}
```

Run: `node --test visits/test/ 2>&1 | grep -E "^# (pass|fail)"`
Expected: `# pass 2`.

- [ ] **Step 3: Export, inspect, load**

Through the API with the token in Secret Manager (GoatCounter's site may still be unreliable; retry until the export finishes):
```bash
TOKEN="$(gcloud secrets versions access latest --secret goatcounter-token --project csarko-sh)"
API=https://csarko.goatcounter.com/api/v0
id=$(curl -fsS -X POST "$API/export" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')
until curl -fsS "$API/export/$id" -H "Authorization: Bearer $TOKEN" | grep -q '"finished_at":"20'; do sleep 5; done
curl -fsS "$API/export/$id/download" -H "Authorization: Bearer $TOKEN" -o /tmp/goatcounter-export.gz
file /tmp/goatcounter-export.gz; gunzip -c /tmp/goatcounter-export.gz | head -c 400; echo
node visits/backfill.mjs /tmp/goatcounter-export.gz
```
Read the summary (rows, visits, days) against the GoatCounter dashboard's totals before loading. Then: `node visits/backfill.mjs /tmp/goatcounter-export.gz --load` and verify: `bq query --project_id=csarko-sh --use_legacy_sql=false 'SELECT DATE(hour) d, SUM(visits) v FROM csarko_history.goatcounter_history WHERE NOT event GROUP BY d ORDER BY d DESC LIMIT 5'`.
If the export has a shape neither parser expects (a field name differs), adapt `fromJson`/`fromCsv` to the real file and add the real first lines to the test; never guess.

- [ ] **Step 4: Commit**

```bash
git add visits/backfill.mjs visits/test/backfill.test.mjs
git commit -m "visits: GoatCounter's history, backfilled once

Either export format reduces to hourly counts per path and referrer,
loaded into csarko_history.goatcounter_history."
```

---

