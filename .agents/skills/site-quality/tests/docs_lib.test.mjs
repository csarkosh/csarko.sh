// Tests for docs_lib.mjs. Run: node --test .agents/skills/site-quality/tests/docs_lib.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSite, PROJECT_KINDS, CATEGORIES, categorySlug, DATED_SINCE, DocError, docLinks, docPage, feed, IEEE_SINCE, undatedParagraphs, formatDate, indexPage, loadApp, loadDoc, loadFilm, loadGame, parseDocFileName, parseFilmFileName, parseFrontMatter, parseGameFileName, projectsPage, readingMinutes, renderMarkdown, sitemap, sortDocs, sortProjects, standaloneShell, themeBlocks } from '../scripts/docs_lib.mjs';

const FILE = 'docs/published/2026-09-14-example.md';
const DESC = 'A description that is long enough to pass the seventy character minimum for search.';
// Every doc needs categories; the tests that are not about them get one by default.
const fm = (lines) => `---\n${lines.join('\n')}${lines.some((l) => l.startsWith('categories:')) ? '' : '\ncategories: Tooling'}\n---\n# Title\n\nBody.\n`;
const rejects = (text, pattern) =>
  assert.throws(() => parseFrontMatter(text, FILE), (e) => e instanceof DocError && pattern.test(e.message));

test('parseFrontMatter reads required and optional keys and returns the body', () => {
  const source = 'https://github.com/csarkosh/game-dayhike/blob/main/docs/x.md';
  const { meta, body } = parseFrontMatter(
    fm([`description: ${DESC}`, 'published: 2026-09-14', 'updated: 2026-09-15', `source: ${source}`]), FILE);
  assert.deepEqual(meta, { description: DESC, published: '2026-09-14', updated: '2026-09-15', source, categories: ['Tooling'] });
  assert.equal(body, '# Title\n\nBody.\n');
});

