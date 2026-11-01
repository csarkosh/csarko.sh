# Task A: never price a month before the launch month

Changed: DONATE_FROM_MONTH = "2026-10" exported from src/donate/doors.mjs; decide() in src/donate/prices.mjs takes fromMonth (default that constant) and returns run:false, reason "before the first priced month" right after the done check. README and spec section 3 each name the constant.
RED (tests first): 2 failed (decide test, step test), 227 passed.
GREEN: npm test, 229 pass, 0 fail.
Files: admin/api/src/donate/doors.mjs, prices.mjs, admin/api/test/donate-prices.test.mjs, donate-step.test.mjs, admin/api/README.md, docs/superpowers/specs/2026-10-30-donate-site-design.md
