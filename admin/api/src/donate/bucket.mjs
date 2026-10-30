/**
 * The public prices object, `prices.json` in the bucket `PRICES_BUCKET`: the one file the donate
 * site's pages read to show this month's four prices and to find each door's payment links, so the
 * site never talks to Stripe itself. The monthly step reads it to know what is already published
 * and writes the next one; it is cached five minutes, which is how long a new month's prices can
 * take to show. The Storage SDK is imported when first needed, so the tests, which inject a fake
 * `storage`, never load it. A missing object reads as null (nothing published yet); any other
 * failure throws. Not configured without a bucket name.
 */

import { PRICES_OBJECT } from "./doors.mjs";

export function createPricesBucket({ bucket, projectId = null, storage = null, log = console }) {
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
  const file = async () => (await getStorage()).bucket(name).file(PRICES_OBJECT);

  return {
    get configured() {
      return configured;
    },
    /** The published JSON, or null when the object does not exist. */
    async read() {
      try {
        const [buffer] = await (await file()).download();
        return JSON.parse(buffer.toString("utf8"));
      } catch (error) {
        if (error?.code === 404) return null;
        log.error?.(`donate: reading gs://${name}/${PRICES_OBJECT} failed`, error);
        throw error;
      }
    },
    /** Replaces the object with `json`, public-readable by the bucket's own policy, cached five minutes. */
    async write(json) {
      await (await file()).save(JSON.stringify(json, null, 1), {
        contentType: "application/json",
        metadata: { cacheControl: "public, max-age=300" },
      });
    },
  };
}
