### Task 12: October's GCP history, only if the export does not fill it

The export already backfills: on 2026-10-30 it held August in full and September to the 25th, nothing of October yet. This task exists in case October 1 to 28 never arrives.

**Files:**
- Modify: `_infra/modules/gcp-admin-api/main.tf` (`google_bigquery_table.billing_history`)
- Modify: `admin/api/queries/finance-monthly.sql`, `admin/api/queries/finance-first-day.sql` (`UNION ALL` the history table)
- Modify: `admin/api/src/collectors/gcp-billing.mjs` (`HISTORY_TABLE` marker rewritten like `EXPORT_TABLE`)
- Create: `tools/gcp-history-load.py`
- Test: `admin/api/test/gcp-billing.test.mjs`

**Interfaces:**
- The table `csarko-sh.billing.history`: `month STRING, project STRING, service STRING, sku STRING, unit STRING, net FLOAT64, amount FLOAT64, loaded_at TIMESTAMP`, `deletion_protection = true`.
- `finance-monthly.sql` becomes the export's query `UNION ALL SELECT month, project, service, sku, unit, net, amount FROM \`csarko-sh.billing.history\` WHERE month >= FORMAT_DATE('%Y-%m', DATE(@start)) AND month < FORMAT_DATE('%Y-%m', DATE(@end))`, wrapped so the outer `ORDER BY` still applies; `finance-first-day.sql` takes the `MIN` over the export's first day and `MIN(DATE(month || '-01'))` from history.
- `tools/gcp-history-load.py --csv <file> --month 2026-10 --through 28`: reads the console's Cost table CSV (downloaded with the date range set to Oct 1 to Oct 28, grouped by SKU), maps columns by header name through one `COLUMNS` dict at the top (`project`, `service`, `sku`, `unit`, `amount`, `cost`, `credits`), **prints the header and stops** if a needed column is missing, computes `net = cost + credits` per row, refuses to run if `bq query` shows the export already has rows for that month on or before `--through`, and loads with `bq load --source_format=NEWLINE_DELIMITED_JSON csarko-sh:billing.history <ndjson>`. Runs with Cyrus's `gcloud` login; never in the image.

- [ ] **Step 1: On Nov 1 or later, check whether the task is needed**

Run: `bq query --project_id=csarko-sh --use_legacy_sql=false 'SELECT MIN(DATE(usage_start_time)) first_day, MAX(DATE(usage_start_time)) last_day FROM \`csarko-sh.billing.gcp_billing_export_v1_013AA0_554DB9_BBF90D\` WHERE DATE(usage_start_time) BETWEEN "2026-10-01" AND "2026-10-31"'`
If `first_day` is `2026-10-01`, **skip the rest of this task** and note it in the ledger. Otherwise continue.

- [ ] **Step 2: Write the failing test**: in `gcp-billing.test.mjs`, assert `sqlOf`'s output for `finance-monthly` contains `\`csarko-sh.billing.history\`` rewritten to `\`${projectId}.${dataset}.history\`` and no literal `csarko-sh.billing.` remains.

- [ ] **Step 3: Terraform the table (plan: one add, nothing else), edit the two SQL files and the collector, run the tests, deploy the API**

- [ ] **Step 4: Cyrus downloads the CSV** (Billing, Reports, Cost table, date range Oct 1 to Oct 28, group by SKU, Download CSV) to `~/Downloads/`; run `python3 -I tools/gcp-history-load.py --csv ~/Downloads/<file>.csv --month 2026-10 --through 28`; confirm on the Finance page that October's Google Cloud column now reads the full month.

- [ ] **Step 5: Commit**

```bash
git add _infra admin/api tools/gcp-history-load.py
git commit -m "finance: a history table for the months the GCP export does not hold"
```

---

