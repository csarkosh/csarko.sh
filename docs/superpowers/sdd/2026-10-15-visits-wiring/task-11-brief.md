### Task 11: Documentation

**Files:**
- Modify: `admin/api/README.md` (lines 4, 10, 30-32, 45, 95, 106, the Deploy section), `admin/README.md`, `admin/CONTRACT.md` (lines 18, 29, 83, 93, 106, 116, 125, 188), `README.md`, `.agents/skills/site-quality/SKILL.md`, `.agents/skills/substack-post/SKILL.md` (any GoatCounter mention), `AGENTS.md` (the admin section's GitHub/GoatCounter line and the "Where to look" table, if Task 7 left any)

- [ ] **Step 1: Edit**

Every GoatCounter mention becomes the lib-visits equivalent: the env rows `VISITS_DATASET` (`csarko_visits`), `VISITS_HISTORY_DATASET` (`csarko_history`), `VISITS_HISTORY_UNTIL` (the cutover instant); the dependency list adds `@google-cloud/bigquery`; the contract's `notConfigured.goatcounter` becomes `notConfigured.visits`; the new fields (`pages.rows[].engagedMedian`, `.reached`; `referrers.paths`; `audience.themes|viewports|touch|timezones`) are documented in CONTRACT.md; the admin API README's service-account note lists `bigquery.jobUser`, `logging.viewAccessor` and `dataViewer` on the two datasets. `grep -rni goatcounter admin README.md .agents AGENTS.md | grep -v "history\|backfill\|2026-10-15\|outage"` prints nothing (history mentions are allowed).

- [ ] **Step 2: Commit**

```bash
git add admin/api/README.md admin/README.md admin/CONTRACT.md README.md .agents/skills/site-quality/SKILL.md .agents/skills/substack-post/SKILL.md AGENTS.md
git commit -m "docs: analytics is lib-visits now, everywhere the docs said GoatCounter"
```

---

