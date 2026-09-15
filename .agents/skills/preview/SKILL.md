---
name: preview
description: >-
  Open, serve, or screenshot the csarko.sh portfolio site locally, before
  anything is deployed. Use whenever the user wants to see, open, preview,
  view, or check the site ("let me see it in Chrome", "how does it look on
  mobile"), and always after editing public/index.html — look at the
  screenshots yourself before reporting a change as done or deploying it.
  Local only; publishing is the deploy skill.
---

# Preview csarko.sh locally

```bash
.agents/skills/preview/scripts/preview.sh           # open public/index.html in Chrome
.agents/skills/preview/scripts/preview.sh --serve   # serve on http://localhost:4173 and open it
.agents/skills/preview/scripts/preview.sh --stop    # stop that server
.agents/skills/preview/scripts/preview.sh --shots   # screenshots, dark + light → /tmp/csarko-sh-preview/
```

- **Plain open (default)** is enough for almost every change: the page is one
  self-contained HTML file plus `me.jpg`.
- **`--serve`** is closer to production (real HTTP, root-relative paths). Use
  it if a change depends on how URLs resolve.
- **`--shots`** writes `desktop.png` (1440px wide) and `mobile.png` (390px) in
  the dark theme, plus `desktop-light.png` and `mobile-light.png`. The page
  follows the visitor's system theme, and the script forces each one, so the
  result doesn't depend on this Mac's setting. **Read the images in both themes
  after any visual change** and look for: a color that didn't adapt (something
  dark-on-dark or a stray dark panel in light mode), text wrapping
  onto a lone word, tags or cards stretching full-width, the hero buttons
  wrapping, the photo crop. Headless Chrome can't make a window narrower than
  ~500px, so the mobile shot renders the page inside a 390px iframe — the grey
  strip to the right is the frame, not a bug.

Every run also prints the **static site checks** (`site-quality` skill: SEO,
performance budgets, accessibility, security headers, 404, and layout at
320–1440px). Treat a `FAIL` as part of the change you're making, not a separate
task: fix it before reporting the change as done. If the change touched the
name, title, tagline, photo, fonts, colors or profile links, walk the
site-quality checklist too, and re-run `generate-assets.sh` rather than editing
anything generated.

Output goes to `/tmp`, never into the repo or onto the Desktop.

## After previewing

Tell the user what changed and what you checked. If it looks right and they
want it live, hand off to the **deploy** skill.
