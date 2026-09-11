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
is no build step and no CI: a deploy is one script, run by hand.

```bash
.agents/skills/deploy/scripts/deploy.sh             # live
.agents/skills/deploy/scripts/deploy.sh --preview   # temporary preview channel, 7 days
```

## What the script does

1. **Guards** — refuses to deploy if `public/` contains an email address or a
   phone number (Cyrus's standing rule: no contact details on the public page),
   if the **SEO checks** fail (`.agents/skills/seo/scripts/seo_check.py`:
   canonical, JSON-LD, preview card, favicons, robots/sitemap), or if
   `firebase.json` / `.firebaserc` disagree with Terraform about the site or
   project.
2. **Reads every identifier from Terraform outputs** (`_infra`), never from
   memory.
3. Runs `npx firebase-tools deploy --only hosting`.
4. **Verifies** by fetching `/` from the `web.app` URL and from
   `https://csarko.sh` and comparing SHA-256 against the local
   `public/index.html`. The web.app check must pass; the custom-domain check is
   reported but only warns, since CDN propagation can lag a few seconds.
5. **Checks SEO on the live site** (`seo_check.py --live`): robots.txt,
   sitemap, og-image, favicons, real 404s, http→https, and the www redirect.

## Before deploying

- Run the **preview** skill and look at the screenshots (desktop and mobile).
  A deploy is public the moment it finishes.
- Walk the **seo** skill's checklist for what changed (title, tagline, photo,
  links → tags, JSON-LD, and the og-image may need regenerating). The script
  catches broken tags, not stale wording.
- After a visual or performance change, run
  `.agents/skills/seo/scripts/seo_check.py --lighthouse` once it's live; SEO and
  Accessibility must stay at 100.
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
