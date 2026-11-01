/**
 * The Films card (2026-11-01): which videos are films, the daily snapshot's `films` step that
 * makes every YouTube Analytics report the card needs, and the shaping of that stored part into
 * the `films` query's answer for a range. Pure over injected collectors, so it is tested with
 * fakes (test/films.test.mjs).
 *
 * The films are `films.json` beside this file, written from docs/films/*.md by
 * admin/tools/films-json.mjs (the service is built from admin/api alone and cannot read the
 * docs; a test fails while the two disagree). Every other upload on the channel is listed under
 * "Other uploads" with its totals, never dropped: the ids come from the top videos report (every
 * upload that had a view) and, when YOUTUBE_KEY is set, the Data API's uploads list, which also
 * gives their titles.
 *
 * "Make sure it loads quick" (Cyrus, 2026-11-01): the numbers move once a day, so the snapshot
 * makes every report once (totals for 7, 30 and 90 days and the period before each, 90 days of
 * daily rows, the retention curve, the traffic sources and External's URLs per period, per film:
 * about 22 calls for two films) and stores a few KB; a page load reads that and never waits on
 * YouTube. The ranges end LAG_DAYS before today, the last day YouTube has finished counting.
 */

import { readFileSync } from "node:fs";
import { ANALYTICS_LAG, emptyMetrics } from "./collectors/youtube-analytics.mjs";
import { addDays, dailyRangeThrough } from "./time.mjs";

export const PERIODS = [7, 30, 90];
/** YouTube Analytics is complete about two days back; today and yesterday are partial. */
export const LAG_DAYS = 2;

/** The committed film list, `[{ slug, title, videoId, published, runtime }]`, newest first. */
export const FILMS = JSON.parse(readFileSync(new URL("./films.json", import.meta.url), "utf8"));

/** A range the card can show: 7, 30 or 90 days. There is no day view (the data is two days behind), so 1 shows 7. */
export const filmsDays = (days) => (PERIODS.includes(days) ? days : 7);

/** Whether a snapshot's `films` part is one this module wrote. */
export const isFilmsPart = (part) => part !== null && typeof part === "object" && Array.isArray(part.films) && typeof part.through === "string";

const messageOf = (error) => (error instanceof Error ? error.message : String(error));

/**
 * Every report the card needs, as the snapshot stores it:
 *
 *   { at, lag, through, films: [{ slug, title, videoId, published, runtime, daily, retention,
 *       periods: { "7": { totals, prev, sources, external }, "30": ..., "90": ... }, errors? }],
 *     others: [{ videoId, title, periods: { "7": { totals, prev }, ... } }] }
 *
 * The totals and the daily rows must all answer, or the step fails and the snapshot keeps the
 * last good part (queries.mjs). The retention curve, the sources and External's URLs are a film's
 * own `errors` when they fail, so one report YouTube refuses does not cost the card its numbers.
 */
