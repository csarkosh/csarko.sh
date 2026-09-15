# Docs Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish Markdown research docs at `https://csarko.sh/docs` and `/docs/<slug>`, linked from the home page, held to the site's existing SEO, performance, accessibility and security checks.

**Architecture:** Markdown sources live in `content/docs/`. A Node build (`build_docs.mjs`, pure logic in `docs_lib.mjs`, vendored `marked`) writes doc pages, a docs index, the sitemap and a generated block in `index.html`; `build_assets.py` then fills fonts and analytics into those pages as it already does for `404.html`. `check.py` learns about multiple pages, rebuilds the docs to prove `public/` is fresh, and checks clean-URL links; `preview.sh` gets a Firebase-like local server.

**Tech Stack:** Node 22 (`node:test`, ES modules, `marked` 18 vendored), Python 3 (stdlib only for `check.py` and `serve.py`; `unittest`), Bash, Firebase Hosting (`cleanUrls: true`, `trailingSlash: false`), headless Chrome.

**Spec:** `docs/superpowers/specs/2026-09-15-docs-section-design.md`

## Global Constraints

- Work on branch `docs-section` (already created). Commit after every task. End every commit message with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- Never hand-edit generated output: `public/docs/*.html`, `public/sitemap.xml`, `public/assets/*`, or the contents of any `<!-- generated:… -->` / `/* generated:… */` block. Regenerate with `.agents/skills/site-quality/scripts/generate-assets.sh`.
- No JavaScript on any page except the generated GoatCounter tag. No new third-party origins. The CSP in `firebase.json` does not change.
- Every CSS color is a `var(--token)`; tokens come only from the two theme blocks in `public/index.html`. No hex, `rgb()` or `hsl()` literals in new CSS.
- All links and asset paths on docs pages are root-relative (`/docs/x`, `/assets/…`). Internal links never end in `/` (except `/`) or `.html`.
- Page copy: no email addresses, no phone numbers, no em-dashes (U+2014).
- Budgets: HTML ≤ 50 000 B for the home page, 404 and `/docs`; ≤ 120 000 B for a doc page. JavaScript ≤ 10 000 B. Fonts ≤ 100 000 B.
- Front matter keys: `description` (required, 70–160 characters), `published` (required, `YYYY-MM-DD`), `updated` (optional, `YYYY-MM-DD`, not before `published`), `source` (optional, `https://github.com/…`).
- Canonical URLs: `https://csarko.sh/`, `https://csarko.sh/docs`, `https://csarko.sh/docs/<slug>`. Person `@id` `https://csarko.sh/#person`; WebSite `@id` `https://csarko.sh/#website`.
- Doc ordering everywhere: `published` descending, then slug ascending. The home page shows the 3 newest.
- Outward-facing actions (deploying, editing other repos, Search Console) happen only in Task 11 and only after Cyrus says yes.

## File map

| File | Status | Responsibility |
|---|---|---|
| `.agents/skills/site-quality/scripts/vendor/marked.esm.mjs`, `marked-LICENSE.md` | create (copy) | Markdown parser, MIT |
| `.agents/skills/site-quality/scripts/docs_lib.mjs` | create | Pure functions: front matter, Markdown rendering, page templates, sitemap, `buildSite` |
| `.agents/skills/site-quality/scripts/build_docs.mjs` | create | CLI: read `content/docs/`, write `public/` or `--out <dir>` |
| `.agents/skills/site-quality/tests/docs_lib.test.mjs` | create | `node --test` suite for `docs_lib.mjs` |
| `.agents/skills/site-quality/tests/test_check.py` | create | `unittest` suite for new `check.py` helpers |
| `.agents/skills/site-quality/scripts/build_assets.py` | modify | Fill generated blocks in `public/docs/*.html` too |
| `.agents/skills/site-quality/scripts/generate-assets.sh` | modify | Run `build_docs.mjs` first |
| `.agents/skills/site-quality/scripts/check.py` | modify | Multi-page checks, sitemap, internal links, docs freshness, layout on docs, live and Lighthouse on docs, `--newest-doc` |
| `public/index.html` | modify | `generated:docs` markers, list CSS, section renumbering |
| `.agents/skills/preview/scripts/serve.py` | create | Local server with Firebase clean-URL routing |
| `.agents/skills/preview/tests/test_serve.py` | create | `unittest` suite for `serve.route` |
| `.agents/skills/preview/scripts/preview.sh` | modify | `--serve` uses `serve.py`; `--shots` over HTTP, adds doc shots |
| `.agents/skills/deploy/scripts/deploy.sh` | modify | Privacy scan covers docs; byte-for-byte verify covers docs |
| `content/docs/stylized-shader-looks.md` | create | Launch doc |
| `.agents/skills/publish-doc/SKILL.md` | create | How an agent publishes a doc |
| `AGENTS.md`, `README.md`, `.agents/skills/{site-quality,preview,deploy}/SKILL.md` | modify | Document the docs section |

---

### Task 1: Vendor `marked`; front matter and date helpers

**Files:**
- Create: `.agents/skills/site-quality/scripts/vendor/marked.esm.mjs`, `.agents/skills/site-quality/scripts/vendor/marked-LICENSE.md` (copies)
- Create: `.agents/skills/site-quality/scripts/docs_lib.mjs`
- Test: `.agents/skills/site-quality/tests/docs_lib.test.mjs`

**Interfaces:**
- Produces: `class DocError extends Error`; `escapeHtml(s: string): string`; `parseFrontMatter(text: string, file: string): { meta: { description, published, updated?, source? }, body: string }` (throws `DocError`); `formatDate(iso: 'YYYY-MM-DD'): string` (`'Sep 14, 2026'`); `readingMinutes(words: number): number`; constants `SITE`.

- [ ] **Step 1: Copy the vendored parser**

```bash
mkdir -p .agents/skills/site-quality/scripts/vendor .agents/skills/site-quality/tests
cp ~/Projects/skills-general/plugins/general/skills/doc-preview/scripts/vendor/marked.esm.mjs \
   ~/Projects/skills-general/plugins/general/skills/doc-preview/scripts/vendor/marked-LICENSE.md \
   .agents/skills/site-quality/scripts/vendor/
head -3 .agents/skills/site-quality/scripts/vendor/marked.esm.mjs
```

Expected: the header shows `marked v18.0.13`.

- [ ] **Step 2: Write the failing tests**

Create `.agents/skills/site-quality/tests/docs_lib.test.mjs`:

```js
// Tests for docs_lib.mjs. Run: node --test .agents/skills/site-quality/tests/docs_lib.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DocError, formatDate, parseFrontMatter, readingMinutes } from '../scripts/docs_lib.mjs';

const FILE = 'content/docs/example.md';
const DESC = 'A description that is long enough to pass the seventy character minimum for search.';
const fm = (lines) => `---\n${lines.join('\n')}\n---\n# Title\n\nBody.\n`;
const rejects = (text, pattern) =>
  assert.throws(() => parseFrontMatter(text, FILE), (e) => e instanceof DocError && pattern.test(e.message));

test('parseFrontMatter reads required and optional keys and returns the body', () => {
  const source = 'https://github.com/csarkosh/game-dayhike/blob/main/docs/x.md';
  const { meta, body } = parseFrontMatter(
    fm([`description: ${DESC}`, 'published: 2026-09-14', 'updated: 2026-09-15', `source: ${source}`]), FILE);
  assert.deepEqual(meta, { description: DESC, published: '2026-09-14', updated: '2026-09-15', source });
  assert.equal(body, '# Title\n\nBody.\n');
});

test('parseFrontMatter accepts CRLF line endings', () => {
  const { meta } = parseFrontMatter(fm([`description: ${DESC}`, 'published: 2026-09-14']).replace(/\n/g, '\r\n'), FILE);
  assert.equal(meta.published, '2026-09-14');
});

test('parseFrontMatter rejects bad front matter', () => {
  rejects('# Title\n', /must start with a --- front matter block/);
  rejects(fm(['published: 2026-09-14']), /needs "description"/);
  rejects(fm([`description: ${DESC}`]), /needs "published"/);
  rejects(fm(['description: too short', 'published: 2026-09-14']), /description is 9 characters \(70–160\)/);
  rejects(fm([`description: ${DESC}`, 'published: 2026-02-30']), /published must be a real YYYY-MM-DD date/);
  rejects(fm([`description: ${DESC}`, 'published: 2026-09-14', 'updated: 2026-09-01']), /updated is before published/);
  rejects(fm([`description: ${DESC}`, 'published: 2026-09-14', 'source: https://example.com/x']), /source must be an https:\/\/github\.com\/ URL/);
  rejects(fm([`description: ${DESC}`, 'published: 2026-09-14', 'tags: a']), /unknown front matter key "tags"/);
  rejects(fm([`description: ${DESC}`, 'published: 2026-09-14', 'published: 2026-09-15']), /duplicate front matter key "published"/);
  rejects(fm([`description: ${DESC}`, 'published 2026-09-14']), /is not "key: value"/);
});

test('formatDate and readingMinutes', () => {
  assert.equal(formatDate('2026-09-14'), 'Sep 14, 2026');
  assert.equal(formatDate('2026-01-05'), 'Jan 5, 2026');
  assert.equal(readingMinutes(0), 1);
  assert.equal(readingMinutes(1131), 5);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test .agents/skills/site-quality/tests/docs_lib.test.mjs`
Expected: FAIL with `Cannot find module '…/scripts/docs_lib.mjs'`.

- [ ] **Step 4: Write the implementation**

Create `.agents/skills/site-quality/scripts/docs_lib.mjs`:

```js
// docs_lib.mjs — the pure half of the docs build: content/docs/*.md in, page text out.
// build_docs.mjs does the file I/O. Nothing here reads the clock or the disk, so the same
// sources always produce the same bytes. Tests: ../tests/docs_lib.test.mjs (node --test).
import { Marked } from './vendor/marked.esm.mjs';

export const SITE = 'https://csarko.sh';

export class DocError extends Error {}

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => ENTITIES[c]);

// ---------------------------------------------------------------- front matter

// key -> required?
const FIELDS = { description: true, published: true, updated: false, source: false };

const isDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

export function parseFrontMatter(text, file) {
  const normalized = text.replace(/\r\n/g, '\n');
  const block = /^---\n([\s\S]*?)\n---\n/.exec(normalized);
  if (!block) throw new DocError(`${file}: must start with a --- front matter block`);
  const meta = {};
  for (const line of block[1].split('\n')) {
    if (!line.trim()) continue;
    const kv = /^([a-z]+):\s*(.*)$/.exec(line);
    if (!kv) throw new DocError(`${file}: front matter line is not "key: value": ${line}`);
    const [, key, value] = kv;
    if (!(key in FIELDS)) throw new DocError(`${file}: unknown front matter key "${key}"`);
    if (key in meta) throw new DocError(`${file}: duplicate front matter key "${key}"`);
    meta[key] = value.trim();
  }
  for (const [key, required] of Object.entries(FIELDS)) {
    if (required && !meta[key]) throw new DocError(`${file}: front matter needs "${key}"`);
  }
  const length = [...meta.description].length;
  if (length < 70 || length > 160) throw new DocError(`${file}: description is ${length} characters (70–160)`);
  if (!isDate(meta.published)) throw new DocError(`${file}: published must be a real YYYY-MM-DD date`);
  if (meta.updated !== undefined) {
    if (!isDate(meta.updated)) throw new DocError(`${file}: updated must be a real YYYY-MM-DD date`);
    if (meta.updated < meta.published) throw new DocError(`${file}: updated is before published`);
  }
  if (meta.source !== undefined && !/^https:\/\/github\.com\/\S+$/.test(meta.source)) {
    throw new DocError(`${file}: source must be an https://github.com/ URL`);
  }
  return { meta, body: normalized.slice(block[0].length) };
}

// ---------------------------------------------------------------- small helpers

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const formatDate = (iso) => {
  const [year, month, day] = iso.split('-').map(Number);
  return `${MONTHS[month - 1]} ${day}, ${year}`;
};

export const readingMinutes = (words) => Math.max(1, Math.round(words / 230));
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test .agents/skills/site-quality/tests/docs_lib.test.mjs`
Expected: `# pass 4`, `# fail 0`.

- [ ] **Step 6: Commit**

```bash
git add .agents/skills/site-quality/scripts/vendor .agents/skills/site-quality/scripts/docs_lib.mjs .agents/skills/site-quality/tests/docs_lib.test.mjs
git commit -m "Add docs front matter parsing with a vendored marked

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Render Markdown and load a doc

**Files:**
- Modify: `.agents/skills/site-quality/scripts/docs_lib.mjs` (append)
- Test: `.agents/skills/site-quality/tests/docs_lib.test.mjs` (append)

**Interfaces:**
- Consumes: `DocError`, `escapeHtml`, `parseFrontMatter`, `SITE` from Task 1.
- Produces: `renderMarkdown(body: string, file: string): { title: string, titleHtml: string, html: string, rail: Array<{ id, number, text }>, words: number }`; `loadDoc(slug: string, text: string): Doc` where `Doc = { slug, url, path, description, published, updated?, source?, modified, title, titleHtml, html, rail, words }` (`url` = `https://csarko.sh/docs/<slug>`, `path` = `/docs/<slug>`, `modified` = `updated ?? published`).

Why problems are collected instead of thrown inside renderers: `marked` catches errors thrown from a renderer and appends "Please report this to https://github.com/markedjs/marked." to the message, which would mislead whoever reads the build error.

- [ ] **Step 1: Write the failing tests**

Append to `.agents/skills/site-quality/tests/docs_lib.test.mjs` and extend the import line to `import { DocError, formatDate, loadDoc, parseFrontMatter, readingMinutes, renderMarkdown } from '../scripts/docs_lib.mjs';`:

```js
test('renderMarkdown takes the H1 as the title and numbers H2 sections', () => {
  const r = renderMarkdown('# Shader looks: A & B\n\nIntro.\n\n## 1. Outlines and ink\n\nText.\n\n### Detail\n\n## Sources\n', FILE);
  assert.equal(r.title, 'Shader looks: A & B');
  assert.equal(r.titleHtml, 'Shader looks: A &amp; B');
  assert.deepEqual(r.rail, [
    { id: 'outlines-and-ink', number: '01', text: 'Outlines and ink' },
    { id: 'sources', number: '', text: 'Sources' },
  ]);
  assert.ok(r.html.includes('<div class="section-head"><p class="section-label">01</p><h2 id="outlines-and-ink"><a class="anchor" href="#outlines-and-ink">Outlines and ink</a></h2></div>'));
  assert.ok(r.html.includes('<h3 id="detail"><a class="anchor" href="#detail">Detail</a></h3>'));
  assert.ok(!r.html.includes('<h1'));
  assert.equal(r.words, 8); // Intro. 01 Outlines and ink Text. Detail Sources
});

test('renderMarkdown gives headings unique ids and never reuses "top"', () => {
  const r = renderMarkdown('# T\n\n## Top\n\n## Notes\n\n## Notes\n', FILE);
  assert.deepEqual(r.rail.map((s) => s.id), ['top-1', 'notes', 'notes-1']);
});

test('renderMarkdown marks external links, escapes raw HTML and wraps tables and code', () => {
  const fence = '`'.repeat(3); // a literal triple backtick would end this plan's code block
  const r = renderMarkdown(
    `# T\n\n[Steam](https://store.steampowered.com/app/440/?a=1&b=2), [home](/), [up](#t) and <b>bold</b>.\n\n<div>x</div>\n\n| a |\n| - |\n| b |\n\n${fence}\ncode\n${fence}\n`,
    FILE);
  assert.ok(r.html.includes('<a class="external" href="https://store.steampowered.com/app/440/?a=1&amp;b=2" target="_blank" rel="noopener">Steam</a>'));
  assert.ok(r.html.includes('<a href="/">home</a>'));
  assert.ok(r.html.includes('<a href="#t">up</a>'));
  assert.ok(r.html.includes('&lt;b&gt;bold&lt;/b&gt;'));
  assert.ok(r.html.includes('&lt;div&gt;x&lt;/div&gt;'));
  assert.match(r.html, /<div class="scroll"><table>[\s\S]*<\/table><\/div>/);
  assert.ok(r.html.includes('<div class="scroll"><pre><code>code\n</code></pre></div>'));
});

