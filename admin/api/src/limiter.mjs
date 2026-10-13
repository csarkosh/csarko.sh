/**
 * Per-address rate limiting, the game server's `PostLimiter` in plain JS.
 *
 * One token bucket an address: the page loads eight cards and a few more on
 * a range change, so a burst of 60 and one a second back is generous for a
 * person and far too little for anyone guessing a 256-bit token. The table
 * is bounded because its key is a header the sender controls; once it is
 * full, unknown addresses go untracked rather than unserved, since a process
 * that runs out of memory serves nobody.
 */

export class TokenBucket {
  #tokens;
  #lastRefill;
  #capacity;
  #refillPerSecond;
  #now;

  constructor(capacity, refillPerSecond, now = Date.now) {
    this.#capacity = capacity;
    this.#refillPerSecond = refillPerSecond;
    this.#now = now;
    // Starting full is what makes the capacity a burst allowance.
    this.#tokens = capacity;
    this.#lastRefill = now();
  }

  get available() {
    return this.#tokens;
  }

  tryConsume() {
    const now = this.#now();
    const elapsedMs = now - this.#lastRefill;
    // A clock that goes backwards must not mint tokens.
    if (elapsedMs > 0) {
      this.#tokens = Math.min(this.#capacity, this.#tokens + (elapsedMs / 1000) * this.#refillPerSecond);
      this.#lastRefill = now;
    }
    if (this.#tokens < 1) return false;
    this.#tokens -= 1;
    return true;
  }
}

export class IpLimiter {
  #entries = new Map();
  #capacity;
  #refillPerSecond;
  #maxTrackedIps;
  #idleMs;
  #now;

  constructor({ capacity = 60, refillPerSecond = 1, maxTrackedIps = 4096, idleMs = 120_000, now = Date.now } = {}) {
    this.#capacity = capacity;
    this.#refillPerSecond = refillPerSecond;
    this.#maxTrackedIps = maxTrackedIps;
    this.#idleMs = idleMs;
    this.#now = now;
  }

  get tracked() {
    return this.#entries.size;
  }

  /** Whether `ip` may make one more request now. */
  allow(ip) {
    const now = this.#now();
    let entry = this.#entries.get(ip);
    if (entry === undefined) {
      if (this.#entries.size >= this.#maxTrackedIps) return true;
      entry = { bucket: new TokenBucket(this.#capacity, this.#refillPerSecond, this.#now), lastSeen: now };
      this.#entries.set(ip, entry);
    }
    entry.lastSeen = now;
    return entry.bucket.tryConsume();
  }

  /** Drops addresses not heard from within `idleMs`, which is what returns the table's memory. */
  prune() {
    const now = this.#now();
    for (const [ip, entry] of this.#entries) {
      if (now - entry.lastSeen >= this.#idleMs) this.#entries.delete(ip);
    }
  }
}

/**
 * The caller's address, as well as it can be known. On Cloud Run every
 * connection arrives from Google's frontend, so `remoteAddress` is one value
 * for everyone and `X-Forwarded-For`'s leftmost entry is the only thing that
 * tells callers apart. It is forgeable, which is why the limiter above is a
 * filter for abuse and not a security boundary; the token is the boundary.
 */
export function clientIpOf(forwardedFor, remoteAddress) {
  const header = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  const first = header?.split(",")[0]?.trim();
  if (first !== undefined && first !== "") return first;
  return remoteAddress ?? "unknown";
}
