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
.agents/skills/preview/scripts/preview.sh --shots   # screenshots → /tmp/csarko-sh-preview/
```

- **Plain open (default)** is enough for almost every change: the page is one
  self-contained HTML file plus `me.jpg`.
- **`--serve`** is closer to production (real HTTP, root-relative paths). Use
  it if a change depends on how URLs resolve.
- **`--shots`** writes `desktop.png` (1440px wide) and `mobile.png` (390px).
  **Read both images after any visual change** and look for: text wrapping
  onto a lone word, tags or cards stretching full-width, the hero buttons
  wrapping, the photo crop. Headless Chrome can't make a window narrower than
  ~500px, so the mobile shot renders the page inside a 390px iframe — the grey
  strip to the right is the frame, not a bug.

Every run also prints the **static SEO check** (`seo` skill). Treat a `FAIL`
as part of the change you're making, not a separate task: fix it before
reporting the change as done. If the change touched the name, title, tagline,
photo, colors or profile links, walk the seo skill's checklist too — the
script can't tell whether the wording in the tags is stale.

Output goes to `/tmp`, never into the repo or onto the Desktop.

## After previewing

Tell the user what changed and what you checked. If it looks right and they
want it live, hand off to the **deploy** skill.
