// Tests for docs_lib.mjs. Run: node --test .agents/skills/site-quality/tests/docs_lib.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DocError, formatDate, parseFrontMatter, readingMinutes } from '../scripts/docs_lib.mjs';

const FILE = 'content/docs/example.md';
const DESC = 'A description that is long enough to pass the seventy character minimum for search.';
const fm = (lines) => `---\n${lines.join('\n')}\n---\n# Title\n\nBody.\n`;
const rejects = (text, pattern) =>
  assert.throws(() => parseFrontMatter(text, FILE), (e) => e instanceof DocError && pattern.test(e.message));

test('parseFrontMatter reads required and optional keys and returns the body', () => {
  const source = 'https://github.com/csarkosh/game-dayhike/blob/main/docs/x.md';
  const { meta, body } = parseFrontMatter(
    fm([`description: ${DESC}`, 'published: 2026-09-14', 'updated: 2026-09-15', `source: ${source}`]), FILE);
  assert.deepEqual(meta, { description: DESC, published: '2026-09-14', updated: '2026-09-15', source });
  assert.equal(body, '# Title\n\nBody.\n');
});

test('parseFrontMatter accepts CRLF line endings', () => {
  const { meta } = parseFrontMatter(fm([`description: ${DESC}`, 'published: 2026-09-14']).replace(/\n/g, '\r\n'), FILE);
  assert.equal(meta.published, '2026-09-14');
});

test('parseFrontMatter rejects bad front matter', () => {
  rejects('# Title\n', /must start with a --- front matter block/);
  rejects(fm(['published: 2026-09-14']), /needs "description"/);
  rejects(fm([`description: ${DESC}`]), /needs "published"/);
  rejects(fm(['description: too short', 'published: 2026-09-14']), /description is 9 characters \(70–160\)/);
  rejects(fm([`description: ${DESC}`, 'published: 2026-02-30']), /published must be a real YYYY-MM-DD date/);
  rejects(fm([`description: ${DESC}`, 'published: 2026-09-14', 'updated: 2026-09-01']), /updated is before published/);
  rejects(fm([`description: ${DESC}`, 'published: 2026-09-14', 'source: https://example.com/x']), /source must be an https:\/\/github\.com\/ URL/);
  rejects(fm([`description: ${DESC}`, 'published: 2026-09-14', 'tags: a']), /unknown front matter key "tags"/);
  rejects(fm([`description: ${DESC}`, 'published: 2026-09-14', 'published: 2026-09-15']), /duplicate front matter key "published"/);
  rejects(fm([`description: ${DESC}`, 'published 2026-09-14']), /is not "key: value"/);
});

test('formatDate and readingMinutes', () => {
  assert.equal(formatDate('2026-09-14'), 'Sep 14, 2026');
  assert.equal(formatDate('2026-01-05'), 'Jan 5, 2026');
  assert.equal(readingMinutes(0), 1);
  assert.equal(readingMinutes(1131), 5);
});
