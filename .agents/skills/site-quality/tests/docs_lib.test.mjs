// Tests for docs_lib.mjs. Run: node --test .agents/skills/site-quality/tests/docs_lib.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSite, DocError, docPage, formatDate, homeSection, indexPage, loadDoc, parseFrontMatter, readingMinutes, renderMarkdown, replaceBlock, sitemap, sortDocs, themeBlocks } from '../scripts/docs_lib.mjs';

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

test('renderMarkdown never reuses an id even when the generated candidate collides', () => {
  const r = renderMarkdown('# T\n\n## Foo\n\n## Foo\n\n## Foo 1\n', FILE);
  const ids = r.rail.map((s) => s.id);
  assert.equal(ids[0], 'foo');
  assert.equal(ids[1], 'foo-1');
  assert.equal(new Set(ids).size, ids.length);
});

test('renderMarkdown decodes numeric entities in headings but leaves other named entities alone', () => {
  const r = renderMarkdown('# A &#169; B\n\n## C &#x2764; &hearts; D\n', FILE);
  assert.equal(r.title, 'A © B');
  assert.equal(r.rail[0].text, 'C ❤ &hearts; D');
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
  bad('# T with a [link](/x)\n', /headings can't contain links \(\/x\)/);
  bad('# T\n\n## Section with a [link](https:\/\/example.com)\n', /headings can't contain links \(https:\/\/example\.com\)/);
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
  const personNode = { '@type': 'Person', '@id': 'https://csarko.sh/#person', name: 'Cyrus Sarkosh', url: 'https://csarko.sh/' };
  assert.deepEqual(article.author, personNode);
  assert.deepEqual(article.publisher, personNode);
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

test('sitemap lists home, the index and every doc, with lastmod only on docs', () => {
  assert.equal(sitemap([]),
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>https://csarko.sh/</loc>\n  </url>\n</urlset>\n');
  const xml = sitemap(sortDocs([doc('a', '2026-01-01'), doc('b', '2026-03-01', 'updated: 2026-04-01\n')]));
  assert.ok(xml.includes('  <url>\n    <loc>https://csarko.sh/</loc>\n  </url>'), '/ has no lastmod');
  assert.ok(xml.includes('  <url>\n    <loc>https://csarko.sh/docs</loc>\n  </url>'), '/docs has no lastmod');
  assert.deepEqual([...xml.matchAll(/<loc>(.*?)<\/loc>\n    <lastmod>(.*?)<\/lastmod>/g)].map((m) => [m[1], m[2]]), [
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
