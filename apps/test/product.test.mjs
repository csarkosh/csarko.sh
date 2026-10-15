import { test } from 'node:test';
import assert from 'node:assert/strict';
import { downloadsHtml, flowHtml, formatSize, parseFlow, prepareReadme, ProductError, productPage } from '../product.mjs';

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
  const { text, caption, flows } = prepareReadme(README);
  assert.equal(caption, 'One visit as lib-visits sees it (sample data).');
  assert.ok(!text.includes('<picture>') && !text.includes('<sub>'));
  assert.equal(flows.length, 1);
  assert.throws(() => prepareReadme(README.replace('**[Download `visits`](https://github.com/o/r/releases/latest)**', 'Download')), /Download/);
  assert.throws(() => prepareReadme(README.replace(/<picture>[\s\S]*?<\/picture>/, '')), /picture/);
});

test('productPage puts the buttons in Setup, the flow in its place and everything back to csarko.sh absolute', () => {
  const app = { slug: 'lib-visits', title: 'lib-visits', description: 'Cookieless web analytics: a small script and a static collector, as JSON lines for your logs.', kicker: 'Released · Open source, GPL-3.0', license: 'GPL-3.0', repo: 'https://github.com/o/r' };
  const html = productPage({ app, readme: README, release: RELEASE, images: { light: '/lib-visits/journey-light.png', dark: '/lib-visits/journey-dark.png', width: 1904, height: 893 }, theme: ':root {}\n    @media (prefers-color-scheme: light) { :root {} }' });
  assert.ok(html.includes('<link rel="canonical" href="https://apps.csarko.sh/lib-visits" />'));
  assert.ok(html.includes('<title>lib-visits: cookieless web analytics · Cyrus Sarkosh</title>'));
  assert.ok(/<li>Download <code>visits<\/code> for your platform: <div class="downloads">/.test(html));
  assert.ok(html.includes('<figure class="flow"'));
  assert.ok(html.includes('<p class="muted">Or build it: <code>cargo build</code>.</p>'));
  assert.ok(/<p class="muted">Or build it: <code>cargo build<\/code>\.<\/p>\n<div class="section-head">/.test(html), 'the muted line stays its own paragraph');
  assert.ok(html.includes('<img src="/lib-visits/journey-light.png" width="1904" height="893" alt="One visit as lib-visits sees it (sample data)."'));
  assert.ok(html.includes('<a class="wordmark" href="https://csarko.sh/">'));
  assert.ok(html.includes('<a href="#setup"><span>Setup</span></a>'), 'the contents rail lists the sections');
  assert.ok(!html.includes('@@'));
});
