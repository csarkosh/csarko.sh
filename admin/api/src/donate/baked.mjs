/**
 * The period the live donate pages bake in. Every page of a deploy is built from one prices object
 * and carries it as a JSON block (`<script type="application/json" id="prices">`), the fallback a
 * visitor meets when the live prices cannot be fetched. The weekly step's sweep must never retire
 * that period's links, or the fallback would send a visitor to a dead checkout; so before sweeping it
 * reads the front page and keeps whatever period it names. That is what makes a redeploy after a
 * repricing optional: the pages keep showing the current prices (read live), and the links they bake
 * in stay live until the next deploy bakes newer ones. Unknown (no answer, no block, no day) reads
 * as null, and the sweep then retires nothing.
 */

import { DONATE_URL } from "./doors.mjs";

const BLOCK = /<script type="application\/json" id="prices">([^<]*)<\/script>/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The `repricedOn` day of the prices block in a page's HTML, or null. */
export function bakedPeriodOf(html) {
  if (typeof html !== "string") return null;
  const block = BLOCK.exec(html);
  if (!block) return null;
  try {
    const day = JSON.parse(block[1])?.period?.repricedOn;
    return typeof day === "string" && DAY.test(day) ? day : null;
  } catch {
    return null;
  }
}

/** A function that fetches the live front page (5 s at most, within the snapshot's budget) and returns its baked day, or null. */
export function createBakedPeriod({ fetch, url = `${DONATE_URL}/`, timeoutMs = 5000 }) {
  return async () => {
    const res = await fetch(url, { headers: { "Cache-Control": "no-cache" }, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    return bakedPeriodOf(await res.text());
  };
}
