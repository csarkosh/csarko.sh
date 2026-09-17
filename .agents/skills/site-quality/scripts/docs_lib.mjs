// docs_lib.mjs — the pure half of the docs build: docs/published/*.md in, page text out.
// build_docs.mjs does the file I/O. Nothing here reads the clock or the disk, so the same
// sources always produce the same bytes. Tests: ../tests/docs_lib.test.mjs (node --test).
import { Marked } from './vendor/marked.esm.mjs';

export const SITE = 'https://csarko.sh';
// Where the docs are served: /research/<slug> and the /research index, built into public/research/.
// Their sources stay in docs/published/. They were served at /docs until 2026-09-17, and
// firebase.json's redirects 301 those old URLs here.
export const DOCS_DIR = 'research';

export class DocError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DocError';
  }
}

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => ENTITIES[c]);

// ---------------------------------------------------------------- front matter

// key -> required?
const FIELDS = { description: true, published: true, updated: false, source: false };
const GAME_FIELDS = { description: true, status: true, tags: true, play: false, repo: false, released: false };
// A film is a video hosted on YouTube: the page carries its poster and links out, so every field
// here is needed to build the card and its VideoObject. "alt" describes the poster.
const FILM_FIELDS = { description: true, watch: true, released: true, runtime: true, alt: true, tags: true, warning: false };

// Either shape YouTube serves a video at; the 11-character id is what the embed and poster need.
const WATCH_URL = /^https:\/\/(?:www\.)?youtube\.com\/(?:shorts\/|watch\?v=)([A-Za-z0-9_-]{11})$/;
const RUNTIME = /^(\d{1,2}):([0-5]\d)$/;

// A game's status is also the kicker line above its title, so the two can never disagree.
const STATUSES = { playable: 'Playable now · No install', 'in-development': 'In development' };

const isDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

// Every source file carries the same shape of block, so this reads it and the two functions
// below say what the values have to mean. `fields` decides which keys are allowed and required.
function parseBlock(text, file, fields) {
  const normalized = text.replace(/\r\n/g, '\n');
  const block = /^---\n([\s\S]*?)\n---\n/.exec(normalized);
  if (!block) throw new DocError(`${file}: must start with a --- front matter block`);
  const meta = {};
  for (const line of block[1].split('\n')) {
    if (!line.trim()) continue;
    const kv = /^([a-z]+):\s*(.*)$/.exec(line);
    if (!kv) throw new DocError(`${file}: front matter line is not "key: value": ${line}`);
    const [, key, value] = kv;
    if (!(key in fields)) throw new DocError(`${file}: unknown front matter key "${key}"`);
    if (key in meta) throw new DocError(`${file}: duplicate front matter key "${key}"`);
    meta[key] = value.trim();
  }
  for (const [key, required] of Object.entries(fields)) {
    if (required && !meta[key]) throw new DocError(`${file}: front matter needs "${key}"`);
  }
  const length = [...meta.description].length;
  if (length < 70 || length > 160) throw new DocError(`${file}: description is ${length} characters (70–160)`);
  return { meta, body: normalized.slice(block[0].length) };
}

export function parseFrontMatter(text, file) {
  const { meta, body } = parseBlock(text, file, FIELDS);
  if (!isDate(meta.published)) throw new DocError(`${file}: published must be a real YYYY-MM-DD date`);
  if (meta.updated !== undefined) {
    if (!isDate(meta.updated)) throw new DocError(`${file}: updated must be a real YYYY-MM-DD date`);
    if (meta.updated < meta.published) throw new DocError(`${file}: updated is before published`);
  }
  if (meta.source !== undefined && !/^https:\/\/github\.com\/\S+$/.test(meta.source)) {
    throw new DocError(`${file}: source must be an https://github.com/ URL`);
  }
  return { meta, body };
}

export function parseGameFrontMatter(text, file) {
  const { meta, body } = parseBlock(text, file, GAME_FIELDS);
  if (!(meta.status in STATUSES)) {
    throw new DocError(`${file}: status must be ${Object.keys(STATUSES).join(' or ')}`);
  }
  if (meta.play !== undefined && !/^https:\/\/\S+$/.test(meta.play)) {
    throw new DocError(`${file}: play must be an https:// URL`);
  }
  if (meta.repo !== undefined && !/^https:\/\/github\.com\/\S+$/.test(meta.repo)) {
    throw new DocError(`${file}: repo must be an https://github.com/ URL`);
  }
  if (meta.released !== undefined && !isDate(meta.released)) {
    throw new DocError(`${file}: released must be a real YYYY-MM-DD date`);
  }
  const tags = meta.tags.split(',').map((tag) => tag.trim()).filter(Boolean);
  if (!tags.length || tags.length > 5) throw new DocError(`${file}: tags must be 1 to 5 comma-separated names`);
  return { meta: { ...meta, tags }, body };
}

