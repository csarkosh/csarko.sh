/**
 * Who may call the admin routes.
 *
 * Two proofs are accepted. The admin shell signs an account in with Google
 * through Firebase Auth (project csarko-sh, served from admin.csarko.sh) and
 * sends the ID token it gets as a bearer value. The token is a JWT signed by
 * Google's `securetoken` keys, with the project as issuer and audience and
 * the account's verified email as a claim; verifying it needs the public keys
 * and nothing else, so no Firebase library runs here. The allowlist is the
 * service's environment (`ADMIN_EMAILS`, comma-separated), so a collaborator
 * is an environment change, not a deploy of new code. The game's telemetry
 * service makes the same check against the same issuer: one sign-in, every app.
 *
 * Cloud Scheduler, which has no account to sign in with, sends a Google OIDC
 * ID token for the snapshot route instead: Google signs it, its `aud` is this
 * service's URL and its `email` is the scheduler's service account, so the
 * check is "Google says this is our scheduler" and nothing more.
 *
 * Both checks are pure over their inputs (the token, the key set, the clock),
 * so they are tested with keys made in the test.
 */

import { createRemoteJWKSet, jwtVerify } from "jose";

/** Where Google publishes the keys it signs OIDC ID tokens with. */
export const GOOGLE_CERTS = "https://www.googleapis.com/oauth2/v3/certs";
export const GOOGLE_ISSUER = "https://accounts.google.com";
/** Where Google publishes the keys Firebase Auth signs ID tokens with. */
export const SECURETOKEN_JWKS = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

/** The allowlist as the environment spells it: addresses, lower-cased, nothing else. */
export function parseAllowlist(raw) {
  return (raw ?? "").split(",").map((email) => email.trim().toLowerCase()).filter((email) => email.includes("@"));
}

/**
 * A verifier for the shell's Firebase ID token: signed by Google for
 * `projectId`, a verified email, and that email on the allowlist. Returns
 * `{ email }` or null; never throws.
 */
export function createAdminAuth({ projectId, allowed, keys = createRemoteJWKSet(new URL(SECURETOKEN_JWKS)), now } = {}) {
  const list = new Set((allowed ?? []).map((email) => email.toLowerCase()));
  return {
    get enabled() {
      return typeof projectId === "string" && projectId !== "" && list.size > 0;
    },
    async verify(token) {
      if (!this.enabled || typeof token !== "string" || token === "") return null;
      try {
        const { payload } = await jwtVerify(token, keys, {
          issuer: `https://securetoken.google.com/${projectId}`,
          audience: projectId,
          algorithms: ["RS256"],
          ...(now === undefined ? {} : { currentDate: new Date(now()) }),
        });
        const email = typeof payload.email === "string" ? payload.email.toLowerCase() : "";
        if (email === "" || payload.email_verified !== true || !list.has(email)) return null;
        return { email };
      } catch {
        return null;
      }
    },
  };
}

/** The bearer value of an Authorization header, or null when there is none. */
export function bearerOf(authorization) {
  if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  return token === "" ? null : token;
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
