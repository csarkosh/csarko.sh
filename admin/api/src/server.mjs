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
import { createArkosQueries } from "./arkos-queries.mjs";
import { createFinanceQueries } from "./finance-queries.mjs";
import { createMemoryStore, createFirestoreStore } from "./store.mjs";
import { BigQuery } from "@google-cloud/bigquery";
import { createVisits } from "./collectors/visits.mjs";
import { createArkos } from "./collectors/arkos.mjs";
import { createAwsCost } from "./collectors/aws-cost.mjs";
import { createGcpBilling } from "./collectors/gcp-billing.mjs";
import { createGitHubBilling } from "./collectors/github-billing.mjs";
import { createFal } from "./collectors/fal.mjs";
import { createStripe } from "./collectors/stripe.mjs";
import { createLedgers } from "./collectors/ledgers.mjs";
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

// One client for the site's visits and Arkos's rows (both in the lib-visits log bucket's dataset)
// and for the GCP billing export (its own dataset, the finance page).
const bigquery = config.visits.dataset || config.finance.billingDataset ? new BigQuery({ projectId: config.projectId }) : null;

// The finance page's sources: Cost Explorer (called by the snapshot job only; $0.01 a call), the
// billing export in BigQuery (live), GitHub's usage endpoint and fal's credit balance (the
// snapshot job again), Modal's report (written into the snapshot by its own job), the film
// ledgers in their bucket (live, cached) and the donations through Stripe (live, cached, a
// restricted key).
const finance = createFinanceQueries({
  awsCost: createAwsCost({ roleArn: config.finance.awsRoleArn, audience: config.finance.awsAudience, local: config.finance.awsLocal, fetch, log }),
  gcpBilling: createGcpBilling({ bigquery, projectId: config.projectId, dataset: config.finance.billingDataset, table: config.finance.billingTable, cache }),
  githubBilling: createGitHubBilling({ token: config.github.token, owner: config.github.owner, fetch, cache }),
  fal: createFal({ adminKey: config.fal.adminKey, fetch, cache }),
  stripe: createStripe({ key: config.stripe.key, fetch, cache }),
  ledgers: createLedgers({ bucket: config.finance.ledgersBucket, projectId: config.projectId, cache, log }),
  modalConfigured: config.finance.modalConfigured,
  store,
  log,
});

const queries = createQueries({
  visits: createVisits({ bigquery, projectId: config.projectId, dataset: config.visits.dataset, historyDataset: config.visits.historyDataset, historyUntil: config.visits.historyUntil, cache, log }),
  gsc: createGsc({ key: config.gsc.key, property: config.gsc.property, fetch, cache }),
  youtube: createYouTube({ key: config.youtube.key, handle: config.youtube.handle, fetch, cache }),
  github: createGitHub({ token: config.github.token, owner: config.github.owner, fetch, cache, log }),
  hn: createHackerNews({ query: new URL(config.siteUrl).hostname, fetch, cache }),
  psi: createPsi({ key: config.psiKey, siteUrl: config.siteUrl, fetch, cache }),
  uptime: createUptime({ siteUrl: config.siteUrl, fetch, cache }),
  hosting: createHosting({ site: config.hostingSite, fetch, cache }),
  sitemap: createSitemap({ url: config.sitemapUrl, fetch, cache }),
  store,
  config,
  finance,
  log,
});

const arkos = createArkosQueries({ arkos: createArkos({ bigquery, projectId: config.projectId, dataset: config.visits.dataset, cache }), log });

const limiter = new IpLimiter();
const prune = setInterval(() => limiter.prune(), 60_000);
prune.unref();

const app = createApp({
  config,
  queries,
  arkos,
  finance,
  limiter,
  adminAuth: createAdminAuth({ projectId: config.firebaseProject, allowed: config.adminEmails }),
  oidc: createOidcVerifier({ invoker: config.snapshotInvoker }),
  log,
});

if (config.adminEmails.length === 0) log.error("admin: ADMIN_EMAILS is empty; /admin/* will answer 503 until the allowlist names an account");
else log.log(`admin: ${config.adminEmails.length} account(s) may sign in, through Firebase project ${config.firebaseProject}`);
const unconfigured = [
  !config.visits.dataset && "VISITS_DATASET",
  config.gsc.key === null && "GSC_SA_KEY",
  config.youtube.key === null && "YOUTUBE_KEY",
  config.github.token === null && "GITHUB_TOKEN",
  config.psiKey === null && "PSI_KEY",
  !config.finance.awsRoleArn && !config.finance.awsLocal && "AWS_COST_ROLE_ARN",
  !(config.finance.billingDataset && config.finance.billingTable) && "BILLING_DATASET",
  !config.finance.modalConfigured && "MODAL_TOKEN_ID",
  config.fal.adminKey === null && "FAL_ADMIN_KEY",
  !config.finance.ledgersBucket && "FILM_LEDGERS_BUCKET",
  config.stripe.key === null && "STRIPE_KEY",
].filter(Boolean);
if (unconfigured.length > 0) log.warn(`admin: not configured, their sections will read null: ${unconfigured.join(", ")}`);

const server = http.createServer(app);
server.listen(config.port, () => log.log(`admin: listening on :${config.port} for ${config.allowedOrigins.join(", ")}`));

// Cloud Run sends SIGTERM before it stops an instance; finish what is in flight.
process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
});
