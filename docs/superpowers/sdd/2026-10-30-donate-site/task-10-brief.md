### Task 10: The entrances on csarko.sh and apps.csarko.sh

**Files:**
- Modify: `.agents/skills/site-quality/scripts/docs_lib.mjs` (`tokensLink`, the symbol in `projectsPage`, `PROJECTS_CSS`, `standaloneShell` link icons)
- Modify: `.agents/skills/site-quality/scripts/check.py:59` (`BUDGET_HTML_PROJECTS = 60_000`, dated comment)
- Modify: `apps/product.mjs` (the bar link, the README snippet dropped)
- Modify: `AGENTS.md` (the `tokens-<slug>` events; the `donate/` row; the Infrastructure DNS bullet naming the donate CNAME; the `admin/` row's one clause about the donate step)
- Test: `.agents/skills/site-quality/tests/docs_lib.test.mjs`, `apps/test/product.test.mjs`

**Interfaces:**
- Consumes: `doorOf`, `DONATE_URL` (Task 1, imported from `../../../../admin/api/src/donate/doors.mjs`), `iconSymbol`, `iconUse`, `iconSvg`, `ICON_CSS` (Task 6, from `../../../../donate/icon.mjs`).
- Produces (`docs_lib.mjs`): `tokensLink(project)` → for a project whose `doorOf(project.slug)` is shipped, `<a class="card-tokens" href="${DONATE_URL}${door.path}" data-visits-event="tokens-${project.slug}">${iconUse()}Buy me tokens</a>`, else `''`; `projectCard` puts it last in `.card-links`; `projectsPage` emits `iconSymbol()` once, right after `<main>` opens, when any card has the link; `PROJECTS_CSS` gains `.card-tokens { position: relative; z-index: 1; display: inline-flex; align-items: center; font-size: 14px; font-weight: 400; color: var(--muted); text-decoration: none; }`, `.card-tokens:hover, .card-tokens:focus-visible { color: var(--text); }` and `ICON_CSS`. `standaloneShell`'s `links` tuples accept a fourth element, `icon` (HTML prefixed inside the anchor), and its CSS gains `ICON_CSS`.
- Produces (`product.mjs`): the bar `links` gain `['Buy me tokens', `${DONATE_URL}${door.path}`, true, iconSvg()]` after GitHub and before the release, when the app's door is shipped; `prepareReadme` drops any line that is only a Markdown link whose URL starts with `https://donate.csarko.sh` (with or without an `<img>` in its text) before anything else runs, so the snippet never reaches `imagesOf` or the leftover-HTML check.
- The README snippet, documented in `AGENTS.md` under a new "Buy me tokens" bullet in Content rules, is exactly:

```markdown
[<img src="https://donate.csarko.sh/icon.svg" alt="" height="16"> Buy me tokens](https://donate.csarko.sh/arkos)
```

  placed once, as the last line before the licence section, in each repository's README (the other repositories are follow-ups, not this plan).

- [ ] **Step 1: Write the failing tests**

In `docs_lib.test.mjs`, beside the other `projectsPage` tests, with its `game`, `film` and `app` helpers and `themeBlocks(INDEX)`:

```js
test('every shipped project card carries one quiet Buy me tokens link to its door; Day Hike none yet; the symbol once', () => {
  const html = projectsPage([game('day-hike'), app('ide-arkos', ['repo: https://github.com/csarkosh/ide-arkos']), film('the-last-trail')], themeBlocks(INDEX));
  assert.equal((html.match(/<symbol id="tokens-icon"/g) || []).length, 1);
  assert.ok(html.includes('<a class="card-tokens" href="https://donate.csarko.sh/arkos" data-visits-event="tokens-ide-arkos"><svg class="tokens-icon" aria-hidden="true"><use href="#tokens-icon"/></svg>Buy me tokens</a>'));
  assert.ok(html.includes('href="https://donate.csarko.sh/last-trail" data-visits-event="tokens-the-last-trail"'));
  assert.ok(!html.includes('tokens-day-hike'));
  const card = html.slice(html.indexOf('id="ide-arkos"'), html.indexOf('</li>', html.indexOf('id="ide-arkos"')));
  assert.equal((card.match(/Buy me tokens/g) || []).length, 1);
  assert.ok(html.indexOf('card-source') < html.indexOf('card-tokens'), 'after Source on GitHub');
});
```

In `product.test.mjs`, with the lib-visits `app` object and the `images` map the "productPage puts the buttons in Setup" test builds (copy those two lines):

```js
test('the bar carries Buy me tokens with the icon, and the README snippet is dropped so it reads once', () => {
  const readme = `${README}\n\n[<img src="https://donate.csarko.sh/icon.svg" alt="" height="16"> Buy me tokens](https://donate.csarko.sh/visits)\n\n## License\n\nGPL-3.0\n`;
  const prepared = prepareReadme(readme, { blob: BLOB });
  assert.ok(!prepared.text.includes('donate.csarko.sh'));
  const html = productPage({ app, prepared, release: RELEASE, images, theme: THEME });
  assert.equal((html.match(/Buy me tokens/g) || []).length, 1);
  assert.ok(/<li><a href="https:\/\/donate\.csarko\.sh\/visits" class="external" target="_blank" rel="noopener"><svg viewBox="0 0 32 22" shape-rendering="crispEdges"[^>]*><rect [\s\S]*?<\/svg>Buy me tokens<\/a><\/li>/.test(html));
  assert.ok(html.indexOf('>GitHub</a>') < html.indexOf('Buy me tokens') && html.indexOf('Buy me tokens') < html.indexOf(`>${RELEASE.tag}</a>`));
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test .agents/skills/site-quality/tests/docs_lib.test.mjs apps/test/product.test.mjs`
Expected: the two new tests FAIL.

- [ ] **Step 3: Implement the Interfaces block in `docs_lib.mjs` and `product.mjs`; raise `BUDGET_HTML_PROJECTS` to `60_000` with the comment `# the Buy me tokens link and its one symbol (2026-10-3x)`**

- [ ] **Step 4: Run the tests, rebuild, check, look**

Run: `node --test .agents/skills/site-quality/tests/docs_lib.test.mjs apps/test/product.test.mjs && .agents/skills/site-quality/scripts/generate-assets.sh && python3 .agents/skills/site-quality/scripts/check.py && .agents/skills/preview/scripts/preview.sh --shots`
Expected: PASS; check.py green (`/projects` under budget, the colour rule untouched since the fills are attributes); in the screenshots the line sits after "Source on GitHub", grey, with the icon at text height, both themes, both widths. Then `node apps/build.mjs` and open `apps/public/lib-visits/index.html`: one "Buy me tokens" in the bar, none in the body.

- [ ] **Step 5: Update `AGENTS.md`**: the Events paragraph (`tokens-<slug>`, "a click on a card's Buy me tokens line"); the Layout table's new `donate/` row (what it is, the spec path, the build and deploy commands, "the repo is public, so the door copy is public"); the `admin/` row's clause ("and the `donate` step that sets the month's tip prices, spec `docs/superpowers/specs/2026-10-30-donate-site-design.md`"); the Content rules bullet "Buy me tokens" (the snippet, the one-line rule, the anti-goal in one sentence); the Infrastructure DNS bullet (`donate` CNAME beside `apps` and `admin`).

- [ ] **Step 6: Deploy the site and the apps site** (after Task 9 Step 3 has made donate.csarko.sh live; the links must not lead to a dead host)

Run: `.agents/skills/deploy/scripts/deploy.sh && apps/deploy.sh`
Expected: both verify byte for byte; `curl -s https://csarko.sh/projects | grep -c 'card-tokens'` prints the number of shipped doors on the page (5).

- [ ] **Step 7: Commit**

```bash
git add .agents/skills/site-quality apps/product.mjs apps/test/product.test.mjs AGENTS.md public
git commit -m "Buy me tokens: one quiet line on every project card and apps page"
```

---

