/**
 * The public prices object, `prices.json` in the bucket `PRICES_BUCKET`: the one file the donate
 * site's pages read to show the current period's three prices and to find each door's payment links,
 * so the site never talks to Stripe itself. The weekly step reads it to know what is already
 * published and writes the next one; it is written with Cache-Control no-cache, so a new period's prices show at
 * once and a cached copy never lacks its CORS header. The Storage SDK is imported when first needed, so the tests, which inject a fake
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
    /** Replaces the object with `json`, public-readable by the bucket's own policy, never served from cache (no-cache, so GCS always applies the bucket's CORS). */
    async write(json) {
      try {
        await (await file()).save(JSON.stringify(json, null, 1), {
          contentType: "application/json",
          metadata: { cacheControl: "no-cache" },
        });
      } catch (error) {
        log.error?.(`donate: writing gs://${name}/${PRICES_OBJECT} failed`, error);
        throw error;
      }
    },
  };
}
