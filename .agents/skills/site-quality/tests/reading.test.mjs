// Tests for assets/reading.js, a doc page's one script of our own. Run: node --test .agents/skills/site-quality/tests/reading.test.mjs
// The script is run as the page runs it, against a stand-in document: each element is its distance
// from the top of the screen, and the test moves the page and the clock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SOURCE = readFileSync(new URL('../assets/reading.js', import.meta.url), 'utf8');

// A page 800px tall on screen: two numbered sections, then `closing` (the selector the element
// answers to and where it starts), all in page coordinates; `scroll` moves them.
function pageOf({ heads = [1000, 3000], closing = null }) {
  const sent = [];
  let scroll = 0;
  let tick = null;
  const el = (top, id) => ({ getBoundingClientRect: () => ({ top: top - scroll }), querySelector: () => ({ id }) });
  const end = closing && el(closing.top, 'end');
  const context = {
    innerHeight: 800,
    document: {
      visibilityState: 'visible',
      querySelectorAll: (q) => (q.startsWith('.prose .section-head') ? heads.map((top, i) => el(top, `s${i + 1}`)) : []),
      querySelector: (q) => (end && q.split(',').includes(closing.selector) ? end : null),
    },
    addEventListener: () => {},
    requestAnimationFrame: () => {},
    setInterval: (fn) => { tick = fn; },
    visits: { send: (name, d) => sent.push([name, { ...d }]) },
  };
  context.window = context;
  vm.runInNewContext(SOURCE, context);
  return { sent, at: (y) => { scroll = y; }, seconds: (n) => { for (let i = 0; i < n; i += 1) tick(); }, document: context.document };
}

test('a section that sat across the middle of the screen for 5 s is sent once, n 0 for the opening', () => {
  const page = pageOf({ closing: { selector: '.what-next', top: 5000 } });
  page.seconds(4);
  assert.deepEqual(page.sent, []);
  page.seconds(3);
  assert.deepEqual(page.sent, [['section', { n: 0, of: 2 }]]);
  page.at(800); // section 1's heading is above the middle
  page.seconds(5);
  assert.deepEqual(page.sent.at(-1), ['section', { n: 1, of: 2 }]);
  assert.equal(page.sent.length, 2);
});

test('the last section stops counting once What next reaches the middle of the screen', () => {
  const page = pageOf({ closing: { selector: '.what-next', top: 5000 } });
  page.at(4599); // What next is 401px down an 800px screen: still below the middle
  page.seconds(4);
  page.at(4601); // and now above it
  page.seconds(30);
  assert.deepEqual(page.sent, [], 'four seconds in the last section, then the links: no read');
  page.at(4000);
  page.seconds(1);
  assert.deepEqual(page.sent, [['section', { n: 2, of: 2 }]], 'back in the section, the fifth second counts, in the same shape');
});

test('without a What next section the read-end mark closes the last section: the Sources heading, else the author box', () => {
  const page = pageOf({ closing: { selector: '[data-read-end]', top: 5000 } });
  page.at(6000);
  page.seconds(30);
  assert.deepEqual(page.sent, []);
  // With neither, as before: the last section runs to the end of the page.
  const open = pageOf({});
  open.at(6000);
  open.seconds(5);
  assert.deepEqual(open.sent, [['section', { n: 2, of: 2 }]]);
});

test('a hidden tab counts nothing', () => {
  const page = pageOf({ closing: { selector: '.what-next', top: 5000 } });
  page.document.visibilityState = 'hidden';
  page.seconds(10);
  assert.deepEqual(page.sent, []);
});
