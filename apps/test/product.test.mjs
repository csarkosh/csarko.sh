import { test } from 'node:test';
import assert from 'node:assert/strict';
import { downloadsHtml, flowHtml, formatSize, imagesOf, parseFlow, prepareReadme, ProductError, productPage } from '../product.mjs';

const BLOB = 'https://github.com/o/r/blob/main/';

const RELEASE = {
  tag: 'v0.1.1',
  url: 'https://github.com/o/r/releases/tag/v0.1.1',
  published: '2026-10-15T16:00:00Z',
  assets: [
    ...['linux-amd64', 'linux-arm64', 'macos-arm64'].map((p, i) => ({ name: `visits-0.1.1-${p}.tar.gz`, size: 600_000 - i * 50_000, url: `https://github.com/o/r/releases/download/v0.1.1/visits-0.1.1-${p}.tar.gz` })),
    { name: 'visits.min.js', size: 3068, url: 'https://github.com/o/r/releases/download/v0.1.1/visits.min.js' },
    { name: 'vitals.min.js', size: 995, url: 'https://github.com/o/r/releases/download/v0.1.1/vitals.min.js' },
  ],
};

const THEME = ':root {}\n    @media (prefers-color-scheme: light) { :root {} }';

const README = `# lib-visits

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/journey-dark.png">
  <img alt="One visit" src="docs/images/journey-light.png" width="760">
</picture>

<sub>One visit as lib-visits sees it (sample data).</sub>

Visits and journeys for your site.

## Setup

1. **[Download \`visits\`](https://github.com/o/r/releases/latest)** for Linux or macOS.
2. Run it: \`./visits serve\`

<sub>Or build it: \`cargo build\`.</sub>

## Running it in the cloud

**GCP**: scales to zero.

\`\`\`mermaid
flowchart LR
  B[Browser] -->|POST /v| R[Cloud Run]
  R -->|stdout| L[Cloud Logging]
\`\`\`
`;

test('parseFlow follows the solid path and keeps the side branches', () => {
  const flow = parseFlow(`flowchart LR
  B[Browser] -->|POST /v| C[CloudFront]
  C -->|origin| F[Fargate]
  F -->|stdout| W[CloudWatch Logs]
  W --> I[Logs Insights]
  W -.->|subscription| S[S3 + Athena]`);
  assert.deepEqual(flow.steps.map((s) => s.node), ['Browser', 'CloudFront', 'Fargate', 'CloudWatch Logs', 'Logs Insights']);
  assert.deepEqual(flow.steps.map((s) => s.via), [undefined, 'POST /v', 'origin', 'stdout', '']);
  assert.deepEqual(flow.branches, [{ from: 'CloudWatch Logs', to: 'S3 + Athena', label: 'subscription', side: true }]);
  assert.throws(() => parseFlow('graph TD\n A --> B'), ProductError);
  assert.throws(() => parseFlow('flowchart LR\n A ==> B'), /cannot draw/);
});

test('flowHtml draws the steps in order and says them in its label', () => {
  const html = flowHtml(parseFlow('flowchart LR\n  B[Browser] -->|POST /v| R[Cloud Run]'));
  assert.ok(html.includes('aria-label="Browser, POST /v, to Cloud Run"'));
  assert.ok(html.indexOf('Browser') < html.indexOf('Cloud Run'));
  assert.ok(html.includes('<span class="flow-edge"><svg'));
});

test('downloadsHtml gives a button per platform with its size, and refuses a release missing one', () => {
  const html = downloadsHtml(RELEASE);
  assert.ok(html.includes('<a class="btn" href="https://github.com/o/r/releases/download/v0.1.1/visits-0.1.1-linux-amd64.tar.gz" download>Linux x86-64<small>600 KB</small></a>'));
  assert.ok(html.includes('macOS, Apple silicon<small>500 KB</small>'));
  assert.ok(html.includes('v0.1.1, released Oct 15, 2026'));
  assert.ok(html.includes('visits.min.js</a> (3,068 B)'));
  assert.throws(() => downloadsHtml({ ...RELEASE, assets: RELEASE.assets.slice(1) }), /no asset for Linux x86-64/);
  assert.equal(formatSize(1_213_296), '1.2 MB');
});

test('prepareReadme lifts the picture caption and refuses a README without the download step', () => {
  const { text, caption, flows, hero, downloads } = prepareReadme(README, { blob: BLOB });
  assert.equal(caption, 'One visit as lib-visits sees it (sample data).');
  assert.deepEqual(hero, { light: 'docs/images/journey-light.png', dark: 'docs/images/journey-dark.png', alt: 'One visit' });
  assert.ok(downloads);
  assert.ok(!text.includes('<picture>') && !text.includes('<sub>'));
  assert.equal(flows.length, 1);
  assert.throws(() => prepareReadme(README.replace('**[Download `visits`](https://github.com/o/r/releases/latest)**', 'Download'), { blob: BLOB }), /Install/);
  assert.equal(prepareReadme(README.replace(/<picture>[\s\S]*?<\/picture>/, ''), { blob: BLOB }).hero, null, 'a README without a picture has no hero');
});