test('parseFrontMatter reads categories in the fixed order and refuses anything outside the set', () => {
  const base = [`description: ${DESC}`, 'published: 2026-09-14'];
  const { meta } = parseFrontMatter(fm([...base, 'categories: Worlds and terrain,  Rendering ']), FILE);
  assert.deepEqual(meta.categories, ['Rendering', 'Worlds and terrain'], 'the set\'s order, not the doc\'s');
  assert.deepEqual(parseFrontMatter(fm([...base, 'categories: AI, Film, Game design']), FILE).meta.categories, ['AI', 'Game design', 'Film']);
  assert.deepEqual(CATEGORIES, ['Distributed systems', 'AI', 'Rendering', 'Worlds and terrain', 'Game design', 'Film', 'Tooling']);
  assert.equal(categorySlug('Worlds and terrain'), 'worlds-and-terrain');
  rejects(`---\ndescription: ${DESC}\npublished: 2026-09-14\n---\n# T\n`, /needs "categories"/);
  rejects(fm([...base, 'categories: Graphics']), /unknown category "Graphics" \(one of: Distributed systems, AI/);
  rejects(fm([...base, 'categories: rendering']), /unknown category "rendering"/);
  rejects(fm([...base, 'categories: Rendering, Rendering']), /listed twice/);
  rejects(fm([...base, 'categories: AI, Film, Game design, Tooling']), /4 categories; at most 3/);
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
  assert.match(r.html, /<div class="scroll" tabindex="0" role="region" aria-label="Table"><table>[\s\S]*<\/table><\/div>/);
  assert.ok(r.html.includes('<div class="scroll" tabindex="0" role="region" aria-label="Code"><pre><code>code\n</code></pre></div>'));
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

// IEEE references: [n] in the text, a numbered list under "## Sources".
const ref = (n) => `${n}. A. Author, "Page ${n}," Site. Accessed: Sep. 23, 2026. [Online]. Available: https://example.com/${n}`;
const ieeeDoc = (text, refs = [ref(1), ref(2)]) => `# T\n\n${text}\n\n## Sources\n\n${refs.join('\n')}\n`;
const ieeeBad = (md, pattern, opts) =>
  assert.throws(() => renderMarkdown(md, FILE, opts), (e) => e instanceof DocError && pattern.test(e.message));

test('renderMarkdown links [n] citations to an IEEE reference list', () => {
  const fence = '`'.repeat(3);
  const r = renderMarkdown(ieeeDoc(`Fast [1], and slow [2], [1]. Code \`a[2]\` stays.\n\n${fence}\nb[1]\n${fence}`), FILE);
  assert.equal(r.references, 2);
  assert.ok(r.html.includes('Fast <a class="cite" href="#ref-1">[1]</a>, and slow <a class="cite" href="#ref-2">[2]</a>, <a class="cite" href="#ref-1">[1]</a>.'));
  assert.ok(r.html.includes('<code>a[2]</code>'));
  assert.ok(r.html.includes('<code>b[1]\n</code>'));
  assert.ok(r.html.includes('<ol class="references">\n<li id="ref-1"><span class="ref-num">[1]</span><div>A. Author, &quot;Page 1,&quot; Site. Accessed: Sep. 23, 2026. [Online]. Available: <a class="external" href="https://example.com/1" target="_blank" rel="noopener">https://example.com/1</a></div></li>'));
  assert.ok(r.html.includes('<li id="ref-2">'));
});

test('renderMarkdown leaves docs without an IEEE list exactly as before', () => {
  const md = '# T\n\nArrays like x[1] stay text.\n\n## Sources\n\n| Source | Covers |\n| --- | --- |\n| [A](https://example.com) | B |\n';
  const r = renderMarkdown(md, FILE);
  assert.equal(r.references, 0);
  assert.ok(r.html.includes('x[1] stay'));
  assert.ok(!r.html.includes('class="cite"'));
});

test('renderMarkdown enforces IEEE rules on a reference list', () => {
  ieeeBad(ieeeDoc('Only [1].'), /reference \[2\] is never cited/);
  ieeeBad(ieeeDoc('Both [1], [3].'), /cites \[3\] but Sources has 2 reference\(s\)/);
  ieeeBad(ieeeDoc('Wrong order [2], then [1].'), /\[2\] is cited before \[1\]/);
  ieeeBad(ieeeDoc('A [1] B [2].', [ref(1), ref(3)]), /reference 2 is numbered "3\."/);
  ieeeBad(ieeeDoc('A [1].', ['1. A. Author, "Page," Site. [Online]. Available: https://example.com']), /reference \[1\] needs "Accessed:/);
  ieeeBad(ieeeDoc('A [1].', ['1. A. Author, "Page," Site. Accessed: Sep. 23, 2026.']), /reference \[1\] needs "\[Online\]\. Available:/);
});

test('renderMarkdown requires IEEE references once a doc is new enough', () => {
  const bullets = '# T\n\n## Sources\n\n- [A](https://example.com)\n';
  assert.doesNotThrow(() => renderMarkdown(bullets, FILE));
  ieeeBad(bullets, /"## Sources" must be a numbered list of IEEE references/, { ieee: true });
  assert.doesNotThrow(() => renderMarkdown('# T\n\nNo sources at all.\n', FILE, { ieee: true }));
  const numbered = renderMarkdown(ieeeDoc('A [1] B [2].').replace('## Sources', '## 8. Sources'), FILE, { ieee: true });
  assert.equal(numbered.references, 2);
});

test('loadDoc holds docs published from IEEE_SINCE to IEEE, and only their pages carry its CSS', () => {
  const doc = (published, body) => `---\ndescription: ${DESC}\npublished: ${published}\ncategories: Tooling\n---\n${body}`;
  const bullets = '# T\n\nText.\n\n## Sources\n\n- [A](https://example.com)\n';
  assert.doesNotThrow(() => loadDoc('2026-09-22-old.md', doc('2026-09-22', bullets)));
  assert.throws(() => loadDoc(`${IEEE_SINCE}-new.md`, doc(IEEE_SINCE, bullets)), /must be a numbered list of IEEE references/);
  const withRefs = docPage(loadDoc(`${IEEE_SINCE}-new.md`, doc(IEEE_SINCE, ieeeDoc('A [1] B [2].'))), '');
  const without = docPage(loadDoc('2026-09-22-old.md', doc('2026-09-22', bullets)), '');
  assert.ok(withRefs.includes('.prose .references {'));
  assert.ok(!without.includes('.prose .references {'));
});

const SOURCE = `---\ndescription: ${DESC}\npublished: 2026-09-14\ncategories: Rendering, Tooling\n---\n# Title\n\n## 1. One\n\nText.\n`;

test('parseDocFileName splits a dated file name into its date and slug', () => {
  assert.deepEqual(parseDocFileName('2026-09-14-stylized-shader-looks.md'),
    { date: '2026-09-14', slug: 'stylized-shader-looks' });
  assert.deepEqual(parseDocFileName('2026-01-05-x9.md'), { date: '2026-01-05', slug: 'x9' });
});

test('parseDocFileName rejects anything but <YYYY-MM-DD>-<slug>.md', () => {
  const bad = (name) =>
    assert.throws(() => parseDocFileName(name),
      (e) => e instanceof DocError && /file name must be <YYYY-MM-DD>-<slug>\.md/.test(e.message));
  bad('stylized-shader-looks.md');           // no date prefix
  bad('2026-9-14-shader-looks.md');          // date not zero-padded
  bad('2026-02-30-shader-looks.md');         // not a real date
  bad('2026-13-01-shader-looks.md');         // not a real month
  bad('2026-09-14-Shader-Looks.md');         // uppercase slug
  bad('2026-09-14-shader_looks.md');         // underscored slug
  bad('2026-09-14-shader--looks.md');        // empty slug segment
  bad('2026-09-14-.md');                     // no slug at all
  bad('2026-09-14-shader-looks.markdown');   // wrong extension
});

test('loadDoc combines front matter and rendering', () => {
  const d = loadDoc('2026-09-14-shader-looks.md', SOURCE);
  assert.equal(d.slug, 'shader-looks');
  assert.equal(d.url, 'https://csarko.sh/research/shader-looks');
  assert.equal(d.path, '/research/shader-looks');
  assert.equal(d.title, 'Title');
  assert.equal(d.description, DESC);
  assert.equal(d.published, '2026-09-14');
  assert.equal(d.updated, undefined);
  assert.equal(d.modified, '2026-09-14');
  assert.equal(d.rail.length, 1);
});

test('loadDoc rejects bad file names and em-dashes', () => {
  assert.throws(() => loadDoc('2026-09-14-Shader_Looks.md', SOURCE), /file name must be <YYYY-MM-DD>-<slug>\.md/);
  assert.throws(() => loadDoc('shader-looks.md', SOURCE), /file name must be <YYYY-MM-DD>-<slug>\.md/);
  assert.throws(() => loadDoc('2026-09-15-index.md', SOURCE.replace('2026-09-14', '2026-09-15')), /"index" is reserved/);
  assert.throws(() => loadDoc('2026-09-14-x.md', SOURCE.replace('Text.', 'Text — more.')), /em-dash/);
});

test('loadDoc refuses a file name date that disagrees with the front matter', () => {
  assert.throws(() => loadDoc('2026-09-15-shader-looks.md', SOURCE),
    (e) => e instanceof DocError
      && /docs\/published\/2026-09-15-shader-looks\.md: file name says 2026-09-15 but front matter says published: 2026-09-14/.test(e.message));
});

test('loadDoc names the new path in front matter and markdown errors', () => {
  assert.throws(() => loadDoc('2026-09-14-shader-looks.md', '# Title\n'),
    /docs\/published\/2026-09-14-shader-looks\.md: must start with a --- front matter block/);
  assert.throws(() => loadDoc('2026-09-14-shader-looks.md', SOURCE.replace('# Title', 'Body only')),
    /docs\/published\/2026-09-14-shader-looks\.md: needs exactly one "# " title/);
});

const INDEX = `<style>
    :root {
      color-scheme: dark;
      --bg: #0a0b0e;
      --md-easing-standard: cubic-bezier(0.2, 0, 0, 1);
      --md-duration-short3: 150ms;
      --md-duration-medium4: 400ms;
    }
    @media (prefers-color-scheme: light) {
      :root {
        color-scheme: light;
        --bg: #f6f7f9;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      :root {
        --md-duration-short3: 0ms;
        --md-duration-medium4: 0ms;
      }
    }
  </style>
  <main></main>`;
const src = (slug, published, extra = '') =>
  ({ name: `${published}-${slug}.md`, text: `---\ndescription: ${DESC}\npublished: ${published}\n${extra.includes('categories:') ? '' : 'categories: Tooling\n'}${extra}---\n# ${slug} title\n\n## 1. One\n\nText.\n` });
const doc = (...args) => { const s = src(...args); return loadDoc(s.name, s.text); };
const jsonLd = (html) => JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)[1])['@graph'];

test('themeBlocks copies both token blocks and the reduced-motion block verbatim', () => {
  assert.equal(themeBlocks(INDEX),
    ':root {\n      color-scheme: dark;\n      --bg: #0a0b0e;\n      --md-easing-standard: cubic-bezier(0.2, 0, 0, 1);\n      --md-duration-short3: 150ms;\n      --md-duration-medium4: 400ms;\n    }\n    @media (prefers-color-scheme: light) {\n      :root {\n        color-scheme: light;\n        --bg: #f6f7f9;\n      }\n    }\n    @media (prefers-reduced-motion: reduce) {\n      :root {\n        --md-duration-short3: 0ms;\n        --md-duration-medium4: 0ms;\n      }\n    }');
  assert.throws(() => themeBlocks('<style></style>'), /theme token blocks not found/);
});

test('themeBlocks copies the motion tokens and the reduced-motion block', () => {
  const out = themeBlocks(INDEX);
  assert.match(out, /--md-easing-standard: cubic-bezier\(0\.2, 0, 0, 1\)/);
  assert.match(out, /@media \(prefers-reduced-motion: reduce\)[\s\S]*--md-duration-medium4: 0ms/);
});

test('themeBlocks refuses an index.html without the reduced-motion block', () => {
  const without = INDEX.replace(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n    \}\n  <\/style>/, '</style>');
  assert.notEqual(without, INDEX);
  assert.throws(() => themeBlocks(without), DocError);
});

test('no generated page uses a bare ease or a literal transition duration', () => {
  const out = buildSite({ sources: [src('a', '2026-01-01')], indexHtml: INDEX });
  const projects = projectsPage([game('day-hike'), film('hallway'), app('lib-visits', ['license: GPL-3.0'])], themeBlocks(INDEX));
  const pages = [...out.entries(), ['projects', projects]].filter(([, v]) => typeof v === 'string' && v.includes('transition'));
  assert.ok(pages.length > 0, 'some generated page has a transition');
  for (const [name, css] of pages) {
    assert.doesNotMatch(css, /transition:[^;]*\bease\b/, `${name}: bare ease`);
    assert.doesNotMatch(css, /transition:[^;]*\b\d+(\.\d+)?m?s\b/, `${name}: literal duration`);
  }
});

test('a doc with a Sources section marks that heading, not the author box, as its read end', () => {
  const r = renderMarkdown(ieeeDoc('Text [1], [2].').replace('## Sources', '## 2. Sources'), FILE);
  assert.equal(r.hasSources, true);
  assert.ok(r.html.includes('<div class="section-head" data-read-end><p class="section-label">02</p><h2 id="sources">'));
  assert.equal(r.html.split(' data-read-end').length, 2, 'exactly one end marker');
  const s = src('cited', '2026-09-14');
  const html = docPage(loadDoc(s.name, s.text.replace('Text.\n', 'Text [1].\n\n## Sources\n\n' + ref(1) + '\n')), themeBlocks(INDEX));
  assert.ok(html.includes('<section class="author" aria-label="About the author">'));
  assert.equal(html.split(' data-read-end').length, 2, 'exactly one end marker on the page');
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
  assert.ok(html.includes('<link rel="canonical" href="https://csarko.sh/research/shader-looks" />'));
  assert.ok(html.includes('<meta property="og:url" content="https://csarko.sh/research/shader-looks" />'));
  assert.ok(html.includes('<meta property="og:type" content="article" />'));
  assert.ok(html.includes('<meta property="article:published_time" content="2026-09-14" />'));
  assert.ok(html.includes('<meta property="article:modified_time" content="2026-09-15" />'));
  // The trail above the header says Research, so the eyebrow is dates alone.
  assert.ok(html.includes('<p class="eyebrow">Sep 14, 2026 · Updated Sep 15, 2026</p>'));
  assert.ok(html.includes(`<a class="external" href="${source}" target="_blank" rel="noopener">Also on GitHub</a>`));
  assert.ok(html.includes('<body class="doc-page">\n  <a class="skip-link" href="#top">Skip to content</a>'));
  assert.ok(html.includes('<main id="top" tabindex="-1">'));
  assert.ok(html.includes('<a href="#one" data-visits-event="toc-rail"><span class="num" aria-hidden="true">01</span><span>One</span></a>'));
  // No Sources section, so the author box is the end the visits client's leave beacon reports for the read event.
  assert.ok(html.includes('<section class="author" aria-label="About the author" data-read-end>'));
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
  assert.equal(article.url, 'https://csarko.sh/research/shader-looks');
  assert.equal(article.dateModified, '2026-09-15');
  assert.deepEqual(article.sameAs, [source]);
  const crumbs = graph.find((n) => n['@type'] === 'BreadcrumbList').itemListElement.map((i) => i.item);
  assert.deepEqual(crumbs, ['https://csarko.sh/', 'https://csarko.sh/research', 'https://csarko.sh/research/shader-looks']);
});

test('indexPage lists every doc with CollectionPage JSON-LD', () => {
  const html = indexPage(sortDocs([doc('a', '2026-01-01'), doc('b', '2026-03-01')]), themeBlocks(INDEX));
  assert.ok(html.includes('<title>Research &amp; notes · Cyrus Sarkosh</title>'));
  assert.ok(html.includes('<p class="eyebrow">Research</p>'));
  assert.ok(html.includes('<link rel="canonical" href="https://csarko.sh/research" />'));
  assert.ok(html.includes('<meta property="og:type" content="website" />'));
  assert.deepEqual([...html.matchAll(/<h2 class="doc-title"><a class="stretch" href="\/research\/([a-z]+)">/g)].map((m) => m[1]), ['b', 'a']);
  // Every entry is a card whose whole surface is the link (see .stretch in DOCS_CSS), and
  // carries its categories as tokens for the filter and as tags for the reader.
  assert.equal([...html.matchAll(/<li class="card" data-categories="tooling">/g)].length, 2);
  assert.equal([...html.matchAll(/<ul class="tags" aria-label="Categories"><li>Tooling<\/li><\/ul>/g)].length, 2);
  const page = jsonLd(html).find((n) => n['@type'] === 'CollectionPage');
  assert.deepEqual(page.mainEntity.itemListElement.map((i) => i.url), ['https://csarko.sh/research/b', 'https://csarko.sh/research/a']);
});

test('indexPage carries one filter chip a category with its count, All as a reset, and a CSS rule a chip, no script', () => {
  const html = indexPage(sortDocs([doc('a', '2026-01-01'), doc('b', '2026-03-01')]), themeBlocks(INDEX));
  assert.ok(html.includes('<form class="filters" aria-label="Filter by category">'));
  assert.ok(html.includes('<button type="reset" class="chip all" data-visits-event="filter-all">All <small>2</small></button>'));
  for (const c of CATEGORIES) {
    const slug = categorySlug(c);
    const count = c === 'Tooling' ? 2 : 0;
    assert.ok(html.includes(`<label class="chip"><input type="radio" name="category" value="${slug}" id="cat-${slug}" data-visits-event="filter-${slug}" />${c} <small>${count}</small></label>`), c);
    assert.ok(html.includes(`.docs-index:has(#cat-${slug}:checked) .all-docs > li[data-categories~="${slug}"] { display: flex; }`), `${c} rule`);
  }
  assert.ok(html.includes('.docs-index:has(.filters input:checked) .all-docs > li { display: none; }'));
  assert.ok(!/<script(?![^>]*\b(src=|type="application\/ld\+json"))/.test(html), 'no inline script does the filtering');
});

test('the research index has no Start here row; every doc is in the one filtered list, and featured is refused', () => {
  const html = indexPage(sortDocs([doc('a', '2026-01-01'), doc('b', '2026-03-01')]), themeBlocks(INDEX));
  assert.ok(!html.includes('start-here') && !html.includes('Start here') && !html.includes('start-list'));
  assert.deepEqual([...html.matchAll(/<h2 class="doc-title"><a class="stretch" href="\/research\/([a-z]+)">/g)].map((m) => m[1]), ['b', 'a'], 'each doc a card in the one list, a level under the page title');
  assert.throws(() => doc('d', '2026-01-01', 'featured: 1\n'), /unknown front matter key "featured"/);
});

test('sitemap lists home, the index and every doc, with lastmod only on docs', () => {
  assert.equal(sitemap([]),
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>https://csarko.sh/</loc>\n  </url>\n</urlset>\n');
  const xml = sitemap(sortDocs([doc('a', '2026-01-01'), doc('b', '2026-03-01', 'updated: 2026-04-01\n')]));
  assert.ok(xml.includes('  <url>\n    <loc>https://csarko.sh/</loc>\n  </url>'), '/ has no lastmod');
  assert.ok(xml.includes('  <url>\n    <loc>https://csarko.sh/research</loc>\n  </url>'), '/research has no lastmod');
  assert.deepEqual([...xml.matchAll(/<loc>(.*?)<\/loc>\n    <lastmod>(.*?)<\/lastmod>/g)].map((m) => [m[1], m[2]]), [
    ['https://csarko.sh/research/b', '2026-04-01'],
    ['https://csarko.sh/research/a', '2026-01-01'],
  ]);
});

test('buildSite writes every output, deterministically, and nothing extra with no docs', () => {
  const sources = [src('b', '2026-03-01'), src('a', '2026-01-01')];
  const one = buildSite({ sources, indexHtml: INDEX });
  const two = buildSite({ sources: [...sources].reverse(), indexHtml: INDEX });
  // The home page is read only for its theme tokens; since the Notes section went, nothing is written to it.
  assert.deepEqual([...one.keys()].sort(), ['research/a.html', 'research/b.html', 'research/feed.xml', 'research/index.html', 'sitemap.xml']);
  assert.deepEqual(Object.fromEntries(one), Object.fromEntries(two));
  const empty = buildSite({ sources: [], indexHtml: INDEX });
  assert.deepEqual([...empty.keys()].sort(), ['sitemap.xml']);
});

test('buildSite refuses two dates claiming one slug, instead of overwriting the page', () => {
  const sources = [src('a', '2026-01-01'), src('a', '2026-04-01')];
  assert.throws(
    () => buildSite({ sources, indexHtml: INDEX }),
    (e) => e instanceof DocError && /2026-04-01-a\.md and 2026-01-01-a\.md both build \/research\/a/.test(e.message));
});

// ---------------------------------------------------------------- games

const gameSrc = (slug, lines = [], body = 'The story.') => {
  const keys = lines.map((l) => l.split(':')[0]);
  const base = [['status', 'playable'], ['tags', 'TypeScript, Babylon.js']]
    .filter(([k]) => !keys.includes(k)).map(([k, v]) => `${k}: ${v}`);
  return { name: `${slug}.md`, text: `---\ndescription: ${DESC}\n${[...base, ...lines].map((l) => `${l}\n`).join('')}---\n# ${slug} title\n\n${body}\n` };
};
const game = (...args) => { const s = gameSrc(...args); return loadGame(s.name, s.text); };
const rejectsGame = (slug, lines, pattern) =>
  assert.throws(() => game(slug, lines), (e) => e instanceof DocError && pattern.test(e.message));

test('parseGameFileName takes the slug alone, with no date', () => {
  assert.deepEqual(parseGameFileName('day-hike.md'), { slug: 'day-hike' });
  for (const name of ['Day-Hike.md', 'day_hike.md', 'day hike.md', 'day-hike.markdown']) {
    assert.throws(() => parseGameFileName(name),
      (e) => e instanceof DocError && /file name must be <slug>\.md/.test(e.message), name);
  }
  // A date is legal in a slug, so it has to be refused on purpose.
  assert.throws(() => parseGameFileName('2026-09-16-day-hike.md'),
    (e) => e instanceof DocError && /carries no date; use "released:"/.test(e.message));
});

test('loadGame reads the front matter, splits the tags and turns status into the kicker', () => {
  const g = game('day-hike', ['play: https://games.csarko.sh/dayhike/', 'repo: https://github.com/csarkosh/game-dayhike']);
  assert.equal(g.slug, 'day-hike');
  assert.equal(g.title, 'day-hike title');
  assert.equal(g.status, 'playable');
  assert.equal(g.kicker, 'Playable now · No install');
  assert.deepEqual(g.tags, ['TypeScript', 'Babylon.js']);
  assert.equal(g.play, 'https://games.csarko.sh/dayhike/');
  assert.ok(g.html.includes('<p>The story.</p>'));
  assert.equal(game('in-progress', ['status: in-development']).kicker, 'In development');
});

test('loadGame refuses front matter it cannot trust', () => {
  rejectsGame('x', ['status: shipped'], /status must be playable or in-development/);
  rejectsGame('x', ['play: http://games.csarko.sh/'], /play must be an https:\/\/ URL/);
  rejectsGame('x', ['repo: https://gitlab.com/csarkosh/x'], /repo must be an https:\/\/github\.com\/ URL/);
  rejectsGame('x', ['released: 2026-02-30'], /released must be a real YYYY-MM-DD date/);
  rejectsGame('x', ['published: 2026-09-16'], /unknown front matter key "published"/);
  rejectsGame('x', ['tags: a, b, c, d, e, f'], /tags must be 1 to 5 comma-separated names/);
  assert.throws(() => loadGame('index.md', gameSrc('x').text),
    (e) => e instanceof DocError && /"index" is reserved/.test(e.message));
  assert.throws(() => loadGame('x.md', gameSrc('x', [], 'A dash — here.').text),
    (e) => e instanceof DocError && /em-dash/.test(e.message));
});

test('a game card: its kicker, tags and play link, stretched over the card, and VideoGame JSON-LD', () => {
  const html = projectsPage([game('day-hike', ['play: https://games.csarko.sh/dayhike/', 'repo: https://github.com/csarkosh/game-dayhike'])], themeBlocks(INDEX));
  assert.ok(html.includes('<p class="project-kicker">Playable now · No install</p>'));
  assert.ok(html.includes('<ul class="tags" role="list"><li>TypeScript</li><li>Babylon.js</li></ul>'));
  // No alt, no preview: a plain card. Its id is the slug, so /projects#day-hike lands on it.
  assert.ok(html.includes('<li class="card" id="day-hike" data-kind="games">'));
  assert.ok(html.includes('<a class="card-link stretch" href="https://games.csarko.sh/dayhike/" target="_blank" rel="noopener" data-visits-event="play-day-hike">Play in your browser <svg'));
  // The repo gets its own smaller link beside it, above the overlay (2026-10-26).
  assert.ok(html.includes('<a class="card-source" href="https://github.com/csarkosh/game-dayhike" target="_blank" rel="noopener" data-visits-event="source-day-hike">Source on GitHub <svg'));
  assert.ok(html.includes('<div class="card-links"><a class="card-link stretch"'), 'the card link leads the row');
  const [first] = jsonLd(html).find((n) => n['@type'] === 'CollectionPage').mainEntity.itemListElement;
  assert.equal(first.item['@type'], 'VideoGame');
  assert.equal(first.item.url, 'https://games.csarko.sh/dayhike/');
  assert.equal(first.item.gamePlatform, 'Web browser');
});

test('a game with only a repo gets only the source link; with no links, none, and the page URL in JSON-LD', () => {
  const repoOnly = projectsPage([game('x', ['repo: https://github.com/csarkosh/x'])], themeBlocks(INDEX));
  assert.ok(!repoOnly.includes('class="card-link stretch'));
  assert.ok(repoOnly.includes('<div class="card-links"><a class="card-source" href="https://github.com/csarkosh/x"'));
  const html = projectsPage([game('secret')], themeBlocks(INDEX));
  assert.ok(!html.includes('class="card-link') && !html.includes('class="card-source'), 'no links row at all');
  assert.equal(jsonLd(html).find((n) => n['@type'] === 'CollectionPage').mainEntity.itemListElement[0].item.url, 'https://csarko.sh/projects');
});

test('a game with an alt gets a preview the asset build fills, as an app does', () => {
  const html = projectsPage([game('day-hike', ['alt: Postcards from the trail', 'order: 1'])], themeBlocks(INDEX));
  assert.ok(html.includes('<li class="card project-card" id="day-hike" data-kind="games">'));
  assert.ok(html.includes('<!-- generated:app-preview:day-hike -->\n'));
  assert.ok(html.includes('<img src="/projects/day-hike.jpg" alt="Postcards from the trail" loading="lazy" decoding="async" />'));
  assert.throws(() => game('x', ['order: 0']), /order must be a whole number from 1/);
});

// Reads the visible trail back out of a page as [name, href], with href undefined on the crumb
// for the page itself, which is a <span> and not a link back to where you already are.
const trail = (html) => {
  const block = /<nav class="crumbs" aria-label="Breadcrumb">([\s\S]*?)<\/nav>/.exec(html);
  assert.ok(block, 'page has a breadcrumb nav');
  return [...block[1].matchAll(/<(?:a href="([^"]*)"|span aria-current="page")>(.*?)</g)]
    .map(([, href, name]) => [name, href]);
};
const crumbNames = (html) =>
  jsonLd(html).find((n) => n['@type'] === 'BreadcrumbList').itemListElement.map((i) => i.name);

test('every generated page carries a trail its BreadcrumbList repeats exactly', () => {
  const theme = themeBlocks(INDEX);
  const cases = [
    [docPage(doc('shader-looks', '2026-09-14'), theme), [['Home', '/'], ['Research', '/research'], ['shader-looks title', undefined]]],
    [indexPage([doc('a', '2026-01-01')], theme), [['Home', '/'], ['Research', undefined]]],
    [projectsPage([game('day-hike')], theme), [['Home', '/'], ['Projects', undefined]]],
  ];
  for (const [html, expected] of cases) {
    assert.deepEqual(trail(html), expected);
    // What a reader sees and what Google may render under a result have to be the same words.
    assert.deepEqual(crumbNames(html), expected.map(([name]) => name));
    // The trail belongs between the nav and the content, not inside either.
    assert.ok(/<\/nav>\n  <nav class="crumbs"[\s\S]*<\/nav>\n\n  <(?:main|div)/.test(html));
  }
});

test('a crumb escapes its title and names the same page the nav marks current', () => {
  const theme = themeBlocks(INDEX);
  const amp = loadDoc('2026-09-14-grass.md', `---\ndescription: ${DESC}\npublished: 2026-09-14\ncategories: Rendering\n---\n# Grass & trails\n\nText.\n`);
  const html = docPage(amp, theme);
  assert.ok(html.includes('<li><span aria-current="page">Grass &amp; trails</span></li>'));
  assert.equal(crumbNames(html).at(-1), 'Grass & trails');
  // A doc page is under /research without being it, so the nav marks nothing current while the
  // trail still links there; the two index pages mark themselves in both places.
  assert.ok(!docPage(amp, theme).includes('aria-current="page">Research'));
  assert.ok(indexPage([doc('a', '2026-01-01')], theme).includes('<li><a href="/research" aria-current="page">Research</a></li>'));
});

test('buildSite writes /projects from games, apps and films together, only when one exists', () => {
  const sources = [src('a', '2026-01-01')];
  for (const extra of [{ gameSources: [gameSrc('day-hike')] }, { appSources: [appSrc('lib-visits')] }, { filmSources: [filmSrc('hallway')] }]) {
    const files = buildSite({ sources, ...extra, indexHtml: INDEX });
    assert.deepEqual([...files.keys()].filter((k) => !k.startsWith('research/')).sort(), ['projects/index.html', 'sitemap.xml']);
    assert.ok(files.get('sitemap.xml').includes('<loc>https://csarko.sh/projects</loc>'));
  }
  const all = buildSite({ sources, gameSources: [gameSrc('day-hike')], appSources: [appSrc('lib-visits')], filmSources: [filmSrc('hallway')], indexHtml: INDEX });
  assert.equal((all.get('projects/index.html').match(/<li class="card/g) ?? []).length, 3);
  // The home page is read for its theme, never written.
  assert.ok(!all.has('index.html'));
  assert.ok(!buildSite({ sources, indexHtml: INDEX }).has('projects/index.html'));
});

test('buildSite refuses two projects sharing a slug or an order across the three folders', () => {
  assert.throws(() => buildSite({ sources: [], gameSources: [gameSrc('x')], appSources: [appSrc('x')], indexHtml: INDEX }),
    /docs\/games\/x\.md and docs\/apps\/x\.md share the slug "x"/);
  assert.throws(() => buildSite({ sources: [], gameSources: [gameSrc('g', ['order: 1'])], filmSources: [filmSrc('f', ['order: 1'])], indexHtml: INDEX }),
    /docs\/films\/f\.md and docs\/games\/g\.md both have order: 1/);
});

// ---------------------------------------------------------------- films

const WATCH = 'https://www.youtube.com/shorts/jBh7F1knRAA';
const filmSrc = (slug, lines = [], body = 'The story.') => {
  const keys = lines.map((l) => l.split(':')[0]);
  const base = [['watch', WATCH], ['released', '2026-09-17'], ['runtime', '0:16'],
    ['alt', 'A woman in a dim hallway.'], ['tags', 'Analog horror, Photo puppetry'], ['model', 'Video model: Veo 3.1']]
    .filter(([k]) => !keys.includes(k)).map(([k, v]) => `${k}: ${v}`);
  return { name: `${slug}.md`, text: `---\ndescription: ${DESC}\n${[...base, ...lines].map((l) => `${l}\n`).join('')}---\n# ${slug} title\n\n${body}\n` };
};
const film = (...args) => { const s = filmSrc(...args); return loadFilm(s.name, s.text); };
const rejectsFilm = (slug, lines, pattern) =>
  assert.throws(() => film(slug, lines), (e) => e instanceof DocError && pattern.test(e.message));

test('parseFilmFileName takes the slug alone, with no date', () => {
  assert.deepEqual(parseFilmFileName('hallway.md'), { slug: 'hallway' });
  for (const name of ['Hallway.md', 'my_film.md', 'my film.md', 'hallway.markdown']) {
    assert.throws(() => parseFilmFileName(name),
      (e) => e instanceof DocError && /file name must be <slug>\.md/.test(e.message), name);
  }
  assert.throws(() => parseFilmFileName('2026-09-17-hallway.md'),
    (e) => e instanceof DocError && /carries no date; use "released:"/.test(e.message));
});

test('loadFilm reads the front matter, derives the video id, kicker and ISO duration', () => {
  const f = film('hallway');
  assert.equal(f.slug, 'hallway');
  assert.equal(f.title, 'hallway title');
  assert.equal(f.watch, WATCH);
  assert.equal(f.videoId, 'jBh7F1knRAA');
  assert.equal(f.runtime, '0:16');
  assert.equal(f.duration, 'PT16S');
  assert.equal(f.kicker, 'Short film · 0:16');
  assert.equal(f.poster, '/projects/hallway.jpg');
  assert.deepEqual(f.tags, ['Analog horror', 'Photo puppetry']);
  assert.ok(f.html.includes('<p>The story.</p>'));
  // A minute or more reads as minutes and seconds in both places.
  const long = film('long', ['runtime: 12:30']);
  assert.equal(long.duration, 'PT12M30S');
  assert.equal(long.kicker, 'Short film · 12:30');
});

test('loadFilm accepts either YouTube URL shape and keeps the one it was given', () => {
  assert.equal(film('a', ['watch: https://www.youtube.com/watch?v=jBh7F1knRAA']).videoId, 'jBh7F1knRAA');
  assert.equal(film('a', ['watch: https://youtube.com/shorts/jBh7F1knRAA']).watch, 'https://youtube.com/shorts/jBh7F1knRAA');
});

test('loadFilm refuses front matter it cannot trust', () => {
  rejectsFilm('x', ['watch: https://vimeo.com/12345'], /watch must be a youtube\.com/);
  rejectsFilm('x', ['watch: https://www.youtube.com/shorts/tooshort'], /watch must be a youtube\.com/);
  rejectsFilm('x', ['runtime: 16'], /runtime must be m:ss/);
  rejectsFilm('x', ['runtime: 1:7'], /runtime must be m:ss/);
  rejectsFilm('x', ['released: 2026-02-30'], /released must be a real YYYY-MM-DD date/);
  rejectsFilm('x', ['status: playable'], /unknown front matter key "status"/);
  rejectsFilm('x', ['tags: a, b, c, d, e, f'], /tags must be 1 to 5 comma-separated names/);
  assert.throws(() => loadFilm('index.md', filmSrc('x').text),
    (e) => e instanceof DocError && /"index" is reserved/.test(e.message));
  assert.throws(() => loadFilm('x.md', filmSrc('x', [], 'A dash — here.').text),
    (e) => e instanceof DocError && /em-dash/.test(e.message));
  // The poster is what the card is built around, so its alt text is not optional.
  assert.throws(() => loadFilm('x.md', `---\ndescription: ${DESC}\nwatch: ${WATCH}\nreleased: 2026-09-17\nruntime: 0:16\ntags: Horror\n---\n# T\n\nB.\n`),
    (e) => e instanceof DocError && /needs "alt"/.test(e.message));
});

test('a film card: the poster, the warning under the title, a YouTube link and VideoObject JSON-LD', () => {
  const html = projectsPage([film('hallway')], themeBlocks(INDEX));
  assert.ok(html.includes('<li class="card project-card" id="hallway" data-kind="film">'));
  assert.ok(html.includes('<p class="project-kicker">Short film · 0:16</p>'));
  assert.ok(html.includes('<ul class="tags" role="list"><li class="tag-model">Video model: Veo 3.1</li><li>Analog horror</li><li>Photo puppetry</li></ul>'));
  assert.ok(html.includes('<a class="card-link stretch" href="https://www.youtube.com/shorts/jBh7F1knRAA" target="_blank" rel="noopener" data-visits-event="watch-hallway">Watch on YouTube <svg'));
  // The poster is a marker build_assets.py fills, carrying a usable img and its alt until it does.
  assert.ok(html.includes('<div class="project-media film-poster">'));
  assert.ok(html.includes('<!-- generated:film-poster:hallway -->'));
  assert.ok(html.includes('alt="A woman in a dim hallway."'));
  assert.ok(html.includes('src="/projects/hallway.jpg"'));
  const [first] = jsonLd(html).find((n) => n['@type'] === 'CollectionPage').mainEntity.itemListElement;
  assert.equal(first.item['@type'], 'VideoObject');
  assert.equal(first.item.url, WATCH);
  assert.equal(first.item.embedUrl, 'https://www.youtube.com/embed/jBh7F1knRAA');
  assert.equal(first.item.thumbnailUrl, 'https://csarko.sh/projects/hallway.jpg');
  assert.equal(first.item.uploadDate, '2026-09-17');
  assert.equal(first.item.duration, 'PT16S');
});

test('every film card carries the horror notice under its title, and no other card does', () => {
  const notice = 'Contains horror imagery that some viewers may find disturbing.';
  assert.throws(() => film('hallway', ['warning: Contains horror imagery.']), /unknown front matter key "warning"/);
  const html = projectsPage([game('day-hike'), film('hallway')], themeBlocks(INDEX));
  assert.equal((html.match(/<p class="film-notice">/g) ?? []).length, 1);
  assert.ok(html.includes(`${notice}</p>`));
  // The icon is decorative, so the sentence itself has to carry the meaning.
  assert.ok(/<p class="film-notice"><svg[^>]*aria-hidden="true"/.test(html));
  // After the film's title and before its copy and its link.
  const card = html.slice(html.indexOf('id="hallway"'));
  assert.ok(card.indexOf('class="project-title"') < card.indexOf('class="film-notice"'));
  assert.ok(card.indexOf('class="film-notice"') < card.indexOf('class="project-desc'));
});

const APP_DESC = 'A library to count visits and journeys without cookies, as a small script and a static collector.';
const appSrc = (slug, lines = []) => ({
  name: `${slug}.md`,
  text: ['---', `description: ${APP_DESC}`, 'status: released', `page: https://apps.csarko.sh/${slug}`, 'platforms: Linux, macOS', 'tags: Rust, JavaScript', ...lines, '---', `# ${slug}`, '', 'What it does.', ''].join('\n'),
});
const app = (slug, lines) => { const s = appSrc(slug, lines); return loadApp(s.name, s.text); };

test('loadApp builds the kicker from status and license, and checks its fields', () => {
  assert.equal(app('lib-visits', ['license: GPL-3.0']).kicker, 'Released · Open source, GPL-3.0');
  assert.equal(app('tool').kicker, 'Released');
  const bad = (lines, pattern) => assert.throws(() => loadApp('x.md', ['---', `description: ${APP_DESC}`, ...lines, '---', '# x', ''].join('\n')),
    (e) => e instanceof DocError && pattern.test(e.message));
  bad(['status: shipped', 'page: https://apps.csarko.sh/x', 'platforms: macOS', 'tags: Rust'], /status must be released or in-development/);
  bad(['status: released', 'page: http://apps.csarko.sh/x', 'platforms: macOS', 'tags: Rust'], /page must be an https:\/\/ URL/);
  bad(['status: released', 'platforms: macOS', 'tags: Rust'], /front matter needs "page"/);
  bad(['status: released', 'page: https://apps.csarko.sh/x', 'tags: Rust'], /front matter needs "platforms"/);
  assert.throws(() => loadApp('2026-10-15-x.md', appSrc('x').text), /carries no date/);
});

test('an app card links out to its page, with SoftwareApplication JSON-LD', () => {
  const html = projectsPage([app('lib-visits', ['license: GPL-3.0'])], themeBlocks(INDEX));
  assert.ok(html.includes('<p class="project-kicker">Released · Open source, GPL-3.0</p>'));
  assert.ok(html.includes('<a class="card-link stretch" href="https://apps.csarko.sh/lib-visits" data-visits-event="app-lib-visits">Download and docs <svg'));
  const [first] = jsonLd(html).find((n) => n['@type'] === 'CollectionPage').mainEntity.itemListElement;
  assert.equal(first.item['@type'], 'SoftwareApplication');
  assert.equal(first.item.license, 'GPL-3.0');
  assert.equal(first.item.operatingSystem, 'Linux, macOS');
});

test('every shipped project card carries one quiet Buy me tokens link to its door; Day Hike none yet; the symbol once', () => {
  const projects = [game('day-hike'), app('ide-arkos', ['repo: https://github.com/csarkosh/ide-arkos']), film('the-last-trail')];
  const html = projectsPage(projects, themeBlocks(INDEX), { live: true });
  assert.equal((html.match(/<symbol id="tokens-icon"/g) || []).length, 1);
  assert.ok(html.includes('<a class="card-tokens" href="https://donate.csarko.sh/arkos" data-visits-event="tokens-ide-arkos"><svg class="tokens-icon" aria-hidden="true"><use href="#tokens-icon"/></svg>Buy me tokens</a>'));
  assert.ok(html.includes('href="https://donate.csarko.sh/last-trail" data-visits-event="tokens-the-last-trail"'));
  assert.ok(!html.includes('tokens-day-hike'));
  const card = html.slice(html.indexOf('id="ide-arkos"'), html.indexOf('</li>\n', html.indexOf('id="ide-arkos"')));
  assert.equal((card.match(/Buy me tokens/g) || []).length, 1);
  assert.ok(html.indexOf('card-source') < html.indexOf('card-tokens'), 'after Source on GitHub');
  // Until launch (DONATE_LIVE false by default) no card carries the line and the page no symbol.
  const before = projectsPage(projects, themeBlocks(INDEX));
  assert.ok(!before.includes('card-tokens') && !before.includes('<symbol id="tokens-icon"'));
});

test('standaloneShell wears none of the site\'s chrome: its own bar, its own footer, one credit', () => {
  const html = standaloneShell({ title: 'x: a thing', ogTitle: 'x', description: 'd', canonical: 'https://apps.csarko.sh/x', graph: [], theme: themeBlocks(INDEX),
    name: 'x', links: [['Download', '#setup'], ['GitHub', 'https://github.com/o/r', true]], licence: 'MIT', main: '<main id="top"></main>' });
  assert.ok(html.includes('<a class="app-name" href="https://apps.csarko.sh/x">x</a>'));
  assert.ok(html.includes('<li><a href="#setup">Download</a></li>'));
  assert.ok(html.includes('<li><a href="https://github.com/o/r" class="external" target="_blank" rel="noopener">GitHub</a></li>'));
  assert.ok(html.includes('<span>x · MIT</span>'));
  assert.ok(html.includes('Made by <a class="maker" href="https://csarko.sh/">Cyrus Sarkosh</a>'));
  assert.ok(!html.includes('<nav class="nav"') && !html.includes('<a class="wordmark"') && !html.includes('<nav class="crumbs"'), 'no site nav, wordmark or trail in the markup');
  assert.ok(!html.includes('BreadcrumbList'));
  assert.ok(!html.includes('<title>x: a thing · Cyrus Sarkosh</title>'), 'the title is the app\'s alone');
});

test('an app with an alt gets a preview the asset build fills; one without gets a plain card', () => {
  const html = projectsPage([app('app-macstats', ['alt: The menu bar']), app('tool')], themeBlocks(INDEX));
  assert.ok(html.includes('<li class="card project-card" id="app-macstats" data-kind="apps">'));
  assert.ok(html.includes('<!-- generated:app-preview:app-macstats -->\n'));
  assert.ok(html.includes('<img src="/projects/app-macstats.jpg" alt="The menu bar" loading="lazy" decoding="async" />'));
  assert.ok(!html.includes('generated:app-preview:tool'), 'no alt, no preview');
  assert.ok(html.includes('<li class="card" id="tool" data-kind="apps">'));
  assert.equal((html.match(/>Download and docs <svg/g) ?? []).length, 2, 'the default link');
  assert.ok(projectsPage([app('m', ['link: Install and docs'])], themeBlocks(INDEX)).includes('data-visits-event="app-m">Install and docs <svg'));
  assert.deepEqual(app('s', ['sections: Keyboard, Config , License']).sections, ['Keyboard', 'Config', 'License']);
  assert.throws(() => app('x', ['order: 0']), /order must be a whole number from 1/);
  assert.throws(() => app('x', ['sections: , ']), /sections names at least one heading/);
});

// ---------------------------------------------------------------- projects (2026-10-26)

test('sortProjects: the given order leads across kinds, then released newest first, then the rest', () => {
  const projects = sortProjects([
    app('a', ['released: 2026-10-15']),
    film('f', ['order: 2']),
    game('g', ['order: 1']),
    app('z', ['released: 2026-01-01']),
    game('building'),
    app('m', ['order: 3']),
  ]);
  assert.deepEqual(projects.map((p) => p.slug), ['g', 'f', 'm', 'a', 'z', 'building']);
});

test('projectsPage: one page for every kind, in the order given, marked current in the nav', () => {
  const projects = sortProjects([app('lib-visits', ['order: 2']), game('day-hike', ['order: 1']), film('hallway', ['order: 3'])]);
  const html = projectsPage(projects, themeBlocks(INDEX));
  assert.ok(html.includes('<link rel="canonical" href="https://csarko.sh/projects" />'));
  assert.ok(html.includes('<meta property="og:type" content="website" />'));
  assert.ok(html.includes('<title>Games, apps and films, built with AI · Cyrus Sarkosh</title>'));
  assert.ok(html.includes('<p class="eyebrow">Projects</p>'));
  // The two page links, Projects then Research; the one you are on reloads, so it counts nothing.
  assert.ok(html.includes('<li><a href="/projects" aria-current="page">Projects</a></li>'));
  assert.ok(html.includes('<li><a href="/research" data-visits-event="nav-research">Research</a></li>'));
  assert.ok(html.indexOf('href="/projects"') < html.indexOf('href="/research"'));
  for (const old of ['/games', '/apps', '/film']) assert.ok(!html.includes(`href="${old}"`), `no link to ${old}`);
  assert.ok(html.indexOf('id="day-hike"') < html.indexOf('id="lib-visits"') && html.indexOf('id="lib-visits"') < html.indexOf('id="hallway"'));
  const page = jsonLd(html).find((n) => n['@type'] === 'CollectionPage');
  assert.equal(page.url, 'https://csarko.sh/projects');
  assert.deepEqual(page.mainEntity.itemListElement.map((i) => [i.position, i.item['@type']]), [[1, 'VideoGame'], [2, 'SoftwareApplication'], [3, 'VideoObject']]);
  assert.equal(jsonLd(html).find((n) => n['@type'] === 'BreadcrumbList').itemListElement.at(-1).item, 'https://csarko.sh/projects');
  // A card's copy can link to research; the link is lifted above the card's stretched link.
  assert.ok(html.includes('.card .tags, .card .project-desc a { position: relative; z-index: 1; }'));
});

test('sitemap carries /projects before /research, neither with a lastmod', () => {
  const xml = sitemap([doc('a', '2026-01-01')], [game('day-hike')]);
  assert.deepEqual([...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]),
    ['https://csarko.sh/', 'https://csarko.sh/projects', 'https://csarko.sh/research', 'https://csarko.sh/research/a']);
  assert.ok(!/<loc>https:\/\/csarko\.sh\/projects<\/loc>\n\s*<lastmod>/.test(xml));
  assert.ok(!sitemap([doc('a', '2026-01-01')]).includes('/projects'));
});

// ---------------------------------------------------------------- reading (2026-10-23)

const longDoc = (slug, published, extra = '', body = 'Text.') =>
  ({ name: `${published}-${slug}.md`, text: `---\ndescription: ${DESC}\npublished: ${published}\n${extra.includes('categories:') ? '' : 'categories: Tooling\n'}${extra}---\n# ${slug} title\n\n${body}\n\n## 1. One\n\nText one.\n\n## 2. Two\n\nText two.\n\n## 3. Three\n\nText three.\n` });
const load = (s, figures) => loadDoc(s.name, s.text, figures);

test('a paragraph that is one image is a figure, from the doc\'s own files, with alt and caption', () => {
  const figures = new Map([['fog.png', { width: 1200, height: 675 }], ['chart.svg', { width: 640, height: 360 }]]);
  const d = load(longDoc('fog', '2026-10-07', '', '![Fog in the trees](fog.png "The fog sits on the ground.")\n\n![A chart](chart.svg "Frame times.")'), figures);
  assert.ok(d.html.includes('<figure class="figure">\n<!-- generated:figure:fog/fog -->\n<img src="/research/figures/fog-fog.jpg" width="1200" height="675" alt="Fog in the trees" decoding="async" />'));
  assert.ok(d.html.includes('<figcaption>The fog sits on the ground.</figcaption>'));
  // Only the first figure loads eagerly; it is often in the first screen.
  assert.ok(d.html.includes('<img src="/research/figures/fog-chart.svg" width="640" height="360" alt="A chart" loading="lazy" decoding="async" />'));
  assert.deepEqual(d.firstFigure, { name: 'fog', ext: 'png', width: 1200, height: 675 });
  const og = docPage(d, themeBlocks(INDEX));
  assert.ok(og.includes('<meta property="og:image" content="https://csarko.sh/research/figures/fog-fog.jpg" />'));
  assert.ok(og.includes('<meta property="og:image:height" content="630" />'));
  const bad = (body, re) => assert.throws(() => load(longDoc('fog', '2026-10-07', '', body), figures), (e) => e instanceof DocError && re.test(e.message));
  bad('![Fog](missing.png "Caption.")', /must be <name>\.png or <name>\.svg/);
  bad('![](fog.png "Caption.")', /needs alt text/);
  bad('![Fog](fog.png)', /needs a caption/);
  bad('Text ![Fog](fog.png "Caption.") inline.', /a figure must be a paragraph of its own/);
});

test('a term opens its definition in a popover, and the read time leaves Sources and definitions out', () => {
  const d = load(longDoc('t', '2026-10-07', '', 'A [froxel](#term "A frustum-aligned voxel.") holds fog.'));
  assert.ok(d.html.includes('<button type="button" class="term" popovertarget="term-1">froxel</button><span class="term-def" id="term-1" popover role="note">A frustum-aligned voxel.</span>'));
  assert.ok(d.readWords < d.words);
  assert.throws(() => load(longDoc('t', '2026-10-07', '', '[froxel](#term)')), /a term needs its definition/);
});

test('a link to another doc counts as doc-<slug>', () => {
  const d = load(longDoc('a', '2026-10-07', '', 'See [the fog doc](/research/ground-fog#sources).'));
  assert.ok(d.html.includes('<a href="/research/ground-fog#sources" data-visits-event="doc-ground-fog">the fog doc</a>'));
});

test('docPage shows the description under the title, contents under the opening, and Keep reading before Sources', () => {
  const d = load(longDoc('a', '2026-10-07'));
  const html = docPage(d, themeBlocks(INDEX));
  assert.ok(html.includes(`<h1>a title</h1>\n        <p class="lead">${DESC}</p>`));
  const toc = html.indexOf('<nav class="toc" aria-label="In this doc">');
  assert.ok(toc > html.indexOf('<p>Text.</p>') && toc < html.indexOf('<div class="section-head">'));
  assert.ok(html.includes('<a href="#one" data-visits-event="toc"><span class="num" aria-hidden="true">01</span><span>One</span></a>'));
  assert.ok(html.indexOf('<section class="keep-reading"') < html.indexOf('<section class="author"'));
  assert.ok(html.includes('<nav class="afterward" aria-label="Read next">'));
  assert.ok(html.includes('<link rel="alternate" type="application/atom+xml" title="Research by Cyrus Sarkosh" href="/research/feed.xml" />'));
});

test('docLinks: a series in published order, related by front matter or shared category, and games named in the text', () => {
  const docs = sortDocs([
    load(longDoc('one', '2026-01-01', 'series: Fog notes\n')),
    load(longDoc('two', '2026-02-01', 'series: Fog notes\n', 'Play Day Hike.')),
    load(longDoc('three', '2026-03-01', 'categories: Rendering\n')),
    load(longDoc('four', '2026-04-01')),
    load(longDoc('five', '2026-05-01', 'related: three, one\n')),
  ]);
  const game = { slug: 'day-hike', title: 'Day Hike', play: 'https://games.csarko.sh/dayhike/' };
  const links = docLinks(docs, [game]);
  assert.deepEqual(links.get('one').series.parts.map((d) => d.slug), ['one', 'two']);
  // A series' own docs are listed apart, so the shared-category picks skip them.
  assert.deepEqual(links.get('one').related.map((d) => d.slug), ['five', 'four']);
  assert.deepEqual(links.get('five').related.map((d) => d.slug), ['three', 'one']);
  assert.deepEqual(links.get('two').games, [game]);
  assert.deepEqual(links.get('one').games, []);
  const page = docPage(docs.find((d) => d.slug === 'one'), themeBlocks(INDEX), links.get('one'));
  assert.ok(page.includes('Part 1 of 2 in <strong>Fog notes</strong> · Next: <a href="/research/two" data-visits-event="series-two">two title</a>'));
  assert.ok(page.includes('<a class="next" href="/research/two" data-visits-event="end-two">'));
  assert.throws(() => docLinks([load(longDoc('solo', '2026-01-01', 'series: Lonely\n'))]), /has one doc/);
  assert.throws(() => docLinks([load(longDoc('x', '2026-01-01', 'related: nope\n'))]), /not a published doc/);
  assert.throws(() => parseFrontMatter(`---\ndescription: ${DESC}\npublished: 2026-01-01\ncategories: AI\nseries: lowercase\n---\n# T\n`, 'f'), /series must be/);
});

test('the feed lists every doc, newest first', () => {
  const docs = sortDocs([load(longDoc('a', '2026-01-01')), load(longDoc('b', '2026-02-01', 'updated: 2026-03-01\n'))]);
  const xml = feed(docs);
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="utf-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom">'));
  assert.ok(xml.includes('<updated>2026-03-01T00:00:00Z</updated>\n  <author>'));
  assert.ok(xml.indexOf('<id>https://csarko.sh/research/b</id>') < xml.indexOf('<id>https://csarko.sh/research/a</id>'));
});

test('a doc from DATED_SINCE says when its present was', () => {
  assert.deepEqual(undatedParagraphs('The game has no lake today.\n\nAs of Oct 24, 2026, the game has no lake.\n\nIt said "we have none now" [1].\n\n`now()` returns ms.\n\n## Sources\n\n1. Now and then.'),
    ['The game has no lake today.']);
  assert.throws(() => load(longDoc('d', DATED_SINCE, '', 'Day Hike currently draws an analytic fog.')), (e) => e instanceof DocError && /without a date; say "as of Oct 24, 2026"/.test(e.message));
  assert.doesNotThrow(() => load(longDoc('d', DATED_SINCE, '', 'As of Oct 24, 2026, Day Hike draws an analytic fog.')));
  // Docs before it build as they are.
  assert.doesNotThrow(() => load(longDoc('d', '2026-10-23', '', 'Day Hike currently draws an analytic fog.')));
});

// ---------------------------------------------------------------- 2026-10-29: model tags, kind chips

test('a film names its main AI model as the first tag, lit, and nothing else does', () => {
  const html = projectsPage([film('hallway', ['model: Image model: Qwen-Image-Edit']), game('day-hike')], themeBlocks(INDEX));
  assert.ok(html.includes('<ul class="tags" role="list"><li class="tag-model">Image model: Qwen-Image-Edit</li><li>Analog horror</li>'));
  assert.equal((html.match(/class="tag-model"/g) ?? []).length, 1);
  assert.ok(html.includes('.tags li.tag-model {'));
});

test('a film must say its model the way the tag reads', () => {
  for (const bad of ['model: Veo 3.1', 'model: Audio model: X', 'model: Video model: ', `model: Video model: ${'x'.repeat(41)}`]) {
    rejectsFilm('x', [bad], /model must read "Video model: <name>" or "Image model: <name>"|front matter needs "model"/);
  }
  assert.equal(film('x', ['model: Video model: Veo 3.1']).model, 'Video model: Veo 3.1');
});

test('/projects carries Apps, Film and Games chips with counts, All as a reset, and a CSS rule a kind', () => {
  assert.deepEqual(PROJECT_KINDS.map(([v, l]) => [v, l]), [['apps', 'Apps'], ['film', 'Film'], ['games', 'Games']]);
  const html = projectsPage([game('day-hike'), app('lib-visits'), film('a'), film('b')], themeBlocks(INDEX));
  assert.ok(html.includes('<form class="filters" aria-label="Filter by kind">'));
  assert.ok(html.includes('<button type="reset" class="chip all" data-visits-event="filter-all">All <small>4</small></button>'));
  for (const [value, label, count] of [['apps', 'Apps', 1], ['film', 'Film', 2], ['games', 'Games', 1]]) {
    assert.ok(html.includes(`<label class="chip"><input type="radio" name="kind" value="${value}" id="kind-${value}" data-visits-event="filter-${value}" />${label} <small>${count}</small></label>`), label);
    assert.ok(html.includes(`.docs-index:has(#kind-${value}:checked) .project-list > li[data-kind~="${value}"] { display: flex; }`), label);
  }
  assert.ok(html.includes('.docs-index:has(.filters input:checked) .project-list > li { display: none; }'));
  assert.ok(html.includes('id="day-hike" data-kind="games"'));
  assert.ok(html.includes('id="lib-visits" data-kind="apps"'));
  assert.ok(html.includes('id="a" data-kind="film"'));
  assert.ok(html.indexOf('<form class="filters"') < html.indexOf('<ul class="project-list"'), 'the chips sit above the cards');
});

test('a film may carry focus, a fraction from 0 to 1 that the phone crop centres on', () => {
  assert.equal(film('x').focus, undefined);
  assert.equal(film('x', ['focus: 0.42']).focus, 0.42);
  assert.equal(film('x', ['focus: 0']).focus, 0);
  assert.equal(film('x', ['focus: 1']).focus, 1);
  rejectsFilm('x', ['focus: 1.5'], /focus/);
  rejectsFilm('x', ['focus: -0.1'], /focus/);
  rejectsFilm('x', ['focus: high'], /focus/);
});

test('a film card sets --focus inline from focus, and no style without it', () => {
  const withFocus = projectsPage([film('hallway', ['focus: 0.42'])], themeBlocks(INDEX));
  assert.match(withFocus, /<div class="project-media film-poster" style="--focus: 42%">/);
  const without = projectsPage([film('hallway')], themeBlocks(INDEX));
  assert.match(without, /<div class="project-media film-poster">/);
  assert.doesNotMatch(without, /style="--focus/);
});

test('on a phone a film poster is a 16 / 9 crop around its focus point', () => {
  const html = projectsPage([film('hallway')], themeBlocks(INDEX));
  const phone = html.slice(html.indexOf('@media (max-width: 640px) {\n      .project-card'));
  assert.match(phone, /aspect-ratio: 16 \/ 9/);
  assert.match(phone, /object-position: center var\(--focus, 50%\)/);
  assert.match(phone, /object-fit: cover/);
});
