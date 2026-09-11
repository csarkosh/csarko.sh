# csarko.sh — working context

Cyrus Sarkosh's portfolio site, live at **https://csarko.sh**. One static page:
who he is, where he's worked, the games he builds, his skills, and how to reach
him. No framework, no build step, no CI.

## Layout

| Path | What |
|---|---|
| `public/index.html` | **The site.** One self-contained file: inline CSS, inline SVG icons, no JS. |
| `public/me.jpg` | Portrait (640px wide JPEG, from `~/Pictures/Cyrus/me_1.png`). |
| `firebase.json`, `.firebaserc` | Firebase Hosting config: publish `public/`, cache headers. |
| `_infra/` | Terraform for the hosting and DNS. Same shape as `~/Projects/fps/_infra`. |
| `.agents/skills/` | Agent skills: `preview` and `deploy`. `.claude/skills` is a symlink to it so Claude Code discovers them. |
| `README.md` | Human-facing overview. `LICENSE` is MIT and predates this version of the site. |

## Workflows

- **See a change:** `.agents/skills/preview/scripts/preview.sh` (opens Chrome) or
  `--shots` for desktop + mobile screenshots in `/tmp/csarko-sh-preview/`. After any
  visual edit, look at both screenshots before calling it done.
- **Ship a change:** `.agents/skills/deploy/scripts/deploy.sh`. It verifies the
  deployed `index.html` byte-for-byte on both the web.app URL and csarko.sh.
  `--preview` gives a 7-day shareable channel instead.
- **Change infrastructure:** `terraform -chdir=_infra plan`, then `apply`. Never
  hand-edit the resources Terraform owns.

Read each skill's `SKILL.md` before using it.

## Content rules (Cyrus's standing preferences)

- **No email address or phone number anywhere on the page.** He doesn't want
  spam. Contact goes through LinkedIn (the primary button), GitHub and Substack.
  `deploy.sh` enforces this and refuses to publish otherwise.
- **Dark theme only, no toggle.**
- **Facts come from his résumé.** The canonical source is
  `~/Documents/Resume/resume_build.docx`; decisions and confirmed numbers are in
  `~/Documents/Resume/AGENTS.md`. Don't introduce a number or claim that isn't
  there. In particular: GEM is not profitable; titles are "Senior Software
  Engineer" (he was the *de facto* lead — say "engineering lead" in prose, never
  "Tech Lead" as a title); Voice AI was sunset, so never imply it's still running.
