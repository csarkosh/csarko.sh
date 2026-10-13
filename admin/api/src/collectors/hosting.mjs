/**
 * When the site was last deployed, from Firebase Hosting's releases list.
 * The call is authorised with the service's own identity: on Cloud Run the
 * metadata server hands out an access token for the service account (which
 * holds Firebase viewer); anywhere else there is no metadata server, so the
 * answer is null rather than an error, since a local run has no business
 * reading production releases anyway.
 */

const METADATA_TOKEN = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";
const API = "https://firebasehosting.googleapis.com/v1beta1";

export function createHosting({ site, fetch, cache, ttlMs = 300_000, tokenTtlMs = 50 * 60_000, now = Date.now }) {
  // The token is kept for as long as the metadata server says it is good, less a
  // minute, and never longer than tokenTtlMs. It was kept a flat 50 minutes before,
  // but the metadata server hands out the same token until it is nearly spent, so a
  // token fetched late in its hour was kept past its end and every call answered
  // 401 for a while (the Health card, 2026-10-13). A fetch that fails is not kept.
  let held = { token: null, until: 0 };
  async function accessToken() {
    if (held.token !== null && now() < held.until) return held.token;
    try {
      const res = await fetch(METADATA_TOKEN, { headers: { "metadata-flavor": "Google" }, signal: AbortSignal.timeout(2000) });
      if (!res.ok) return null;
      const body = await res.json();
      if (typeof body.access_token !== "string") return null;
      const seconds = Number(body.expires_in);
      const life = Number.isFinite(seconds) && seconds > 0 ? Math.min(tokenTtlMs, (seconds - 60) * 1000) : tokenTtlMs;
      held = { token: body.access_token, until: now() + Math.max(0, life) };
      return held.token;
    } catch {
      // No metadata server: not on Cloud Run.
      return null;
    }
  }

  return {
    /** The latest release's time as ISO 8601, or null when it cannot be read. */
    lastDeployAt() {
      return cache.get(`hosting:${site}:lastDeploy`, ttlMs, async () => {
        const token = await accessToken();
        if (token === null) return null;
        const res = await fetch(`${API}/sites/${encodeURIComponent(site)}/releases?pageSize=1`, { headers: { authorization: `Bearer ${token}`, accept: "application/json" } });
        if (!res.ok) throw new Error(`hosting ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
        return lastReleaseOf(await res.json());
      });
    },
  };
}

export function lastReleaseOf(body) {
  const release = body?.releases?.[0];
  return release?.releaseTime ?? null;
}
