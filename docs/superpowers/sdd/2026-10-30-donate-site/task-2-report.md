# Task 2 report: the Stripe writer

Implemented admin/api/src/collectors/stripe-write.mjs (createStripeWriter, shape of collectors/stripe.mjs) and admin/api/test/stripe-write.test.mjs (brief's tests verbatim).

RED: `node --test test/stripe-write.test.mjs` -> ERR_MODULE_NOT_FOUND, stripe-write.mjs (expected, not yet written); pass 0 fail 1.
GREEN: same command -> pass 4 fail 0. `npm test` in admin/api -> pass 205 fail 0.

Notes: the factory's `key` is renamed `apiKey` internally since each method also takes an idempotency `key`. Errors are also sent to log.error. No em-dash, no email/phone. Nothing outside the two files touched.
