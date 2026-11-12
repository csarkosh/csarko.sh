/**
 * The ledger: daily snapshots and the hand-entered series, in Firestore.
 *
 *   snapshots/<YYYY-MM-DD>   one document a day, merged; about 500 KB since the finance part (2026-10-30)
 *   manual/<key>             { series: [{ at, value }] } newest last, capped
 *   financeViews/<range>     the Billing page's answers for one range, precomputed (finance-views.mjs)
 *
 * A snapshot is mostly the day's Cost Explorer rows, so a read of a run of them names the fields
 * it needs (`fields`, Firestore's projection) and the latest is found by its id before its one
 * document is read: nine finance queries reading 30 whole documents each took the service past
 * its memory on 2026-11-04 (about 74 MiB a query, measured 2026-11-11).
 *
 * The trend on the index reads the last 84 days of snapshots (84 reads of a
 * 50,000 a day free quota); the snapshot job writes one document a day. The
 * store is an interface so the queries are tested against the in-memory one
 * and the Firestore one stays a thin mapping. Reads fail soft (an empty
 * list and a log line): a page with no sparklines beats a 500; writes throw,
 * since a snapshot that was not written must not report that it was.
 */

export const SNAPSHOTS = "snapshots";
export const MANUAL = "manual";
export const MANUAL_CAP = 400;
export const FINANCE_VIEWS = "financeViews";

/** `doc` with only the dotted `fields` kept (Firestore's projection), every field when there are none. */
export function projectFields(doc, fields) {
  if (!Array.isArray(fields) || fields.length === 0) return doc;
  const out = {};
  for (const path of fields) {
    const keys = path.split(".");
    let from = doc;
    for (const k of keys) from = from !== null && typeof from === "object" ? from[k] : undefined;
    if (from === undefined) continue;
    let to = out;
    for (const k of keys.slice(0, -1)) to = to[k] ??= {};
    to[keys.at(-1)] = from;
  }
  return out;
}

export function createMemoryStore() {
  const snapshots = new Map();
  const manual = new Map();
  const views = new Map();
  return {
    async listSnapshots(fromDate, toDate, { fields } = {}) {
      return [...snapshots.entries()]
        .filter(([date]) => date >= fromDate && date <= toDate)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, data]) => ({ date, ...projectFields(structuredClone(data), fields) }));
    },
    async latestSnapshot() {
      const dates = [...snapshots.keys()].sort();
      const date = dates.at(-1);
      return date === undefined ? null : { date, ...snapshots.get(date) };
    },
    async writeSnapshot(date, data) {
      const merged = { ...(snapshots.get(date) ?? {}), ...data };
      snapshots.set(date, merged);
      return { date, ...merged };
    },
    async getManual(key) {
      return [...(manual.get(key) ?? [])];
    },
    async appendManual(key, point, cap = MANUAL_CAP) {
      const series = [...(manual.get(key) ?? []), point].slice(-cap);
      manual.set(key, series);
    },
    async writeViews(entries) {
      for (const [id, data] of Object.entries(entries)) views.set(id, structuredClone(data));
    },
    async getView(id) {
      return views.has(id) ? structuredClone(views.get(id)) : null;
    },
  };
}

export async function createFirestoreStore({ projectId, log = console } = {}) {
  const { Firestore, FieldPath } = await import("@google-cloud/firestore");
  const db = new Firestore(projectId ? { projectId } : {});

  const soft = async (what, fn, fallback) => {
    try {
      return await fn();
    } catch (error) {
      log.error(`firestore: ${what} failed`, error);
      return fallback;
    }
  };

  return {
    listSnapshots(fromDate, toDate, { fields } = {}) {
      return soft("listSnapshots", async () => {
        // A range filter on the document id asks Firestore for a composite
        // index (seen on the first deploy, 2026-10-13); a cursor on the id
        // needs none. Ids are UTC dates, so string order is date order.
        let q = db.collection(SNAPSHOTS)
          .orderBy(FieldPath.documentId())
          .startAt(fromDate)
          .endAt(toDate);
        if (Array.isArray(fields) && fields.length > 0) q = q.select(...fields);
        const snap = await q.get();
        return snap.docs.map((d) => ({ date: d.id, ...d.data() }));
      }, []);
    },
    latestSnapshot() {
      return soft("latestSnapshot", async () => {
        // Ordering by the document id descending also asks for a composite
        // index (it failed on every read until 2026-10-13, and the health
        // card then ran Lighthouse live, 30 s a request, as if there were no
        // snapshot yet). Ascending with a cursor needs none: read the last
        // month's worth, newest last, and take the last. The job writes one
        // a day, so a month with none means the scheduler is broken, and the
        // card then falls back as it would on day one. The month is read as
        // ids alone (an empty projection, 131 ms) and only the newest document
        // whole: read whole, the month was 30 documents of 500 KB (1.1 s).
        const from = new Date(Date.now() - 31 * 86_400_000).toISOString().slice(0, 10);
        const ids = await db.collection(SNAPSHOTS).orderBy(FieldPath.documentId()).startAt(from).select().get();
        const last = ids.docs.at(-1);
        if (last === undefined) return null;
        const d = await last.ref.get();
        return d.exists ? { date: d.id, ...d.data() } : null;
      }, null);
    },
    async writeSnapshot(date, data) {
      const ref = db.collection(SNAPSHOTS).doc(date);
      // Merged at the top level only, as the memory store's spread is: each part named in
      // `data` replaces the stored one whole. `{ merge: true }` merged nested maps too, so a
      // day's second run kept the first run's `finance.errors.aws` beside the rows that had
      // since succeeded (2026-10-30), and the page showed an error for a source that was fine.
      await ref.set(data, { mergeFields: Object.keys(data).map((key) => new FieldPath(key)) });
      const written = await ref.get();
      return { date, ...written.data() };
    },
    getManual(key) {
      return soft(`getManual ${key}`, async () => {
        const d = await db.collection(MANUAL).doc(key).get();
        const series = d.data()?.series;
        return Array.isArray(series) ? series : [];
      }, []);
    },
    async appendManual(key, point, cap = MANUAL_CAP) {
      const ref = db.collection(MANUAL).doc(key);
      await db.runTransaction(async (tx) => {
        const d = await tx.get(ref);
        const series = Array.isArray(d.data()?.series) ? d.data().series : [];
        tx.set(ref, { series: [...series, point].slice(-cap) });
      });
    },
    /** Writes `{ <id>: data }` to `financeViews/<id>`, each document replaced whole, in one batch. */
    async writeViews(entries) {
      const batch = db.batch();
      for (const [id, data] of Object.entries(entries)) batch.set(db.collection(FINANCE_VIEWS).doc(id), data);
      await batch.commit();
    },
    getView(id) {
      return soft(`getView ${id}`, async () => {
        const d = await db.collection(FINANCE_VIEWS).doc(id).get();
        return d.exists ? d.data() : null;
      }, null);
    },
  };
}
