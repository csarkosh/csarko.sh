/**
 * Arkos IDE's rows in the same log bucket as the site's visits
 * (`csarko_visits._AllLogs`, `json_payload.app = 'arkos'`): the daily update
 * checks, the opt-in session reports and the crash reports, each read by a
 * saved SQL file `queries/arkos-*.sql` through the visits collector's runner
 * (same table rewriting, same five-minute cache by name and window). Rows
 * come back plain; src/arkos.mjs shapes them.
 */

import { join } from "node:path";
import { createRunner } from "./visits.mjs";

/** Session rows the journey reads at most, newest first (arkos-sessions.sql's LIMIT). */
export const SESSION_CAP = 5000;

export function createArkos({ bigquery, projectId, dataset, cache, ttlMs = 300_000, queriesDir = join(process.cwd(), "queries") }) {
  const run = createRunner({ bigquery, projectId, dataset, historyDataset: "", cache, ttlMs, queriesDir });
  const win = (range) => ({ start: range.start, end: range.end, prev_start: range.prevStart });

  return {
    get configured() {
      return Boolean(bigquery && dataset);
    },
    /** Checks by day, rhythm, version, macOS and processor, both windows: { start, end, prevStart } as instants. */
    installs: (range) => run("arkos-installs", win(range)),
    /** The newest SESSION_CAP session reports in [start, end), newest first. */
    sessions: (range) => run("arkos-sessions", { start: range.start, end: range.end }),
    /** Sessions, first sessions and lost ones by window and version, uncapped. */
    sessionCounts: (range) => run("arkos-session-counts", win(range)),
    /** Crash reports of both windows, newest first. */
    crashes: (range) => run("arkos-crashes", win(range)),
    /** Twelve weeks of counts from `start`, the last 24 hours' crashes from `since`, the versions seen in the last week. */
    kpis: ({ start, end, since }) => run("arkos-kpis", { start, end, since }),
  };
}
