/**
 * One in-memory cache for every vendor response, keyed by the caller's
 * string (a URL, usually) with a time to live per entry.
 *
 * The entry holds the promise, not the value, so two cards asking for the
 * same thing at once share one request instead of two: that is what keeps
 * BigQuery's per-job overhead (about a second each) paid once and keeps Search
 * Console's URL inspection under its daily quota. A failure is evicted at once, so an
 * outage is retried on the next request rather than remembered for the TTL.
 */

export function createCache({ now = Date.now, maxEntries = 2000 } = {}) {
  const entries = new Map();

  function sweep() {
    if (entries.size < maxEntries) return;
    const t = now();
    for (const [key, entry] of entries) if (entry.expires <= t) entries.delete(key);
  }

  return {
    get size() {
      return entries.size;
    },
    /** The cached value for `key`, or `load()`'s, kept for `ttlMs`. */
    get(key, ttlMs, load) {
      const hit = entries.get(key);
      if (hit !== undefined && hit.expires > now()) return hit.promise;
      sweep();
      const promise = Promise.resolve().then(load);
      promise.catch(() => {
        if (entries.get(key)?.promise === promise) entries.delete(key);
      });
      entries.set(key, { expires: now() + ttlMs, promise });
      return promise;
    },
    delete(key) {
      entries.delete(key);
    },
    clear() {
      entries.clear();
    },
  };
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
