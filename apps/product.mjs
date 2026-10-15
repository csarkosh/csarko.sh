/**
 * product.mjs: an app's page on apps.csarko.sh, made from its README and its latest release.
 * Pure: README text, release data and the site's theme in, page text out (apps/build.mjs does the
 * fetching and the files). Tests: apps/test/product.test.mjs (node --test).
 *
 * The README is the content, rendered by the site's own Markdown (docs_lib.mjs renderMarkdown),
 * which allows no raw HTML, no images and no client script. So before rendering:
 *   - the <picture> under the title and its <sub> caption become the page's own figure;
 *   - any other <sub>…</sub> line becomes a muted paragraph;
 *   - the Setup step that links the download becomes the release's download buttons;
 *   - each ```mermaid flowchart becomes a static row of steps (the CSP allows no Mermaid).
 * A README that has changed shape so a step no longer applies fails the build, by name.
 */

import { APPS_HOST, escapeHtml, pageShell, renderMarkdown, SHELL_CRUMBS } from '../.agents/skills/site-quality/scripts/docs_lib.mjs';

export class ProductError extends Error {}

const DOWNLOADS = '@@DOWNLOADS@@';
const MUTED = '@@MUTED@@';
const FLOW = (i) => `@@FLOW${i}@@`;

// The platforms a release builds, in the order the buttons show them. `match` picks the asset.
const PLATFORMS = [
  { label: 'Linux x86-64', match: /-linux-amd64\.tar\.gz$/ },
  { label: 'Linux ARM64', match: /-linux-arm64\.tar\.gz$/ },
  { label: 'macOS, Apple silicon', match: /-macos-arm64\.tar\.gz$/ },
];

export const formatSize = (bytes) => (bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`);
const formatDay = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

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

export function downloadsHtml(release) {
  const buttons = PLATFORMS.map((p) => {
    const asset = release.assets.find((a) => p.match.test(a.name));
    if (!asset) throw new ProductError(`release ${release.tag} has no asset for ${p.label}`);
    return `<a class="btn" href="${escapeHtml(asset.url)}" download>${escapeHtml(p.label)}<small>${formatSize(asset.size)}</small></a>`;
  }).join('');
  const scripts = ['visits.min.js', 'vitals.min.js'].map((name) => {
    const asset = release.assets.find((a) => a.name === name);
    if (!asset) throw new ProductError(`release ${release.tag} has no ${name}`);
    return `<a href="${escapeHtml(asset.url)}" download>${name}</a> (${asset.size.toLocaleString('en-US')} B)`;
  }).join(' · ');
  return `<div class="downloads"><div class="buttons">${buttons}</div><p class="release">${escapeHtml(release.tag)}, released ${formatDay(release.published)} · ${scripts} · <a class="external" href="${escapeHtml(release.url)}" target="_blank" rel="noopener">release notes and checksums</a></p></div>`;
}

/** The README's Markdown with the four kinds of block above swapped for markers; returns the pieces. */
export function prepareReadme(readme) {
  let text = readme.replace(/\r\n/g, '\n');
  const picture = /<picture>[\s\S]*?<\/picture>\s*\n(?:\s*\n)*<sub>([\s\S]*?)<\/sub>\s*\n/.exec(text);
  if (!picture) throw new ProductError('README: no <picture> with a <sub> caption under the title');
  text = text.replace(picture[0], '');
  const caption = picture[1].replace(/<[^>]+>/g, '').trim();
  text = text.replace(/^<sub>(.*?)<\/sub>[ \t]*$/gm, (_, inner) => `${MUTED} ${inner.trim()}`);
  const download = /^1\. \*\*\[Download `([^`]+)`\]\([^)]+\)\*\*.*$/m.exec(text);
  if (!download) throw new ProductError('README: no "1. **[Download `…`](…)**" step in Setup');
  text = text.replace(download[0], `1. Download \`${download[1]}\` for your platform: ${DOWNLOADS}`);
  const flows = [];
  text = text.replace(/```mermaid\n([\s\S]*?)```/g, (_, body) => {
    flows.push(parseFlow(body));
    return FLOW(flows.length - 1);
  });
  return { text, caption, flows };
}

/**
 * app: the docs/apps entry (loadApp: title, description, license, repo, slug); readme: its README;
 * release: { tag, url, published, assets: [{ name, size, url }] }; images: { light, dark, width,
 * height } paths on this host; theme: themeBlocks() of public/index.html.
 */
export function productPage({ app, readme, release, images, theme }) {
  const { text, caption, flows } = prepareReadme(readme);
  const doc = renderMarkdown(text, `${app.slug} README`);
  let html = doc.html;
  const swap = (from, to) => {
    if (!html.includes(from)) throw new ProductError(`README: rendered page lost the marker ${from}`);
    html = html.replace(from, to);
  };
  swap(DOWNLOADS, downloadsHtml(release));
  flows.forEach((flow, i) => swap(`<p>${FLOW(i)}</p>`, flowHtml(flow)));
  html = html.replaceAll(`<p>${MUTED} `, '<p class="muted">');
  if (html.includes('@@')) throw new ProductError('README: a marker was left in the page');

  const url = `${APPS_HOST}/${app.slug}`;
  const trail = [SHELL_CRUMBS.home, SHELL_CRUMBS.apps, [app.title, url]];
  const graph = [{
    '@type': 'SoftwareApplication',
    '@id': `${url}#app`,
    name: app.title,
    description: app.description,
    url,
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Linux, macOS',
    softwareVersion: release.tag.replace(/^v/, ''),
    downloadUrl: release.url,
    ...(app.license ? { license: app.license } : {}),
    ...(app.repo ? { codeRepository: app.repo } : {}),
    author: { '@type': 'Person', '@id': 'https://csarko.sh/#person', name: 'Cyrus Sarkosh', url: 'https://csarko.sh/' },
  }];
  const rail = doc.rail.map((s) => `        <li><a href="#${s.id}"><span>${escapeHtml(s.text)}</span></a></li>`).join('\n');
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
      <figure class="hero-figure">
        <picture>
          <source media="(prefers-color-scheme: dark)" srcset="${images.dark}" />
          <img src="${images.light}" width="${images.width}" height="${images.height}" alt="${escapeHtml(caption)}" decoding="async" fetchpriority="high" />
        </picture>
        <figcaption>${escapeHtml(caption)}</figcaption>
      </figure>
      <div class="prose">
${html}
      </div>
    </main>
  </div>`;
  return pageShell({
    title: `${app.title}: ${app.description.split(':')[0].toLowerCase()} · Cyrus Sarkosh`,
    ogTitle: app.title,
    description: app.description,
    canonical: url,
    ogType: 'website',
    extraCss: PRODUCT_CSS,
    graph,
    theme,
    trail,
    main,
    bodyClass: 'doc-page',
  });
}

// On top of the doc page's rules: the figure under the title, the download buttons and the flows.
const PRODUCT_CSS = `
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
    @media (prefers-reduced-motion: reduce) { .btn { transition: none; } }`;
