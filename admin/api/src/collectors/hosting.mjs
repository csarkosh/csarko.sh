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

export function createHosting({ site, fetch, cache, ttlMs = 300_000, tokenTtlMs = 50 * 60_000 }) {
  async function accessToken() {
    return cache.get("hosting:adc-token", tokenTtlMs, async () => {
      try {
        const res = await fetch(METADATA_TOKEN, { headers: { "metadata-flavor": "Google" }, signal: AbortSignal.timeout(2000) });
        if (!res.ok) return null;
        const body = await res.json();
        return typeof body.access_token === "string" ? body.access_token : null;
      } catch {
        // No metadata server: not on Cloud Run.
        return null;
      }
    });
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
