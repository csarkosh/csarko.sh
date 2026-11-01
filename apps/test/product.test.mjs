import { test } from 'node:test';
import assert from 'node:assert/strict';
import { downloadsHtml, flowHtml, formatSize, imagesOf, parseFlow, prepareReadme, ProductError, productPage, splitSections } from '../product.mjs';

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

const MOTION = ':root { --md-duration-short3: 150ms; }';

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
  assert.ok(downloadsHtml(RELEASE, { event: 'download-lib-visits' }).includes('download data-visits-event="download-lib-visits">Linux x86-64'), 'a named button');
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

const APP = { slug: 'lib-visits', title: 'lib-visits', description: 'Cookieless web analytics: a small script and a static collector, as JSON lines for your logs.', kicker: 'Released · Open source, GPL-3.0', license: 'GPL-3.0', repo: 'https://github.com/o/r', platforms: 'Linux, macOS' };
const imagesFor = (prepared, slug = 'lib-visits', size = { width: 1904, height: 893 }) =>
  Object.fromEntries(imagesOf(prepared).map((p) => [p, { url: `/${slug}/${p.split('/').pop().replace('.png', '.webp')}`, ...size }]));

test('productPage wears the store, not the portfolio: its fonts, the floating bar, the title over the hero', () => {
  const prepared = prepareReadme(README, { blob: BLOB });
  const html = productPage({ app: APP, prepared, release: RELEASE, images: imagesFor(prepared), motion: MOTION });
  assert.ok(html.includes('<link rel="canonical" href="https://apps.csarko.sh/lib-visits" />'));
  assert.ok(html.includes('<title>lib-visits: cookieless web analytics</title>'));
  assert.ok(html.includes('--sans: "Google Sans Flex"') && !html.includes('"Inter"'), 'the store\'s face, not the site\'s');
  assert.ok(html.includes('<meta name="color-scheme" content="light" />'), 'light only, like the store');
  assert.ok(html.includes(MOTION), 'the site\'s motion tokens');
  assert.ok(!html.includes('<a class="wordmark"') && !html.includes('<nav class="nav"') && !html.includes('<nav class="crumbs"') && !html.includes('class="rail"'), 'none of the portfolio\'s chrome');
  assert.ok(!html.includes('--accent'), 'none of the portfolio\'s tokens');
  // The title and the tagline (the description, since this README has none) over the hero.
  assert.ok(/<header class="top">\s*<h1>lib-visits<\/h1>\s*<p class="tagline">Cookieless web analytics/.test(html));
  assert.ok(html.includes('<figure class="hero">\n    <img src="/lib-visits/journey-light.webp" width="1904" height="893" alt="One visit" decoding="async" fetchpriority="high" />'));
  assert.ok(!html.includes('journey-dark'), 'no dark variant on a light page');
  assert.ok(html.includes('<figcaption>One visit as lib-visits sees it (sample data).</figcaption>'));
  assert.ok(html.indexOf('<figure class="hero">') < html.indexOf('<div class="bar">'), 'the bar comes after the hero');
  assert.ok(html.includes('<a class="bar-name" href="#top">lib-visits</a>'));
  assert.ok(html.includes('<a class="pill" href="#setup" data-visits-event="get-lib-visits">Download</a>'), 'the bar\'s pill goes to the downloads and counts get-<slug>');
  assert.ok(/<div class="bar-inner">\s*<a class="bar-name" href="#top">lib-visits<\/a>\s*<a class="pill" href="#setup"[^>]*>Download<\/a>\s*<\/div>/.test(html), 'the bar is the name and the pill, nothing else');
  assert.ok(!html.includes('Free and open source') && !html.includes('bar-meta') && !html.includes('bar-link'), 'no licence line, version or GitHub in the bar');
  assert.ok(html.includes('<span>lib-visits · GPL-3.0 · <a href="https://github.com/o/r/releases/tag/v0.1.1" target="_blank" rel="noopener" data-visits-event="release-lib-visits">v0.1.1</a> · <a href="https://github.com/o/r" target="_blank" rel="noopener" data-visits-event="source-lib-visits">GitHub</a></span>') && html.includes('Made by <a href="https://csarko.sh/">Cyrus Sarkosh</a>'), 'the release and the source in the footer, each named');
  assert.ok(!/<script\b(?![^>]*application\/ld\+json)/.test(html), 'no script');
  assert.ok(!html.includes('@@') && !html.includes('—'));
});

