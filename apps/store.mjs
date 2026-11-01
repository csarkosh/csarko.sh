/**
 * store.mjs: the shell every apps.csarko.sh page wears, in the Google Store's look rather than
 * the portfolio's (Cyrus, 2026-10-31: "a totally separate experience so the user doesn't get the
 * impression that they're on my portfolio site anymore", after store.google.com's Pixel pages).
 * Light only: a warm cream page, white and tinted bands, Google Sans Flex and Google Sans Code
 * (OFL, self-hosted from apps/fonts/), 28px cards, pill buttons and a floating white bar.
 * Nothing here comes from public/index.html except the motion tokens (the site's Material 3
 * motion rule holds on this host too). Pure: apps/product.mjs fills it, apps/build.mjs fills the
 * font slots and writes the files. Design: docs/superpowers/specs/2026-10-31-apps-store-look-design.md.
 */

import { escapeHtml } from '../.agents/skills/site-quality/scripts/docs_lib.mjs';
import { ICON_CSS } from '../donate/icon.mjs';

export class StoreError extends Error {}

// The fonts, by file stem in apps/fonts/: family, weight range, preload. The fallbacks are
// metric-matched (size-adjust from the letter-frequency-weighted advance against the local font,
// ascent and descent from the web font's hhea, computed 2026-10-31 with fontTools) so the swap
// re-wraps nothing.
export const STORE_FONTS = {
  'google-sans-flex-latin-var': { family: 'Google Sans Flex', weights: '300 700', preload: true },
  'google-sans-code-latin-var': { family: 'Google Sans Code', weights: '300 800', preload: false },
};
const FALLBACKS = {
  'Google Sans Flex': ['local("Arial")', '101.84%', '94.86%', '28.08%'],
  'Google Sans Code': ['local("Courier New")', '99.98%', '96.62%', '28.60%'],
};

/** The @font-face rules and the preload links for the hashed files ({ stem: file name }). */
export function fontBlocks(files) {
  const faces = Object.entries(STORE_FONTS).map(([stem, { family, weights }]) => {
    if (!files[stem]) throw new StoreError(`no hashed file for the font ${stem}`);
    return `    @font-face {\n      font-family: "${family}"; font-style: normal; font-weight: ${weights}; font-display: swap;\n      src: url("/assets/${files[stem]}") format("woff2");\n    }`;
  });
  for (const [family, [src, size, ascent, descent]] of Object.entries(FALLBACKS)) {
    faces.push(`    @font-face {\n      font-family: "${family} Fallback"; src: ${src};\n      size-adjust: ${size}; ascent-override: ${ascent}; descent-override: ${descent}; line-gap-override: 0%;\n    }`);
  }
  const preloads = Object.entries(STORE_FONTS).filter(([, f]) => f.preload)
    .map(([stem]) => `  <link rel="preload" href="/assets/${files[stem]}" as="font" type="font/woff2" crossorigin />`);
  return { faces: faces.join('\n'), preloads: preloads.join('\n') };
}

/**
 * The site's motion tokens, out of public/index.html: the --md-* lines of its :root and its
 * reduced-motion block, so a fold or a hover here moves as everywhere else on csarko.sh.
 */
export function motionTokens(indexHtml) {
  const root = /(?<![\w-]):root\s*\{([^}]*)\}/.exec(indexHtml);
  const reduced = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{\s*:root\s*\{[^}]*\}\s*\}/.exec(indexHtml);
  const lines = root ? root[1].match(/--md-[\w-]+:\s*[^;]+;/g) : null;
  if (!lines || !reduced) throw new StoreError('public/index.html: the motion tokens were not found');
  return `:root { ${lines.join(' ')} }\n    ${reduced[0]}`;
}

const jsonLd = (graph) => JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 2).replace(/</g, '\\u003c');

/**
 * The page: head, the floating bar, `main` and the footer. `bar` is { name, action, under }:
 * the app's name and `action` [label, href], the black pill, and nothing else (Cyrus,
 * 2026-11-01: no licence line, no version, no GitHub there); `under` is the HTML of one quiet
 * line set right-aligned beneath the bar, outside it, the page's Buy me tokens. `top` is the
 * title, tagline and hero, drawn above the bar, which floats up over the hero's foot and then
 * sticks. `footer` is [text, links]: the credit line and [label, href] pairs after it.
 */
