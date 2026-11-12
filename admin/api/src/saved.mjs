/**
 * Saved answers (2026-11-11, Cyrus: "instant, then live"). Every answer the csarko.sh and Arkos
 * IDE routes give without an error is also written to Firestore as `adminViews/<id>`, `{ at, body }`
 * with the body as JSON text, and the pages read that document first (Firestore's REST API, the
 * reader's ID token, the rules' allowlist) to draw a card at once, then cross-fade to the live
 * answer when it differs. A page load costs the same BigQuery jobs as before and no scheduler job.
 *
 * The id is the request as the page made it: the app's slug, the route under its prefix and the
 * parameters that shape the answer, sorted, then URI-encoded (so it holds no `/`):
 *
 *   csarko.sh/admin/query/visits?days=7&tz=America/New_York  ->  csarko.sh%2Fadmin%2Fquery%2F...
 *
 * `admin/public/saved-id.js` builds the same id in the browser; `test/saved.test.mjs` holds the two
 * to one another.
 */

/** The parameters an id carries, in this (sorted) order; anything else in the query is ignored. */
export const SAVED_PARAMS = ["days", "range", "tz", "who"];
/** The app slug (apps.json) of each prefix whose answers are saved. Billing has its own views. */
export const SAVED_SLUGS = { "": "csarko.sh", "/arkos": "ide-arkos" };
/** An answer larger than this is not saved (a Firestore document is at most 1 MiB). */
export const SAVED_MAX_BYTES = 900_000;

/** The document id of a request: `params` is URLSearchParams or a plain object. */
export function savedId(slug, path, params) {
  const get = (k) => (typeof params?.get === "function" ? params.get(k) : params?.[k]);
  const kept = SAVED_PARAMS.filter((k) => get(k) !== null && get(k) !== undefined && get(k) !== "").map((k) => `${k}=${get(k)}`);
  return encodeURIComponent(`${slug}${path}${kept.length > 0 ? `?${kept.join("&")}` : ""}`);
}

/**
 * `save(id, body)`: writes the answer unless it carries `errors` (a partial answer is not one to
 * show first) or is over SAVED_MAX_BYTES. Never throws: a failed write is a log line, and the reader
 * still gets the live answer.
 */
export function createSaver({ store, now = Date.now, log = console }) {
  return {
    async save(id, body) {
      if (body === null || typeof body !== "object") return false;
      if (body.errors && Object.keys(body.errors).length > 0) return false;
      const json = JSON.stringify(body);
      if (Buffer.byteLength(json) > SAVED_MAX_BYTES) {
        log.warn(`admin: not saving ${decodeURIComponent(id)} (${Buffer.byteLength(json)} B)`);
        return false;
      }
      try {
        await store.writeSaved(id, { at: new Date(now()).toISOString(), body: json });
        return true;
      } catch (error) {
        log.error(`admin: saving ${decodeURIComponent(id)} failed`, error);
        return false;
      }
    },
  };
}
