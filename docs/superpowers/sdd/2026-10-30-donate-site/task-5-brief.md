### Task 5: Infrastructure

**Files:**
- Modify: `_infra/modules/gcp-admin-api/variables.tf` (`secret_ids`, `seeded_secret_ids`, new `donate_prices_bucket`, `donate_origin`)
- Modify: `_infra/modules/gcp-admin-api/main.tf` (the bucket, its two IAM members, two env vars)
- Modify: `_infra/modules/gcp-admin-api/outputs.tf` (`donate_prices_bucket`)
- Modify: `_infra/variables.tf` (`donate_domain_name`, `donate_hosting_site_id`)
- Modify: `_infra/main.tf` (`module "gcp_hosting_donate"`, the CNAME, the module inputs)
- Modify: `_infra/outputs.tf` (`donate_hosting_site_id`, `donate_hosting_default_url`, `donate_custom_domain_state`, `donate_site_url`, `donate_prices_bucket`)
- Modify: `firebase.json` (a fourth hosting entry)
- Test: `.agents/skills/site-quality/tests/firebase.test.mjs`

**Interfaces:**
- Produces: Terraform outputs `donate_hosting_site_id` = `csarko-sh-donate`, `donate_hosting_default_url`, `donate_custom_domain_state`, `donate_site_url` = `https://donate.csarko.sh`, `donate_prices_bucket` = `csarko-sh-donate-prices`; the admin service's env `DONATE_BUCKET`, `DONATE_URL`, `STRIPE_WRITE_KEY` (secret `stripe-write-key`, seeded `unset`).
- The bucket: `google_storage_bucket.donate_prices` with `uniform_bucket_level_access = true`, `public_access_prevention = "inherited"`, `force_destroy = false`, `cors { origin = [var.donate_origin, "http://localhost:8789"], method = ["GET"], response_header = ["Content-Type"], max_age_seconds = 3600 }`; `google_storage_bucket_iam_member.donate_public` (`allUsers`, `roles/storage.objectViewer`); `google_storage_bucket_iam_member.admin_writes_donate` (the admin service account, `roles/storage.objectUser`).
- The hosting entry: `site: "csarko-sh-donate"`, `public: "donate/public"`, `ignore: ["**/.*"]`, `cleanUrls: true`, `trailingSlash: false`, no rewrites, no redirects, the apps site's headers with the CSP `default-src 'none'; script-src 'self'; connect-src 'self' https://storage.googleapis.com; img-src 'self'; font-src 'self'; style-src 'self' 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; upgrade-insecure-requests`, the same cache rules as the apps site plus `/icon.svg` at `public, max-age=86400`.

- [ ] **Step 1: Write the failing test**

```js
// appended to .agents/skills/site-quality/tests/firebase.test.mjs
test("the donate site: its own entry, a CSP that reaches only the prices bucket, no rewrite and no redirect", () => {
  const donate = fb.hosting.find((h) => h.site === "csarko-sh-donate");
  assert.equal(donate.public, "donate/public");
  assert.equal(donate.cleanUrls, true);
  assert.equal(donate.trailingSlash, false);
  assert.equal(donate.rewrites, undefined);
  assert.equal(donate.redirects, undefined);
  const csp = donate.headers.find((h) => h.source === "**").headers.find((h) => h.key === "Content-Security-Policy").value;
  assert.ok(csp.includes("connect-src 'self' https://storage.googleapis.com;"));
  assert.ok(csp.includes("script-src 'self';"));
  assert.ok(csp.includes("form-action 'none'"));
  assert.ok(!csp.includes("stripe"), "Stripe is a navigation, not a request from the page");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test .agents/skills/site-quality/tests/firebase.test.mjs`
Expected: FAIL, `donate` undefined.

- [ ] **Step 3: Edit `firebase.json` to the Interfaces block; run the test again**

Expected: PASS.

- [ ] **Step 4: Write the Terraform to the Interfaces block**

