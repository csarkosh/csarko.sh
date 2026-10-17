/**
 * Arkos IDE's routes under `/arkos/admin/*`: the index card and the four
 * queries (`admin/CONTRACT.md`, the Arkos section), each asking the arkos
 * collector and shaping its rows with src/arkos.mjs. Tested with a fake
 * collector, like queries.mjs.
 *
 * Two kinds of range. The Macs (installs, and every KPI) are counted from
 * `rd`, which only works over whole UTC days, so those windows are whole
 * days ending today (`days=1` is today so far, against yesterday). The
 * session and crash reports have no such rule, so they take the last `days`
 * times 24 hours ending at the current hour, as the csarko.sh routes do.
 *
 * Each query also takes `who` (WHO): Cyrus dogfoods Arkos, so his own Macs
 * are kept apart from everyone else's. `users` is the default; the index
 * card counts users only.
 */

import { kpisOf, installsOf, journeyOf, sessionsListOf, crashesOf, TREND_WEEKS } from "./arkos.mjs";
import { SESSION_CAP } from "./collectors/arkos.mjs";
import { addDays, isoDate, hourlyRange, dailyRange } from "./time.mjs";

export const ARKOS_QUERY_NAMES = ["installs", "journey", "sessions", "crashes"];
export const ARKOS_APP = "ide-arkos";
/** Whose rows: everyone but Cyrus, his own Macs, or both. */
export const WHO = ["users", "me", "all"];

/** `who` from the query string: absent is users, anything not in WHO is null. */
export function parseWho(value) {
  if (value === null || value === undefined || value === "") return "users";
  return WHO.includes(value) ? value : null;
}

export function isArkosQueryName(name) {
  return ARKOS_QUERY_NAMES.includes(name);
}

const midnight = (date) => `${date}T00:00:00Z`;

/** Whole UTC days ending today, as dailyRange's dates and the SQL's instants. */
export function dayRange(days, nowMs) {
  const r = dailyRange(days, nowMs);
  return { ...r, start: midnight(r.startDate), end: midnight(addDays(r.endDate, 1)), prevStart: midnight(r.prevStartDate) };
}

const NOT_CONFIGURED = { notConfigured: { visits: "VISITS_DATASET" } };

export function createArkosQueries({ arkos, now = Date.now, log = console }) {
  const configured = () => arkos.configured;
  const sum = (rows, win, field) => rows.filter((r) => r.win === win).reduce((n, r) => n + Number(r[field] ?? 0), 0);

  return {
    async kpis() {
      const t = now();
      const at = new Date(t).toISOString();
      // No numbers: every value and prev null, the trends zeros, as the shell expects.
      const blank = (health, extra) => {
        const base = kpisOf([], { app: ARKOS_APP, at });
        return { ...base, kpis: base.kpis.map((k) => ({ ...k, value: null, prev: null })), health, ...extra };
      };
      if (!configured()) {
        const hint = "VISITS_DATASET";
        return blank({ status: "warning", note: `Not configured (${hint})` }, { notConfigured: { visits: hint, active: hint, new: hint, sessions: hint, crashfree: hint } });
      }
      const today = isoDate(t);
      try {
        const rows = await arkos.kpis({ start: midnight(addDays(today, -7 * TREND_WEEKS + 1)), end: midnight(addDays(today, 1)), since: hourlyRange(1, t).start });
        return kpisOf(rows, { app: ARKOS_APP, at });
      } catch (error) {
        // The index card shows the error on Arkos's tile rather than losing the whole card.
        log.error("admin: arkos kpis failed", error);
        return blank({ status: "warning", note: "The telemetry query failed" }, { errors: { visits: error instanceof Error ? error.message : String(error) } });
      }
    },

    async installs(days, who = "users") {
      const range = dayRange(days, now());
      if (!configured()) return { days, who, from: range.startDate, to: range.endDate, current: null, previous: null, rhythm: null, versions: null, macos: null, arch: null, ...NOT_CONFIGURED };
      return { who, ...installsOf(await arkos.installs(range, who), range) };
    },

    async journey(days, who = "users") {
      if (!configured()) return { days, who, sessions: null, firstSessions: null, previous: null, capped: null, paths: null, milestones: null, next: null, features: null, focus: null, lengths: null, ends: null, errorEvents: null, notices: null, dropped: null, rejected: null, rhythm: null, cohorts: null, ...NOT_CONFIGURED };
      const t = now();
      const range = hourlyRange(days, t);
      const [rows, counts] = await Promise.all([arkos.sessions(range, who), arkos.sessionCounts(range, who)]);
      return { who, ...journeyOf(rows, { days, previousSessions: sum(counts, "previous", "sessions"), cap: SESSION_CAP, nowMs: t }) };
    },

    async sessions(days, who = "users") {
      if (!configured()) return { who, rows: null, ...NOT_CONFIGURED };
      // The journey's rows, from the same cached job: the newest 50 of them.
      return { who, ...sessionsListOf(await arkos.sessions(hourlyRange(days, now()), who)) };
    },

    async crashes(days, who = "users") {
      if (!configured()) return { who, total: null, previous: null, sessions: null, lost: null, byVersion: null, groups: null, ...NOT_CONFIGURED };
      const range = hourlyRange(days, now());
      const [crashRows, counts] = await Promise.all([arkos.crashes(range, who), arkos.sessionCounts(range, who)]);
      return { who, ...crashesOf(crashRows, counts) };
    },
  };
}
