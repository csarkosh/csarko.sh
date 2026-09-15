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