Root: `variable "donate_domain_name" { default = "donate.csarko.sh" }`, `variable "donate_hosting_site_id" { default = "csarko-sh-donate" }`; `module "gcp_hosting_donate"` a copy of `gcp_hosting_apps` with the comment that it carries donate.csarko.sh (spec path named); `local.donate_hosting_cname_target`; `cname_records` gains `(var.donate_domain_name) = local.donate_hosting_cname_target`; the admin module gets `donate_origin = "https://${var.donate_domain_name}"`. Module: the variables, the bucket, the IAM members, the env, the output; `secret_ids` gains `stripe-write-key = "STRIPE_WRITE_KEY"` and `seeded_secret_ids` gains `"stripe-write-key"`.

- [ ] **Step 5: Plan, and read every line**

Run: `terraform -chdir=_infra plan -out=/tmp/donate.plan`
Expected: adds `module.gcp_hosting_donate.google_firebase_hosting_site.this`, `module.gcp_hosting_donate.google_firebase_hosting_custom_domain.this`, `module.aws_dns.aws_route53_record.cname["donate.csarko.sh"]`, `module.gcp_admin_api.google_secret_manager_secret.this["stripe-write-key"]`, `...secret_iam_member.admin_reads["stripe-write-key"]`, `...secret_version.seed["stripe-write-key"]`, `...google_storage_bucket.donate_prices`, two `google_storage_bucket_iam_member`; updates in place `module.gcp_admin_api.google_cloud_run_v2_service.admin` (env only). **Nothing destroyed, nothing else changed.** If anything else moves, stop and show Cyrus the plan.

- [ ] **Step 6: Apply, then verify**

Run: `terraform -chdir=_infra apply /tmp/donate.plan`, then `terraform -chdir=_infra output donate_custom_domain_state` (the certificate issues after DNS; `HOST_ACTIVE`/`OWNERSHIP_ACTIVE`/`CERT_ACTIVE` may take minutes to an hour) and `gcloud storage buckets describe gs://csarko-sh-donate-prices --format='value(cors_config)'`.

- [ ] **Step 7: Deploy the API so the new revision carries the step**

Run: `gcloud run deploy csarko-admin --source admin/api --region us-west1 --project csarko-sh`
Then `curl -s https://admin.csarko.sh/finance/` is not the check; the check is the next day's snapshot: `gcloud firestore ...` is slow, so instead trigger one: `gcloud scheduler jobs run csarko-admin-snapshot --location us-west1 --project csarko-sh`, wait a minute, and read the day's document's `finance.notConfigured.donate` (`STRIPE_WRITE_KEY` until Cyrus adds the key) with the admin page's Sources card or `gcloud firestore documents get` equivalent (the Firestore REST: `gcloud auth print-access-token` + `GET https://firestore.googleapis.com/v1/projects/csarko-sh/databases/(default)/documents/snapshots/<today>`).

- [ ] **Step 8: Cyrus's step, asked for in one message: create the restricted key and add it**

In the Stripe dashboard: Developers, API keys, Create restricted key, permissions **Products: Write** and **Payment Links: Write**, everything else None; name `csarko-admin donate`. Then, on the Mac:

```bash
printf '%s' 'rk_live_...' | gcloud secrets versions add stripe-write-key --project=csarko-sh --data-file=-
gcloud secrets versions disable 1 --secret=stripe-write-key --project=csarko-sh
```

No redeploy is needed: the service reads `latest` at the next cold start; force one with `gcloud run services update csarko-admin --region us-west1 --project csarko-sh --update-env-vars=DONATE_URL=https://donate.csarko.sh` (a no-op value change rolls the revision).

- [ ] **Step 9: Commit**

```bash
git add _infra firebase.json .agents/skills/site-quality/tests/firebase.test.mjs
git commit -m "infra: the donate site, its prices bucket and the Stripe write key"
```

---

