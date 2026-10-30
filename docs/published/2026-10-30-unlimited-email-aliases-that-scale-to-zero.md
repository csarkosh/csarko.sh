---
description: Every address at a domain receives mail through SES and one Lambda, about $0.0003 a message and $0 idle. Why Google Cloud cannot, what Cloudflare costs.
published: 2026-10-30
categories: Distributed systems, Tooling
related: cloud-rigs-for-graphics-work, how-codex-embeds-its-browser
---
# Unlimited email aliases that scale to zero

**Question:** A personal domain should accept mail at any address nobody created in advance, deliver it to one existing inbox, let the owner reply from the alias without exposing that inbox, and cost nothing while idle. Which cloud can receive mail without a server, and what does it take to make forwarded mail pass authentication at the destination?

**Short answer:** As of Oct 30, 2026, only two clouds receive mail serverlessly: Amazon SES and Cloudflare Email Routing. Google Cloud has no inbound SMTP service at all. The build here is SES in `us-east-2`, a receipt rule that stores each message in S3 and invokes one Python Lambda, and a DynamoDB table of aliases that are created by their first message. Forwarded mail passes SPF, DKIM and [DMARC](#term "Domain-based Message Authentication, Reporting and Conformance: the policy a domain publishes in DNS saying what a receiver should do with mail whose From domain is not backed by an aligned SPF or DKIM result.") at the destination only because the Lambda rewrites `From` to the alias at the domain, and replies leave as the alias through a [reverse alias](#term "A generated address at the domain that stands for one pair: the alias a message arrived at and the external address it came from. Mail from the owner to it is rebuilt and sent out as the alias.") in `Reply-To`, which works from any mail client and outlives Gmail's January 2027 end of "Send as" for third-party addresses. Measured on real messages, a forward leaves about 2 seconds after SES receives the original and costs about $0.0003. Idle, the system costs $0.

![Diagram of the mail flow in two numbered sequences: receiving, in teal, from a stranger's message through SES inbound, S3, the Lambda, DynamoDB and SES send to the owner's inbox; replying, in amber, from the owner's reply to the reverse alias through SES inbound and the same Lambda's owner check out through SES send to the stranger](flow.svg "Receiving in teal, steps 1 to 6, about 2 seconds from SES receipt to the forward. Replying in amber, steps 1 to 5: the owner's reply comes back through the same Lambda and leaves as the alias, so the stranger only ever sees the domain.")

**In numbers:**

- **2 of 4 clouds** checked can receive mail without a server: SES and Cloudflare. Google Cloud's three compute products each fail a different way ([section 1](#only-aws-and-cloudflare-receive-mail-without-a-server)).
- **$5 a month** is Cloudflare's floor for sending as the alias; receiving there is free and unlimited but needs the zone on Cloudflare DNS ([section 1](#only-aws-and-cloudflare-receive-mail-without-a-server)).
- **1 header change** makes a forward pass DMARC at Gmail: `From` becomes the alias at the forwarding domain, signed by its own DKIM key ([section 3](#a-forward-passes-dmarc-only-when-from-is-rewritten-to-the-forwarding-domain)).
- **60 bits** of token per reverse alias, one token per (alias, sender) pair, and three checks before the Lambda will send as the alias ([section 4](#reverse-aliases-let-any-mail-client-reply-as-the-alias)).
- **1.2 to 2.8 s** from SES's receipt stamp to the forward's send across seven forwards; the Lambda itself ran 0.7 to 1.0 s cold ([section 6](#about-2-seconds-from-receipt-to-forward-most-of-it-the-send)).
- **$0.0003** per forwarded message and **$0.00** idle, against $7 a user a month for the mailbox subscription it replaced ([section 7](#the-bill-a-fraction-of-a-cent-a-message-and-nothing-idle)).

## 1. Only AWS and Cloudflare receive mail without a server

Receiving mail means answering SMTP on port 25 at the host a domain's MX record names. Every serverless compute product speaks HTTP, so the question is which clouds put an SMTP listener in front of one. The facts below were checked on Oct 30, 2026.

**Google Cloud has nothing.** Cloud Run's container contract defines the ingress as requests "proxied as HTTP/1 or gRPC to the container"; the only mention of a custom TCP protocol is for Direct VPC ingress to worker pools, not public traffic [1]. App Engine's legacy Mail API does receive mail, as an HTTP POST to a handler, but only at addresses under the project's `appspotmail.com` domain, only in the default service, and only on first-generation runtimes; its own page says that even on a custom domain you cannot receive at that domain [2]. A Compute Engine VM could run Postfix on port 25, since inbound is a firewall rule, but it is a machine that never scales to zero, and the same page that explains sending says connections to external port 25 are blocked for most projects "because of the risk of abuse", with ports 587 and 465 and third-party relays as the suggested way out [3]. The free tier's one `e2-micro` in three US regions would make the VM cost nothing, but it is still a server to patch and a mail daemon to keep honest [4]. The one serverless shape on Google Cloud is to keep paying for Workspace and read its inbox through the Gmail API and Pub/Sub, which is the subscription the project set out to end.

**Cloudflare does it well, on its own DNS.** Email Routing receives mail at any address on a zone and forwards it, or hands it to an Email Worker; the prerequisite is that the zone's DNS is on Cloudflare, since the service adds the MX, SPF and DKIM records itself [5]. Inbound is unlimited on the Free and Paid plans [6]. An Email Worker's message object exposes the envelope `from` and `to`, the headers and the raw stream, and three verbs: `setReject(reason)` returns a permanent SMTP error, `forward(address)` sends to a verified destination, and `reply(message)` answers the sender, with conditions: a valid DMARC result on the incoming message, one reply per event, the recipient equal to the original sender, the sending domain equal to the receiving one [7]. Cloudflare does the forwarding hygiene for you: SRS rewrites the envelope sender to its own domain so SPF passes downstream, two DKIM signatures are added, and it seals an ARC chain carrying the original authentication results [8]. Sending to anyone else, which replying as an alias is, needs Email Sending on Workers Paid: $5 a month minimum [9], 3,000 sends included, then $0.35 per 1,000 [6]; messages are capped at 5 MiB and an account may name 200 destination addresses [10]. The reason it was not chosen here is the first sentence: the zone lives in Route 53 with a Terraform DNS module, Firebase Hosting records and several subdomains, and moving it would have been the larger project, for a $60 a year floor on the sending side.

**Amazon SES receives, scans and hands off.** An MX record pointing at `inbound-smtp.<region>.amazonaws.com` sends mail to SES, where an ordered rule set decides what to do with each message by envelope recipient: deliver the raw MIME to S3, invoke a Lambda, publish to SNS, bounce, or stop. Recipient conditions match domains and subdomains, and the documentation is explicit that matching uses the SMTP envelope recipients, not the `To` header, so a BCC still arrives [11]. Each message is authenticated (SPF, DKIM, DMARC) and scanned for spam and malware, with the verdicts passed to the rule actions; messages up to 40 MB can land in S3 [11]. Receiving is offered in a short list of regions, `us-east-2` among them [12]. There is no mailbox: SES has no POP or IMAP, so something has to move the mail on [11]. Receiving costs $0.10 per 1,000 messages plus $0.09 per 1,000 chunks of 256 KB; sending costs $0.10 per 1,000 [13]. For a domain whose DNS zone already lives in the same AWS account, that is the whole decision.

| | Receives at any address | Sends as the alias | Monthly floor | Why not |
|---|---|---|---|---|
| Amazon SES (chosen) | Yes, receipt rules to S3 and Lambda | Yes, $0.10 per 1,000 | $0 | |
| Cloudflare Email Routing | Yes, free, unlimited | Workers Paid only | $5 | The zone would move to Cloudflare DNS |
| Google Cloud | No. Cloud Run is HTTP only, App Engine only at `appspotmail.com`, a VM is not serverless | Outbound 25 blocked; a relay is required | $0 for an `e2-micro`, which is still a server | No inbound SMTP service |
| Google Workspace catch-all | Yes, built in | Yes | $7 a user | Nothing to build, and the subscription is the cost |

One more fact shaped the design. Google's own help page says that starting January 2027 Gmail "will no longer support the 'Send as' feature for third-party email addresses", with Workspace aliases exempt [14]. So replying as an alias from a personal Gmail account could not be built on Gmail's "Send mail as" over an SMTP relay. It is built on reverse aliases instead (section 4), which any mail client can use.

## 2. One receipt rule, one Lambda, one table

The whole system is one Terraform module. The receipt rule matches the domain and every subdomain, so each local part works without being created: the first message to an unknown alias creates its row. Two actions run in order: S3 stores the raw message under its SES message id, then the Lambda is invoked asynchronously (the `Event` invocation type, which SES recommends unless the function must steer later rules; synchronous calls carry a 30 second timeout) [15]. The event carries the envelope recipients and the five verdicts but not the body, so the function reads the raw message back from S3 [15].

The function is Python 3.13 on arm64 with the standard library's `email` package and boto3 from the runtime: three files, no layers, 1,024 MB configured and about 105 MB used. For each envelope recipient it looks up `ALIAS#<local>` in a DynamoDB table (on-demand, with a time-to-live matching the S3 lifecycle), creates it in state `forward` if missing, bumps its count, and applies one policy in a fixed order: a blocked alias drops the message and counts it; a virus verdict of `FAIL` drops it and deletes the raw copy; a spam verdict of `FAIL`, or a DMARC failure for a sender domain that publishes `p=reject`, archives it with a flag, stored and listed but not forwarded; an alias in state `archive` (the one that receives DMARC aggregate reports is seeded that way) stores without forwarding; and state `forward` forwards. Every message is indexed under its alias with sender, subject, size, S3 key, verdicts and whether the forward was sent.

Two choices here are worth their reasons. **Blocked aliases drop; they do not bounce.** SES decides whether to accept a message during the SMTP session from the receipt rules alone, before any code runs, so a per-alias bounce would need one rule per blocked alias, regenerated on every block, inside a limit of 200 rules per set. Accepting and dropping costs a ten-thousandth of a cent and tells the spammer nothing. **A failed forward loses nothing.** The raw message is in S3 before the Lambda runs, the index row keeps `forwarded: false`, a configuration set's event destination publishes bounces and complaints to an SNS topic the owner subscribes to, and the function's own failure destination is the same topic. A command-line skill re-runs the forward for one stored message by invoking the Lambda, so the skill itself never holds the owner's address.

> **Takeaway:** the code that matters is under 600 lines of Python, most of it header surgery. The rest of the system is the cloud's: SES authenticates, scans and stores; Lambda runs on demand; DynamoDB and S3 remember.

## 3. A forward passes DMARC only when From is rewritten to the forwarding domain

Forwarding breaks email authentication by construction, and the arithmetic is short. DMARC asks whether the domain in the visible `From` header is backed by an aligned authenticated identifier: either SPF passed for the envelope sender's domain and that domain aligns with the `From` domain, or a DKIM signature verified and its `d=` domain aligns; in relaxed mode the organizational domains have to match, in strict mode the exact names [16]. A plain forward relays a message whose `From` is the stranger's domain. The envelope sender becomes the forwarder's (or, if left alone, fails SPF outright, since the forwarder's IP is not in the stranger's SPF record), so SPF cannot align. DKIM survives only if the forwarder changes nothing the signature covers; add or alter a header, or rewrite the body, and it fails too. When both identifiers fail alignment and the stranger's domain publishes `p=reject` or `p=quarantine`, the destination does what the policy says, and the forwarded message vanishes or lands in spam. DMARC's own text allows receivers to "deviate from a Domain Owner's published policy" because of forwarding, which is a hope, not a mechanism [16].

There are two honest fixes. **ARC** lets an intermediary attach the authentication results it saw and sign a snapshot, so a destination that trusts the intermediary can accept a message whose DKIM it broke [17]; Cloudflare seals ARC on every forward [8]. Trust in the sealer is the catch: a one-domain forwarder has no reputation for Gmail to lean on. **Rewriting `From`** makes the forwarder the author for authentication purposes. That is what this system does, and it is the one header change that makes everything else pass:

- `From` becomes `"<original display name> via <domain>" <alias at the domain>`. The name keeps the sender readable; the address is ours, so SES's DKIM signature for the domain aligns with it. With no display name, the original address stands in as the name.
- The envelope sender is a custom MAIL FROM subdomain of the same domain (`bounce.<domain>`, with the MX and SPF records SES requires), so SPF aligns too under relaxed alignment [18]. SES's default MAIL FROM under `amazonses.com` would pass SPF but could not align.
- `Reply-To` becomes the reverse alias (section 4), so a plain Reply goes back through the system.
- The original `From`, `To`, `Reply-To` and `Cc` move to `X-Original-*` headers. `Cc` and `Bcc` are removed from their own slots because, left in, Reply-all in the owner's client would write to those people straight from the owner's address.
- The old `Return-Path`, `DKIM-Signature` and `Received` chain are dropped; a broken signature is worse than none at some receivers. The body and every other header, including `Subject`, `In-Reply-To` and the `List-*` headers, are untouched.

At the destination the result is three passes: SPF for the bounce subdomain, DKIM for the domain, DMARC aligned on both. The domain's own DMARC record is `p=none` during the cutover, while the old mailbox provider could still send as the domain without an aligned key, and moves to `p=quarantine` once SES is the only sender; one Terraform variable flips the policy and drops the old provider from the SPF record together.

What a `From` rewrite costs is honesty in the header: the owner's inbox shows the alias as the sender, with the stranger's name in front of "via". Gmail's spam classifier still has a say. The first forward from a brand-new alias at the apex was filed as spam, with the explanation "similar to messages that were identified as spam in the past", even with all three checks passing; a filter on the domain with "Never send it to Spam" settled it, and the next probe to another new alias landed under its label in about half a minute.

## 4. Reverse aliases let any mail client reply as the alias

A reverse alias is an address `reply.<token>` at the domain that stands for exactly one pair: the alias a message arrived at and the external address it came from. The token is 12 lower-case base32 characters from the operating system's secure random source, 60 bits. The pair is looked up before a token is minted, so the same correspondent on the same alias always gets the same reverse alias, and a long thread shares one address, which is what lets the inbox thread it. The row stores the pair, its creation time and last use.

When mail arrives for a reverse alias, the Lambda will send as the alias only if three things hold at once: the SMTP envelope sender is the owner's address, the single `From` header is the owner's address, and SES's DMARC verdict for the incoming message is `PASS`, which for a message from Gmail means Gmail's own DKIM signature verified. Anything else is archived under the alias with a `misuse` flag and nothing is sent. That is the control against a stranger guessing a token to send mail as the owner's alias: a guess earns an archived, flagged message. The check also refuses a header block with a malformed line or a second `From`, because a parser differential (SES's and the standard library's reading two different `From` headers) is exactly where such checks fail; that case was found in review and is covered by a test.

The reply is rebuilt, not relayed. From the owner's message the function keeps an allow-list of headers: `Subject`, `In-Reply-To`, `References`, `Date` restated in UTC so the owner's time zone does not travel, and the MIME content headers. Everything else from the owner's provider is dropped: `Received`, `X-Google-*`, `X-Gm-*`, `DKIM-Signature`, `Return-Path`, and the owner's own `Message-ID`. Message ids minted by the owner's provider are also stripped from `In-Reply-To` and `References`, keeping only the ids the thread shares with the stranger. `From` is the alias (with an optional display name from the alias's row), `To` is the external address from the token, a fresh `Message-ID` at the domain is minted, and the body passes through byte for byte. The copy a correspondent receives in the live trial carried one address anywhere in its headers: the alias. The one remaining hint that the owner uses Gmail is the quoted-text markup Gmail puts in the HTML body, which names no address and is the owner's to live with or trim.

Because the whole mechanism is a `Reply-To` header and an inbound rule, it works from Gmail's web and mobile apps, from Apple Mail, from anything, and it is unaffected by the January 2027 removal of "Send as" for third-party addresses [14]. A command-line skill covers the other direction, sending a new message as any alias, writing the same kind of raw copy and index row that the Lambda writes for a reply, and only on the owner's explicit word per message.

## 5. Five things SES taught during the build

Every one of these cost a test, a fix and a redeploy on the day; a reader building the same thing can skip them.

1. **SES replaces `Message-ID` and `Date` on every send.** The SendRawEmail reference says it plainly: SES "automatically applies its own `Message-ID` and `Date` headers; if you passed these headers when creating the message, they are overwritten" [19]. So the stranger's id never reaches the owner's inbox on the forward, and a plain reply would not thread under the stranger's message. The fix is to append the original `Message-ID` to `References` on the forward; the owner's reply then carries it, the rebuilt reply keeps it, and the stranger's client threads it.
2. **SES rewrites the `From` header to the call's from-address.** With the v2 API's `FromEmailAddress` set to the bare alias, the display name written into the raw `From` header arrived stripped. The send has to pass the whole header, name and address, as the from-address parameter.
3. **The Lambda event has no body.** It carries envelope recipients, a few headers and the verdicts, so the S3 action has to run first and the function reads the object back [15]. Invoking asynchronously also means SES's own timeout is not in the path.
4. **Use the envelope, not `To`.** The recipients to act on are the SMTP envelope recipients in the event; a BCC to an alias never appears in the headers [11].
5. **Design for the failed forward.** Sandbox limits, a 10 MB send limit [19] against a 40 MB receive limit [11], or a refused recipient will all fail a send eventually. Storing first, indexing the failure, notifying through SNS and making the re-forward a one-line command turned every such failure into a retry rather than a loss.

The build also kept non-ASCII intact through the rewrite (accented names and bodies arrive as sent), and refused to inspect bodies: if the owner types a private address into a reply, that is theirs to not do.

## 6. About 2 seconds from receipt to forward, most of it the send

Timing comes from SES's `Received` stamp on each stored message and the Lambda's log line for its decision, across the seven forwards of the trial and cutover on Oct 30, 2026. The gap from SES receiving a message to the Lambda logging that the forward was sent ran 1.2 to 2.8 seconds, with 2.2 the typical value. That interval holds the S3 write, the asynchronous invoke, the cold start and the function's own work.

| What | Measured |
|---|---|
| SES receipt stamp to the forward sent | 1.2 to 2.8 s over 7 forwards |
| Lambda duration, cold, forwarding | 0.74 to 1.04 s, of which 87 to 174 ms init |
| Lambda duration, warm | 98 to 317 ms |
| Memory used | 102 to 105 MB of 1,024 configured |
| Visible in the owner's inbox | within about half a minute of the probe being sent, in the one check timed by eye |

The function's time is dominated by the SES send call, which is network round trips to a regional endpoint; parsing and rewriting a small message in pure Python is milliseconds. Cold starts are frequent at this volume, since the function runs a few times a day, and cost about a tenth of a second each. For mail, which people read minutes later, none of this is on the critical path; it is recorded because "serverless is slow" is a common assumption and these are the numbers.

## 7. The bill: a fraction of a cent a message, and nothing idle

Everything here is billed by the message or sits inside a monthly free allowance. SES has no free tier beyond the credits of a new account: receiving is $0.10 per 1,000 messages plus $0.09 per 1,000 chunks of 256 KB (a plain message is one chunk), and sending is $0.10 per 1,000 [13]. A forwarded message is one receive, one chunk and one send: $0.00029. A stranger's message with a reply is two of each: about $0.0006 for the exchange. Lambda's free tier is one million requests and 400,000 GB-seconds a month [20], which a domain receiving a few hundred messages touches at a fraction of a percent; DynamoDB's on-demand requests at this volume came to $0.00000225 on the month's bill as of Oct 30, 2026, with 25 GB of storage free [21]; SNS and CloudWatch Logs are at zero; S3 holds a year of mail at about 100 KB a message for about $0.03 a month per 10,000 messages stored. Idle, the system costs $0.00. The Route 53 zone was already paid for.

| | Idle | Per 1,000 messages |
|---|---|---|
| SES receiving | $0 | $0.10, plus $0.09 per 1,000 chunks of 256 KB |
| SES sending (forwards, replies, the skill) | $0 | $0.10 |
| Lambda | $0 | $0 inside 1 million invocations a month |
| DynamoDB on-demand | $0 | a few millionths of a dollar |
| S3, 365 days of mail at 100 KB each | about $0.03 a month per 10,000 stored | $0 |
| SNS, CloudWatch Logs | $0 at this volume | $0 |

A month of 300 messages in and 300 out, which is generous for a personal domain, comes to about nine cents. Against it stands the mailbox subscription this replaced: Google Workspace's Starter plan at $7 a user a month [22], $84 a year, whose only job for the domain was to answer at the MX record. Cloudflare would have matched SES on receiving at $0 and beaten it on hygiene, but replying as the alias would have carried the $5 a month Workers Paid floor [9], $60 a year, before the first message. The month-to-date figure for the day this was built and cut over, with trial probes, a live Gmail reply and three apex probes, is $0.0018 by the per-message arithmetic.

> **Takeaway:** the saving is not the cents. It is that the system has no monthly line at all, so an alias handed out once for a form or a receipt can live forever at no cost, and be switched off with one command if it starts drawing spam.

## 8. What it does not do, on purpose

No IMAP or POP: the owner's existing inbox is the inbox, and the command-line skill is the second reader. No bounces for blocked aliases, for the reason in section 2. No receiving for a second domain, though the module takes a domain and a second call would do it. No bulk or marketing mail: the system sends forwards and replies. Three aliases are protected from being blocked, the ones RFC 2142 expects a domain to answer (`postmaster`, `abuse`) and the one that archives DMARC aggregate reports, plus any the owner lists because an account depends on it. The owner's forwarding address appears in a git-ignored variables file, the Lambda's environment and one SNS subscription, and nowhere else: not in the public repository, not in a log line, and not in the skill, which is why re-forwarding goes through the Lambda rather than the skill. The same rule holds for this page.

## Sources

1. Google, "Container runtime contract," Cloud Run documentation. Accessed: Oct. 30, 2026. [Online]. Available: https://docs.cloud.google.com/run/docs/container-contract
2. Google, "Receiving email," App Engine standard environment legacy bundled services documentation (Python 2). Accessed: Oct. 30, 2026. [Online]. Available: https://docs.cloud.google.com/appengine/docs/legacy/standard/python/mail/receiving-mail-with-mail-api
3. Google, "Sending email from an instance," Compute Engine documentation. Accessed: Oct. 30, 2026. [Online]. Available: https://docs.cloud.google.com/compute/docs/tutorials/sending-mail
4. Google, "Free cloud features and trial offer," Google Cloud documentation. Accessed: Oct. 30, 2026. [Online]. Available: https://docs.cloud.google.com/free/docs/free-cloud-features
5. Cloudflare, "Route emails," Cloudflare Email Service documentation. Accessed: Oct. 30, 2026. [Online]. Available: https://developers.cloudflare.com/email-routing/get-started/enable-email-routing/
6. Cloudflare, "Pricing," Cloudflare Email Service documentation. Accessed: Oct. 30, 2026. [Online]. Available: https://developers.cloudflare.com/email-service/platform/pricing/
7. Cloudflare, "Runtime API," Email Workers documentation. Accessed: Oct. 30, 2026. [Online]. Available: https://developers.cloudflare.com/email-routing/email-workers/runtime-api/
8. Cloudflare, "Postmaster," Cloudflare Email Service documentation. Accessed: Oct. 30, 2026. [Online]. Available: https://developers.cloudflare.com/email-routing/postmaster/
9. Cloudflare, "Pricing," Cloudflare Workers documentation. Accessed: Oct. 30, 2026. [Online]. Available: https://developers.cloudflare.com/workers/platform/pricing/
10. Cloudflare, "Limits," Cloudflare Email Service documentation. Accessed: Oct. 30, 2026. [Online]. Available: https://developers.cloudflare.com/email-routing/limits/
11. Amazon Web Services, "Amazon SES email receiving concepts and use cases," Amazon Simple Email Service Developer Guide. Accessed: Oct. 30, 2026. [Online]. Available: https://docs.aws.amazon.com/ses/latest/dg/receiving-email-concepts.html
12. Amazon Web Services, "Amazon Simple Email Service endpoints and quotas," AWS General Reference. Accessed: Oct. 30, 2026. [Online]. Available: https://docs.aws.amazon.com/general/latest/gr/ses.html
13. Amazon Web Services, "Amazon SES pricing," AWS. Accessed: Oct. 30, 2026. [Online]. Available: https://aws.amazon.com/ses/pricing/
14. Google, "Send emails from a different address or alias," Gmail Help. Accessed: Oct. 30, 2026. [Online]. Available: https://support.google.com/mail/answer/22370
15. Amazon Web Services, "Invoke Lambda function action," Amazon Simple Email Service Developer Guide. Accessed: Oct. 30, 2026. [Online]. Available: https://docs.aws.amazon.com/ses/latest/dg/receiving-email-action-lambda.html
16. M. Kucherawy and E. Zwicky, "Domain-based Message Authentication, Reporting, and Conformance (DMARC)," RFC 7489, Mar. 2015. Accessed: Oct. 30, 2026. [Online]. Available: https://datatracker.ietf.org/doc/html/rfc7489
17. K. Andersen, B. Long, S. Blank, and M. Kucherawy, "The Authenticated Received Chain (ARC) Protocol," RFC 8617, Jul. 2019. Accessed: Oct. 30, 2026. [Online]. Available: https://datatracker.ietf.org/doc/html/rfc8617
18. Amazon Web Services, "Using a custom MAIL FROM domain," Amazon Simple Email Service Developer Guide. Accessed: Oct. 30, 2026. [Online]. Available: https://docs.aws.amazon.com/ses/latest/dg/mail-from.html
19. Amazon Web Services, "SendRawEmail," Amazon Simple Email Service API Reference. Accessed: Oct. 30, 2026. [Online]. Available: https://docs.aws.amazon.com/ses/latest/APIReference/API_SendRawEmail.html
20. Amazon Web Services, "AWS Lambda pricing," AWS. Accessed: Oct. 30, 2026. [Online]. Available: https://aws.amazon.com/lambda/pricing/
21. Amazon Web Services, "Amazon DynamoDB pricing for on-demand capacity," AWS. Accessed: Oct. 30, 2026. [Online]. Available: https://aws.amazon.com/dynamodb/pricing/on-demand/
22. Google, "Compare flexible pricing plan options," Google Workspace. Accessed: Oct. 30, 2026. [Online]. Available: https://workspace.google.com/pricing
