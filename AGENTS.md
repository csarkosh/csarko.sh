# csarko.sh — working context

Cyrus Sarkosh's portfolio site, live at **https://csarko.sh**. One static page:
who he is, where he's worked, the games he builds, his skills, and how to reach
him. No framework, no build step, no CI.

## Layout

| Path | What |
|---|---|
| `public/index.html` | **The site.** One file: inline CSS, inline SVG icons, JSON-LD. The only JavaScript is the self-hosted GoatCounter counter. |
| `public/me.jpg` | Portrait (640px wide JPEG, from `~/Pictures/Cyrus/me_1.png`). |
| `public/assets/` | **Generated, content-hashed, cached for a year:** responsive portraits (AVIF/WebP/JPEG) and self-hosted fonts. |
| `public/og-image.jpg`, `portrait.jpg`, `favicon.*`, `apple-touch-icon.png` | **Generated** too. Everything generated comes from `.agents/skills/site-quality/assets/` via `generate-assets.sh` — never hand-edit, including the `generated:` blocks inside the HTML. |
| `public/404.html` | Custom not-found page (noindex, root-relative paths). |
| `public/licenses/fonts-OFL.txt` | Font licenses. |
| `public/robots.txt`, `public/sitemap.xml` | Crawl rules and the one-URL sitemap. |
| `firebase.json`, `.firebaserc` | Firebase Hosting config: publish `public/`, cache headers. |
| `_infra/` | Terraform for the hosting and DNS. Same shape as `~/Projects/fps/_infra`. |
| `.agents/skills/` | Agent skills: `preview`, `deploy` and `site-quality`. `.claude/skills` is a symlink to it so Claude Code discovers them. |
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

**Every change is also a quality change.** The standing targets are Lighthouse
100/100/100 with Performance ≥ 95, Mozilla Observatory A+, and a layout that
holds from 320px to 1440px. Preview runs `site-quality`'s checks, deploy refuses
to publish if they fail, and that skill's checklist covers what the script
can't. Adding any script or third-party service (analytics included) has its
own procedure there. Read each skill's `SKILL.md` before using it.

## Where to look: measuring the site

Three sources, each for a different question. **Pick by the question, not by habit.**

| Question | Source | Where |
|---|---|---|
| Who's visiting? How many visits, which pages, where from (referrers), countries, devices, browsers? Which broken links do people hit (404 paths)? | **GoatCounter** | https://csarko.goatcounter.com |
| How does the site do in **Google Search**? Queries people search, impressions, clicks, CTR, average position; whether pages are **indexed**; sitemap status; URL removals; structured-data and page-experience reports | **Google Search Console** | https://search.google.com/search-console?resource_id=sc-domain%3Acsarko.sh (Domain property `csarko.sh`) |
| Is the site fast, accessible, SEO-correct and locked down right now? (lab measurements, not visitors) | **`site-quality` checks** | `.agents/skills/site-quality/scripts/check.py --live --lighthouse --observatory` |

- **"Traffic", "visitors", "views", "where are people coming from"** → GoatCounter.
  **"Google", "ranking", "search results", "indexed", "impressions", "why doesn't my site show up"** → Search Console.
  A referrer of `google.com` in GoatCounter tells you a visit came from search;
  *which query* it came from is only in Search Console.
- **Neither account is connected to agents.** Both belong to Cyrus, and no API
  credentials exist on this machine or in this repo. Ask him to open the
  dashboard (or share a screenshot or export) rather than guessing numbers.
  If he wants programmatic access: GoatCounter issues API tokens under Settings →
  API; Search Console needs OAuth with the `webmasters.readonly` scope. **Never
  commit a token.**
- **Expect small numbers and lag.** It's a personal site. Search Console's
  reports run 2–3 days behind and show nothing for queries with very low volume.
  Its Core Web Vitals report needs real-user traffic volume the site may never
  reach; use the `site-quality` Lighthouse run for performance instead.

**Search Console state as of 2026-09-11** (check these before re-doing any of them):
- Domain property verified through the apex TXT `google-site-verification=…` in
  `_infra/main.tf`. Removing that value un-verifies the property.
- Sitemap `https://csarko.sh/sitemap.xml` submitted. Its first status was
  "Couldn't fetch" before Google's first attempt, although the file is valid.
  If it still isn't "Success" by ~2026-09-13, delete it in Sitemaps and resubmit
  it once.
