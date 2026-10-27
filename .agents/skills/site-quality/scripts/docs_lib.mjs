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
// "featured" puts a doc in the research index's Start here row (Cyrus, 2026-10-18), lowest first.
// "series" names the run of docs it belongs to (two or more share the name, read in published
// order), and "related" the slugs its Keep reading block offers, in that order; without it the
// build picks by shared category (2026-10-23, so no doc ends in a dead end).
const FIELDS = { description: true, published: true, categories: true, updated: false, source: false, featured: false, series: false, related: false };
const MAX_RELATED = 4;
const SERIES_NAME = /^[A-Z][A-Za-z0-9' ]{2,39}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// The categories a doc may carry (Cyrus, 2026-10-13), in the order the /research filter
// chips show them. One to three per doc, written in front matter as
// `categories: Rendering, Worlds and terrain`, spelled exactly as here; the build refuses
// anything else, so no doc is published uncategorised. Adding one here adds its chip.
export const CATEGORIES = ['Distributed systems', 'AI', 'Rendering', 'Worlds and terrain', 'Game design', 'Film', 'Tooling'];
const MAX_CATEGORIES = 3;
/** "worlds-and-terrain" from "Worlds and terrain": the token the chips and the cards share. */
export const categorySlug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
// Docs published from this date cite their sources in IEEE style: numbered [n] markers in the
// text and a numbered "## Sources" list. Older docs build as they are until they are converted,
// and a converted one is held to the same rules (renderMarkdown checks any doc whose Sources
// section is a numbered list).
export const IEEE_SINCE = '2026-09-23';
// Docs published from this date say when their "now" was (Cyrus, 2026-10-23): a paragraph that
// says today, now, currently and the like must carry "as of <date>", so a doc never claims a state
// of the game, a tool or a market that has since moved on. Quotes, code and Sources are exempt.
export const DATED_SINCE = '2026-10-24';
const UNDATED = /\b(today|now|currently|nowadays|at the moment|at present|these days|so far|not yet|no longer)\b/i;

/** The paragraphs of a doc's prose before Sources that speak of the present without a date. */
export function undatedParagraphs(body) {
  const prose = body.split(/^##\s+(?:\d+\.\s+)?Sources\s*$/im)[0].replace(/^```[\s\S]*?^```/gm, '');
  return prose.split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p && !p.startsWith('#'))
    .filter((p) => {
      const plain = p.replace(/`[^`]*`/g, '').replace(/"[^"]*"/g, '').replace(/\]\([^)]*\)/g, ']');
      return UNDATED.test(plain) && !/\bas of\b/i.test(plain);
    });
}
// Games, apps and films share one list, /projects (Cyrus, 2026-10-26). "order" places a project
// in it, 1 first, across all three kinds; "alt" on a game describes its card's preview, which
// comes from the same place as an app's (assets/apps/<slug>.png).
const GAME_FIELDS = { description: true, status: true, tags: true, play: false, repo: false, released: false, order: false, alt: false };
// An app is software to download or use: "page" is its own page (on apps.csarko.sh), "platforms"
// what it runs on, "license" joins the status in the card's kicker when the app is open source,
// and "alt" describes its card's preview image (assets/apps/<slug>.png, and <slug>-dark.png for
// the dark theme if it has one), which the card shows only when alt is given. "link" names the
// card's link to the page ("Download and docs" unless it says otherwise, e.g. "Install and docs").
// "order" places it on /projects (1 first); "sections" names the README's H2 sections
// its page keeps, in the README's words, when the whole README is not the page.
const APP_FIELDS = { description: true, status: true, page: true, platforms: true, tags: true, license: false, repo: false, released: false, alt: false, link: false, order: false, sections: false };
// A film is a video hosted on YouTube: the page carries its poster and links out, so every field
// here but "order" is needed to build the card and its VideoObject. "alt" describes the poster.
// There is no warning field: every film card carries the same notice (FILM_NOTICE).
const FILM_FIELDS = { description: true, watch: true, released: true, runtime: true, alt: true, tags: true, order: false };

// Either shape YouTube serves a video at; the 11-character id is what the embed and poster need.
const WATCH_URL = /^https:\/\/(?:www\.)?youtube\.com\/(?:shorts\/|watch\?v=)([A-Za-z0-9_-]{11})$/;
const RUNTIME = /^(\d{1,2}):([0-5]\d)$/;

// A game's status is also the kicker line above its title, so the two can never disagree.
const STATUSES = { playable: 'Playable now · No install', 'in-development': 'In development' };
const APP_STATUSES = { released: 'Released', 'in-development': 'In development' };

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
  const names = meta.categories.split(',').map((s) => s.trim()).filter(Boolean);
  for (const name of names) {
    if (!CATEGORIES.includes(name)) throw new DocError(`${file}: unknown category "${name}" (one of: ${CATEGORIES.join(', ')})`);
  }
  if (names.length === 0) throw new DocError(`${file}: categories needs at least one of: ${CATEGORIES.join(', ')}`);
  if (new Set(names).size !== names.length) throw new DocError(`${file}: a category is listed twice`);
  if (names.length > MAX_CATEGORIES) throw new DocError(`${file}: ${names.length} categories; at most ${MAX_CATEGORIES}`);
  meta.categories = CATEGORIES.filter((c) => names.includes(c));
  if (meta.featured !== undefined) {
    const featured = Number(meta.featured);
    if (!Number.isInteger(featured) || featured < 1) throw new DocError(`${file}: featured must be a whole number from 1`);
    meta.featured = featured;
  }
  if (meta.series !== undefined && !SERIES_NAME.test(meta.series)) {
    throw new DocError(`${file}: series must be 3 to 40 letters, digits, spaces or apostrophes, starting with a capital`);
  }
  if (meta.related !== undefined) {
    const related = meta.related.split(',').map((s) => s.trim()).filter(Boolean);
    if (!related.length || related.length > MAX_RELATED) throw new DocError(`${file}: related names 1 to ${MAX_RELATED} doc slugs`);
    const bad = related.find((s) => !SLUG.test(s));
    if (bad) throw new DocError(`${file}: related "${bad}" is not a doc slug (the URL's last part, no date)`);
    if (new Set(related).size !== related.length) throw new DocError(`${file}: a related doc is listed twice`);
    meta.related = related;
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
  return { meta: { ...meta, tags, order: parseOrder(meta, file) }, body };
}

// A project's place on /projects: a whole number from 1, or undefined to follow the ordered ones.
function parseOrder(meta, file) {
  if (meta.order === undefined) return undefined;
  const order = Number(meta.order);
  if (!Number.isInteger(order) || order < 1) throw new DocError(`${file}: order must be a whole number from 1`);
  return order;
}

export function parseAppFrontMatter(text, file) {
  const { meta, body } = parseBlock(text, file, APP_FIELDS);
  if (!(meta.status in APP_STATUSES)) {
    throw new DocError(`${file}: status must be ${Object.keys(APP_STATUSES).join(' or ')}`);
  }
  if (!/^https:\/\/\S+$/.test(meta.page)) throw new DocError(`${file}: page must be an https:// URL`);
  if (meta.repo !== undefined && !/^https:\/\/github\.com\/\S+$/.test(meta.repo)) {
    throw new DocError(`${file}: repo must be an https://github.com/ URL`);
  }
  if (meta.released !== undefined && !isDate(meta.released)) {
    throw new DocError(`${file}: released must be a real YYYY-MM-DD date`);
  }
  const tags = meta.tags.split(',').map((tag) => tag.trim()).filter(Boolean);
  if (!tags.length || tags.length > 5) throw new DocError(`${file}: tags must be 1 to 5 comma-separated names`);
  const order = parseOrder(meta, file);
  const sections = meta.sections === undefined ? undefined : meta.sections.split(',').map((s) => s.trim()).filter(Boolean);
  if (sections !== undefined && !sections.length) throw new DocError(`${file}: sections names at least one heading`);
  return { meta: { ...meta, tags, order, sections }, body };
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
      order: parseOrder(meta, file),
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

// IEEE references: a numbered list under "## Sources" (or "## 8. Sources"). Each entry needs the
// "Accessed:" date and "Available: https://…" that IEEE's online-source format ends with.
const SOURCES_HEADING = /^(?:\d+\.\s+)?Sources$/i;
// Body text that must never gain citation links: code, headings, existing links, and the
// reference list itself (its [n] labels are not citations).
const NO_CITES = /(<pre[\s\S]*?<\/pre>|<code[\s\S]*?<\/code>|<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>|<a\b[\s\S]*?<\/a>|<ol class="references">[\s\S]*?<\/ol>)/;

function findReferences(tokens, file, ieee, problems) {
  const start = tokens.findIndex((t) => t.type === 'heading' && t.depth === 2 && SOURCES_HEADING.test(t.text));
  if (start < 0) return null;
  let end = tokens.findIndex((t, i) => i > start && t.type === 'heading' && t.depth <= 2);
  if (end < 0) end = tokens.length;
  const list = tokens.slice(start + 1, end).find((t) => t.type === 'list' && t.ordered);
  if (!list) {
    if (ieee) problems.push(`${file}: "## Sources" must be a numbered list of IEEE references (see the publish-doc skill)`);
    return null;
  }
  list.items.forEach((item, i) => {
    const n = i + 1;
    if (!item.raw.trimStart().startsWith(`${n}.`)) problems.push(`${file}: reference ${n} is numbered "${item.raw.trim().split(/\s/)[0]}"; number them 1, 2, 3… in order`);
    if (!/\bAccessed: /.test(item.text)) problems.push(`${file}: reference [${n}] needs "Accessed: Mon. D, YYYY."`);
    if (!/\bAvailable: https:\/\/\S+/.test(item.text)) problems.push(`${file}: reference [${n}] needs "[Online]. Available: https://…"`);
  });
  return list;
}

// Link every bare [n] outside NO_CITES to its reference, and check IEEE's rules: every reference
// is cited, every citation has a reference, and references are numbered by first citation.
function linkCitations(html, count, file, problems) {
  const order = [];
  const out = html.split(NO_CITES).map((part, i) => (i % 2 ? part : part.replace(/\[(\d+)\]/g, (whole, digits) => {
    const n = Number(digits);
    if (n < 1 || n > count) {
      problems.push(`${file}: cites [${n}] but Sources has ${count} reference(s)`);
      return whole;
    }
    if (!order.includes(n)) order.push(n);
    return `<a class="cite" href="#ref-${n}">[${n}]</a>`;
  }))).join('');
  order.forEach((n, i) => {
    if (n !== i + 1) problems.push(`${file}: [${n}] is cited before [${i + 1}]; number references in order of first citation`);
  });
  for (let n = 1; n <= count; n += 1) {
    if (!order.includes(n)) problems.push(`${file}: reference [${n}] is never cited in the text`);
  }
  return out;
}

const countWords = (html) => decodeEntities(html.replace(/<[^>]+>/g, ' ')).split(/\s+/).filter(Boolean).length;
// A doc's figure: ![alt](name.png "caption") alone in its paragraph, the file in the site-quality
// skill's assets/research/<slug>/. build_assets.py fills the marker with the hashed <picture>.
const FIGURE_FILE = /^([a-z0-9]+(?:-[a-z0-9]+)*)\.(png|svg)$/;
const DOC_LINK = new RegExp(`^/${DOCS_DIR}/([a-z0-9]+(?:-[a-z0-9]+)*)(?:#[\\w-]+)?$`);

// The first "# H1" is the title (removed from the body); every "## H2" becomes a section and a
// stop on the contents rail, and "## 1. Title" shows its number as a mono label ("01").
// `ieee` makes IEEE references mandatory for a doc with a Sources section (see IEEE_SINCE).
// `figures` is the doc's own figure files (name -> { width, height }); without it, as on the
// games, films and apps lists, an image is refused.
export function renderMarkdown(body, file, { ieee = false, slug = null, figures = null } = {}) {
  const marked = new Marked({ gfm: true });
  const tokens = marked.lexer(body);
  const h1s = tokens.filter((t) => t.type === 'heading' && t.depth === 1);
  if (h1s.length !== 1) throw new DocError(`${file}: needs exactly one "# " title (found ${h1s.length})`);
  tokens.splice(tokens.indexOf(h1s[0]), 1);

  const problems = [];
  const references = findReferences(tokens, file, ieee, problems);
  const rail = [];
  const usedIds = new Set(['top']); // "top" is the skip link's target; never reused
  // lib-visits derives a "read-<slug>" event when a leave reached the element marked data-read-end.
  // With a Sources section that is its heading: a reader who finished the prose has read the doc,
  // and a long reference list would otherwise hide them. Without one, docPage marks its author box.
  let hasSources = false;
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
  let terms = 0;
  let firstFigure = null;
  // The first figure is often in the first screen, so only the later ones load lazily.
  const figure = ({ href, title, text }) => {
    if (!figures) {
      problems.push(`${file}: images aren't supported here (${href})`);
      return '';
    }
    const m = FIGURE_FILE.exec(href);
    const size = m && figures.get(href);
    if (!size) {
      problems.push(`${file}: figure "${href}" must be <name>.png or <name>.svg in .agents/skills/site-quality/assets/research/${slug}/`);
      return '';
    }
    if (!text.trim()) problems.push(`${file}: figure ${href} needs alt text, what it shows: ![alt](${href} "caption")`);
    if (!title?.trim()) problems.push(`${file}: figure ${href} needs a caption that says its point: ![alt](${href} "caption")`);
    const first = firstFigure === null;
    if (first) firstFigure = { name: m[1], ext: m[2], ...size };
    const key = `${slug}/${m[1]}`;
    return `<figure class="figure">
<!-- generated:figure:${key} -->
<img src="/${DOCS_DIR}/figures/${slug}-${m[1]}.${m[2] === 'png' ? 'jpg' : 'svg'}" width="${size.width}" height="${size.height}" alt="${escapeHtml(text)}"${first ? '' : ' loading="lazy"'} decoding="async" />
<!-- /generated:figure:${key} -->
<figcaption>${escapeHtml(title ?? '')}</figcaption>
</figure>
`;
  };

  marked.use({
    renderer: {
      heading({ tokens: inline, depth, text }) {
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
        const isSources = SOURCES_HEADING.test(text) && !hasSources;
        if (isSources) hasSources = true;
        return `<div class="section-head"${isSources ? ' data-read-end' : ''}>${number ? `<p class="section-label">${number}</p>` : ''}${heading}</div>\n`;
      },
      html({ text }) {
        return escapeHtml(text);
      },
      list(token) {
        if (token !== references) return false;
        const items = token.items.map((item, i) => `<li id="ref-${i + 1}"><span class="ref-num">[${i + 1}]</span><div>${this.parser.parse(item.tokens)}</div></li>\n`);
        return `<ol class="references">\n${items.join('')}</ol>\n`;
      },
      // A paragraph that is one image and nothing else is a figure.
      paragraph({ tokens: inline }) {
        const parts = inline.filter((t) => !(t.type === 'text' && !t.text.trim()));
        if (parts.length !== 1 || parts[0].type !== 'image') return false;
        return figure(parts[0]);
      },
      image({ href }) {
        problems.push(figures
          ? `${file}: a figure must be a paragraph of its own (${href})`
          : `${file}: images aren't supported here (${href})`);
        return '';
      },
      link({ href, title, tokens: inline }) {
        const text = this.parser.parseInline(inline);
        if (insideHeading) {
          problems.push(`${file}: headings can't contain links (${href})`);
          return text;
        }
        // [term](#term "definition"): a word a reader may not know, defined in a popover on tap.
        // The definition is in the HTML, so it is public and searchable; no script is needed.
        if (href === '#term') {
          if (!title?.trim()) {
            problems.push(`${file}: a term needs its definition as the link's title: [${plainText(text)}](#term "definition")`);
            return text;
          }
          terms += 1;
          return `<button type="button" class="term" popovertarget="term-${terms}">${text}</button><span class="term-def" id="term-${terms}" popover role="note">${escapeHtml(title)}</span>`;
        }
        const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
        if (/^https?:\/\//.test(href)) {
          return `<a class="external" href="${escapeHtml(href)}"${titleAttr} target="_blank" rel="noopener">${text}</a>`;
        }
        // A link to another doc counts as doc-<slug>, so the dashboard sees which links are followed.
        const doc = DOC_LINK.exec(href);
        if (doc) return `<a href="${escapeHtml(href)}"${titleAttr} data-visits-event="doc-${doc[1]}">${text}</a>`;
        if (/^#[\w-]+$/.test(href) || /^\/(?!\/)/.test(href)) return `<a href="${escapeHtml(href)}"${titleAttr}>${text}</a>`;
        problems.push(`${file}: link "${href}" must be https://, #anchor or a root-relative /path`);
        return text;
      },
    },
  });

  const titleHtml = parseHeadingInline(() => marked.parseInline(h1s[0].text));
  let html = marked.parser(tokens)
    .replaceAll('<table>', '<div class="scroll" tabindex="0" role="region" aria-label="Table"><table>').replaceAll('</table>', '</table></div>')
    .replaceAll('<pre>', '<div class="scroll" tabindex="0" role="region" aria-label="Code"><pre>').replaceAll('</pre>', '</pre></div>');
  if (references) html = linkCitations(html, references.items.length, file, problems);
  if (problems.length) throw new DocError(problems.join('\n'));
  // Tags become spaces here (not in plainText) so "<p>01</p><h2>Title" counts as two words.
  const words = countWords(html);
  // The read time counts the prose a reader reads: not the Sources list, nor the definitions
  // that only open on a tap.
  const end = html.indexOf('<div class="section-head" data-read-end>');
  const readWords = countWords((end < 0 ? html : html.slice(0, end)).replace(/<span class="term-def"[^>]*>[\s\S]*?<\/span>/g, ' '));
  return { title: plainText(titleHtml), titleHtml, html, rail, words, readWords, firstFigure, references: references ? references.items.length : 0, hasSources };
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
  return { kind: 'game', slug, ...meta, kicker: STATUSES[meta.status], ...renderMarkdown(body, file) };
}

export function parseAppFileName(name) {
  const m = GAME_FILE_NAME.exec(name);
  if (!m) {
    throw new DocError(`docs/${APPS_DIR}/${name}: file name must be <slug>.md, the slug lowercase letters, digits and hyphens`);
  }
  if (/^\d{4}-\d{2}-\d{2}-/.test(m[1])) {
    throw new DocError(`docs/${APPS_DIR}/${name}: an app file name carries no date; use "released:" in the front matter`);
  }
  return { slug: m[1] };
}

export function loadApp(name, text) {
  const file = `docs/${APPS_DIR}/${name}`;
  const { slug } = parseAppFileName(name);
  if (slug === 'index') throw new DocError(`${file}: "index" is reserved for the apps index page`);
  if (text.includes('—')) throw new DocError(`${file}: contains an em-dash; use a comma, colon or semicolon`);
  const { meta, body } = parseAppFrontMatter(text, file);
  const kicker = `${APP_STATUSES[meta.status]}${meta.license ? ` · Open source, ${meta.license}` : ''}`;
  return { kind: 'app', slug, ...meta, kicker, ...renderMarkdown(body, file) };
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
    kind: 'film',
    slug,
    // The stable poster URL, written by build_assets.py from the source in the site-quality skill's
    // assets/films/. The hashed variants live in /assets; this one is what JSON-LD and sharing cite.
    poster: `/${PROJECTS_DIR}/${slug}.jpg`,
    kicker: `${FILM_KICKER} · ${meta.runtime}`,
    ...meta,
    ...renderMarkdown(body, file),
  };
}

// `figures` is the doc's figure files, name -> { width, height } (build_docs.mjs reads them).
export function loadDoc(name, text, figures = new Map()) {
  const file = `docs/published/${name}`;
  const { date, slug } = parseDocFileName(name);
  if (slug === 'index') throw new DocError(`${file}: "index" is reserved for the docs index page`);
  if (text.includes('—')) throw new DocError(`${file}: contains an em-dash; use a comma, colon or semicolon`);
  const { meta, body } = parseFrontMatter(text, file);
  if (meta.published !== date) {
    throw new DocError(`${file}: file name says ${date} but front matter says published: ${meta.published}`);
  }
  if (meta.published >= DATED_SINCE) {
    const undated = undatedParagraphs(body);
    if (undated.length) {
      throw new DocError(`${file}: ${undated.length} paragraph(s) speak of the present without a date; say "as of ${formatDate(meta.published)}" (see publish-doc, "Date the present"):\n${undated.map((p) => `  ${p.slice(0, 100).replace(/\s+/g, ' ')}…`).join('\n')}`);
    }
  }
  return {
    slug,
    url: `${SITE}/${DOCS_DIR}/${slug}`,
    path: `/${DOCS_DIR}/${slug}`,
    ...meta,
    modified: meta.updated ?? meta.published,
    ...renderMarkdown(body, file, { ieee: meta.published >= IEEE_SINCE, slug, figures }),
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
// The research index's search description (also the feed's subtitle) and its lead (Cyrus,
// 2026-10-26: the docs are deep research done with Claude for his projects, shared for anyone).
const INDEX_DESCRIPTION = 'Deep research by Cyrus Sarkosh, done with Claude for his games, apps and films, and published free for anyone working on the same problems.';
const INDEX_LEAD = 'Deep research I have done with Claude while building my projects, from rendering and netcode to horror craft and AI film, shared here so anyone working on the same problems can use it.';
// What the nav and the breadcrumb call /research. The page's own heading is INDEX_TITLE: a trail is
// read sideways, in one line, so it wants the shorter word.
const DOCS_NAV = 'Research';
// Games, apps and films share one page, /projects (Cyrus, 2026-10-26; they were /games, /apps and
// /film until then, and firebase.json 301s those here). Their sources stay apart, in docs/games/,
// docs/apps/ and docs/films/, since each kind has its own fields. PROJECTS_TITLE names the page in
// the nav, the breadcrumb and the share card; PROJECTS_HEADING is the <title> and the h1.
export const PROJECTS_DIR = 'projects';
const PROJECTS_TITLE = 'Projects';
const PROJECTS_HEADING = 'Games, apps and films, built with AI';
const PROJECTS_DESCRIPTION = 'Projects by Cyrus Sarkosh, built with Claude Code: a co-op horror game for the browser, an IDE for AI agents, web analytics, an AI short film and a Mac app.';
const PROJECTS_LEAD = 'What I have built with AI, the work I am proudest of first. Nearly all of it was written with Claude Code, and each card says how AI shaped it.';
// Every film card carries this notice under its title: horror is the genre, so a visitor meets it
// before the poster, and the card is a link one tap away.
const FILM_NOTICE = 'Contains horror imagery that some viewers may find disturbing.';
// A film's kicker, with its runtime after it, so the card says what it is before you read the title.
const FILM_KICKER = 'Short film';
// The apps' sources are docs/apps/ (apps/build.mjs reads them too); each card links out to the
// app's own page on apps.csarko.sh (APPS_HOST), which carries the downloads and the documentation.
export const APPS_DIR = 'apps';
export const APPS_HOST = 'https://apps.csarko.sh';

export const sortDocs = (docs) =>
  [...docs].sort((a, b) => (a.published === b.published ? (a.slug < b.slug ? -1 : 1) : a.published < b.published ? 1 : -1));

// The order Cyrus gives (order: 1 first) leads; the rest follow, released newest first, then
// what is still being built; ties break on slug, so the order never depends on the directory read.
export const sortProjects = (projects) =>
  [...projects].sort((a, b) => {
    const oa = a.order ?? Infinity;
    const ob = b.order ?? Infinity;
    if (oa !== ob) return oa - ob;
    if (!a.released !== !b.released) return a.released ? -1 : 1;
    if (a.released !== b.released) return a.released < b.released ? 1 : -1;
    return a.slug < b.slug ? -1 : 1;
  });

// Doc pages reuse the home page's colors exactly: both token blocks are copied out of index.html.
export function themeBlocks(indexHtml) {
  const dark = /(?<![\w-]):root\s*\{[^}]*\}/.exec(indexHtml);
  const light = /@media\s*\(prefers-color-scheme:\s*light\)\s*\{\s*:root\s*\{[^}]*\}\s*\}/.exec(indexHtml);
  if (!dark || !light) throw new DocError('public/index.html: theme token blocks not found');
  return `${dark[0]}\n    ${light[0]}`;
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
// `local` is false on a page served from another host (apps.csarko.sh), whose crumbs must name
// csarko.sh in full.
function crumbs(trail, { local = true } = {}) {
  const items = trail.map(([name, url], i) => {
    const text = escapeHtml(name);
    const href = local && url.startsWith(SITE) ? url.slice(SITE.length) || '/' : url;
    const inner = i === trail.length - 1
      ? `<span aria-current="page">${text}</span>`
      : `<a href="${href}">${text}</a>`;
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
const WARNING_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><path d="M12 9v4M12 17h.01"/></svg>';
const EXTERNAL_ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>';

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

    /* A .stretch link covers its whole card, so the card is the click target; anything
       else that has to stay clickable is lifted above that overlay. */
    .card {
      position: relative; display: flex; flex-direction: column;
      background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
      padding: 22px; transition: border-color .18s ease, transform .18s ease, background .18s ease;
    }
    .card:hover, .card:focus-within { border-color: var(--accent-border); transform: translateY(-2px); background: var(--surface-hover); }
    /* ::before, not ::after: an external link already uses ::after for its ↗ mark. */
    .card .stretch::before { content: ""; position: absolute; inset: 0; border-radius: var(--radius); }
    .card .tags, .card .project-desc a { position: relative; z-index: 1; }

    .doc-list, .project-list { display: grid; gap: 14px; list-style: none; margin: 0; padding: 0; }
    .doc-list .doc-title { margin: 0 0 4px; font-size: 1.2rem; line-height: 1.35; letter-spacing: -0.015em; font-weight: 600; }
    .doc-list .doc-title a { transition: color .15s ease; }
    .doc-list li:hover .doc-title a, .doc-list .doc-title a:focus-visible { color: var(--accent); }
    .doc-meta { margin: 0 0 6px; font-family: var(--mono); font-size: 12px; color: var(--faint); }
    .doc-desc { margin: 0; color: var(--muted); max-width: 78ch; }
    .doc-list .tags { margin-top: 14px; }

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
      .nav ul a, .crumbs a, .rail a, .prose a, .author a, .tags a, .doc-list .doc-title a, .card, .card-link svg, .card-source { transition: none; }
    }`;

// Only the research index carries the filter's rules (it is the one page with the chips, and
// the longest doc page sits close to its HTML budget). Chips that are checkboxes, "All" a reset
// button, and no script: a doc shows while it carries any checked category; with nothing
// checked every doc shows and All is lit. One rule per category, built from CATEGORIES, so a
// new category gets its chip and its rule together.
const FILTER_CSS = `
    .filters { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 24px; }
    .chip { position: relative; display: inline-flex; align-items: center; gap: 6px; font-family: var(--mono); font-size: 12.5px; line-height: 1.5; padding: 5px 12px; border-radius: 999px; color: var(--muted); background: var(--surface-2); border: 1px solid var(--border); cursor: pointer; transition: border-color .15s ease, color .15s ease, background .15s ease; }
    .chip small { font-size: 11px; color: var(--muted); } /* --faint fails 4.5:1 on a lit chip's accent tint (4.35, Lighthouse) */
    .chip:hover { color: var(--text); border-color: var(--border-strong); }
    .chip input { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer; }
    .chip:has(input:checked), .filters:not(:has(input:checked)) .chip.all { color: var(--text); background: var(--accent-soft); border-color: var(--accent-border); font-weight: 500; }
    .chip:has(input:focus-visible), .chip.all:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    .docs-index:has(.filters input:checked) .all-docs > li { display: none; }
    ${CATEGORIES.map((c) => `.docs-index:has(#cat-${categorySlug(c)}:checked) .all-docs > li[data-categories~="${categorySlug(c)}"] { display: flex; }`).join('\n    ')}
    @media (prefers-reduced-motion: reduce) { .chip { transition: none; } }`;

// The Start here row: the featured docs, smaller cards side by side, above the full list, which
// the chips filter alone (the rules above match .all-docs).
const START_CSS = `
    .start-here { margin: 0 0 44px; }
    .docs-index h2.section-label { margin: 0 0 14px; }
    .start-list { grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr)); }
    .start-list .card { padding: 18px; }
    .start-list .doc-title { font-size: 1.05rem; }
    .start-list .doc-desc { font-size: 14px; }`;

// Only /projects carries the cards' rules (every page carries DOCS_CSS, and the longest doc sits
// close to its HTML budget). A card with a picture (a game's or an app's preview, a film's poster)
// lays it beside the text. On a phone the kicker and title come first, then the picture, then the
// rest, since a picture alone does not say which project it is (Cyrus, 2026-09-19): the body is
// display:contents there, so its parts can be ordered around the picture, and the markup order
// stays picture-then-text. A preview with a portrait version (build_assets.py marks its <picture>)
// shows that beside the text in a 240px frame, and the landscape one under the title on a phone.
const PROJECTS_CSS = `
    .project-card { flex-direction: row; align-items: flex-start; gap: 24px; }
    .project-media { flex: none; width: 360px; max-width: 100%; border-radius: 12px; overflow: hidden; border: 1px solid var(--border); background: var(--surface-2); line-height: 0; }
    .project-media img { width: 100%; height: auto; display: block; }
    .project-media.film-poster { width: 240px; }
    @media (min-width: 641px) { .project-card:has(.portrait) .project-media { width: 240px; } }
    .project-body { display: flex; flex-direction: column; min-width: 0; }
    .project-kicker { margin: 0 0 10px; font-family: var(--mono); font-size: 11.5px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--accent); }
    .project-title { margin: 0 0 10px; font-size: 1.4rem; line-height: 1.3; letter-spacing: -0.02em; font-weight: 600; }
    .project-desc { max-width: 78ch; }
    .project-desc p { margin: 0 0 12px; }
    .project-desc p:last-child { margin-bottom: 0; }
    .project-list .tags { margin-top: 16px; }
    /* A film's content warning, under its title: bold, in the --warning yellow, with an icon that
       inherits the color and a rule down the side so it reads as a notice. */
    .film-notice { display: flex; align-items: flex-start; gap: 8px; margin: 0 0 14px; padding-left: 14px; border-left: 2px solid var(--warning); color: var(--warning); font-size: 14px; font-weight: 600; line-height: 1.5; }
    .film-notice svg { width: 16px; height: 16px; flex: none; margin-top: 1px; }
    /* The home page's .card-link ("Play in your browser"), here as the card's own link. */
    .card-links { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 22px; margin-top: 18px; }
    .card-link { font-size: 14px; font-weight: 500; color: var(--accent); display: inline-flex; align-items: center; gap: 6px; }
    .card-link svg { width: 14px; height: 14px; transition: transform .18s ease; }
    .card:hover .card-link svg { transform: translate(2px, -2px); }
    /* The repo link: lifted above the card's overlay, quieter than the card's own link. */
    .card-source { position: relative; z-index: 1; font-size: 14px; font-weight: 500; color: var(--muted); display: inline-flex; align-items: center; gap: 6px; text-decoration: underline; text-decoration-color: var(--border); text-underline-offset: 3px; transition: color .15s ease, text-decoration-color .15s ease; }
    .card-source:hover, .card-source:focus-visible { color: var(--accent); text-decoration-color: var(--accent); }
    .card-source svg { width: 14px; height: 14px; }
    @media (max-width: 640px) {
      .project-card { flex-direction: column; gap: 0; }
      .project-card .project-body { display: contents; }
      .project-card .project-kicker { order: 1; }
      .project-card .project-title { order: 2; margin-bottom: 14px; }
      .project-card .film-notice { order: 3; }
      .project-card .project-media { order: 4; width: 100%; margin-bottom: 18px; }
      .project-card .project-media.film-poster { width: 200px; align-self: flex-start; }
      .project-card .project-desc { order: 5; }
      .project-card .tags { order: 6; }
      .project-card .card-links { order: 7; }
    }`;

// Only pages with IEEE references carry these rules, so adding them changed no other page.
const REFERENCES_CSS = `
    .prose .references { list-style: none; padding-left: 0; }
    .prose .references li { display: grid; grid-template-columns: 2.5em minmax(0, 1fr); gap: 0 8px; border-radius: 8px; }
    .prose .references li:target { background: var(--surface-2); }
    .prose .references .ref-num { font-family: var(--mono); font-size: 13px; line-height: 1.9; color: var(--faint); }
    .prose .references li > div > p { margin: 0; }
    .prose a.cite { white-space: nowrap; }`;

// `ogImage` is a page's own share card ({ url, width, height, alt }); without one, the site's.
function head({ title, ogTitle, description, canonical, ogType, ogImage = null, extraMeta = '', extraCss = '', graph, theme }) {
  const card = ogImage ?? { url: OG_IMAGE, width: 1200, height: 630, alt: OG_IMAGE_ALT };
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
  <meta property="og:image" content="${card.url}" />
  <meta property="og:image:width" content="${card.width}" />
  <meta property="og:image:height" content="${card.height}" />
  <meta property="og:image:alt" content="${escapeHtml(card.alt)}" />
${extraMeta}  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(ogTitle)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${card.url}" />
  <meta name="twitter:image:alt" content="${escapeHtml(card.alt)}" />

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
${DOCS_CSS}${extraCss}
  </style>
</head>`;
}

// The page links, in the order the whole site uses them (see public/index.html, which carries the
// same two after its heading links). `current` marks the page you are already on. There is no Home
// link: the wordmark to their left is it, on every page. The third value is the visits event
// (lib-visits' client, visits.min.js, binds every data-visits-event), a stable identifier that
// outlives a rename of the label or the URL; the home page's nav carries the same names. Until
// 2026-10-26 there were four: Apps, Film and Games (nav-apps, nav-film, nav-games) before Research.
const PAGE_LINKS = [[`/${PROJECTS_DIR}`, PROJECTS_TITLE, 'nav-projects'], [`/${DOCS_DIR}`, DOCS_NAV, 'nav-research']];

// The link to the page you are on reloads it, which is not a navigation, so it counts nothing.
// `origin` is empty on csarko.sh and the site's URL on a page served from another host.
const nav = (current, origin = '') => `  <a class="skip-link" href="#top">Skip to content</a>
  <nav class="nav" aria-label="Primary">
    <div class="wrap">
      <a class="wordmark" href="${origin}/">csarko<span>.sh</span></a>
      <ul>
${PAGE_LINKS.map(([href, label, event]) =>
    `        <li><a href="${origin}${href}"${href === current ? ' aria-current="page"' : ` data-visits-event="${event}"`}>${label}</a></li>`).join('\n')}
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
// for a second link inside a card.
// Each card names its categories (the same words as the chips) and carries them as tokens
// in data-categories, which the filter's CSS matches on.
// `event` names a card's click in the visits log (the Start here row's start-<slug>).
function docList(docs, level, pad, { cls = '', event } = {}) {
  const items = docs.map((d) => `${pad}  <li class="card" data-categories="${d.categories.map(categorySlug).join(' ')}">
${pad}    <h${level} class="doc-title"><a class="stretch" href="${d.path}"${event ? ` data-visits-event="${event}-${d.slug}"` : ''}>${d.titleHtml}</a></h${level}>
${pad}    <p class="doc-meta">${formatDate(d.published)} · ${readingMinutes(d.readWords)} min read</p>
${pad}    <p class="doc-desc">${escapeHtml(d.description)}</p>
${pad}    <ul class="tags" aria-label="Categories">${d.categories.map((c) => `<li>${escapeHtml(c)}</li>`).join('')}</ul>
${pad}  </li>`);
  return `${pad}<ul class="doc-list${cls ? ` ${cls}` : ''}" role="list">\n${items.join('\n')}\n${pad}</ul>`;
}

/**
 * The category filters above the list (Cyrus, 2026-10-13): one chip a category, a checkbox
 * each, and "All", a reset button, lit while nothing is checked. No script: the list is
 * filtered by the :has() rules in DOCS_CSS, and a checked chip shows every doc that carries
 * its category (OR across chips). Each chip says how many docs it would show.
 */
function filters(docs, pad) {
  const count = (c) => docs.filter((d) => d.categories.includes(c)).length;
  const chips = CATEGORIES.map((c) => `${pad}  <label class="chip"><input type="checkbox" name="category" value="${categorySlug(c)}" id="cat-${categorySlug(c)}" data-visits-event="filter-${categorySlug(c)}" />${escapeHtml(c)} <small>${count(c)}</small></label>`);
  return `${pad}<form class="filters" aria-label="Filter by category">
${pad}  <button type="reset" class="chip all" data-visits-event="filter-all">All <small>${docs.length}</small></button>
${chips.join('\n')}
${pad}</form>`;
}

const FEED_LINK = `  <link rel="alternate" type="application/atom+xml" title="Research by Cyrus Sarkosh" href="/${DOCS_DIR}/feed.xml" />\n`;
const ARROW = '<span aria-hidden="true">→</span>';

// A doc's own share card: its first figure (a PNG; build_assets.py writes a 1200x630 JPEG cut
// from its middle beside the page), else the site's card.
function ogImageOf(doc) {
  const f = doc.firstFigure;
  if (!f || f.ext !== 'png') return null;
  return { url: `${SITE}/${DOCS_DIR}/figures/${doc.slug}-${f.name}.jpg`, width: 1200, height: 630, alt: doc.title };
}

// The "In this doc" list under the opening, at every width (the rail is for wide screens only):
// a phone gets a map of the page before section 01. Sources is left out; the rail keeps it.
function inlineContents(doc) {
  const items = doc.rail.filter((s) => !SOURCES_HEADING.test(s.text));
  if (items.length < 3) return '';
  return `      <nav class="toc" aria-label="In this doc">
        <p class="section-label">In this doc</p>
        <ol>
${items.map((s) => `          <li><a href="#${s.id}" data-visits-event="toc">${s.number ? `<span class="num" aria-hidden="true">${s.number}</span>` : ''}<span>${escapeHtml(s.text)}</span></a></li>`).join('\n')}
        </ol>
      </nav>
`;
}

// The series line under the title: where this doc sits in its run, and the way to the next part.
function seriesLine(doc, links) {
  const s = links.series;
  if (!s) return '';
  const at = s.parts.indexOf(doc);
  const step = s.parts[at + 1] ? ['Next', s.parts[at + 1]] : ['Previous', s.parts[at - 1]];
  return `
        <p class="series-line">Part ${at + 1} of ${s.parts.length} in <strong>${escapeHtml(s.name)}</strong> · ${step[0]}: <a href="${step[1].path}" data-visits-event="series-${step[1].slug}">${step[1].titleHtml}</a></p>`;
}

const playLink = (game) => `<a class="play" href="${escapeHtml(game.play)}" target="_blank" rel="noopener" data-visits-event="play-${game.slug}">Play ${escapeHtml(game.title)} in your browser ${EXTERNAL_ARROW}</a>`;

// Where the prose ends, before Sources: the doc's series, two to four docs to read next, the game
// it is about, and the feed. Hand-picked through front matter, else chosen by build (buildSite).
function keepReading(doc, links) {
  const s = links.series;
  const parts = s
    ? `        <p class="series-name">${escapeHtml(s.name)} · ${s.parts.length} parts</p>
        <ol class="series-parts">
${s.parts.map((d) => (d === doc
    ? `          <li aria-current="true"><span>${d.titleHtml}</span></li>`
    : `          <li><a href="${d.path}" data-visits-event="next-${d.slug}">${d.titleHtml}</a></li>`)).join('\n')}
        </ol>
`
    : '';
  const cards = links.related.length
    ? `        <ul class="doc-list next-list" role="list">
${links.related.map((d) => `          <li class="card">
            <h3 class="doc-title"><a class="stretch" href="${d.path}" data-visits-event="next-${d.slug}">${d.titleHtml}</a></h3>
            <p class="doc-meta">${readingMinutes(d.readWords)} min read</p>
            <p class="doc-desc">${escapeHtml(d.description)}</p>
          </li>`).join('\n')}
        </ul>
`
    : '';
  const play = links.games.map((g) => `        <p class="play-line">${playLink(g)}</p>\n`).join('');
  return `      <section class="keep-reading" aria-labelledby="next-reads">
        <h2 id="next-reads" class="section-label">Keep reading</h2>
${parts}${cards}${play}        <p class="follow">New research as it lands: <a href="/${DOCS_DIR}/feed.xml">the feed</a> (RSS) or <a class="external" href="https://csarko.substack.com/" target="_blank" rel="noopener" data-visits-event="out-substack">csarko.log</a>.</p>
      </section>
`;
}

// After the author box, where a reader who flicked to the bottom lands: the one next doc, the game,
// and the way back to the list.
function afterward(doc, links) {
  const s = links.series;
  const next = (s && s.parts[s.parts.indexOf(doc) + 1]) || links.related[0];
  const items = [
    next ? `<a class="next" href="${next.path}" data-visits-event="end-${next.slug}"><span class="section-label">Read next</span><span>${next.titleHtml} ${ARROW}</span></a>` : '',
    ...links.games.map(playLink),
    `<a href="/${DOCS_DIR}">All research</a>`,
  ].filter(Boolean);
  return `      <nav class="afterward" aria-label="Read next">
        ${items.join('\n        ')}
      </nav>
`;
}

// Only doc pages carry these rules (the lists share DOCS_CSS and sit nearer their budgets).
const DOC_CSS = `
    .doc-page .prose { font-size: 17px; }
    .doc-page .prose p, .doc-page .prose li { color: var(--prose); }
    .doc-header .lead { margin: 0 0 20px; color: var(--prose); }
    .series-line { margin: 18px 0 0; font-size: 14.5px; color: var(--muted); }
    .series-line strong { color: var(--text); font-weight: 600; }
    .series-line a, .follow a, .afterward a:not(.next):not(.play) { color: var(--accent); text-decoration: underline; text-decoration-color: var(--accent-underline); text-underline-offset: 3px; }
    .rail a[aria-current] { color: var(--text); }
    .rail a[aria-current] .num { color: var(--accent); }
    .toc { margin: 40px 0 0; padding: 18px 22px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
    .toc .section-label { margin: 0 0 6px; }
    .toc ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
    .toc a { display: flex; gap: 10px; padding: 5px 0; color: var(--prose); font-size: 15px; line-height: 1.45; }
    .toc a:hover { color: var(--accent); }
    .toc .num { font-family: var(--mono); font-size: 12px; line-height: 1.8; color: var(--faint); flex: none; }
    .figure { margin: 32px 0; }
    .figure img, .figure picture { display: block; width: 100%; height: auto; border-radius: 12px; border: 1px solid var(--border); background: var(--surface-2); }
    /* A tall figure (a portrait still, a diagram) keeps its shape inside one screen. */
    .figure img { max-height: 80vh; object-fit: contain; }
    .figure figcaption { margin-top: 10px; font-size: 14.5px; line-height: 1.55; color: var(--muted); }
    .prose blockquote strong:first-child { display: block; margin-bottom: 4px; font-family: var(--mono); font-size: 12px; font-weight: 500; letter-spacing: 0.1em; text-transform: uppercase; color: var(--accent); }
    .term { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: help; text-decoration: underline dotted var(--faint); text-underline-offset: 4px; }
    .term:hover, .term:focus-visible { text-decoration-color: var(--accent); }
    .term-def { max-width: min(92vw, 420px); margin: auto; padding: 16px 18px; color: var(--text); background: var(--surface-2); border: 1px solid var(--border-strong); border-radius: var(--radius); font-size: 15px; line-height: 1.55; }
    .term-def::backdrop { background: var(--nav-bg); }
    /* A wide table or code block that scrolls sideways shows a shade at the edge it can scroll to. */
    .scroll { background:
      linear-gradient(to right, var(--surface) 30%, transparent) left / 40px 100% no-repeat local,
      linear-gradient(to left, var(--surface) 30%, transparent) right / 40px 100% no-repeat local,
      radial-gradient(farthest-side at 0 50%, var(--border-strong), transparent) left / 14px 100% no-repeat scroll,
      radial-gradient(farthest-side at 100% 50%, var(--border-strong), transparent) right / 14px 100% no-repeat scroll,
      var(--surface); }
    .keep-reading { margin: 72px 0 0; padding: 26px 24px; background: linear-gradient(135deg, var(--accent-tint), transparent 55%), var(--surface); border: 1px solid var(--accent-border); border-radius: var(--radius); }
    .keep-reading .section-label { margin: 0 0 14px; color: var(--accent); }
    .series-name { margin: 0 0 8px; font-weight: 600; }
    .series-parts { margin: 0 0 22px; padding-left: 1.4em; display: grid; gap: 4px; color: var(--muted); }
    .series-parts li::marker { color: var(--faint); font-family: var(--mono); font-size: 13px; }
    .series-parts a { color: var(--accent); text-decoration: underline; text-decoration-color: var(--accent-underline); text-underline-offset: 3px; }
    .series-parts [aria-current] { color: var(--text); font-weight: 600; }
    .next-list .card { padding: 16px 18px; background: var(--bg); }
    .next-list .doc-title { font-size: 1.05rem; }
    .next-list .doc-desc { font-size: 14.5px; }
    .play-line { margin: 20px 0 0; }
    .play { display: inline-flex; align-items: center; gap: 8px; padding: 10px 16px; border-radius: 999px; background: var(--accent); color: var(--on-accent); font-size: 14.5px; font-weight: 600; transition: background .15s ease; }
    .play:hover { background: var(--accent-hover); }
    .play svg { width: 14px; height: 14px; }
    .follow { margin: 20px 0 0; font-size: 14px; color: var(--muted); }
    .afterward { display: flex; flex-wrap: wrap; align-items: center; gap: 14px 22px; margin-top: 24px; font-size: 14.5px; }
    .afterward .next { display: grid; gap: 2px; flex: 1 1 260px; padding: 14px 18px; background: var(--surface); border: 1px solid var(--accent-border); border-radius: var(--radius); font-weight: 600; transition: border-color .15s ease; }
    .afterward .next .section-label { margin: 0; color: var(--accent); font-weight: 400; }
    .afterward .next:hover { border-color: var(--accent); }
    @media (prefers-reduced-motion: reduce) { .play, .afterward .next { transition: none; } }`;

export function docPage(doc, theme, links = { series: null, related: [], games: [] }) {
  const trail = [HOME_CRUMB, [DOCS_NAV, `${SITE}/${DOCS_DIR}`], [doc.title, doc.url]];
  const og = ogImageOf(doc);
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
      image: og ? og.url : OG_IMAGE,
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
${FEED_LINK}`;
  // The trail above already says Research, so the eyebrow carries only the dates.
  const eyebrow = `${formatDate(doc.published)}${doc.updated ? ` · Updated ${formatDate(doc.updated)}` : ''}`;
  const rail = doc.rail.length
    ? `    <aside class="rail" aria-label="Contents">
      <p class="section-label">Contents</p>
      <ol>
${doc.rail.map((s) => `        <li><a href="#${s.id}" data-visits-event="toc-rail">${s.number ? `<span class="num" aria-hidden="true">${s.number}</span>` : ''}<span>${escapeHtml(s.text)}</span></a></li>`).join('\n')}
      </ol>
    </aside>
`
    : '';
  const source = doc.source
    ? `\n          <li><a class="external" href="${escapeHtml(doc.source)}" target="_blank" rel="noopener">Also on GitHub</a></li>`
    : '';
  // The prose in three runs: the opening (the question and its answer), the sections, and Sources,
  // with the contents list after the first and Keep reading before the last.
  const firstSection = doc.html.indexOf('<div class="section-head"');
  const opening = firstSection < 0 ? doc.html : doc.html.slice(0, firstSection);
  const rest = firstSection < 0 ? '' : doc.html.slice(firstSection);
  const sourcesAt = rest.indexOf('<div class="section-head" data-read-end>');
  const sections = sourcesAt < 0 ? rest : rest.slice(0, sourcesAt);
  const sources = sourcesAt < 0 ? '' : rest.slice(sourcesAt);
  const prose = (html) => (html.trim() ? `      <div class="prose">\n${html}      </div>\n` : '');
  return `${head({ title: `${doc.title} · Cyrus Sarkosh`, ogTitle: doc.title, description: doc.description, canonical: doc.url, ogType: 'article', ogImage: og, extraMeta, extraCss: DOC_CSS + (doc.references ? REFERENCES_CSS : ''), graph, theme })}
<body class="doc-page">
${nav(null)}
${crumbs(trail)}

  <div class="wrap shell${doc.rail.length ? '' : ' no-rail'}">
${rail}    <main id="top" tabindex="-1">
      <header class="doc-header">
        <p class="eyebrow">${eyebrow}</p>
        <h1>${doc.titleHtml}</h1>
        <p class="lead">${escapeHtml(doc.description)}</p>
        <ul class="tags">
          <li>${readingMinutes(doc.readWords)} min read</li>${source}
        </ul>${seriesLine(doc, links)}
      </header>
${prose(opening)}${inlineContents(doc)}${prose(sections)}${keepReading(doc, links)}${prose(sources)}      <section class="author" aria-label="About the author"${doc.hasSources ? '' : ' data-read-end'}>
        <p class="section-label">Written by</p>
        <p class="author-name"><a href="/">Cyrus Sarkosh</a></p>
        <p>Senior software engineer leading distributed systems and AI products.</p>
        <p class="author-links"><a href="/">csarko.sh</a> · <a class="external" href="${LINKEDIN}" target="_blank" rel="noopener">LinkedIn</a></p>
      </section>
${afterward(doc, links)}    </main>
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
  // The featured docs lead in their own row; with any, the full list gets a heading of its own
  // and its cards step down a level under it.
  const featured = docs.filter((d) => d.featured !== undefined).sort((a, b) => a.featured - b.featured);
  const start = featured.length
    ? `    <section class="start-here" aria-labelledby="start-here">
      <h2 id="start-here" class="section-label">Start here</h2>
${docList(featured, 3, '      ', { cls: 'start-list', event: 'start' })}
    </section>
    <h2 class="section-label">All research</h2>
`
    : '';
  return `${head({ title: `${INDEX_TITLE} · Cyrus Sarkosh`, ogTitle: INDEX_TITLE, description: INDEX_DESCRIPTION, canonical: url, ogType: 'website', extraMeta: FEED_LINK, extraCss: FILTER_CSS + (featured.length ? START_CSS : ''), graph, theme })}
<body>
${nav(`/${DOCS_DIR}`)}
${crumbs(trail)}

  <main id="top" class="wrap docs-index" tabindex="-1">
    <header class="doc-header">
      <p class="eyebrow">${DOCS_NAV}</p>
      <h1>${escapeHtml(INDEX_TITLE)}</h1>
      <p class="lead">${escapeHtml(INDEX_LEAD)}</p>
    </header>
${start}${filters(docs, '    ')}
${docList(docs, featured.length ? 3 : 2, '    ', { cls: 'all-docs' })}
  </main>

${FOOTER}`;
}

const tagList = (tags) => `<ul class="tags" role="list">${tags.map((tag) => `<li>${escapeHtml(tag)}</li>`).join('')}</ul>`;

// A game's or an app's preview, as the markers build_assets.py fills with the hashed <picture>
// (light, and dark when assets/apps/<slug>-dark.png exists), the way a film's poster is filled.
// Until it runs, the plain <img> is the stable copy build_assets.py writes to
// public/projects/<slug>.jpg.
const preview = (project, pad) => `${pad}<div class="project-media">
${pad}  <!-- generated:app-preview:${project.slug} -->
${pad}  <img src="/${PROJECTS_DIR}/${project.slug}.jpg" alt="${escapeHtml(project.alt)}" loading="lazy" decoding="async" />
${pad}  <!-- /generated:app-preview:${project.slug} -->
${pad}</div>`;

// The poster, as the markers build_assets.py fills with the hashed <picture> (see the portrait on
// the home page). Until it runs, and in any copy of the page that never goes through it, the plain
// <img> inside is already the right image at the right shape, and it carries the alt text the
// Markdown gave: build_assets.py reads that attribute back out rather than parsing the front matter.
const filmPoster = (film, pad) => `${pad}<div class="project-media film-poster">
${pad}  <!-- generated:film-poster:${film.slug} -->
${pad}  <img src="${film.poster}" width="1080" height="1920" alt="${escapeHtml(film.alt)}" loading="lazy" decoding="async" />
${pad}  <!-- /generated:film-poster:${film.slug} -->
${pad}</div>`;

// A card's one link, stretched over the whole card, so the card is the click target. The title is
// not a link: the link's words say where it goes, which a repeated title never does. Each counts
// in the visits log under the name it had on its old page: play-<slug> (a visitor who went on to
// play), app-<slug> (to the app's own page, which carries the downloads and the docs) and
// watch-<slug> (to the film on YouTube).
function cardLink(project) {
  if (project.kind === 'game') {
    return project.play
      ? `<a class="card-link stretch" href="${escapeHtml(project.play)}" target="_blank" rel="noopener" data-visits-event="play-${project.slug}">Play in your browser ${EXTERNAL_ARROW}</a>`
      : '';
  }
  if (project.kind === 'app') {
    return `<a class="card-link stretch" href="${escapeHtml(project.page)}" data-visits-event="app-${project.slug}">${escapeHtml(project.link ?? 'Download and docs')} ${EXTERNAL_ARROW}</a>`;
  }
  return `<a class="card-link stretch" href="${escapeHtml(project.watch)}" target="_blank" rel="noopener" data-visits-event="watch-${project.slug}">Watch on YouTube ${EXTERNAL_ARROW}</a>`;
}

// A second, smaller link beside it to the code, for a project with a public repo (Cyrus, 2026-10-26:
// the cards should show the work to engineers reading them). It sits above the stretched link's
// overlay, so it stays its own click target, and counts as source-<slug>.
function sourceLink(project) {
  return project.repo
    ? `<a class="card-source" href="${escapeHtml(project.repo)}" target="_blank" rel="noopener" data-visits-event="source-${project.slug}">Source on GitHub ${EXTERNAL_ARROW}</a>`
    : '';
}

// One card, whatever the kind: its picture (a film's poster, or a game's or an app's preview when
// it has an alt), the kicker (a game's status, an app's status and licence, a film's runtime), the
// title, a film's content warning, the copy, the tags and the link. Its id is the slug, so
// /projects#<slug> lands on it.
function projectCard(project, pad) {
  const media = project.kind === 'film' ? filmPoster(project, `${pad}  `) : project.alt ? preview(project, `${pad}  `) : '';
  const links = [cardLink(project), sourceLink(project)].filter(Boolean);
  const link = links.length ? `<div class="card-links">${links.join(' ')}</div>` : '';
  const notice = project.kind === 'film' ? `${pad}    <p class="film-notice">${WARNING_ICON}${escapeHtml(FILM_NOTICE)}</p>\n` : '';
  return `${pad}<li class="card${media ? ' project-card' : ''}" id="${project.slug}">
${media ? `${media}\n` : ''}${pad}  <div class="project-body">
${pad}    <p class="project-kicker">${escapeHtml(project.kicker)}</p>
${pad}    <h2 class="project-title">${project.titleHtml}</h2>
${notice}${pad}    <div class="project-desc prose">
${project.html}${pad}    </div>
${pad}    ${tagList(project.tags)}
${link ? `${pad}    ${link}\n` : ''}${pad}  </div>
${pad}</li>`;
}

// Each project's node in the page's ItemList, typed by its kind.
function projectItem(project) {
  const common = { name: project.title, description: project.description, author: PERSON_NODE };
  if (project.kind === 'game') {
    return { '@type': 'VideoGame', ...common, url: project.play ?? project.repo ?? `${SITE}/${PROJECTS_DIR}`, gamePlatform: 'Web browser' };
  }
  if (project.kind === 'app') {
    return {
      '@type': 'SoftwareApplication',
      ...common,
      url: project.page,
      applicationCategory: 'DeveloperApplication',
      operatingSystem: project.platforms,
      ...(project.license ? { license: project.license } : {}),
    };
  }
  return {
    '@type': 'VideoObject',
    ...common,
    thumbnailUrl: `${SITE}${project.poster}`,
    uploadDate: project.released,
    duration: project.duration,
    url: project.watch,
    embedUrl: `https://www.youtube.com/embed/${project.videoId}`,
  };
}

export function projectsPage(projects, theme) {
  const url = `${SITE}/${PROJECTS_DIR}`;
  const trail = [HOME_CRUMB, [PROJECTS_TITLE, url]];
  const graph = [
    {
      '@type': 'CollectionPage',
      '@id': `${url}#page`,
      url,
      name: PROJECTS_TITLE,
      description: PROJECTS_DESCRIPTION,
      isPartOf: { '@id': WEBSITE },
      about: { '@id': PERSON },
      mainEntity: {
        '@type': 'ItemList',
        itemListElement: projects.map((project, i) => ({ '@type': 'ListItem', position: i + 1, item: projectItem(project) })),
      },
    },
    breadcrumbs(trail),
  ];
  return `${head({ title: `${PROJECTS_HEADING} · Cyrus Sarkosh`, ogTitle: PROJECTS_TITLE, description: PROJECTS_DESCRIPTION, canonical: url, ogType: 'website', extraCss: PROJECTS_CSS, graph, theme })}
<body>
${nav(`/${PROJECTS_DIR}`)}
${crumbs(trail)}

  <main id="top" class="wrap docs-index" tabindex="-1">
    <header class="doc-header">
      <p class="eyebrow">${PROJECTS_TITLE}</p>
      <h1>${escapeHtml(PROJECTS_HEADING)}</h1>
      <p class="lead">${escapeHtml(PROJECTS_LEAD)}</p>
    </header>
    <ul class="project-list" role="list">
${projects.map((project) => projectCard(project, '      ')).join('\n')}
    </ul>
  </main>

${FOOTER}`;
}

/**
 * A standalone page on another host (apps.csarko.sh): an app's own page, the way
 * games.csarko.sh/dayhike is the game's. It shares the site's head, tokens, fonts and type, but
 * none of its chrome: no nav, no trail, no wordmark. Its bar carries the app's name and a few
 * links of its own; its footer credits the maker once and names the licence. `main` is the
 * page's own markup inside <body>.
 */
export function standaloneShell({ title, ogTitle, description, canonical, ogType = 'website', extraCss = '', graph, theme, name, links = [], licence = '', main, bodyClass = '' }) {
  const bar = links.map(([label, href, external]) =>
    `        <li><a href="${escapeHtml(href)}"${external ? ' class="external" target="_blank" rel="noopener"' : ''}>${escapeHtml(label)}</a></li>`).join('\n');
  return `${head({ title, ogTitle, description, canonical, ogType, extraCss, graph, theme })}
<body${bodyClass ? ` class="${bodyClass}"` : ''}>
  <a class="skip-link" href="#top">Skip to content</a>
  <header class="app-bar">
    <div class="wrap">
      <a class="app-name" href="${escapeHtml(canonical)}">${escapeHtml(name)}</a>
      <ul>
${bar}
      </ul>
    </div>
  </header>

${main}

  <footer>
    <div class="wrap">
      <span>${escapeHtml(name)}${licence ? ` · ${escapeHtml(licence)}` : ''}</span>
      <span>Made by <a class="maker" href="${SITE}/">Cyrus Sarkosh</a></span>
    </div>
  </footer>
</body>
</html>
`;
}

export function sitemap(docs, projects = []) {
  // /, /projects and /research get no <lastmod>: a home-page-only edit never moves it, so it was
  // unreliable. Each doc keeps its own (updated, else published), which is a real content date.
  const entries = [
    [`${SITE}/`, null],
    ...(projects.length ? [[`${SITE}/${PROJECTS_DIR}`, null]] : []),
    ...(docs.length ? [[`${SITE}/${DOCS_DIR}`, null]] : []),
    ...docs.map((d) => [d.url, d.modified]),
  ];
  const urls = entries.map(([loc, lastmod]) =>
    `  <url>\n    <loc>${loc}</loc>\n${lastmod ? `    <lastmod>${lastmod}</lastmod>\n` : ''}  </url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

// ---------------------------------------------------------------- everything

// The research feed, Atom: every doc, newest first, with its description as the summary.
export function feed(docs) {
  const updated = docs.reduce((max, d) => (d.modified > max ? d.modified : max), '');
  const entries = docs.map((d) => `  <entry>
    <title>${escapeHtml(d.title)}</title>
    <link href="${d.url}" />
    <id>${d.url}</id>
    <published>${d.published}T00:00:00Z</published>
    <updated>${d.modified}T00:00:00Z</updated>
    <summary>${escapeHtml(d.description)}</summary>
${d.categories.map((c) => `    <category term="${escapeHtml(c)}" />`).join('\n')}
  </entry>`);
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${escapeHtml(INDEX_TITLE)} · Cyrus Sarkosh</title>
  <subtitle>${escapeHtml(INDEX_DESCRIPTION)}</subtitle>
  <link href="${SITE}/${DOCS_DIR}" />
  <link rel="self" href="${SITE}/${DOCS_DIR}/feed.xml" />
  <id>${SITE}/${DOCS_DIR}</id>
  <updated>${updated}T00:00:00Z</updated>
  <author><name>Cyrus Sarkosh</name><uri>${SITE}/</uri></author>
${entries.join('\n')}
</feed>
`;
}

const RELATED_AUTO = 3;

/**
 * What each doc links on to (2026-10-23): its series (every doc sharing the name, oldest first),
 * the docs it names in `related` or, without that, the ones sharing the most categories with it
 * (newest first among equals, none from its own series, which is listed apart), and the games it
 * mentions by name that can be played.
 */
export function docLinks(docs, games = []) {
  const bySlug = new Map(docs.map((d) => [d.slug, d]));
  const series = new Map();
  for (const d of docs.filter((x) => x.series)) series.set(d.series, [...(series.get(d.series) ?? []), d]);
  for (const [name, parts] of series) {
    if (parts.length < 2) throw new DocError(`docs/published/: the series "${name}" has one doc (${parts[0].slug}); a series needs two or more`);
    parts.sort((a, b) => (a.published === b.published ? (a.slug < b.slug ? -1 : 1) : a.published < b.published ? -1 : 1));
  }
  const playable = games.filter((g) => g.play);
  const links = new Map();
  for (const doc of docs) {
    let related;
    if (doc.related) {
      related = doc.related.map((slug) => {
        if (slug === doc.slug) throw new DocError(`docs/published/${doc.published}-${doc.slug}.md: related names the doc itself`);
        const other = bySlug.get(slug);
        if (!other) throw new DocError(`docs/published/${doc.published}-${doc.slug}.md: related "${slug}" is not a published doc`);
        return other;
      });
    } else {
      const shared = (d) => d.categories.filter((c) => doc.categories.includes(c)).length;
      related = docs
        .filter((d) => d !== doc && !(doc.series && d.series === doc.series) && shared(d) > 0)
        .map((d, i) => ({ d, score: shared(d), i }))
        .sort((a, b) => b.score - a.score || a.i - b.i)
        .slice(0, doc.series ? RELATED_AUTO - 1 : RELATED_AUTO)
        .map((x) => x.d);
    }
    const text = plainText(doc.html);
    links.set(doc.slug, {
      series: doc.series ? { name: doc.series, parts: series.get(doc.series) } : null,
      related,
      games: playable.filter((g) => new RegExp(`\\b${g.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text)),
    });
  }
  return links;
}

// `figures` maps a doc's slug to its figure files (name -> { width, height }); build_docs.mjs
// reads them from the site-quality skill's assets/research/<slug>/.
export function buildSite({ sources, gameSources = [], filmSources = [], appSources = [], indexHtml, figures = new Map() }) {
  const docs = sortDocs(sources.map(({ name, text }) => loadDoc(name, text, figures.get(parseDocFileName(name).slug))));
  const projects = sortProjects([
    ...gameSources.map(({ name, text }) => loadGame(name, text)),
    ...appSources.map(({ name, text }) => loadApp(name, text)),
    ...filmSources.map(({ name, text }) => loadFilm(name, text)),
  ]);
  const games = projects.filter((p) => p.kind === 'game');
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
  const byFeatured = new Map();
  for (const doc of docs.filter((d) => d.featured !== undefined)) {
    if (byFeatured.has(doc.featured)) throw new DocError(`docs/published/: ${byFeatured.get(doc.featured)} and ${doc.slug} are both featured: ${doc.featured}`);
    byFeatured.set(doc.featured, doc.slug);
  }
  // Every project shares one page, so a slug is its card's #anchor and its picture's
  // /projects/<slug>.jpg across all three folders, and an order is one place in one list.
  const source = (p) => `docs/${{ game: 'games', app: APPS_DIR, film: 'films' }[p.kind]}/${p.slug}.md`;
  const projectSlugs = new Map();
  const projectOrders = new Map();
  for (const p of projects) {
    if (projectSlugs.has(p.slug)) throw new DocError(`${projectSlugs.get(p.slug)} and ${source(p)} share the slug "${p.slug}" on /${PROJECTS_DIR}`);
    projectSlugs.set(p.slug, source(p));
    if (p.order === undefined) continue;
    if (projectOrders.has(p.order)) throw new DocError(`${projectOrders.get(p.order)} and ${source(p)} both have order: ${p.order}`);
    projectOrders.set(p.order, source(p));
  }
  const theme = themeBlocks(indexHtml);
  const files = new Map();
  const links = docLinks(docs, games);
  for (const doc of docs) files.set(`${DOCS_DIR}/${doc.slug}.html`, docPage(doc, theme, links.get(doc.slug)));
  if (docs.length) {
    files.set(`${DOCS_DIR}/index.html`, indexPage(docs, theme));
    files.set(`${DOCS_DIR}/feed.xml`, feed(docs));
  }
  if (projects.length) files.set(`${PROJECTS_DIR}/index.html`, projectsPage(projects, theme));
  files.set('sitemap.xml', sitemap(docs, projects));
  return files;
}
