# Buy Me Tokens: the tip page at donate.csarko.sh

*2026-10-29 and 2026-10-30. Cyrus: "The visitor should feel like they're contributing to help
cover my cloud spend; not just donating without any meaning", "I like the joking aspect of it
because it makes it feel fun and personal. It also captures my persona", and, above all,
"I don't want this to feel like I'm begging the user for money and using every opportunity to
throw it in the user's face." Brainstormed in two sittings (the layout on Oct 29, everything
else on Oct 30, with mockups in `.superpowers/brainstorm/`). The Stripe account it sells
through was set up on Oct 29 and 30 (live account, business name csarko.sh, Payments and
Payouts active). The support address it names, support@csarko.sh, is served by the email
aliases of `docs/superpowers/specs/2026-10-30-email-aliases-design.md`.*

## 1. What it is for

One static page, in versions, where someone who got something out of a project can put a few
dollars toward the bill that produced it. The bill is real: every tier on the page is a share
of what all of Cyrus's free, public work cost to run last month, read from the Finance data the
admin dashboard already keeps. The joke is the point and the persona: a tip buys tokens, in the
units the projects are built from (a prompt, a long context window, a whole agent run), and the
prices move with the real bill, which keeps the joke honest.

Every project is a door into the same room. `donate.csarko.sh/arkos`, `/macstats`, `/visits`,
`/dayhike`, `/last-trail` and `/hallway` show the project's own picture and words; the bill,
the tiers and the money are the same. The project in the URL tags the tip, so Cyrus can see
which door people came through, and that is all it does.

### Goals

- A visitor understands in one screen that the price is a slice of a real monthly bill, and
  what slice.
- Paying takes one tap on a tier and one hosted Stripe checkout; no account, no app.
- Prices follow the bill with no hand edits: when a month closes, the next month's prices
  exist without anyone touching anything.
- Each door carries the project's picture so the visitor knows what brought them here.
- The link to a door is easy to find where a person who wants it would look, and invisible to
  everyone else.
- Idle cost $0: static files, a hosted checkout, and a monthly step in a job that already runs.

### Non-goals

- Monthly giving, subscriptions, GitHub Sponsors, memberships, goals or thermometers. One-off
  tips only (Cyrus, Oct 29).
- A public "covered so far" score. Cyrus chose the version that names the bill but not the
  running total (Oct 30: "B, name the bill").
- Perks, tiers that unlock anything, donor lists, names on a wall. A tip buys nothing but the
  thanks.
- Analytics on the donate site. The project tag on each tip is the only funnel measurement;
  the page carries no script that reports anything.
- Covering the future commercial service's costs. Its spend is excluded from the pool
  (section 3) the day it exists.

### Anti-goals

- **Anything that reads as asking.** No modal, no banner, no toast, no first-launch prompt, no
  nag, no animation, no repetition, no counter. One line of text with one small icon, placed
  where "about" and "install" live. If a placement would convert better by being more visible,
  it is still wrong (Cyrus, Oct 30).
- **Anything personal in public.** No home address, phone or personal email on the page, the
  checkout, the receipt or the statement. Stripe's public details already carry the business
  name csarko.sh, the virtual mailbox, support@csarko.sh, and the phone hidden from receipts.
- **A second cost pipeline.** The page reads the Finance data; it never computes spend itself.
- **A server of its own.** No public endpoint that takes input. Stripe's hosted checkout is the
  only thing on the internet that accepts anything.

## 2. The page

One card, layout A from the Oct 29 mockups (the "tip card": one centred column, three tiers and
your own number, one button), in the site's dark theme with its light theme by
`prefers-color-scheme`, built from the site's tokens and fonts the way the apps pages are
(`standaloneShell`: head, tokens, fonts; no nav, trail or wordmark). Top to bottom:

1. **Kicker**, monospace, uppercase: `Buy Me Tokens · Arkos IDE` (the project's name; the bare
   door says `Buy Me Tokens`).
