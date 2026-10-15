#!/usr/bin/env node
// visits/backfill.mjs: GoatCounter's export into csarko_history.goatcounter_history, once.
//
//   node visits/backfill.mjs export.json.gz        # or export.csv.gz, or the uncompressed file
//   node visits/backfill.mjs export.json.gz --load # also runs bq load (--replace: wipes the table)
//
// Either export format reduces to hourly counts per path and referrer, which is what the
// dashboard's trends need. Audience history is not carried over.

import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const PROJECT = "csarko-sh";
const TABLE = "csarko_history.goatcounter_history";

export const hourOf = (stamp) => {
  const d = new Date(stamp.includes("T") ? stamp : `${stamp.replace(" ", "T")}Z`);
  d.setUTCMinutes(0, 0, 0);
  return d.toISOString().replace(".000Z", "Z");
};
export const hostOf = (ref) => {
  let h = ref.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  h = h.split(/[/?#]/)[0].replace(/^[^@]*@/, "").replace(/:\d*$/, "");
  return h.replace(/^www\./i, "").toLowerCase();
};

/** `{ rows, skipped }`: rows are `[{ hour, path, title, event, ref, visits }]` from the JSON-lines or CSV export. */
export function reduceExport(text) {
  const t = text.trimStart();
  return t.startsWith("{") ? fromJson(t) : { rows: fromCsv(t), skipped: 0 };
}
export const rowsOf = (text) => reduceExport(text).rows;

function fromJson(text) {
  const paths = new Map();
  const refs = new Map([[0, ""]]);
  const stats = [];
  let skipped = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const o = JSON.parse(line);
    if (o.path) paths.set(o.path.id, o.path);
    else if (o.ref) refs.set(o.ref.id, hostOf(o.ref.ref ?? ""));
    else if (o.hit_stat) stats.push(o.hit_stat);
    else skipped++;
  }
  // Summed after the whole file is read, by host, so two ref ids with one host give one row.
  const sums = new Map();
  for (const h of stats) {
    const key = `${hourOf(h.hour)}\t${h.path_id}\t${refs.get(Number(h.ref_id ?? 0)) ?? ""}`;
    sums.set(key, (sums.get(key) ?? 0) + Number(h.count));
  }
  const rows = [...sums.entries()].map(([key, visits]) => {
    const [hour, pathId, ref] = key.split("\t");
    const p = paths.get(Number(pathId)) ?? { path: `#${pathId}`, title: "" };
    return { hour, path: p.path, title: p.title ?? "", event: Boolean(p.event), ref, visits };
  });
  return { rows, skipped };
}

function fromCsv(text) {
  const [header, ...lines] = text.split(/\r?\n/).filter((l) => l.trim());
  const cols = parseCsvLine(header);
  // The header opens with the export's version number, glued to the first name ("2Path")
  // or alone ("2"); no data row repeats it.
  cols[0] = cols[0].replace(/^\d+/, "");
  if (cols[0] === "") cols.shift();
  for (const name of ["Path", "Title", "Event", "Bot", "Referrer", "Date"]) {
    if (!cols.includes(name)) throw new Error(`CSV export lacks the column ${name}; header was: ${header}`);
  }
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

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const [file, flag] = process.argv.slice(2);
  if (!file) { console.error("usage: node visits/backfill.mjs <export file> [--load]"); process.exit(2); }
  let bytes = readFileSync(file);
  if (file.endsWith(".gz")) bytes = gunzipSync(bytes);
  const { rows, skipped } = reduceExport(bytes.toString("utf8"));
  const out = "/tmp/goatcounter-history.jsonl";
  writeFileSync(out, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  const visits = rows.reduce((n, r) => n + r.visits, 0);
  const days = new Set(rows.map((r) => r.hour.slice(0, 10))).size;
  console.log(`${rows.length} rows, ${visits} visits, ${days} days, ${skipped} lines skipped -> ${out}`);
  if (flag === "--load") {
    console.log(`loading ${rows.length} rows (${visits} visits) with --replace: the table's current contents are replaced`);
    execFileSync("bq", ["load", "--project_id", PROJECT, "--source_format=NEWLINE_DELIMITED_JSON", "--replace", TABLE, out], { stdio: "inherit" });
    console.log(`loaded into ${PROJECT}.${TABLE}`);
  }
}
