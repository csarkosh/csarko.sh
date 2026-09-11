# csarko.sh

The portfolio site of **Cyrus Sarkosh**, a senior software engineer and engineering lead in New York.

**→ [csarko.sh](https://csarko.sh)**

It's a single hand-written HTML page: no framework, no build step, no JavaScript.

## What's here

```
public/            the site: index.html and a portrait
_infra/            Terraform for hosting (Firebase, GCP) and DNS (Route53, AWS)
.agents/skills/    preview and deploy skills for AI agents (and humans)
firebase.json      what gets published, and how it's cached
AGENTS.md          working context and rules for agents; CLAUDE.md points to it
```

## Preview locally

```bash
.agents/skills/preview/scripts/preview.sh           # open in Chrome
.agents/skills/preview/scripts/preview.sh --serve   # serve on http://localhost:4173
.agents/skills/preview/scripts/preview.sh --shots   # desktop + mobile screenshots in /tmp
```

Or just open `public/index.html` in a browser.

## Deploy

```bash
.agents/skills/deploy/scripts/deploy.sh             # publish to csarko.sh
.agents/skills/deploy/scripts/deploy.sh --preview   # a shareable preview link, valid 7 days
```

The script publishes `public/` to Firebase Hosting, then fetches the live page and checks that it matches the file you deployed. It needs Node 20+, Terraform, and Google application-default credentials (`gcloud auth application-default login`).

## Infrastructure

```
csarko.sh ──(Route53 A + TXT)──▶ Firebase Hosting (GCP project csarko-sh) ──▶ public/
```

Everything is defined in Terraform under `_infra/`, with state in a versioned GCS bucket:

```bash
terraform -chdir=_infra init
terraform -chdir=_infra plan
```

## License

[MIT](./LICENSE)
