/**
 * The entry point: reads the environment, wires the real collectors to the
 * real network and Firestore, and listens on `PORT`. Everything else is
 * built from injected pieces so that this is the only file a test never
 * loads.
 *
 * `ADMIN_STORE=memory` swaps Firestore for the in-memory store, for a local
 * run without Google credentials; snapshots and manual entries then last
 * only as long as the process.
 */

import http from "node:http";
import { readConfig } from "./config.mjs";
import { createCache } from "./cache.mjs";
import { IpLimiter } from "./limiter.mjs";
import { createAdminAuth, createOidcVerifier } from "./auth.mjs";
import { createApp } from "./app.mjs";
import { createQueries } from "./queries.mjs";
import { createMemoryStore, createFirestoreStore } from "./store.mjs";
import { createGoatCounter } from "./collectors/goatcounter.mjs";
import { createGsc } from "./collectors/gsc.mjs";
import { createYouTube } from "./collectors/youtube.mjs";
import { createGitHub } from "./collectors/github.mjs";
import { createHackerNews } from "./collectors/hn.mjs";
import { createPsi } from "./collectors/psi.mjs";
import { createUptime } from "./collectors/uptime.mjs";
import { createHosting } from "./collectors/hosting.mjs";
import { createSitemap } from "./collectors/sitemap.mjs";

const config = readConfig(process.env);
const fetch = globalThis.fetch;
const cache = createCache();
const log = console;

const store = process.env.ADMIN_STORE === "memory" ? createMemoryStore() : await createFirestoreStore({ projectId: config.projectId, log });

const queries = createQueries({
  gc: createGoatCounter({ site: config.goatcounter.site, token: config.goatcounter.token, fetch, cache, log }),
  gsc: createGsc({ key: config.gsc.key, property: config.gsc.property, fetch, cache }),
  youtube: createYouTube({ key: config.youtube.key, handle: config.youtube.handle, fetch, cache }),
  github: createGitHub({ token: config.github.token, repos: config.github.repos, fetch, cache, log }),
  hn: createHackerNews({ query: new URL(config.siteUrl).hostname, fetch, cache }),
  psi: createPsi({ key: config.psiKey, siteUrl: config.siteUrl, fetch, cache }),
  uptime: createUptime({ siteUrl: config.siteUrl, fetch, cache }),
  hosting: createHosting({ site: config.hostingSite, fetch, cache }),
  sitemap: createSitemap({ url: config.sitemapUrl, fetch, cache }),
  store,
  config,
  log,
});

const limiter = new IpLimiter();
const prune = setInterval(() => limiter.prune(), 60_000);
prune.unref();

const app = createApp({
  config,
  queries,
  limiter,
  adminAuth: createAdminAuth({ projectId: config.firebaseProject, allowed: config.adminEmails }),
  oidc: createOidcVerifier({ invoker: config.snapshotInvoker }),
  log,
});

if (config.adminEmails.length === 0) log.error("admin: ADMIN_EMAILS is empty; /admin/* will answer 503 until the allowlist names an account");
else log.log(`admin: ${config.adminEmails.length} account(s) may sign in, through Firebase project ${config.firebaseProject}`);
const unconfigured = [
  config.goatcounter.token === null && "GOATCOUNTER_TOKEN",
  config.gsc.key === null && "GSC_SA_KEY",
  config.youtube.key === null && "YOUTUBE_KEY",
  config.github.token === null && "GITHUB_TOKEN",
  config.psiKey === null && "PSI_KEY",
].filter(Boolean);
if (unconfigured.length > 0) log.warn(`admin: not configured, their sections will read null: ${unconfigured.join(", ")}`);

const server = http.createServer(app);
server.listen(config.port, () => log.log(`admin: listening on :${config.port} for ${config.allowedOrigins.join(", ")}`));

// Cloud Run sends SIGTERM before it stops an instance; finish what is in flight.
process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
});
