// Tests for docs_lib.mjs. Run: node --test .agents/skills/site-quality/tests/docs_lib.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSite, DocError, docPage, formatDate, gamesPage, homeSection, indexPage, loadDoc, loadGame, parseDocFileName, parseFrontMatter, parseGameFileName, readingMinutes, renderMarkdown, replaceBlock, sitemap, sortDocs, sortGames, themeBlocks } from '../scripts/docs_lib.mjs';

const FILE = 'docs/published/2026-09-14-example.md';
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

const SOURCE = `---\ndescription: ${DESC}\npublished: 2026-09-14\n---\n# Title\n\n## 1. One\n\nText.\n`;

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
  ({ name: `${published}-${slug}.md`, text: `---\ndescription: ${DESC}\npublished: ${published}\n${extra}---\n# ${slug} title\n\n## 1. One\n\nText.\n` });
const doc = (...args) => { const s = src(...args); return loadDoc(s.name, s.text); };
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
  assert.ok(html.includes('<a href="#one"><span class="num" aria-hidden="true">01</span><span>One</span></a>'));
  assert.ok(html.includes('<section class="author" aria-label="About the author">'));
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
  // Every entry is a card whose whole surface is the link (see .stretch in DOCS_CSS).
  assert.equal([...html.matchAll(/<li class="card">/g)].length, 2);
  const page = jsonLd(html).find((n) => n['@type'] === 'CollectionPage');
  assert.deepEqual(page.mainEntity.itemListElement.map((i) => i.url), ['https://csarko.sh/research/b', 'https://csarko.sh/research/a']);
});