export function parseFilmFrontMatter(text, file) {
  const { meta, body } = parseBlock(text, file, FILM_FIELDS);
  const watch = WATCH_URL.exec(meta.watch);
  if (!watch) {
    throw new DocError(`${file}: watch must be a youtube.com/shorts/<id> or youtube.com/watch?v=<id> URL`);
  }
  const runtime = RUNTIME.exec(meta.runtime);
  if (!runtime) throw new DocError(`${file}: runtime must be m:ss, the seconds zero-padded`);
  if (!isDate(meta.released)) throw new DocError(`${file}: released must be a real YYYY-MM-DD date`);
  const tags = meta.tags.split(',').map((tag) => tag.trim()).filter(Boolean);
  if (!tags.length || tags.length > 5) throw new DocError(`${file}: tags must be 1 to 5 comma-separated names`);
  const [, minutes, seconds] = runtime;
  return {
    meta: {
      ...meta,
      tags,
      videoId: watch[1],
      // ISO 8601, which is the only duration schema.org reads.
      duration: `PT${Number(minutes) ? `${Number(minutes)}M` : ''}${Number(seconds)}S`,
    },
    body,
  };
}

// ---------------------------------------------------------------- small helpers

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const formatDate = (iso) => {
  const [year, month, day] = iso.split('-').map(Number);
  return `${MONTHS[month - 1]} ${day}, ${year}`;
};

export const readingMinutes = (words) => Math.max(1, Math.round(words / 230));

// ---------------------------------------------------------------- markdown