test('a section that shows something is a band under a centred headline with a period, the downloads in it', () => {
  const prepared = prepareReadme(README, { blob: BLOB });
  const html = productPage({ app: APP, prepared, release: RELEASE, images: imagesFor(prepared), motion: MOTION });
  assert.ok(/<section class="band t-white" aria-labelledby="setup">\s*<div class="wrap">\s*<div class="headline"><h2 id="setup">Setup\.<\/h2><p class="price">Free<span class="badge">Open source<\/span><\/p><\/div>/.test(html), 'the install band says it is free');
  assert.ok(/<li>Download <code>visits<\/code> for your platform: <div class="downloads">/.test(html));
  assert.ok(html.includes('<p class="muted">Or build it: <code>cargo build</code>.</p>'));
  assert.ok(/<section class="band t-sand" aria-labelledby="running-it-in-the-cloud">/.test(html), 'the tints take turns');
  assert.ok(html.includes('<h2 id="running-it-in-the-cloud">Running it in the cloud.</h2><p><strong>GCP</strong>: scales to zero.</p>'), 'the first sentence goes under the headline');
  assert.ok(html.includes('<figure class="flow"'));
});

test('the bar carries Buy me tokens with the icon, and the README snippet is dropped so it reads once', () => {
  const readme = `${README}\n\n[<img src="https://donate.csarko.sh/icon.svg" alt="" height="16"> Buy me tokens](https://donate.csarko.sh/visits)\n\n## License\n\nGPL-3.0\n`;
  const prepared = prepareReadme(readme, { blob: BLOB });
  assert.ok(!prepared.text.includes('donate.csarko.sh'));
  const html = productPage({ app: APP, prepared, release: RELEASE, images: imagesFor(prepared), motion: MOTION, live: true });
  assert.equal((html.match(/Buy me tokens/g) || []).length, 1);
  assert.ok(/<\/div>\n  <div class="wrap bar-under"><a href="https:\/\/donate\.csarko\.sh\/visits" target="_blank" rel="noopener" data-visits-event="tokens-lib-visits"><svg viewBox="0 0 32 22" shape-rendering="crispEdges"[^>]*><path [\s\S]*?<\/svg>Buy me tokens<\/a><\/div>/.test(html), 'one quiet line right under the bar, outside it, named tokens-<slug>');
  assert.ok(!/<div class="bar-inner">[\s\S]*?Buy me tokens[\s\S]*?<\/div>\n  <\/div>/.test(html.slice(0, html.indexOf('bar-under'))), 'not inside the sticky bar');
  assert.ok(html.includes('.bar-under { display: flex; justify-content: flex-end;'));
  // With the flag off (as before launch) the page carries no Buy me tokens at all, and no line.
  const off = productPage({ app: APP, prepared, release: RELEASE, images: imagesFor(prepared), motion: MOTION, live: false });
  assert.ok(!off.includes('Buy me tokens') && !off.includes('<div class="wrap bar-under">'));
});

