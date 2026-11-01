# One visit across csarko.sh, apps.csarko.sh and donate.csarko.sh

*2026-11-01. Cyrus: "Investigate adding tracking on all of them so we can follow the full user
journey", then "Build it".*

## What was true before

lib-visits counted csarko.sh alone: the collector allowlisted that one origin, the apps pages
carried no script by rule, and the donate pages only their own. A visitor who clicked an app's
card on `/projects` left the record at that click (`app-<slug>`, with the URL); what they did on
the app's page, and whether they tipped, was unknown.

## The finding that made it small

A lib-visits visit is `HMAC(day salt, address + browser)`: the host is not in it. The same
person on all three hosts on one day already has one visit id. The collector takes several
`--origin`s. So nothing new identifies anyone; the hosts only have to send their beacons to the
same collector, and the dashboard has to stop assuming one host.

## What was built

- **The collector** allowlists all three origins (`origins` in `_infra/main.tf`). Each site
  rewrites its own `/v` to the Cloud Run service, so every beacon stays same-origin: no CORS, no
  change to any CSP (`script-src 'self'` and `connect-src 'self'` already allow it).
- **The scripts.** The apps and donate builds copy the site's two hashed lib-visits files from
  `public/assets` (the ones `check.py` holds to the vendored bytes) and place them last in the
  body. The two deploy guards allow exactly those two files beside what they allowed before.
- **The events.** On an app's page: `get-<slug>` (the bar's pill), `download-<slug>` (a release
  button; the asset's URL goes with it), `promo-<slug>`, `tokens-<slug>`, `release-<slug>`,
  `source-<slug>`. On the donate pages: `tier-<key>`, `pay-<door>` (the Stripe link is the
  outbound click), `back`, and on `/thanks`, which Stripe returns to with `?door=`, the page's
  script sends `tipped` with the door once the page has loaded: the tip, in the visit that made it.
- **The dashboard.** A step or a page on another host is named with it
  (`apps.csarko.sh/ide-arkos`), so donate's `/` never folds into csarko.sh's; the Pages card
  checks such a path against that host's own sitemap; the Journeys card shows the host on the
  step; the Events card knows the new kinds and `app`. A referrer from csarko.sh onto a subdomain
  is `external` with host `csarko.sh`, which the referrer groups already call `own`.

## The journey it shows

Search → `/projects` → the Arkos card (`app-ide-arkos`) → `apps.csarko.sh/ide-arkos`, time on
it, `get-ide-arkos`, `download-ide-arkos` or `tokens-ide-arkos` → `donate.csarko.sh/arkos`,
`tier-context`, `pay-arkos` out to Stripe → `donate.csarko.sh/thanks` with `tipped`. One visit,
no cookie, nothing stored on the device.

## What stays as it was

No cookies, the `#visits-off` opt-out, Cyrus's own addresses ignored at the collector, local
previews never counted. The 404 page keeps no script. The cross-origin referrer is the origin
alone under the sites' referrer policy, so the dashboard reads the hop from the click's URL on
the same visit, not from the referrer.
