### Task 1: Doors, tiers and prices (pure)

**Files:**
- Create: `admin/api/src/donate/doors.mjs`
- Create: `admin/api/src/donate/prices.mjs`
- Modify: `admin/api/src/finance/projects.mjs:19-24` (the `commercial` key)
- Test: `admin/api/test/donate-prices.test.mjs`
- Modify: `admin/api/test/finance.test.mjs` (the projects tests that pin `PROJECT_KEYS`)

**Interfaces:**
- Consumes: `projectOf(row)`, `cents`, `monthOf`, `addMonths` from `admin/api/src/finance/`.
- Produces (`doors.mjs`):
  - `DONATE_URL = "https://donate.csarko.sh"`, `PRICES_BUCKET = "csarko-sh-donate-prices"`, `PRICES_OBJECT = "prices.json"`, `PRICES_URL = "https://storage.googleapis.com/csarko-sh-donate-prices/prices.json"`.
  - `TIERS: [{ key, name, share }]` in order `prompt` 0.01, `context` 0.03, `run` 0.10, `finetune` 0.30; `CUSTOM = { key: "own", name: "Your own number", minimumUsd: 1 }`; `TIER_KEYS = ["prompt","context","run","finetune","own"]`.
  - `DOORS: [{ door, slug, name, kind, shipped, path, headline, lead, captions: [4 strings], thanks, back: { label, href }, picture: { source, dark?, focusY? } }]` for the seven doors. `path` is `/` for `all`, else `/${door}`. `picture.source` is relative to `.agents/skills/site-quality/assets/` (`apps/ide-arkos.png`, `apps/app-macstats.png`, `apps/lib-visits.png` with `dark: "apps/lib-visits-dark.png"`, `films/the-last-trail.jpg` with `focusY: 0.3`, `films/who-is-standing-in-my-hallway.jpg` with a `focusY` the builder picks, `donate/body-of-work.png` for `all`, `null` for `dayhike`). `shipped` is `true` for all but `dayhike`. The Arkos `lead`, its four captions and its `thanks` are the spec's sentences verbatim; the films' captions are the spec's; the other copy is the builder's, in the same register.
  - `doorOf(slug)` → the door whose `slug` matches, else `null`; `doorByKey(door)` → by `door`, else `null`; `shippedDoors()`.
- Produces (`prices.mjs`):
  - `PRICE_DAY = 3`, `LATE_DAY = 7`, `FLOOR_USD = 1`.
  - `poolOf(monthlyRows, month): number` the unrounded sum of `amount` over rows with `r.month === month` and `projectOf(r) !== "commercial"`, never below 0.
  - `priceOf(pool, share): number` = `Math.max(FLOOR_USD, Math.ceil(pool * share - 1e-9))`.
  - `pricesOf(pool): [{ tier, name, share, label, usd }]` over `TIERS`, `label` = `about ${Math.round(share * 100)}%`.
  - `decide({ today, current, failed, doors }): { run: boolean, reason: string, month: string, newMonth: boolean, pending: string[] }` where `month = addMonths(monthOf(today), -1)`, `current` is the published JSON or `null`, `failed` the provider keys whose collector failed today, `doors` the shipped door keys. Rules, in order: if `current?.month === month` and every door is in `current.doors` → `run: false, reason: "done"`; if day of month `< PRICE_DAY` → `run: false, reason: "before the 3rd"`; if `failed.length > 0` and day `< LATE_DAY` → `run: false, reason: "waiting on ${failed.join(", ")}"`; else `run: true`, `newMonth = current?.month !== month`, `pending` = all doors when `newMonth`, else the doors missing from `current.doors`.

- [ ] **Step 1: Write the failing tests**

