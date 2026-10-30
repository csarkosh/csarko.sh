/**
 * product.mjs: an app's page on apps.csarko.sh, made from its README and its latest release.
 * Pure: README text, release data, image sizes and the site's theme in, page text out
 * (apps/build.mjs does the fetching and the files). Tests: apps/test/product.test.mjs.
 *
 * The README is the content, rendered by the site's own Markdown (docs_lib.mjs renderMarkdown),
 * which allows no raw HTML, no images and no client script. So before rendering, the README's
 * HTML is turned into what the page draws itself:
 *   - the title, as `# Title` or `<h1>`;
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
 */

import { APPS_HOST, escapeHtml, renderMarkdown, standaloneShell } from '../.agents/skills/site-quality/scripts/docs_lib.mjs';
import { doorOf, DONATE_URL } from '../admin/api/src/donate/doors.mjs';
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

  // The hero: the first picture or lone image before the first section, when there is one.
  const firstSection = text.search(/^## /m);
  const head = firstSection < 0 ? text : text.slice(0, firstSection);
  const heroMatch = /<picture>[\s\S]*?<\/picture>|<p\b[^>]*>\s*<img\b[^>]*>\s*<\/p>/.exec(head);
  let hero = null;
  let caption = '';
  if (heroMatch) {
    hero = pictureOf(heroMatch[0]);
    const after = /^\s*<sub>([\s\S]*?)<\/sub>[ \t]*\n/.exec(text.slice(heroMatch.index + heroMatch[0].length));
    if (after) caption = after[1].replace(/<[^>]+>/g, '').trim();
    text = text.slice(0, heroMatch.index) + text.slice(heroMatch.index + heroMatch[0].length + (after ? after[0].length : 0));
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
  return { text, hero, caption, panels, figures, downloads: Boolean(download), flows };
}

// A <picture> of one of the README's images, as build.mjs copied it: `images` maps a README path
// to { url, width, height } on this host.
function pictureHtml({ light, dark, alt }, images, { lazy = true } = {}) {
  const l = images[light];
  const d = images[dark];
  if (!l || !d) throw new ProductError(`no copy of the README image ${!l ? light : dark}`);
  return `<picture>${dark !== light ? `<source media="(prefers-color-scheme: dark)" srcset="${d.url}" />` : ''}<img src="${l.url}" width="${l.width}" height="${l.height}" alt="${escapeHtml(alt)}" decoding="async"${lazy ? ' loading="lazy"' : ' fetchpriority="high"'} /></picture>`;
}

/** Every README image the page shows, for build.mjs to copy. */
export const imagesOf = ({ hero, panels, figures = [] }) => [...new Set([hero, ...panels, ...figures].filter(Boolean).flatMap((p) => [p.light, p.dark]))];

/**
 * app: the docs/apps entry (loadApp: title, description, kicker, license, repo, slug); prepared:
 * prepareReadme's result; release: { tag, url, published, assets: [{ name, size, url }] };
 * images: README path → { url, width, height } on this host; theme: themeBlocks() of public/index.html.
 */
export function productPage({ app, prepared, release, images, theme }) {
  const { text, hero, caption, panels, flows, figures = [] } = prepared;
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
  const rail = doc.rail.map((s) => `        <li><a href="#${s.id}"><span>${escapeHtml(s.text)}</span></a></li>`).join('\n');
  // The bar's links: the section with the downloads or the install commands, the source, Buy me
  // tokens once the app's door has shipped, and the release, so the page says what it is before
  // the first scroll.
  const getIt = doc.rail.find((s) => /^(setup|install|download|get)/i.test(s.text));
  const door = doorOf(app.slug);
  const links = [
    ...(getIt ? [[prepared.downloads ? 'Download' : 'Install', `#${getIt.id}`]] : []),
    ...(app.repo ? [['GitHub', app.repo, true]] : []),
    ...(door?.shipped ? [['Buy me tokens', `${DONATE_URL}${door.path}`, true, iconSvg()]] : []),
    [release.tag, release.url, true],
  ];
  const main = `  <div class="wrap shell">
    <aside class="rail" aria-label="Contents">
      <p class="section-label">Contents</p>
      <ol>
${rail}
      </ol>
    </aside>
    <main id="top" tabindex="-1">
      <header class="doc-header">
        <p class="eyebrow">${escapeHtml(app.kicker)}</p>
        <h1>${doc.titleHtml}</h1>
        <p class="lead">${escapeHtml(app.description)}</p>
        <ul class="tags">
          <li>${escapeHtml(release.tag)}</li>${app.repo ? `\n          <li><a class="external" href="${escapeHtml(app.repo)}" target="_blank" rel="noopener">Source on GitHub</a></li>` : ''}
        </ul>
      </header>
${hero ? `      <figure class="hero-figure">
        ${pictureHtml(hero, images, { lazy: false })}${caption ? `\n        <figcaption>${escapeHtml(caption)}</figcaption>` : ''}
      </figure>
` : ''}      <div class="prose">
${html}
      </div>
    </main>
  </div>`;
  return standaloneShell({
    title: `${app.title}: ${app.description.split(/[:.]/)[0].toLowerCase()}`,
    ogTitle: app.title,
    description: app.description,
    canonical: url,
    ogType: 'website',
    extraCss: PRODUCT_CSS,
    graph,
    theme,
    name: app.title,
    links,
    licence: app.license ?? '',
    main,
    bodyClass: 'doc-page',
  });
}

// On top of the doc page's rules: the app's own bar and footer, the hero, the downloads, the
// flows and the panels.
const PRODUCT_CSS = `
    .app-bar { position: sticky; top: 0; z-index: 10; backdrop-filter: saturate(140%) blur(12px); -webkit-backdrop-filter: saturate(140%) blur(12px); background: var(--nav-bg); border-bottom: 1px solid var(--border); }
    .app-bar .wrap { display: flex; align-items: center; justify-content: space-between; height: 60px; gap: 16px; }
    .app-name { font-family: var(--mono); font-weight: 600; font-size: 15px; letter-spacing: -0.01em; color: var(--text); }
    .app-bar ul { display: flex; align-items: center; gap: 20px; list-style: none; margin: 0; padding: 0; }
    .app-bar ul a { color: var(--muted); font-size: 14px; transition: color .15s ease; }
    .app-bar ul a:hover { color: var(--text); }
    .app-bar ul li:last-child a { font-family: var(--mono); font-size: 12.5px; padding: 3px 9px; border: 1px solid var(--border-strong); border-radius: 999px; }
    footer .maker { color: var(--muted); }
    footer .maker:hover { color: var(--text); }
    /* On a phone the bar wraps: the links drop to their own row when they do not fit beside the
       name, and onto a second when they do not fit the width, every one kept, the version
       included. Only the vertical padding is set, so .wrap keeps its side gutter. Two rows of
       links make the bar about 113px tall at 320px, so an anchor clears it by 136px, not 84px. */
    @media (max-width: 640px) { html { scroll-padding-top: 136px; } .app-bar .wrap { flex-wrap: wrap; height: auto; padding-top: 10px; padding-bottom: 10px; row-gap: 6px; } .app-bar ul { flex-wrap: wrap; gap: 6px 14px; } .app-bar ul a { font-size: 13.5px; } }
    @media (prefers-reduced-motion: reduce) { .app-bar ul a { transition: none; } }
    .hero-figure { margin: 8px 0 36px; }
    .hero-figure img { display: block; width: 100%; height: auto; border-radius: 14px; }
    .hero-figure figcaption { margin-top: 10px; font-size: 13.5px; color: var(--muted); }
    .prose .muted { font-size: 14px; color: var(--muted); }
    .downloads { margin: 12px 0 6px; }
    .downloads .buttons { display: flex; flex-wrap: wrap; gap: 10px; }
    .btn { display: inline-flex; align-items: baseline; gap: 8px; padding: 10px 16px; border-radius: 10px; background: var(--accent); color: var(--on-accent); font-size: 14.5px; font-weight: 600; text-decoration: none; transition: background .15s ease; }
    .btn:hover { background: var(--accent-hover); }
    .btn small { font-family: var(--mono); font-size: 12px; font-weight: 500; }
    .prose .downloads .btn, .prose .downloads .btn:hover { color: var(--on-accent); text-decoration: none; }
    .downloads .release { margin: 10px 0 0; font-size: 13.5px; color: var(--muted); }
    .flow { margin: 14px 0 26px; padding: 14px 16px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); }
    .flow p { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 4px; margin: 0; }
    .flow .flow-branch { margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--border); }
    .flow-node { padding: 4px 10px; border: 1px solid var(--border-strong); border-radius: 8px; background: var(--surface-2); font-size: 13.5px; line-height: 1.4; }
    .flow-edge { display: inline-flex; align-items: center; gap: 4px; padding: 0 4px; font-family: var(--mono); font-size: 11.5px; color: var(--faint); }
    .flow-edge svg { width: 14px; height: 14px; flex: none; }
    .flow-edge.side { font-style: italic; }
    .panel { display: grid; grid-template-columns: 240px minmax(0, 1fr); gap: 24px; align-items: start; margin: 32px 0; }
    .panel-image img { display: block; width: 100%; height: auto; border-radius: 12px; }
    .figure { margin: 24px 0 32px; }
    .figure img { display: block; width: 100%; height: auto; border-radius: 12px; }
    .panel-body > :first-child { margin-top: 0; }
    /* On a phone the panel's heading leads, then its screenshot, then the rest of its text. */
    @media (max-width: 640px) {
      .panel { grid-template-columns: minmax(0, 1fr); gap: 0; }
      .panel-body { display: contents; }
      .panel-body > :first-child { order: 1; margin-bottom: 12px; }
      .panel-image { order: 2; max-width: 280px; margin-bottom: 16px; }
      .panel-body > :not(:first-child) { order: 3; }
    }
    @media (prefers-reduced-motion: reduce) { .btn { transition: none; } }`;
