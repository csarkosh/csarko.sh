---
description: Tip tiers set at 1%, 3% and 10% of the last 30 days' cloud bill, gathered daily from five billing sources and repriced weekly with no hand in the loop.
published: 2026-11-01
categories: Distributed systems, Tooling
related: unlimited-email-aliases-that-scale-to-zero, a-zero-cost-analytics-dashboard-without-cookies
project: none
asks: How do you price a tip jar from your real cloud bill, with no manual updates?
---
# Buy me tokens: tips priced from the cloud bill

**Question:** The apps, the browser game and the short films on this site are free, and they are built with AI and run in the cloud, which is not. How do you let people who find the work useful help cover what it costs, with prices that track the real bill, without anyone having to update them by hand?

**Short answer:** As of Nov 1, 2026, the tip page at donate.csarko.sh prices three tiers as shares of the [pool](#term "The cloud spend of the 30 days ending yesterday, summed across every billing source, less any spend on work that is not public. Each tier is a share of it."): about 1%, 3% and 10%, rounded up to the dollar, plus a box for your own number. A daily job collects the costs from five billing sources into one set of daily rows, and every seven days a step on the same job sums the last 30 days, makes the Stripe prices and payment links, and publishes one JSON file that the static pages read on every visit. Nothing in the loop needs a person: a source that lags holds the turn back, every Stripe call can be repeated safely, and old links retire on their own except the ones the live pages still carry. Because Stripe prints a support email and a support address on every receipt, both point at stand-ins rather than the owner: an email alias at the site's domain and a virtual mailbox.

![Diagram of the pipeline: five billing sources feed a daily snapshot on Cloud Run at 06:00 New York time, which keeps daily rows in Firestore; every 7 days the donate step turns the last 30 days into three tiers, makes Stripe prices and links and writes prices.json to a public bucket, which the donate pages read on every visit before sending a visitor to Stripe's checkout](flow.svg "Teal is the costs coming in once a day; amber is what the weekly turn publishes. The pages have no server: a visit reads one public JSON file and goes to Stripe's hosted checkout.")

**In numbers:**

- **1%, 3% and 10%** of the pool are the three tiers, named for a prompt, a long context window and a whole agent run ([section 1](#a-tip-is-a-visible-share-of-a-visible-bill)).
- **5 billing sources** land in one set of daily rows, gathered by one scheduled run at 06:00 New York time ([section 2](#five-billing-sources-become-one-set-of-daily-rows)).
- **$313.57** was the first pool, Oct 1 to Oct 30, 2026, which priced the tiers at **$4, $10 and $32** ([section 4](#three-tiers-at-1-3-and-10-rounded-up-to-the-dollar)).
- **6 days** is the most the Google Cloud export may lag before a turn waits for it; a failed source may hold a turn up to 3 days ([section 3](#the-pool-is-the-30-days-ending-yesterday-and-a-turn-waits-for-late-data)).
- **0 redeploys** a turn: the pages read the prices live, and the sweep never retires the links the live pages carry ([section 7](#old-links-retire-on-their-own-except-the-ones-the-live-pages-carry)).
- **4 details** Stripe requires on every receipt include a support email and a support address, so both are stand-ins: an alias and a virtual mailbox ([section 8](#an-alias-and-a-mailbox-keep-the-owner-s-details-off-every-receipt)).

## 1. A tip is a visible share of a visible bill

Everything listed on csarko.sh/projects is free to use: the apps are open source, the game runs in a browser, and the films are on YouTube. What is not free is making them. They are built with Claude, rendered and tested on rented GPUs, and served from Google Cloud and AWS, and those bills arrive whether or not anyone pays for the work. The idea behind the tip page is that someone who found one of these useful can cover a slice of what it costs to keep making them, and see exactly what slice they are covering.

So the page does not ask for an arbitrary amount. Each of its seven doors (one per shipped project, and one for the whole body of work) says what the cloud behind all of it cost over the last 30 days, and offers three tiers as shares of that bill. Their names follow the site's habit of measuring work in tokens: **A prompt** is about 1%, **A long context window** about 3%, and **A whole agent run** about 10%. A fourth option is your own number, from $1. There is nothing behind a tip, no perk and no gated feature, and each project carries the link once, as one quiet "Buy me tokens" line in its README and on its app page.

The rest of this doc is how that bill is gathered, turned into prices and kept current without a person in the loop.

## 2. Five billing sources become one set of daily rows

Each provider exposes cost differently, so each has its own collector in the admin API, a Node service on Cloud Run, and each collector's output is reshaped into the same row: a day, a provider, a service, a project and an amount in dollars.

- **AWS** is read through Cost Explorer's `GetCostAndUsage` with daily granularity [1]. Every request costs $0.01 [2], so only the daily snapshot calls it, two or three times a day, and every page view reads the stored result. The service holds no AWS key: it asks Google's metadata server for an identity token for its own service account and exchanges it for short-lived AWS credentials through web identity federation.
- **Google Cloud** is read from its billing export, which writes cost rows into a BigQuery dataset throughout the day [3]. The export is the one source that lags by days rather than hours, which matters for the pool (section 3).
- **GitHub** reports usage through its billing API. The repositories are public, so the net amount is $0 and adds nothing to the pool, but the rows keep the gross for the Billing page.
- **Two GPU and model services** have no daily cost API to call. One publishes only a usage report, so a small Python job on Cloud Run reads it shortly before the snapshot and writes its share into the day's record; the other exposes only a credit balance, so a day's spend is how far the balance fell between two snapshots.
- **The Claude subscription** has no API at all. Its monthly fee is entered by hand on the private Billing page whenever it changes, and the rows spread it evenly over the days of each month, so a 30-day window counts about one month of it.

All of this runs as one daily snapshot. Cloud Scheduler calls the admin API at 06:00 New York time with a signed identity token [4], the handler accepts only that service account's token, and the run collects every source, stores the result as the day's document in Firestore, and then runs the donate step over the assembled rows. Each source is collected on its own, so one that fails is recorded as failed for the day rather than failing the run; the donate step reads that list (section 3). The step's result, including why it held, is stored with the day's snapshot, and its errors go to the service's log.

> **Takeaway:** the expensive and slow sources are read once a day and never on a request. A page view reads stored rows, so reading the AWS bill costs under a dollar a month however often the Billing page is opened.

## 3. The pool is the 30 days ending yesterday, and a turn waits for late data

The window is the 30 days that end the day before the turn, in UTC. On Oct 31, 2026 that was Oct 1 through Oct 30. Yesterday is the last day because a day's costs are still arriving while it lasts. The pool sums every row in the window and leaves out spend tagged to work that is not public, so the bill a tipper sees is the bill of the work they can use.

A turn is due seven days after the last one. On a due day the step runs only if the data is good enough to price:

1. **The Google Cloud export must reach close to the window's end.** The export runs behind, and when it was first switched on it backfilled a month over several days, which Google's documentation allows for: retroactive data can take up to five days to finish exporting [3]. The step therefore holds the turn while the export's newest day is more than 6 days before the window's last day. On the launch day the export reached Oct 24 for a window ending Oct 30, which is inside that tolerance, so the first turn went ahead.
2. **No source may have failed that day.** A failed collector holds the turn, for up to 3 days past its due date; after that the turn goes ahead on what it has, since a stale price is worse than a slightly low one.
3. **Not before the launch day.** A constant names the first day the step may price, so it could be deployed and tested before the page went live.

When a turn is held, the step says why in its result (`waiting on GCP rows through 2026-10-24`, `waiting on aws`), the snapshot stores that, and the next day's run tries again. Nobody has to notice.

## 4. Three tiers at 1%, 3% and 10%, rounded up to the dollar

Each tier is its share of the pool, rounded up to a whole dollar, with $1 as the floor. Rounding up keeps the labels honest: a tier called "about 1%" never comes in under 1%. The first turn, on Oct 31, 2026, priced the window of Oct 1 to Oct 30:

| Tier | Share | Pool | Exact share | Price |
|---|---|---|---|---|
| A prompt | 1% | $313.57 | $3.14 | **$4** |
| A long context window | 3% | $313.57 | $9.41 | **$10** |
| A whole agent run | 10% | $313.57 | $31.36 | **$32** |
| Your own number | any | | | $1 minimum |

The pages show the pool rounded to the dollar in one sentence, "Over the last 30 days the cloud behind all my projects cost $314. Each tier is a slice of that bill.", and the three prices under it. The shares stay fixed and the dollars move with the bill, so a month of heavy GPU rendering raises the prices for a few weeks and a quiet month lowers them.

## 5. Stripe objects are looked up before they are made

The checkout is Stripe's hosted page, reached through a Payment Link: a URL that opens a checkout for fixed line items, with no server of ours in the path [5]. Setting a link's submit type to `donate` gives it a Donate button and a `donate.stripe.com` address [6]. Each turn needs, for each of the four options, a Product (made once and reused), a Price for the period, and a link per project page: 4 links for each of 7 doors, 28 a period.

A step that runs on a schedule must survive being run twice, and a turn can be interrupted halfway by a timeout or an error. So before it creates anything, the step looks for what an earlier run already made: a product by its metadata, a price by a lookup key that names the period and the tier (`donate:2026-10-31:prompt`), and a link by its period, door and tier in its metadata. Only what is missing is created.

Each create also carries an idempotency key, but the key alone was not enough. Stripe saves the first answer to a key and replays it for at least 24 hours, a `500` included [7]. A key without a date would make the next day's retry meet the same saved failure, so the keys carry the day (`donate:link:2026-10-31:arkos:prompt:2026-10-31`): they guard a retry inside one run, and the lookups guard everything across runs.

The snapshot route has 60 seconds for everything it does, so the step has to stay well inside that. A first turn is about eight sequential creates for the products and prices, then the four links of each door created at once, one door after another, instead of about thirty calls in a row.

## 6. The pages read one public JSON file

The step's output is one object, `prices.json`, in a public Cloud Storage bucket: the period, the pool, the three prices and every door's four link URLs. It is written only after every create has succeeded, so the pages never see half a turn, and it is served with `Cache-Control: no-cache` so a new turn shows on the next visit.

The pages themselves are static files on Firebase Hosting, with no server and no secret. On load, each page fetches `prices.json` from the bucket, which allows cross-origin `GET` from the donate site's origin [8], and swaps the live prices and links into the page. The build also bakes a copy of the prices it was made from into each page, as a fallback for a visitor whose fetch fails or who runs no scripts; that copy says which day its prices are from. A fetched file is used only when it has an `https://` link for every tier the page shows, so a price and its button can never disagree.

## 7. Old links retire on their own, except the ones the live pages carry

Links and prices of past periods should not pile up in the Stripe account forever, so on a day with no turn due the step sweeps: it deactivates the links and archives the prices of every period repriced more than 35 days before the current one.

The first version of this had a catch. The pages bake in a period's links as their fallback, and the sweep would eventually retire those links, so the site had to be rebuilt and redeployed at least once a month to keep its fallback pointing at live checkouts. That was one more thing for a person to remember, which was exactly what the design was meant to avoid. As of Nov 1, 2026, the sweep reads the period the live front page bakes in, straight from the page's own JSON block, and never retires that period, however old it gets. If it cannot read the page that day, it retires nothing and tries again the next day.

So a turn needs no redeploy. Visitors see the current prices because the pages read them live; the fallback keeps working because its links are spared; and a redeploy is only for changing a project's words or picture. The whole loop, from a GPU bill to the price on the page, runs without anyone touching it.

## 8. An alias and a mailbox keep the owner's details off every receipt

Taking money from strangers has a privacy cost that the rest of this pipeline does not. Stripe shows the account's public business details on the receipts it emails and on card statements, and for compliance every receipt carries a legal business name, a customer support address, a customer support email and a privacy policy link [9]. This tip page is run by one person, not a company with an office and a help desk, so the obvious values would be his own: his personal inbox as the support email and his home address as the support address, sent to everyone who tips and to wherever those receipts are forwarded afterwards. The site already refuses to show an email address or a phone number on any page, for the same reason: spam, and worse.

Two pieces of infrastructure stand in for those details.

- **The support email is an alias.** As of Nov 1, 2026, the Stripe account's support email is a support alias at csarko.sh, one of the domain's [unlimited email aliases](/research/unlimited-email-aliases-that-scale-to-zero), and not the owner's own inbox. Amazon SES receives the mail and one Lambda forwards it to the owner's inbox, and a reply leaves through a reverse alias, so a tipper who writes in and gets an answer only ever sees csarko.sh. An alias that starts drawing spam can be blocked without touching any other address.
- **The support address is a virtual mailbox.** A commercial mail receiving agency, a business that accepts mail on someone else's behalf, gives the account a street address with a private mailbox number. USPS lets it receive a person's mail only after that person completes PS Form 1583 with a primary and a secondary ID and signs it in front of the agency's staff or a notary, and the address must carry "PMB" or "#" [10]. For this account the form was notarized online on Nov 1, 2026, with a passport as the photo ID and a driver's license as the proof of the home address it keeps private. The agency reviews the form before the mailbox opens, and the Stripe support address moves to the mailbox once it does.

The aliases cost a fraction of a cent a message and nothing while idle. What the pair buys is that a tip, the most personal transaction the site has, sends nothing personal back to the person who pays.

## Sources

1. Amazon Web Services, "GetCostAndUsage," AWS Billing and Cost Management API Reference. Accessed: Nov. 1, 2026. [Online]. Available: https://docs.aws.amazon.com/aws-cost-management/latest/APIReference/API_GetCostAndUsage.html
2. Amazon Web Services, "AWS Cost Explorer pricing," AWS. Accessed: Nov. 1, 2026. [Online]. Available: https://aws.amazon.com/aws-cost-management/aws-cost-explorer/pricing/
3. Google Cloud, "Export Cloud Billing data to BigQuery," Cloud Billing documentation. Accessed: Nov. 1, 2026. [Online]. Available: https://docs.cloud.google.com/billing/docs/how-to/export-data-bigquery
4. Google Cloud, "Cloud Scheduler overview," Cloud Scheduler documentation. Accessed: Nov. 1, 2026. [Online]. Available: https://cloud.google.com/scheduler/docs/overview
5. Stripe, "Payment Links," Stripe documentation. Accessed: Nov. 1, 2026. [Online]. Available: https://docs.stripe.com/payment-links
6. Stripe, "Update a payment link," Stripe API reference. Accessed: Nov. 1, 2026. [Online]. Available: https://docs.stripe.com/api/payment-link/update
7. Stripe, "Idempotent requests," Stripe API reference. Accessed: Nov. 1, 2026. [Online]. Available: https://docs.stripe.com/api/idempotent_requests
8. Google Cloud, "Configure cross-origin resource sharing (CORS)," Cloud Storage documentation. Accessed: Nov. 1, 2026. [Online]. Available: https://cloud.google.com/storage/docs/using-cors
9. Stripe, "Receipts and paid invoices," Stripe documentation. Accessed: Nov. 1, 2026. [Online]. Available: https://docs.stripe.com/receipts
10. United States Postal Service, "508 Recipient Services," Mailing Standards of the United States Postal Service, Domestic Mail Manual, sec. 1.8. Accessed: Nov. 1, 2026. [Online]. Available: https://pe.usps.com/text/dmm300/508.htm