const stripTags = (html) => html.replace(/<[^>]+>/g, '');
const DECODE = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" };
// Named entities: only the 5 marked ever emits itself. Numeric entities (&#169; / &#x2764;) can
// appear whenever an author types one, so those are decoded generally; other named entities
// (&hearts; etc.) are left as-is rather than growing a table of HTML5's ~2,000 names.
const decodeEntities = (text) => text.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+\d*);/gi, (whole, name) => {
  if (name in DECODE) return DECODE[name];
  if (/^#\d+$/.test(name)) return String.fromCodePoint(Number(name.slice(1)));
  if (/^#x[0-9a-f]+$/i.test(name)) return String.fromCodePoint(Number.parseInt(name.slice(2), 16));
  return whole;
});
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
  const usedIds = new Set(['top']); // "top" is the skip link's target; never reused
  let lastDepth = 1;
  let insideHeading = false; // set while rendering a heading's inline content, so the link
  // renderer below can reject a link nested in any heading (H1 through H6) instead of letting
  // it through and producing a nested <a> on the doc page or in a title link elsewhere.
  const parseHeadingInline = (fn) => {
    insideHeading = true;
    try {
      return fn();
    } finally {
      insideHeading = false;
    }
  };

  marked.use({
    renderer: {
      heading({ tokens: inline, depth }) {
        if (depth > lastDepth + 1) problems.push(`${file}: heading level skips from h${lastDepth} to h${depth}`);
        lastDepth = depth;
        let html = parseHeadingInline(() => this.parser.parseInline(inline));
        let number = '';
        if (depth === 2) {
          const numbered = /^(\d+)\.\s+/.exec(html);
          if (numbered) {
            number = numbered[1].padStart(2, '0');
            html = html.slice(numbered[0].length);
          }
        }
        const base = plainText(html).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section';
        let id = base;
        for (let n = 1; usedIds.has(id); n += 1) id = `${base}-${n}`;
        usedIds.add(id);
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
        if (insideHeading) {
          problems.push(`${file}: headings can't contain links (${href})`);
          return text;
        }
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

  const titleHtml = parseHeadingInline(() => marked.parseInline(h1s[0].text));
  const html = marked.parser(tokens)
    .replaceAll('<table>', '<div class="scroll" tabindex="0" role="region" aria-label="Table"><table>').replaceAll('</table>', '</table></div>')
    .replaceAll('<pre>', '<div class="scroll" tabindex="0" role="region" aria-label="Code"><pre>').replaceAll('</pre>', '</pre></div>');
  if (problems.length) throw new DocError(problems.join('\n'));
  // Tags become spaces here (not in plainText) so "<p>01</p><h2>Title" counts as two words.
  const words = decodeEntities(html.replace(/<[^>]+>/g, ' ')).split(/\s+/).filter(Boolean).length;
  return { title: plainText(titleHtml), titleHtml, html, rail, words };
}

// ---------------------------------------------------------------- one doc

// Published sources are named <YYYY-MM-DD>-<slug>.md, so the directory reads in date order.
// The date is redundant with the front matter's "published:" (loadDoc checks they agree) and the
// slug, not the file name, is the URL: /research/<slug>.
const DOC_FILE_NAME = /^(\d{4}-\d{2}-\d{2})-([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;

export function parseDocFileName(name) {
  const m = DOC_FILE_NAME.exec(name);
  if (!m || !isDate(m[1])) {
    throw new DocError(`docs/published/${name}: file name must be <YYYY-MM-DD>-<slug>.md, the slug lowercase letters, digits and hyphens`);
  }
  return { date: m[1], slug: m[2] };
}

// A game is not an entry in a dated log the way a research note is, and "released" is a property
// that can change, so a game's file name is the slug alone.
const GAME_FILE_NAME = /^([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;

export function parseGameFileName(name) {
  const m = GAME_FILE_NAME.exec(name);
  if (!m) {
    throw new DocError(`docs/games/${name}: file name must be <slug>.md, the slug lowercase letters, digits and hyphens`);
  }
  // A date reads as part of the slug here, since digits are legal in one. Say so, rather than
  // quietly build a game called "2026-09-16-day-hike" for someone who copied the docs convention.
  if (/^\d{4}-\d{2}-\d{2}-/.test(m[1])) {
    throw new DocError(`docs/games/${name}: a game file name carries no date; use "released:" in the front matter`);
  }
  return { slug: m[1] };
}

export function loadGame(name, text) {
  const file = `docs/games/${name}`;
  const { slug } = parseGameFileName(name);
  if (slug === 'index') throw new DocError(`${file}: "index" is reserved for the games index page`);
  if (text.includes('—')) throw new DocError(`${file}: contains an em-dash; use a comma, colon or semicolon`);
  const { meta, body } = parseGameFrontMatter(text, file);
  return { slug, ...meta, kicker: STATUSES[meta.status], ...renderMarkdown(body, file) };
}

export function parseFilmFileName(name) {
  const m = GAME_FILE_NAME.exec(name);
  if (!m) {
    throw new DocError(`docs/films/${name}: file name must be <slug>.md, the slug lowercase letters, digits and hyphens`);
  }
  if (/^\d{4}-\d{2}-\d{2}-/.test(m[1])) {
    throw new DocError(`docs/films/${name}: a film file name carries no date; use "released:" in the front matter`);
  }
  return { slug: m[1] };
}

export function loadFilm(name, text) {
  const file = `docs/films/${name}`;
  const { slug } = parseFilmFileName(name);
  if (slug === 'index') throw new DocError(`${file}: "index" is reserved for the film index page`);
  if (text.includes('—')) throw new DocError(`${file}: contains an em-dash; use a comma, colon or semicolon`);
  const { meta, body } = parseFilmFrontMatter(text, file);
  return {
    slug,
    // The stable poster URL, written by build_assets.py from the source in the site-quality skill's
    // assets/films/. The hashed variants live in /assets; this one is what JSON-LD and sharing cite.
    poster: `/${FILM_DIR}/${slug}.jpg`,
    kicker: `${FILM_KICKER} · ${meta.runtime}`,
    ...meta,
    ...renderMarkdown(body, file),
  };
}

export function loadDoc(name, text) {
  const file = `docs/published/${name}`;
  const { date, slug } = parseDocFileName(name);
  if (slug === 'index') throw new DocError(`${file}: "index" is reserved for the docs index page`);
  if (text.includes('—')) throw new DocError(`${file}: contains an em-dash; use a comma, colon or semicolon`);
  const { meta, body } = parseFrontMatter(text, file);
  if (meta.published !== date) {
    throw new DocError(`${file}: file name says ${date} but front matter says published: ${meta.published}`);
  }
  return {
    slug,
    url: `${SITE}/${DOCS_DIR}/${slug}`,
    path: `/${DOCS_DIR}/${slug}`,
    ...meta,
    modified: meta.updated ?? meta.published,
    ...renderMarkdown(body, file),
  };
}

// ---------------------------------------------------------------- pages

const PERSON = `${SITE}/#person`;
const WEBSITE = `${SITE}/#website`;
// Google reads structured data per page and won't follow @id to the home page's full Person, so
// each doc embeds this minimal node (still carrying @id, so it links back to that fuller record).
const PERSON_NODE = { '@type': 'Person', '@id': PERSON, name: 'Cyrus Sarkosh', url: `${SITE}/` };
const OG_IMAGE = `${SITE}/og-image.jpg`;
const OG_IMAGE_ALT = 'Cyrus Sarkosh, Senior Software Engineer in New York, with his portrait';
const LINKEDIN = 'https://www.linkedin.com/in/csarkosh';
const INDEX_TITLE = 'Research & notes';
// The home page's section and heading link for the docs, which live at /research.
const NOTES = 'Notes';
const INDEX_DESCRIPTION = 'Research notes and specs by Cyrus Sarkosh on game development, generative AI for media, and the software behind them.';
const INDEX_LEAD = 'Research notes and specs from what I build and explore: game development, generative AI for media, and the software behind them.';
const HOME_LIMIT = 3;
// What the nav and the breadcrumb call /research. The page's own heading is INDEX_TITLE: a trail is
// read sideways, in one line, so it wants the shorter word.
const DOCS_NAV = 'Research';
// GAMES_TITLE names the page in the nav, the breadcrumb and the share card; GAMES_HEADING is the
// <title> and the h1, which want the words a searcher would type.
const GAMES_TITLE = 'Games';
// The films live at /film, built from docs/films/. FILM_TITLE names the page in the nav, the
// breadcrumb and the home page's section; FILM_HEADING is the h1. The <title> is its own line,
// since "Short films" alone is too short to read as a search result.
export const FILM_DIR = 'film';
const FILM_TITLE = 'Film';
const FILM_HEADING = 'Short films';
const FILM_PAGE_TITLE = 'Short films: experiments in stable AI generation';
const FILM_DESCRIPTION = 'Short films by Cyrus Sarkosh, experiments in getting AI video generation to hold the same actor and the same room from shot to shot.';
const FILM_LEAD = 'An experiment in how far AI generation can be pushed toward a film that stays stable: the same actor, the same room, shot after shot. Each result is on YouTube.';
const FILM_HOME_HEADING = 'Short films I make on the side';
// A film's kicker, with its runtime after it, so the card says what it is before you read the title.
const FILM_KICKER = 'Short film';
const GAMES_HEADING = 'Games, playable in your browser';
const GAMES_DESCRIPTION = 'Games by Cyrus Sarkosh that run in a browser with no install: what is playable now, and what is being built.';
const GAMES_LEAD = 'What I have built and what I am building now. Each one runs in a browser, with no install and no account.';

export const sortDocs = (docs) =>
  [...docs].sort((a, b) => (a.published === b.published ? (a.slug < b.slug ? -1 : 1) : a.published < b.published ? 1 : -1));

// What is still being built leads, since that is the current work; released games follow, newest
// first. Ties break on slug so the order never depends on the order the directory was read in.
export const sortGames = (games) =>
  [...games].sort((a, b) => {
    if (!a.released !== !b.released) return a.released ? 1 : -1;
    if (a.released !== b.released) return a.released < b.released ? 1 : -1;
    return a.slug < b.slug ? -1 : 1;
  });

// Newest release first: a film is finished when it ships, so there is no "in development" to lead
// with as there is for games. Ties break on slug, so the order never depends on the directory read.
export const sortFilms = (films) =>
  [...films].sort((a, b) => (a.released === b.released ? (a.slug < b.slug ? -1 : 1) : a.released < b.released ? 1 : -1));

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

// A page's trail is one array of [name, absolute URL], newest crumb last, and it feeds both the
// visible breadcrumb and this BreadcrumbList. Google may render the trail under a search result,
// so the two must never say different things; check.py compares them on every built page.
const HOME_CRUMB = ['Home', `${SITE}/`];

const breadcrumbs = (items) => ({
  '@type': 'BreadcrumbList',
  itemListElement: items.map(([name, item], i) => ({ '@type': 'ListItem', position: i + 1, name, item })),
});

// The trail, under the nav on every page but the home page. The last crumb is the page you are
// already on, so it is a <span> rather than a link back to itself. The separators are CSS, so they
// reach neither the accessibility tree nor a copied line of text.
function crumbs(trail) {
  const items = trail.map(([name, url], i) => {
    const text = escapeHtml(name);
    const inner = i === trail.length - 1
      ? `<span aria-current="page">${text}</span>`
      : `<a href="${url.slice(SITE.length) || '/'}">${text}</a>`;
    return `        <li>${inner}</li>`;
  });
  return `  <nav class="crumbs" aria-label="Breadcrumb">
    <div class="wrap">
      <ol>
${items.join('\n')}
      </ol>
    </div>
  </nav>`;
}

// A content warning's mark. Decorative: the warning's own sentence says what it means.
const WARNING_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><path d="M12 9v4M12 17h.01"/></svg>';
const EXTERNAL_ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>';
const ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

const DOCS_CSS = `
    *, *::before, *::after { box-sizing: border-box; }
    html { scroll-behavior: smooth; scroll-padding-top: 84px; -webkit-text-size-adjust: 100%; }
    body { margin: 0; background: var(--bg); color: var(--text); font-family: var(--sans); font-size: 16px; line-height: 1.7; -webkit-font-smoothing: antialiased; }
    body::before { content: ""; position: fixed; inset: -20vh -10vw auto; height: 70vh; background: radial-gradient(ellipse at 30% 0%, var(--accent-glow), transparent 60%); pointer-events: none; z-index: -1; }
    a { color: inherit; text-decoration: none; }
    a:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; border-radius: 6px; }
    ::selection { background: var(--accent); color: var(--on-accent); }

    /* One width for the nav, content and footer on every page of the site (see public/index.html). */
    .wrap { max-width: 1120px; margin: 0 auto; padding-inline: 24px; }

    .nav { position: sticky; top: 0; z-index: 10; backdrop-filter: saturate(140%) blur(12px); -webkit-backdrop-filter: saturate(140%) blur(12px); background: var(--nav-bg); border-bottom: 1px solid var(--border); }
    .nav .wrap { display: flex; align-items: center; justify-content: space-between; height: 60px; }
    .skip-link { position: absolute; left: 16px; top: -60px; z-index: 100; padding: 8px 14px; border-radius: 8px; background: var(--accent); color: var(--on-accent); font-size: 14px; font-weight: 600; }
    .skip-link:focus { top: 12px; }
    main:focus { outline: none; }
    .wordmark { font-family: var(--mono); font-weight: 500; font-size: 15px; letter-spacing: -0.01em; }
    .wordmark span { color: var(--accent); }
    .nav ul { display: flex; align-items: center; gap: 20px; list-style: none; margin: 0; padding: 0; }
    .nav ul a { color: var(--muted); font-size: 14px; transition: color .15s ease; }
    .nav ul a:hover { color: var(--text); }
    /* Same bar as the home page: heading links (dimmer, in front), a divider, then page links.
       Docs pages carry only page links, so these two rules are here to keep the copies in step. */
    .nav .heading-link a { color: var(--faint); }
    .nav .nav-divider { width: 1px; height: 16px; background: var(--border-strong); }

    /* The trail sits under the nav and scrolls away with the page: only the nav is sticky, so
       scroll-padding-top above stays the nav's own height. Its .wrap is the site's, so the first
       crumb starts at the same left edge as the wordmark at every width. */
    .crumbs { border-bottom: 1px solid var(--border); }
    .crumbs ol { display: flex; align-items: center; list-style: none; margin: 0; padding: 11px 0; font-family: var(--mono); font-size: 12.5px; line-height: 1.5; }
    .crumbs li { display: flex; align-items: center; min-width: 0; flex: none; }
    .crumbs li + li::before { content: "›"; color: var(--faint); margin: 0 8px; flex: none; }
    .crumbs a { color: var(--muted); transition: color .15s ease; }
    .crumbs a:hover { color: var(--text); }
    /* The page you are on is the one crumb long enough to overflow a phone, so it is the one that
       shrinks and truncates; the full title stays in the DOM for assistive tech and for search. */
    .crumbs li:last-child { flex: 0 1 auto; }
    .crumbs [aria-current] { min-width: 0; color: var(--faint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

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
    /* The reading measure, not the shell, bounds the text: the rail and the article then start at
       the same left edge as the nav's wordmark, at every width. */
    .doc-page main { max-width: 72ch; }
    @media (min-width: 1060px) {
      .shell { grid-template-columns: 230px minmax(0, 1fr); }
      .shell.no-rail { grid-template-columns: minmax(0, 1fr); }
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
    .scroll:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
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

    /* The same card as the home page's Projects section (see public/index.html); keep them in
       step. A .stretch link covers its whole card, so the card is the click target; anything
       else that has to stay clickable is lifted above that overlay. */
    .card {
      position: relative; display: flex; flex-direction: column;
      background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
      padding: 22px; transition: border-color .18s ease, transform .18s ease, background .18s ease;
    }
    .card:hover, .card:focus-within { border-color: var(--accent-border); transform: translateY(-2px); background: var(--surface-hover); }
    /* ::before, not ::after: an external link already uses ::after for its ↗ mark. */
    .card .stretch::before { content: ""; position: absolute; inset: 0; border-radius: var(--radius); }
    .card .tags, .card .game-desc a, .card .film-desc a { position: relative; z-index: 1; }

    .doc-list, .game-list, .film-list { display: grid; gap: 14px; list-style: none; margin: 0; padding: 0; }
    .doc-list .doc-title { margin: 0 0 4px; font-size: 1.2rem; line-height: 1.35; letter-spacing: -0.015em; font-weight: 600; }
    .doc-list .doc-title a { transition: color .15s ease; }
    .doc-list li:hover .doc-title a, .doc-list .doc-title a:focus-visible { color: var(--accent); }
    .doc-meta { margin: 0 0 6px; font-family: var(--mono); font-size: 12px; color: var(--faint); }
    .doc-desc { margin: 0; color: var(--muted); max-width: 78ch; }
    /* A film card is the same card turned on its side: the poster leads, the text sits beside it.
       Keep it in step with the copy in public/index.html, which carries the newest film. */
    .film-card { flex-direction: row; align-items: flex-start; gap: 22px; }
    .film-poster { flex: none; width: 240px; max-width: 100%; border-radius: 12px; overflow: hidden; border: 1px solid var(--border); background: var(--surface-2); line-height: 0; }
    .film-poster img { width: 100%; height: auto; display: block; }
    .film-body { display: flex; flex-direction: column; min-width: 0; }
    .film-kicker { margin: 0 0 10px; font-family: var(--mono); font-size: 11.5px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--accent); }
    .film-title { margin: 0 0 10px; font-size: 1.4rem; line-height: 1.3; letter-spacing: -0.02em; font-weight: 600; }
    .film-desc { max-width: 78ch; }
    .film-desc p { margin: 0 0 12px; }
    .film-desc p:last-child { margin-bottom: 0; }
    .film-list .tags { margin-top: 16px; }
    /* A film's content warning, under its tags. --muted, not --faint: a warning has to be read. */
    .film-warning { display: flex; align-items: flex-start; gap: 8px; margin: 14px 0 0; font-size: 13.5px; line-height: 1.5; color: var(--muted); }
    .film-warning svg { width: 15px; height: 15px; flex: none; margin-top: 2px; color: var(--accent); }
    @media (max-width: 640px) {
      .film-card { flex-direction: column; }
      .film-poster { width: 200px; align-self: flex-start; }
    }

    .game-kicker { margin: 0 0 10px; font-family: var(--mono); font-size: 11.5px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--accent); }
    .game-title { margin: 0 0 10px; font-size: 1.4rem; line-height: 1.3; letter-spacing: -0.02em; font-weight: 600; }
    .game-desc { max-width: 78ch; }
    .game-desc p { margin: 0 0 12px; }
    .game-desc p:last-child { margin-bottom: 0; }
    .game-list .tags { margin-top: 16px; }
    /* The home page's .card-link ("Play in your browser"), here as the card's own link. */
    .card-link { align-self: flex-start; margin-top: 18px; font-size: 14px; font-weight: 500; color: var(--accent); display: inline-flex; align-items: center; gap: 6px; }
    .card-link svg { width: 14px; height: 14px; transition: transform .18s ease; }
    .card:hover .card-link svg { transform: translate(2px, -2px); }

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
      .nav ul a, .crumbs a, .rail a, .prose a, .author a, .tags a, .doc-list .doc-title a, .card, .card-link svg { transition: none; }
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
    /* Generated by build_docs.mjs from docs/published/. Fonts are filled in by build_assets.py. */
    /* generated:fonts */
    /* /generated:fonts */

    ${theme}
${DOCS_CSS}
  </style>
</head>`;
}

// The page links, in the order the whole site uses them (see public/index.html, which carries the
// same three after its heading links). `current` marks the page you are already on. There is no
// Home link: the wordmark to their left is it, on every page.
const PAGE_LINKS = [[`/${FILM_DIR}`, FILM_TITLE], ['/games', GAMES_TITLE], [`/${DOCS_DIR}`, DOCS_NAV]];

const nav = (current) => `  <a class="skip-link" href="#top">Skip to content</a>
  <nav class="nav" aria-label="Primary">
    <div class="wrap">
      <a class="wordmark" href="/">csarko<span>.sh</span></a>
      <ul>
${PAGE_LINKS.map(([href, label]) =>
    `        <li><a href="${href}"${href === current ? ' aria-current="page"' : ''}>${label}</a></li>`).join('\n')}
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

// The whole card is the click target, through the title link's ::after overlay rather than an
// <a> around everything: that keeps the link's accessible name the title alone, and leaves room
// for a second link inside a card (see gameList).
function docList(docs, level, pad) {
  const items = docs.map((d) => `${pad}  <li class="card">
${pad}    <h${level} class="doc-title"><a class="stretch" href="${d.path}">${d.titleHtml}</a></h${level}>
${pad}    <p class="doc-meta">${formatDate(d.published)} · ${readingMinutes(d.words)} min read</p>
${pad}    <p class="doc-desc">${escapeHtml(d.description)}</p>
${pad}  </li>`);
  return `${pad}<ul class="doc-list" role="list">\n${items.join('\n')}\n${pad}</ul>`;
}

export function docPage(doc, theme) {
  const trail = [HOME_CRUMB, [DOCS_NAV, `${SITE}/${DOCS_DIR}`], [doc.title, doc.url]];
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
      author: PERSON_NODE,
      publisher: PERSON_NODE,
      isPartOf: { '@id': WEBSITE },
      ...(doc.source ? { sameAs: [doc.source] } : {}),
    },
    breadcrumbs(trail),
  ];
  const extraMeta = `  <meta property="article:published_time" content="${doc.published}" />
  <meta property="article:modified_time" content="${doc.modified}" />
  <meta property="article:author" content="${SITE}/" />
`;
  // The trail above already says Research, so the eyebrow carries only the dates.
  const eyebrow = `${formatDate(doc.published)}${doc.updated ? ` · Updated ${formatDate(doc.updated)}` : ''}`;
  const rail = doc.rail.length
    ? `    <aside class="rail" aria-label="Contents">
      <p class="section-label">Contents</p>
      <ol>
${doc.rail.map((s) => `        <li><a href="#${s.id}">${s.number ? `<span class="num" aria-hidden="true">${s.number}</span>` : ''}<span>${escapeHtml(s.text)}</span></a></li>`).join('\n')}
      </ol>
    </aside>
`
    : '';
  const source = doc.source
    ? `\n          <li><a class="external" href="${escapeHtml(doc.source)}" target="_blank" rel="noopener">Also on GitHub</a></li>`
    : '';
  return `${head({ title: `${doc.title} · Cyrus Sarkosh`, ogTitle: doc.title, description: doc.description, canonical: doc.url, ogType: 'article', extraMeta, graph, theme })}
<body class="doc-page">
${nav(null)}
${crumbs(trail)}

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
      <section class="author" aria-label="About the author">
        <p class="section-label">Written by</p>
        <p class="author-name"><a href="/">Cyrus Sarkosh</a></p>
        <p>Senior software engineer, founding engineer and lead on several zero-to-one products at DoorDash.</p>
        <p class="author-links"><a href="/">csarko.sh</a> · <a class="external" href="${LINKEDIN}" target="_blank" rel="noopener">LinkedIn</a></p>
      </section>
    </main>
  </div>

${FOOTER}`;
}

export function indexPage(docs, theme) {
  const url = `${SITE}/${DOCS_DIR}`;
  const trail = [HOME_CRUMB, [DOCS_NAV, url]];
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
    breadcrumbs(trail),
  ];
  return `${head({ title: `${INDEX_TITLE} · Cyrus Sarkosh`, ogTitle: INDEX_TITLE, description: INDEX_DESCRIPTION, canonical: url, ogType: 'website', graph, theme })}
<body>
${nav(`/${DOCS_DIR}`)}
${crumbs(trail)}

  <main id="top" class="wrap docs-index" tabindex="-1">
    <header class="doc-header">
      <p class="eyebrow">${DOCS_NAV}</p>
      <h1>${escapeHtml(INDEX_TITLE)}</h1>
      <p class="lead">${escapeHtml(INDEX_LEAD)}</p>
    </header>
${docList(docs, 2, '    ')}
  </main>

${FOOTER}`;
}

function gameList(games, pad) {
  const items = games.map((game) => {
    // The title is not a link: "Play in your browser" says where it goes, which a repeated title
    // never does, and it is stretched over the card, as on the home page's Projects card.
    const play = game.play
      ? `${pad}    <a class="card-link stretch" href="${escapeHtml(game.play)}" target="_blank" rel="noopener">Play in your browser ${EXTERNAL_ARROW}</a>\n`
      : '';
    return `${pad}  <li class="card">
${pad}    <p class="game-kicker">${escapeHtml(game.kicker)}</p>
${pad}    <h2 class="game-title">${game.titleHtml}</h2>
${pad}    <div class="game-desc prose">
${game.html}${pad}    </div>
${pad}    <ul class="tags" role="list">${game.tags.map((tag) => `<li>${escapeHtml(tag)}</li>`).join('')}</ul>
${play}${pad}  </li>`;
  });
  return `${pad}<ul class="game-list" role="list">\n${items.join('\n')}\n${pad}</ul>`;
}

export function gamesPage(games, theme) {
  const url = `${SITE}/games`;
  const trail = [HOME_CRUMB, [GAMES_TITLE, url]];
  const graph = [
    {
      '@type': 'CollectionPage',
      '@id': `${url}#page`,
      url,
      name: GAMES_TITLE,
      description: GAMES_DESCRIPTION,
      isPartOf: { '@id': WEBSITE },
      about: { '@id': PERSON },
      mainEntity: {
        '@type': 'ItemList',
        itemListElement: games.map((game, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          item: {
            '@type': 'VideoGame',
            name: game.title,
            description: game.description,
            url: game.play ?? game.repo ?? url,
            gamePlatform: 'Web browser',
            author: PERSON_NODE,
          },
        })),
      },
    },
    breadcrumbs(trail),
  ];
  return `${head({ title: `${GAMES_HEADING} · Cyrus Sarkosh`, ogTitle: GAMES_TITLE, description: GAMES_DESCRIPTION, canonical: url, ogType: 'website', graph, theme })}
<body>
${nav('/games')}
${crumbs(trail)}

  <main id="top" class="wrap docs-index" tabindex="-1">
    <header class="doc-header">
      <p class="eyebrow">${GAMES_TITLE}</p>
      <h1>${escapeHtml(GAMES_HEADING)}</h1>
      <p class="lead">${escapeHtml(GAMES_LEAD)}</p>
    </header>
${gameList(games, '    ')}
  </main>

${FOOTER}`;
}

// The poster, as the markers build_assets.py fills with the hashed <picture> (see the portrait on
// the home page). Until it runs, and in any copy of the page that never goes through it, the plain
// <img> inside is already the right image at the right shape, and it carries the alt text the
// Markdown gave: build_assets.py reads that attribute back out rather than parsing the front matter.
const filmPoster = (film, pad) => `${pad}<div class="film-poster">
${pad}  <!-- generated:film-poster:${film.slug} -->
${pad}  <img src="${film.poster}" width="1080" height="1920" alt="${escapeHtml(film.alt)}" loading="lazy" decoding="async" />
${pad}  <!-- /generated:film-poster:${film.slug} -->
${pad}</div>`;

// `level` is the card title's heading level: h2 on /film, where the page's h1 is above it, and h3
// on the home page, where the section's own h2 is.
function filmCard(film, pad, level = 2) {
  return `${pad}<li class="card film-card">
${filmPoster(film, `${pad}  `)}
${pad}  <div class="film-body">
${pad}    <p class="film-kicker">${escapeHtml(film.kicker)}</p>
${pad}    <h${level} class="film-title">${film.titleHtml}</h${level}>
${pad}    <div class="film-desc prose">
${film.html}${pad}    </div>
${pad}    <ul class="tags" role="list">${film.tags.map((tag) => `<li>${escapeHtml(tag)}</li>`).join('')}</ul>
${film.warning ? `${pad}    <p class="film-warning">${WARNING_ICON}${escapeHtml(film.warning)}</p>\n` : ''}${pad}    <a class="card-link stretch" href="${escapeHtml(film.watch)}" target="_blank" rel="noopener">Watch on YouTube ${EXTERNAL_ARROW}</a>
${pad}  </div>
${pad}</li>`;
}

export function filmsPage(films, theme) {
  const url = `${SITE}/${FILM_DIR}`;
  const trail = [HOME_CRUMB, [FILM_TITLE, url]];
  const graph = [
    {
      '@type': 'CollectionPage',
      '@id': `${url}#page`,
      url,
      name: FILM_TITLE,
      description: FILM_DESCRIPTION,
      isPartOf: { '@id': WEBSITE },
      about: { '@id': PERSON },
      mainEntity: {
        '@type': 'ItemList',
        itemListElement: films.map((film, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          item: {
            '@type': 'VideoObject',
            name: film.title,
            description: film.description,
            thumbnailUrl: `${SITE}${film.poster}`,
            uploadDate: film.released,
            duration: film.duration,
            url: film.watch,
            embedUrl: `https://www.youtube.com/embed/${film.videoId}`,
            author: PERSON_NODE,
          },
        })),
      },
    },
    breadcrumbs(trail),
  ];
  return `${head({ title: `${FILM_PAGE_TITLE} · Cyrus Sarkosh`, ogTitle: FILM_TITLE, description: FILM_DESCRIPTION, canonical: url, ogType: 'website', graph, theme })}
<body>
${nav(`/${FILM_DIR}`)}
${crumbs(trail)}

  <main id="top" class="wrap docs-index" tabindex="-1">
    <header class="doc-header">
      <p class="eyebrow">${FILM_TITLE}</p>
      <h1>${escapeHtml(FILM_HEADING)}</h1>
      <p class="lead">${escapeHtml(FILM_LEAD)}</p>
    </header>
    <ul class="film-list" role="list">
${films.map((film) => filmCard(film, '      ')).join('\n')}
    </ul>
  </main>

${FOOTER}`;
}

// The home page's "Film" section: the newest film alone, since the card is a poster and a paragraph
// and the page below it is the list. With no films the block is empty, so nothing renders.
export function filmSection(films) {
  if (!films.length) return '\n    ';
  return `
    <section id="${FILM_DIR}" aria-labelledby="film-title">
      <p class="section-label">02 / ${FILM_TITLE}</p>
      <h2 id="film-title">${escapeHtml(FILM_HOME_HEADING)}</h2>
      <ul class="film-list" role="list">
${filmCard(films[0], '        ', 3)}
      </ul>
      <a class="all-docs" href="/${FILM_DIR}">All films ${ARROW}</a>
    </section>
    `;
}

// The home page's "Notes" section, which the home nav's Notes heading link jumps to. With no docs the block is empty, so nothing renders.
export function homeSection(docs) {
  if (!docs.length) return '\n    ';
  return `
    <section id="notes" aria-labelledby="notes-title">
      <p class="section-label">04 / ${NOTES}</p>
      <h2 id="notes-title">Notes from what I'm researching</h2>
${docList(docs.slice(0, HOME_LIMIT), 3, '      ')}
      <a class="all-docs" href="/${DOCS_DIR}">All notes ${ARROW}</a>
    </section>
    `;
}

export function sitemap(docs, games = [], films = []) {
  // /, /film, /games and /research get no <lastmod>: a home-page-only edit never moves it, so it
  // was unreliable. Each doc keeps its own (updated, else published), which is a real content date.
  const entries = [
    [`${SITE}/`, null],
    ...(films.length ? [[`${SITE}/${FILM_DIR}`, null]] : []),
    ...(games.length ? [[`${SITE}/games`, null]] : []),
    ...(docs.length ? [[`${SITE}/${DOCS_DIR}`, null]] : []),
    ...docs.map((d) => [d.url, d.modified]),
  ];
  const urls = entries.map(([loc, lastmod]) =>
    `  <url>\n    <loc>${loc}</loc>\n${lastmod ? `    <lastmod>${lastmod}</lastmod>\n` : ''}  </url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

// ---------------------------------------------------------------- everything

export function buildSite({ sources, gameSources = [], filmSources = [], indexHtml }) {
  const docs = sortDocs(sources.map(({ name, text }) => loadDoc(name, text)));
  const games = sortGames(gameSources.map(({ name, text }) => loadGame(name, text)));
  const films = sortFilms(filmSources.map(({ name, text }) => loadFilm(name, text)));
  // The date lives in the file name, so the directory no longer keeps slugs unique: two dates can
  // claim one URL, and the second page would silently overwrite the first.
  const bySlug = new Map();
  for (const doc of docs) {
    const name = `${doc.published}-${doc.slug}.md`;
    if (bySlug.has(doc.slug)) {
      throw new DocError(`docs/published/: ${bySlug.get(doc.slug)} and ${name} both build /${DOCS_DIR}/${doc.slug}`);
    }
    bySlug.set(doc.slug, name);
  }
  const theme = themeBlocks(indexHtml);
  const files = new Map();
  for (const doc of docs) files.set(`${DOCS_DIR}/${doc.slug}.html`, docPage(doc, theme));
  if (docs.length) files.set(`${DOCS_DIR}/index.html`, indexPage(docs, theme));
  if (games.length) files.set('games/index.html', gamesPage(games, theme));
  if (films.length) files.set(`${FILM_DIR}/index.html`, filmsPage(films, theme));
  files.set('sitemap.xml', sitemap(docs, games, films));
  files.set('index.html', replaceBlock(
    replaceBlock(indexHtml, 'docs', homeSection(docs)), 'film', filmSection(films)));
  return files;
}
