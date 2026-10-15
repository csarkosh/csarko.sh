#!/usr/bin/env node
/**
 * build.mjs: build apps.csarko.sh into apps/public/. Node 22, no dependencies.
 *
 *   node apps/build.mjs
 *
 * For each app in docs/apps/ whose page is on apps.csarko.sh it fetches, from GitHub, the README
 * and its images on the default branch and the latest release, and writes
 * apps/public/<slug>/index.html (apps/product.mjs) with the images beside it. Around the pages:
 *   assets/*.woff2                the site's hashed font files, copied from public/assets/
 *   favicon.*, apple-touch-icon   the site's icons
 *   robots.txt, sitemap.xml       this host's own, listing the app pages
 * The page's generated:fonts and generated:head blocks are filled the way build_assets.py fills a
 * csarko.sh page's. "/" is not a page: firebase.json redirects it to https://csarko.sh/apps.
 * A new release of an app reaches its buttons when this runs again (apps/deploy.sh).
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APPS_DIR, APPS_HOST, loadApp, themeBlocks } from '../.agents/skills/site-quality/scripts/docs_lib.mjs';
import { productPage } from './product.mjs';

const APPS = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(APPS, '..');
const SITE_PUBLIC = path.join(ROOT, 'public');
const OUT = path.join(APPS, 'public');

async function github(pathname, { raw = false } = {}) {
  const url = raw ? pathname : `https://api.github.com/${pathname}`;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: raw ? {} : { Accept: 'application/vnd.github+json' } }).catch((e) => e);
    if (res instanceof Response && res.ok) return raw ? Buffer.from(await res.arrayBuffer()) : res.json();
    if (attempt >= 3) throw new Error(`${url}: ${res instanceof Response ? res.status : res.message}`);
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
}

// PNG width and height, from the IHDR chunk, for the <img> attributes.
const pngSize = (buf) => ({ width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) });

const indexHtml = readFileSync(path.join(SITE_PUBLIC, 'index.html'), 'utf8');
const theme = themeBlocks(indexHtml);
const fontsMatch = /\/\* generated:fonts \*\/\n([\s\S]*?)\n\s*\/\* \/generated:fonts \*\//.exec(indexHtml);
if (!fontsMatch) throw new Error('public/index.html: generated:fonts block not found');
const fonts = fontsMatch[1].replace(/url\("assets\//g, 'url("/assets/');
const fontFiles = [...fonts.matchAll(/url\("\/assets\/([^"]+)"\)/g)].map((m) => m[1]);
const inter = fontFiles.find((f) => f.startsWith('inter-'));

rmSync(OUT, { recursive: true, force: true });
mkdirSync(path.join(OUT, 'assets'), { recursive: true });
for (const f of fontFiles) copyFileSync(path.join(SITE_PUBLIC, 'assets', f), path.join(OUT, 'assets', f));
for (const icon of ['favicon.ico', 'favicon.svg', 'favicon-96x96.png', 'apple-touch-icon.png']) {
  copyFileSync(path.join(SITE_PUBLIC, icon), path.join(OUT, icon));
}

const sources = readdirSync(path.join(ROOT, 'docs', APPS_DIR)).filter((f) => f.endsWith('.md')).sort();
const pages = [];
for (const name of sources) {
  const app = loadApp(name, readFileSync(path.join(ROOT, 'docs', APPS_DIR, name), 'utf8'));
  if (!app.page.startsWith(`${APPS_HOST}/`)) continue;
  if (app.page !== `${APPS_HOST}/${app.slug}`) throw new Error(`docs/${APPS_DIR}/${name}: page must be ${APPS_HOST}/${app.slug}`);
  const repo = /^https:\/\/github\.com\/([^/]+\/[^/]+?)\/?$/.exec(app.repo ?? '')?.[1];
  if (!repo) throw new Error(`docs/${APPS_DIR}/${name}: an app page needs repo: https://github.com/<owner>/<name>`);

  const meta = await github(`repos/${repo}`);
  const branch = meta.default_branch;
  const readme = (await github(`https://raw.githubusercontent.com/${repo}/${branch}/README.md`, { raw: true })).toString('utf8');
  const latest = await github(`repos/${repo}/releases/latest`);
  const release = {
    tag: latest.tag_name,
    url: latest.html_url,
    published: latest.published_at,
    assets: latest.assets.map((a) => ({ name: a.name, size: a.size, url: a.browser_download_url })),
  };

  const dir = path.join(OUT, app.slug);
  mkdirSync(dir, { recursive: true });
  // The README's picture names a light and a dark image; both are copied beside the page.
  const srcs = [...readme.matchAll(/(?:srcset|src)="(docs\/images\/[^"]+\.png)"/g)].map((m) => m[1]);
  const light = srcs.find((s) => /light/.test(s));
  const dark = srcs.find((s) => /dark/.test(s));
  if (!light || !dark) throw new Error(`${repo} README: the picture needs a light and a dark docs/images/*.png`);
  const images = {};
  for (const [key, src] of [['light', light], ['dark', dark]]) {
    const buf = await github(`https://raw.githubusercontent.com/${repo}/${branch}/${src}`, { raw: true });
    writeFileSync(path.join(dir, path.basename(src)), buf);
    images[key] = `/${app.slug}/${path.basename(src)}`;
    Object.assign(images, key === 'light' ? pngSize(buf) : {});
  }

  let html = productPage({ app, readme, release, images, theme });
  html = html.replace(/\/\* generated:fonts \*\/\n\s*\/\* \/generated:fonts \*\//,
    `/* generated:fonts */\n${fonts}\n    /* /generated:fonts */`);
  html = html.replace(/<!-- generated:head -->\n\s*<!-- \/generated:head -->/,
    `<!-- generated:head -->\n  <link rel="preload" href="/assets/${inter}" as="font" type="font/woff2" crossorigin />\n  <!-- /generated:head -->`);
  if (!html.includes(`/assets/${inter}" as="font"`) || !html.includes('@font-face')) throw new Error('the page lacks its generated blocks');
  writeFileSync(path.join(dir, 'index.html'), html);
  pages.push(`${APPS_HOST}/${app.slug}`);
  console.log(`apps: ${app.slug} from ${repo}@${branch}, release ${release.tag} (${release.assets.length} assets)`);
}
if (!pages.length) throw new Error(`no app in docs/${APPS_DIR}/ has a page on ${APPS_HOST}`);

writeFileSync(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${APPS_HOST}/sitemap.xml\n`);
writeFileSync(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map((u) => `  <url>\n    <loc>${u}</loc>\n  </url>`).join('\n')}\n</urlset>\n`);
// The site's 404 page, so a wrong path here looks like one on csarko.sh; its links are made absolute.
if (existsSync(path.join(SITE_PUBLIC, '404.html'))) {
  // Its analytics tags go: this host serves neither the scripts nor the /v beacon route.
  const notFound = readFileSync(path.join(SITE_PUBLIC, '404.html'), 'utf8')
    .replace(/(<!-- generated:analytics -->)[\s\S]*?(\s*<!-- \/generated:analytics -->)/, '$1$2')
    .replace(/href="\/(?!assets\/|favicon|apple-touch)/g, 'href="https://csarko.sh/');
  if (/<script\b(?![^>]*application\/ld\+json)/.test(notFound)) throw new Error('404.html: a script survived the copy');
  writeFileSync(path.join(OUT, '404.html'), notFound);
}
console.log(`apps: ${pages.length} page(s) → apps/public/`);
