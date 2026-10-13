#!/usr/bin/env node
/**
 * build.mjs: make the admin pages csarko.sh pages (spec 2.8). Deterministic; Node 22; no
 * dependencies. Same inputs, same outputs, so running it twice changes nothing.
 *
 *   node admin/build.mjs [--api <url>]
 *
 * It fills the generated blocks under admin/public/:
 *   theme.css          generated:theme   the two token blocks of public/index.html, exactly as
 *                                        docs_lib.mjs's themeBlocks() copies them for a doc page
 *                      generated:fonts   the site's @font-face rules (Inter, JetBrains Mono and
 *                                        their metric-matched fallbacks), root-relative
 *   assets/*.woff2                       the hashed font files those rules name, copied from
 *                                        public/assets/ (stale ones removed)
 *   favicon.ico, favicon.svg             the site's icons
 *   index.html, csarko.sh/index.html
 *                      generated:head    the Inter preload with the current hash
 *                      generated:nav     one link per app in apps.json, aria-current on its page
 *   apps.json                            with --api <url> or ADMIN_API_URL set, the csarko.sh
 *                                        entry's "api" is replaced (the Cloud Run URL is not
 *                                        known until Terraform creates it; the placeholder is
 *                                        https://ADMIN_API_URL_TBD)
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { themeBlocks } from '../.agents/skills/site-quality/scripts/docs_lib.mjs';

const ADMIN = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(ADMIN, '..');
const SITE_PUBLIC = path.join(ROOT, 'public');
const PUBLIC = path.join(ADMIN, 'public');
const PAGES = ['index.html', path.join('csarko.sh', 'index.html')];

const argv = process.argv.slice(2);
const apiFlag = argv.indexOf('--api');
const apiUrl = (apiFlag >= 0 ? argv[apiFlag + 1] : process.env.ADMIN_API_URL) || null;
if (apiFlag >= 0 && !apiUrl) throw new Error('--api needs a URL');

const changed = [];
const write = (file, text) => {
  const before = existsSync(file) ? readFileSync(file, 'utf8') : null;
  if (before === text) return;
  writeFileSync(file, text);
  changed.push(path.relative(ROOT, file));
};
const dedent = (text, n = 4) => text.split('\n').map((line) => line.replace(new RegExp(`^ {0,${n}}`), '')).join('\n');

/** Replace the body between two marker lines, keeping the markers. */
function fillBlock(text, open, close, body, file) {
  const re = new RegExp(`(${open.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')})[\\s\\S]*?(${close.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')})`);
  if (!re.test(text)) throw new Error(`${file}: markers ${open} … ${close} not found`);
  return text.replace(re, (_, a, b) => `${a}\n${body}${body.endsWith('\n') ? '' : '\n'}${b}`);
}

// 1. The site's tokens and font faces.
const site = readFileSync(path.join(SITE_PUBLIC, 'index.html'), 'utf8');
const theme = dedent(themeBlocks(site));
const fontsMatch = /\/\* generated:fonts \*\/\n([\s\S]*?)\n\s*\/\* \/generated:fonts \*\//.exec(site);
if (!fontsMatch) throw new Error('public/index.html: generated:fonts block not found');
const fonts = dedent(fontsMatch[1]).replace(/url\("assets\//g, 'url("/assets/');
const fontFiles = [...fonts.matchAll(/url\("\/assets\/([^"]+)"\)/g)].map((m) => m[1]);
if (fontFiles.length === 0) throw new Error('no font files named in the fonts block');

// 2. Font files and icons: copy the hashed ones, drop any the block no longer names.
mkdirSync(path.join(PUBLIC, 'assets'), { recursive: true });
for (const name of readdirSync(path.join(PUBLIC, 'assets'))) {
  if (name.endsWith('.woff2') && !fontFiles.includes(name)) {
    unlinkSync(path.join(PUBLIC, 'assets', name));
    changed.push(`admin/public/assets/${name} (removed)`);
  }
}
for (const name of fontFiles) {
  const from = path.join(SITE_PUBLIC, 'assets', name);
  const to = path.join(PUBLIC, 'assets', name);
  if (!existsSync(from)) throw new Error(`${from} is missing: run .agents/skills/site-quality/scripts/generate-assets.sh first`);
  if (!existsSync(to) || !readFileSync(to).equals(readFileSync(from))) {
    copyFileSync(from, to);
    changed.push(`admin/public/assets/${name}`);
  }
}
for (const icon of ['favicon.ico', 'favicon.svg']) {
  const from = path.join(SITE_PUBLIC, icon);
  const to = path.join(PUBLIC, icon);
  if (existsSync(from) && (!existsSync(to) || !readFileSync(to).equals(readFileSync(from)))) {
    copyFileSync(from, to);
    changed.push(`admin/public/${icon}`);
  }
}

// 3. theme.css
const themeFile = path.join(PUBLIC, 'theme.css');
let css = readFileSync(themeFile, 'utf8');
css = fillBlock(css, '/* generated:theme */', '/* /generated:theme */', theme, 'theme.css');
css = fillBlock(css, '/* generated:fonts */', '/* /generated:fonts */', fonts, 'theme.css');
write(themeFile, css);

// 4. apps.json, with the API URL substituted when given.
const appsFile = path.join(PUBLIC, 'apps.json');
const apps = JSON.parse(readFileSync(appsFile, 'utf8'));
if (apiUrl) {
  const me = apps.find((a) => a.slug === 'csarko.sh');
  if (!me) throw new Error('apps.json has no csarko.sh entry');
  me.api = apiUrl.replace(/\/$/, '');
  write(appsFile, `[\n${apps.map((a) => `  ${JSON.stringify(a).replace(/","/g, '", "').replace(/":"/g, '": "').replace(/\{"/, '{ "').replace(/"\}/, '" }')}`).join(',\n')}\n]\n`);
}

// 5. The pages: the Inter preload and the nav.
const inter = fontFiles.find((f) => f.startsWith('inter-'));
const preload = inter ? `  <link rel="preload" href="/assets/${inter}" as="font" type="font/woff2" crossorigin />` : '';
for (const page of PAGES) {
  const file = path.join(PUBLIC, page);
  const route = page === 'index.html' ? '/' : `/${path.dirname(page)}/`;
  let html = readFileSync(file, 'utf8');
  html = fillBlock(html, '<!-- generated:head -->', '<!-- /generated:head -->', preload, page).replace('<!-- /generated:head -->', '  <!-- /generated:head -->');
  const nav = apps.map((a) => `        <li><a href="${a.page}"${a.page === route ? ' aria-current="page"' : ''}>${a.name.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])}</a></li>`).join('\n');
  html = fillBlock(html, '<!-- generated:nav -->', '<!-- /generated:nav -->', nav, page).replace('<!-- /generated:nav -->', '        <!-- /generated:nav -->');
  write(file, html);
}

console.log(changed.length ? `admin: updated ${changed.join(', ')}` : 'admin: up to date');