test('productPage puts the buttons in Setup, the flow in its place and everything back to csarko.sh absolute', () => {
  const app = { slug: 'lib-visits', title: 'lib-visits', description: 'Cookieless web analytics: a small script and a static collector, as JSON lines for your logs.', kicker: 'Released · Open source, GPL-3.0', license: 'GPL-3.0', repo: 'https://github.com/o/r', platforms: 'Linux, macOS' };
  const prepared = prepareReadme(README, { blob: BLOB });
  const images = Object.fromEntries(imagesOf(prepared).map((p) => [p, { url: `/lib-visits/${p.split('/').pop().replace('.png', '.webp')}`, width: 1904, height: 893 }]));
  const html = productPage({ app, prepared, release: RELEASE, images, theme: THEME });
  assert.ok(html.includes('<link rel="canonical" href="https://apps.csarko.sh/lib-visits" />'));
  assert.ok(html.includes('<title>lib-visits: cookieless web analytics</title>'));
  assert.ok(/<li>Download <code>visits<\/code> for your platform: <div class="downloads">/.test(html));
  assert.ok(html.includes('<figure class="flow"'));
  assert.ok(html.includes('<p class="muted">Or build it: <code>cargo build</code>.</p>'));
  assert.ok(/<p class="muted">Or build it: <code>cargo build<\/code>\.<\/p>\n<div class="section-head">/.test(html), 'the muted line stays its own paragraph');
  assert.ok(html.includes('<source media="(prefers-color-scheme: dark)" srcset="/lib-visits/journey-dark.webp" /><img src="/lib-visits/journey-light.webp" width="1904" height="893" alt="One visit" decoding="async" fetchpriority="high" />'));
  assert.ok(html.includes('<figcaption>One visit as lib-visits sees it (sample data).</figcaption>'));
  assert.ok(!html.includes('<a class="wordmark"') && !html.includes('<nav class="nav"') && !html.includes('<nav class="crumbs"'), 'none of the portfolio\'s chrome in the markup');
  assert.ok(html.includes('<a class="app-name" href="https://apps.csarko.sh/lib-visits">lib-visits</a>'));
  assert.ok(html.includes('<li><a href="#setup">Download</a></li>'), 'the bar links to the downloads');
  assert.ok(html.includes('<li><a href="https://github.com/o/r" class="external" target="_blank" rel="noopener">GitHub</a></li>'));
  assert.ok(html.includes('<span>lib-visits · GPL-3.0</span>') && html.includes('Made by <a class="maker" href="https://csarko.sh/">Cyrus Sarkosh</a>'));
  assert.ok(html.includes('<a href="#setup"><span>Setup</span></a>'), 'the contents rail lists the sections');
  assert.ok(!html.includes('@@'));
});

// MacStats' README: an HTML title and hero, a centred paragraph, a table of panels, an Install
// section and relative links, with a release that carries no assets.
const MAC = `<h1 align="center">MacStats</h1>

<p align="center">Five menu bar items for a Mac.</p>

<p align="center"><img src="docs/previews/menubar.png" alt="The menu bar"></p>

<p align="center">
<b>CPU</b> usage · <b>GPU</b> utilization
</p>

Each item is a label over a value.

## Install

\`\`\`sh
brew install csarkosh/tap/macstats
\`\`\`

## The panels

<table>
<tr>
<td width="300" valign="top">
<picture>
<source media="(prefers-color-scheme: dark)" srcset="docs/previews/cpu-dark.png">
<img src="docs/previews/cpu-light.png" width="280" alt="The CPU panel">
</picture>
</td>
<td valign="top">

### CPU

Two gauges: **usage** and the CPU's **temperature**.

</td>
</tr>
</table>

## Credits and licence

MIT; see [LICENSE](LICENSE).
`;

