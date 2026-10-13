/**
 * The HTTP conventions every route shares: JSON bodies, `cache-control:
 * no-store` on everything (the data is private and five minutes stale at
 * most, so a browser cache would only ever show an older number), CORS for
 * the admin page's origin, and a bounded body reader.
 */

/** A missing `Origin` is allowed (a probe, a test, the scheduler); a present but unlisted one is somebody else's page. */
export function isAllowedOrigin(origin, allowed) {
  if (origin === undefined) return true;
  return allowed.includes(origin);
}

export function corsHeaders(origin) {
  if (origin === undefined) return {};
  return { "access-control-allow-origin": origin, vary: "origin" };
}

export function preflightHeaders(origin) {
  return {
    ...corsHeaders(origin),
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-max-age": "86400",
  };
}

export function answer(res, status, body, headers = {}) {
  const text = body === undefined ? "" : JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": String(Buffer.byteLength(text)),
    "cache-control": "no-store",
    ...headers,
  });
  res.end(text);
}

export function fail(res, status, message, headers = {}) {
  answer(res, status, { error: message }, headers);
}

/** The body up to `maxBytes`, or null past it: the request is destroyed at the cap. */
export function readBody(req, maxBytes) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        req.destroy();
        resolve(null);
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", () => resolve(null));
  });
}

export const DAYS = new Set([1, 7, 30, 90]);

/**
 * The `days` query parameter: absent means 7, anything but the four ranges
 * the page offers is a 400 (null here), since a free-form range would let
 * one URL make GoatCounter and Search Console do arbitrary work.
 */
export function parseDays(raw) {
  if (raw === null || raw === undefined || raw === "") return 7;
  if (!/^\d{1,2}$/.test(raw)) return null;
  const days = Number(raw);
  return DAYS.has(days) ? days : null;
}
