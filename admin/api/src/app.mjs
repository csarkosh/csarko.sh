/**
 * The routes, as one request handler over injected dependencies so the
 * whole surface is tested without a socket:
 *
 *   GET  /health                       200, no auth: a liveness probe. Not `/healthz`:
 *                                      Google's frontend answers that exact path itself
 *                                      with its own 404 (seen 2026-10-13), never the app.
 *   GET  /admin/kpis                   the index card
 *   GET  /admin/query/<name>?days=N    one of the eight saved queries
 *   POST /admin/manual/<key>           { value } appended to the hand-entered series
 *   POST /admin/snapshot               the daily ledger write (admin token or the scheduler's OIDC token)
 *   GET  /arkos/admin/kpis             Arkos IDE's index card
 *   GET  /arkos/admin/query/<name>?days=N   one of Arkos's four queries
 *
 * Arkos IDE is served under the prefix `/arkos` so that its `api` in
 * apps.json is `<service>/arkos` and the shell's two routes hold for it.
 * Both prefixes go through the same checks in the same order; only the
 * route table differs.
 *
 * Order of the checks, and why: the origin first, so somebody else's page
 * gets a 403 and no CORS headers; the preflight next, since it carries no
 * token; then 503 while the allowlist is empty, because then nothing
 * can be compared; the rate limit before the token compare, so a flood
 * costs a map lookup rather than a constant-time compare each; then auth,
 * then the route. Every answer is JSON with `cache-control: no-store`.
 */

import { bearerOf, audiencesFor } from "./auth.mjs";
import { answer, fail, failureOf, readBody, parseDays, isAllowedOrigin, corsHeaders, preflightHeaders } from "./http.mjs";
import { clientIpOf } from "./limiter.mjs";
import { isQueryName, isManualKey } from "./queries.mjs";
import { isArkosQueryName } from "./arkos-queries.mjs";

const MAX_BODY_BYTES = 1024;

const ARKOS_PREFIX = "/arkos";

export function createApp({ config, queries, arkos = null, limiter, adminAuth, oidc, now = Date.now, log = console }) {
  const readersMissingLogged = { done: false };

  return function handle(req, res) {
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;

    if (path === "/health") {
      if (req.method !== "GET" && req.method !== "HEAD") return fail(res, 405, "method not allowed", { allow: "GET, HEAD" });
      return answer(res, 200, { ok: true, at: new Date(now()).toISOString() });
    }
    const isArkos = arkos !== null && path.startsWith(`${ARKOS_PREFIX}/admin/`);
    if (!path.startsWith("/admin/") && !isArkos) return fail(res, 404, "not found");

    const origin = req.headers.origin;
    if (!isAllowedOrigin(origin, config.allowedOrigins)) return fail(res, 403, "origin not allowed");
    const cors = corsHeaders(origin);
    if (req.method === "OPTIONS") {
      res.writeHead(204, { ...preflightHeaders(origin), "cache-control": "no-store" });
      return res.end();
    }

    if (!adminAuth || !adminAuth.enabled) {
      if (!readersMissingLogged.done) {
        readersMissingLogged.done = true;
        log.error("admin: ADMIN_EMAILS is empty (or FIREBASE_PROJECT unset), so nobody may read /admin/* and every route answers 503");
      }
      return fail(res, 503, "admin readers not configured", cors);
    }

    if (!limiter.allow(clientIpOf(req.headers["x-forwarded-for"], req.socket?.remoteAddress))) {
      return fail(res, 429, "too many requests", { ...cors, "retry-after": "1" });
    }

    void (async () => {
      try {
        const token = bearerOf(req.headers.authorization);
        let authorized = (await adminAuth.verify(token)) !== null;
        if (!authorized && path === "/admin/snapshot" && req.method === "POST" && oidc) {
          authorized = (await oidc.verify(token, audiencesFor(req, config.serviceUrl))) !== null;
        }
        if (!authorized) return fail(res, 401, "unauthorized", cors);
        if (isArkos) await routeArkos(req, res, path.slice(ARKOS_PREFIX.length), url.searchParams, cors);
        else await route(req, res, path, url.searchParams, cors);
      } catch (error) {
        // The cause goes to the log, where it can be read later; the page gets the message.
        log.error(`admin: ${req.method} ${path} failed`, error);
        const { status, message } = failureOf(error);
        fail(res, status, message, cors);
      }
    })();
  };

  async function route(req, res, path, search, cors) {
    if (path === "/admin/kpis") {
      if (req.method !== "GET") return fail(res, 405, "method not allowed", { ...cors, allow: "GET, OPTIONS" });
      return answer(res, 200, await queries.kpis(), cors);
    }

    const query = /^\/admin\/query\/([a-z]+)$/.exec(path);
    if (query !== null) {
      if (!isQueryName(query[1])) return fail(res, 404, "no such query", cors);
      if (req.method !== "GET") return fail(res, 405, "method not allowed", { ...cors, allow: "GET, OPTIONS" });
      const days = parseDays(search.get("days"));
      if (days === null) return fail(res, 400, "days must be 1, 7, 30 or 90", cors);
      return answer(res, 200, await queries[query[1]](days), cors);
    }

    const manual = /^\/admin\/manual\/([a-z]+)$/.exec(path);
    if (manual !== null) {
      if (!isManualKey(manual[1])) return fail(res, 404, "no such manual series", cors);
      if (req.method !== "POST") return fail(res, 405, "method not allowed", { ...cors, allow: "POST, OPTIONS" });
      const value = parseManualValue(await readBody(req, MAX_BODY_BYTES));
      if (value === null) return fail(res, 400, "body must be JSON { value: number } with a finite, non-negative value", cors);
      return answer(res, 200, await queries.manual(manual[1], value), cors);
    }

    if (path === "/admin/snapshot") {
      if (req.method !== "POST") return fail(res, 405, "method not allowed", { ...cors, allow: "POST, OPTIONS" });
      return answer(res, 200, await queries.snapshot(), cors);
    }

    return fail(res, 404, "not found", cors);
  }

  /** Arkos's two routes, `path` with the prefix taken off: the index card and the queries, nothing else. */
  async function routeArkos(req, res, path, search, cors) {
    if (path === "/admin/kpis") {
      if (req.method !== "GET") return fail(res, 405, "method not allowed", { ...cors, allow: "GET, OPTIONS" });
      return answer(res, 200, await arkos.kpis(), cors);
    }

    const query = /^\/admin\/query\/([a-z]+)$/.exec(path);
    if (query !== null) {
      if (!isArkosQueryName(query[1])) return fail(res, 404, "no such query", cors);
      if (req.method !== "GET") return fail(res, 405, "method not allowed", { ...cors, allow: "GET, OPTIONS" });
      const days = parseDays(search.get("days"));
      if (days === null) return fail(res, 400, "days must be 1, 7, 30 or 90", cors);
      return answer(res, 200, await arkos[query[1]](days), cors);
    }

    return fail(res, 404, "not found", cors);
  }
}

/** The number in `{ "value": n }`, or null when the body is anything else. */
export function parseManualValue(body) {
  if (body === null) return null;
  try {
    const parsed = JSON.parse(body);
    const value = parsed?.value;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
    return value;
  } catch {
    return null;
  }
}
