# Task 9 report
Implemented donate/deploy.sh (executable) on apps/deploy.sh's pattern, plus one line in .agents/skills/deploy/SKILL.md. Commit: see git log ("donate: the deploy script; it refuses to ship without the month's prices").

Dry run: real run stops at tf() here (terraform: "Backend initialization required", as expected). With a fake terraform on PATH returning the five outputs, it prints project/site/prices and stops at the build: "donate: no prices.json yet; the step has not run. Preview with --prices donate/test/fixtures/prices.json", exit 1.

Guards proved on a throwaway bad.html: email (mailto + address), phone, em-dash, stray <script> and <script src="/evil.js"> all fire; the module app.js and JSON scripts pass. Against the real donate/public, no guard fires.

Deviations: pages carry <script type="application/ld+json">, so the JSON allowance is application/json OR application/ld+json (as the apps script allows ld+json). The em-dash guard uses $'\xe2\x80\x94' so no literal em-dash is in the file. Page list built with a while-read loop (macOS bash 3.2 has no mapfile). Custom-domain hint names the output donate_custom_domain_state, which I did not confirm exists; it is only in a warning message.
Verify: "/" , each <door>/index.html, thanks, icon.svg, app.js byte for byte on default URL (hard) and custom domain (soft); prices.json CORS check with bucket from Terraform (hard failure).
