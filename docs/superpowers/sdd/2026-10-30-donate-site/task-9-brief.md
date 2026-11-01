### Task 9: The deploy script and the launch gate

**Files:**
- Create: `donate/deploy.sh`
- Modify: `.agents/skills/deploy/SKILL.md` (one line: donate.csarko.sh deploys with `donate/deploy.sh`, like apps)

**Interfaces:**
- Produces: `donate/deploy.sh` on `apps/deploy.sh`'s pattern: Terraform outputs `gcp_project_id`, `donate_hosting_site_id`, `donate_hosting_default_url`, `donate_site_url`; `grep` that `firebase.json` names the site; `node donate/build.mjs` (never `--prices`); guards over `donate/public/**/*.html`: no email, no phone, no em-dash, no `<script` except `type="application/json"` and `src="/app.js"`; deploy `--only hosting:$SITE`; verify every `*/index.html`, `index.html`, `icon.svg` and `app.js` byte for byte on the default URL and the custom domain, and that `curl -sI https://storage.googleapis.com/csarko-sh-donate-prices/prices.json` answers 200 with `access-control-allow-origin` when sent `Origin: https://donate.csarko.sh`.

- [ ] **Step 1: Write `deploy.sh`; `bash -n donate/deploy.sh`; run it once with no prices object present and confirm it stops at the build with the "no prices.json yet" message**

- [ ] **Step 2: Commit**

```bash
git add donate/deploy.sh .agents/skills/deploy/SKILL.md
git commit -m "donate: the deploy script; it refuses to ship without the month's prices"
```

- [ ] **Step 3: The launch, on or after Nov 3, once a snapshot has written `prices.json`**

Check: `curl -s https://storage.googleapis.com/csarko-sh-donate-prices/prices.json | python3 -c 'import json,sys; j=json.load(sys.stdin); print(j["month"], j["pool"], list(j["doors"]))'` prints `2026-10 <pool> [six doors]`. If the pool looks wrong against the Finance page's October total, stop and show Cyrus before deploying. Then `donate/deploy.sh`, then open `https://donate.csarko.sh/arkos`, pick the second tier, and confirm the Stripe checkout page opens with the right amount and `Donate` on its button. Do **not** pay. Report to Cyrus.

---