export function storeShell({ title, ogTitle, description, canonical, ogImage = null, graph, motion = '', top, bar, main, footer, extraCss = '' }) {
  const card = ogImage ? `  <meta property="og:image" content="${ogImage.url}" />
  <meta property="og:image:width" content="${ogImage.width}" />
  <meta property="og:image:height" content="${ogImage.height}" />
  <meta property="og:image:alt" content="${escapeHtml(ogImage.alt)}" />
  <meta name="twitter:image" content="${ogImage.url}" />
  <meta name="twitter:image:alt" content="${escapeHtml(ogImage.alt)}" />
` : '';
  const [credit, footLinks = []] = Array.isArray(footer) ? footer : [footer];
  const foot = footLinks.map(([label, href]) => ` · <a href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(label)}</a>`).join('');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <link rel="canonical" href="${canonical}" />

  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="${escapeHtml(bar.name)}" />
  <meta property="og:locale" content="en_US" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:title" content="${escapeHtml(ogTitle)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
${card}  <meta name="twitter:card" content="${ogImage ? 'summary_large_image' : 'summary'}" />
  <meta name="twitter:title" content="${escapeHtml(ogTitle)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />

  <meta name="color-scheme" content="light" />
  <meta name="theme-color" content="#f5f2eb" />
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
    /* Generated by apps/build.mjs (apps/store.mjs). The fonts are filled in by the build. */
    /* generated:fonts */
    /* /generated:fonts */

    ${motion}
${STORE_CSS}${extraCss}
    ${ICON_CSS}
  </style>
</head>
<body>
  <a class="skip-link" href="#top">Skip to content</a>
${top}
  <div class="bar">
    <div class="bar-inner">
      <a class="bar-name" href="#top">${escapeHtml(bar.name)}</a>
      <a class="pill" href="${escapeHtml(bar.action[1])}">${escapeHtml(bar.action[0])}</a>
    </div>
  </div>
${bar.under ? `  <div class="wrap bar-under">${bar.under}</div>\n` : ''}
  <main id="top" tabindex="-1">
${main}
  </main>

  <footer>
    <div class="wrap">
      <span>${escapeHtml(credit)}${foot}</span>
      <span>Made by <a href="https://csarko.sh/">Cyrus Sarkosh</a></span>
    </div>
  </footer>
</body>
</html>
`;
}

// The palette is the store's: every text token clears 4.5:1 on every band (ink-3 is 4.85:1 on
// peach, the darkest tint; the link blue 4.52:1 there). apps/test/store.test.mjs holds that.
export const STORE_TOKENS = {
  '--paper': '#f5f2eb',
  '--white': '#ffffff',
  '--ink': '#191c1d',
  '--ink-2': '#3c4043',
  '--ink-3': '#575b5f',
  '--line': 'rgba(25, 28, 29, 0.12)',
  '--sand': '#f4f1df',
  '--sage': '#dbe5dc',
  '--sky': '#ebf6ff',
  '--peach': '#f4d2c5',
  '--link': '#0b57d0',
  '--badge': '#c4eed0',
  '--on-badge': '#0d652d',
  '--shadow': '0 1px 2px rgba(60, 64, 67, 0.3), 0 2px 6px 2px rgba(60, 64, 67, 0.15)',
};
// The tints a band or a feature row may wear, in the order they take turns.
export const TINTS = ['white', 'sand', 'sky', 'peach', 'sage'];
export const TEXT_TOKENS = ['--ink', '--ink-2', '--ink-3', '--link', '--on-badge'];

const STORE_CSS = `
    :root {
      color-scheme: light;
${Object.entries(STORE_TOKENS).map(([k, v]) => `      ${k}: ${v};`).join('\n')}
      --r-card: 28px;
      --r-media: 24px;
      --r-pill: 100px;
      --sans: "Google Sans Flex", "Google Sans Flex Fallback", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      --mono: "Google Sans Code", "Google Sans Code Fallback", ui-monospace, "SF Mono", Menlo, monospace;
      interpolate-size: allow-keywords;
    }
    *, *::before, *::after { box-sizing: border-box; }
    html { scroll-behavior: smooth; scroll-padding-top: 104px; -webkit-text-size-adjust: 100%; }
    body { margin: 0; background: var(--paper); color: var(--ink); font-family: var(--sans); font-size: 16px; line-height: 1.6; -webkit-font-smoothing: antialiased; }
    a { color: inherit; text-decoration: none; }
    a:focus-visible, button:focus-visible, summary:focus-visible, .scroll:focus-visible { outline: 2px solid var(--link); outline-offset: 3px; border-radius: 8px; }
    img, video { display: block; max-width: 100%; height: auto; }
    h1, h2, h3, h4 { font-weight: 500; text-wrap: balance; margin: 0; }
    main:focus { outline: none; }
    ::selection { background: var(--ink); color: var(--white); }
    .wrap { max-width: 1156px; margin: 0 auto; padding-inline: 24px; }
    .skip-link { position: absolute; left: 16px; top: -60px; z-index: 100; padding: 8px 16px; border-radius: var(--r-pill); background: var(--ink); color: var(--white); font-size: 14px; font-weight: 500; }
    .skip-link:focus { top: 12px; }

    /* The title, the tagline and the hero, above the bar. */
    .top { text-align: center; padding: 64px 24px 32px; }
    .top h1 { font-size: 64px; line-height: 1.05; letter-spacing: -0.01em; }
    .top .tagline { max-width: 600px; margin: 14px auto 0; font-size: 19px; line-height: 1.5; color: var(--ink-2); }
    .hero { max-width: 1156px; margin: 0 auto; padding-inline: 24px; }
    .hero img { width: 100%; border-radius: var(--r-card); }
    .hero figcaption { max-width: 664px; margin: 12px auto 0; text-align: center; font-size: 13.5px; color: var(--ink-3); }
    @media (max-width: 640px) { .top { padding: 40px 16px 24px; } .top h1 { font-size: 40px; } .top .tagline { font-size: 17px; } .hero { padding-inline: 16px; } .hero img { border-radius: var(--r-media); } }

    /* The opening clip: full bleed, the title in white over its upper left, where the key art
       leaves ground; the bar rises over its foot. It plays once and holds (no loop), so it needs
       no pause control. */
    .top-video { position: relative; padding: 0; text-align: left; background: #0b0d12; height: clamp(360px, 55.5vw, 82vh); overflow: hidden; }
    .top-video video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: 50% 50%; }
    /* A scrim between the clip and the words: dark where they sit, clear below them, so the
       title and the tagline hold their contrast over whatever frame is under them. */
    .top-video::after { content: ""; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(180deg, rgba(7, 9, 13, 0.9) 0%, rgba(7, 9, 13, 0.72) 26%, rgba(7, 9, 13, 0) 52%); }
    .top-video .top-copy { position: absolute; z-index: 1; left: 0; right: 0; top: clamp(32px, 7vw, 96px); max-width: 1156px; margin: 0 auto; padding-inline: 24px; color: var(--white); }
    .top-video h1 { color: var(--white); text-shadow: 0 2px 24px rgba(0, 0, 0, 0.5); }
    .top-video .tagline { margin-left: 0; color: rgba(255, 255, 255, 0.92); text-shadow: 0 1px 12px rgba(0, 0, 0, 0.6); }
    @media (max-width: 640px) {
      .top-video { height: clamp(300px, 92vw, 70vh); }
      .top-video::after { background: linear-gradient(180deg, rgba(7, 9, 13, 0.94) 0%, rgba(7, 9, 13, 0.86) 42%, rgba(7, 9, 13, 0.35) 66%, rgba(7, 9, 13, 0) 82%); }
      .top-video .top-copy { top: 28px; padding-inline: 16px; }
      .top-video h1 { font-size: 36px; }
      .top-video .tagline { font-size: 16px; }
    }

    /* The floating white bar: it rises over the hero's foot, then sticks below the top edge. */
    .bar { position: sticky; top: 12px; z-index: 20; margin-top: 24px; padding: 0 16px; }
    .top-video + .bar { margin-top: -32px; }
    .bar-inner { max-width: 1156px; margin: 0 auto; min-height: 64px; display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 8px 10px 8px 24px; background: var(--white); border-radius: var(--r-pill); box-shadow: var(--shadow); }
    .bar-name { font-size: 17px; font-weight: 500; white-space: nowrap; }
    /* The one quiet line under the bar, set to the right, outside what sticks. */
    .bar-under { display: flex; justify-content: flex-end; margin-top: 12px; font-size: 13.5px; }
    .bar-under a { display: inline-flex; align-items: center; color: var(--ink-2); transition: color var(--md-duration-short3) var(--md-easing-standard); }
    .bar-under a:hover { color: var(--ink); }
    @media (max-width: 640px) { .bar-inner { min-height: 56px; padding: 6px 6px 6px 18px; } .bar .pill { min-height: 44px; padding: 0 20px; } }

    .pill, .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 48px; padding: 0 24px; background: var(--ink); color: var(--white); border-radius: var(--r-pill); font-size: 15px; font-weight: 500; white-space: nowrap; transition: background var(--md-duration-short3) var(--md-easing-standard); }
    .pill:hover, .btn:hover { background: var(--ink-2); }
    .pill small, .btn small { font-family: var(--mono); font-size: 12px; font-weight: 400; opacity: 0.8; }

    /* The promo strip: white rounded cards, an icon, a line and a blue link. */
    .strip { display: grid; gap: 12px; margin-top: 24px; }
    .strip a { display: flex; align-items: center; gap: 16px; padding: 20px 28px; background: var(--white); border-radius: var(--r-media); font-size: 16px; line-height: 1.5; }
    .strip .go { margin-left: auto; padding-left: 8px; color: var(--link); font-weight: 500; white-space: nowrap; }
    .strip a:hover .go { text-decoration: underline; text-underline-offset: 3px; }
    @media (max-width: 640px) { .strip a { flex-direction: column; align-items: flex-start; gap: 10px; padding: 18px 20px; } .strip .go { margin-left: 0; padding-left: 0; } }

    /* Bands: a centred headline ending in a period, then the section; the tints take turns. */
    .band { padding: 96px 0; }
    .t-paper { background: var(--paper); } .t-white { background: var(--white); } .t-sand { background: var(--sand); }
    .t-sky { background: var(--sky); } .t-peach { background: var(--peach); } .t-sage { background: var(--sage); }
    .headline { max-width: 820px; margin: 0 auto 48px; text-align: center; }
    .headline h2 { font-size: 48px; line-height: 1.1; letter-spacing: -0.01em; }
    .headline p { max-width: 600px; margin: 18px auto 0; font-size: 17px; color: var(--ink-2); }
    .headline .price { font-size: 18px; color: var(--ink); }
    .badge { display: inline-block; margin-left: 10px; padding: 3px 12px; border-radius: var(--r-pill); background: var(--badge); color: var(--on-badge); font-size: 13px; font-weight: 500; vertical-align: 2px; }
    .intro { padding: 72px 0 88px; }
    @media (max-width: 640px) { .lede > p:first-of-type { font-size: 18px; } }
    @media (max-width: 860px) { .band { padding: 64px 0; } .intro { padding: 48px 0 64px; } .headline { margin-bottom: 32px; } .headline h2 { font-size: 36px; } }

    /* The README's own text, in a reading column; the wide things (rows, panels, cards, figures,
       the recording) break out of it. */
    .body > * { max-width: 720px; margin-inline: auto; }
    .body > .row, .body > .panel, .body > .cards, .body > .figure, .body > .flow { max-width: none; }
    .body p, .body ul, .body ol { margin-top: 0; margin-bottom: 16px; color: var(--ink-2); }
    .body li { margin-bottom: 6px; }
    .body strong { color: var(--ink); font-weight: 500; }
    .body h3 { margin: 40px auto 12px; font-size: 24px; line-height: 1.25; }
    .body h4 { margin: 28px auto 10px; font-size: 18px; }
    .body a:not(.btn, .anchor) { color: var(--link); text-decoration: underline; text-decoration-color: transparent; text-underline-offset: 3px; transition: text-decoration-color var(--md-duration-short3) var(--md-easing-standard); }
    .body a:not(.btn, .anchor):hover { text-decoration-color: currentColor; }
    .body .anchor { color: inherit; }
    .lede > p:first-of-type { font-size: 20px; line-height: 1.55; color: var(--ink); }
    .muted, .body p.muted { font-size: 14px; color: var(--ink-3); }
    code { font-family: var(--mono); font-size: 0.88em; background: rgba(25, 28, 29, 0.06); border-radius: 6px; padding: 0.1em 0.38em; overflow-wrap: anywhere; }
    .scroll { overflow-x: auto; margin-block: 20px 24px; background: var(--white); border: 1px solid var(--line); border-radius: 16px; }
    .t-white .scroll { background: var(--paper); }
    .scroll pre { margin: 0; padding: 16px 20px; font-family: var(--mono); font-size: 14px; line-height: 1.6; color: var(--ink); }
    .scroll pre code { background: none; padding: 0; font-size: inherit; overflow-wrap: normal; }
    .scroll table { border-collapse: collapse; width: 100%; font-size: 14.5px; }
    .scroll th, .scroll td { padding: 10px 14px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
    .scroll tr:last-child td { border-bottom: 0; }

    /* The release's downloads: black pills, the size in the code face. */
    .downloads { margin-block: 8px 24px; text-align: center; }
    .downloads .buttons { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; }
    .downloads .release { margin: 12px 0 0; font-size: 13.5px; color: var(--ink-3); }
    li .downloads { text-align: left; } li .downloads .buttons { justify-content: flex-start; }

    /* Chips: a README line of bold names joined by middle dots. */
    .chips { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; max-width: 900px; margin: 0 auto 48px; padding: 0; list-style: none; }
    .chips li { padding: 6px 16px; border: 1px solid var(--ink); border-radius: var(--r-pill); font-size: 14px; color: var(--ink-2); }
    .chips strong { color: var(--ink); font-weight: 500; }

    /* Cards: a README list whose every item leads with bold words. */
    .body > .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; padding: 0; margin: 40px 0 0; list-style: none; }
    .cards li { margin: 0; padding: 28px; background: var(--white); border-radius: var(--r-card); font-size: 15px; color: var(--ink-2); }
    .t-white .cards li { background: var(--paper); }
    .cards strong.lead { display: block; margin-bottom: 8px; font-size: 20px; line-height: 1.3; }

    /* Feature rows: a picture beside the words before it in the README. After the first, each row
       wears its own tint the full width of the page. */
    .row { display: grid; grid-template-columns: minmax(0, 7fr) minmax(0, 5fr); gap: 48px; align-items: center; margin-block: 56px; }
    .row.flip { grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); }
    .row.flip .row-media { order: 2; }
    .row-media img { width: 100%; border-radius: var(--r-card); }
    .row-copy > h3 { margin: 0 0 14px; font-size: 32px; line-height: 1.2; }
    .row-copy > p { font-size: 16.5px; }
    .row[class*="t-"] { margin-block: 0; padding-block: 96px; box-shadow: 0 0 0 100vmax var(--row-tint); clip-path: inset(0 -100vmax); background: var(--row-tint); }
    .row.t-white { --row-tint: var(--white); } .row.t-sand { --row-tint: var(--sand); } .row.t-sky { --row-tint: var(--sky); }
    .row.t-peach { --row-tint: var(--peach); } .row.t-sage { --row-tint: var(--sage); }
    .band:has(.body > .row[class*="t-"]:last-child) { padding-bottom: 0; }
    /* On a phone a row's first paragraph leads, then its picture, then the rest of its words. */
    @media (max-width: 860px) {
      .row, .row.flip { grid-template-columns: minmax(0, 1fr); gap: 0; margin-block: 40px; }
      .row[class*="t-"] { padding-block: 56px; }
      .row-copy { display: contents; }
      .row-copy > :first-child { order: 1; margin-bottom: 20px; }
      .row-media, .row.flip .row-media { order: 2; margin-bottom: 20px; }
      .row-copy > :not(:first-child) { order: 3; }
      .row-copy > h3 { font-size: 26px; margin-bottom: 16px; }
    }

    .figure { max-width: 1000px; margin: 40px auto; }
    .figure img { width: 100%; border-radius: var(--r-card); }
    .recording { max-width: 1000px; margin: 0 auto 56px; }
    .recording video { width: 100%; border-radius: var(--r-card); background: var(--ink); }

    /* Panels: a README table of pictures beside their words, as white cards. */
    .panel { display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: 32px; align-items: start; max-width: 960px; margin: 0 auto 16px; padding: 28px; background: var(--white); border-radius: var(--r-card); }
    .t-white .panel { background: var(--paper); }
    .panel-image img { width: 100%; border-radius: 16px; }
    .panel-body > :first-child { margin-top: 0; }
    .panel-body h3 { margin: 0 0 10px; }
    @media (max-width: 640px) {
      .panel { grid-template-columns: minmax(0, 1fr); gap: 0; padding: 22px; }
      .panel-body { display: contents; }
      .panel-body > :first-child { order: 1; margin-bottom: 12px; }
      .panel-image { order: 2; max-width: 280px; margin-bottom: 16px; }
      .panel-body > :not(:first-child) { order: 3; }
    }

    /* A README flowchart, as a row of pill steps. */
    .flow { max-width: 960px; margin: 24px auto 32px; padding: 20px 24px; background: var(--white); border-radius: var(--r-media); }
    .t-white .flow { background: var(--paper); }
    .flow p { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 4px; margin: 0; }
    .flow .flow-branch { margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--line); }
    .flow-node { padding: 5px 14px; border: 1px solid var(--ink); border-radius: var(--r-pill); font-size: 14px; line-height: 1.4; color: var(--ink); }
    .flow-edge { display: inline-flex; align-items: center; gap: 4px; padding: 0 4px; font-family: var(--mono); font-size: 12px; color: var(--ink-3); }
    .flow-edge svg { width: 14px; height: 14px; flex: none; }
    .flow-edge.side { font-style: italic; }

    /* The details: the README's sections of plain words, folded, the store's questions. */
    .folds { max-width: 760px; margin: 0 auto; }
    .folds details { border-top: 1px solid var(--line); }
    .folds details:last-child { border-bottom: 1px solid var(--line); }
    .folds summary { list-style: none; cursor: pointer; display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 22px 4px; }
    .folds summary::-webkit-details-marker { display: none; }
    .folds summary h3 { font-size: 20px; line-height: 1.3; }
    .folds summary::after { content: ""; width: 10px; height: 10px; margin: -4px 6px 0 0; border-right: 2px solid var(--ink); border-bottom: 2px solid var(--ink); transform: rotate(45deg); flex: none; transition: transform var(--md-duration-medium2) var(--md-easing-standard); }
    .folds details[open] > summary::after { transform: translateY(4px) rotate(225deg); }
    .folds details::details-content { block-size: 0; overflow: clip; transition: block-size var(--md-duration-medium2) var(--md-easing-standard), content-visibility var(--md-duration-medium2) allow-discrete; }
    .folds details[open]::details-content { block-size: auto; }
    .folds .fold { padding: 0 4px 24px; }
    .folds .fold > * { max-width: none; }

    footer { padding: 40px 0 56px; font-size: 13.5px; color: var(--ink-3); }
    footer .wrap { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px; }
    footer a { color: var(--ink-2); text-decoration: underline; text-decoration-color: var(--line); text-underline-offset: 3px; }
    footer a:hover { color: var(--ink); text-decoration-color: currentColor; }
    @media (max-width: 640px) { .wrap { padding-inline: 16px; } .bar { padding: 0 8px; } }`;
