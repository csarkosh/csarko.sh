import { test } from "node:test";
import assert from "node:assert/strict";
import { TokenBucket, IpLimiter, clientIpOf } from "../src/limiter.mjs";

test("a token bucket starts full, refills over time and never past capacity", () => {
  let t = 0;
  const bucket = new TokenBucket(3, 1, () => t);
  assert.equal(bucket.tryConsume(), true);
  assert.equal(bucket.tryConsume(), true);
  assert.equal(bucket.tryConsume(), true);
  assert.equal(bucket.tryConsume(), false, "burst spent");
  t = 500;
  assert.equal(bucket.tryConsume(), false, "half a token is not a token");
  t = 1000;
  assert.equal(bucket.tryConsume(), true, "one second earns one");
  t = 100_000;
  assert.equal(bucket.available, 0);
  bucket.tryConsume();
  assert.equal(bucket.available, 2, "capped at capacity before the spend");
  t = 50_000;
  assert.equal(bucket.tryConsume(), true, "a clock going backwards spends but does not mint");
  assert.equal(bucket.available, 1);
});

test("the per-address limiter keys on the address, admits untracked past the table cap and prunes idle entries", () => {
  let t = 0;
  const limiter = new IpLimiter({ capacity: 2, refillPerSecond: 1, maxTrackedIps: 2, idleMs: 1000, now: () => t });
  assert.equal(limiter.allow("a"), true);
  assert.equal(limiter.allow("a"), true);
  assert.equal(limiter.allow("a"), false);
  assert.equal(limiter.allow("b"), true, "another address has its own bucket");
  assert.equal(limiter.tracked, 2);
  assert.equal(limiter.allow("c"), true, "table full: admitted untracked");
  assert.equal(limiter.allow("c"), true);
  assert.equal(limiter.allow("c"), true);
  assert.equal(limiter.tracked, 2);
  t = 2000;
  limiter.prune();
  assert.equal(limiter.tracked, 0);
  assert.equal(limiter.allow("a"), true, "fresh bucket after the prune");
});

test("clientIpOf prefers the leftmost forwarded address", () => {
  assert.equal(clientIpOf("1.2.3.4, 10.0.0.1", "127.0.0.1"), "1.2.3.4");
  assert.equal(clientIpOf(["5.6.7.8"], "127.0.0.1"), "5.6.7.8");
  assert.equal(clientIpOf(undefined, "127.0.0.1"), "127.0.0.1");
  assert.equal(clientIpOf("", undefined), "unknown");
});
