---
name: search-console
description: >-
  Report Google Search Console status for a static site from the command line:
  whether each sitemap URL is indexed, whether Google has fetched the sitemap,
  and what the site earns in search (clicks, impressions, CTR, average
  position). Use whenever the user asks about Google, search, ranking,
  indexing, "is my page in Google", "did that doc get indexed", impressions,
  search queries, sitemap status, or Search Console itself, and after
  publishing a new page to check a few days later whether it landed. Not for
  visitor counts or referrers (that is GoatCounter) and not for speed,
  accessibility or headers (that is site-quality).
---

# Google Search Console, from the command line

Read-only, one script, no dependency beyond stdlib and `google-auth`. It is
site-agnostic: the property, the sitemap and the key path all come from flags or
the environment, so the same skill works in any static-site repo.

```bash
S=.agents/skills/search-console/scripts
$S/gsc.py index                 # inspect every <loc> in the sitemap: verdict, coverage, last crawl, canonical
$S/gsc.py sitemap               # has Google fetched the sitemap, with error, warning and indexed counts
$S/gsc.py perf --days 28        # clicks, impressions, CTR, average position, by page and by query
```

Add `--json` to any of them to get the raw API responses instead of the tables,
which is the better form when an agent needs to reason over the numbers.

| Command | Answers |
|---|---|
| `index` | Did Google index the pages I published? Is anything blocked, unfetchable or canonicalized somewhere else? Which URLs still need a manual click? |
| `sitemap` | Did Google ever download the sitemap, and does it report errors? |
| `perf` | What do people search before they land here, which pages get impressions, where do they rank? |

Unit tests: `python3 -B -m unittest discover -s .agents/skills/search-console/tests`.

## Resolving the site

Each option falls back to the next, and the script prints which one it used.

| What | Flag | Then | Then |
|---|---|---|---|
| Property | `--property sc-domain:example.com` or `https://example.com/` | `$GSC_PROPERTY` | the sitemap's own host, as `sc-domain:<host>`, stated as an assumption |
| Sitemap | `--sitemap <path or https URL>` | `$GSC_SITEMAP` | `./public/sitemap.xml` if it exists |
| Project | `--project <gcp-project>` | `$GSC_PROJECT` | the property host with dots as hyphens |
| Key | `--key <path>` | `$GSC_SA_KEY` | `~/.config/<project>/gsc-sa.json` |

A Domain property is spelled `sc-domain:example.com`. `https://example.com/` is a
different property identifier, and asking for one that does not exist returns 404.

### For csarko.sh

Everything resolves on its own from the repo root, so the commands are bare:

```bash
S=.agents/skills/search-console/scripts
$S/gsc.py index                 # property sc-domain:csarko.sh, sitemap public/sitemap.xml, key ~/.config/csarko-sh/gsc-sa.json
$S/gsc.py sitemap               # answers the open "Couldn't fetch" item in AGENTS.md
$S/gsc.py perf --days 28
```

## Setup, once

```bash
.agents/skills/search-console/scripts/setup.sh --project csarko-sh
```

It enables `searchconsole.googleapis.com`, creates the `gsc-reader` service
account, writes a key to `~/.config/<project>/gsc-sa.json` with mode 600, and
skips whatever already exists. It never replaces an existing key unless you pass
`--rotate`, and it grants the service account **no IAM role** on the project: all
of its access comes from the Search Console grant below.

Then the one step that has no API:

1. Open https://search.google.com/search-console
2. Select the property
3. **Settings** > **Users and permissions** > **Add user**
4. Email: the `…@<project>.iam.gserviceaccount.com` address the script printed
5. Permission: **Full** (Restricted cannot submit sitemaps)
6. **Add**

**The key lives outside the repo and is never committed.** The repo carries only
the variable name. `.gitignore` also blocks `*-sa.json` and
`*service-account*.json` as a second line of defence. If the key is missing, or
if the property grant is, every command exits non-zero with the specific fix
rather than a traceback: a 403 `ACCESS_TOKEN_SCOPE_INSUFFICIENT` means the scope,
a 403 "User does not have sufficient permission for site" means the service
account was never added or was added as Restricted.

The scope is read-only, `https://www.googleapis.com/auth/webmasters.readonly`.
Submitting or deleting a sitemap would need the read-write scope, which this
skill deliberately does not request.

## What stays manual, and why

**"Request indexing" has no API and never has.** The Search Console API has four
resources (`searchanalytics`, `sitemaps`, `sites`, `urlInspection`) and none of
them requests a crawl. The Indexing API is not a substitute: it "can only be used
to crawl pages with either `JobPosting` or `BroadcastEvent` embedded in a
`VideoObject`", so an article page is outside its scope and calling it anyway is
documented misuse that does not get the page crawled.

More to the point, clicking the button twice buys nothing:

> "To request a crawl of individual URLs, use the URL Inspection tool… there's a
> quota for submitting individual URLs and requesting a recrawl multiple times
> for the same URL won't get it crawled any faster."

- https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl
- https://developers.google.com/search/apis/indexing-api/v3/using-api

So `gsc.py index` does the honest half: it tells you **which** URLs are still not
on Google and prints each one's `inspectionResultLink`, the deep link straight to
that URL in the UI. Those are the only ones where a click is worth anything.

Also UI-only: the aggregate Page Indexing report, Links, Manual actions, Security
issues, Removals, Crawl stats, Core Web Vitals (use `site-quality`'s Lighthouse
run for performance), property verification and adding users.

## What the output means

- **Not indexed yet is not a failure.** A new page sits at "Discovered - currently
  not indexed" or "Crawled - currently not indexed" for a while, and `index` exits
  0 for it. It exits non-zero only on a real problem: a fetch failure, a page
  blocked by robots.txt, or a `noindex`.
- **An empty query table is the normal state for a small site.** Google withholds
  queries that too few people searched, so the query dimension stays empty until
  volume grows. Page rows are not anonymized, so read those instead. Table totals
  are always lower than chart totals, and reconciling them is a waste of time.
- **The last day or two is provisional.** `perf` uses `dataState: all` and prints
  the first incomplete date. Search Console runs 2 to 3 days behind.
- **A canonical mismatch** means Google chose a different canonical than the page
  declares. That is worth investigating; it usually means duplicate content.
- Search Console retains 16 months of performance data.

## Quotas

All free, and nothing here is a practical constraint for a small site.

| Call | Limit |
|---|---|
| URL Inspection | **2,000 per property per day**, 600 per minute. A full sweep of an 11-URL sitemap costs 11. |
| Search Analytics | 1,200 queries per minute |
| Sitemaps and sites | 20 per second, 200 per minute |

Only the 2,000 per day figure is worth remembering, and the only way to hit it is
a loop.

## Where this skill lives

It is written to be site-agnostic because it is meant to move to
[`csarkosh/skills-general`](https://github.com/csarkosh/skills-general) and be
reused across sites. Once it lands there, change it there and not in this repo,
the same way `general:doc-preview` is handled today.
