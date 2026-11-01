### Task 7: The Hosting rewrite and the AGENTS.md section

**Files:**
- Modify: `firebase.json` (the `csarko-sh` entry: add `rewrites` between `redirects` and `headers`), `AGENTS.md` (the "Analytics" section and the "Where to look" table's GoatCounter rows)
- Create: `.agents/skills/site-quality/tests/firebase.test.mjs`

- [ ] **Step 1: The test first**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const fb = JSON.parse(readFileSync(new URL("../../../../firebase.json", import.meta.url), "utf8"));
const site = fb.hosting.find((h) => h.public === "public");

test("the site rewrites /v to the visits collector and nothing else", () => {
  assert.deepEqual(site.rewrites, [{ source: "/v", run: { serviceId: "csarko-visits", region: "us-west1" } }]);
});

test("the research redirects and clean URLs are untouched", () => {
  assert.equal(site.cleanUrls, true);
  assert.ok(site.redirects.some((r) => r.source === "/docs/:slug*" && r.destination === "/research/:slug" && r.type === 301));
});

test("no public file would shadow the beacon path", () => {
  for (const name of ["v", "v.html", "v/index.html"]) {
    assert.throws(() => readFileSync(new URL(`../../../../public/${name}`, import.meta.url)), `public/${name} exists`);
  }
});
```

Run: `cd .agents/skills/site-quality && node --test tests/firebase.test.mjs 2>&1 | grep -E "^# (pass|fail)"`
Expected: `# fail 1` (no rewrites yet).

- [ ] **Step 2: Add the rewrite**

In `firebase.json`, inside the `csarko-sh` hosting entry, after `"redirects": [...]`:
```json
    "rewrites": [
      { "source": "/v", "run": { "serviceId": "csarko-visits", "region": "us-west1" } }
    ],
```

- [ ] **Step 3: AGENTS.md**

Rewrite the "Analytics: how GoatCounter is wired in" section as "Analytics: how lib-visits is wired in": the provider and endpoint in `site.json`; the two vendored scripts from tag `v0.1.0` and how to bump them (Task 4 step 1's command); the beacon's same-origin `/v` rewrite to Cloud Run `csarko-visits` (Terraform `gcp-visits`, image by `visits/deploy.sh`); rows in `csarko_visits` (BigQuery, via Log Analytics) and GoatCounter's history in `csarko_history`; the events list unchanged but `read-<slug>` now derived from `leave.re`; no cookies, the only storage the visitor's `#visits-off`; set `provider` to `null` to turn it all off. In "Where to look", the GoatCounter row becomes the admin dashboard (`https://admin.csarko.sh/csarko.sh/`) with BigQuery behind it, and the "Search Console is connected to agents; GoatCounter is not" paragraph becomes: BigQuery is readable from the command line with `bq query --project_id=csarko-sh` over `csarko_visits._AllLogs` (the SQL in `admin/api/queries/`). Record the date: *(moved from GoatCounter 2026-10-xx after its 2026-10-15 outage)*.

- [ ] **Step 4: Run the tests and the checks, commit**

Run: `cd .agents/skills/site-quality && node --test tests/ 2>&1 | grep -E "^# (pass|fail)"; cd ../../.. && python3 .agents/skills/site-quality/scripts/check.py 2>&1 | tail -1`
Expected: pass, pass.

```bash
git add firebase.json AGENTS.md .agents/skills/site-quality/tests/firebase.test.mjs
git commit -m "hosting: /v rewrites to the visits collector

Same-origin beacons: no CORS, no preflight, no third-party origin in
the CSP. AGENTS.md says how analytics is wired now."
```

---

