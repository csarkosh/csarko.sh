# Task 5 report
Status: DONE. Files: .agents/skills/site-quality/scripts/check.py only.
- ANALYTICS = {"endpoint": ...} when provider == "visits", else None; THIRD_PARTY has three empty lists.
- analytics_checks rewritten per the brief's contract, adapted to this file's `pages` dict of name -> (page, html), page.scripts attr dicts, local_path, page_kind(name) == "doc", csp_from_config() -> (_, catch_all) + parse_csp. Three CSP assertions (script/connect/img-src exactly 'self').
- check.py: "site checks passed (7 warning(s))".
- Stale-hash proof (sed on 404.html): exactly 1 FAIL "404.html: ... stale build" (the grep -c in the brief counts "ok" lines too, 78; FAIL lines = 1; the vitals check also mentions "stale build?" but passed).
- Stray script proof (<script defer src="/x.js"> in 404.html): FAIL "404.html: scripts besides the two visits tags: ['/x.js']" plus "every referenced file exists". 404.html restored with git checkout.
- grep -i goatcounter check.py: no matches.
Concerns: none. Research pages' data-goatcounter-click is untouched/ignored.