- Indexing requested for `https://csarko.sh/` (URL Inspection).
- Temporary removals submitted for the retired subdomains `readme-viewer`,
  `babylonjs-fps-demo`, `shooter`, `fps`, `webgl` (all `*.csarko.sh`, "remove
  all URLs with this prefix"). They lapse around 2027-03. They shouldn't need
  renewing, since those hosts no longer resolve.
- After a meaningful content change, use URL Inspection → Request indexing for
  `https://csarko.sh/`.

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
- **Headline identity is "senior software engineer"** *(Cyrus, 2026-09-13)*: the
  search description, hero, share card and JSON-LD say he's a senior software
  engineer who was the **founding engineer and lead on several zero-to-one
  products at DoorDash**. Don't pair "senior software engineer" with "engineering
  lead" there; it reads as two conflicting titles. "Founding engineer and lead
  on…" is fine: it describes his role on those products, not a second title. The
  hero's second clause is exploring generative AI for media and entertainment,
  starting with game development; keep it broad, not games-only (he may move to
  short films later, but that's not on the page).
- **The Experience section stays high-level** *(Cyrus, 2026-09-11)*: for each role, a
  short description of the product and his general role on it, plus tech tags.
  **No metrics, customer names, or accomplishment bullets** (ARR, merchant counts,
  call volumes, ~20x, McDonald's, Unilever…). Those details live in the résumé only.
- **The hero tiles are a "Now" snapshot** (Building / Writing / Based in /
  Working), deliberately about him rather than DoorDash metrics. An earlier
  "What I care about" version was tried and replaced.
- **No em-dashes in page copy**; commas, colons, semicolons.
- **Games section:** Day Hike (playable, links to
  `https://games.csarko.sh/dayhike/`), **`game-dayhike`** (linked to
  `github.com/csarkosh/game-dayhike` since it went public, *2026-09-14*), `electron-gamepatch`,
  and a full-width `csarko.sh` card (`.card.wide`, *added 2026-09-13*) linking
  `github.com/csarkosh/csarko.sh` as a demo of a site managed entirely by agents.
  The Day Hike card carries the game's story (the park ranger and the four missing
  hikers) and the `game-dayhike` card carries the tech; both follow that repo's
  README and GitHub description. `game-dayhike` has no licence yet, so its kicker
  says "Public repo", not "Open source". The `.card.placeholder` style is kept for
  future "Coming soon" cards. **The asset pipeline is being
  commercialized** — never describe it as open source or part of that repo.
  `html5-fps` was removed on purpose (an early prototype, not a game).
- **The blog is "csarko.log"** at `https://csarko.substack.com/`. It has no
  published posts yet; Cyrus will publish once Day Hike is ready to publicize.

## Analytics: how GoatCounter is wired in

- **GoatCounter**, dashboard at **https://csarko.goatcounter.com** (Cyrus's account,
  code `csarko`, set up 2026-09-11). No cookies, so no consent banner.
- **Configured in one place:** `.agents/skills/site-quality/site.json`.
  `generate-assets.sh` derives the `<script>` tag on both pages, the CSP
  (`script-src 'self'`, beacons to `https://csarko.goatcounter.com` in
  `connect-src` and `img-src`), and `check.py`'s allowlist from it. Don't edit
  any of those by hand. Set `code` to `null` to turn analytics off cleanly.
- **count.js is self-hosted:** vendored unmodified (ISC license) at
  `.agents/skills/site-quality/assets/vendor/goatcounter-count.js` and served as
  a content-hashed file, so no third-party script loads and Observatory stays A+.
  To update it, re-download `https://gc.zgo.at/count.js` over that file (keep the
  provenance comment accurate) and re-run the generator.
- The 404 page counts too (the path shows the broken link). `localhost` and
  `file://` previews are never counted.
- Verified on first deploy: Lighthouse still 100/100/100/100 (LCP 1.2s, CLS 0),
  Observatory A+ 120, beacon returns 200, zero console errors.

## Theme tokens

Defined as CSS custom properties at the top of `index.html`. Cyrus uses these to
match his Substack theme, so keep them stable or tell him when they change.

| Token | Hex |
|---|---|
| `--accent` | `#7dd3c0` (hover `#95e0cf`, text on accent `#06231d`) |
| `--bg` | `#0a0b0e` |
| `--surface` / `--surface-2` | `#111318` / `#161922` |
| `--text` / `--muted` / `--faint` | `#e8eaf0` / `#a0a8b8` / `#7d8597` |

`--faint` is `#7d8597`, the dimmest text that clears WCAG 4.5:1 on every surface
(it was `#6e7688`, which failed). Fonts: Inter (text) and JetBrains Mono (labels,
tags), **self-hosted** from `public/assets/` — not Google Fonts, whose stylesheet
blocked the first paint. If a token changes, regenerate the og-image and
favicons (`.agents/skills/site-quality/scripts/generate-assets.sh`).

## Infrastructure

- **Hosting:** Firebase Hosting site `csarko-sh` in GCP project **`csarko-sh`**
  (billing: Main Billing). Default URL `https://csarko-sh.web.app`.
- **DNS:** Route53 zone `csarko.sh` (`Z905ENUNE0H3I`, AWS account `705624689046`).
  **The zone is not Terraform-managed, and neither is most of what's in it.**
  This repo's state owns exactly three record sets: the apex **A**
  (`199.36.158.100`), the apex **TXT** (`hosting-site=csarko-sh` plus the Google
  Search Console `google-site-verification=…` token — never remove it), and the
  **`www` CNAME** → `csarko-sh.web.app`, which Firebase serves as a 301 to
  `https://csarko.sh` (`redirect_domain_names` in `_infra/variables.tf`). Everything
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
- **Stale state lock after an interrupted apply:** the GCS backend's lock ID for
  `terraform force-unlock` is the lock object's *generation number*
  (`gcloud storage objects describe gs://csarko-sh-tfstate/csarko-sh/default.tflock
  --format='value(generation)'`), not the UUID in the error. Confirm no
  `terraform` process is running first, and `terraform import` anything the
  interrupted run created but didn't record.
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
