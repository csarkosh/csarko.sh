#!/usr/bin/env node
/**
 * build.mjs: build donate.csarko.sh into donate/public/. Node 22, no dependencies; Pillow for the
 * pictures (donate/pictures.py).
 *
 *   node donate/build.mjs                        the prices from the bucket (PRICES_URL); fails
 *                                                until the monthly step has written them
 *   node donate/build.mjs --prices <file>        the prices from a file, to look before they exist:
 *                                                --prices donate/test/fixtures/prices.json
 *
 * Tests: node --test donate/test/*.test.mjs
 *
 * One page per shipped door (DOORS in admin/api/src/donate/doors.mjs): index.html for the bare
 * door and <door>/index.html for the others (donate/page.mjs), each with this month's prices baked
 * in as its fallback and its picture beside it in assets/ (pictures.py: 16:9, AVIF, WebP and JPEG
 * at 640 and 1280 wide, hashed). Around the pages:
 *   thanks/index.html             where Stripe sends a payer back, every door's line and link
 *   app.js, view.js               the pages' one script and the logic it shares with this build
 *   icon.svg                      the Buy Me Tokens icon, for READMEs to embed as an <img>
 *   assets/*.woff2                the site's hashed font files, copied from public/assets/
 *   favicon.*, apple-touch-icon   the site's icons
 *   404.html                      the site's not-found page, its links made absolute
 *   robots.txt, sitemap.xml       this host's own, listing the door pages
 * A shipped door fails the build, by name, when the prices carry no links for it, when its
 * picture is missing, or when its picture is a portrait without a focus; a door the prices carry
 * that is not shipped is skipped.
 */

import { execFile } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { DONATE_URL, PRICES_URL, TIER_KEYS, TIERS, shippedDoors } from '../admin/api/src/donate/doors.mjs';
import { themeBlocks } from '../.agents/skills/site-quality/scripts/docs_lib.mjs';
import { iconSvg } from './icon.mjs';
import { doorPage, thanksPage } from './page.mjs';

const DONATE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DONATE, '..');
const SITE_PUBLIC = path.join(ROOT, 'public');
const ASSETS = path.join(ROOT, '.agents/skills/site-quality/assets');
const OUT = path.join(DONATE, 'public');

class BuildError extends Error {}
const fail = (message) => { throw new BuildError(`donate: ${message}`); };

function args(argv) {
  const out = { prices: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--prices' && argv[i + 1]) out.prices = path.resolve(argv[++i]);
    else fail('usage: node donate/build.mjs [--prices <file>]');
  }
  return out;
}

async function loadPrices(file) {
  if (file) return JSON.parse(readFileSync(file, 'utf8'));
  const res = await fetch(PRICES_URL, { cache: 'no-cache' });
  if (res.status === 404) fail('no prices.json yet; the step has not run. Preview with --prices donate/test/fixtures/prices.json');
  if (!res.ok) fail(`${PRICES_URL}: ${res.status}`);
  return res.json();
}

function checkPrices(json) {
  if (typeof json?.month !== 'string' || !/^\d{4}-\d{2}$/.test(json.month)) fail('prices.json: no month');
  if (!Number.isFinite(json.pool)) fail('prices.json: no pool');
  for (const t of TIERS) {
    if (!Number.isFinite(json.tiers?.find((x) => x.tier === t.key)?.usd)) fail(`prices.json: no price for the ${t.key} tier`);
  }
  if (typeof json.doors !== 'object' || json.doors === null) fail('prices.json: no doors');
}

/** A door's prices in the page's shape: its own five link URLs, no Stripe ids. */
function doorPrices(json, door) {
  const links = {};
  for (const key of TIER_KEYS) {
    const url = json.doors[door]?.links?.[key]?.url;
    if (typeof url !== 'string' || !url.startsWith('https://')) fail(`${door}: prices.json has no ${key} link`);
    links[key] = url;
  }
  return { month: json.month, pool: json.pool, tiers: json.tiers.map(({ tier, usd, label }) => ({ tier, usd, label })), links };
}