export async function collectFilms({ analytics, youtube = null, films = FILMS, today, at, log = console }) {
  const through = addDays(today, -LAG_DAYS);
  const ranges = Object.fromEntries(PERIODS.map((d) => [d, dailyRangeThrough(d, through)]));
  // Six calls give every upload's totals: each period and the one before it.
  const totalsBy = Object.fromEntries(await Promise.all(PERIODS.map(async (d) => {
    const r = ranges[d];
    const [cur, prev] = await Promise.all([analytics.totals(null, r.startDate, r.endDate), analytics.totals(null, r.prevStartDate, r.prevEndDate)]);
    return [d, { cur, prev }];
  })));
  const uploadsCall = youtube?.configured
    ? youtube.channel().then((c) => c.videosList ?? [], (error) => { log.error("admin: films uploads list failed", error); return []; })
    : Promise.resolve([]);

  const filmRows = await Promise.all(films.map(async (film) => {
    const errors = {};
    const soft = async (name, fn) => {
      try {
        return await fn();
      } catch (error) {
        log.error(`admin: films ${film.slug} ${name} failed`, error);
        errors[name] ??= messageOf(error);
        return null;
      }
    };
    const r90 = ranges[90];
    const retentionStart = film.published && film.published < through ? film.published : r90.startDate;
    const [daily, retention, periods] = await Promise.all([
      analytics.daily(film.videoId, r90.startDate, r90.endDate),
      soft("retention", () => analytics.retention(film.videoId, retentionStart, through)),
      Promise.all(PERIODS.map(async (d) => {
        const r = ranges[d];
        const [sources, external] = await Promise.all([
          soft("sources", () => analytics.sources(film.videoId, r.startDate, r.endDate)),
          soft("external", () => analytics.external(film.videoId, r.startDate, r.endDate)),
        ]);
        return [String(d), { totals: totalsBy[d].cur.get(film.videoId) ?? emptyMetrics(), prev: totalsBy[d].prev.get(film.videoId) ?? emptyMetrics(), sources, external }];
      })),
    ]);
    return {
      slug: film.slug,
      title: film.title,
      videoId: film.videoId,
      published: film.published ?? null,
      runtime: film.runtime ?? null,
      daily,
      retention,
      periods: Object.fromEntries(periods),
      ...(Object.keys(errors).length > 0 ? { errors } : {}),
    };
  }));

  const filmIds = new Set(films.map((f) => f.videoId));
  const uploads = await uploadsCall;
  const titles = new Map(uploads.map((v) => [v.id, v.title || null]));
  const otherIds = new Set(uploads.map((v) => v.id));
  for (const d of PERIODS) for (const id of [...totalsBy[d].cur.keys(), ...totalsBy[d].prev.keys()]) otherIds.add(id);
  const others = [...otherIds].filter((id) => id && !filmIds.has(id)).map((videoId) => ({
    videoId,
    title: titles.get(videoId) ?? null,
    periods: Object.fromEntries(PERIODS.map((d) => [String(d), { totals: totalsBy[d].cur.get(videoId) ?? emptyMetrics(), prev: totalsBy[d].prev.get(videoId) ?? emptyMetrics() }])),
  })).sort((a, b) => b.periods["90"].totals.views - a.periods["90"].totals.views || a.videoId.localeCompare(b.videoId));

  return { at, lag: ANALYTICS_LAG, through, films: filmRows, others };
}

/**
 * The stored part as the `films` query answers it for `days` (7, 30 or 90; 1 is 7):
 * `{ days, from, to, at, lag, films: [{ slug, title, videoId, published, runtime, totals, prev, daily,
 * retention, sources, external, errors? }], others: [{ videoId, title, totals, prev }] }`, the
 * daily rows cut to the range.
 */
export function filmsAnswer(stored, days) {
  const d = filmsDays(days);
  const key = String(d);
  const r = dailyRangeThrough(d, stored.through);
  return {
    days: d,
    from: r.startDate,
    to: r.endDate,
    at: stored.at ?? null,
    lag: stored.lag ?? ANALYTICS_LAG,
    films: stored.films.map((f) => {
      const p = f.periods?.[key] ?? {};
      return {
        slug: f.slug,
        title: f.title,
        videoId: f.videoId,
        published: f.published ?? null,
        runtime: f.runtime ?? null,
        totals: p.totals ?? emptyMetrics(),
        prev: p.prev ?? emptyMetrics(),
        daily: (f.daily ?? []).slice(-d),
        retention: f.retention ?? null,
        sources: p.sources ?? null,
        external: p.external ?? null,
        ...(f.errors ? { errors: f.errors } : {}),
      };
    }),
    others: (stored.others ?? []).map((o) => ({ videoId: o.videoId, title: o.title ?? null, totals: o.periods?.[key]?.totals ?? emptyMetrics(), prev: o.periods?.[key]?.prev ?? emptyMetrics() })),
  };
}
