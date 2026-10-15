#!/usr/bin/env node
// visits/goatcounter-api.mjs: GoatCounter's history from its stats API, as api_row lines for
// visits/backfill.mjs. Written at the cutover, when the CSV export came back empty twice
// (GoatCounter kept no per-hit rows for the site, only its hourly stats).
//
//   node visits/goatcounter-api.mjs <start> <end> <out.jsonl>
//   node visits/goatcounter-api.mjs 2026-09-10T00:00:00Z 2026-10-15T14:59:59Z history.jsonl
//
// stats/hits gives each path's visits per hour, in the account's timezone; those hours become
// UTC. stats/hits/<path id> asked for one hour gives that hour's referrers, and what they leave
// of the hour's count had none (ref ""). Events carry no referrer. The token comes from Secret
// Manager and is never printed.

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const API = "https://csarko.goatcounter.com/api/v0";

/** The UTC instant of a wall-clock hour in `zone` (exact for every hour that exists there). */
export function utcOfLocalHour(day, hour, zone) {
  const [y, m, d] = day.split("-").map(Number);
  const want = Date.UTC(y, m - 1, d, hour);
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit" });
  const wall = (t) => {
    const p = Object.fromEntries(fmt.formatToParts(t).map((x) => [x.type, x.value]));
    return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour));
  };
  let t = want;
  for (let i = 0; i < 3; i++) t += want - wall(t);
  return new Date(t).toISOString().replace(".000Z", "Z");
}

async function main([start, end, out]) {
  if (!out) { console.error("usage: node visits/goatcounter-api.mjs <start> <end> <out.jsonl>"); process.exit(2); }
  const token = execFileSync("gcloud", ["secrets", "versions", "access", "latest", "--secret", "goatcounter-token", "--project", "csarko-sh"], { encoding: "utf8" }).trim();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let calls = 0;
  async function get(path) {
    for (let attempt = 1; ; attempt++) {
      await sleep(250);
      let res;
      try {
        res = await fetch(API + path, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) });
      } catch (error) {
        if (attempt >= 8) throw error;
        console.error(`transport error (${error.message}); retry ${attempt}`);
        await sleep(5_000);
        continue;
      }
      calls++;
      const body = await res.json().catch(() => ({}));
      if (res.status === 429) {
        const wait = /in ([\d.]+)s/.exec(body.error ?? "")?.[1];
        console.error(`rate limited; waiting ${wait ?? 10}s`);
        await sleep((Number(wait ?? 10) + 1) * 1000);
        continue;
      }
      if (!res.ok) throw new Error(`${path}: ${res.status} ${JSON.stringify(body)}`);
      return body;
    }
  }

  const me = await get("/me");
  const zone = String(me.user?.settings?.timezone ?? "UTC").replace(/^[^.]*\./, "");
  const range = `start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;

  const hits = [];
  for (let exclude = []; ; ) {
    const page = await get(`/stats/hits?${range}&limit=100${exclude.length ? `&exclude_paths=${exclude.join(",")}` : ""}`);
    hits.push(...page.hits);
    exclude = hits.map((h) => h.path_id);
    if (!page.more) break;
  }

  const lines = [];
  let pages = 0, events = 0, referred = 0;
  for (const h of hits) {
    for (const s of h.stats ?? []) {
      for (const [hour, count] of (s.hourly ?? []).entries()) {
        if (!count) continue;
        const utc = utcOfLocalHour(s.day, hour, zone);
        const row = { hour: utc, path: h.path, title: h.title ?? "", event: Boolean(h.event) };
        if (h.event) {
          lines.push({ api_row: { ...row, ref: "", ref_scheme: "", visits: count } });
          events += count;
          continue;
        }
        const until = new Date(Date.parse(utc) + 3_599_000).toISOString().replace(".000Z", "Z");
        const { refs = [], more } = await get(`/stats/hits/${h.path_id}?start=${utc}&end=${until}&limit=100`);
        if (more) throw new Error(`${h.path} at ${utc}: more than 100 referrers in an hour`);
        const named = refs.reduce((n, r) => n + Number(r.count), 0);
        if (named > count) throw new Error(`${h.path} at ${utc}: referrers count ${named}, the hour ${count}`);
        for (const r of refs) lines.push({ api_row: { ...row, ref: r.name ?? "", ref_scheme: r.ref_scheme ?? "", visits: Number(r.count) } });
        if (count > named) lines.push({ api_row: { ...row, ref: "", ref_scheme: "", visits: count - named } });
        pages += count;
        referred += named;
      }
    }
  }

  const total = await get(`/stats/total?${range}`);
  writeFileSync(out, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  console.log(`timezone ${zone}; ${hits.length} paths; ${lines.length} lines; page visits ${pages} (${referred} with a referrer), event visits ${events}; ${calls} API calls -> ${out}`);
  console.log(`stats/total for the same range: total ${total.total}, total_events ${total.total_events}`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main(process.argv.slice(2));
