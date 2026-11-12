/**
 * Instant, then live (Cyrus, 2026-11-11). A card draws the answers its API last gave, saved in
 * Firestore (data.js `saved`, admin/api/src/saved.mjs), as soon as they arrive, marked
 * "saved 14 min ago" beside its title; when the live answers come, a card whose answers changed
 * cross-fades to them (held at its height and eased, so nothing jumps) and the mark goes. A card
 * with nothing saved waits for the live answers as it always did, and a live failure over a saved
 * draw keeps the saved one with the error line under it.
 */

import { ago, el, errorLine, hold, settle } from '/charts.js';
import { fadeIn, fadeOut } from '/motion.js';

/** An answer without its top-level `at`, which every live answer has anew. */
const withoutAt = (answer) => {
  if (answer === null || typeof answer !== 'object' || Array.isArray(answer)) return answer;
  const { at, ...rest } = answer;
  return rest;
};
/** Whether two lists of answers say the same thing. */
export const sameAnswers = (a, b) => JSON.stringify(a.map(withoutAt)) === JSON.stringify(b.map(withoutAt));

/** Every one of the saved answers in `list` (promises of `{ at, answer }` or null), or null when any is missing: `{ at: the oldest, answers }`. */
export async function savedAll(list) {
  const all = await Promise.all(list.map((p) => Promise.resolve(p).catch(() => null)));
  if (all.length === 0 || all.some((s) => s === null)) return null;
  const at = all.map((s) => s.at).sort()[0];
  return { at, answers: all.map((s) => s.answer) };
}

/** Marks the card as drawn from saved answers. */
function mark(card, at) {
  let tag = card.querySelector('.saved-at');
  if (!tag) {
    tag = el('span', { class: 'saved-at' });
    card.querySelector('h2')?.append(tag);
  }
  tag.textContent = `saved ${ago(at)}`;
}

/** Takes the mark away, fading it out. */
function unmark(card) {
  const tag = card.querySelector('.saved-at');
  if (!tag) return;
  const fading = fadeOut(tag);
  if (fading) fading.finished.then(() => tag.remove(), () => tag.remove());
  else tag.remove();
}

/**
 * Fills one card: `live` and `saved` are the promises (answers, and savedAll's), `draw(answers)`
 * replaces the body's content, `fail(error)` puts the error in its place, `current()` says whether
 * this load is still the page's (a range change makes it stale). `key` is the card's hold() id.
 * Ends as the old loaders did: the body no longer busy, faded in, the card settled.
 */
export async function savedThenLive({ card, key, body, live, saved, current, draw, fail }) {
  const finish = () => {
    body.removeAttribute('aria-busy');
    fadeIn(body);
    settle(card, key);
  };
  const early = await Promise.race([saved, live.then(() => null, () => null)]);
  if (!current()) return;
  let shown = null;
  if (early !== null) {
    draw(early.answers);
    mark(card, early.at);
    fadeIn(body);
    settle(card, key);
    shown = early.answers;
  }
  let results;
  try {
    results = await live;
  } catch (error) {
    if (!current()) return;
    if (shown === null) {
      fail(error);
      finish();
      return;
    }
    // The saved draw stays as it is (a second fadeIn would start it from 0); only the line fades in.
    const line = errorLine('The live answer could not be read; this is the saved one.', error.message);
    body.append(line);
    fadeIn(line);
    body.removeAttribute('aria-busy');
    settle(card, key);
    return;
  }
  if (!current()) return;
  if (shown !== null && sameAnswers(shown, results)) {
    unmark(card);
    body.removeAttribute('aria-busy');
    return;
  }
  if (shown !== null) {
    hold(card, key, card.getBoundingClientRect().height);
    await fadeOut(body)?.finished.catch(() => {});
    if (!current()) return;
  }
  draw(results);
  unmark(card);
  finish();
}