test('renderMarkdown rejects what the site cannot publish', () => {
  const bad = (md, pattern) =>
    assert.throws(() => renderMarkdown(md, FILE), (e) => e instanceof DocError && pattern.test(e.message) && !/markedjs/.test(e.message));
  bad('No title\n', /needs exactly one "# " title \(found 0\)/);
  bad('# A\n\n# B\n', /needs exactly one "# " title \(found 2\)/);
  bad('# T\n\n### Too deep\n', /heading level skips from h1 to h3/);
  bad('# T\n\n![alt](https://example.com/x.png)\n', /images aren't supported/);
  bad('# T\n\n[other](other.md)\n', /link "other\.md" must be/);
});

const SOURCE = `---\ndescription: ${DESC}\npublished: 2026-09-14\n---\n# Title\n\n## 1. One\n\nText.\n`;

test('loadDoc combines front matter and rendering', () => {
  const d = loadDoc('shader-looks', SOURCE);
  assert.equal(d.slug, 'shader-looks');
  assert.equal(d.url, 'https://csarko.sh/docs/shader-looks');
  assert.equal(d.path, '/docs/shader-looks');
  assert.equal(d.title, 'Title');
  assert.equal(d.description, DESC);
  assert.equal(d.published, '2026-09-14');
  assert.equal(d.updated, undefined);
  assert.equal(d.modified, '2026-09-14');
  assert.equal(d.rail.length, 1);
});

test('loadDoc rejects bad slugs and em-dashes', () => {
  assert.throws(() => loadDoc('Shader_Looks', SOURCE), /lowercase letters, digits and hyphens/);
  assert.throws(() => loadDoc('index', SOURCE), /"index" is reserved/);
  assert.throws(() => loadDoc('x', SOURCE.replace('Text.', 'Text — more.')), /em-dash/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test .agents/skills/site-quality/tests/docs_lib.test.mjs`
Expected: FAIL, `renderMarkdown` / `loadDoc` are not exported (SyntaxError on the import).

- [ ] **Step 3: Write the implementation**

Append to `.agents/skills/site-quality/scripts/docs_lib.mjs`:

```js
// ---------------------------------------------------------------- markdown

const stripTags = (html) => html.replace(/<[^>]+>/g, '');
const DECODE = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" };
const decodeEntities = (text) => text.replace(/&(amp|lt|gt|quot|#39);/g, (_, name) => DECODE[name]);
const plainText = (html) => decodeEntities(stripTags(html));

// The first "# H1" is the title (removed from the body); every "## H2" becomes a section and a
// stop on the contents rail, and "## 1. Title" shows its number as a mono label ("01").
export function renderMarkdown(body, file) {
  const marked = new Marked({ gfm: true });
  const tokens = marked.lexer(body);
  const h1s = tokens.filter((t) => t.type === 'heading' && t.depth === 1);
  if (h1s.length !== 1) throw new DocError(`${file}: needs exactly one "# " title (found ${h1s.length})`);
  tokens.splice(tokens.indexOf(h1s[0]), 1);

  const problems = [];
  const rail = [];
  const slugs = new Map([['top', 1]]); // "top" is the skip link's target
  let lastDepth = 1;

  marked.use({
    renderer: {
      heading({ tokens: inline, depth }) {
        if (depth > lastDepth + 1) problems.push(`${file}: heading level skips from h${lastDepth} to h${depth}`);
        lastDepth = depth;
        let html = this.parser.parseInline(inline);
        let number = '';
        if (depth === 2) {
          const numbered = /^(\d+)\.\s+/.exec(html);
          if (numbered) {
            number = numbered[1].padStart(2, '0');
            html = html.slice(numbered[0].length);
          }
        }
        const base = plainText(html).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section';
        const count = slugs.get(base) ?? 0;
        slugs.set(base, count + 1);
        const id = count ? `${base}-${count}` : base;
        const heading = `<h${depth} id="${id}"><a class="anchor" href="#${id}">${html}</a></h${depth}>`;
        if (depth !== 2) return `${heading}\n`;
        rail.push({ id, number, text: plainText(html) });
        return `<div class="section-head">${number ? `<p class="section-label">${number}</p>` : ''}${heading}</div>\n`;
      },
      html({ text }) {
        return escapeHtml(text);
      },
      image({ href }) {
        problems.push(`${file}: images aren't supported yet (${href})`);
        return '';
      },
      link({ href, title, tokens: inline }) {
        const text = this.parser.parseInline(inline);
        const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
        if (/^https?:\/\//.test(href)) {
          return `<a class="external" href="${escapeHtml(href)}"${titleAttr} target="_blank" rel="noopener">${text}</a>`;
        }
        if (/^#[\w-]+$/.test(href) || /^\/(?!\/)/.test(href)) return `<a href="${escapeHtml(href)}"${titleAttr}>${text}</a>`;
        problems.push(`${file}: link "${href}" must be https://, #anchor or a root-relative /path`);
        return text;
      },
    },
  });

  const titleHtml = marked.parseInline(h1s[0].text);
  const html = marked.parser(tokens)
    .replaceAll('<table>', '<div class="scroll"><table>').replaceAll('</table>', '</table></div>')
    .replaceAll('<pre>', '<div class="scroll"><pre>').replaceAll('</pre>', '</pre></div>');
  if (problems.length) throw new DocError(problems.join('\n'));
  // Tags become spaces here (not in plainText) so "<p>01</p><h2>Title" counts as two words.
  const words = decodeEntities(html.replace(/<[^>]+>/g, ' ')).split(/\s+/).filter(Boolean).length;
  return { title: plainText(titleHtml), titleHtml, html, rail, words };
}

// ---------------------------------------------------------------- one doc

export function loadDoc(slug, text) {
  const file = `content/docs/${slug}.md`;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new DocError(`${file}: file name must be lowercase letters, digits and hyphens`);
  if (slug === 'index') throw new DocError(`${file}: "index" is reserved for the docs index page`);
  if (text.includes('—')) throw new DocError(`${file}: contains an em-dash; use a comma, colon or semicolon`);
  const { meta, body } = parseFrontMatter(text, file);
  return {
    slug,
    url: `${SITE}/docs/${slug}`,
    path: `/docs/${slug}`,
    ...meta,
    modified: meta.updated ?? meta.published,
    ...renderMarkdown(body, file),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test .agents/skills/site-quality/tests/docs_lib.test.mjs`
Expected: `# pass 10`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add .agents/skills/site-quality/scripts/docs_lib.mjs .agents/skills/site-quality/tests/docs_lib.test.mjs
git commit -m "Render docs Markdown with numbered sections and strict link rules

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Page templates, sitemap and `buildSite`

**Files:**
- Modify: `.agents/skills/site-quality/scripts/docs_lib.mjs` (append)
- Test: `.agents/skills/site-quality/tests/docs_lib.test.mjs` (append)

**Interfaces:**
- Consumes: `loadDoc`, `formatDate`, `readingMinutes`, `escapeHtml`, `DocError`, `SITE`.
- Produces: `sortDocs(docs: Doc[]): Doc[]`; `themeBlocks(indexHtml: string): string`; `replaceBlock(html: string, name: string, body: string): string`; `docPage(doc: Doc, theme: string): string`; `indexPage(docs: Doc[], theme: string): string`; `homeSection(docs: Doc[]): string`; `sitemap(docs: Doc[]): string`; `buildSite({ sources: Array<{ slug, text }>, indexHtml: string }): Map<string, string>` with keys `docs/<slug>.html`, `docs/index.html` (only when docs exist), `sitemap.xml`, `index.html`.
- Doc pages contain, empty: `<!-- generated:head -->…<!-- /generated:head -->`, `/* generated:fonts */…/* /generated:fonts */`, `<!-- generated:analytics -->…<!-- /generated:analytics -->` (filled later by `build_assets.py`). Their markup uses `.skip-link` (first in `<body>`), `.nav .wrap`, `.wordmark`, `.nav ul a`, and `<main id="top" tabindex="-1">`, which `check.py`'s accessibility and layout checks rely on.

- [ ] **Step 1: Write the failing tests**

Append to the test file and extend the import to `import { buildSite, DocError, docPage, formatDate, homeSection, indexPage, loadDoc, parseFrontMatter, readingMinutes, renderMarkdown, replaceBlock, sitemap, sortDocs, themeBlocks } from '../scripts/docs_lib.mjs';`:

```js
const INDEX = `<style>
    :root {
      color-scheme: dark;
      --bg: #0a0b0e;
    }
    @media (prefers-color-scheme: light) {
      :root {
        color-scheme: light;
        --bg: #f6f7f9;
      }
    }
  </style>
  <main>
    <!-- generated:docs -->
    <!-- /generated:docs -->
  </main>`;
const src = (slug, published, extra = '') =>
  ({ slug, text: `---\ndescription: ${DESC}\npublished: ${published}\n${extra}---\n# ${slug} title\n\n## 1. One\n\nText.\n` });
const doc = (...args) => { const s = src(...args); return loadDoc(s.slug, s.text); };
const jsonLd = (html) => JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)[1])['@graph'];

test('themeBlocks copies both token blocks verbatim', () => {
  assert.equal(themeBlocks(INDEX),
    ':root {\n      color-scheme: dark;\n      --bg: #0a0b0e;\n    }\n    @media (prefers-color-scheme: light) {\n      :root {\n        color-scheme: light;\n        --bg: #f6f7f9;\n      }\n    }');
  assert.throws(() => themeBlocks('<style></style>'), /theme token blocks not found/);
});

test('replaceBlock swaps what is between markers and requires them', () => {
  assert.equal(replaceBlock('a<!-- generated:docs -->old<!-- /generated:docs -->b', 'docs', 'new'),
    'a<!-- generated:docs -->new<!-- /generated:docs -->b');
  assert.throws(() => replaceBlock('nothing', 'docs', 'x'), /no <!-- generated:docs --> markers/);
});

test('sortDocs orders newest first, then by slug', () => {
  const docs = sortDocs([doc('a', '2026-01-01'), doc('d', '2026-03-01'), doc('c', '2026-02-01'), doc('b', '2026-03-01')]);
  assert.deepEqual(docs.map((d) => d.slug), ['b', 'd', 'c', 'a']);
});

test('docPage has the tags, JSON-LD and markers the checks expect', () => {
  const source = 'https://github.com/csarkosh/game-dayhike/blob/main/docs/x.md';
  const html = docPage(doc('shader-looks', '2026-09-14', `updated: 2026-09-15\nsource: ${source}\n`), themeBlocks(INDEX));
  assert.ok(html.startsWith('<!doctype html>\n<html lang="en">'));
  assert.ok(html.includes('<title>shader-looks title · Cyrus Sarkosh</title>'));
  assert.ok(html.includes('<link rel="canonical" href="https://csarko.sh/docs/shader-looks" />'));
  assert.ok(html.includes('<meta property="og:url" content="https://csarko.sh/docs/shader-looks" />'));
  assert.ok(html.includes('<meta property="og:type" content="article" />'));
  assert.ok(html.includes('<meta property="article:published_time" content="2026-09-14" />'));
  assert.ok(html.includes('<meta property="article:modified_time" content="2026-09-15" />'));
  assert.ok(html.includes('<p class="eyebrow">Research · Sep 14, 2026 · Updated Sep 15, 2026</p>'));
  assert.ok(html.includes(`<a class="external" href="${source}" target="_blank" rel="noopener">Also on GitHub</a>`));
  assert.ok(html.includes('<body class="doc-page">\n  <a class="skip-link" href="#top">Skip to content</a>'));
  assert.ok(html.includes('<main id="top" tabindex="-1">'));
  assert.ok(html.includes('<a href="#one"><span class="num">01</span><span>One</span></a>'));
  for (const marker of ['<!-- generated:head -->\n  <!-- /generated:head -->', '/* generated:fonts */\n    /* /generated:fonts */', '<!-- generated:analytics -->\n  <!-- /generated:analytics -->']) {
    assert.ok(html.includes(marker), marker);
  }
  assert.ok(!/<script(?! type="application\/ld\+json")/.test(html), 'no scripts besides JSON-LD');
  const graph = jsonLd(html);
  const article = graph.find((n) => n['@type'] === 'TechArticle');
  assert.deepEqual(article.author, { '@id': 'https://csarko.sh/#person' });
  assert.deepEqual(article.isPartOf, { '@id': 'https://csarko.sh/#website' });
  assert.equal(article.url, 'https://csarko.sh/docs/shader-looks');
  assert.equal(article.dateModified, '2026-09-15');
  assert.deepEqual(article.sameAs, [source]);
  const crumbs = graph.find((n) => n['@type'] === 'BreadcrumbList').itemListElement.map((i) => i.item);
  assert.deepEqual(crumbs, ['https://csarko.sh/', 'https://csarko.sh/docs', 'https://csarko.sh/docs/shader-looks']);
});

test('indexPage lists every doc with CollectionPage JSON-LD', () => {
  const html = indexPage(sortDocs([doc('a', '2026-01-01'), doc('b', '2026-03-01')]), themeBlocks(INDEX));
  assert.ok(html.includes('<title>Research &amp; docs · Cyrus Sarkosh</title>'));
  assert.ok(html.includes('<link rel="canonical" href="https://csarko.sh/docs" />'));
  assert.ok(html.includes('<meta property="og:type" content="website" />'));
  assert.deepEqual([...html.matchAll(/<h2 class="doc-title"><a href="\/docs\/([a-z]+)">/g)].map((m) => m[1]), ['b', 'a']);
  const page = jsonLd(html).find((n) => n['@type'] === 'CollectionPage');
  assert.deepEqual(page.mainEntity.itemListElement.map((i) => i.url), ['https://csarko.sh/docs/b', 'https://csarko.sh/docs/a']);
});

test('homeSection lists the three newest docs and is empty with none', () => {
  const html = homeSection(sortDocs([doc('a', '2026-01-01'), doc('b', '2026-03-01'), doc('c', '2026-02-01'), doc('d', '2026-03-01')]));
  assert.deepEqual([...html.matchAll(/href="\/docs\/([a-z]+)"/g)].map((m) => m[1]), ['b', 'd', 'c']);
  assert.ok(html.includes('<section id="docs" aria-labelledby="docs-title">'));
  assert.ok(html.includes('<p class="section-label">03 / Research &amp; docs</p>'));
  assert.ok(html.includes('<h2 id="docs-title">Notes from what I\'m researching</h2>'));
  assert.ok(html.includes('<h3 class="doc-title"><a href="/docs/b">b title</a></h3>'));
  assert.ok(html.includes('<a class="all-docs" href="/docs">All docs'));
  assert.equal(homeSection([]), '\n    ');
});

test('sitemap lists home, the index and every doc with lastmod', () => {
  assert.equal(sitemap([]),
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>https://csarko.sh/</loc>\n  </url>\n</urlset>\n');
  const xml = sitemap(sortDocs([doc('a', '2026-01-01'), doc('b', '2026-03-01', 'updated: 2026-04-01\n')]));
  assert.deepEqual([...xml.matchAll(/<loc>(.*?)<\/loc>\n    <lastmod>(.*?)<\/lastmod>/g)].map((m) => [m[1], m[2]]), [
    ['https://csarko.sh/', '2026-04-01'],
    ['https://csarko.sh/docs', '2026-04-01'],
    ['https://csarko.sh/docs/b', '2026-04-01'],
    ['https://csarko.sh/docs/a', '2026-01-01'],
  ]);
});

test('buildSite writes every output, deterministically, and nothing extra with no docs', () => {
  const sources = [src('b', '2026-03-01'), src('a', '2026-01-01')];
  const one = buildSite({ sources, indexHtml: INDEX });
  const two = buildSite({ sources: [...sources].reverse(), indexHtml: INDEX });
  assert.deepEqual([...one.keys()].sort(), ['docs/a.html', 'docs/b.html', 'docs/index.html', 'index.html', 'sitemap.xml']);
  assert.deepEqual(Object.fromEntries(one), Object.fromEntries(two));
  assert.ok(one.get('index.html').includes('<section id="docs"'));
  const empty = buildSite({ sources: [], indexHtml: INDEX });
  assert.deepEqual([...empty.keys()].sort(), ['index.html', 'sitemap.xml']);
  assert.equal(empty.get('index.html'), INDEX);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test .agents/skills/site-quality/tests/docs_lib.test.mjs`
Expected: FAIL, the new names are not exported.

- [ ] **Step 3: Write the implementation**

Append to `.agents/skills/site-quality/scripts/docs_lib.mjs`:

```js
// ---------------------------------------------------------------- pages

const PERSON = `${SITE}/#person`;
const WEBSITE = `${SITE}/#website`;
const OG_IMAGE = `${SITE}/og-image.jpg`;
const OG_IMAGE_ALT = 'Cyrus Sarkosh, Senior Software Engineer in New York, with his portrait';
const LINKEDIN = 'https://www.linkedin.com/in/csarkosh';
const INDEX_TITLE = 'Research & docs';
const INDEX_DESCRIPTION = 'Research notes and specs by Cyrus Sarkosh on game development, generative AI for media, and the software behind them.';
const INDEX_LEAD = 'Research notes and specs from what I build and explore: game development, generative AI for media, and the software behind them.';
const HOME_LIMIT = 3;

export const sortDocs = (docs) =>
  [...docs].sort((a, b) => (a.published === b.published ? (a.slug < b.slug ? -1 : 1) : a.published < b.published ? 1 : -1));

// Doc pages reuse the home page's colors exactly: both token blocks are copied out of index.html.
export function themeBlocks(indexHtml) {
  const dark = /(?<![\w-]):root\s*\{[^}]*\}/.exec(indexHtml);
  const light = /@media\s*\(prefers-color-scheme:\s*light\)\s*\{\s*:root\s*\{[^}]*\}\s*\}/.exec(indexHtml);
  if (!dark || !light) throw new DocError('public/index.html: theme token blocks not found');
  return `${dark[0]}\n    ${light[0]}`;
}

export function replaceBlock(html, name, body) {
  const re = new RegExp(`(<!-- generated:${name} -->)[\\s\\S]*?(<!-- /generated:${name} -->)`);
  if (!re.test(html)) throw new DocError(`public/index.html has no <!-- generated:${name} --> markers`);
  return html.replace(re, (_, start, end) => start + body + end);
}

const jsonLd = (data) => JSON.stringify({ '@context': 'https://schema.org', '@graph': data }, null, 2).replace(/</g, '\\u003c');

const breadcrumbs = (items) => ({
  '@type': 'BreadcrumbList',
  itemListElement: items.map(([name, item], i) => ({ '@type': 'ListItem', position: i + 1, name, item })),
});

const ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

const DOCS_CSS = `
    *, *::before, *::after { box-sizing: border-box; }
    html { scroll-behavior: smooth; scroll-padding-top: 84px; -webkit-text-size-adjust: 100%; }
    body { margin: 0; background: var(--bg); color: var(--text); font-family: var(--sans); font-size: 16px; line-height: 1.7; -webkit-font-smoothing: antialiased; }
    body::before { content: ""; position: fixed; inset: -20vh -10vw auto; height: 70vh; background: radial-gradient(ellipse at 30% 0%, var(--accent-glow), transparent 60%); pointer-events: none; z-index: -1; }
    a { color: inherit; text-decoration: none; }
    a:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; border-radius: 6px; }
    ::selection { background: var(--accent); color: var(--on-accent); }

    .wrap { max-width: 880px; margin: 0 auto; padding-inline: 24px; }
    .doc-page .wrap { max-width: 1120px; }

    .nav { position: sticky; top: 0; z-index: 10; backdrop-filter: saturate(140%) blur(12px); -webkit-backdrop-filter: saturate(140%) blur(12px); background: var(--nav-bg); border-bottom: 1px solid var(--border); }
    .nav .wrap { display: flex; align-items: center; justify-content: space-between; height: 60px; }
    .skip-link { position: absolute; left: 16px; top: -60px; z-index: 100; padding: 8px 14px; border-radius: 8px; background: var(--accent); color: var(--on-accent); font-size: 14px; font-weight: 600; }
    .skip-link:focus { top: 12px; }
    main:focus { outline: none; }
    .wordmark { font-family: var(--mono); font-weight: 500; font-size: 15px; letter-spacing: -0.01em; }
    .wordmark span { color: var(--accent); }
    .nav ul { display: flex; gap: 24px; list-style: none; margin: 0; padding: 0; }
    .nav ul a { color: var(--muted); font-size: 14px; transition: color .15s ease; }
    .nav ul a:hover { color: var(--text); }

    .eyebrow { font-family: var(--mono); font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--accent); margin: 0 0 20px; display: flex; align-items: center; gap: 10px; }
    .eyebrow::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 12px var(--accent); flex: none; }
    .section-label { font-family: var(--mono); font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--faint); margin: 0 0 8px; }
    .doc-header { padding-bottom: 36px; }
    h1 { font-size: clamp(2.2rem, 5.5vw, 3.4rem); line-height: 1.05; letter-spacing: -0.035em; font-weight: 700; margin: 0 0 24px; text-wrap: balance; overflow-wrap: anywhere; }
    .lead { font-size: clamp(1.05rem, 2.2vw, 1.2rem); color: var(--muted); max-width: 60ch; margin: 0; }
    .tags { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; }
    .tags li { font-family: var(--mono); font-size: 12px; color: var(--muted); background: var(--surface-2); border: 1px solid var(--border); padding: 3px 9px; border-radius: 999px; line-height: 1.5; }

    .shell { display: grid; grid-template-columns: minmax(0, 1fr); gap: 64px; padding-block: 72px 96px; }
    .rail { display: none; }
    @media (min-width: 1060px) {
      .shell { grid-template-columns: 230px minmax(0, 72ch); justify-content: center; }
      .shell.no-rail { grid-template-columns: minmax(0, 72ch); }
      .rail { display: block; position: sticky; top: 108px; align-self: start; max-height: calc(100vh - 140px); overflow-y: auto; }
    }
    .rail ol { list-style: none; margin: 16px 0 0; padding: 0 0 0 16px; border-left: 1px solid var(--border-strong); display: grid; gap: 4px; }
    .rail a { display: flex; gap: 10px; padding: 4px 0; color: var(--muted); font-size: 13.5px; line-height: 1.45; transition: color .15s ease; }
    .rail a:hover { color: var(--text); }
    .rail .num { font-family: var(--mono); font-size: 12px; line-height: 1.6; color: var(--faint); flex: none; }

    .section-head { border-top: 1px solid var(--border); padding-top: 48px; margin-top: 56px; }
    .prose h2, .prose h3, .prose h4 { color: var(--text); text-wrap: balance; }
    .prose h2 { font-size: 1.75rem; line-height: 1.2; letter-spacing: -0.025em; font-weight: 600; margin: 0 0 24px; }
    .prose h3 { font-size: 1.2rem; letter-spacing: -0.015em; font-weight: 600; margin: 36px 0 12px; }
    .prose p, .prose li { color: var(--muted); text-wrap: pretty; overflow-wrap: anywhere; }
    .prose > p:first-child { margin-top: 0; }
    .prose strong { color: var(--text); font-weight: 600; }
    .prose ul, .prose ol { padding-left: 1.25em; }
    .prose li { margin: 12px 0; }
    .prose li::marker { color: var(--accent); }
    .prose a:not(.anchor), .author a, .tags a { color: var(--accent); text-decoration: underline; text-decoration-color: var(--accent-underline); text-underline-offset: 3px; transition: text-decoration-color .15s ease; }
    .prose a:not(.anchor):hover, .author a:hover, .tags a:hover { text-decoration-color: var(--accent); }
    a.external::after { content: "↗"; font-size: .72em; margin-left: 2px; vertical-align: .3em; display: inline-block; }
    .prose code { font-family: var(--mono); font-size: .86em; color: var(--text); background: var(--surface-2); border: 1px solid var(--border); border-radius: 6px; padding: .12em .4em; overflow-wrap: anywhere; }
    .scroll { overflow-x: auto; margin: 24px 0; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
    .prose pre { margin: 0; padding: 18px 20px; font-family: var(--mono); font-size: 13.5px; line-height: 1.6; }
    .prose pre code { background: none; border: 0; padding: 0; overflow-wrap: normal; }
    .prose table { border-collapse: collapse; width: 100%; font-size: 14.5px; font-variant-numeric: tabular-nums; }
    .prose th { font-family: var(--mono); font-weight: 500; font-size: 11.5px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--faint); background: var(--surface-2); }
    .prose th, .prose td { text-align: left; padding: 12px 16px; border-bottom: 1px solid var(--border); vertical-align: top; color: var(--muted); }
    .prose tr:last-child td { border-bottom: 0; }
    .prose blockquote { margin: 28px 0; padding: 18px 22px; border: 1px solid var(--border); border-radius: var(--radius); background: linear-gradient(135deg, var(--accent-tint), transparent 55%), var(--surface); }
    .prose blockquote p { margin: 0; }
    .prose hr { border: 0; border-top: 1px solid var(--border); margin: 48px 0; }

    .author { margin-top: 72px; padding: 22px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
    .author p { margin: 0; color: var(--muted); }
    .author .author-name { color: var(--text); font-weight: 600; font-size: 1.05rem; margin-bottom: 4px; }
    .author .author-name a { color: var(--text); text-decoration: none; }
    .author .author-links { margin-top: 12px; font-size: 14px; }

    .docs-index { padding-block: 72px 96px; }
    .doc-list { list-style: none; margin: 0; padding: 0; }
    .doc-list li { padding-block: 18px; border-top: 1px solid var(--border); }
    .doc-list li:first-child { border-top: 0; padding-top: 0; }
    .doc-list .doc-title { margin: 0 0 4px; font-size: 1.2rem; line-height: 1.35; letter-spacing: -0.015em; font-weight: 600; }
    .doc-list .doc-title a { transition: color .15s ease; }
    .doc-list .doc-title a:hover { color: var(--accent); }
    .doc-meta { margin: 0 0 6px; font-family: var(--mono); font-size: 12px; color: var(--faint); }
    .doc-desc { margin: 0; color: var(--muted); }

    footer { border-top: 1px solid var(--border); padding-block: 28px 40px; color: var(--faint); font-size: 13px; }
    footer .wrap { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; }
    footer .mono { font-family: var(--mono); }

    @media (max-width: 640px) {
      .nav ul { gap: 14px; }
      .nav ul a { font-size: 13.5px; }
      .shell, .docs-index { padding-block: 48px 72px; }
      .section-head { padding-top: 40px; margin-top: 44px; }
    }
    @media (prefers-reduced-motion: reduce) {
      html { scroll-behavior: auto; }
      .nav ul a, .rail a, .prose a, .author a, .tags a, .doc-list .doc-title a { transition: none; }
    }`;

function head({ title, ogTitle, description, canonical, ogType, extraMeta = '', graph, theme }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <link rel="canonical" href="${canonical}" />

  <meta property="og:type" content="${ogType}" />
  <meta property="og:site_name" content="Cyrus Sarkosh" />
  <meta property="og:locale" content="en_US" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:title" content="${escapeHtml(ogTitle)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:image" content="${OG_IMAGE}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="${OG_IMAGE_ALT}" />
${extraMeta}  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(ogTitle)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${OG_IMAGE}" />
  <meta name="twitter:image:alt" content="${OG_IMAGE_ALT}" />

  <meta name="color-scheme" content="dark light" />
  <meta name="theme-color" content="#0a0b0e" media="(prefers-color-scheme: dark)" />
  <meta name="theme-color" content="#f6f7f9" media="(prefers-color-scheme: light)" />
  <link rel="icon" href="/favicon.ico" sizes="48x48" />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <link rel="icon" href="/favicon-96x96.png" type="image/png" sizes="96x96" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />

  <!-- generated:head -->
  <!-- /generated:head -->

  <script type="application/ld+json">
${jsonLd(graph)}
  </script>
  <style>
    /* Generated by build_docs.mjs from content/docs/. Fonts are filled in by build_assets.py. */
    /* generated:fonts */
    /* /generated:fonts */

    ${theme}
${DOCS_CSS}
  </style>
</head>`;
}

const NAV = `  <a class="skip-link" href="#top">Skip to content</a>
  <nav class="nav" aria-label="Primary">
    <div class="wrap">
      <a class="wordmark" href="/">csarko<span>.sh</span></a>
      <ul>
        <li><a href="/docs">Docs</a></li>
        <li><a href="/">Home</a></li>
      </ul>
    </div>
  </nav>`;

const FOOTER = `  <footer>
    <div class="wrap">
      <span>© 2026 Cyrus Sarkosh</span>
      <span class="mono">csarko.sh</span>
    </div>
  </footer>
  <!-- generated:analytics -->
  <!-- /generated:analytics -->
</body>
</html>
`;

function docList(docs, level, pad) {
  const items = docs.map((d) => `${pad}  <li>
${pad}    <h${level} class="doc-title"><a href="${d.path}">${d.titleHtml}</a></h${level}>
${pad}    <p class="doc-meta">${formatDate(d.published)} · ${readingMinutes(d.words)} min read</p>
${pad}    <p class="doc-desc">${escapeHtml(d.description)}</p>
${pad}  </li>`);
  return `${pad}<ul class="doc-list" role="list">\n${items.join('\n')}\n${pad}</ul>`;
}

export function docPage(doc, theme) {
  const graph = [
    {
      '@type': 'TechArticle',
      '@id': `${doc.url}#article`,
      headline: doc.title,
      description: doc.description,
      datePublished: doc.published,
      dateModified: doc.modified,
      url: doc.url,
      mainEntityOfPage: doc.url,
      wordCount: doc.words,
      inLanguage: 'en',
      image: OG_IMAGE,
      author: { '@id': PERSON },
      publisher: { '@id': PERSON },
      isPartOf: { '@id': WEBSITE },
      ...(doc.source ? { sameAs: [doc.source] } : {}),
    },
    breadcrumbs([['Cyrus Sarkosh', `${SITE}/`], ['Docs', `${SITE}/docs`], [doc.title, doc.url]]),
  ];
  const extraMeta = `  <meta property="article:published_time" content="${doc.published}" />
  <meta property="article:modified_time" content="${doc.modified}" />
  <meta property="article:author" content="${SITE}/" />
`;
  const eyebrow = `Research · ${formatDate(doc.published)}${doc.updated ? ` · Updated ${formatDate(doc.updated)}` : ''}`;
  const rail = doc.rail.length
    ? `    <aside class="rail" aria-label="Contents">
      <p class="section-label">Contents</p>
      <ol>
${doc.rail.map((s) => `        <li><a href="#${s.id}">${s.number ? `<span class="num">${s.number}</span>` : ''}<span>${escapeHtml(s.text)}</span></a></li>`).join('\n')}
      </ol>
    </aside>
`
    : '';
  const source = doc.source
    ? `\n          <li><a class="external" href="${escapeHtml(doc.source)}" target="_blank" rel="noopener">Also on GitHub</a></li>`
    : '';
  return `${head({ title: `${doc.title} · Cyrus Sarkosh`, ogTitle: doc.title, description: doc.description, canonical: doc.url, ogType: 'article', extraMeta, graph, theme })}
<body class="doc-page">
${NAV}

  <div class="wrap shell${doc.rail.length ? '' : ' no-rail'}">
${rail}    <main id="top" tabindex="-1">
      <header class="doc-header">
        <p class="eyebrow">${eyebrow}</p>
        <h1>${doc.titleHtml}</h1>
        <ul class="tags">
          <li>${readingMinutes(doc.words)} min read</li>${source}
        </ul>
      </header>
      <div class="prose">
${doc.html}
      </div>
      <aside class="author" aria-label="About the author">
        <p class="section-label">Written by</p>
        <p class="author-name"><a href="/">Cyrus Sarkosh</a></p>
        <p>Senior software engineer, founding engineer and lead on several zero-to-one products at DoorDash.</p>
        <p class="author-links"><a href="/">csarko.sh</a> · <a class="external" href="${LINKEDIN}" target="_blank" rel="noopener">LinkedIn</a></p>
      </aside>
    </main>
  </div>

${FOOTER}`;
}

export function indexPage(docs, theme) {
  const url = `${SITE}/docs`;
  const graph = [
    {
      '@type': 'CollectionPage',
      '@id': `${url}#page`,
      url,
      name: INDEX_TITLE,
      description: INDEX_DESCRIPTION,
      isPartOf: { '@id': WEBSITE },
      about: { '@id': PERSON },
      mainEntity: {
        '@type': 'ItemList',
        itemListElement: docs.map((d, i) => ({ '@type': 'ListItem', position: i + 1, url: d.url, name: d.title })),
      },
    },
    breadcrumbs([['Cyrus Sarkosh', `${SITE}/`], ['Docs', url]]),
  ];
  return `${head({ title: `${INDEX_TITLE} · Cyrus Sarkosh`, ogTitle: INDEX_TITLE, description: INDEX_DESCRIPTION, canonical: url, ogType: 'website', graph, theme })}
<body>
${NAV}

  <main id="top" class="wrap docs-index" tabindex="-1">
    <header class="doc-header">
      <p class="eyebrow">Docs</p>
      <h1>${escapeHtml(INDEX_TITLE)}</h1>
      <p class="lead">${escapeHtml(INDEX_LEAD)}</p>
    </header>
${docList(docs, 2, '    ')}
  </main>

${FOOTER}`;
}

// The home page's "Research & docs" section. With no docs the block is empty, so nothing renders.
export function homeSection(docs) {
  if (!docs.length) return '\n    ';
  return `
    <section id="docs" aria-labelledby="docs-title">
      <p class="section-label">03 / Research &amp; docs</p>
      <h2 id="docs-title">Notes from what I'm researching</h2>
${docList(docs.slice(0, HOME_LIMIT), 3, '      ')}
      <a class="all-docs" href="/docs">All docs ${ARROW}</a>
    </section>
    `;
}

export function sitemap(docs) {
  const newest = docs.map((d) => d.modified).sort().at(-1);
  const entries = [
    [`${SITE}/`, newest],
    ...(docs.length ? [[`${SITE}/docs`, newest]] : []),
    ...docs.map((d) => [d.url, d.modified]),
  ];
  const urls = entries.map(([loc, lastmod]) =>
    `  <url>\n    <loc>${loc}</loc>\n${lastmod ? `    <lastmod>${lastmod}</lastmod>\n` : ''}  </url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

// ---------------------------------------------------------------- everything

export function buildSite({ sources, indexHtml }) {
  const docs = sortDocs(sources.map(({ slug, text }) => loadDoc(slug, text)));
  const theme = themeBlocks(indexHtml);
  const files = new Map();
  for (const doc of docs) files.set(`docs/${doc.slug}.html`, docPage(doc, theme));
  if (docs.length) files.set('docs/index.html', indexPage(docs, theme));
  files.set('sitemap.xml', sitemap(docs));
  files.set('index.html', replaceBlock(indexHtml, 'docs', homeSection(docs)));
  return files;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test .agents/skills/site-quality/tests/docs_lib.test.mjs`
Expected: `# pass 18`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add .agents/skills/site-quality/scripts/docs_lib.mjs .agents/skills/site-quality/tests/docs_lib.test.mjs
git commit -m "Add doc, docs index, home section and sitemap templates

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Wire the build into the site (zero docs)

**Files:**
- Create: `.agents/skills/site-quality/scripts/build_docs.mjs`
- Modify: `public/index.html` (CSS before `/* Skills */`; markers after the `#games` section; labels `03 / Skills` → `04 / Skills`, `04 / Contact` → `05 / Contact`)
- Modify: `.agents/skills/site-quality/scripts/build_assets.py:212-228` (page loop)
- Modify: `.agents/skills/site-quality/scripts/generate-assets.sh`

**Interfaces:**
- Consumes: `buildSite`, `DocError` from `docs_lib.mjs`.
- Produces: CLI `node .agents/skills/site-quality/scripts/build_docs.mjs [--out <dir>]`. Exit 0 on success and prints `docs: <n> page(s) → <target>`; exit 1 with `error: <message>` on a `DocError`; exit 2 on bad arguments. In `--out` mode it writes `index.html`, `sitemap.xml`, `docs/*.html` under `<dir>` and touches nothing else. In default mode it writes into `public/`, deletes `public/docs/*.html` files it did not produce, and removes an empty `public/docs/`.

- [ ] **Step 1: Write `build_docs.mjs`**

```js
#!/usr/bin/env node
// build_docs.mjs — build csarko.sh's docs pages from content/docs/*.md.
//
//   node build_docs.mjs              write into public/ (generate-assets.sh runs this first)
//   node build_docs.mjs --out <dir>  write the same files under <dir> and leave the repo alone (check.py uses this)
//
// Writes public/docs/<slug>.html, public/docs/index.html, public/sitemap.xml and the
// <!-- generated:docs --> block in public/index.html. Doc pages carry empty generated:head,
// generated:fonts and generated:analytics markers, which build_assets.py fills next.
// The logic lives in docs_lib.mjs; this file only reads and writes.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSite, DocError } from './docs_lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const PUBLIC = join(ROOT, 'public');
const CONTENT = join(ROOT, 'content/docs');

const args = process.argv.slice(2);
if (!(args.length === 0 || (args.length === 2 && args[0] === '--out'))) {
  console.error('usage: build_docs.mjs [--out <dir>]');
  process.exit(2);
}
const out = args.length ? resolve(args[1]) : PUBLIC;

const sources = existsSync(CONTENT)
  ? readdirSync(CONTENT).filter((f) => f.endsWith('.md')).sort()
    .map((f) => ({ slug: f.slice(0, -'.md'.length), text: readFileSync(join(CONTENT, f), 'utf8') }))
  : [];

let files;
try {
  files = buildSite({ sources, indexHtml: readFileSync(join(PUBLIC, 'index.html'), 'utf8') });
} catch (e) {
  if (!(e instanceof DocError)) throw e;
  console.error(`error: ${e.message}`);
  process.exit(1);
}

for (const [rel, content] of files) {
  mkdirSync(dirname(join(out, rel)), { recursive: true });
  writeFileSync(join(out, rel), content);
}

if (out === PUBLIC) {
  const docsDir = join(PUBLIC, 'docs');
  if (existsSync(docsDir)) {
    for (const f of readdirSync(docsDir)) {
      if (f.endsWith('.html') && !files.has(`docs/${f}`)) {
        rmSync(join(docsDir, f));
        console.log(`removed public/docs/${f}`);
      }
    }
    if (!readdirSync(docsDir).length) rmSync(docsDir, { recursive: true });
  }
}

const pages = [...files.keys()].filter((k) => k.startsWith('docs/') && k !== 'docs/index.html').length;
console.log(`docs: ${pages} page(s) → ${out === PUBLIC ? 'public/' : out}`);
```

- [ ] **Step 2: Run it to verify it fails on the current page**

Run: `node .agents/skills/site-quality/scripts/build_docs.mjs --out "$(mktemp -d)"`
Expected: exit 1, `error: public/index.html has no <!-- generated:docs --> markers`.

- [ ] **Step 3: Add the markers, list CSS and renumbered labels to `public/index.html`**

Insert the markers between the Games and Skills sections and renumber Skills. Replace:

```html
    </section>

    <section id="skills" aria-labelledby="skills-title">
      <p class="section-label">03 / Skills</p>
```

with:

```html
    </section>

    <!-- generated:docs -->
    <!-- /generated:docs -->

    <section id="skills" aria-labelledby="skills-title">
      <p class="section-label">04 / Skills</p>
```

Replace `<p class="section-label">04 / Contact</p>` with `<p class="section-label">05 / Contact</p>`.

Insert immediately before the line `    /* Skills */`:

```css
    /* Research & docs: the list between the generated:docs markers comes from content/docs/ (build_docs.mjs) */
    .doc-list { list-style: none; margin: 0; padding: 0; }
    .doc-list li { padding-block: 18px; border-top: 1px solid var(--border); }
    .doc-list li:first-child { border-top: 0; padding-top: 0; }
    .doc-list .doc-title { margin: 0 0 4px; font-size: 1.15rem; line-height: 1.35; letter-spacing: -0.015em; font-weight: 600; }
    .doc-list .doc-title a { transition: color .15s ease; }
    .doc-list .doc-title a:hover { color: var(--accent); }
    .doc-meta { margin: 0 0 6px; font-family: var(--mono); font-size: 12px; color: var(--faint); }
    .doc-desc { margin: 0; color: var(--muted); font-size: 15px; }
    .all-docs { margin-top: 22px; font-size: 14px; font-weight: 500; color: var(--accent); display: inline-flex; align-items: center; gap: 6px; }
    .all-docs svg { width: 14px; height: 14px; transition: transform .18s ease; }
    .all-docs:hover svg { transform: translateX(2px); }

```

In the `@media (prefers-reduced-motion: reduce)` block, replace `.btn, .card, .card-link svg { transition: none; }` with `.btn, .card, .card-link svg, .all-docs svg, .doc-list .doc-title a { transition: none; }`.

- [ ] **Step 4: Run the build and verify the zero-docs result**

Run:
```bash
node .agents/skills/site-quality/scripts/build_docs.mjs
git diff --stat -- public
```
Expected: prints `docs: 0 page(s) → public/`. The diff lists only `public/index.html` (your edits from Step 3); `public/sitemap.xml` is unchanged and `public/docs/` does not exist. Run the build a second time and confirm `git diff --stat -- public` is identical.

- [ ] **Step 5: Make `build_assets.py` fill docs pages**

In `.agents/skills/site-quality/scripts/build_assets.py`, replace:

```python
    # ---- rewrite generated blocks in every page that has them
    # index.html uses relative paths (so the file:// preview works); 404.html is
    # served for missing URLs at any depth, so its paths must be root-relative.
    for page in sorted(PUBLIC.glob("*.html")):
        prefix = "/" if page.name == "404.html" else ""
```

with:

```python
    # ---- rewrite generated blocks in every page that has them
    # index.html uses relative paths (so the file:// preview works). 404.html is
    # served for missing URLs at any depth and docs pages live under /docs, so
    # their paths must be root-relative.
    for page in sorted(PUBLIC.glob("*.html")) + sorted((PUBLIC / "docs").glob("*.html")):
        prefix = "" if page == PUBLIC / "index.html" else "/"
```

and replace `print(f"rewrote generated blocks in public/{page.name}")` with `print(f"rewrote generated blocks in public/{page.relative_to(PUBLIC)}")`.

In the module docstring, replace `markers in every public/*.html that contains them:` with `markers in every public/*.html and public/docs/*.html that contains them:`.

- [ ] **Step 6: Run `build_docs.mjs` from `generate-assets.sh`**

In `.agents/skills/site-quality/scripts/generate-assets.sh`, replace the header lines:

```bash
# 1. build_assets.py: hashed portraits (AVIF/WebP/JPEG × 4 widths), hashed fonts,
#    public/portrait.jpg, and the <!-- generated:… --> blocks in public/*.html.
# 2. This script: favicons and the link-preview card, rendered with headless Chrome.
```

with:

```bash
# 1. build_docs.mjs: content/docs/*.md → public/docs/*.html, public/sitemap.xml, and the
#    <!-- generated:docs --> block in public/index.html (needs Node 18+).
# 2. build_assets.py: hashed portraits (AVIF/WebP/JPEG × 4 widths), hashed fonts,
#    public/portrait.jpg, and the other <!-- generated:… --> blocks in public/*.html
#    and public/docs/*.html.
# 3. This script: favicons and the link-preview card, rendered with headless Chrome.
```

Replace `# Re-run after changing the name, title, tagline, photo, fonts, or theme colors.` with `# Re-run after changing a doc in content/docs/, or the name, title, tagline, photo, fonts, or theme colors.`

After the `command -v sips` line add:

```bash
command -v node >/dev/null || { echo "error: node not found (Node 18+ builds the docs pages)" >&2; exit 1; }
```

Replace:

```bash
python3 "$ROOT/.agents/skills/site-quality/scripts/build_assets.py"
```

with:

```bash
node "$ROOT/.agents/skills/site-quality/scripts/build_docs.mjs"
python3 "$ROOT/.agents/skills/site-quality/scripts/build_assets.py"
```

- [ ] **Step 7: Regenerate and run the existing checks**

Run:
```bash
.agents/skills/site-quality/scripts/generate-assets.sh
git status --short
.agents/skills/site-quality/scripts/check.py
```
Expected: `docs: 0 page(s) → public/` in the output. `git status` shows only the files changed in this task (no hashed asset or image changes). `check.py` ends with `✓ site checks passed`.

- [ ] **Step 8: Commit**

```bash
git add .agents/skills/site-quality/scripts/build_docs.mjs .agents/skills/site-quality/scripts/build_assets.py .agents/skills/site-quality/scripts/generate-assets.sh public/index.html
git commit -m "Build docs pages from content/docs as part of generate-assets.sh

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `check.py` helpers for a multi-page site

**Files:**
- Modify: `.agents/skills/site-quality/scripts/check.py` (new helpers after `parse_csp`)
- Test: `.agents/skills/site-quality/tests/test_check.py`

**Interfaces:**
- Produces (module-level functions in `check.py`):
  - `page_kind(rel: str) -> str`: `"home"` for `index.html`, `"404"` for `404.html`, `"docs-index"` for `docs/index.html`, else `"doc"`.
  - `canonical_for(rel: str) -> str`: `index.html` → `https://csarko.sh/`, `docs/index.html` → `https://csarko.sh/docs`, `docs/x.html` → `https://csarko.sh/docs/x`.
  - `resolve_internal(href: str, public: Path = PUBLIC) -> tuple[Path | None, str | None]`: the file a root-relative link serves, or a problem string.
  - `blank_generated(text: str) -> str`: empties `generated:head`, `generated:analytics` and `generated:fonts` blocks.
  - `newest_doc(public: Path = PUBLIC) -> str | None`: `docs/<slug>.html` with the latest `article:published_time`, ties to the smallest slug.
  - `indexable_pages(public: Path = PUBLIC) -> list[str]`: `["index.html"]` plus sorted `docs/*.html` (includes `docs/index.html`).
  - Constants `BUDGET_HTML_DOC = 120_000`, `BUILD_DOCS = SKILL / "scripts/build_docs.mjs"`.

- [ ] **Step 1: Write the failing tests**

Create `.agents/skills/site-quality/tests/test_check.py`:

```python
"""Tests for check.py's page helpers. Run: python3 -m unittest discover -s .agents/skills/site-quality/tests"""

import importlib.util
import tempfile
import unittest
from pathlib import Path

_spec = importlib.util.spec_from_file_location("check", Path(__file__).resolve().parents[1] / "scripts/check.py")
check = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(check)


def site(files):
    """A throwaway public/ with the given {relative path: text} files."""
    tmp = tempfile.TemporaryDirectory()
    root = Path(tmp.name)
    for rel, text in files.items():
        (root / rel).parent.mkdir(parents=True, exist_ok=True)
        (root / rel).write_text(text, encoding="utf-8")
    return tmp, root


def doc(published):
    return f'<meta property="article:published_time" content="{published}" />'


class PageKindAndCanonical(unittest.TestCase):
    def test_kinds(self):
        self.assertEqual(check.page_kind("index.html"), "home")
        self.assertEqual(check.page_kind("404.html"), "404")
        self.assertEqual(check.page_kind("docs/index.html"), "docs-index")
        self.assertEqual(check.page_kind("docs/shader-looks.html"), "doc")

    def test_canonical_urls_follow_clean_urls(self):
        self.assertEqual(check.canonical_for("index.html"), "https://csarko.sh/")
        self.assertEqual(check.canonical_for("docs/index.html"), "https://csarko.sh/docs")
        self.assertEqual(check.canonical_for("docs/shader-looks.html"), "https://csarko.sh/docs/shader-looks")


class ResolveInternal(unittest.TestCase):
    def setUp(self):
        self.tmp, self.public = site({"index.html": "", "docs/index.html": "", "docs/a.html": "", "favicon.svg": ""})

    def tearDown(self):
        self.tmp.cleanup()

    def resolve(self, href):
        return check.resolve_internal(href, self.public)

    def test_resolves_clean_urls(self):
        self.assertEqual(self.resolve("/"), (self.public / "index.html", None))
        self.assertEqual(self.resolve("/docs"), (self.public / "docs/index.html", None))
        self.assertEqual(self.resolve("/docs/a#section"), (self.public / "docs/a.html", None))
        self.assertEqual(self.resolve("/favicon.svg"), (self.public / "favicon.svg", None))

    def test_flags_redirects_and_missing_files(self):
        self.assertEqual(self.resolve("/docs/"), (None, "has a trailing slash (Firebase redirects it)"))
        self.assertEqual(self.resolve("/docs/a.html"), (None, "ends in .html (Firebase redirects it to the clean URL)"))
        self.assertEqual(self.resolve("/docs/missing"), (None, "does not resolve to a file in public/"))


class BlankGenerated(unittest.TestCase):
    def test_empties_only_the_blocks_build_assets_fills(self):
        text = ('<!-- generated:head -->\n  <link rel="preload" />\n  <!-- /generated:head -->'
                '/* generated:fonts */@font-face { }/* /generated:fonts */'
                '<!-- generated:analytics --><script></script><!-- /generated:analytics -->'
                '<!-- generated:docs --><section></section><!-- /generated:docs -->')
        self.assertEqual(check.blank_generated(text),
                         '<!-- generated:head --><!-- /generated:head -->'
                         '/* generated:fonts *//* /generated:fonts */'
                         '<!-- generated:analytics --><!-- /generated:analytics -->'
                         '<!-- generated:docs --><section></section><!-- /generated:docs -->')


class Pages(unittest.TestCase):
    def test_newest_doc_is_latest_then_smallest_slug(self):
        tmp, public = site({"docs/index.html": doc("2027-01-01"), "docs/a.html": doc("2026-01-01"),
                            "docs/d.html": doc("2026-03-01"), "docs/b.html": doc("2026-03-01")})
        with tmp:
            self.assertEqual(check.newest_doc(public), "docs/b.html")

    def test_newest_doc_without_docs(self):
        tmp, public = site({"index.html": ""})
        with tmp:
            self.assertIsNone(check.newest_doc(public))

    def test_indexable_pages(self):
        tmp, public = site({"index.html": "", "404.html": "", "docs/index.html": "", "docs/a.html": ""})
        with tmp:
            self.assertEqual(check.indexable_pages(public), ["index.html", "docs/a.html", "docs/index.html"])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `python3 -m unittest discover -s .agents/skills/site-quality/tests -v`
Expected: FAIL/ERROR with `AttributeError: module 'check' has no attribute 'page_kind'` (and the other helpers).

- [ ] **Step 3: Write the helpers**

In `check.py`, add `import shutil` to the imports (alphabetically after `import re`).

After `BUDGET_SCRIPTS = 10_000 …` add:

```python
BUDGET_HTML_DOC = 120_000  # a doc page is mostly prose, so long research docs get more room than BUDGET_HTML

BUILD_DOCS = SKILL / "scripts/build_docs.mjs"
```

After the `parse_csp` function add:

```python
# ------------------------------------------------------------------------ pages
# Firebase serves public/ with cleanUrls: true and trailingSlash: false, so
# docs/x.html is https://csarko.sh/docs/x and docs/index.html is /docs.

def page_kind(rel):
    return {"index.html": "home", "404.html": "404", "docs/index.html": "docs-index"}.get(rel, "doc")


def canonical_for(rel):
    path = rel[:-len(".html")]
    if path == "index":
        return CANONICAL
    if path.endswith("/index"):
        path = path[:-len("/index")]
    return f"{SITE}/{path}"


def resolve_internal(href, public=PUBLIC):
    """(file, None) for a root-relative link Firebase serves directly, or (None, problem)."""
    path = href.split("#")[0].split("?")[0]
    if path == "/":
        return public / "index.html", None
    if path.endswith("/"):
        return None, "has a trailing slash (Firebase redirects it)"
    if path.endswith(".html"):
        return None, "ends in .html (Firebase redirects it to the clean URL)"
    rel = path.lstrip("/")
    for candidate in (public / rel, public / f"{rel}.html", public / rel / "index.html"):
        if candidate.is_file():
            return candidate, None
    return None, "does not resolve to a file in public/"


_FILLED_BLOCKS = re.compile(
    r"(<!-- generated:(head|analytics) -->).*?(<!-- /generated:\2 -->)|(/\* generated:fonts \*/).*?(/\* /generated:fonts \*/)", re.S)


def blank_generated(text):
    """Empty the blocks build_assets.py fills, so docs output compares equal before and after it runs."""
    return _FILLED_BLOCKS.sub(lambda m: m.group(1) + m.group(3) if m.group(1) else m.group(4) + m.group(5), text)


def newest_doc(public=PUBLIC):
    """docs/<slug>.html of the newest doc (latest published, then smallest slug), or None."""
    found = []
    for p in (public / "docs").glob("*.html"):
        if p.name == "index.html":
            continue
        m = re.search(r'<meta property="article:published_time" content="([^"]+)"', p.read_text(encoding="utf-8"))
        if m:
            found.append((m.group(1), p.stem))
    if not found:
        return None
    latest = max(date for date, _ in found)
    return f"docs/{min(slug for date, slug in found if date == latest)}.html"


def indexable_pages(public=PUBLIC):
    return ["index.html"] + sorted(f"docs/{p.name}" for p in (public / "docs").glob("*.html"))
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `python3 -m unittest discover -s .agents/skills/site-quality/tests -v`
Expected: `Ran 8 tests`, `OK`.

- [ ] **Step 5: Commit**

```bash
git add .agents/skills/site-quality/scripts/check.py .agents/skills/site-quality/tests/test_check.py
git commit -m "Add clean-URL page helpers to check.py

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: `check.py` checks every page

**Files:**
- Modify: `.agents/skills/site-quality/scripts/check.py` (`seo_checks`, new `jsonld_checks`, new `sitemap_checks`, `performance_checks`, `accessibility_checks`, new `internal_link_checks`, new `docs_build_checks`, `layout_checks`, `main`, module docstring)

**Interfaces:**
- Consumes: Task 5 helpers; `build_docs.mjs --out` from Task 4.
- Produces: `check.py --newest-doc` prints `docs/<slug>.html` or an empty line, exit 0, no other output (used by `preview.sh` and `deploy.sh`). `check.py` with no flags runs static checks on `index.html`, `docs/index.html`, `docs/*.html` and `404.html`.

- [ ] **Step 1: Write a failing freshness case**

With the Task 4 state (zero docs), make `public/` stale on purpose and confirm the current script does not notice:

```bash
printf '\n' >> public/sitemap.xml
.agents/skills/site-quality/scripts/check.py | tail -3; echo "exit $?"
```
Expected: `✓ site checks passed`. That is the gap this task closes. Leave the stale byte in place for Step 4.

- [ ] **Step 2: Replace `seo_checks` and add `jsonld_checks` and `sitemap_checks`**

Replace the whole `seo_checks` function (from `def seo_checks(page):` through the sitemap `except` block) with:

```python
def seo_checks(page, rel):
    kind, canonical = page_kind(rel), canonical_for(rel)
    print(f"SEO ({rel})")
    if not page.title:
        fail("missing <title>")
    else:
        (ok if 30 <= len(page.title) <= 65 else warn)(f"title is {len(page.title)} chars (30–65 shows in full)")
    desc = one(page, "description")
    if desc is not None:
        (ok if 70 <= len(desc) <= 160 else warn)(f"meta description is {len(desc)} chars (70–160)")
    check(page.lang, f'html lang="{page.lang}"')

    canon = [l.get("href") for l in page.links if l.get("rel") == "canonical"]
    check(canon == [canonical], f"canonical {canon}")

    for key in ("og:title", "og:description", "og:site_name", "og:image:alt",
                "twitter:title", "twitter:description", "twitter:image:alt"):
        one(page, key)
    want_type = "article" if kind == "doc" else "website"
    if one(page, "og:type") not in (None, want_type):
        fail(f"og:type should be {want_type}")
    if one(page, "og:url") not in (None, canonical):
        fail(f"og:url must equal the canonical URL {canonical}")
    if one(page, "twitter:card") not in (None, "summary_large_image"):
        warn("twitter:card is not summary_large_image")
    og_image = one(page, "og:image")
    if og_image:
        path = local_path(og_image)
        if not og_image.startswith("https://") or not path or not path.exists():
            fail(f"og:image {og_image} must be an absolute https URL to a file in public/")
        else:
            size = image_size(path)
            declared = (page.meta.get("og:image:width", ["?"])[0], page.meta.get("og:image:height", ["?"])[0])
            if size and declared != (str(size[0]), str(size[1])):
                fail(f"og:image is {size[0]}×{size[1]} but og:image:width/height say {declared[0]}×{declared[1]}")
            elif size and (size[0] < 1200 or abs(size[0] / size[1] - 1.91) > 0.05):
                warn(f"og:image is {size[0]}×{size[1]}; link previews want 1200×630")
            else:
                ok(f"og:image {size[0]}×{size[1]}")
        if page.meta.get("twitter:image", [None])[0] != og_image:
            fail("twitter:image should match og:image")

    jsonld_checks(page, kind, canonical)

    icons = [l for l in page.links if l.get("rel") in ("icon", "apple-touch-icon")]
    bad = [l.get("href") for l in icons
           if l.get("href", "").startswith("data:") or not (local_path(l.get("href", "")) or Path("/nope")).exists()]
    check(icons and not bad, f"favicons are files in public/ {bad or ''}")

    if page.headings.count(1) != 1:
        fail(f"expected exactly one <h1>, found {page.headings.count(1)}")
    elif any(cur > prev + 1 for prev, cur in zip(page.headings, page.headings[1:])):
        fail("heading levels skip (e.g. h2 → h4)")
    else:
        ok(f"one h1, {len(page.headings)} headings, no skipped levels")


def jsonld_checks(page, kind, canonical):
    if len(page.jsonld) != 1:
        fail(f"expected one application/ld+json block, found {len(page.jsonld)}")
        return
    try:
        data = json.loads(page.jsonld[0])
    except json.JSONDecodeError as e:
        fail(f"JSON-LD does not parse: {e}")
        return
    graph = data.get("@graph", [data])
    node = lambda t: next((n for n in graph if n.get("@type") == t), None)

    if kind == "home":
        person = node("Person")
        if not person:
            fail("JSON-LD has no Person")
            return
        missing = [f for f in ("name", "url", "image", "jobTitle", "sameAs") if not person.get(f)]
        img = local_path(person.get("image", ""))
        if missing:
            fail(f"JSON-LD Person is missing {missing}")
        elif person.get("url") != CANONICAL:
            fail("JSON-LD Person.url must equal the canonical URL")
        elif img and not img.exists():
            fail(f"JSON-LD Person.image {person.get('image')} does not exist in public/")
        else:
            ok(f"JSON-LD Person ({len(person['sameAs'])} sameAs profiles)")
        return

    items = (node("BreadcrumbList") or {}).get("itemListElement", [])
    check(items and items[0].get("item") == CANONICAL and items[-1].get("item") == canonical,
          f"JSON-LD BreadcrumbList runs from {CANONICAL} to {canonical}")
    if kind == "docs-index":
        collection = node("CollectionPage") or {}
        listed = collection.get("mainEntity", {}).get("itemListElement", [])
        check(collection.get("url") == canonical and listed, f"JSON-LD CollectionPage lists {len(listed)} doc(s)")
        return
    article = node("TechArticle")
    missing = [f for f in ("headline", "description", "datePublished", "dateModified", "url", "author") if not (article or {}).get(f)]
    if not article or missing:
        fail(f"JSON-LD TechArticle is missing {missing or 'entirely'}")
    elif article["url"] != canonical:
        fail("JSON-LD TechArticle.url must equal the canonical URL")
    elif article["author"].get("@id") != f"{CANONICAL}#person":
        fail(f'JSON-LD TechArticle.author must be {{"@id": "{CANONICAL}#person"}}')
    else:
        ok(f"JSON-LD TechArticle by #person, published {article['datePublished']}")


def sitemap_checks(pages):
    print("robots.txt and sitemap.xml")
    robots = PUBLIC / "robots.txt"
    text = robots.read_text() if robots.exists() else ""
    check(text and not re.search(r"^Disallow:\s*/\s*$", text, re.M) and f"Sitemap: {SITE}/sitemap.xml" in text,
          "robots.txt allows crawling and names the sitemap")
    try:
        locs = [e.text for e in ET.parse(PUBLIC / "sitemap.xml").getroot().iter("{http://www.sitemaps.org/schemas/sitemap/0.9}loc")]
    except (OSError, ET.ParseError) as e:
        fail(f"sitemap.xml missing or invalid: {e}")
        return
    want = sorted(canonical_for(rel) for rel in pages if rel != "404.html")
    diff = sorted(set(locs) ^ set(want))
    check(sorted(locs) == want, f"sitemap.xml lists exactly the indexable pages {diff or f'({len(locs)} URLs)'}")
```

- [ ] **Step 3: Update the per-page checks and add the site-wide ones**

In `performance_checks`, replace:

```python
    size = len(html.encode())
    check(size <= BUDGET_HTML, f"HTML {size:,} B (budget {BUDGET_HTML:,})")
```

with:

```python
    size = len(html.encode())
    budget = BUDGET_HTML_DOC if page_kind(name) == "doc" else BUDGET_HTML
    check(size <= budget, f"HTML {size:,} B (budget {budget:,})")
```

and replace `for other in PUBLIC.glob("*.html"):` with `for other in [*PUBLIC.glob("*.html"), *(PUBLIC / "docs").glob("*.html")]:`.

In `accessibility_checks`, replace:

```python
    if name != "index.html":
        return
```

with:

```python
    if name == "404.html":
        return
```

After `not_found_checks` add:

```python
def internal_link_checks(pages):
    print("internal links")
    bad = []
    for rel, (page, _) in pages.items():
        for a in page.anchors:
            href = a.get("href", "")
            if href.startswith("/") and not href.startswith("//"):
                _, problem = resolve_internal(href)
                if problem:
                    bad.append(f"{rel}: {href} {problem}")
    check(not bad, f"root-relative links resolve without a redirect {bad or ''}")


def docs_build_checks():
    """Build the docs twice into temp dirs. The builds must match each other (deterministic)
    and the committed files (fresh), ignoring the blocks build_assets.py fills afterwards."""
    print("docs build (content/docs → public/)")
    if not shutil.which("node"):
        fail("node not found: install Node 18+ (build_docs.mjs builds the docs pages)")
        return
    builds = []
    for _ in range(2):
        with tempfile.TemporaryDirectory() as out:
            r = subprocess.run(["node", str(BUILD_DOCS), "--out", out], capture_output=True, text=True, timeout=60)
            if r.returncode != 0:
                fail(f"build_docs.mjs failed: {(r.stderr or r.stdout).strip()}")
                return
            builds.append({p.relative_to(out).as_posix(): p.read_text(encoding="utf-8")
                           for p in Path(out).rglob("*") if p.is_file()})
    check(builds[0] == builds[1], "docs build is deterministic (two builds are byte-identical)")
    committed = {rel: (PUBLIC / rel).read_text(encoding="utf-8") for rel in ("index.html", "sitemap.xml")}
    committed |= {f"docs/{p.name}": p.read_text(encoding="utf-8") for p in (PUBLIC / "docs").glob("*.html")}
    stale = sorted(rel for rel in set(builds[0]) | set(committed)
                   if blank_generated(builds[0].get(rel, "")) != blank_generated(committed.get(rel, "")))
    check(not stale, f"public/ matches content/docs/ {stale or ''}" + (" — run generate-assets.sh" if stale else ""))
```

- [ ] **Step 4: Run the layout check on docs pages too**

Replace the whole `layout_checks` function with:

```python
def layout_checks():
    print("layout (headless Chrome)")
    if not Path(CHROME).exists():
        warn("Google Chrome not found — layout checks skipped")
        return
    targets = ["index.html"] + [rel for rel in ("docs/index.html", newest_doc()) if rel and (PUBLIC / rel).exists()]
    frames = [{"key": f"{rel} {w}px", "width": w, "src": (PUBLIC / rel).as_uri()} for rel in targets for w in LAYOUT_WIDTHS]
    with tempfile.TemporaryDirectory() as tmp:
        harness = Path(tmp) / "layout.html"
        harness.write_text("""<!doctype html><html><body><pre id="result">pending</pre><script>
const frames = %s, out = {}; let pending = frames.length;
for (const {key, width: w, src} of frames) {
  const f = document.createElement('iframe');
  f.style.cssText = `width:${w}px;height:800px;border:0`;
  f.src = src;
  f.onload = () => setTimeout(() => {
    const d = f.contentDocument, links = [...d.querySelectorAll('.nav ul a')];
    const wm = d.querySelector('.wordmark').getBoundingClientRect();
    const first = links[0] && links[0].getBoundingClientRect();
    out[key] = {
      hidden: links.filter(a => { const r = a.getBoundingClientRect(); return r.width === 0 || r.right > w; }).map(a => a.getAttribute('aria-label') || a.textContent),
      navOneLine: new Set(links.map(a => Math.round(a.getBoundingClientRect().top))).size === 1,
      gap: first ? Math.round(first.left - wm.right) : null,
      overflowX: d.documentElement.scrollWidth > d.documentElement.clientWidth,
      buttonsOverflow: [...d.querySelectorAll('.btn')].some(b => b.getBoundingClientRect().right > w),
      skipLinkHidden: d.querySelector('.skip-link').getBoundingClientRect().bottom <= 0,
    };
    if (--pending === 0) document.getElementById('result').textContent = JSON.stringify(out);
  }, 300);
  document.body.appendChild(f);
}
</script></body></html>""" % json.dumps(frames))
        dom = subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--allow-file-access-from-files",
                              "--virtual-time-budget=15000", "--dump-dom", harness.as_uri()],
                             capture_output=True, text=True, timeout=180).stdout
    m = re.search(r'<pre id="result">(.*?)</pre>', dom, re.S)
    try:
        data = json.loads(htmllib.unescape(m.group(1)))
    except (AttributeError, json.JSONDecodeError):
        warn("layout harness produced no result — checks skipped")
        return
    for frame in frames:
        r = data.get(frame["key"])
        if r is None:
            warn(f"{frame['key']}: no layout result")
            continue
        problems = []
        if r["hidden"]:
            problems.append(f"nav links hidden or cut off: {r['hidden']}")
        if not r["navOneLine"]:
            problems.append("nav wraps onto two lines")
        if r["gap"] is not None and r["gap"] < 8:
            problems.append(f"nav is only {r['gap']}px from the wordmark")
        if r["overflowX"]:
            problems.append("page scrolls horizontally")
        if r["buttonsOverflow"]:
            problems.append("a button runs off the screen")
        if not r["skipLinkHidden"]:
            problems.append("skip link is visible without keyboard focus")
        check(not problems, f"{frame['key']}: {'; '.join(problems) or 'all nav links visible on one line, no overflow'}")
```

- [ ] **Step 5: Rewrite `main` and the usage docstring**

Replace the static part of `main` (from `def main(argv):` through `layout_checks()`) with:

```python
def main(argv):
    if "--newest-doc" in argv:
        print(newest_doc() or "")
        return 0

    pages = {rel: parse(PUBLIC / rel) for rel in indexable_pages()}
    for rel, (page, html) in pages.items():
        seo_checks(page, rel)
        performance_checks(page, html, rel)
        accessibility_checks(page, rel)
        theme_checks(html, rel)
    sitemap_checks(pages)
    nf = not_found_checks()
    if nf:
        pages["404.html"] = nf
        performance_checks(*nf, "404.html")
        accessibility_checks(nf[0], "404.html")
        theme_checks(nf[1], "404.html")
    internal_link_checks(pages)
    security_checks(pages)
    analytics_checks(pages)
    docs_build_checks()
    layout_checks()
```

In the module docstring, replace `  check.py                        static checks on public/ and firebase.json (offline, a few seconds)` with:

```
  check.py                        static checks on every page in public/, the docs build, and firebase.json (offline, a few seconds)
  check.py --newest-doc           print docs/<slug>.html of the newest doc (or an empty line) and exit
```

- [ ] **Step 6: Run the checks: the stale sitemap must fail**

Run: `.agents/skills/site-quality/scripts/check.py; echo "exit $?"`
Expected: `FAIL  public/ matches content/docs/ ['sitemap.xml'] — run generate-assets.sh`, `exit 1`. Every other line is `ok` (the home page's `SEO (index.html)` section now also shows `robots.txt and sitemap.xml` and `internal links` sections).

- [ ] **Step 7: Restore and run everything green**

Run:
```bash
git checkout public/sitemap.xml
.agents/skills/site-quality/scripts/check.py | tail -3; echo "exit $?"
.agents/skills/site-quality/scripts/check.py --newest-doc | od -c | head -2
python3 -m unittest discover -s .agents/skills/site-quality/tests
```
Expected: `✓ site checks passed`, `exit 0`; `--newest-doc` prints only `\n`; unit tests `OK`.

- [ ] **Step 8: Commit**

```bash
git add .agents/skills/site-quality/scripts/check.py
git commit -m "Check every page, the sitemap, internal links and docs freshness

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Firebase-like preview server

**Files:**
- Create: `.agents/skills/preview/scripts/serve.py`
- Test: `.agents/skills/preview/tests/test_serve.py`
- Modify: `.agents/skills/preview/scripts/preview.sh`

**Interfaces:**
- Consumes: `check.py --newest-doc` (Task 6).
- Produces: `serve.route(public: Path, raw_path: str) -> tuple[int, Path | str]` returning `(200, file)`, `(301, location)` or `(404, public/404.html)`; CLI `serve.py [--port N] [--dir PATH]`. `preview.sh --shots` writes `desktop.png`, `desktop-light.png`, `mobile.png`, `mobile-light.png`, and when a doc exists `doc-desktop.png`, `doc-desktop-light.png`, `doc-mobile.png`, `doc-mobile-light.png`.

- [ ] **Step 1: Write the failing tests**

Create `.agents/skills/preview/tests/test_serve.py`:

```python
"""Tests for serve.py's routing. Run: python3 -m unittest discover -s .agents/skills/preview/tests"""

import importlib.util
import tempfile
import unittest
from pathlib import Path

_spec = importlib.util.spec_from_file_location("serve", Path(__file__).resolve().parents[1] / "scripts/serve.py")
serve = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(serve)


class Route(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.public = Path(self.tmp.name).resolve()
        (self.public / "docs").mkdir()
        for rel in ("index.html", "404.html", "docs/index.html", "docs/a.html", "favicon.svg"):
            (self.public / rel).write_text(rel)

    def tearDown(self):
        self.tmp.cleanup()

    def route(self, path):
        return serve.route(self.public, path)

    def test_serves_clean_urls_and_files(self):
        self.assertEqual(self.route("/"), (200, self.public / "index.html"))
        self.assertEqual(self.route("/docs"), (200, self.public / "docs/index.html"))
        self.assertEqual(self.route("/docs/a?utm=x"), (200, self.public / "docs/a.html"))
        self.assertEqual(self.route("/favicon.svg"), (200, self.public / "favicon.svg"))

    def test_redirects_like_firebase(self):
        self.assertEqual(self.route("/docs/"), (301, "/docs"))
        self.assertEqual(self.route("/docs/?q=1"), (301, "/docs?q=1"))
        self.assertEqual(self.route("/docs/a.html"), (301, "/docs/a"))
        self.assertEqual(self.route("/docs/index.html"), (301, "/docs"))
        self.assertEqual(self.route("/index.html"), (301, "/"))

    def test_missing_and_outside_paths_get_the_404_page(self):
        self.assertEqual(self.route("/nope"), (404, self.public / "404.html"))
        self.assertEqual(self.route("/../../etc/passwd"), (404, self.public / "404.html"))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `python3 -m unittest discover -s .agents/skills/preview/tests -v`
Expected: ERROR, `FileNotFoundError` / `No such file` for `scripts/serve.py`.

- [ ] **Step 3: Write `serve.py`**

```python
#!/usr/bin/env python3
"""
serve.py — serve public/ on localhost the way Firebase Hosting routes it
(cleanUrls: true, trailingSlash: false), so root-relative links and /docs work locally.

Usage:
  serve.py [--port 4173] [--dir public]

  /                      index.html
  /docs                  docs/index.html
  /docs/x                docs/x.html
  /docs/  and  /x.html   301 to the clean URL
  anything else          404.html, status 404

Headers are not Firebase's (no CSP); check.py --live covers those on the real site.
"""

import argparse
import http.server
import mimetypes
from pathlib import Path
from urllib.parse import unquote, urlsplit

for _type, _ext in (("font/woff2", ".woff2"), ("image/avif", ".avif"), ("image/webp", ".webp")):
    mimetypes.add_type(_type, _ext)


def route(public, raw_path):
    """(200, file) | (301, location) | (404, public/404.html) for a request path."""
    parts = urlsplit(raw_path)
    path = unquote(parts.path) or "/"
    query = f"?{parts.query}" if parts.query else ""
    if path != "/" and path.endswith("/"):
        return 301, path.rstrip("/") + query
    if path.endswith(".html"):
        clean = path[:-len(".html")]
        if clean.endswith("/index"):
            clean = clean[:-len("/index")]
        return 301, (clean or "/") + query
    root = Path(public).resolve()
    rel = path.lstrip("/")
    candidates = [root / "index.html"] if not rel else [root / rel, root / f"{rel}.html", root / rel / "index.html"]
    for candidate in candidates:
        candidate = candidate.resolve()
        if candidate.is_file() and candidate.is_relative_to(root):
            return 200, candidate
    return 404, root / "404.html"


class Handler(http.server.BaseHTTPRequestHandler):
    public = Path("public")

    def do_GET(self):
        self.respond(send_body=True)

    def do_HEAD(self):
        self.respond(send_body=False)

    def respond(self, send_body):
        status, target = route(self.public, self.path)
        if status == 301:
            self.send_response(301)
            self.send_header("Location", target)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        body = target.read_bytes() if target.is_file() else b"Not found"
        ctype = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype in ("application/javascript", "image/svg+xml", "application/xml"):
            ctype += "; charset=utf-8"
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        if send_body:
            self.wfile.write(body)


def main():
    parser = argparse.ArgumentParser(description="Serve public/ with Firebase-style clean URLs.")
    parser.add_argument("--port", type=int, default=4173)
    parser.add_argument("--dir", default=str(Path(__file__).resolve().parents[4] / "public"))
    args = parser.parse_args()
    Handler.public = Path(args.dir)
    server = http.server.ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"serving {args.dir} on http://localhost:{args.port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `python3 -m unittest discover -s .agents/skills/preview/tests -v`
Expected: `Ran 3 tests`, `OK`.

- [ ] **Step 5: Use it from `preview.sh`**

In `.agents/skills/preview/scripts/preview.sh`:

Replace the usage lines:

```bash
#   preview.sh --serve    serve public/ on http://localhost:4173 and open it
#   preview.sh --stop     stop a server started with --serve
#   preview.sh --shots    write desktop + mobile screenshots, dark and light, to /tmp/csarko-sh-preview/
```

with:

```bash
#   preview.sh --serve    serve public/ on http://localhost:4173 (Firebase-style clean URLs) and open it
#   preview.sh --stop     stop a server started with --serve
#   preview.sh --shots    write desktop + mobile screenshots, dark and light, of the home page and
#                         the newest doc, to /tmp/csarko-sh-preview/
```

After `PIDFILE="$OUT/server.pid"` add:

```bash
SERVE="$ROOT/.agents/skills/preview/scripts/serve.py"
CHECK="$ROOT/.agents/skills/site-quality/scripts/check.py"
```

Replace the whole `if (( SHOTS )); then … fi` block with:

```bash
if (( SHOTS )); then
  [[ -x "$CHROME" ]] || die "Google Chrome not found at $CHROME"
  # Shots load pages over HTTP from serve.py, which routes like Firebase, so root-relative
  # fonts and links (the docs pages use only those) resolve as they do in production.
  SHOT_PORT=4174
  python3 "$SERVE" --port "$SHOT_PORT" --dir "$PUBLIC" >"$OUT/shots-server.log" 2>&1 &
  SHOT_PID=$!
  trap 'kill "$SHOT_PID" 2>/dev/null || true' EXIT
  for _ in $(seq 50); do curl -fs -o /dev/null "http://localhost:$SHOT_PORT/" && break; sleep 0.1; done

  NEWEST="$("$CHECK" --newest-doc)"
  SHOTS_LIST=("|/")                                   # <file prefix>|<path>
  [[ -n "$NEWEST" ]] && SHOTS_LIST+=("doc-|/${NEWEST%.html}")

  for entry in "${SHOTS_LIST[@]}"; do
    prefix="${entry%%|*}"
    URL="http://localhost:$SHOT_PORT${entry#*|}"
    # Headless Chrome won't size a window below ~500px, so a 390px "phone" is
    # rendered inside an iframe of that width and the frame is screenshotted.
    cat > "$OUT/${prefix}mobile-frame.html" <<EOF
<!doctype html><html><body style="margin:0;background:#333">
<iframe src="$URL" style="width:390px;height:6000px;border:0;display:block"></iframe>
</body></html>
EOF
    # The page follows the system color scheme, so shoot both themes explicitly
    # (headless Chrome otherwise inherits this Mac's setting). 0 = dark, 1 = light.
    for theme in dark light; do
      scheme=$([[ $theme == dark ]] && echo 0 || echo 1)
      suffix=$([[ $theme == dark ]] && echo "" || echo "-light")
      "$CHROME" --headless=new --disable-gpu --hide-scrollbars --virtual-time-budget=4000 \
        --blink-settings=preferredColorScheme=$scheme \
        --window-size=1440,4000 --screenshot="$OUT/${prefix}desktop$suffix.png" "$URL" 2>/dev/null
      "$CHROME" --headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files \
        --blink-settings=preferredColorScheme=$scheme \
        --virtual-time-budget=4000 --window-size=600,6000 \
        --screenshot="$OUT/${prefix}mobile$suffix.png" "file://$OUT/${prefix}mobile-frame.html" 2>/dev/null
    done
    echo "$OUT/${prefix}desktop.png   $OUT/${prefix}desktop-light.png"
    echo "$OUT/${prefix}mobile.png    $OUT/${prefix}mobile-light.png   (the page is the left 390px; the grey strip is the frame)"
  done
  kill "$SHOT_PID" 2>/dev/null || true
  trap - EXIT
fi
```

Replace:

```bash
    nohup python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$PUBLIC" >"$OUT/server.log" 2>&1 &
```

with:

```bash
    nohup python3 "$SERVE" --port "$PORT" --dir "$PUBLIC" >"$OUT/server.log" 2>&1 &
```

Replace `  echo "opened $PUBLIC/index.html in Chrome"` with:

```bash
  echo "opened $PUBLIC/index.html in Chrome (links to /docs need --serve)"
```

Replace `"$ROOT/.agents/skills/site-quality/scripts/check.py" || echo …` with `"$CHECK" || echo "(fix the failures above before deploying — see .agents/skills/site-quality/SKILL.md)"`.

- [ ] **Step 6: Try it**

Run:
```bash
.agents/skills/preview/scripts/preview.sh --serve
curl -sI http://localhost:4173/docs/ | head -3
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4173/nope
.agents/skills/preview/scripts/preview.sh --stop
.agents/skills/preview/scripts/preview.sh --shots
```
Expected: `HTTP/1.0 301` with `Location: /docs`; `404`; `stopped server …`; the shots step prints the four home-page paths (no doc lines yet) and `✓ site checks passed`. Read `/tmp/csarko-sh-preview/desktop.png` and `desktop-light.png` and confirm the home page renders with Inter (not Arial) and the section labels read `04 / Skills` and `05 / Contact`.

- [ ] **Step 7: Commit**

```bash
git add .agents/skills/preview/scripts/serve.py .agents/skills/preview/tests/test_serve.py .agents/skills/preview/scripts/preview.sh
git commit -m "Preview with Firebase-style clean URLs and shoot the newest doc

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Deploy guards and live checks for docs

**Files:**
- Modify: `.agents/skills/deploy/scripts/deploy.sh` (privacy guard; verification)
- Modify: `.agents/skills/site-quality/scripts/check.py` (`live_checks`, `lighthouse`, `lighthouse_run`)

**Interfaces:**
- Consumes: `check.py --newest-doc`, `indexable_pages`, `canonical_for`, `newest_doc`.
- Produces: `deploy.sh` refuses to deploy if an email or phone number appears in `public/*.html`, `public/docs/*.html` or `content/docs/*.md`; after deploy it verifies `/`, `/docs` and the newest doc byte-for-byte. `check.py --live` checks `/docs`, each doc, the `/docs/` and `.html` redirects, and every sitemap URL. `check.py --lighthouse` audits `/` and the newest doc in both themes.

- [ ] **Step 1: Write a failing privacy case**

```bash
mkdir -p content/docs && printf 'contact me at someone@example.com\n' > content/docs/zz-privacy-probe.md
grep -nEio 'mailto:[^"]*|[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}' public/*.html && echo FOUND || echo "not found (the current guard only scans public/*.html)"
```
Expected: `not found (the current guard only scans public/*.html)`.

- [ ] **Step 2: Extend the privacy guard**

In `deploy.sh`, replace:

```bash
if grep -nEio 'mailto:[^"]*|[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}' public/*.html; then
  die "public/ contains an email address — refusing to deploy"
fi
if grep -nEo '\+1[ .-]?[0-9]{3}[ .-]?[0-9]{3}[ .-]?[0-9]{4}|\(?[0-9]{3}\)?[ .-][0-9]{3}-[0-9]{4}' public/*.html; then
  die "public/ contains what looks like a phone number — refusing to deploy"
fi
```

with:

```bash
# Docs are scanned too, in their Markdown source and as built pages.
shopt -s nullglob
SCAN=(public/*.html public/docs/*.html content/docs/*.md)
shopt -u nullglob
if grep -nEio 'mailto:[^"]*|[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}' "${SCAN[@]}"; then
  die "the site or a doc contains an email address — refusing to deploy"
fi
if grep -nEo '\+1[ .-]?[0-9]{3}[ .-]?[0-9]{3}[ .-]?[0-9]{4}|\(?[0-9]{3}\)?[ .-][0-9]{3}-[0-9]{4}' "${SCAN[@]}"; then
  die "the site or a doc contains what looks like a phone number — refusing to deploy"
fi
```

- [ ] **Step 3: Verify the guard trips, then remove the probe**

Run:
```bash
bash -c 'shopt -s nullglob; SCAN=(public/*.html public/docs/*.html content/docs/*.md); grep -nEio "[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}" "${SCAN[@]}"'
rm content/docs/zz-privacy-probe.md && rmdir content/docs
```
Expected: `content/docs/zz-privacy-probe.md:1:someone@example.com`.

- [ ] **Step 4: Verify docs byte-for-byte after a deploy**

In `deploy.sh`, replace everything from `LOCAL_SHA="$(shasum -a 256 public/index.html | cut -d' ' -f1)"` through the end of the `verify()` function with:

```bash
# Pages to prove live: the home page, the docs index and the newest doc, each against its local file.
NEWEST="$(.agents/skills/site-quality/scripts/check.py --newest-doc)"
VERIFY=("/|public/index.html")
[[ -f public/docs/index.html ]] && VERIFY+=("/docs|public/docs/index.html")
[[ -n "$NEWEST" ]] && VERIFY+=("/${NEWEST%.html}|public/$NEWEST")

serves_local() { # serves_local <base url> <path> <local file>
  local got want
  want="$(shasum -a 256 "$3" | cut -d' ' -f1)"
  got="$(curl -fsSL --compressed -m 20 -H 'Cache-Control: no-cache' "$1$2" | shasum -a 256 | cut -d' ' -f1)" || return 1
  [[ "$got" == "$want" ]]
}

verify() { # verify <base url>: every page in VERIFY serves its local file
  local url="$1" entry path file i
  for entry in "${VERIFY[@]}"; do
    path="${entry%%|*}"; file="${entry#*|}"
    for i in 1 2 3 4 5 6; do
      if serves_local "$url" "$path" "$file"; then echo "✓ $url$path serves $file"; continue 2; fi
      sleep 5
    done
    echo "✗ $url$path does not serve $file (yet)"
    return 1
  done
}
```

Update the header comment: replace `# fails, the site's own web.app URL does not serve the exact index.html that was` / `# just deployed, or the live SEO checks fail afterwards.` with `# fails, the site's own web.app URL does not serve the exact home page, docs index and` / `# newest doc that were just deployed, or the live checks fail afterwards.`

Run: `bash -n .agents/skills/deploy/scripts/deploy.sh && echo syntax ok`
Expected: `syntax ok`.

- [ ] **Step 5: Live and Lighthouse checks for docs**

In `check.py`'s `live_checks`, insert before the line `    s, h, body = fetch(base + "/some/missing/page")`:

```python
    docs = [rel for rel in indexable_pages() if rel.startswith("docs/")]
    for rel in docs:
        path = canonical_for(rel)[len(SITE):]
        s, h, _ = fetch(base + path)
        same_csp = h.get("content-security-policy") == catch_all.get("Content-Security-Policy")
        check(s == 200 and same_csp, f"{path} -> {s}, CSP {'matches' if same_csp else 'differs from'} firebase.json")
    if docs:
        s, h, _ = fetch(base + "/docs/")
        check(s in (301, 308) and h.get("location", "").endswith("/docs"), f"/docs/ -> {s} {h.get('location', '')}")
    newest = newest_doc()
    if newest:
        clean = canonical_for(newest)[len(SITE):]
        s, h, _ = fetch(base + clean + ".html")
        check(s in (301, 308) and h.get("location", "").endswith(clean), f"{clean}.html -> {s} {h.get('location', '')}")
    # A regex, not an XML parser: this is network input, and <loc> is all we need from it.
    _, _, body = fetch(base + "/sitemap.xml")
    locs = [loc for loc in re.findall(r"<loc>([^<]+)</loc>", body.decode("utf-8", "replace")) if loc.startswith(SITE)]
    dead = [loc for loc in locs if fetch(base + loc[len(SITE):])[0] != 200]
    check(locs and not dead, f"every live sitemap URL returns 200 {dead or f'({len(locs)} URLs)'}")
```

Replace the `lighthouse` and `lighthouse_run` functions with:

```python
def lighthouse(base):
    # Audit the home page and the newest doc, each once per theme (0 = dark, 1 = light).
    newest = newest_doc()
    urls = [base + "/"] + ([base + canonical_for(newest)[len(SITE):]] if newest else [])
    for url in urls:
        for theme, scheme in (("dark", 0), ("light", 1)):
            lighthouse_run(url, theme, scheme)


def lighthouse_run(url, theme, scheme):
    print(f"lighthouse ({theme} theme): {url}")
    name = re.sub(r"[^a-z0-9]+", "-", url.split("://", 1)[-1].lower()).strip("-")
    out = f"/tmp/csarko-sh-lighthouse-{name}-{theme}.json"
```

keeping the rest of `lighthouse_run` (from `subprocess.run(["npx", …` onward) unchanged.

Run: `python3 -m py_compile .agents/skills/site-quality/scripts/check.py && .agents/skills/site-quality/scripts/check.py | tail -1`
Expected: no compile error; `✓ site checks passed`.

- [ ] **Step 6: Commit**

```bash
git add .agents/skills/deploy/scripts/deploy.sh .agents/skills/site-quality/scripts/check.py
git commit -m "Scan and verify docs on deploy; check docs live and in Lighthouse

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Publish the launch doc locally

**Files:**
- Create: `content/docs/stylized-shader-looks.md`
- Generated (commit, never hand-edit): `public/docs/stylized-shader-looks.html`, `public/docs/index.html`, `public/sitemap.xml`, `public/index.html` (docs block)

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Confirm the source is public and review it**

Run:
```bash
curl -s -o /dev/null -w '%{http_code}\n' https://github.com/csarkosh/game-dayhike/blob/main/docs/rendering/2026-09-14-stylized-shader-looks.md
grep -nEi '[a-z0-9._%+-]+@[a-z0-9-]+\.[a-z]{2,}|—' ~/Projects/game-dayhike/docs/rendering/2026-09-14-stylized-shader-looks.md || echo clean
```
Expected: `200`, then `clean`. Read the whole source file and confirm it contains no private product details (it is already public in `game-dayhike`).

- [ ] **Step 2: Copy it with front matter**

```bash
mkdir -p content/docs
{
  printf '%s\n' '---' \
    'description: How games use shaders to build a distinct look, from ink outlines and cel lighting to dithering, gradient fog and VHS effects.' \
    'published: 2026-09-14' \
    'source: https://github.com/csarkosh/game-dayhike/blob/main/docs/rendering/2026-09-14-stylized-shader-looks.md' \
    '---'
  cat ~/Projects/game-dayhike/docs/rendering/2026-09-14-stylized-shader-looks.md
} > content/docs/stylized-shader-looks.md
head -7 content/docs/stylized-shader-looks.md
```
Expected: the four front matter lines between `---` fences, then `# Stylized shader looks: how games build a visual identity`.

- [ ] **Step 3: Confirm the checks see it as stale before regenerating**

Run: `.agents/skills/site-quality/scripts/check.py | grep -E 'FAIL|✗|✓'`
Expected: `FAIL  public/ matches content/docs/ ['docs/index.html', 'docs/stylized-shader-looks.html', 'index.html', 'sitemap.xml'] — run generate-assets.sh`.

- [ ] **Step 4: Regenerate, twice**

Run:
```bash
.agents/skills/site-quality/scripts/generate-assets.sh | grep -E 'docs:|rewrote'
git add -A public content
.agents/skills/site-quality/scripts/generate-assets.sh >/dev/null && git status --short
```
Expected: first run prints `docs: 1 page(s) → public/` and `rewrote generated blocks in public/docs/index.html` and `…/docs/stylized-shader-looks.html`. After the second run, `git status --short` shows only staged changes (`A `/`M `), no unstaged (`AM`/` M`) entries: the build is stable.

- [ ] **Step 5: Run every check**

Run: `.agents/skills/site-quality/scripts/check.py; echo "exit $?"`
Expected: `exit 0`, `✓ site checks passed`. One expected warning: `title is 72 chars (30–65 shows in full)` for `docs/stylized-shader-looks.html`. Sections for `docs/index.html` and `docs/stylized-shader-looks.html` all show `ok`, including `JSON-LD TechArticle by #person, published 2026-09-14`, `JSON-LD CollectionPage lists 1 doc(s)`, `sitemap.xml lists exactly the indexable pages (3 URLs)`, and layout lines for `docs/index.html` and `docs/stylized-shader-looks.html` at every width.

- [ ] **Step 6: Look at it**

Run: `.agents/skills/preview/scripts/preview.sh --shots`
Then read these images and check each point:
- `/tmp/csarko-sh-preview/desktop.png` and `desktop-light.png`: a "03 / Research & docs" section after Games with one entry (title, `Sep 14, 2026 · 5 min read`, description) and "All docs →"; Skills is `04`, Contact `05`.
- `doc-desktop.png` and `doc-desktop-light.png`: contents rail on the left with `01`–`08`, "What this suggests for Day Hike" and "Sources"; eyebrow `RESEARCH · SEP 14, 2026`; tags `5 min read` and "Also on GitHub ↗"; the Sources table inside a bordered box; the author box at the end; colors correct in both themes (no dark panels in light mode).
- `doc-mobile.png` and `doc-mobile-light.png`: no rail, no horizontal overflow, nav shows the wordmark with Docs and Home on one line.

Then run `.agents/skills/preview/scripts/preview.sh --serve`, open `http://localhost:4173/docs` in Chrome, click through to the doc and back home, and stop the server with `--stop`.

- [ ] **Step 7: Commit**

```bash
git add content/docs/stylized-shader-looks.md public
git commit -m "Publish the stylized shader looks research as the first doc

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Document the docs section for agents and humans

**Files:**
- Create: `.agents/skills/publish-doc/SKILL.md`
- Modify: `AGENTS.md`, `README.md`, `.agents/skills/site-quality/SKILL.md`, `.agents/skills/preview/SKILL.md`, `.agents/skills/deploy/SKILL.md`

- [ ] **Step 1: Write the `publish-doc` skill**

Create `.agents/skills/publish-doc/SKILL.md`:

````markdown
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

Docs are Markdown files in `content/docs/<slug>.md`. `generate-assets.sh` turns
them into `https://csarko.sh/docs/<slug>`, the `/docs` index, the sitemap and the
home page's "Research & docs" section. The design is in
`docs/superpowers/specs/2026-09-15-docs-section-design.md`.

**The csarko.sh repository is public on GitHub. Committing a file under
`content/docs/` publishes it, before any deploy.** Do the review first.

## 1. Review the source before copying anything

Read the whole doc. Stop and ask Cyrus if any of these apply:

- It comes from a **private** repository (check with
  `gh repo view csarkosh/<repo> --json visibility`). Private docs, such as
  `magicpixel.ai`'s, need his explicit OK for that specific doc.
- It describes the **commercial asset pipeline**, unreleased product plans,
  customer names, pricing agreements, credentials, or internal URLs.
- It contains an email address or phone number (never allowed on the site).

## 2. Copy it in with front matter

`<slug>`: lowercase words joined by hyphens, no date (`stylized-shader-looks`).

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
`check.py` must pass. A title longer than 65 characters only warns.

## 4. Ship

Commit `content/docs/` and `public/` together, then use the **deploy** skill.
After it's live, remind Cyrus to open Search Console → URL Inspection and
request indexing for the new doc's URL and `https://csarko.sh/docs`.
````

- [ ] **Step 2: Update `AGENTS.md`**

Replace the intro paragraph:

```markdown
Cyrus Sarkosh's portfolio site, live at **https://csarko.sh**. One static page:
who he is, where he's worked, the games he builds, his skills, and how to reach
him. No framework, no build step, no CI.
```

with:

```markdown
Cyrus Sarkosh's portfolio site, live at **https://csarko.sh**. A home page (who
he is, where he's worked, the games he builds, his skills, and how to reach him)
plus research docs at **https://csarko.sh/docs**. No framework and no CI; the
one build step, `generate-assets.sh`, also turns `content/docs/*.md` into pages.
```

In the Layout table, replace the `public/index.html` row's first words `**The site.** One file:` with `**The home page.** One file:`; replace the row `| \`public/robots.txt\`, \`public/sitemap.xml\` | Crawl rules and the one-URL sitemap. |` with:

```markdown
| `public/robots.txt` | Crawl rules. |
| `content/docs/*.md` | **Published docs, source of truth.** Markdown with front matter, one file per doc. The repo is public, so committing a file here publishes it; use the `publish-doc` skill. |
| `public/docs/`, `public/sitemap.xml` | **Generated** from `content/docs/` by `build_docs.mjs` (run by `generate-assets.sh`), along with the `generated:docs` block in `index.html`. |
| `docs/superpowers/` | Internal design specs and implementation plans. Never published. |
```

and in the `.agents/skills/` row replace `` `preview`, `deploy` and `site-quality` `` with `` `preview`, `deploy`, `site-quality` and `publish-doc` ``.

In Workflows, replace the first bullet with:

```markdown
- **See a change:** `.agents/skills/preview/scripts/preview.sh` (opens the home page
  from disk; use `--serve` for `/docs` and its links) or `--shots` for desktop +
  mobile screenshots of the home page and the newest doc, in both the dark and
  light themes, in `/tmp/csarko-sh-preview/`. After any visual edit, look at the
  screenshots in both themes before calling it done.
- **Publish a doc:** the `publish-doc` skill.
```

and in the "Ship a change" bullet replace `It verifies the deployed \`index.html\` byte-for-byte` with `It verifies the deployed home page, docs index and newest doc byte-for-byte`.

In "Search Console state", replace the last bullet with:

```markdown
- After a meaningful content change or a new doc, use URL Inspection → Request
  indexing for the changed URLs (`https://csarko.sh/`, `https://csarko.sh/docs`,
  `https://csarko.sh/docs/<slug>`).
```

In "Content rules", after the "blog is csarko.log" bullet add:

```markdown
- **Docs** *(added 2026-09-15)*: research notes and specs at `/docs`, copied into
  `content/docs/` (the published copy is the source of truth). The page copy rules
  apply (no email, phone or em-dashes; the build and deploy enforce them). Docs
  from private repositories such as `magicpixel.ai` need Cyrus's OK per doc, and
  never describe the commercial asset pipeline. Launched with
  `stylized-shader-looks`, from `game-dayhike`.
```

- [ ] **Step 3: Update `README.md`**

Replace `It's a single hand-written HTML page: no framework, no build step, fully agent-managed.` with `A hand-written home page plus research docs built from Markdown at [csarko.sh/docs](https://csarko.sh/docs): no framework, fully agent-managed.`

In the "What's here" block, replace `public/            the site: index.html and a portrait` with:

```
public/            the site: index.html, docs/ (generated) and assets
content/docs/      the docs, as Markdown with front matter
```

and replace `.agents/skills/    preview, deploy and site-quality skills for AI agents (and humans)` with `.agents/skills/    preview, deploy, site-quality and publish-doc skills for AI agents (and humans)`.

Replace `.agents/skills/preview/scripts/preview.sh --serve   # serve on http://localhost:4173` with `.agents/skills/preview/scripts/preview.sh --serve   # serve on http://localhost:4173 with clean URLs (needed for /docs)`, and `Or just open \`public/index.html\` in a browser.` with `Or just open \`public/index.html\` in a browser (its /docs links need --serve).`

In the Quality list, replace the "Findable" bullet with `- **Findable:** canonical URLs, schema.org \`Person\` data on the home page and \`TechArticle\` + breadcrumbs on every doc, a 1200×630 link-preview card, real favicons, \`robots.txt\` and a generated sitemap.`

- [ ] **Step 4: Update `site-quality/SKILL.md`**

Replace `100 and Performance ≥ 95, Mozilla Observatory A+, no layout breakage from 320px to 1440px.** It's one page, so every one of these is achievable and should stay that way.` with `100 and Performance ≥ 95, Mozilla Observatory A+, no layout breakage from 320px to 1440px.** They apply to the home page and to every docs page.`

In the Scripts block add a line after `$S/generate-assets.sh …`:

```bash
node $S/build_docs.mjs         # just the docs: content/docs/*.md → public/docs/, sitemap, home section (generate-assets.sh runs it)
```

and after the block add:

```markdown
Unit tests: `node --test .agents/skills/site-quality/tests/docs_lib.test.mjs` and
`python3 -m unittest discover -s .agents/skills/site-quality/tests`.
```

Add a row at the top of the "Generated assets" table:

```markdown
| `public/docs/<slug>.html`, `public/docs/index.html`, `public/sitemap.xml`, `<!-- generated:docs -->` in `index.html` | `content/docs/*.md` via `build_docs.mjs` (logic in `docs_lib.mjs`, `marked` vendored in `scripts/vendor/`) | Doc pages copy `index.html`'s theme token blocks and get fonts and analytics from `build_assets.py`, with root-relative paths. `check.py` rebuilds into a temp dir and fails if `public/` is stale. |
```

In "What each check protects", append to the **SEO** paragraph: `Every page's canonical must match its clean URL (\`docs/x.html\` → \`https://csarko.sh/docs/x\`); docs need \`og:type\` \`article\`, \`TechArticle\` JSON-LD whose author is \`#person\`, and a \`BreadcrumbList\`; \`/docs\` needs \`CollectionPage\`. The sitemap must list exactly the indexable pages, and root-relative links must resolve without a redirect (no trailing \`/\`, no \`.html\`).` Append to **Performance**: `Doc pages get a 120 KB HTML budget.` Append to **Layout**: `The same checks run on \`/docs\` and the newest doc.`

In "Checklist for any change to public/", add item 8: `8. New or changed doc? Use the \`publish-doc\` skill; never edit \`public/docs/\` by hand.`

- [ ] **Step 5: Update `preview/SKILL.md` and `deploy/SKILL.md`**

In `preview/SKILL.md`, replace the command block's `--serve` and `--shots` comments with `# serve on http://localhost:4173 with Firebase-style clean URLs` and `# screenshots of home + newest doc, dark + light → /tmp/csarko-sh-preview/`. Replace the "Plain open (default)" bullet with:

```markdown
- **Plain open (default)** is enough for home-page changes. Its links to
  `/docs` are root-relative and only work under `--serve`.
- **`--serve`** runs `scripts/serve.py`, which routes like Firebase
  (`/docs/x` → `docs/x.html`, trailing slashes and `.html` redirect). Use it for
  docs pages and anything that depends on how URLs resolve.
```

and in the `--shots` bullet replace `writes \`desktop.png\` (1440px wide) and \`mobile.png\` (390px) in the dark theme, plus \`desktop-light.png\` and \`mobile-light.png\`.` with `writes \`desktop.png\` (1440px wide) and \`mobile.png\` (390px) in the dark theme, plus \`desktop-light.png\` and \`mobile-light.png\`, and the same four with a \`doc-\` prefix for the newest doc. Pages load from a temporary \`serve.py\`.`

In `deploy/SKILL.md`, replace `is no build step and no CI: a deploy is one script, run by hand.` with `is no CI: a deploy is one script, run by hand. If a doc in \`content/docs/\` changed, run \`generate-assets.sh\` and commit first; the checks refuse a stale \`public/\`.`; in guard 1 replace `refuses to deploy if \`public/\` contains an email address or a` with `refuses to deploy if \`public/\` or \`content/docs/\` contains an email address or a`; replace step 4 with:

```markdown
4. **Verifies** by fetching `/`, `/docs` and the newest doc from the `web.app`
   URL and from `https://csarko.sh`, comparing SHA-256 against the local files.
   The web.app check must pass; the custom-domain check is reported but only
   warns, since CDN propagation can lag a few seconds.
```

and in step 5 replace `robots/sitemap/og-image/favicons,` with `robots/sitemap/og-image/favicons, \`/docs\` and every doc (200, same CSP, clean-URL redirects), every sitemap URL,`.

- [ ] **Step 6: Check the edits**

Run:
```bash
grep -rn "no build step\|one-URL sitemap\|It's one page" AGENTS.md README.md .agents/skills/*/SKILL.md || echo "no stale phrases"
ls .claude/skills/publish-doc/SKILL.md
.agents/skills/site-quality/scripts/check.py | tail -1
```
Expected: `no stale phrases`; the skill resolves through the symlink; `✓ site checks passed`.

- [ ] **Step 7: Commit**

```bash
git add .agents/skills/publish-doc AGENTS.md README.md .agents/skills/site-quality/SKILL.md .agents/skills/preview/SKILL.md .agents/skills/deploy/SKILL.md
git commit -m "Document the docs section and add the publish-doc skill

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Ship (only with Cyrus's go-ahead)

**Files:** none changed unless a check fails.

- [ ] **Step 1: Final local verification**

Run:
```bash
node --test .agents/skills/site-quality/tests/docs_lib.test.mjs 2>&1 | grep -E '^# (pass|fail)'
python3 -m unittest discover -s .agents/skills/site-quality/tests 2>&1 | tail -1
python3 -m unittest discover -s .agents/skills/preview/tests 2>&1 | tail -1
.agents/skills/site-quality/scripts/check.py | tail -1
git status --short
```
Expected: `# pass 18`, `# fail 0`; `OK`; `OK`; `✓ site checks passed`; clean tree.

- [ ] **Step 2: Ask Cyrus**

Summarize what will go live (`/docs`, `/docs/stylized-shader-looks`, the home section, section renumbering) and ask whether to (a) merge `docs-section` into `master` first (use superpowers:finishing-a-development-branch), (b) deploy a 7-day preview channel, or (c) deploy live. Do nothing outward-facing without an explicit yes.

- [ ] **Step 3: Deploy as chosen**

Preview: `.agents/skills/deploy/scripts/deploy.sh --preview` and give Cyrus the printed URL.
Live: `.agents/skills/deploy/scripts/deploy.sh`.
Expected (live): `✓ https://csarko-sh.web.app/ serves public/index.html`, `✓ …/docs serves public/docs/index.html`, `✓ …/docs/stylized-shader-looks serves public/docs/stylized-shader-looks.html`, then the `--live` checks pass.

- [ ] **Step 4: Live quality run**

Run: `.agents/skills/site-quality/scripts/check.py --live --lighthouse --observatory`
Expected: Lighthouse SEO, Accessibility, Best Practices 100 and Performance ≥ 95 for `https://csarko.sh/` and `https://csarko.sh/docs/stylized-shader-looks` in both themes; CLS ≤ 0.05; Observatory `grade A+`. Report the numbers as printed.

- [ ] **Step 5: Hand off the manual steps**

Tell Cyrus: in Search Console, URL Inspection → Request indexing for `https://csarko.sh/docs` and `https://csarko.sh/docs/stylized-shader-looks`. Optionally (his call, a change in another repo): add a "Published at https://csarko.sh/docs/stylized-shader-looks" line to the top of the `game-dayhike` original.
