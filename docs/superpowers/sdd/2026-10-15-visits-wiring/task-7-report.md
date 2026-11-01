# Task 7 report
- RED: firebase.test.mjs alone: `# pass 2`, `# fail 1` (rewrites missing).
- GREEN: `node --test tests/*.test.mjs`: pass 56, fail 0. check.py: "site checks passed (7 warnings)".
- Rewrite hunk: `"rewrites": [{"source":"/v","run":{"serviceId":"csarko-visits","region":"us-west1"}}]` between redirects and headers, 2-space indented.
- AGENTS.md: Analytics section rewritten as "how lib-visits is wired in" (dated 2026-10-15, end state, cutover deploy makes it live); Where-to-look row now the admin dashboard; GoatCounter paragraph replaced by a BigQuery paragraph (bq query over csarko_visits._AllLogs and csarko_history.goatcounter_history, SQL in admin/api/queries/); layout rows 16 and 30 updated.
- Files: firebase.json, AGENTS.md, .agents/skills/site-quality/tests/firebase.test.mjs.
- Self-review: no em-dashes in firebase.json; AGENTS.md has 7 pre-existing em-dashes (lines 1, 19, 151, 403, 416-421, 470) untouched. Remaining GoatCounter mentions are history/outage/backfill only.
- Concerns: bump instructions point to the Task 4 brief (not in AGENTS.md verbatim); the "script budget about 4,063 B" is from the lead's figure, not re-measured.
