---
name: publish-doc
description: >-
  Publish a Markdown research doc or spec to csarko.sh/docs. Use whenever the
  user wants to publish, post, add or put a doc, research note, write-up or
  spec on the site ("publish this doc to my site", "add the shader research to
  csarko.sh/docs"), or update or remove a published doc. Not for previewing a
  doc privately (that's general:doc-preview) or for Substack posts.
---

# Publish a doc to csarko.sh/docs

Docs are Markdown files in `docs/published/<YYYY-MM-DD>-<slug>.md`, dated so the
directory reads in publication order. `generate-assets.sh` turns them into
`https://csarko.sh/docs/<slug>`, the `/docs` index, the sitemap and the home
page's "Research & docs" section. **The URL is the slug alone**: the date prefix
belongs to the file name and never appears in a link. The design is in
`docs/superpowers/specs/2026-09-15-docs-section-design.md`.

**The csarko.sh repository is public on GitHub. Committing a file under
`docs/published/` publishes it, before any deploy.** Do the review first.
(`docs/superpowers/` is the other half of `docs/`, and is never published.)

## 1. Review the source before copying anything

Read the whole doc. Stop and ask Cyrus if any of these apply:

- It comes from a **private** repository (check with
  `gh repo view csarkosh/<repo> --json visibility`). Private docs, such as
  `magicpixel.ai`'s, need his explicit OK for that specific doc.
- It describes the **commercial asset pipeline**, unreleased product plans,
  customer names, pricing agreements, credentials, or internal URLs.
- It contains an email address or phone number (never allowed on the site).

## 2. Copy it in with front matter

Name the file `docs/published/<YYYY-MM-DD>-<slug>.md`:

- The **date prefix** is the doc's `published:` date. The build fails if the two
  disagree, so change both or neither. A revision sets `updated:` and leaves the
  file name's date alone.
- The **slug** is lowercase letters, digits and hyphens, and carries no date of
  its own. It alone is the URL: `2026-09-14-stylized-shader-looks.md` is served
  at `/docs/stylized-shader-looks`. Renaming it moves a live URL, so only do that
  on purpose.

```markdown
---
description: <70–160 characters: what a searcher learns from this doc>
published: <YYYY-MM-DD, the doc's original date>
updated: <YYYY-MM-DD, only when revising a published doc>
source: <https://github.com/… URL of the original, only if that repo is public>
---
# <Title>
```

The build refuses: em-dashes (use commas, colons or semicolons), images, links
that aren't `https://`, `#anchor` or `/root-relative`, skipped heading levels,
and more than one `# ` title. Fix the copy, not the build. Number `## ` sections
(`## 1. Outlines`) when the doc is a list of approaches; the number shows as a
label.

To **update** a doc, edit its file and set `updated`. To **remove** one, delete
its file; the build deletes the page.

## 3. Build, check and look

```bash
.agents/skills/site-quality/scripts/generate-assets.sh
.agents/skills/preview/scripts/preview.sh --shots
```

Read `doc-desktop.png`, `doc-desktop-light.png`, `doc-mobile.png` and
`doc-mobile-light.png` (the newest doc; for an older one use
`preview.sh --serve` and open it), plus `desktop.png` for the home section.
The desktop shots are 1440×4000, so a long doc's bottom is cut off in
`doc-desktop*.png`; use `preview.sh --serve` to check the end of a long doc.
`check.py` must pass. A title longer than 65 characters only warns.

## 4. Ship

Commit `docs/published/` and `public/` together, then use the **deploy** skill.
After it's live, remind Cyrus to open Search Console → URL Inspection and
request indexing for the new doc's URL and `https://csarko.sh/docs`.