- **Frame him as a lead**, not a supporting engineer.
- **The Experience section stays high-level** *(Cyrus, 2026-09-11)*: for each role, a
  short description of the product and his general role on it, plus tech tags.
  **No metrics, customer names, or accomplishment bullets** (ARR, merchant counts,
  call volumes, ~20x, McDonald's, Unilever…). Those details live in the résumé only.
- **The hero tiles are a "Now" snapshot** (Building / Writing / Based in /
  Working), deliberately about him rather than DoorDash metrics. An earlier
  "What I care about" version was tried and replaced.
- **No em-dashes in page copy**; commas, colons, semicolons.
- **Games section:** Day Hike (playable, links to
  `https://games.csarko.sh/dayhike/`), a **`game-dayhike` "Coming soon"
  placeholder** (a non-clickable `div.card.placeholder`), and
  `electron-gamepatch`. When `github.com/csarkosh/game-dayhike` goes public, turn
  the placeholder into `<a class="card" href="...">` with a "View on GitHub" link
  (there's an HTML comment marking the spot). **The asset pipeline is being
  commercialized** — never describe it as open source or part of that repo.
  `html5-fps` was removed on purpose (an early prototype, not a game).
- **The blog is "csarko.log"** at `https://csarko.substack.com/`. It has no
  published posts yet; Cyrus will publish once Day Hike is ready to publicize.

## Theme tokens

Defined as CSS custom properties at the top of `index.html`. Cyrus uses these to
match his Substack theme, so keep them stable or tell him when they change.

| Token | Hex |
|---|---|
| `--accent` | `#7dd3c0` (hover `#95e0cf`, text on accent `#06231d`) |
| `--bg` | `#0a0b0e` |
| `--surface` / `--surface-2` | `#111318` / `#161922` |
| `--text` / `--muted` / `--faint` | `#e8eaf0` / `#a0a8b8` / `#6e7688` |

Fonts: Inter (text) and JetBrains Mono (labels, tags), from Google Fonts.

## Infrastructure

- **Hosting:** Firebase Hosting site `csarko-sh` in GCP project **`csarko-sh`**
  (billing: Main Billing). Default URL `https://csarko-sh.web.app`.
- **DNS:** Route53 zone `csarko.sh` (`Z905ENUNE0H3I`, AWS account `705624689046`).
  **The zone is not Terraform-managed, and neither is most of what's in it.**
  This repo's state owns exactly two record sets: the apex **A**
  (`199.36.158.100`) and the apex **TXT** (`hosting-site=csarko-sh`). Everything
  else there belongs to someone else — the apex **MX records are Google Workspace
  mail** (never touch them) and `games`/`game` belong to `~/Projects/fps/_infra`.
  As of 2026-09-11 that is the whole zone — every older project subdomain was
  taken down (see History).
- **Apex TXT is one record set.** If another apex TXT value is ever needed (SPF,
  a verification token), add it to the `txt_records` list in `_infra/main.tf`
  rather than creating a second record set.
- **State:** GCS bucket `gs://csarko-sh-tfstate`, prefix `csarko-sh`, versioned.
  Created by hand with the project; not managed by Terraform (see the comment in
  `_infra/main.tf`).
- **`hosting_required_dns_updates` goes empty once the domain is healthy.** That's
  success, not breakage. `hosting_custom_domain_state` should read
  `HOST_ACTIVE` / `OWNERSHIP_ACTIVE` / `CERT_ACTIVE`.
- **Targeted applies don't write root outputs.** If `deploy.sh` says an output is
  missing after a `-target` apply, run `terraform -chdir=_infra apply -refresh-only`.

## History

- **2020 – 2026-09-10:** a React app deployed by GitHub Actions to AWS (S3 bucket
  `csarko.sh` behind CloudFront, ACM certificate, Terraform state in the S3 bucket
  `sh.csarko.terraform` under `portfolio-site.csarko.sh/`).
- **2026-09-11:** replaced with this static page on Firebase Hosting. All old
  files were deleted except `LICENSE`; the README was rewritten.
  - **Cutover** was a single Route53 UPSERT of the apex A record (CloudFront alias
    → `199.36.158.100`) at ~02:00 ET, after the certificate had been pre-issued
    through a temporary `_acme-challenge.csarko.sh` TXT record (hand-made, not in
    Terraform) so HTTPS worked from the first request. Verified: all public
    resolvers, byte-identical `index.html`, valid Google Trust Services cert.
  - **Deleted, with Cyrus's approval:** CloudFront distribution `E2CFFDQ06WHKKO`,
    S3 bucket `csarko.sh`, and the state object
    `s3://sh.csarko.terraform/portfolio-site.csarko.sh/terraform.tfstate` (that
    bucket is versioned, so prior versions remain recoverable).
  - **Old project subdomains taken down the same day, at Cyrus's request:**
    `fps`, `webgl`, `babylonjs-fps-demo`, `readme-viewer` and `shooter`. Deleted:
    their DNS records, CloudFront distributions `E33WBFXY6RAK4C`,
    `E3KV21DE1QR0RU`, `E6PTH8ZUPZHU0`, their S3 buckets, readme-viewer's backend
    (API Gateway `lyqvmoqvd6` + custom domain, Lambdas `readme-viewer` and
    `cache-gh-data`, the weekly EventBridge rule, two IAM roles, the
    `readme-viewer.csarko.sh-lambdas2` and `csarko.sh-lambdas` code buckets), the
    wildcard `*.csarko.sh` ACM certificate and its validation CNAME, an expired
    2021 certificate, the 2019 `csarko-website` and `inject-headers` Lambdas and
    their log groups, the `html5-multiplayer-shooter-ec2-sg` security group, and
    the `shooter`, `webgl` and `webrtc` state objects.
  - **Kept:** `s3://sh.csarko.terraform/csarko.sh/terraform.tfstate`. It is stale
    (most of what it lists is gone) but it also claims the **Route53 zone and the
    apex MX records**. Never run Terraform against it — a destroy would take out
    the zone and mail. There is no longer any AWS CloudFront, ACM, API Gateway or
    Lambda for csarko.sh; the zone itself is the only csarko.sh resource left on
    AWS.
