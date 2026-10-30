/**
 * The film ledgers in the private bucket `FILM_LEDGERS_BUCKET` (`csarko-sh-film-ledgers`): the
 * pipeline's `tools/cinema/ledger-sync.sh` copies every `<film>/ledger.json` there, and this
 * reads them all with the service account (`roles/storage.objectViewer` on the bucket), cached
 * five minutes. A ledger is the array of priced rows `{ what, model, gpu, seconds, usd, note }`;
 * some may be an object `{ rows, budget_usd }` instead, and both are taken. The SDK is imported
 * when first needed, so the tests, which inject a fake `storage`, never load it. Not configured
 * without a bucket name.
 */

export const LEDGER_GLOB = "*/ledger.json";

export function createLedgers({ bucket, projectId = null, cache, ttlMs = 300_000, storage = null, log = console }) {
  const name = typeof bucket === "string" ? bucket.replace(/^gs:\/\//, "").replace(/\/+$/, "") : "";
  const configured = name !== "";
  let storagePromise = null;

  const getStorage = () => {
    if (storage !== null) return Promise.resolve(storage);
    storagePromise ??= import("@google-cloud/storage").then(({ Storage }) => new Storage(projectId ? { projectId } : {})).catch((error) => {
      storagePromise = null;
      throw error;
    });
    return storagePromise;
  };

  return {
    get configured() {
      return configured;
    },
    bucket: configured ? name : null,
    /**
     * Every ledger in the bucket: `[{ slug, rows, budgetUsd, updated }]`, `slug` the folder, `updated`
     * the object's update time (ISO), sorted by slug. A ledger that is not JSON is skipped and logged.
     */
    list() {
      return cache.get(`ledgers:${name}`, ttlMs, async () => {
        const s = await getStorage();
        let files;
        try {
          [files] = await s.bucket(name).getFiles({ matchGlob: LEDGER_GLOB });
        } catch (error) {
          throw new Error(`ledgers: listing gs://${name} failed: ${error?.message ?? error}`, { cause: error });
        }
        const out = [];
        for (const file of files ?? []) {
          const slug = slugOf(file.name);
          if (slug === null) continue;
          try {
            const [buffer] = await file.download();
            const parsed = parseLedger(buffer.toString("utf8"));
            if (parsed === null) throw new Error("not a ledger: neither an array of rows nor { rows }");
            out.push({ slug, rows: parsed.rows, budgetUsd: parsed.budgetUsd, updated: updatedOf(file.metadata) });
          } catch (error) {
            log.error(`admin: ledger ${file.name} skipped`, error);
          }
        }
        return out.sort((a, b) => a.slug.localeCompare(b.slug));
      });
    },
  };
}

/* ---- pure mappings ---- */

/** The film slug of an object name `<film>/ledger.json`; null for anything else. */
export function slugOf(objectName) {
  const m = /^([^/]+)\/ledger\.json$/.exec(String(objectName ?? ""));
  return m ? m[1] : null;
}

/** The object's update time as ISO, or null. */
function updatedOf(metadata) {
  const raw = metadata?.updated ?? metadata?.timeCreated ?? null;
  if (typeof raw !== "string") return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? new Date(t).toISOString().replace(".000Z", "Z") : null;
}

/**
 * A ledger's text or parsed value as `{ rows, budgetUsd }`: an array is the rows with no budget;
 * an object with `rows` carries `budget_usd` (or `budgetUsd`) when it has one. Anything else is null.
 */
export function parseLedger(input) {
  let value = input;
  if (typeof input === "string") {
    try {
      value = JSON.parse(input);
    } catch {
      return null;
    }
  }
  if (Array.isArray(value)) return { rows: value.filter((r) => r && typeof r === "object"), budgetUsd: null };
  if (value && typeof value === "object" && Array.isArray(value.rows)) {
    const budget = Number(value.budget_usd ?? value.budgetUsd);
    return { rows: value.rows.filter((r) => r && typeof r === "object"), budgetUsd: Number.isFinite(budget) && budget > 0 ? budget : null };
  }
  return null;
}