```js
// admin/api/test/donate-prices.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { TIERS, CUSTOM, TIER_KEYS, DOORS, doorOf, doorByKey, shippedDoors, DONATE_URL, PRICES_URL } from "../src/donate/doors.mjs";
import { poolOf, priceOf, pricesOf, decide, PRICE_DAY, LATE_DAY } from "../src/donate/prices.mjs";

test("four tiers at 1, 3, 10 and 30 percent, then the custom row", () => {
  assert.deepEqual(TIERS.map((t) => [t.key, t.name, t.share]), [["prompt", "A prompt", 0.01], ["context", "A long context window", 0.03], ["run", "A whole agent run", 0.1], ["finetune", "A fine-tune", 0.3]]);
  assert.deepEqual(CUSTOM, { key: "own", name: "Your own number", minimumUsd: 1 });
  assert.deepEqual(TIER_KEYS, ["prompt", "context", "run", "finetune", "own"]);
});

test("a $287.40 month gives $3, $9, $29 and $87, labelled about n%", () => {
  assert.deepEqual(pricesOf(287.4).map((p) => [p.tier, p.usd, p.label]), [["prompt", 3, "about 1%"], ["context", 9, "about 3%"], ["run", 29, "about 10%"], ["finetune", 87, "about 30%"]]);
  assert.equal(priceOf(300, 0.01), 3, "an exact dollar is not rounded up to the next");
  assert.equal(priceOf(0, 0.3), 1, "the floor");
});

test("the pool is last month's rows less the commercial project, never negative", () => {
  const rows = [
    { month: "2026-10", provider: "aws", line: "BoxUsage:g4dn.xlarge", amount: 200 },
    { month: "2026-10", provider: "gcp", where: "csarko-sh", service: "Cloud Run", amount: 87.4 },
    { month: "2026-09", provider: "aws", line: "BoxUsage:g4dn.xlarge", amount: 999 },
    { month: "2026-10", provider: "gcp", where: "magicpixel-487014", service: "Compute Engine", amount: 50, project: "commercial" },
  ];
  assert.equal(poolOf(rows, "2026-10"), 287.4);
  assert.equal(poolOf([{ month: "2026-10", provider: "gcp", where: "csarko-sh", amount: -12 }], "2026-10"), 0);
  assert.deepEqual(pricesOf(0).map((p) => p.usd), [1, 1, 1, 1]);
});

test("the doors: seven, their URLs and sources, Day Hike not shipped", () => {
  assert.deepEqual(DOORS.map((d) => [d.door, d.slug, d.path]), [
    ["arkos", "ide-arkos", "/arkos"], ["macstats", "app-macstats", "/macstats"], ["visits", "lib-visits", "/visits"],
    ["last-trail", "the-last-trail", "/last-trail"], ["hallway", "who-is-standing-in-my-hallway", "/hallway"], ["all", null, "/"], ["dayhike", "day-hike", "/dayhike"],
  ]);
  assert.deepEqual(shippedDoors().map((d) => d.door), ["arkos", "macstats", "visits", "last-trail", "hallway", "all"]);
  assert.equal(doorOf("ide-arkos").door, "arkos");
  assert.equal(doorOf("nope"), null);
  assert.equal(doorByKey("all").picture.source, "donate/body-of-work.png");
  assert.equal(doorByKey("last-trail").picture.focusY, 0.3);
  assert.equal(doorByKey("dayhike").picture, null);
  for (const d of DOORS) {
    assert.equal(d.captions.length, 4, d.door);
    assert.ok(d.headline && d.lead && d.thanks && d.back.label && d.back.href.startsWith("https://"), d.door);
    assert.ok(!/—|@/.test(JSON.stringify(d)), `${d.door}: no em-dash, no address`);
  }
  assert.equal(doorByKey("arkos").lead, "Arkos is free. If it saved you a few hours, cover a slice of the cloud bill that builds it and everything else here.");
  assert.equal(DONATE_URL, "https://donate.csarko.sh");
  assert.equal(PRICES_URL, "https://storage.googleapis.com/csarko-sh-donate-prices/prices.json");
});

test("decide: done, before the 3rd, waiting on a provider until the 7th, a new month, a door added mid-month", () => {
  const doors = ["arkos", "all"];
  const oct = { month: "2026-10", doors: ["arkos", "all"] };
  assert.deepEqual(decide({ today: "2026-11-05", current: oct, failed: [], doors }), { run: false, reason: "done", month: "2026-10", newMonth: false, pending: [] });
  assert.equal(decide({ today: "2026-11-02", current: null, failed: [], doors }).reason, "before the 3rd");
  assert.equal(decide({ today: "2026-11-03", current: null, failed: ["aws"], doors }).reason, "waiting on aws");
  assert.equal(decide({ today: "2026-11-07", current: null, failed: ["aws"], doors }).run, true, "from the 7th it runs with what is there");
  assert.deepEqual(decide({ today: "2026-11-03", current: { month: "2026-09", doors }, failed: [], doors }), { run: true, reason: "new month", month: "2026-10", newMonth: true, pending: doors });
  assert.deepEqual(decide({ today: "2026-11-12", current: { month: "2026-10", doors: ["arkos"] }, failed: [], doors: ["arkos", "all", "dayhike"] }), { run: true, reason: "doors added", month: "2026-10", newMonth: false, pending: ["all", "dayhike"] });
  assert.equal(PRICE_DAY, 3);
  assert.equal(LATE_DAY, 7);
});
```

In `finance.test.mjs`, change the projects assertion to `assert.deepEqual(PROJECT_KEYS, ["films", "dayhike", "site", "commercial", "other"])` and add `assert.equal(projectOf({ provider: "gcp", where: "magicpixel-487014" }), "other", "nothing is routed to commercial yet")`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd admin/api && node --test test/donate-prices.test.mjs test/finance.test.mjs`
Expected: FAIL, `Cannot find module .../donate/doors.mjs`, and the `PROJECT_KEYS` assertion.

- [ ] **Step 3: Add `{ key: "commercial", label: "Commercial" }` to `PROJECTS` in `projects.mjs`, between `site` and `other`, with the comment that no rule routes to it yet**

`projectsTable` needs no change: it iterates `PROJECT_KEYS`. The Finance page's palette has four project tones (`--proj-1` to `--proj-4`); add `--proj-5` to both `admin:palette` blocks in `admin/public/theme.css` for the fifth row (a tone the dataviz validator passes at 3:1 against both surfaces; run `check.py --admin` in Task 11).

- [ ] **Step 4: Write `doors.mjs` and `prices.mjs` to the Interfaces block**

`decide` reads the day of month from `today.slice(8, 10)`. The copy is written in Cyrus's register (short, dry, first person); the Arkos sentences are copied from the spec.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd admin/api && npm test`
Expected: all pass, the new file included.

- [ ] **Step 6: Commit**

```bash
git add admin/api/src/donate admin/api/src/finance/projects.mjs admin/api/test/donate-prices.test.mjs admin/api/test/finance.test.mjs admin/public/theme.css
git commit -m "donate: doors, tiers and the price rule, pure"
```

---

