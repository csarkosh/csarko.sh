/**
 * AWS Cost Explorer, for the finance page. Every call costs $0.01, so only the daily snapshot
 * job calls this (`finance-queries.mjs` `snapshotPart`), two or three times a day, and every
 * request reads the snapshot; nothing here is cached because nothing here runs on a request.
 *
 * Credentials come by web identity federation, so no AWS key is stored anywhere: the service
 * asks the metadata server for a Google ID token for its own service account (audience
 * `AWS_COST_AUDIENCE`, the role's trust condition), and `AssumeRoleWithWebIdentity` on
 * `AWS_COST_ROLE_ARN` turns it into short-lived AWS credentials (`_infra/modules/aws-costs`).
 * Off Cloud Run there is no metadata server; `AWS_COST_LOCAL=1` uses the SDK's default chain
 * (an `AWS_PROFILE` on the Mac) instead. Without a role ARN the collector is not configured.
 *
 * The SDK is imported when first needed, so the tests, which inject a fake `client`, never load
 * it. Cost Explorer is a global service served from us-east-1.
 */

import { addDays, isoDate } from "../time.mjs";
import { UpstreamError } from "../http.mjs";

export const CE_REGION = "us-east-1";
export const CALL_COST_USD = 0.01;
/** The forecast is skipped after this day of the month: too little month is left to be worth a cent. */
export const FORECAST_LAST_DAY = 28;
const METADATA_IDENTITY = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity";
const SESSION_NAME = "csarko-admin";

export function createAwsCost({ roleArn, audience = null, local = false, fetch = globalThis.fetch, now = Date.now, log = console, client = null }) {
  const configured = Boolean(roleArn) || local === true;
  let clientPromise = null;

  /** A Google ID token for this service account, the audience the role trusts (the role's ARN when none is set). */
  async function idToken() {
    const url = `${METADATA_IDENTITY}?audience=${encodeURIComponent(audience ?? roleArn)}&format=full`;
    const res = await fetch(url, { headers: { "Metadata-Flavor": "Google" } });
    if (!res.ok) throw new UpstreamError(`metadata server answered ${res.status} for the identity token`);
    return (await res.text()).trim();
  }

  async function makeClient() {
    const { CostExplorerClient } = await import("@aws-sdk/client-cost-explorer");
    if (local) return new CostExplorerClient({ region: CE_REGION });
    const { fromWebToken } = await import("@aws-sdk/credential-providers");
    // A provider function: the SDK calls it when it has no credentials or they are about to
    // expire, and each call mints a fresh Google token to exchange.
    const credentials = async () => fromWebToken({ roleArn, roleSessionName: SESSION_NAME, webIdentityToken: await idToken(), clientConfig: { region: CE_REGION } })();
    return new CostExplorerClient({ region: CE_REGION, credentials });
  }

  const getClient = () => {
    if (client !== null) return Promise.resolve(client);
    clientPromise ??= makeClient().catch((error) => {
      clientPromise = null;
      throw error;
    });
    return clientPromise;
  };

  async function send(command) {
    const c = await getClient();
    try {
      return await c.send(command);
    } catch (error) {
      throw new UpstreamError(`Cost Explorer ${command.constructor?.name ?? "call"} failed: ${error?.message ?? error}`, { cause: error });
    }
  }

  /** GetCostAndUsage over [start, end) at `granularity`, grouped by usage type and service, every page; `{ rows, calls }`. */
  async function costAndUsage({ start, end, granularity }) {
    const { GetCostAndUsageCommand } = client !== null ? fakeCommands : await import("@aws-sdk/client-cost-explorer");
    const rows = [];
    let calls = 0;
    let token;
    do {
      const out = await send(new GetCostAndUsageCommand({
        TimePeriod: { Start: start, End: end },
        Granularity: granularity,
        Metrics: ["UnblendedCost", "UsageQuantity"],
        GroupBy: [{ Type: "DIMENSION", Key: "USAGE_TYPE" }, { Type: "DIMENSION", Key: "SERVICE" }],
        ...(token ? { NextPageToken: token } : {}),
      }));
      calls += 1;
      rows.push(...rowsOf(out, granularity));
      token = out?.NextPageToken;
    } while (token && calls < 20);
    return { rows, calls };
  }

  return {
    configured,
    local: local === true,
    /** Thirteen months of cost and quantity by usage type, the current month to date included. */
    monthlyByUsage(months = 13) {
      const today = isoDate(now());
      const start = `${firstOfMonth(addMonthsToDate(today, -(months - 1)))}`;
      return costAndUsage({ start, end: addDays(today, 1), granularity: "MONTHLY" });
    },
    /** The last `days` days of cost and quantity by usage type, today included. */
    dailyByUsage(days = 60) {
      const today = isoDate(now());
      return costAndUsage({ start: addDays(today, -(days - 1)), end: addDays(today, 1), granularity: "DAILY" });
    },
    /**
     * GetCostForecast for the rest of the month, from today to the first of next month:
     * `{ forecast: { from, to, remaining } | null, calls }`. Null, and no call, after the 28th.
     */
    async forecast() {
      const today = isoDate(now());
      if (Number(today.slice(8, 10)) > FORECAST_LAST_DAY) return { forecast: null, calls: 0 };
      const { GetCostForecastCommand } = client !== null ? fakeCommands : await import("@aws-sdk/client-cost-explorer");
      const to = firstOfMonth(addMonthsToDate(today, 1));
      const out = await send(new GetCostForecastCommand({ TimePeriod: { Start: today, End: to }, Metric: "UNBLENDED_COST", Granularity: "MONTHLY" }));
      const remaining = Number(out?.Total?.Amount);
      return { forecast: { from: today, to, remaining: Number.isFinite(remaining) ? remaining : null }, calls: 1 };
    },
  };
}

/* ---- pure mappings ---- */

/** The day or month of a result's period as a row field: `{ day }` for DAILY, `{ month }` for MONTHLY. */
function periodOf(period, granularity) {
  const start = String(period?.Start ?? "");
  return granularity === "DAILY" ? { day: start } : { month: start.slice(0, 7) };
}

/** Flat rows from a GetCostAndUsage answer: one a group a period, zero-cost zero-usage groups dropped. */
export function rowsOf(out, granularity) {
  const rows = [];
  for (const period of out?.ResultsByTime ?? []) {
    const when = periodOf(period.TimePeriod, granularity);
    for (const g of period.Groups ?? []) {
      const [line = "", service = ""] = g.Keys ?? [];
      const amount = Number(g.Metrics?.UnblendedCost?.Amount ?? 0);
      const quantity = Number(g.Metrics?.UsageQuantity?.Amount ?? 0);
      if (!(amount !== 0 || quantity !== 0)) continue;
      rows.push({ ...when, service, line, amount: round6(amount), quantity: round6(quantity), unit: g.Metrics?.UsageQuantity?.Unit ?? null });
    }
  }
  return rows;
}

const round6 = (n) => (Number.isFinite(n) ? Math.round(n * 1e6) / 1e6 : 0);
const firstOfMonth = (date) => `${date.slice(0, 7)}-01`;
function addMonthsToDate(date, n) {
  const [y, m] = date.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 10);
}

/**
 * Stand-ins for the SDK's command classes when a test injects a fake client: the fake sees the
 * same `{ constructor.name, input }` a real command carries, and the SDK is never loaded.
 */
const fakeCommands = {
  GetCostAndUsageCommand: class GetCostAndUsageCommand { constructor(input) { this.input = input; } },
  GetCostForecastCommand: class GetCostForecastCommand { constructor(input) { this.input = input; } },
};
