#!/usr/bin/env node
/**
 * build.mjs: build apps.csarko.sh into apps/public/. Node 22, no dependencies.
 *
 *   node apps/build.mjs
 *   node apps/build.mjs --local lib-visits=~/Projects/lib-visits   an app's README and images from a
 *                                    checkout instead of GitHub, to look before pushing (repeatable)
 *
 * For each app in docs/apps/ whose page is on apps.csarko.sh it fetches, from GitHub, the README
 * and its images on the default branch and the latest release, and writes
 * apps/public/<slug>/index.html (apps/product.mjs, in the store's look of apps/store.mjs) with the
 * images beside it, each made a WebP (Pillow, as build_assets.py uses: a README's PNGs run to a
 * megabyte), and og.jpg, the share card, made from the hero. Around the pages:
 *   assets/*.woff2                the store's fonts from apps/fonts/, content-hashed, and the
 *                                 site's own for the 404 page, copied from public/assets/
 *   assets/visits.*.js, vitals.*.js  the site's hashed lib-visits scripts (public/assets/), so a
 *                                 visit here joins the one on csarko.sh (same daily visit id);
 *                                 the beacon goes to this host's /v, a Hosting rewrite
 *   licenses/fonts-OFL.txt        the store fonts' licence (apps/fonts/OFL.txt)
 *   favicon.*, apple-touch-icon   the site's icons
 *   robots.txt, sitemap.xml       this host's own, listing the app pages
 * The page's generated:fonts and generated:head blocks are filled with the store fonts' faces and
 * preload. "/" is not a page: firebase.json redirects it to https://csarko.sh/projects.
 * A new release of an app reaches its buttons when this runs again (apps/deploy.sh).
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APPS_DIR, APPS_HOST, loadApp } from '../.agents/skills/site-quality/scripts/docs_lib.mjs';
import { imagesOf, prepareReadme, productPage } from './product.mjs';
import { fontBlocks, motionTokens, STORE_FONTS } from './store.mjs';

const APPS = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(APPS, '..');
const SITE_PUBLIC = path.join(ROOT, 'public');
const OUT = path.join(APPS, 'public');

// --local <slug>=<dir>: that app's README and images come from the checkout (the release still
// comes from GitHub). For a preview only; apps/deploy.sh never passes it.
const local = new Map();
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] !== '--local' || !/^[a-z0-9-]+=.+/.test(process.argv[i + 1] ?? '')) throw new Error('usage: node apps/build.mjs [--local <slug>=<dir>]...');
  const [slug, dir] = process.argv[++i].split(/=(.*)/);
  local.set(slug, path.resolve(dir.replace(/^~(?=\/)/, process.env.HOME)));
}

async function github(pathname, { raw = false } = {}) {
  const url = raw ? pathname : `https://api.github.com/${pathname}`;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: raw ? {} : { Accept: 'application/vnd.github+json' } }).catch((e) => e);
    if (res instanceof Response && res.ok) return raw ? Buffer.from(await res.arrayBuffer()) : res.json();
    if (attempt >= 3) throw new Error(`${url}: ${res instanceof Response ? res.status : res.message}`);
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
}

// An image as a WebP beside the page; prints and returns its width and height.
const WEBP = `import sys, json
from PIL import Image
im = Image.open(sys.argv[1])
im = im.convert("RGBA" if im.mode in ("RGBA", "LA", "P") else "RGB")
im.save(sys.argv[2], "WEBP", quality=88, method=6)
print(json.dumps({"width": im.width, "height": im.height}))`;
const toWebp = (src, dest) => JSON.parse(execFileSync('python3', ['-I', '-c', WEBP, src, dest], { encoding: 'utf8' }));

// The share card: the hero laid on the page's cream, 1200 by 630.
const OG = `import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert("RGBA")
im.thumbnail((1104, 534), Image.LANCZOS)
card = Image.new("RGB", (1200, 630), (0xf5, 0xf2, 0xeb))
card.paste(im, ((1200 - im.width) // 2, (630 - im.height) // 2), im)
card.save(sys.argv[2], "JPEG", quality=86, optimize=True, progressive=True)`;

const indexHtml = readFileSync(path.join(SITE_PUBLIC, 'index.html'), 'utf8');
const motion = motionTokens(indexHtml);
// The site's own fonts, for the 404 page copied below, which is the site's.
const siteFonts = /\/\* generated:fonts \*\/\n([\s\S]*?)\n\s*\/\* \/generated:fonts \*\//.exec(readFileSync(path.join(SITE_PUBLIC, '404.html'), 'utf8'));
const siteFontFiles = siteFonts ? [...siteFonts[1].matchAll(/url\("\/?assets\/([^"]+)"\)/g)].map((m) => m[1]) : [];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(path.join(OUT, 'assets'), { recursive: true });
mkdirSync(path.join(OUT, 'licenses'), { recursive: true });
for (const f of siteFontFiles) copyFileSync(path.join(SITE_PUBLIC, 'assets', f), path.join(OUT, 'assets', f));
// The store's fonts, content-hashed like the site's (build_assets.py write_hashed), so /assets/
// can be cached for a year.
const storeFonts = {};
for (const stem of Object.keys(STORE_FONTS)) {
  const data = readFileSync(path.join(APPS, 'fonts', `${stem}.woff2`));
  storeFonts[stem] = `${stem}.${createHash('sha256').update(data).digest('hex').slice(0, 8)}.woff2`;
  writeFileSync(path.join(OUT, 'assets', storeFonts[stem]), data);
}
copyFileSync(path.join(APPS, 'fonts', 'OFL.txt'), path.join(OUT, 'licenses', 'fonts-OFL.txt'));
const { faces, preloads } = fontBlocks(storeFonts);
// lib-visits, the same hashed files csarko.sh serves (check.py has held them to the vendored
// bytes): the page counts here as it does there, and a visit spans the two hosts.
const siteAssets = readdirSync(path.join(SITE_PUBLIC, 'assets'));
const visitsJs = siteAssets.find((f) => /^visits\.[0-9a-f]{8}\.js$/.test(f));
const vitalsJs = siteAssets.find((f) => /^vitals\.[0-9a-f]{8}\.js$/.test(f));
if (!visitsJs || !vitalsJs) throw new Error('public/assets has no hashed visits.js and vitals.js (run generate-assets.sh)');
for (const f of [visitsJs, vitalsJs]) copyFileSync(path.join(SITE_PUBLIC, 'assets', f), path.join(OUT, 'assets', f));
const analytics = `  <script defer src="/assets/${visitsJs}" data-visits="/v"></script>\n  <script defer src="/assets/${vitalsJs}"></script>\n`;
for (const icon of ['favicon.ico', 'favicon.svg', 'favicon-96x96.png', 'apple-touch-icon.png']) {
  copyFileSync(path.join(SITE_PUBLIC, icon), path.join(OUT, icon));
}

// An app's `<slug>.install.md` is its page's install block, read beside it below, not an app.
const sources = readdirSync(path.join(ROOT, 'docs', APPS_DIR)).filter((f) => f.endsWith('.md') && !f.endsWith('.install.md')).sort();
const pages = [];
for (const name of sources) {
  const app = loadApp(name, readFileSync(path.join(ROOT, 'docs', APPS_DIR, name), 'utf8'));
  if (!app.page.startsWith(`${APPS_HOST}/`)) continue;
  if (app.page !== `${APPS_HOST}/${app.slug}`) throw new Error(`docs/${APPS_DIR}/${name}: page must be ${APPS_HOST}/${app.slug}`);
  const repo = /^https:\/\/github\.com\/([^/]+\/[^/]+?)\/?$/.exec(app.repo ?? '')?.[1];
  if (!repo) throw new Error(`docs/${APPS_DIR}/${name}: an app page needs repo: https://github.com/<owner>/<name>`);

  const meta = await github(`repos/${repo}`);
  const branch = meta.default_branch;
  const dirOf = local.get(app.slug);
  const fetchFile = (file) => (dirOf ? readFileSync(path.join(dirOf, file)) : github(`https://raw.githubusercontent.com/${repo}/${branch}/${file}`, { raw: true }));
  const readme = (await fetchFile('README.md')).toString('utf8');
  const latest = await github(`repos/${repo}/releases/latest`);
  const release = {
    tag: latest.tag_name,
    url: latest.html_url,
    published: latest.published_at,
    assets: latest.assets.map((a) => ({ name: a.name, size: a.size, url: a.browser_download_url })),
  };

  // The app's own install block (docs/apps/<slug>.install.md) for a README without one, and the
  // sections its page keeps when the whole README is not the page (its front matter).
  const installFile = path.join(ROOT, 'docs', APPS_DIR, `${app.slug}.install.md`);
  const install = existsSync(installFile) ? readFileSync(installFile, 'utf8') : null;
  const prepared = prepareReadme(readme, { blob: `https://github.com/${repo}/blob/${branch}/`, sections: app.sections ?? null, install });
  const dir = path.join(OUT, app.slug);
  mkdirSync(dir, { recursive: true });
  // Every README image the page shows, as a WebP beside the page.
  const images = {};
  for (const src of imagesOf(prepared, { withHero: !app.heroVideo })) {
    if (!/^[\w./-]+\.(png|jpe?g)$/.test(src) || src.includes('..')) throw new Error(`${repo} README: an image this page cannot copy: ${src}`);
    const tmp = path.join(dir, `.${path.basename(src)}`);
    writeFileSync(tmp, await fetchFile(src));
    const file = `${path.basename(src).replace(/\.(png|jpe?g)$/, '')}.webp`;
    images[src] = { url: `/${app.slug}/${file}`, ...toWebp(tmp, path.join(dir, file)) };
    rmSync(tmp);
  }

  // The app's recording (its front matter): the .mp4 and its .jpg poster copied beside the page.
  let recording = null;
  if (app.recording) {
    const stem = path.basename(app.recording.file, '.mp4');
    writeFileSync(path.join(dir, `${stem}.mp4`), await fetchFile(app.recording.file));
    writeFileSync(path.join(dir, `${stem}.jpg`), await fetchFile(app.recording.file.replace(/\.mp4$/, '.jpg')));
    const size = JSON.parse(execFileSync('python3', ['-I', '-c', 'import sys, json\nfrom PIL import Image\nim = Image.open(sys.argv[1])\nprint(json.dumps({"width": im.width, "height": im.height}))', path.join(dir, `${stem}.jpg`)], { encoding: 'utf8' }));
    recording = { url: `/${app.slug}/${stem}.mp4`, poster: `/${app.slug}/${stem}.jpg`, ...size, under: app.recording.under, alt: app.recording.alt };
  }
  // The share card, from the hero (its copy beside the page); with an opening clip, from its
  // poster below instead.
  let ogImage = null;
  if (prepared.hero && !app.heroVideo) {
    execFileSync('python3', ['-I', '-c', OG, path.join(dir, path.basename(images[prepared.hero.light].url)), path.join(dir, 'og.jpg')]);
    ogImage = { url: `${APPS_HOST}/${app.slug}/og.jpg`, width: 1200, height: 630, alt: prepared.hero.alt };
  }
  // The opening clip (its front matter): the .mp4 and its .jpg poster beside the page; the
  // poster, the key art, is then the share card.
  let heroVideo = null;
  if (app.heroVideo) {
    const stem = path.basename(app.heroVideo.file, '.mp4');
    writeFileSync(path.join(dir, `${stem}.mp4`), await fetchFile(app.heroVideo.file));
    writeFileSync(path.join(dir, `${stem}.jpg`), await fetchFile(app.heroVideo.file.replace(/\.mp4$/, '.jpg')));
    const size = JSON.parse(execFileSync('python3', ['-I', '-c', 'import sys, json\nfrom PIL import Image\nim = Image.open(sys.argv[1])\nprint(json.dumps({"width": im.width, "height": im.height}))', path.join(dir, `${stem}.jpg`)], { encoding: 'utf8' }));
    heroVideo = { url: `/${app.slug}/${stem}.mp4`, poster: `/${app.slug}/${stem}.jpg`, ...size, alt: app.heroVideo.alt };
    execFileSync('python3', ['-I', '-c', OG, path.join(dir, `${stem}.jpg`), path.join(dir, 'og.jpg')]);
    ogImage = { url: `${APPS_HOST}/${app.slug}/og.jpg`, width: 1200, height: 630, alt: app.heroVideo.alt };
  }
  let html = productPage({ app, prepared, release, images, motion, recording, ogImage, heroVideo, analytics });
  html = html.replace(/\/\* generated:fonts \*\/\n\s*\/\* \/generated:fonts \*\//,
    `/* generated:fonts */\n${faces}\n    /* /generated:fonts */`);
  html = html.replace(/<!-- generated:head -->\n\s*<!-- \/generated:head -->/,
    `<!-- generated:head -->\n${preloads}\n  <!-- /generated:head -->`);
  if (!html.includes(preloads) || !html.includes('@font-face')) throw new Error('the page lacks its generated blocks');
  writeFileSync(path.join(dir, 'index.html'), html);
  pages.push(`${APPS_HOST}/${app.slug}`);
  console.log(`apps: ${app.slug} from ${dirOf ?? `${repo}@${branch}`}, release ${release.tag} (${release.assets.length} assets)`);
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
