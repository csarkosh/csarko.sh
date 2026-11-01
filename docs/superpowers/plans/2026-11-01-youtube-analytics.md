# YouTube Analytics Implementation Plan

**Goal:** The csarko.sh admin page shows, per film, what only the channel owner can see: views and watch time by day, average view duration and percentage viewed, subscribers gained, the retention curve, and where the views came from (traffic source types, and for External the sites and pages, so a Reddit post shows up by its URL).

**Architecture:** The admin API (`csarko-admin` on Cloud Run) calls the YouTube Analytics API v2 with the channel owner's OAuth refresh token, held in Secret Manager as `youtube-oauth` and served as `YOUTUBE_OAUTH`. The token is minted once on Cyrus's Mac by a small consent script that writes it straight into Secret Manager, so it never passes through a terminal, a chat or Terraform. A new collector refreshes the access token by hand (no Google auth library, as `gsc.mjs` does), a new query `films` serves the page, and the csarko.sh page gets a Films card. The Data API key collector (`youtube.mjs`) is unchanged and still gives the public counts and the video list.

**Phase 2 of** `docs/superpowers/specs/2026-10-12-admin-dashboard-design.md` (the "YouTube Analytics API" row).

## Global constraints

- **Nothing about how a film was made reaches anything public.** This is all behind the admin sign-in; the numbers are the channel's, not the pipeline's.
- **No secret passes through Claude.** Cyrus downloads the OAuth client JSON and runs the consent script himself; Claude never reads, prints or types the client secret or the refresh token. Claude may drive the Cloud console in Chrome (navigate, read, fill names), and Cyrus presses every Create, Publish, Download and Allow.
- The client JSON lives at `~/.config/csarko-sh/youtube-oauth-client.json` (mode 600), outside the repo, beside `gsc-sa.json`. Never committed.
- Only the read-only scope `https://www.googleapis.com/auth/yt-analytics.readonly`.
- Work on a branch `yt-analytics` in `.worktrees/yt-analytics`, from a fresh `origin/master`. Commit or push only when Cyrus asks.

## Facts the plan depends on

