/**
 * The GCP billing export in BigQuery (`csarko-sh.billing`, the standard usage cost export,
 * on since 2026-10-29): three saved SQL files under `queries/finance-*.sql`, each one job,
 * cached five minutes, the table name rewritten to the configured dataset and table as the
 * visits runner does for its own. Read live on a request: BigQuery stays inside its free tier
 * for a table of kilobytes a day. Rows come back plain (`day` and `month` are strings from
 * FORMAT_DATE, `net` and `amount` numbers); `finance/rows.mjs` shapes them.
 *
 * Net cost is `cost` plus the sum of `credits[].amount` (credits are negative). Days are the
 * export's `usage_start_time` in UTC.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { UpstreamError } from "../http.mjs";
import { plainRow } from "./visits.mjs";
import { addDays, isoDate } from "../time.mjs";

/** The table name the SQL files are written against, rewritten at run time. */
export const EXPORT_TABLE = /`csarko-sh\.billing\.gcp_billing_export_v1_013AA0_554DB9_BBF90D`/g;
export const DAILY_DAYS = 60;
export const MONTHLY_MONTHS = 13;

export function createGcpBilling({ bigquery, projectId, dataset, table, cache, now = Date.now, ttlMs = 300_000, queriesDir = join(process.cwd(), "queries") }) {
  const configured = Boolean(bigquery && dataset && table);
  const sqlOf = (name) => readFileSync(join(queriesDir, `${name}.sql`), "utf8").replace(EXPORT_TABLE, `\`${projectId}.${dataset}.${table}\``);

  function run(name, params) {
    return cache.get(`finance:${name}:${JSON.stringify(params)}`, ttlMs, async () => {
      try {
        const [rows] = await bigquery.query({ query: sqlOf(name), params, useLegacySql: false });
        return rows.map(plainRow);
      } catch (error) {
        throw new UpstreamError(`BigQuery ${name} failed: ${error?.message ?? error}`, { cause: error });
      }
    });
  }

  return {
    get configured() {
      return configured;
    },
    /** The last `days` days by day, project, service and SKU: `{ day, project, service, sku, unit, net, amount }`. */
    daily(days = DAILY_DAYS) {
      const today = isoDate(now());
      return run("finance-daily", { start: addDays(today, -(days - 1)), end: addDays(today, 1) });
    },
    /** The last `months` months by month, project, service and SKU: `{ month, project, service, sku, unit, net, amount }`. */
    monthly(months = MONTHLY_MONTHS) {
      const today = isoDate(now());
      const [y, m] = today.split("-").map(Number);
      const start = new Date(Date.UTC(y, m - 1 - (months - 1), 1)).toISOString().slice(0, 10);
      return run("finance-monthly", { start, end: addDays(today, 1) });
    },
    /** The latest usage day present in the last `days` days, or null when the export has none. */
    async lastDay(days = DAILY_DAYS) {
      const today = isoDate(now());
      const rows = await run("finance-last-day", { start: addDays(today, -(days - 1)) });
      const day = rows[0]?.day;
      return typeof day === "string" && day !== "" ? day : null;
    },
  };
}