2. **Headline**, the project's line: "Fund my next agent run" for an app, "Fund the next short"
   for a film, and so on. One sentence of copy under it in Cyrus's voice, naming that the
   project is free and what the tip does ("Arkos is free. If it saved you a few hours, cover a
   slice of the cloud bill that builds it and everything else here.").
3. **The picture**, landscape, full card width, under the headline and above the bill
   sentence (Cyrus, Oct 30: "Middle"). It is the project's existing preview from the projects
   page: the app heroes (`.agents/skills/site-quality/assets/apps/<slug>.png`), the films'
   posters cropped on the page to landscape with a per-film focal point so the subject stays in
   frame (Cyrus: "crop the image in the page so it's a landscape fit. Keep the important parts
   uncropped"), and for the bare door a generated landscape graphic that draws on the apps, the
   game, the films and the AI work together, in the site's palette (section 6). Built to the
   same hashed AVIF, WebP and JPEG by the site's asset step. **Landscape only**: the source
   must be wider than tall, or the door must declare a crop (the focal point), in which case
   the cropped frame is what is checked; a door with no picture does not build, and a door
   that does not build gets no Stripe links and no entry in the prices JSON that month.
4. **The bill sentence**, the one line that makes the prices mean something: "Over the last 30
   days the cloud behind all this cost **$288**. Each tier is a slice of that bill." (Cyrus, Oct
   30: the first wording felt too demanding.) The figure is the pool (section 3), rounded to the
   dollar. *(Amended Oct 31: the window in place of the month; it read "In October the cloud
   behind all this cost $288.")*
5. **Three tiers** (Cyrus, Oct 31: the 30% tier was dropped; three tiers and the custom row),
   each a row: the name in bold, a one-line caption under it in the door's words, the price on
   the right in monospace accent, and under the price its share: "about 1%", "about 3%", "about
   10%". The second tier is selected by default. The names are the same on every door, because
   everything here is built with tokens: **A prompt**, **A long context window**, **A whole
   agent run**. Only the captions change per door (Arkos: "a quick fix, a good question", "a
   whole feature, read end to end", "a milestone, start to merge"; a film: "one more take", "a
   scene, start to end", "a cut").
6. **A fourth, dashed row**: "Your own number", any amount.
7. **One button**: "Tip $9" (the selected tier's price). It opens that tier's Stripe Payment
   Link in the same tab.
8. **Footer**: "Payments by Stripe · no account needed".

No GitHub button (dropped Oct 30), no meter, no score, no social links, no counter.

**After paying.** Stripe's checkout redirects to `donate.csarko.sh/thanks?door=<project>`: the
same shell, "Tokens received. The next agent run is on you." (the door's own line), and one
link back to the project the visitor came from (its apps page, the game, the film). Stripe
emails the receipt, which shows csarko.sh, the mailbox address and support@csarko.sh, nothing
else; the statement reads `CSARKO* DONATION` (Cyrus, Oct 30: "I prefer CSARKO* DONATION", so a
donor's card statement says what the charge was, not the page's joke): the account's shortened
descriptor is already `CSARKO` (set Oct 30), so each link's
`payment_intent_data.statement_descriptor_suffix` is `DONATION`. (Receipts for successful payments are a Stripe setting, "Customer emails"; turning it
on is Cyrus's click, section 8.)

**Doors**, by URL, in the order they ship:

| Door | URL | Picture | Ships |
|---|---|---|---|
| Arkos IDE | `/arkos` | its landscape hero | first |
| MacStats | `/macstats` | its menu-bar hero | first |
| lib-visits | `/visits` | its journey hero | first |
| The Last Trail | `/last-trail` | poster, cropped landscape on the page | with the apps |
| Who is standing in my hallway? | `/hallway` | poster, cropped landscape on the page | with the apps |
| The whole body of work | `/` | the generated graphic (section 6) | with the apps |
| Day Hike | `/dayhike` | a screenshot Cyrus is yet to make | last (Cyrus: "hold off on that one and do it last") |

The door slugs are mine (short, human, no prefixes); every project card's slug maps to one.
`/film` is not a door: it was the Oct 29 name for The Last Trail when there was one film.

## 3. The bill: one pool, exponential shares

**The pool** is the total spend on everything Cyrus gives away, as the Finance page counts it:
every provider (AWS, GCP, GitHub, Modal, fal, Claude Code), every category including the fixed
ones (domains, the Claude Code subscription), net of credits, in USD, over the 30 days ending
yesterday (UTC), summed from the Finance page's daily rows *(amended Oct 31: Cyrus chose a
rolling 30-day bill repriced weekly so the site could launch without waiting for a closed month;
it was the calendar month that most recently closed)*. It is one number for every door (Cyrus: "It should
be my total spend across all my work. I view things like tipping on Arkos IDE / MacStats /
Films / etc as different funnels for tipping").

**The exclusion.** The Finance page's project axis (`admin/api/src/finance/projects.mjs`:
Films, Day Hike, csarko.sh and admin, Other) gains a fifth key, `commercial`, with no rules
yet. The pool is every project except `commercial`. When the commercial service exists, its
providers, GCP project ids, repositories or Modal apps are routed to that key and leave the
pool the same day (Cyrus: "I want its operational costs excluded from the tipping. Tipping
should just be for work I put out for free for the public benefit"). The Finance page itself
keeps showing it.

**The shares.** Three tiers at 1%, 3% and 10% of the pool (Cyrus, Oct 31: the 30% tier was
dropped; three tiers and the custom row). They began as four (Cyrus, Oct 30: "4 exponentially
increasing percentiles"; the ratio is mine, about threefold per step, close to the $3, $10, $25,
$100 ladder he picked on the mockup). Each price is the pool times its share, **rounded up to
the next whole dollar**, and labelled "about 1%" and so on (Cyrus: "Round-up to the nearest
dollar and say about 1%"). A $287.40 month gives $3, $9 and $29. The lowest tier floors at $1 so
a small month cannot fall under Stripe's minimum charge (my call). The fourth row is a Stripe
"customer chooses what to pay" price with a $1 minimum and no preset (my call).

**When they change.** Every seven days from the last repricing (`REPRICE_DAYS`), each turn
pricing the window that ends the day before *(amended Oct 31: Cyrus chose a rolling 30-day bill
repriced weekly so the site could launch without waiting for a closed month; it was once a month,
on or after the 3rd)*. The GCP billing export runs a day or two behind, so a due turn waits until
the export has rows through six days before the window's end (six days behind is the most
tolerated, Cyrus, Oct 31, to launch that day); a failed collector holds a due turn up to three days, then it runs with what is
there. A turn names its period by the day it ran (`repricedOn`). (The Finance data's "partial"
mark means something else: months before the GCP export began on 2026-10-29.)

**The first pool and the launch** (Cyrus, Oct 30: "Go with option 2"; *amended Oct 31: Cyrus
chose a rolling 30-day bill repriced weekly so the site could launch without waiting for a closed
month*). The first day the step may price is the launch day, 2026-10-31 (`DONATE_FROM`; a run
before it prices nothing). Its window is Oct 1 to Oct 30. The export backfilled October on its
own, so no hand load is needed. The site does not ship with a hand-typed or seeded pool: it
launches once the step's first run has written the JSON.

## 4. The monthly step and the money

Nothing new runs on a schedule. The admin snapshot (Cloud Scheduler `csarko-admin-snapshot`
calling the admin API's snapshot route once a day) gains one idempotent step, **donate**:

1. If the current period is under seven days old and has prices for every door that builds,
   stop (a door added between turns gets the current period's links at the next snapshot).
2. Before the launch day, stop. If a turn is due and GCP's export has no rows through six days
   before the window's end, stop. If a turn is due and any configured provider's collector failed
   today, stop and try tomorrow, up to three days late; then run with what is there. *(Amended
   Oct 31: a rolling 30-day bill repriced weekly; it was the 3rd to the 7th of each month.)* A provider that is not configured,
   and a Claude Code fee with no entry for the month, contribute $0 and the Finance page's own
   "not configured" and "missing" marks say so; the step does not second-guess them.
3. Read the pool (section 3), compute the three prices.
4. In Stripe, with a restricted key that may write payment links, prices and products and
   nothing else (a new Secret Manager secret on the API, like the read-only Stripe key the
   income collector uses): for each tier, a new Price on that tier's Product (one Product per
   tier, created once: "A prompt", "A long context window", "A whole agent run";
   and one "Your own number" Product whose Price has `custom_unit_amount` enabled with the $1
   minimum), then for each door and each tier a Payment Link whose metadata and whose
   `payment_intent_data.metadata` carry `door`, `tier`, `period` (the day the period was repriced
   on; `month` until Oct 31) and `share`, whose
   `after_completion` redirects to the thanks page with the door, and which collects the
   payer's email for the receipt (Stripe's default). Four links per door, six shipped doors
   today: 24 links a month, seven doors and 28 links with Day Hike.
5. A period's links stay live for 35 days after the current period's repricing (`KEEP_DAYS`)
   and are swept by the first snapshot that finds the current period done (links
   `active: false`, Prices archived: every period repriced more than 35 days before the current
   one), so the baked fallback on the deployed pages pays for a month after a turn. *(Amended Oct
   30 after the branch review: the sweep retired them the day after the new month published.
   Amended Oct 31 for the weekly turn: it kept one previous month.)*
6. Write **one JSON** the page reads: the `period` (`{ from, to, repricedOn }`, amended Oct 31
   from the month), the pool rounded to the dollar, and per door the four prices, shares and link
   URLs. It is published to a public Cloud Storage object (served with Cache-Control no-cache,
   since a cached copy can lack its CORS header; Oct 31) with
   CORS for `https://donate.csarko.sh` (my call; a Hosting rewrite cannot reach a bucket, and the
   admin API stays private). The page fetches it at load; if the fetch fails, the page shows the
   last prices baked into its build and a plain "Prices are from <Month D>." line (the day they
   were repriced on), never an empty card.

The step is a module next to the Finance ones (`admin/api/src/donate/`), pure functions over
the Finance rows and Stripe's objects, with the Stripe calls behind the same collector shape as
`collectors/stripe.mjs`. It writes its last run into the daily snapshot so the Finance page can
show when prices last turned and refuse a second run in a month: the snapshot record is
`{ period, pool, at, doors }` (`month` until Oct 31), and the bucket JSON is the source of truth for the ids.

**The monthly redeploy** *(amended Oct 30 after the branch review)*. The pages bake the month's
prices and links in as their fallback, so `donate/deploy.sh` is re-run after each month's prices
land: a line in Cyrus's monthly routine, on or after the day the Finance page's prices line says
they turned. Until then the fallback points at last month's links, which step 5 keeps live.
*(Amended Oct 31: prices turn weekly, and step 5 keeps a period's links live for 35 days, so one
redeploy within a month of a turn keeps the fallback paying.)*

**Tips as income.** The Finance page's donations (`finance/income.mjs`, amounts and days only)
gain a by-door split read from each payment's `metadata.door`, so the funnels are visible to
Cyrus and to nobody else. No donor identity reaches the page, as the income module already
promises.

## 5. The entrances

The link is the icon (section 6) plus the words **"Buy me tokens"**, once, in the body text's
size and weight, with no colour on the words, nothing animated, nothing that interrupts, nothing
that repeats. It sits where a person who wants it would look and nowhere else. Cyrus set each
placement (Oct 30):

| Project | Where | Door |
|---|---|---|
| Arkos IDE | the About menu, the line under "Made by Cyrus Sarkosh"; the GitHub README; its apps.csarko.sh page | `/arkos` |
| MacStats | the GitHub README; its apps.csarko.sh page; one closing line after a successful install, in the Homebrew caveat and in the agent-driven install's final output (a line, never a question that waits) | `/macstats` |
| lib-visits | the GitHub README; its apps.csarko.sh page | `/visits` |
| Day Hike | bottom left of the title screen, moving under the PARTY widget when the layout collapses; the GitHub README | `/dayhike` |
| The films | one "Buy me tokens" link among the channel's profile links on YouTube; the plain URL as the last line of each Short's description, since YouTube makes URLs in Shorts descriptions non-clickable; the film cards on csarko.sh/projects | `/last-trail`, `/hallway` |
| Every project | its card on `csarko.sh/projects` | its door |

Checked Oct 30: YouTube's External links policy bans links to content that breaks its
Community Guidelines and says nothing against tipping or donation sites; its help page says
URLs in Shorts descriptions and comments are non-clickable, channel pages show up to 14 links,
and long-form descriptions are clickable once a channel has advanced features.

**Scope.** This plan builds csarko.sh's entrances: the line on every project card, the line in
each apps.csarko.sh page's bar (the standalone shell's own element, beside GitHub and the
version), the README snippet's format, and the icon served at `donate.csarko.sh/icon.svg` for
READMEs to embed as an `<img>` (a README cannot inline an SVG). An apps page renders its app's
README in full, so `apps/build.mjs` recognises the snippet by its donate.csarko.sh link and
drops it from the rendered README, leaving the bar's one line (my call: "once" means once on
the page). The entrances in the other four repositories (ide-arkos, app-macstats, lib-visits,
game-dayhike) are built after the site is live, one small change each in its own repository,
following that repository's rules and copying the one snippet.

## 6. The icon and the graphic

**The icon** is a 32-bit style pixel sprite: a shaded red heart (outline, mid-tone, shadow,
two highlight steps) with the cleft at the top cut about a quarter of the way down, and one
gold token tucked at its lower right (Cyrus, Oct 30: option A, "make it 32-bit", "deeper"). One
SVG with `shape-rendering: crispEdges` on a 32 by 22 grid, drawn by hand on that grid (the
mockups were generated as a sketch of the style, not the final pixels), sized to the text's
height (`1em`), sitting on the baseline, with a `0.35em` gap before the words. It is the same
file in every placement; the Day Hike title screen and the Arkos About menu draw it from the
same pixel map in their own toolkits. The heart's cleft, the token's position and the five
colours are fixed in this spec; the exact pixels are the builder's, shown to Cyrus once.

**The bare door's graphic** is a landscape picture, in the site's palette, that says "apps,
a game, films, AI" without words: made either as a composition of the existing project
pictures or by an image model from a brief; the builder chooses, and shows the result to Cyrus
before it ships (my call: nothing generated goes live unseen).

## 7. Infrastructure

- A fourth Firebase Hosting site in the project, `csarko-sh-donate`, as a fourth instance of
  `_infra/modules/gcp-hosting` with `donate.csarko.sh`, its DNS record made the way
  `apps.csarko.sh`'s is, its `firebase.json` entry with the same headers and CSP as the apps
  site plus `connect-src` for the prices object, and its own deploy script
  (`donate/deploy.sh`) on the apps script's pattern: Terraform outputs, guards, deploy, byte
  for byte verification, no email address or phone number anywhere.
- A public Cloud Storage bucket for the prices JSON, CORS for the donate origin, written only
  by the admin API's service account.
- A restricted Stripe key (payment links, prices, products: write) as a Secret Manager secret
  on the admin API, beside the read-only one.
- Everything in Terraform in `_infra`, nothing made by hand. Idle cost: $0 beyond what the
  project already pays.
- Stripe's business website changes from `https://csarko.sh` to `https://donate.csarko.sh`
  once the site is live (the email-aliases spec left it waiting on this).

## 8. Decided, and by whom

By Cyrus (Oct 29 and 30): one-off tips only, Stripe only, no GitHub Sponsors; layout A; the
tip is a share of his total spend on free public work, one pool for every door, the commercial
service excluded; three exponential tiers, rounded up to the dollar, "about n%"
(Cyrus, Oct 31: the 30% tier was dropped; three tiers and the custom row); the bill named
on the card, no running score; the picture under the headline, landscape only, films cropped
on the page with the subject kept; every project gets a door, Day Hike last with his
screenshot; the bare door shows a generated graphic of his interests; a static page and a
job in the daily snapshot, no checkout service; "Buy me tokens" with a 32-bit heart-and-token icon as prefix;
the placements in section 5; the film entrance as suggested; the bill is the last 30 days,
repriced weekly, from the launch day (Oct 31: "Let's go with the rolling last 30 days figure,
repriced weekly"; it was last month's bill, priced on the 3rd, with the launch waiting for
October's prices around Nov 3); the card statement reads CSARKO* DONATION; above all, nothing
that begs.

My calls, open to change: the 1/3/10/30 ratio; the $1 floor and the $1 minimum on the free
row; the door slugs; the same four tier names on every door; the thanks page's copy and the
receipt's contents; the step living in the daily snapshot and publishing one JSON to a public
bucket; the by-door income split; the five fixed icon colours; the bare graphic shown before
shipping.

Cyrus's clicks, not the builder's: turning on Stripe's receipt emails; changing Stripe's
business website to donate.csarko.sh; adding the channel link on YouTube and the URL lines to
the Shorts; the Day Hike screenshot.

## 9. What is left to the builder

The exact pixels of the icon and the bare door's graphic (both shown to Cyrus); the Product and
Price naming in Stripe; the JSON's shape; the prices object's bucket name; how the page bakes
its fallback prices; the per-film focal points; the five repositories' snippets; the thanks
page's link targets per door; the Finance page's by-door donations card.