test('a README made of HTML (title, tagline, hero, a feature line, a panel table) becomes the page, with the release under Install', () => {
  const prepared = prepareReadme(MAC, { blob: BLOB });
  assert.deepEqual(prepared.hero, { light: 'docs/previews/menubar.png', dark: 'docs/previews/menubar.png', alt: 'The menu bar' });
  assert.equal(prepared.tagline, 'Five menu bar items for a Mac.');
  assert.ok(!prepared.text.includes('Five menu bar items'), 'the tagline is lifted out of the text');
  assert.equal(prepared.caption, '');
  assert.equal(prepared.downloads, false);
  assert.deepEqual(imagesOf(prepared), ['docs/previews/menubar.png', 'docs/previews/cpu-light.png'], 'the light picture of each');
  const app = { slug: 'app-macstats', title: 'MacStats', description: 'A Mac menu bar app showing CPU, GPU, RAM, temperature and free disk space, each with a panel.', kicker: 'Released · Open source, MIT', license: 'MIT', repo: 'https://github.com/o/r', platforms: 'macOS' };
  const html = productPage({ app, prepared, release: { ...RELEASE, tag: 'v1.0.0', assets: [] }, images: imagesFor(prepared, 'app-macstats', { width: 560, height: 1474 }), motion: MOTION });
  assert.ok(html.includes('<h1>MacStats</h1>') && html.includes('<p class="tagline">Five menu bar items for a Mac.</p>'));
  assert.ok(html.includes('<ul class="chips"><li><strong>CPU</strong> usage</li><li><strong>GPU</strong> utilization</li></ul>') === false, 'two names are not a chip row');
  assert.ok(/<div class="downloads"><p class="release">v1\.0\.0, released Oct 15, 2026 · <a class="external" href="[^"]+" target="_blank" rel="noopener">release notes<\/a><\/p><\/div>/.test(html));
  assert.ok(html.includes('<a class="pill" href="#install" data-visits-event="get-app-macstats">Install</a>'));
  assert.ok(html.includes('<div class="panel"><div class="panel-image"><img src="/app-macstats/cpu-light.webp"'));
  assert.ok(/<div class="panel-body">\s*<h3 id="cpu">[\s\S]*?Two gauges[\s\S]*?<\/div><\/div>/.test(html));
  assert.ok(html.includes('href="https://github.com/o/r/blob/main/LICENSE"'), 'a relative link goes to GitHub');
  assert.ok(!/&lt;(?:p|td|img|picture)\b/.test(html));
});

test('a line of three or more bold names joined by middle dots is a row of chips, and a list of bold leads a row of cards', () => {
  const readme = `# App\n\n<p align="center">An app for the test.</p>\n\n<p align="center"><img src="docs/a.png" alt="A"></p>\n\n<p align="center">\n<b>Panes</b> for sessions · <b>a daemon</b> that keeps them · <b>a web pane</b>\n</p>\n\n- **Counts visits.** A visit is a hash.\n- **Carries Web Vitals**, optionally, in a second script.\n\n## Install\n\nSteps.\n`;
  const prepared = prepareReadme(readme, { blob: BLOB });
  const html = productPage({ app: { ...APP, slug: 'app', title: 'App' }, prepared, release: RELEASE, images: imagesFor(prepared, 'app'), motion: MOTION });
  assert.ok(html.includes('<ul class="chips"><li><strong>Panes</strong> for sessions</li><li><strong>a daemon</strong> that keeps them</li><li><strong>a web pane</strong></li></ul>'));
  assert.ok(html.includes('<ul class="cards">\n<li><strong class="lead">Counts visits.</strong> A visit is a hash.</li>\n<li><strong>Carries Web Vitals</strong>, optionally'), 'a lead that is not a sentence stays in its sentence');
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
  assert.equal(prepared.tagline, '');
  assert.deepEqual(imagesOf(prepared), []);
  assert.ok(!prepared.text.includes('## Status') && !prepared.text.includes('## Releasing'));
  assert.ok(prepared.text.indexOf('## Install') < prepared.text.indexOf('## Keyboard'), 'install leads');
  assert.throws(() => prepareReadme(readme, { blob: BLOB, sections: ['Keyboard', 'Nope'] }), /no "## Nope" section/);
  const app = { slug: 'ide-arkos', title: 'Arkos IDE', description: 'A terminal layout manager: panes with tabs for many Claude Code sessions at once.', kicker: 'Released · Open source, GPL-3.0', license: 'GPL-3.0', repo: 'https://github.com/o/r', platforms: 'macOS' };
  const release = { tag: 'v0.2.18', url: 'https://github.com/o/r/releases/tag/v0.2.18', published: '2026-10-15T21:02:39Z', assets: [{ name: 'Arkos-IDE-0.2.18-arm64.zip', size: 6278695, url: 'https://github.com/o/r/releases/download/v0.2.18/Arkos-IDE-0.2.18-arm64.zip' }, { name: 'manifest.json', size: 300, url: 'https://x/m' }] };
  const html = productPage({ app, prepared, release, images: {}, motion: MOTION });
  assert.ok(!html.includes('<figure class="hero">'), 'no hero without a picture');
  assert.ok(html.includes('<p class="tagline">A terminal layout manager: panes with tabs'), 'the description is the tagline');
  assert.ok(html.includes('<div class="downloads"><div class="buttons"><a class="btn" href="https://github.com/o/r/releases/download/v0.2.18/Arkos-IDE-0.2.18-arm64.zip" download data-visits-event="download-ide-arkos">macOS, Apple silicon<small>6.3 MB</small></a></div>'), 'the one asset the release has, as a button');
  assert.ok(html.includes('brew install --cask csarkosh/tap/arkos-ide'));
  assert.ok(html.includes('<a class="pill" href="#install" data-visits-event="get-ide-arkos">Install</a>'), 'the bar links to Install, counting get-<slug>');
  assert.ok(!html.includes('## Status') && !html.includes('How a release is made'));
});

