#!/usr/bin/env node
/**
 * build.mjs: make the admin pages csarko.sh pages (spec 2.8). Deterministic; Node 22; no
 * dependencies. Same inputs, same outputs, so running it twice changes nothing.
 *
 *   node admin/build.mjs [--api <url>] [--api-key <web api key>] [--vendor]
 *
 * It fills the generated blocks under admin/public/:
 *   theme.css          generated:theme   the two token blocks of public/index.html, exactly as
 *                                        docs_lib.mjs's themeBlocks() copies them for a doc page
 *                      generated:fonts   the site's @font-face rules (Inter, JetBrains Mono and
 *                                        their metric-matched fallbacks), root-relative
 *   assets/*.woff2                       the hashed font files those rules name, copied from
 *                                        public/assets/ (stale ones removed)
 *   favicon.ico, favicon.svg             the site's icons
 *   index.html, csarko.sh/index.html, ide-arkos/index.html, finance/index.html
 *                      generated:head    the Inter preload with the current hash
 *                      generated:nav     one link per app in apps.json, aria-current on its page
 *   apps.json                            with --api <url> or ADMIN_API_URL set, the csarko.sh
 *                                        entry's "api" is replaced (the Cloud Run URL is not
 *                                        known until Terraform creates it; the placeholder is
 *                                        https://ADMIN_API_URL_TBD), and Arkos's and Finance's
 *                                        become that URL under /arkos and /finance
 *   vendor/firebase-auth.<hash>.js       the Firebase Auth SDK, bundled from admin/vendor/
 *                                        firebase-auth.js with esbuild (the only step with a
 *                                        dependency: `npm install` in admin/ first). Rebuilt
 *                                        when admin/node_modules is present and the output is
 *                                        missing, older than package-lock.json or the entry, or
 *                                        --vendor is given; stale hashed copies are removed. Without
 *                                        node_modules the committed bundle is used as it is.
 *   auth.js            generated:vendor  the bundle's hashed path, which auth.js imports lazily
 *   auth-config.json                     { apiKey, authDomain, projectId } for Firebase Auth, the
 *                                        key from --api-key or ADMIN_FIREBASE_API_KEY. A web API
 *                                        key is public by design, so the file is committed; with
 *                                        no key given an existing file is left alone (a local
 *                                        build does not blank it) and a missing one is written
 *                                        with apiKey null, which auth.js reads as "no sign-in".
 */

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { themeBlocks } from '../.agents/skills/site-quality/scripts/docs_lib.mjs';

const ADMIN = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(ADMIN, '..');
const SITE_PUBLIC = path.join(ROOT, 'public');
const PUBLIC = path.join(ADMIN, 'public');
// The host's own pages, and each app's page when its bundle has been pulled
// (admin/deploy.sh pulls Day Hike's before building): an app's page carries
// the same chrome with the same generated blocks, filled here.
const PAGES = ['index.html', path.join('csarko.sh', 'index.html'), path.join('ide-arkos', 'index.html'), path.join('finance', 'index.html'), path.join('game-dayhike', 'index.html')]
  .filter((page) => page !== path.join('game-dayhike', 'index.html') || existsSync(path.join(ADMIN, 'public', page)));

const argv = process.argv.slice(2);
const apiFlag = argv.indexOf('--api');
const apiUrl = (apiFlag >= 0 ? argv[apiFlag + 1] : process.env.ADMIN_API_URL) || null;
if (apiFlag >= 0 && !apiUrl) throw new Error('--api needs a URL');
const keyFlag = argv.indexOf('--api-key');
const apiKey = (keyFlag >= 0 ? argv[keyFlag + 1] : process.env.ADMIN_FIREBASE_API_KEY) || null;
if (keyFlag >= 0 && !apiKey) throw new Error('--api-key needs a key');
const forceVendor = argv.includes('--vendor');

