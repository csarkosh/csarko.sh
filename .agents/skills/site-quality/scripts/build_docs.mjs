#!/usr/bin/env node
// build_docs.mjs — build csarko.sh's docs pages from docs/published/*.md and /games from docs/games/*.md.
//
//   node build_docs.mjs              write into public/ (generate-assets.sh runs this first)
//   node build_docs.mjs --out <dir>  write the same files under <dir> and leave the repo alone (check.py uses this)
//
// Writes public/research/<slug>.html, public/research/index.html, public/sitemap.xml and the
// <!-- generated:docs --> block in public/index.html. Doc pages carry empty generated:head,
// generated:fonts and generated:analytics markers, which build_assets.py fills next.
// The logic lives in docs_lib.mjs; this file only reads and writes.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSite, DocError, DOCS_DIR } from './docs_lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const PUBLIC = join(ROOT, 'public');
const CONTENT = join(ROOT, 'docs/published');
const GAMES = join(ROOT, 'docs/games');

const args = process.argv.slice(2);
if (!(args.length === 0 || (args.length === 2 && args[0] === '--out'))) {
  console.error('usage: build_docs.mjs [--out <dir>]');
  process.exit(2);
}
const out = args.length ? resolve(args[1]) : PUBLIC;

const read = (dir) => (existsSync(dir)
  ? readdirSync(dir).filter((f) => f.endsWith('.md')).sort()
    .map((f) => ({ name: f, text: readFileSync(join(dir, f), 'utf8') }))
  : []);

const sources = read(CONTENT);
const gameSources = read(GAMES);

let files;
try {
  files = buildSite({ sources, gameSources, indexHtml: readFileSync(join(PUBLIC, 'index.html'), 'utf8') });
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
  for (const dir of [DOCS_DIR, 'games']) {
    const built = join(PUBLIC, dir);
    if (!existsSync(built)) continue;
    for (const f of readdirSync(built)) {
      if (f.endsWith('.html') && !files.has(`${dir}/${f}`)) {
        rmSync(join(built, f));
        console.log(`removed public/${dir}/${f}`);
      }
    }
    if (!readdirSync(built).length) rmSync(built, { recursive: true });
  }
}

const pages = [...files.keys()].filter((k) => k.startsWith(`${DOCS_DIR}/`) && k !== `${DOCS_DIR}/index.html`).length;
const where = out === PUBLIC ? 'public/' : out;
console.log(`docs: ${pages} page(s)${files.has('games/index.html') ? ` + ${gameSources.length} game(s)` : ''} → ${where}`);