test('sections of plain words fold into the closing band, in order, and the rest stay bands', () => {
  const readme = `# App\n\nIntro.\n\n## Install\n\n\`\`\`sh\nbrew install app\n\`\`\`\n\n## Privacy\n\nNothing is sent.\n\n## Learn more\n\n- [The guide](docs/guide.md)\n\n## License\n\nMIT.\n`;
  const prepared = prepareReadme(readme, { blob: BLOB });
  const html = productPage({ app: { ...APP, slug: 'app', title: 'App' }, prepared, release: { ...RELEASE, assets: [] }, images: {}, motion: MOTION });
  assert.ok(/aria-labelledby="install"/.test(html) && !/aria-labelledby="privacy"/.test(html));
  assert.ok(html.includes('<h2 id="the-details">The details.</h2>'));
  const folds = [...html.matchAll(/<details><summary><h3 id="([^"]+)">/g)].map((m) => m[1]);
  assert.deepEqual(folds, ['privacy', 'learn-more', 'license']);
  assert.ok(html.includes('<div class="fold body">\n<p>Nothing is sent.</p>'));
});

test('the paragraphs before a picture become a row beside it, its bold lead a heading, the rows taking sides and tints in turn', () => {
  const readme = `# App\n\nIntro.\n\n## Install\n\nSteps.\n\n## Who it's for\n\nFour ways people use it.\n\n**The multi tasker** runs several sessions.\n\n<picture>\n  <img alt="A" src="docs/a.png">\n</picture>\n\n**The web developer** keeps a branch.\n\nIt is shot in Lavender Light.\n\n<picture>\n  <img alt="B" src="docs/b.png">\n</picture>\n\n**The hacker.** Works on security.\n\n<picture>\n  <img alt="C" src="docs/c.png">\n</picture>\n`;
  const prepared = prepareReadme(readme, { blob: BLOB });
  const html = productPage({ app: { ...APP, slug: 'app', title: 'App' }, prepared, release: { ...RELEASE, assets: [] }, images: imagesFor(prepared, 'app', { width: 1200, height: 800 }), motion: MOTION });
  assert.ok(html.includes('<h2 id="who-it-s-for">Who it&#39;s for.</h2><p>Four ways people use it.</p>'), 'the opening sentence goes under the headline, not into a row');
  assert.ok(html.includes('<div class="row"><div class="row-media"><img src="/app/a.webp"') && html.includes('<div class="row-copy">\n<h3>The multi tasker.</h3>\n<p>Runs several sessions.</p>'));
  assert.ok(html.includes('<div class="row flip t-sky"><div class="row-media"><img src="/app/b.webp"') && html.includes('<h3>The web developer.</h3>\n<p>Keeps a branch.</p>\n<p>It is shot in Lavender Light.</p>'), 'every paragraph since the last picture');
  assert.ok(html.includes('<div class="row t-peach">') && html.includes('<h3>The hacker.</h3>\n<p>Works on security.</p>'), 'a lead that ends its own sentence keeps the rest as it is');
});

