---
name: deploy
description: >-
  Publish the csarko.sh portfolio site (public/) to Firebase Hosting and verify
  it is live, or push it to a temporary preview channel first. Use whenever the
  user wants to deploy, publish, ship, push live, release, or "update the
  website" after changing public/index.html or its assets — and for "give me a
  preview link I can share". Do not use for local-only viewing (that's the
  preview skill) or for DNS/hosting infrastructure changes (those go through
  Terraform in _infra/).
---

# Deploy csarko.sh

The site is static files in `public/`, served by **Firebase Hosting** (site
`csarko-sh` in GCP project `csarko-sh`) on the apex domain `csarko.sh`. There
is no CI: a deploy is one script, run by hand. If a doc in `content/docs/`
changed, run `generate-assets.sh` and commit first; the checks refuse a stale
`public/`.

```bash
.agents/skills/deploy/scripts/deploy.sh             # live
.agents/skills/deploy/scripts/deploy.sh --preview   # temporary preview channel, 7 days
```

## What the script does

1. **Guards** — refuses to deploy if `public/` or `content/docs/` contains an
   email address or a phone number (Cyrus's standing rule: no contact details
   on the public page),
   if the **site checks** fail (`.agents/skills/site-quality/scripts/check.py`:
   SEO, performance budgets, accessibility, security headers, 404, layout), or if
   `firebase.json` / `.firebaserc` disagree with Terraform about the site or
   project.
2. **Reads every identifier from Terraform outputs** (`_infra`), never from
   memory.
3. Runs `npx firebase-tools deploy --only hosting`.
4. **Verifies** by fetching `/`, `/docs` and the newest doc from the `web.app`
   URL and from `https://csarko.sh`, comparing SHA-256 against the local files.
   The web.app check must pass; the custom-domain check is reported but only
   warns, since CDN propagation can lag a few seconds.
5. **Checks the live site** (`check.py --live`): security headers match
   `firebase.json`, hashed assets are cached immutably, the custom 404 is served,
   robots/sitemap/og-image/favicons, `/docs` and every doc (200, same CSP,
   clean-URL redirects), every sitemap URL, http→https, the www redirect, and
   the size of any third-party JavaScript.

## Before deploying

- Run the **preview** skill and look at the screenshots (desktop and mobile).
  A deploy is public the moment it finishes.
- Walk the **site-quality** checklist for what changed. The script catches
  broken tags, budgets and headers, not stale wording.
- After a visual, performance, script or header change, run
  `.agents/skills/site-quality/scripts/check.py --lighthouse --observatory` once
  it's live: SEO/Accessibility/Best Practices 100, Performance ≥ 95, Observatory A+.
- Report the verification lines to the user as-is. Don't say "deployed" unless
  the `✓` lines printed.

## Auth

`firebase-tools` isn't logged in on this machine; it uses Google Application
Default Credentials (`gcloud auth application-default login`). If the deploy
fails with an auth error, ask the user to run that (suggest `! gcloud auth
application-default login`) rather than `firebase login`.

## Rollback

Firebase keeps every release. To roll back, list and restore one:

```bash
npx -y firebase-tools hosting:releases:list --project csarko-sh
npx -y firebase-tools hosting:clone csarko-sh:<version-or-channel> csarko-sh:live --project csarko-sh
```

Or revert the commit and redeploy.
