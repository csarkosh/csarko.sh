### Task 8: The bare door's graphic

**Files:**
- Create: `donate/scripts/compose.py`
- Create: `.agents/skills/site-quality/assets/donate/body-of-work.png` (the output, committed)

**Interfaces:**
- Produces: a 1920 by 1080 PNG, in the site's dark palette (`#0a0b0e` background, `#7dd3c0` accent as a thin rule or glow only), composed deterministically by `python3 -I donate/scripts/compose.py` from the committed pictures: the three app heroes (`assets/apps/ide-arkos.png`, `app-macstats.png`, `lib-visits-dark.png`) and the two posters (`assets/films/*.jpg`), laid as five tilted cards fanned left to right, each with a 1px `#1f2430` border and soft shadow, the posters cropped to 4:5, with no words. Shown to Cyrus before committing.

- [ ] **Step 1: Write `compose.py`** (Pillow; fixed seed; every coordinate a constant at the top)

- [ ] **Step 2: Run it, open the PNG, and show Cyrus**

Run: `python3 -I donate/scripts/compose.py && open .agents/skills/site-quality/assets/donate/body-of-work.png`
If he asks for an image model's version instead, the brief is: "a landscape still life of a terminal window, a menu bar gauge, a game controller silhouette in dark woods, and a film clapper, dark teal palette, no text", generated in `~/Projects/film-generation`'s tooling, saved to the same path; the compose script then stays as the fallback and the plan notes which was used.

- [ ] **Step 3: Rebuild the site with the fixture and look at `/`** (Task 7 Step 5)

- [ ] **Step 4: Commit (after Cyrus's OK)**

```bash
git add donate/scripts/compose.py .agents/skills/site-quality/assets/donate/body-of-work.png
git commit -m "donate: the bare door's picture"
```

---

