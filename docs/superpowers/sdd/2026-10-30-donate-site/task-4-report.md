# Task 4 report

Implemented per brief: config `donate` block; server builds the step (writer, prices bucket) and passes `donate`, two new unconfigured hints; `finance-queries.mjs` gets `donate` option, SOURCE_ENV/LABELS entries, hoisted `loaded`, `failed`, the `part(...)` run, `finance.donate` carried forward, `byDoor` and `prices` on `income` (null when Stripe is off or refuses); `stripe.mjs` sends `expand[]=data.source` on balance transactions only; `income.mjs` adds `door` and `incomeByDoor`; CONTRACT.md and README.md updated.

TDD: RED after writing tests (`npm test`): 7 failures (the new tests plus the stripe param assertions). GREEN after implementing and adjusting existing exact-shape assertions: `npm test` pass 226, fail 0.

Fixture: charge and payment transactions carry `source: { object: "charge", metadata: { door } }` (arkos, all, one `{}`); refund and payout keep plain ids; no identity fields.

Existing tests adjusted for the new shapes: SOURCE_ENV, snapshot call list and `finance.donate`, `byDoor`/`prices` null in the refused and not-configured income answers, `door` on donation rows, stripe params include expand[].

Concerns:
- The brief's first donate test expects `failed` to be `gcp`, but with an empty store Modal also reads as failed (no report), so `failed` is `gcp|modal`; I assert that string instead.
- `config.donate.url` (DONATE_URL) is read but unused: the step builds links from the DONATE_URL constant in doors.mjs. README says so.
- `step.configured` needs both write key and bucket, so a missing bucket alone shows `notConfigured.donate = "STRIPE_WRITE_KEY"`.
- The existing donate-prices test file contains a literal em-dash in a regex (pre-existing, not mine).
