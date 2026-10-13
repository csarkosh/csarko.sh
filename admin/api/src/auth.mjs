/**
 * Who may call the admin routes.
 *
 * Two proofs are accepted. The admin page sends the one admin token as a
 * bearer value, and it is compared against `ADMIN_TOKEN` in constant time
 * after a length check, so a mismatch leaks nothing about where it differs.
 * Cloud Scheduler, which cannot hold the admin token, sends a Google OIDC ID
 * token for the snapshot route instead: Google signs it, its `aud` is this
 * service's URL and its `email` is the scheduler's service account, so the
 * check is "Google says this is our scheduler" and nothing more.
 *
 * Both checks are pure over their inputs (the token, the key set, the clock),
 * so they are tested with keys made in the test.
 */

import { timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";

/** Where Google publishes the keys it signs ID tokens with. */
export const GOOGLE_CERTS = "https://www.googleapis.com/oauth2/v3/certs";
export const GOOGLE_ISSUER = "https://accounts.google.com";

/** The bearer value of an Authorization header, or null when there is none. */
export function bearerOf(authorization) {
  if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  return token === "" ? null : token;
}

/** Whether `presented` is `expected`, without a timing side channel on the comparison. */
export function tokenMatches(presented, expected) {
  if (typeof presented !== "string" || typeof expected !== "string" || expected === "") return false;
  const a = Buffer.from(presented, "utf8");
  const b = Buffer.from(expected, "utf8");
  // timingSafeEqual throws on unequal lengths; the length itself is not a secret here.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * A verifier for the scheduler's OIDC token. `audiences()` is a function
 * because the service's own URL is only known from the request (or from
 * `SERVICE_URL`), and Cloud Scheduler's default audience is the full target
 * URL, so the route's path is accepted as well as the bare origin.
 */
export function createOidcVerifier({ invoker, keys = createRemoteJWKSet(new URL(GOOGLE_CERTS)), now } = {}) {
  return {
    async verify(token, audiences) {
      if (!invoker || typeof token !== "string" || token === "" || audiences.length === 0) return null;
      try {
        const { payload } = await jwtVerify(token, keys, {
          issuer: GOOGLE_ISSUER,
          audience: audiences,
          algorithms: ["RS256"],
          ...(now === undefined ? {} : { currentDate: new Date(now()) }),
        });
        const email = typeof payload.email === "string" ? payload.email.toLowerCase() : "";
        if (email === "" || payload.email_verified !== true || email !== invoker.toLowerCase()) return null;
        return { email };
      } catch {
        return null;
      }
    },
  };
}

/** The audiences a request to this service may carry: its origin, and the route itself. */
export function audiencesFor(req, serviceUrl) {
  const out = new Set();
  if (serviceUrl) {
    const base = serviceUrl.replace(/\/+$/, "");
    out.add(base);
    out.add(`${base}/admin/snapshot`);
  }
  const host = req.headers["x-forwarded-host"] ?? req.headers.host;
  if (typeof host === "string" && host !== "") {
    const proto = req.headers["x-forwarded-proto"] === "http" ? "http" : "https";
    out.add(`${proto}://${host}`);
    out.add(`${proto}://${host}/admin/snapshot`);
  }
  return [...out];
}