test('a recording plays under the headline its front matter names, and a heading the README lacks fails the build', () => {
  const prepared = prepareReadme(README, { blob: BLOB });
  const recording = { url: '/lib-visits/themes.mp4', poster: '/lib-visits/themes.jpg', width: 1320, height: 860, under: 'Running it in the cloud', alt: 'The window through its themes' };
  const html = productPage({ app: APP, prepared, release: RELEASE, images: imagesFor(prepared), motion: MOTION, recording });
  const figure = '<figure class="recording"><video autoplay muted loop playsinline preload="none" poster="/lib-visits/themes.jpg" width="1320" height="860" aria-label="The window through its themes"><source src="/lib-visits/themes.mp4" type="video/mp4" /></video></figure>';
  assert.ok(html.includes(figure), 'the video, muted and looping, with its poster and label');
  assert.ok(new RegExp(`<h2 id="running-it-in-the-cloud">[\\s\\S]*?</div>\\n\\s*${figure.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}\\n\\s*<div class="body">`).test(html), 'right under its headline, before the section\'s body');
  assert.ok(!/<script\b(?![^>]*application\/ld\+json)/.test(html), 'no script plays it');
  assert.throws(() => productPage({ app: APP, prepared, release: RELEASE, images: imagesFor(prepared), motion: MOTION, recording: { ...recording, under: 'Themes' } }), /no "## Themes" section to play the recording under/);
  assert.ok(!productPage({ app: APP, prepared, release: RELEASE, images: imagesFor(prepared), motion: MOTION }).includes('<video'), 'no recording, no video');
});

test('a promo card leads the page under the bar, and the share card is the hero', () => {
  const prepared = prepareReadme(README, { blob: BLOB });
  const app = { ...APP, promo: { text: 'Sessions survive IDE updates and restarts.', link: 'https://github.com/o/r/blob/main/docs/guide.md#after-a-restart' } };
  const ogImage = { url: 'https://apps.csarko.sh/lib-visits/og.jpg', width: 1200, height: 630, alt: 'One visit' };
  const html = productPage({ app, prepared, release: RELEASE, images: imagesFor(prepared), motion: MOTION, ogImage });
  assert.ok(/<div class="strip">\s*<a href="https:\/\/github\.com\/o\/r\/blob\/main\/docs\/guide\.md#after-a-restart" target="_blank" rel="noopener" data-visits-event="promo-lib-visits"><span>Sessions survive IDE updates and restarts\.<\/span><span class="go" aria-hidden="true">Learn more ›<\/span><\/a>/.test(html), 'the line and its link, no icon');
  assert.ok(html.indexOf('<div class="bar">') < html.indexOf('<div class="strip">'));
  assert.ok(html.includes('<meta property="og:image" content="https://apps.csarko.sh/lib-visits/og.jpg" />') && html.includes('<meta name="twitter:card" content="summary_large_image" />'));
  assert.ok(!productPage({ app: APP, prepared, release: RELEASE, images: imagesFor(prepared), motion: MOTION }).includes('og:image'), 'no hero card, no image');
});

test('with an opening clip the title sits over a full-bleed video that plays once, and the README hero is not copied', () => {
  const prepared = prepareReadme(README, { blob: BLOB });
  const heroVideo = { url: '/lib-visits/hero.mp4', poster: '/lib-visits/hero.jpg', width: 2880, height: 1600, alt: 'The camera pulls back from the window' };
  const html = productPage({ app: APP, prepared, release: RELEASE, images: imagesFor(prepared), motion: MOTION, heroVideo });
  assert.ok(/<header class="top top-video">\s*<video autoplay muted playsinline preload="auto" poster="\/lib-visits\/hero.jpg" width="2880" height="1600" aria-label="The camera pulls back from the window"><source src="\/lib-visits\/hero.mp4" type="video\/mp4" \/><\/video>\s*<div class="top-copy">\s*<h1>lib-visits<\/h1>/.test(html));
  assert.ok(!/<video[^>]*\bloop\b/.test(html), 'it plays once and holds, as a product page\'s hero does');
  assert.ok(!html.includes('<figure class="hero">'), 'the README\'s hero picture gives way to the clip');
  assert.deepEqual(imagesOf(prepared, { withHero: false }), [], 'and is not copied');
  assert.ok(html.includes('.top-video video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;'));
  assert.ok(html.includes('.top-video::after { content: ""; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(') && html.includes('.top-video .top-copy { position: absolute; z-index: 1;'), 'a scrim under the words, the words over it');
});

