/**
 * product.mjs: an app's page on apps.csarko.sh, made from its README and its latest release, in
 * the store's look (apps/store.mjs; Cyrus, 2026-10-31). Pure: README text, release data, image
 * sizes and the motion tokens in, page text out (apps/build.mjs does the fetching and the files).
 * Tests: apps/test/product.test.mjs.
 *
 * The README is the content, rendered by the site's own Markdown (docs_lib.mjs renderMarkdown),
 * which allows no raw HTML, no images and no client script. So before rendering, the README's
 * HTML is turned into what the page draws itself:
 *   - the title, as `# Title` or `<h1>`, and the tagline: a lone paragraph between it and the hero;
 *   - the hero: the first <picture> or image before the first `## ` section, with the <sub>
 *     caption under it if there is one (a README without one has no hero);
 *   - with `sections`, only the named `## ` sections of the README, in its order; a name the
 *     README lacks fails the build;
 *   - with `install` and no Setup download step or `## Install` of its own, an `## Install`
 *     section made of that text, ahead of the first section;
 *   - `<p align=…>` paragraphs, as Markdown paragraphs (<b>, <i>, <code> and <a> kept);
 *   - other `<sub>…</sub>` lines, as muted paragraphs;
 *   - a <table> of rows that each pair a <picture> with Markdown, as image-and-text panels;
 *   - a <picture> (or a lone <p><img></p>) on its own inside a section, as a figure;
 *   - a Setup step "1. **[Download `x`](…)**", as the release's download buttons; without one,
 *     a line naming the release under `## Install`;
 *   - each ```mermaid flowchart, as a static row of steps (the CSP allows no Mermaid);
 *   - relative links, as links to the file on GitHub;
 *   - the README's Buy me tokens line, dropped first: the page's bar carries its own.
 * HTML left over after that fails the build by name, rather than reaching the page as text.
 *
 * Then the rendered README is laid out as the store lays out a product (productPage):
 *   - the title, the tagline (the README's, or the app's description) and the hero, then the
 *     floating bar, then the front matter's promo card when there is one;
 *   - the text before the first section, as the opening band: a line of bold names joined by
 *     middle dots becomes a row of chips, a list whose items lead with bold words a row of cards;
 *   - each `## ` section with a picture, code, a flowchart, panels, downloads or the recording, as
 *     a band of its own (the tints take turns) under a centred headline ending in a period, its
 *     first paragraph lifted under the headline; the paragraphs before a picture become a feature
 *     row beside it, alternating sides, each row after the first in a tint of its own;
 *   - every other section (only words and lists), folded into one closing band, the store's
 *     questions, in the README's order.
 * The page is light only, like the store, so a README picture's dark variant is not used.
 */

import { APPS_HOST, escapeHtml, renderMarkdown } from '../.agents/skills/site-quality/scripts/docs_lib.mjs';
import { storeShell, TINTS } from './store.mjs';
import { doorOf, DONATE_LIVE, DONATE_URL } from '../admin/api/src/donate/doors.mjs';
import { iconSvg } from '../donate/icon.mjs';

export class ProductError extends Error {}

const DOWNLOADS = '@@DOWNLOADS@@';
const RELEASE = '@@RELEASE@@';
const MUTED = '@@MUTED@@';
const FLOW = (i) => `@@FLOW${i}@@`;
const PANEL = (i) => `@@PANEL${i}@@`;
const PANEL_END = '@@PANELEND@@';
const FIGURE = (i) => `@@FIGURE${i}@@`;

// The platforms a release builds, in the order the buttons show them. `match` picks the asset.
const PLATFORMS = [
  { label: 'Linux x86-64', match: /-linux-amd64\.tar\.gz$/ },
  { label: 'Linux ARM64', match: /-linux-arm64\.tar\.gz$/ },
  { label: 'macOS, Apple silicon', match: /-(macos-arm64\.tar\.gz|arm64\.zip)$/ },
];

