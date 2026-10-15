/**
 * Dates, all in UTC: the snapshot's document id is a UTC date, the visits
 * SQL and Search Console both work in UTC, and a dashboard that mixed zones
 * would show a day's numbers under two different labels.
 */

export const DAY_MS = 86_400_000;

/** 2026-10-12 for any instant on that UTC day. */
export function isoDate(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date, days) {
  return isoDate(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS);
}

/** The instant rounded down to the hour, as the visits SQL takes its bounds: 2026-10-12T15:00:00Z. */
export function hourStamp(ms) {
  const d = new Date(ms);
  d.setUTCMinutes(0, 0, 0);
  return d.toISOString().replace(".000Z", "Z");
}

/**
 * An hourly range of `days` ending at the current hour (the hour under
 * way is included: `end` is the next boundary), and the equal range before
 * it, so every card can show "versus the previous period".
 */
export function hourlyRange(days, nowMs) {
  const end = new Date(nowMs);
  end.setUTCMinutes(0, 0, 0);
  const endMs = end.getTime() + 3_600_000;
  const startMs = endMs - days * DAY_MS;
  return {
    days,
    start: hourStamp(startMs),
    end: hourStamp(endMs),
    prevStart: hourStamp(startMs - days * DAY_MS),
    prevEnd: hourStamp(startMs),
  };
}

/**
 * A Search Console range in whole days ending today (UTC). Google's data runs
 * two to three days behind, so the last rows are usually empty; that is the
 * source's lag, and the card says so, rather than something to hide by
 * shifting the window.
 */
export function dailyRange(days, nowMs) {
  const endDate = isoDate(nowMs);
  const startDate = addDays(endDate, -(days - 1));
  return {
    days,
    startDate,
    endDate,
    prevStartDate: addDays(startDate, -days),
    prevEndDate: addDays(startDate, -1),
  };
}
