### Task 3: Apply, the secret, the first deploy, the proxy depth

**Files:**
- Modify: `docs/superpowers/specs/2026-10-15-visits-wiring-design.md` (an "As built" line with the proxy depth), `_infra/main.tf` (only if the depth differs from 1)

This task runs commands against the project; each step's output is read before the next.

- [ ] **Step 1: Create the secret and the service**

```bash
terraform -chdir=_infra apply -input=false -target=module.gcp_visits.google_secret_manager_secret.visits -auto-approve
openssl rand -hex 32 | gcloud secrets versions add visits-secret --project csarko-sh --data-file=-
terraform -chdir=_infra apply -input=false
terraform -chdir=_infra apply -refresh-only -input=false -auto-approve   # targeted applies do not write root outputs
terraform -chdir=_infra output visits_service_url
```
Expected: the full apply adds everything else; the URL prints.

- [ ] **Step 2: Deploy the image**

Run: `cd ~/Projects/lib-visits && git checkout -q v0.1.0 && cd ~/Projects/csarko.sh && visits/deploy.sh`
Expected: the two ✓ lines. (Return lib-visits to `main` afterwards: `git -C ~/Projects/lib-visits checkout -q main`.)

- [ ] **Step 3: Confirm the proxy depth once**

The beacon from the browser goes through Hosting's rewrite only after Task 13; before that, confirm the depth against the `run.app` URL, where one proxy (Cloud Run's frontend) sits in front:

```bash
URL="$(terraform -chdir=_infra output -raw visits_service_url)"
gcloud run services update csarko-visits --region us-west1 --project csarko-sh --args="serve,--trusted-proxies,1,--log-ip" --quiet
curl -s -o /dev/null -H "Origin: https://csarko.sh" -d '{"v":1,"n":"view","id":"depth-check","p":"/depth-check"}' "$URL/v"
gcloud logging read 'resource.labels.service_name="csarko-visits" AND textPayload:"visits: request from"' --project csarko-sh --freshness=5m --limit 1 --format='value(textPayload)'
curl -s https://api.ipify.org; echo
gcloud run services update csarko-visits --region us-west1 --project csarko-sh --args="serve,--trusted-proxies,1" --quiet
```
Expected: the logged address equals this machine's public address. If it reads an internal address, the depth is wrong: set `trusted_proxies` in `_infra/main.tf`'s module call to the value that makes them match, `terraform apply`, and repeat. After Task 13, repeat the check once through `https://csarko.sh/v` (Hosting adds a hop); the final value goes into the spec's "As built" line and Terraform.

Note: `gcloud run services update --args` makes a revision Terraform will see as drift on `args`; the final `terraform apply` in this step restores the Terraform-owned args, so run it last.

- [ ] **Step 4: Record and commit**

Append to the wiring spec: `## As built\n\n- 2026-10-xx: `--trusted-proxies` is N behind Hosting (confirmed with `--log-ip`).`

```bash
git add docs/superpowers/specs/2026-10-15-visits-wiring-design.md _infra/main.tf
git commit -m "infra: csarko-visits is live; the proxy depth is recorded"
```

---