- **The consent screen must be "In production", not "Testing".** A Testing app's refresh tokens expire after 7 days, and the card would go dark a week after launch. Production with a sensitive scope and no verification is allowed for the app's own developer: Google shows a "Google hasn't verified this app" screen, Cyrus clicks Advanced and continues. Verification is only needed past 100 users.
- **User type External.** The channel is on a personal Google account, which cannot use Internal.
- **Client type Desktop app**, so the consent script can use a loopback redirect (`http://127.0.0.1:<port>`) with PKCE.
- **If the channel is a Brand Account**, the consent screen asks which channel; pick @csarkosh.
- **Data lags.** Analytics data is usually complete 2 to 3 days behind (at first planned as 1 to 2; on 2026-11-01 the API had no rows for 30 Oct 38 hours after it ended, so the range ends three days back). The card says so, like Search Console's lag line.
- **Report shapes** (all `GET https://youtubeanalytics.googleapis.com/v2/reports`, `ids=channel==MINE`):
  - Per video totals: `dimensions=video`, `metrics=views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,likes,shares,comments`, `filters=video==<id,id,...>`.
  - By day: `dimensions=day`, same metrics, `filters=video==<id>`.
  - Retention: `dimensions=elapsedVideoTimeRatio`, `metrics=audienceWatchRatio,relativeRetentionPerformance`, `filters=video==<id>` (one video per call, 100 points; the skill's note on 1% steps applies).
  - Traffic sources: `dimensions=insightTrafficSourceType`, `metrics=views,estimatedMinutesWatched`, `filters=video==<id>`.
  - External detail: `dimensions=insightTrafficSourceDetail`, `filters=video==<id>;insightTrafficSourceType==EXT_URL`, `sort=-views`, `maxResults=25`. This is where each Reddit post appears.
- **The OAuth client cannot be made in Terraform** (no provider resource for a general OAuth client), so it is the one thing made in the console. The API enablement and the secret are Terraform.

## Phase A: console setup, driven in Chrome (about 15 minutes)

Claude opens each page in a new Chrome tab and fills names; Cyrus presses the buttons. If the extension refuses `console.cloud.google.com`, Claude gives the same steps as links instead.

- [ ] **A1. Consent screen.** Google Auth Platform for `csarko-sh` (`console.cloud.google.com/auth/overview?project=csarko-sh`). If it is not configured yet: app name `csarko admin`, support email Cyrus's address (Cyrus picks it from the list), audience **External**, contact email, then **Create** (Cyrus).
- [ ] **A2. Publish.** Audience, Publishing status, **Publish app** (Cyrus), so the refresh token does not expire in 7 days.
- [ ] **A3. Client.** Clients, Create client, type **Desktop app**, name `csarko-admin youtube consent`, **Create** (Cyrus). In the dialog, **Download JSON** (Cyrus), then Cyrus moves it:
  `mv ~/Downloads/client_secret_*.json ~/.config/csarko-sh/youtube-oauth-client.json && chmod 600 ~/.config/csarko-sh/youtube-oauth-client.json`
- [ ] **A4. Check.** Claude confirms the file exists, is mode 600 and has an `installed.client_id`, printing nothing else.

## Phase B: code (branch `yt-analytics`)

- [ ] **B1. Terraform.** In `_infra/modules/gcp-admin-api`: add `youtubeanalytics.googleapis.com` to the enabled APIs; add `youtube-oauth = "YOUTUBE_OAUTH"` to `secret_ids` and `youtube-oauth` to `seeded_secret_ids` (first version `unset`, so the revision deploys before the consent). Update the Secret Manager cost comment: this is one more active version past the free six (about $0.06 a month).
- [ ] **B2. Config.** `readConfig` gains `youtubeAnalytics: parseOAuth(env.YOUTUBE_OAUTH, log)`: JSON `{ client_id, client_secret, refresh_token }`, anything else logged and treated as unset (the `parseServiceAccountKey` pattern). Test in `test/config.test.mjs`.
- [ ] **B3. Collector** `api/src/collectors/youtube-analytics.mjs`: `createYouTubeAnalytics({ oauth, fetch, cache, now })` with `configured`, `totals(ids, start, end)`, `daily(id, start, end)`, `retention(id)`, `sources(id, start, end)`, `external(id, start, end)`. The access token comes from `POST https://oauth2.googleapis.com/token` (`grant_type=refresh_token`), cached 55 minutes. Reports cached one hour (the data moves daily). An `invalid_grant` answer becomes the error "YouTube consent expired or was revoked: run admin/tools/youtube-consent.mjs" instead of a bare 400. Pure mappings (`rowsOf` from the API's `columnHeaders` and `rows`) are exported and tested against recorded fixtures in `api/test/youtube-analytics.test.mjs`.
- [ ] **B4. Which videos are films.** `docs/films/*.md` carry `watch:` (the YouTube URL). The API reads the film list the way the site build does, or from a small `films.json` the deploy writes beside the service; the video id is parsed from `watch`. A video on the channel that is not a film is listed under "Other uploads", never dropped.
- [ ] **B5. Snapshot, so the card loads fast** (Cyrus, 2026-11-01: "make sure it loads quick"). The Analytics numbers move once a day, so the page never waits on YouTube: the daily snapshot (`POST /admin/snapshot`) runs a `films` step that makes every report (totals for 7, 30 and 90 days and the period before each, 90 days of daily rows, the retention curve, the traffic sources and External's URLs, per film) and merges it into the day's document as `films = { at, lag, films: [...] }`, about 20 calls for two films and a few KB. The query reads the latest snapshot, the way `health` and `search` read theirs, so a page load costs one Firestore read and no YouTube call. Before the first snapshot exists the query makes the reports live once (cached an hour). If the day's step fails, the card keeps the last good snapshot and says how old it is, rather than going blank.
- [ ] **B5b. Query** `films` in `QUERY_NAMES`: `GET /admin/query/films?days=7|30|90` answers `{ at, lag, films: [{ slug, title, videoId, published, totals, prev, daily, retention, sources, external }] }` from the snapshot, with `part(h, "youtubeAnalytics", "YOUTUBE_OAUTH", ...)` for the not-configured hint. Retention travels with the rest (100 points a film), so opening a film is instant too. Document the shape in `admin/CONTRACT.md`; add `admin/public/sample/csarko.sh/films.json` for `admin/preview.sh`.
- [ ] **B6. The card** on `admin/public/csarko.sh/page.js`: a Films card with one row per film (views, watch time, average percentage viewed, subscribers gained, each against the previous period), and a film opened shows its daily views, the retention curve (with the 100-step note) and the traffic sources with External's URLs, Reddit's grouped. Use the page's `charts.js`, its skeleton rule (`theme.css` `.skel`, sized to what the card holds) and the dataviz skill. Light and dark.
- [ ] **B7. Consent script** `admin/tools/youtube-consent.mjs` (Node 22, no dependencies): reads the client JSON, starts a loopback server on `127.0.0.1` on a free port, opens the consent URL (`access_type=offline`, `prompt=consent`, the one scope, PKCE S256, a `state` check), exchanges the code, and pipes `{ client_id, client_secret, refresh_token }` to `gcloud secrets versions add youtube-oauth --project=csarko-sh --data-file=-`. It prints only "saved version N" or the error, never a token. `--dry-run` checks the client file and prints the consent URL without the secret parts.
- [ ] **B8. Docs.** `admin/api/README.md` (the route, the secret, the lag, re-running consent), the AGENTS.md admin row, and the spec's Phase 2 row marked built.

## Phase C: switch it on (Cyrus runs the commands that touch secrets and infrastructure)

- [ ] **C1.** `terraform -chdir=_infra plan`, then `apply` (Cyrus): the API enabled, the secret created with `unset`.
- [ ] **C2.** Consent (Cyrus): `! node admin/tools/youtube-consent.mjs`. The browser opens; sign in as the channel's account, pick @csarkosh if asked, Advanced, continue past the unverified notice, Allow. The script saves the secret version.
- [ ] **C3.** Deploy the API (`gcloud run deploy` per `admin/api/README.md`) and the page (`admin/deploy.sh`).

## Phase D: verify

- [ ] **D1.** The Films card shows The Last Trail. Its 28-day views, watch time and average percentage viewed match YouTube Studio's Analytics tab for the same dates within the lag.
- [ ] **D2.** The retention curve has 100 points and matches Studio's shape.
- [ ] **D3.** After the Reddit posts (from 2026-11-02), External lists `reddit.com` pages, one per post that sent views.
- [ ] **D4.** Revoke check: with a wrong refresh token in a local run, the card shows the consent hint, not a 500.

## Decisions (Cyrus, 2026-11-01)

1. **A card on the csarko.sh page**, not a page of its own. A larger refactor of the admin pages is planned separately, outside this project, so the card follows the page as it is and adds no new layout of its own.
2. **It loads fast:** the numbers come from the daily snapshot (B5), never from YouTube on a page load.