/** A project's own alt text, from its docs/apps or docs/films front matter, when it has one. */
function altOf(slug) {
  for (const dir of ['apps', 'films']) {
    const file = path.join(ROOT, 'docs', dir, `${slug}.md`);
    if (!existsSync(file)) continue;
    const front = /^---\n([\s\S]*?)\n---/.exec(readFileSync(file, 'utf8'))?.[1] ?? '';
    const alt = /^alt:\s*(.+)$/m.exec(front)?.[1]?.trim().replace(/^(["'])(.*)\1$/, '$2');
    if (alt) return alt;
  }
  return '';
}

/** A door's picture files on disk, checked before anything is written. */
function sourcesOf(door) {
  if (!door.picture) fail(`${door.door}: a shipped door needs a picture`);
  const files = { source: path.join(ASSETS, door.picture.source), dark: door.picture.dark ? path.join(ASSETS, door.picture.dark) : null };
  for (const file of Object.values(files)) {
    if (file && !existsSync(file)) fail(`${door.door}: no picture at ${path.relative(ROOT, file)}`);
  }
  return files;
}

const run = promisify(execFile);
async function pictureOf(door, { source, dark }) {
  const argv = ['-I', path.join(DONATE, 'pictures.py'), '--source', source, '--out', path.join(OUT, 'assets'), '--stem', door.door];
  if (dark) argv.push('--dark', dark);
  if (door.picture.focusY !== undefined) argv.push('--focus-y', String(door.picture.focusY));
  let stdout;
  try {
    ({ stdout } = await run('python3', argv, { encoding: 'utf8' }));
  } catch (e) {
    fail(`${door.door}: ${(e.stderr || e.message).trim().replace(/^pictures\.py: /, '')}`);
  }
  const picture = JSON.parse(stdout);
  for (const set of Object.values(picture.sets)) {
    for (const fmt of Object.keys(set)) set[fmt] = set[fmt].map((entry) => `/assets/${entry}`);
  }
  return { ...picture, alt: door.slug ? altOf(door.slug) : '' };
}

// The site's theme, fonts and head, filled the way apps/build.mjs fills an app page's.
function siteHead() {
  const indexHtml = readFileSync(path.join(SITE_PUBLIC, 'index.html'), 'utf8');
  const fontsMatch = /\/\* generated:fonts \*\/\n([\s\S]*?)\n\s*\/\* \/generated:fonts \*\//.exec(indexHtml);
  if (!fontsMatch) fail('public/index.html: generated:fonts block not found');
  const fonts = fontsMatch[1].replace(/url\("assets\//g, 'url("/assets/');
  const fontFiles = [...fonts.matchAll(/url\("\/assets\/([^"]+)"\)/g)].map((m) => m[1]);
  const inter = fontFiles.find((f) => f.startsWith('inter-'));
  const fill = (html) => {
    const out = html
      .replace(/\/\* generated:fonts \*\/\n\s*\/\* \/generated:fonts \*\//, `/* generated:fonts */\n${fonts}\n    /* /generated:fonts */`)
      .replace(/<!-- generated:head -->\n\s*<!-- \/generated:head -->/,
        `<!-- generated:head -->\n  <link rel="preload" href="/assets/${inter}" as="font" type="font/woff2" crossorigin />\n  <!-- /generated:head -->`);
    if (!out.includes(`/assets/${inter}" as="font"`) || !out.includes('@font-face')) fail('a page lacks its generated blocks');
    return out;
  };
  return { theme: themeBlocks(indexHtml), fontFiles, fill };
}

async function main() {
  const opts = args(process.argv.slice(2));
  const { theme, fontFiles, fill } = siteHead();
  const json = await loadPrices(opts.prices);
  checkPrices(json);

  const doors = shippedDoors();
  const shipped = new Set(doors.map((d) => d.door));
  for (const key of Object.keys(json.doors)) {
    if (!shipped.has(key)) console.log(`donate: ${key} has links but is not shipped; skipped`);
  }
  for (const door of doors) {
    if (!json.doors[door.door]) fail(`no links for ${door.door} yet; the next snapshot adds them`);
  }
  const prices = new Map(doors.map((d) => [d.door, doorPrices(json, d.door)]));
  const sources = doors.map(sourcesOf);

  // The app's script must fetch the same object the build read.
  const app = readFileSync(path.join(DONATE, 'public-src', 'app.js'), 'utf8');
  if (!app.includes(`'${PRICES_URL}'`)) fail(`public-src/app.js does not fetch ${PRICES_URL}`);

  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(path.join(OUT, 'assets'), { recursive: true });
  for (const f of fontFiles) copyFileSync(path.join(SITE_PUBLIC, 'assets', f), path.join(OUT, 'assets', f));
  for (const icon of ['favicon.ico', 'favicon.svg', 'favicon-96x96.png', 'apple-touch-icon.png']) {
    copyFileSync(path.join(SITE_PUBLIC, icon), path.join(OUT, icon));
  }

  // A portrait without a focus fails here, by door, once every picture has finished.
  const made = await Promise.allSettled(doors.map((door, i) => pictureOf(door, sources[i])));
  const failed = made.find((r) => r.status === 'rejected');
  if (failed) throw failed.reason;
  const pictures = made.map((r) => r.value);
  doors.forEach((door, i) => {
    const html = fill(doorPage({ door, prices: prices.get(door.door), picture: pictures[i], theme }));
    const dir = door.door === 'all' ? OUT : path.join(OUT, door.door);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'index.html'), html);
    console.log(`donate: ${door.path} (${door.name})`);
  });

  const thanks = Object.fromEntries(doors.map((d) => [d.door, { back: d.back, thanks: d.thanks }]));
  mkdirSync(path.join(OUT, 'thanks'), { recursive: true });
  writeFileSync(path.join(OUT, 'thanks', 'index.html'), fill(thanksPage({ theme, doors: thanks })));

  writeFileSync(path.join(OUT, 'app.js'), app);
  copyFileSync(path.join(DONATE, 'view.mjs'), path.join(OUT, 'view.js'));
  // A standalone SVG renders as an image only with its namespace.
  const svg = iconSvg().replace(/ class="[^"]*"/, '').replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
  writeFileSync(path.join(OUT, 'icon.svg'), `<?xml version="1.0" encoding="UTF-8"?>\n${svg}\n`);

  const urls = doors.map((d) => `${DONATE_URL}${d.path}`);
  writeFileSync(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${DONATE_URL}/sitemap.xml\n`);
  writeFileSync(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url>\n    <loc>${u}</loc>\n  </url>`).join('\n')}\n</urlset>\n`);
  // The site's 404 page, so a wrong path here looks like one on csarko.sh; its links are made absolute.
  if (existsSync(path.join(SITE_PUBLIC, '404.html'))) {
    // Its analytics tags go: this host serves neither the scripts nor the /v beacon route.
    const notFound = readFileSync(path.join(SITE_PUBLIC, '404.html'), 'utf8')
      .replace(/(<!-- generated:analytics -->)[\s\S]*?(\s*<!-- \/generated:analytics -->)/, '$1$2')
      .replace(/href="\/(?!assets\/|favicon|apple-touch)/g, 'href="https://csarko.sh/');
    if (/<script\b(?![^>]*application\/ld\+json)/.test(notFound)) fail('404.html: a script survived the copy');
    writeFileSync(path.join(OUT, '404.html'), notFound);
  }
  console.log(`donate: ${doors.length} door(s), ${json.month} prices → donate/public/`);
}

main().catch((e) => {
  console.error(e instanceof BuildError ? e.message : e);
  process.exit(1);
});