export const formatSize = (bytes) => (bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`);
const formatDay = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const attr = (tag, name) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];

/** `flowchart LR` lines into nodes and edges: `A[label] -->|edge| B[label]`, `-.->` for a side path. */
export function parseFlow(source) {
  const lines = source.split('\n').map((l) => l.trim()).filter(Boolean);
  if (!/^flowchart\s+(LR|TD|TB)$/.test(lines[0] ?? '')) throw new ProductError(`a mermaid block must start with "flowchart LR": ${lines[0]}`);
  const labels = new Map();
  const edges = [];
  for (const line of lines.slice(1)) {
    const m = /^(\w+)(?:\[([^\]]+)\])?\s*(-->|-\.->)\s*(?:\|([^|]+)\|\s*)?(\w+)(?:\[([^\]]+)\])?$/.exec(line);
    if (!m) throw new ProductError(`a flowchart line this page cannot draw: ${line}`);
    const [, from, fromLabel, arrow, label, to, toLabel] = m;
    if (fromLabel) labels.set(from, fromLabel);
    if (toLabel) labels.set(to, toLabel);
    edges.push({ from, to, label: label ?? '', side: arrow === '-.->' });
  }
  const name = (id) => labels.get(id) ?? id;
  // The main path follows the first solid edge out of each step, from the first line's source.
  const path = [edges[0].from];
  const used = new Set();
  for (let at = edges[0].from; ;) {
    const next = edges.find((e, i) => !used.has(i) && e.from === at && !e.side);
    if (!next) break;
    used.add(edges.indexOf(next));
    path.push(next);
    at = next.to;
  }
  const branches = edges.filter((e, i) => !used.has(i)).map((e) => ({ from: name(e.from), to: name(e.to), label: e.label, side: e.side }));
  const steps = path.map((p) => (typeof p === 'string' ? { node: name(p) } : { node: name(p.to), via: p.label }));
  return { steps, branches };
}

const ARROW = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 8h11M9 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export function flowHtml({ steps, branches }) {
  const said = steps.map((s) => (s.via ? `${s.via}, to ${s.node}` : s.node)).join(', ');
  const row = steps.map((s) => `${s.via !== undefined ? `<span class="flow-edge">${ARROW}${s.via ? `<span>${escapeHtml(s.via)}</span>` : ''}</span>` : ''}<span class="flow-node">${escapeHtml(s.node)}</span>`).join('');
  const side = branches.map((b) => `<p class="flow-branch"><span class="flow-node">${escapeHtml(b.from)}</span><span class="flow-edge${b.side ? ' side' : ''}">${ARROW}${b.label ? `<span>${escapeHtml(b.label)}</span>` : ''}</span><span class="flow-node">${escapeHtml(b.to)}</span></p>`).join('');
  const sideSaid = branches.map((b) => `; also ${b.from}, ${b.label ? `${b.label}, ` : ''}to ${b.to}`).join('');
  return `<figure class="flow" role="img" aria-label="${escapeHtml(said + sideSaid)}"><p class="flow-row">${row}</p>${side}</figure>`;
}

const releaseLine = (release, extra = '') => `<p class="release">${escapeHtml(release.tag)}, released ${formatDay(release.published)}${extra} · <a class="external" href="${escapeHtml(release.url)}" target="_blank" rel="noopener">release notes${release.assets.length ? ' and checksums' : ''}</a></p>`;

/**
 * The release's download buttons, one a platform. A README that promises downloads (the Setup
 * step) gets every platform or the build fails (`strict`); an install block takes whatever the
 * release has, the button row left out when it has none.
 */
export function downloadsHtml(release, { strict = true } = {}) {
  const buttons = PLATFORMS.map((p) => {
    const asset = release.assets.find((a) => p.match.test(a.name));
    if (!asset) {
      if (strict) throw new ProductError(`release ${release.tag} has no asset for ${p.label}`);
      return '';
    }
    return `<a class="btn" href="${escapeHtml(asset.url)}" download>${escapeHtml(p.label)}<small>${formatSize(asset.size)}</small></a>`;
  }).join('');
  const scripts = release.assets.filter((a) => a.name.endsWith('.js'))
    .map((a) => `<a href="${escapeHtml(a.url)}" download>${escapeHtml(a.name)}</a> (${a.size.toLocaleString('en-US')} B)`).join(' · ');
  return `<div class="downloads">${buttons ? `<div class="buttons">${buttons}</div>` : ''}${releaseLine(release, scripts ? ` · ${scripts}` : '')}</div>`;
}

// A picture (or a lone image) as { light, dark, alt }: the img's src is the light one, a
// prefers-color-scheme: dark source the dark one; with no such source both are the img's.
function pictureOf(html) {
  const img = /<img\b[^>]*>/.exec(html)?.[0];
  if (!img) throw new ProductError(`README: a picture without an <img>: ${html.slice(0, 80)}`);
  const light = attr(img, 'src');
  const darkSource = /<source\b[^>]*prefers-color-scheme:\s*dark[^>]*>/.exec(html)?.[0];
  return { light, dark: darkSource ? attr(darkSource, 'srcset') : light, alt: attr(img, 'alt') ?? '' };
}

// Inline HTML a README paragraph may carry, as Markdown.
const inlineMarkdown = (html) => html
  .replace(/<\/?(?:b|strong)>/g, '**')
  .replace(/<\/?(?:i|em)>/g, '*')
  .replace(/<\/?code>/g, '`')
  .replace(/<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g, '[$2]($1)')
  .replace(/\s*\n\s*/g, ' ')
  .trim();

const dedent = (text) => {
  const lines = text.replace(/^\n+|\s+$/g, '').split('\n');
  const pad = Math.min(...lines.filter((l) => l.trim()).map((l) => /^ */.exec(l)[0].length));
  return lines.map((l) => l.slice(pad)).join('\n');
};

/**
 * The README's Markdown with its HTML turned into markers the page fills in (see the top).
 * `blob` is the GitHub URL relative links resolve against ("https://github.com/o/r/blob/main/").
 */
export function prepareReadme(readme, { blob, sections = null, install = null }) {
  // The Buy me tokens snippet, a line that is only a link to donate.csarko.sh (with or without
  // the icon's <img>), goes before anything else reads the text: the bar carries the link.
  let text = readme.replace(/\r\n/g, '\n').replace(/^\[[^\]\n]*\]\(https:\/\/donate\.csarko\.sh[^)\s]*\)[ \t]*(?:\n|$)/gm, '');
  const htmlTitle = /^<h1\b[^>]*>([\s\S]*?)<\/h1>[ \t]*$/m.exec(text);
  if (htmlTitle) text = text.replace(htmlTitle[0], `# ${htmlTitle[1].trim()}`);

  // The hero: the first picture or lone image before the first section, when there is one; and
  // the tagline, a lone paragraph between the title and the hero.
  const firstSection = text.search(/^## /m);
  const head = firstSection < 0 ? text : text.slice(0, firstSection);
  const heroMatch = /<picture>[\s\S]*?<\/picture>|<p\b[^>]*>\s*<img\b[^>]*>\s*<\/p>/.exec(head);
  let hero = null;
  let caption = '';
  let tagline = '';
  if (heroMatch) {
    hero = pictureOf(heroMatch[0]);
    const after = /^\s*<sub>([\s\S]*?)<\/sub>[ \t]*\n/.exec(text.slice(heroMatch.index + heroMatch[0].length));
    if (after) caption = after[1].replace(/<[^>]+>/g, '').trim();
    const titleLine = /^# .*$/m.exec(head);
    let from = heroMatch.index;
    if (titleLine && titleLine.index < heroMatch.index) {
      const lone = /^\s*<p\b[^>]*>([\s\S]*?)<\/p>\s*$/.exec(text.slice(titleLine.index + titleLine[0].length, heroMatch.index));
      if (lone) {
        tagline = lone[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        from = titleLine.index + titleLine[0].length;
      }
    }
    text = `${text.slice(0, from)}${from === heroMatch.index ? '' : '\n\n'}${text.slice(heroMatch.index + heroMatch[0].length + (after ? after[0].length : 0))}`;
  }

  // Only the named sections, when the page is not the whole README. Fenced code is left alone:
  // a `## ` inside a block is a comment, not a heading.
  if (sections) {
    const parts = text.split(/^(?=## )/m);
    const intro = parts[0];
    const blocks = parts.slice(1).map((b) => ({ title: b.split('\n')[0].replace(/^## /, '').trim(), text: b }));
    for (const name of sections) {
      if (!blocks.some((b) => b.title.toLowerCase() === name.toLowerCase())) throw new ProductError(`README: no "## ${name}" section to keep`);
    }
    text = intro + blocks.filter((b) => sections.some((n) => n.toLowerCase() === b.title.toLowerCase())).map((b) => b.text).join('');
  }

  // An install block of our own, for a README that has none of its own: ahead of the first section.
  if (install && !/^1\. \*\*\[Download `[^`]+`\]/m.test(text) && !/^## Install[ \t]*$/m.test(text)) {
    const at = text.search(/^## /m);
    const block = `## Install\n\n${install.trim()}\n\n`;
    text = at < 0 ? `${text.trimEnd()}\n\n${block}` : text.slice(0, at) + block + text.slice(at);
  }

  text = text.replace(/^<p\b[^>]*>([\s\S]*?)<\/p>[ \t]*$/gm, (_, inner) => inlineMarkdown(inner));
  text = text.replace(/^<sub>(.*?)<\/sub>[ \t]*$/gm, (_, inner) => `${MUTED} ${inlineMarkdown(inner)}`);

  // Panels: a table whose every row is a picture cell and a Markdown cell.
  const panels = [];
  text = text.replace(/<table>([\s\S]*?)<\/table>/g, (_, body) => [...body.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(([, row]) => {
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
    const pic = cells.findIndex((c) => /<(?:picture|img)\b/.test(c));
    if (cells.length !== 2 || pic < 0) throw new ProductError('README: a table row that is not a picture beside its text');
    panels.push(pictureOf(cells[pic]));
    return `${PANEL(panels.length - 1)}\n\n${dedent(cells[1 - pic])}\n\n${PANEL_END}`;
  }).join('\n\n'));

  // Figures: a picture on its own inside a section (the hero above was the one before the
  // first section).
  const figures = [];
  text = text.replace(/^<picture>[\s\S]*?<\/picture>[ \t]*$|^<p\b[^>]*>\s*<img\b[^>]*>\s*<\/p>[ \t]*$/gm, (block) => {
    figures.push(pictureOf(block));
    return FIGURE(figures.length - 1);
  });

  const download = /^1\. \*\*\[Download `([^`]+)`\]\([^)]+\)\*\*.*$/m.exec(text);
  if (download) text = text.replace(download[0], `1. Download \`${download[1]}\` for your platform: ${DOWNLOADS}`);
  else if (/^## Install[ \t]*$/m.test(text)) text = text.replace(/^## Install[ \t]*$/m, `## Install\n\n${RELEASE}\n`);
  else throw new ProductError('README: neither a "1. **[Download `…`](…)**" step nor an "## Install" section');

  const flows = [];
  text = text.replace(/```mermaid\n([\s\S]*?)```/g, (_, body) => {
    flows.push(parseFlow(body));
    return FLOW(flows.length - 1);
  });
  // Relative links go to the file on GitHub; https, anchors and root-relative paths stay.
  text = text.replace(/\]\((?!https?:|#|\/)([^)\s]+)\)/g, (_, rel) => `](${blob}${rel})`);
  return { text, hero, caption, tagline, panels, figures, downloads: Boolean(download), flows };
}

// One of the README's images, as build.mjs copied it: `images` maps a README path to { url,
// width, height } on this host. The page is light only, so a picture's dark variant is not used.
function pictureHtml({ light, alt }, images, { lazy = true } = {}) {
  const l = images[light];
  if (!l) throw new ProductError(`no copy of the README image ${light}`);
  return `<img src="${l.url}" width="${l.width}" height="${l.height}" alt="${escapeHtml(alt)}" decoding="async"${lazy ? ' loading="lazy"' : ' fetchpriority="high"'} />`;
}

/**
 * The app's loop: a muted video that plays on its own and repeats, its poster the first frame,
 * fetched only once it is near (preload none) so the page's first paint owes it nothing. It is
 * what it shows for a screen reader, through its label.
 */
export function recordingHtml({ url, poster, width, height, alt }) {
  return `<figure class="recording"><video autoplay muted loop playsinline preload="none" poster="${escapeHtml(poster)}" width="${width}" height="${height}" aria-label="${escapeHtml(alt)}"><source src="${escapeHtml(url)}" type="video/mp4" /></video></figure>`;
}

/** Every README image the page shows, for build.mjs to copy: the light one of each picture. The
 * README's hero is left out when the page opens with a clip instead (`withHero` false). */
export const imagesOf = ({ hero, panels, figures = [] }, { withHero = true } = {}) => [...new Set([withHero ? hero : null, ...panels, ...figures].filter(Boolean).map((p) => p.light))];

// The rendered README's `## ` sections: the text before the first, and each one's id, heading
// (inner HTML) and body.
const SECTION_HEAD = /<div class="section-head"[^>]*>(?:<p class="section-label">[^<]*<\/p>)?<h2 id="([^"]+)"><a class="anchor" href="#[^"]+">([\s\S]*?)<\/a><\/h2><\/div>\n/g;
export function splitSections(html) {
  const heads = [...html.matchAll(SECTION_HEAD)];
  const intro = heads.length ? html.slice(0, heads[0].index) : html;
  const sections = heads.map((m, i) => ({
    id: m[1],
    heading: m[2],
    title: m[2].replace(/<[^>]+>/g, '').replace(/&#39;/g, "'").replace(/&amp;/g, '&').trim(),
    body: html.slice(m.index + m[0].length, i + 1 < heads.length ? heads[i + 1].index : html.length),
  }));
  return { intro, sections };
}

// The store's headlines end in a period; one that ends in its own punctuation keeps it.
const withPeriod = (heading) => (/[.?!:)]\s*$/.test(heading.replace(/<[^>]+>/g, '')) ? heading : `${heading}.`);

// The section's first paragraph, when it is a whole sentence, goes under the headline.
function liftFirst(body) {
  const m = /^\s*<p>((?:(?!<\/p>)[\s\S])*)<\/p>\n/.exec(body);
  if (!m || !/[.!?)]$/.test(m[1].replace(/<[^>]+>/g, '').trim())) return { lifted: '', body };
  return { lifted: m[1], body: body.slice(m[0].length) };
}

// A picture after paragraphs: the paragraphs since the last picture become a row beside it.
const ROW = /((?:<p>(?:(?!<\/p>)[\s\S])*<\/p>\n)+)<figure class="figure">([\s\S]*?)<\/figure>\n?/g;
const ROW_TINTS = ['sky', 'peach', 'sage', 'sand'];
function rows(body, bandTint) {
  const tints = ROW_TINTS.filter((t) => t !== bandTint);
  let k = 0;
  return body.replace(ROW, (_, words, media) => {
    const cls = `row${k % 2 ? ' flip' : ''}${k ? ` t-${tints[(k - 1) % tints.length]}` : ''}`;
    k += 1;
    return `<div class="${cls}"><div class="row-media">${media}</div><div class="row-copy">\n${leadHeading(words)}</div></div>\n`;
  });
}

// A row's words that open with bold ones ("**The multi tasker** runs several sessions...") open
// with them as its heading instead, the store's way: "The multi tasker." over "Runs several
// sessions...". Bold words that end their own sentence keep the rest as it is.
function leadHeading(words) {
  const m = /^<p><strong>([^<]+)<\/strong>\s*([\s\S]*)$/.exec(words);
  if (!m) return words;
  const [, lead, rest] = m;
  const ends = /[.?!:]$/.test(lead.trim());
  const body = ends ? rest : rest.replace(/^([a-z])/, (c) => c.toUpperCase());
  return `<h3>${lead.trim()}${ends ? '' : '.'}</h3>\n<p>${body}`;
}

// A list whose every item leads with bold words is a row of cards.
const cards = (html) => html.replace(/<ul>\n((?:<li>(?:(?!<\/?li>)[\s\S])*<\/li>\n)+)<\/ul>/g, (all, items) => {
  const lis = items.match(/<li>[\s\S]*?<\/li>\n/g);
  if (lis.length < 2 || !lis.every((li) => /^<li>(?:<p>)?<strong>/.test(li))) return all;
  // Bold words that end their own sentence are the card's title; others stay in the sentence.
  return `<ul class="cards">\n${items.replace(/^(<li>(?:<p>)?)<strong>([^<]*[.?!:])<\/strong>/gm, '$1<strong class="lead">$2</strong>')}</ul>`;
});

// A paragraph of bold names joined by middle dots (a README's feature line) is a row of chips.
function chips(html) {
  let found = '';
  const rest = html.replace(/<p>((?:(?!<\/p>)[\s\S])*)<\/p>\n?/, (all, inner) => {
    const parts = inner.split(/\s+·\s+/);
    if (parts.length < 3 || !parts.every((p) => p.includes('<strong>'))) return all;
    found = `<ul class="chips">${parts.map((p) => `<li>${p.trim()}</li>`).join('')}</ul>\n`;
    return '';
  });
  return found ? { chips: found, rest } : { chips: '', rest: html };
}

// A section is a band when it shows something: a picture, code, a flowchart, panels or downloads.
const SHOWS = /<figure|<div class="row|<div class="panel|<div class="downloads|<pre\b/;


/**
 * app: the docs/apps entry (loadApp: title, description, kicker, license, repo, slug, promo);
 * prepared: prepareReadme's result; release: { tag, url, published, assets: [{ name, size, url }] };
 * images: README path → { url, width, height } on this host; motion: the site's motion tokens
 * (store.mjs motionTokens); recording: the app's loop, { url, poster, width, height, under, alt }
 * (the front matter's `recording`, copied beside the page by build.mjs), played under the
 * README's `under` heading; ogImage: { url, width, height, alt }, the share card build.mjs makes
 * from the hero; live: whether donate.csarko.sh serves the doors yet (DONATE_LIVE), without
 * which the bar has no Buy me tokens.
 */
export function productPage({ app, prepared, release, images, motion = '', recording = null, ogImage = null, heroVideo = null, live = DONATE_LIVE }) {
  const { text, hero, caption, tagline = '', panels, flows, figures = [] } = prepared;
  const doc = renderMarkdown(text, `${app.slug} README`);
  let html = doc.html;
  const swap = (from, to) => {
    if (!html.includes(from)) throw new ProductError(`README: the rendered page lost the marker ${from}`);
    html = html.replace(from, to);
  };
  if (prepared.downloads) swap(DOWNLOADS, downloadsHtml(release));
  else swap(`<p>${RELEASE}</p>`, downloadsHtml(release, { strict: false }));
  flows.forEach((flow, i) => swap(`<p>${FLOW(i)}</p>`, flowHtml(flow)));
  panels.forEach((panel, i) => {
    swap(`<p>${PANEL(i)}</p>`, `<div class="panel"><div class="panel-image">${pictureHtml(panel, images)}</div><div class="panel-body">`);
    swap(`<p>${PANEL_END}</p>`, '</div></div>');
  });
  figures.forEach((figure, i) => swap(`<p>${FIGURE(i)}</p>`, `<figure class="figure">${pictureHtml(figure, images)}</figure>`));
  html = html.replaceAll(`<p>${MUTED} `, '<p class="muted">');
  if (html.includes('@@')) throw new ProductError('README: a marker was left in the page');
  // HTML the README carried that nothing above handled reaches the page escaped; refuse it.
  const leftover = /&lt;\/?(?:p|div|table|tr|td|img|picture|source|sub|b|i|br|h[1-6]|a|span)\b[^&]*&gt;/.exec(html.replace(/<pre[\s\S]*?<\/pre>|<code>[\s\S]*?<\/code>/g, ''));
  if (leftover) throw new ProductError(`README: HTML this page cannot draw: ${leftover[0].replace(/&lt;/g, '<').replace(/&gt;/g, '>')}`);

  const { intro, sections } = splitSections(html);
  if (recording && !sections.some((s) => s.title.toLowerCase() === recording.under.toLowerCase())) {
    throw new ProductError(`README: no "## ${recording.under}" section to play the recording under`);
  }
  // The section the bar's pill goes to: the downloads or the install commands.
  const getIt = sections.find((s) => /^(setup|install|download|get)/i.test(s.title));

  // The bands, the tints taking turns; the sections of plain words wait for the closing fold.
  const bands = [];
  const folds = [];
  let turn = 0;
  for (const s of sections) {
    const plays = recording && s.title.toLowerCase() === recording.under.toLowerCase();
    if (!plays && !SHOWS.test(s.body)) {
      folds.push(`        <details><summary><h3 id="${s.id}">${s.heading}</h3></summary><div class="fold body">\n${s.body}</div></details>`);
      continue;
    }
    const tint = TINTS[turn % TINTS.length];
    turn += 1;
    const { lifted, body } = liftFirst(s.body);
    const price = s === getIt && app.license ? `<p class="price">Free<span class="badge">Open source</span></p>` : '';
    bands.push(`    <section class="band t-${tint}" aria-labelledby="${s.id}">
      <div class="wrap">
        <div class="headline"><h2 id="${s.id}">${withPeriod(s.heading)}</h2>${price}${lifted ? `<p>${lifted}</p>` : ''}</div>
${plays ? `        ${recordingHtml(recording)}\n` : ''}        <div class="body">
${cards(rows(body, tint))}        </div>
      </div>
    </section>`);
  }
  if (folds.length) {
    bands.push(`    <section class="band t-${TINTS[turn % TINTS.length]}" aria-labelledby="the-details">
      <div class="wrap">
        <div class="headline"><h2 id="the-details">The details.</h2></div>
        <div class="folds">
${folds.join('\n')}
        </div>
      </div>
    </section>`);
  }

  const opening = chips(intro);
  const introBand = intro.trim() ? `    <section class="band intro t-paper" aria-label="About ${escapeHtml(app.title)}">
      <div class="wrap">
        ${opening.chips}<div class="body lede">
${cards(opening.rest)}        </div>
      </div>
    </section>
` : '';

  const promo = app.promo ? `    <div class="wrap">
      <div class="strip">
        <a href="${escapeHtml(app.promo.link)}"${app.promo.link.startsWith('https:') ? ' target="_blank" rel="noopener"' : ''}><span>${escapeHtml(app.promo.text)}</span><span class="go" aria-hidden="true">Learn more ›</span></a>
      </div>
    </div>
` : '';

  // The top: with an opening clip, the store's way (a product page's hero video): full bleed
  // behind the title, played once and held on its last frame, the key art, which is also its
  // poster; without one, the title over the README's hero picture.
  const top = heroVideo ? `  <header class="top top-video">
    <video autoplay muted playsinline preload="auto" poster="${escapeHtml(heroVideo.poster)}" width="${heroVideo.width}" height="${heroVideo.height}" aria-label="${escapeHtml(heroVideo.alt)}"><source src="${escapeHtml(heroVideo.url)}" type="video/mp4" /></video>
    <div class="top-copy">
      <h1>${doc.titleHtml}</h1>
      <p class="tagline">${escapeHtml(tagline || app.description)}</p>
    </div>
  </header>
` : `  <header class="top">
    <h1>${doc.titleHtml}</h1>
    <p class="tagline">${escapeHtml(tagline || app.description)}</p>
  </header>
${hero ? `  <figure class="hero">
    ${pictureHtml(hero, images, { lazy: false })}${caption ? `\n    <figcaption>${escapeHtml(caption)}</figcaption>` : ''}
  </figure>
` : ''}`;

  const url = `${APPS_HOST}/${app.slug}`;
  const graph = [{
    '@type': 'SoftwareApplication',
    '@id': `${url}#app`,
    name: app.title,
    description: app.description,
    url,
    applicationCategory: 'DeveloperApplication',
    operatingSystem: app.platforms,
    softwareVersion: release.tag.replace(/^v/, ''),
    downloadUrl: release.url,
    ...(app.license ? { license: app.license } : {}),
    ...(app.repo ? { codeRepository: app.repo } : {}),
    author: { '@type': 'Person', '@id': 'https://csarko.sh/#person', name: 'Cyrus Sarkosh', url: 'https://csarko.sh/' },
  }];
  // The bar: the name and the black pill to the downloads or the install commands, nothing else
  // (Cyrus, 2026-11-01). Buy me tokens, once the site is live and the app's door has shipped, is
  // the one quiet line under it, set to the right; the source and the release go to the footer.
  const door = doorOf(app.slug);
  const under = live && door?.shipped ? `<a href="${escapeHtml(`${DONATE_URL}${door.path}`)}" target="_blank" rel="noopener">${iconSvg()}Buy me tokens</a>` : '';
  return storeShell({
    title: `${app.title}: ${app.description.split(/[:.]/)[0].toLowerCase()}`,
    ogTitle: app.title,
    description: app.description,
    canonical: url,
    ogImage,
    graph,
    motion,
    top,
    bar: {
      name: app.title,
      action: getIt ? [prepared.downloads ? 'Download' : 'Install', `#${getIt.id}`] : ['Release', release.url],
      under,
    },
    main: `${promo}${introBand}${bands.join('\n')}`,
    footer: [`${app.title}${app.license ? ` · ${app.license}` : ''}`, [[release.tag, release.url], ...(app.repo ? [['GitHub', app.repo]] : [])]],
  });
}