/** Firebase Auth lives in the site's own project; only the web API key varies per build. */
const AUTH_DOMAIN = 'admin.csarko.sh';
const PROJECT_ID = 'csarko-sh';

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
  // Arkos IDE and Finance are served by the same service, under /arkos and /finance.
  const arkos = apps.find((a) => a.slug === 'ide-arkos');
  if (arkos) arkos.api = `${me.api}/arkos`;
  const finance = apps.find((a) => a.slug === 'finance');
  if (finance) finance.api = `${me.api}/finance`;
  write(appsFile, `[\n${apps.map((a) => `  ${JSON.stringify(a).replace(/","/g, '", "').replace(/":"/g, '": "').replace(/\{"/, '{ "').replace(/"\}/, '" }')}`).join(',\n')}\n]\n`);
}

// 5. The pages: the Inter preload. (The nav carried one link per app until 2026-10-13;
//    now it holds the account menu, and the trail under it is the way back to the index.)
const inter = fontFiles.find((f) => f.startsWith('inter-'));
const preload = inter ? `  <link rel="preload" href="/assets/${inter}" as="font" type="font/woff2" crossorigin />` : '';
for (const page of PAGES) {
  const file = path.join(PUBLIC, page);
  let html = readFileSync(file, 'utf8');
  if (page.startsWith('game-dayhike') && !html.includes('<!-- generated:head -->')) {
    // A bundle published before the page carried the host's chrome: served as it is.
    console.warn(`admin: ${page} has no generated blocks (an older bundle); publish the game's admin page again to give it the host's chrome`);
    continue;
  }
  html = fillBlock(html, '<!-- generated:head -->', '<!-- /generated:head -->', preload, page).replace('<!-- /generated:head -->', '  <!-- /generated:head -->');
  write(file, html);
}

// 6. The Firebase Auth SDK, self-hosted: bundle it when the tooling is installed and the
//    output is missing or behind the lockfile or the entry, then point auth.js at the hash.
const VENDOR_DIR = path.join(PUBLIC, 'vendor');
const VENDOR_ENTRY = path.join(ADMIN, 'vendor', 'firebase-auth.js');
const VENDOR_RE = /^firebase-auth\.[0-9a-f]{8}\.js$/;
const mtime = (file) => (existsSync(file) ? statSync(file).mtimeMs : 0);
mkdirSync(VENDOR_DIR, { recursive: true });
let bundles = readdirSync(VENDOR_DIR).filter((name) => VENDOR_RE.test(name)).sort();
const sources = Math.max(mtime(path.join(ADMIN, 'package-lock.json')), mtime(VENDOR_ENTRY));
const stale = forceVendor || bundles.length === 0 || bundles.some((name) => mtime(path.join(VENDOR_DIR, name)) < sources);
if (stale) {
  if (existsSync(path.join(ADMIN, 'node_modules', 'esbuild')) && existsSync(path.join(ADMIN, 'node_modules', '@firebase', 'auth'))) {
    const esbuild = await import('esbuild');
    const result = await esbuild.build({
      entryPoints: [VENDOR_ENTRY],
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2022',
      minify: true,
      legalComments: 'none',
      write: false,
      logLevel: 'silent',
    });
    const code = result.outputFiles[0].text;
    const hash = createHash('sha256').update(code).digest('hex').slice(0, 8);
    const name = `firebase-auth.${hash}.js`;
    const file = path.join(VENDOR_DIR, name);
    if (existsSync(file) && readFileSync(file, 'utf8') === code) {
      utimesSync(file, new Date(), new Date()); // same bytes: only mark it current
    } else {
      writeFileSync(file, code);
      changed.push(`admin/public/vendor/${name}`);
    }
    for (const old of bundles) {
      if (old !== name) {
        unlinkSync(path.join(VENDOR_DIR, old));
        changed.push(`admin/public/vendor/${old} (removed)`);
      }
    }
    bundles = [name];
  } else if (bundles.length === 0) {
    throw new Error('admin/public/vendor has no firebase-auth bundle and admin/node_modules is missing: run `npm install` in admin/ and build again');
  } else {
    console.warn('admin: vendor bundle may be behind package-lock.json; `npm install` in admin/ to rebuild it');
  }
}
if (bundles.length !== 1) throw new Error(`admin/public/vendor should hold one firebase-auth bundle, found ${bundles.length}`);
const authFile = path.join(PUBLIC, 'auth.js');
write(authFile, fillBlock(readFileSync(authFile, 'utf8'), '// generated:vendor', '// /generated:vendor', `const VENDOR = '/vendor/${bundles[0]}';`, 'auth.js'));

// 7. auth-config.json: the Firebase Auth config, the key from the flag or env.
const configFile = path.join(PUBLIC, 'auth-config.json');
if (apiKey || !existsSync(configFile)) {
  write(configFile, `${JSON.stringify({ apiKey, authDomain: AUTH_DOMAIN, projectId: PROJECT_ID }, null, 2)}\n`);
}

console.log(changed.length ? `admin: updated ${changed.join(', ')}` : 'admin: up to date');
