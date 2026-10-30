/**
 * The ledger: daily snapshots and the hand-entered series, in Firestore.
 *
 *   snapshots/<YYYY-MM-DD>   one document a day, merged, a few KB
 *   manual/<key>             { series: [{ at, value }] } newest last, capped
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

export function createMemoryStore() {
  const snapshots = new Map();
  const manual = new Map();
  return {
    async listSnapshots(fromDate, toDate) {
      return [...snapshots.entries()]
        .filter(([date]) => date >= fromDate && date <= toDate)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, data]) => ({ date, ...data }));
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
    listSnapshots(fromDate, toDate) {
      return soft("listSnapshots", async () => {
        // A range filter on the document id asks Firestore for a composite
        // index (seen on the first deploy, 2026-10-13); a cursor on the id
        // needs none. Ids are UTC dates, so string order is date order.
        const snap = await db.collection(SNAPSHOTS)
          .orderBy(FieldPath.documentId())
          .startAt(fromDate)
          .endAt(toDate)
          .get();
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
        // card then falls back as it would on day one.
        const from = new Date(Date.now() - 31 * 86_400_000).toISOString().slice(0, 10);
        const snap = await db.collection(SNAPSHOTS).orderBy(FieldPath.documentId()).startAt(from).get();
        const d = snap.docs.at(-1);
        return d === undefined ? null : { date: d.id, ...d.data() };
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
  };
}