test('a README made of HTML (title, hero, centred paragraphs, a panel table) becomes the page, with the release under Install', () => {
  const prepared = prepareReadme(MAC, { blob: BLOB });
  assert.deepEqual(prepared.hero, { light: 'docs/previews/menubar.png', dark: 'docs/previews/menubar.png', alt: 'The menu bar' });
  assert.equal(prepared.caption, '');
  assert.equal(prepared.downloads, false);
  assert.deepEqual(imagesOf(prepared), ['docs/previews/menubar.png', 'docs/previews/cpu-light.png', 'docs/previews/cpu-dark.png']);
  const images = Object.fromEntries(imagesOf(prepared).map((p) => [p, { url: `/app-macstats/${p.split('/').pop().replace('.png', '.webp')}`, width: 560, height: 1474 }]));
  const app = { slug: 'app-macstats', title: 'MacStats', description: 'A Mac menu bar app showing CPU, GPU, RAM, temperature and free disk space, each with a panel.', kicker: 'Released · Open source, MIT', license: 'MIT', repo: 'https://github.com/o/r', platforms: 'macOS' };
  const html = productPage({ app, prepared, release: { ...RELEASE, tag: 'v1.0.0', assets: [] }, images, theme: THEME });
  assert.ok(html.includes('<h1>MacStats</h1>'));
  assert.ok(html.includes('<p><strong>CPU</strong> usage · <strong>GPU</strong> utilization</p>'));
  assert.ok(/<div class="downloads"><p class="release">v1\.0\.0, released Oct 15, 2026 · <a class="external" href="[^"]+" target="_blank" rel="noopener">release notes<\/a><\/p><\/div>/.test(html));
  assert.ok(html.includes('<div class="panel"><div class="panel-image"><picture><source media="(prefers-color-scheme: dark)" srcset="/app-macstats/cpu-dark.webp" /><img src="/app-macstats/cpu-light.webp"'));
  assert.ok(/<div class="panel-body">\s*<h3 id="cpu">[\s\S]*?Two gauges[\s\S]*?<\/div><\/div>/.test(html));
  assert.ok(html.includes('href="https://github.com/o/r/blob/main/LICENSE"'), 'a relative link goes to GitHub');
  assert.ok(!/&lt;(?:p|td|img|picture)\b/.test(html));
});

test('HTML the page cannot draw fails the build by name', () => {
  const prepared = prepareReadme(MAC.replace('Each item is a label over a value.', '<div>Each item</div>'), { blob: BLOB });
  const images = Object.fromEntries(imagesOf(prepared).map((p) => [p, { url: '/x.webp', width: 1, height: 1 }]));
  assert.throws(() => productPage({ app: { slug: 'x', title: 'x', description: 'd: e', kicker: 'k', platforms: 'macOS' }, prepared, release: { ...RELEASE, assets: [] }, images, theme: THEME }),
    /HTML this page cannot draw: <div>/);
});

test('a README with no picture, no install and a sections list becomes a page with our install block and only those sections', () => {
  const readme = `# Arkos IDE

A terminal layout manager.

## Status

A checklist nobody but a tester reads.

## Keyboard

Cmd+B opens the sidebar.

## Releasing

How a release is made.

## License

GPL-3.0.
`;
  const install = 'Install the cask:\n\n```sh\nbrew install --cask csarkosh/tap/arkos-ide\n```\n';
  const prepared = prepareReadme(readme, { blob: BLOB, sections: ['Keyboard', 'License'], install });
  assert.equal(prepared.hero, null);
  assert.deepEqual(imagesOf(prepared), []);
  assert.ok(!prepared.text.includes('## Status') && !prepared.text.includes('## Releasing'));
  assert.ok(prepared.text.indexOf('## Install') < prepared.text.indexOf('## Keyboard'), 'install leads');
  assert.throws(() => prepareReadme(readme, { blob: BLOB, sections: ['Keyboard', 'Nope'] }), /no "## Nope" section/);
  const app = { slug: 'ide-arkos', title: 'Arkos IDE', description: 'A terminal layout manager: panes with tabs for many Claude Code sessions at once.', kicker: 'Released · Open source, GPL-3.0', license: 'GPL-3.0', repo: 'https://github.com/o/r', platforms: 'macOS' };
  const release = { tag: 'v0.2.18', url: 'https://github.com/o/r/releases/tag/v0.2.18', published: '2026-10-15T21:02:39Z', assets: [{ name: 'Arkos-IDE-0.2.18-arm64.zip', size: 6278695, url: 'https://github.com/o/r/releases/download/v0.2.18/Arkos-IDE-0.2.18-arm64.zip' }, { name: 'manifest.json', size: 300, url: 'https://x/m' }] };
  const html = productPage({ app, prepared, release, images: {}, theme: THEME });
  assert.ok(!html.includes('<figure class="hero-figure">'), 'no hero without a picture');
  assert.ok(html.includes('<div class="downloads"><div class="buttons"><a class="btn" href="https://github.com/o/r/releases/download/v0.2.18/Arkos-IDE-0.2.18-arm64.zip" download>macOS, Apple silicon<small>6.3 MB</small></a></div>'), 'the one asset the release has, as a button');
  assert.ok(html.includes('v0.2.18, released Oct 15, 2026'));
  assert.ok(html.includes('brew install --cask csarkosh/tap/arkos-ide'));
  assert.ok(html.includes('<li><a href="#install">Install</a></li>'), 'the bar links to Install');
  assert.ok(!html.includes('## Status') && !html.includes('How a release is made'));
});
