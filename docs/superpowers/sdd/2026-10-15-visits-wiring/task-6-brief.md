### Task 6: The event attributes and the regenerated pages

**Files:**
- Modify: `public/index.html` (12 occurrences, lines 342-344, 359, 363, 367, 371, 407, 498-501), `.agents/skills/site-quality/scripts/docs_lib.mjs:757-768,927,1006`, `.agents/skills/site-quality/tests/docs_lib.test.mjs:427,428,434,591`

- [ ] **Step 1: Rename the attribute everywhere**

```bash
sed -i '' 's/data-goatcounter-click=/data-visits-event=/g' public/index.html .agents/skills/site-quality/scripts/docs_lib.mjs .agents/skills/site-quality/tests/docs_lib.test.mjs
grep -rn "goatcounter" public/index.html .agents/skills/site-quality/scripts/docs_lib.mjs .agents/skills/site-quality/tests/docs_lib.test.mjs
```
Expected: the grep prints only the comment at `docs_lib.mjs:757`; rewrite that comment to say `data-visits-event` and that lib-visits binds it.

- [ ] **Step 2: Tests, regenerate, check**

Run: `cd .agents/skills/site-quality && nice -n 10 node --test tests/ 2>&1 | grep -E "^# (pass|fail)"; cd ../../.. && nice -n 10 .agents/skills/site-quality/scripts/generate-assets.sh >/dev/null && nice -n 10 python3 .agents/skills/site-quality/scripts/check.py 2>&1 | tail -1 && grep -rc "data-goatcounter" public | grep -v ":0" | head`
Expected: tests pass, checks pass, no page carries `data-goatcounter`.

- [ ] **Step 3: Commit**

```bash
git add public .agents/skills/site-quality/scripts/docs_lib.mjs .agents/skills/site-quality/tests/docs_lib.test.mjs
git commit -m "site: the tracked clicks carry data-visits-event

The names are unchanged: out-linkedin, nav-film, play-<slug>,
watch-<slug>. The read-<slug> event is the leave beacon's reached-the-end
fact now, synthesised by the dashboard's query."
```

---

