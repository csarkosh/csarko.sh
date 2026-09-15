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
