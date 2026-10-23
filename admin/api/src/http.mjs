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

/**
 * A vendor that could not be reached or answered with an error: the route
 * answers 502 with this message, so the card says whose fault it was rather
 * than showing a bare 500 that reads as ours.
 */
export class UpstreamError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "UpstreamError";
  }
}

/**
 * The status and message for an error a route threw: 502 for an
 * `UpstreamError`, and for any collector's `fetch` that failed below HTTP
 * (undici's "fetch failed", its cause carrying the socket's code); 500 for
 * the rest.
 */
export function failureOf(error) {
  if (error instanceof UpstreamError) return { status: 502, message: error.message };
  if (error instanceof TypeError && error.message === "fetch failed") {
    const code = error.cause?.code;
    return { status: 502, message: `an upstream service was unreachable${code ? ` (${code})` : ""}` };
  }
  return { status: 500, message: error instanceof Error ? error.message : String(error) };
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
 * one URL make BigQuery and Search Console do arbitrary work.
 */
export function parseDays(raw) {
  if (raw === null || raw === undefined || raw === "") return 7;
  if (!/^\d{1,2}$/.test(raw)) return null;
  const days = Number(raw);
  return DAYS.has(days) ? days : null;
}

/**
 * The `tz` query parameter, the reader's IANA zone (the page sends its browser's), which the
 * visits query cuts its days in: absent means UTC, as before the page sent one; a name that is
 * not a zone this runtime knows is a 400 (null here). The shape is checked before Intl sees it,
 * so nothing but a short zone-like string reaches BigQuery as a parameter.
 */
export function parseTz(raw) {
  if (raw === null || raw === undefined || raw === "") return "UTC";
  if (raw.length > 64 || !/^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+){0,2}$/.test(raw)) return null;
  try {
    // Checked, then given back as sent: Intl may canonicalize it, and `dayLabel` should be the page's own.
    new Intl.DateTimeFormat("en-US", { timeZone: raw });
    return raw;
  } catch {
    return null;
  }
}
