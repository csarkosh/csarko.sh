### Task 10: The dashboard page

**Files:**
- Modify: `admin/public/csarko.sh/page.js:38-40,54,73-107,110,288-305,310`

- [ ] **Step 1: Edits**

- Every `missing(x, 'goatcounter')` becomes `missing(x, 'visits')` (lines 54, 74, 81, 85, 90, 110, 290, 294 and in `healthCard`).
- `CARDS[0].sub` (line 310): `Visits ${rangeText(d)}, against ${previousText(d)}. A visit is one browser on one day; nothing is stored in it.`
- `pagesCard`: add two columns after `visitors`: `{ key: 'engagedMedian', label: 'Median engaged', num: true, render: (v) => isNum(v) ? \`${v}s\` : '' }` and `{ key: 'reached', label: 'Read to the end', num: true, render: (v) => isNum(v) ? pct(v) : '' }`.
- `referrersCard`: after the campaigns block add a folded table `folded('Paths through the site', table([{ key: 'from', label: 'From', render: mono }, { key: 'to', label: 'To', render: mono }, { key: 'visitors', label: 'Visitors', num: true }], refs.paths ?? [], 'No internal navigation in this range.'))` and include it in the returned array.
- `audienceCard`: `sections` gains `['themes', 'Theme'], ['viewports', 'Viewport'], ['touch', 'Input'], ['timezones', 'Timezones']`; the `folded` label becomes `'Countries, screen sizes, browsers, systems, languages, theme, viewport, input, timezones'`; `summary` adds `top('themes')`.
- `eventsCard`'s "Read to the end" note stays: the series name is unchanged.

- [ ] **Step 2: Preview and look**

Run: `nice -n 10 admin/preview.sh --shots 2>&1 | tail -2` then read `/tmp/csarko-sh-admin-preview/csarko-sh-desktop.png` and `csarko-sh-desktop-light.png` (the sample data source renders the cards; `admin/public/sample/` may need `engagedMedian`, `reached`, `paths`, `themes` etc. added to its JSON so the new lines show in the preview: add them).
Expected: the new columns and sections render in both themes; `python3 .agents/skills/site-quality/scripts/check.py --admin` passes.

- [ ] **Step 3: Commit**

```bash
git add admin/public/csarko.sh/page.js admin/public/sample
git commit -m "admin: the csarko.sh dashboard shows what lib-visits adds

Engaged time and the share read to the end on Pages, the site's own
paths on Referrers, theme, viewport, input and timezone on Audience."
```

---