test('HTML the page cannot draw fails the build by name', () => {
  const prepared = prepareReadme(MAC.replace('Each item is a label over a value.', '<div>Each item</div>'), { blob: BLOB });
  const images = Object.fromEntries(imagesOf(prepared).map((p) => [p, { url: '/x.webp', width: 1, height: 1 }]));
  assert.throws(() => productPage({ app: { slug: 'x', title: 'x', description: 'd: e', kicker: 'k', platforms: 'macOS' }, prepared, release: { ...RELEASE, assets: [] }, images, motion: MOTION }),
    /HTML this page cannot draw: <div>/);
});

test('a picture on its own inside a section is a figure, and the page draws it', () => {
  const readme = `# App\n\nIntro.\n\n## Who\n\n<picture>\n  <source media="(prefers-color-scheme: dark)" srcset="docs/images/a-dark.png">\n  <img alt="A" src="docs/images/a-light.png" width="760">\n</picture>\n\n## Install\n\nSteps.\n`;
  const prepared = prepareReadme(readme, { blob: 'https://github.com/o/r/blob/main/' });
  assert.equal(prepared.figures.length, 1);
  assert.deepEqual(prepared.figures[0], { light: 'docs/images/a-light.png', dark: 'docs/images/a-dark.png', alt: 'A' });
  assert.deepEqual(imagesOf(prepared), ['docs/images/a-light.png']);
  const html = productPage({ app: { ...APP, slug: 'app', title: 'App' }, prepared, release: RELEASE, images: imagesFor(prepared, 'app', { width: 1800, height: 610 }), motion: MOTION });
  assert.match(html, /<figure class="figure"><img src="\/app\/a-light.webp"/);
  assert.doesNotMatch(html, /@@/);
});

test('the visits scripts go last in the body, and the page ends with them; without them, no script at all', () => {
  const prepared = prepareReadme(README, { blob: BLOB });
  const analytics = '  <script defer src="/assets/visits.0123abcd.js" data-visits="/v"></script>\n  <script defer src="/assets/vitals.4567ef01.js"></script>\n';
  const html = productPage({ app: APP, prepared, release: RELEASE, images: imagesFor(prepared), motion: MOTION, analytics });
  assert.ok(html.endsWith(`  </footer>\n${analytics}</body>\n</html>\n`), 'after the footer, before </body>');
  assert.equal((html.match(/<script\b/g) || []).length, 3, 'the JSON-LD and the two');
  assert.ok(!/<script\b(?![^>]*application\/ld\+json)/.test(productPage({ app: APP, prepared, release: RELEASE, images: imagesFor(prepared), motion: MOTION })));
});

test('splitSections cuts the rendered README at its ## headings', () => {
  const html = '<p>Intro.</p>\n<div class="section-head"><h2 id="a"><a class="anchor" href="#a">Who it&#39;s for</a></h2></div>\n<p>A.</p>\n<div class="section-head"><h2 id="b"><a class="anchor" href="#b">B</a></h2></div>\n<p>B.</p>\n';
  const { intro, sections } = splitSections(html);
  assert.equal(intro, '<p>Intro.</p>\n');
  assert.deepEqual(sections.map((s) => [s.id, s.title, s.body]), [['a', "Who it's for", '<p>A.</p>\n'], ['b', 'B', '<p>B.</p>\n']]);
});
