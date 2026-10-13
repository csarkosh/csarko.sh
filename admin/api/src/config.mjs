/**
 * The service's configuration, read once from the environment.
 *
 * Every credential arrives as an environment variable (Terraform mounts the
 * Secret Manager versions that way), so a missing one is a plain `null` here
 * and the collector that needs it answers "not configured" rather than
 * failing the page. A credential that is empty or the placeholder `unset`
 * (see `secret`) is missing. Only `ADMIN_TOKEN` is required: without it
 * there is nothing to compare a caller against, so the admin routes answer
 * 503 instead.
 */

export const DEFAULT_ALLOWED_ORIGINS = ["https://admin.csarko.sh", "http://localhost:8788"];
export const DEFAULT_GITHUB_REPOS = ["csarkosh/game-dayhike", "csarkosh/electron-gamepatch"];

function list(raw, fallback) {
  if (raw === undefined || raw === null || raw.trim() === "") return [...fallback];
  return raw.split(",").map((s) => s.trim()).filter((s) => s !== "");
}

function text(raw, fallback = null) {
  if (raw === undefined || raw === null || raw.trim() === "") return fallback;
  return raw.trim();
}

/**
 * The placeholder a secret holds before Cyrus has created it. Cloud Run
 * refuses a revision whose referenced secret has no version, so Terraform
 * seeds each one with the literal `unset`; to the collectors that is the same
 * as no credential at all, and for `ADMIN_TOKEN` it still means "serve 503".
 */
export const UNSET = "unset";

export function secret(raw) {
  const value = text(raw);
  return value === null || value === UNSET ? null : value;
}

/**
 * The Search Console key is the service account JSON itself, not a path: a
 * Cloud Run secret arrives as a value. A value that is not JSON is treated as
 * missing and logged, since the alternative is a 500 on every search card.
 */
export function parseServiceAccountKey(raw, log = console) {
  const value = secret(raw);
  if (value === null) return null;
  try {
    const key = JSON.parse(value);
    if (typeof key.client_email !== "string" || typeof key.private_key !== "string") {
      log.error("GSC_SA_KEY is JSON but not a service account key (no client_email or private_key); treating as unset");
      return null;
    }
    return key;
  } catch {
    log.error("GSC_SA_KEY is not JSON; it must be the service account key's content, not a path; treating as unset");
    return null;
  }
}

export function readConfig(env = process.env, log = console) {
  const siteUrl = text(env.SITE_URL, "https://csarko.sh").replace(/\/+$/, "");
  return {
    adminToken: secret(env.ADMIN_TOKEN),
    goatcounter: { token: secret(env.GOATCOUNTER_TOKEN), site: text(env.GOATCOUNTER_SITE, "csarko") },
    gsc: { key: parseServiceAccountKey(env.GSC_SA_KEY, log), property: text(env.GSC_PROPERTY, "sc-domain:csarko.sh") },
    youtube: { key: secret(env.YOUTUBE_KEY), handle: text(env.YOUTUBE_HANDLE, "csarkosh") },
    github: { token: secret(env.GITHUB_TOKEN), repos: list(env.GITHUB_REPOS, DEFAULT_GITHUB_REPOS) },
    psiKey: secret(env.PSI_KEY),
    siteUrl,
    sitemapUrl: text(env.SITEMAP_URL, `${siteUrl}/sitemap.xml`),
    hostingSite: text(env.HOSTING_SITE, "csarko-sh"),
    allowedOrigins: list(env.ALLOWED_ORIGINS, DEFAULT_ALLOWED_ORIGINS),
    snapshotInvoker: text(env.SNAPSHOT_INVOKER),
    serviceUrl: text(env.SERVICE_URL),
    projectId: text(env.GOOGLE_CLOUD_PROJECT),
    port: Number(text(env.PORT, "8080")),
  };
}