test('homeSection lists the three newest docs and is empty with none', () => {
  const html = homeSection(sortDocs([doc('a', '2026-01-01'), doc('b', '2026-03-01'), doc('c', '2026-02-01'), doc('d', '2026-03-01')]));
  assert.deepEqual([...html.matchAll(/href="\/research\/([a-z]+)"/g)].map((m) => m[1]), ['b', 'd', 'c']);
  assert.ok(html.includes('<section id="notes" aria-labelledby="notes-title">'));
  assert.ok(html.includes('<p class="section-label">03 / Notes</p>'));
  assert.ok(html.includes('<h2 id="notes-title">Notes from what I\'m researching</h2>'));
  assert.ok(html.includes('<h3 class="doc-title"><a class="stretch" href="/research/b">b title</a></h3>'));
  assert.ok(html.includes('<a class="all-docs" href="/research">All notes'));
  assert.equal(homeSection([]), '\n    ');
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
  assert.deepEqual([...one.keys()].sort(), ['index.html', 'research/a.html', 'research/b.html', 'research/index.html', 'sitemap.xml']);
  assert.deepEqual(Object.fromEntries(one), Object.fromEntries(two));
  assert.ok(one.get('index.html').includes('<section id="notes"'));
  const empty = buildSite({ sources: [], indexHtml: INDEX });
  assert.deepEqual([...empty.keys()].sort(), ['index.html', 'sitemap.xml']);
  assert.equal(empty.get('index.html'), INDEX);
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

test('sortGames leads with what is still being built, then released newest first', () => {
  const games = [
    game('old', ['released: 2024-01-01']),
    game('building'),
    game('new', ['released: 2026-01-01']),
    game('also-building'),
  ];
  assert.deepEqual(sortGames(games).map((g) => g.slug), ['also-building', 'building', 'new', 'old']);
});

test('gamesPage lists every game with VideoGame JSON-LD and marks itself current', () => {
  const html = gamesPage(sortGames([game('day-hike', ['play: https://games.csarko.sh/dayhike/', 'repo: https://github.com/csarkosh/game-dayhike'])]), themeBlocks(INDEX));
  assert.ok(html.includes('<link rel="canonical" href="https://csarko.sh/games" />'));
  assert.ok(html.includes('<meta property="og:type" content="website" />'));
  assert.ok(html.includes('<li><a href="/games" aria-current="page">Games</a></li>'));
  assert.ok(html.includes('<li><a href="/research">Research</a></li>'));
  assert.ok(html.includes('<p class="game-kicker">Playable now · No install</p>'));
  assert.ok(html.includes('<ul class="tags" role="list"><li>TypeScript</li><li>Babylon.js</li></ul>'));
  // The play link is the card's own, stretched over it, styled as the home page's card link; the
  // repo is not linked from the card.
  assert.ok(html.includes('<li class="card">'));
  assert.ok(html.includes('<a class="card-link stretch" href="https://games.csarko.sh/dayhike/" target="_blank" rel="noopener">Play in your browser <svg'));
  assert.ok(!html.includes('github.com/csarkosh/game-dayhike'));
  const page = jsonLd(html).find((n) => n['@type'] === 'CollectionPage');
  assert.equal(page.url, 'https://csarko.sh/games');
  const [first] = page.mainEntity.itemListElement;
  assert.equal(first.item['@type'], 'VideoGame');
  assert.equal(first.item.url, 'https://games.csarko.sh/dayhike/');
  assert.equal(first.item.gamePlatform, 'Web browser');
  const crumbs = jsonLd(html).find((n) => n['@type'] === 'BreadcrumbList');
  assert.equal(crumbs.itemListElement.at(-1).item, 'https://csarko.sh/games');
});

test('a game with only a repo gets no link on its card', () => {
  const html = gamesPage([game('x', ['repo: https://github.com/csarkosh/x'])], themeBlocks(INDEX));
  assert.ok(!html.includes('View on GitHub'));
  assert.ok(!html.includes('class="card-link'));
});

test('a game with no links renders no card link and falls back to the page URL in JSON-LD', () => {
  const html = gamesPage([game('secret')], themeBlocks(INDEX));
  assert.ok(!html.includes('class="card-link'));
  const page = jsonLd(html).find((n) => n['@type'] === 'CollectionPage');
  assert.equal(page.mainEntity.itemListElement[0].item.url, 'https://csarko.sh/games');
});

test('sitemap carries /games before /research, both without a lastmod', () => {
  const xml = sitemap([doc('a', '2026-01-01')], [game('day-hike')]);
  assert.deepEqual([...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]),
    ['https://csarko.sh/', 'https://csarko.sh/games', 'https://csarko.sh/research', 'https://csarko.sh/research/a']);
  assert.ok(!/<loc>https:\/\/csarko\.sh\/games<\/loc>\n\s*<lastmod>/.test(xml));
  assert.ok(!sitemap([doc('a', '2026-01-01')]).includes('/games'));
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
    [gamesPage([game('day-hike')], theme), [['Home', '/'], ['Games', undefined]]],
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
  const amp = loadDoc('2026-09-14-grass.md', `---\ndescription: ${DESC}\npublished: 2026-09-14\n---\n# Grass & trails\n\nText.\n`);
  const html = docPage(amp, theme);
  assert.ok(html.includes('<li><span aria-current="page">Grass &amp; trails</span></li>'));
  assert.equal(crumbNames(html).at(-1), 'Grass & trails');
  // A doc page is under /research without being it, so the nav marks nothing current while the
  // trail still links there; the two index pages mark themselves in both places.
  assert.ok(!docPage(amp, theme).includes('aria-current="page">Research'));
  assert.ok(indexPage([doc('a', '2026-01-01')], theme).includes('<li><a href="/research" aria-current="page">Research</a></li>'));
});

test('buildSite writes the games index only when a game exists', () => {
  const sources = [src('a', '2026-01-01')];
  const withGames = buildSite({ sources, gameSources: [gameSrc('day-hike')], indexHtml: INDEX });
  assert.ok(withGames.has('games/index.html'));
  assert.ok(withGames.get('sitemap.xml').includes('https://csarko.sh/games'));
  assert.ok(!buildSite({ sources, indexHtml: INDEX }).has('games/index.html'));
});
