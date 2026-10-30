import { test } from 'node:test';
import assert from 'node:assert/strict';

// motion.js is a browser module, imported here under plain Node: it must not touch the DOM until
// one of its functions is called, so it is loaded inside the tests rather than at the top.
const load = () => import('../public/motion.js');

const TOKENS = {
  '--md-easing-standard': ' cubic-bezier(0.2, 0, 0, 1)',
  '--md-easing-emphasized-decelerate': ' cubic-bezier(0.05, 0.7, 0.1, 1)',
  '--md-easing-emphasized-accelerate': ' cubic-bezier(0.3, 0, 0.8, 0.15)',
  '--md-duration-short2': ' 100ms',
  '--md-duration-short3': ' 150ms',
  '--md-duration-short4': ' 200ms',
  '--md-duration-medium2': ' 300ms',
  '--md-duration-medium4': ' 400ms',
};
// What theme.css's prefers-reduced-motion block leaves on :root.
const REDUCED = Object.fromEntries(Object.entries(TOKENS).map(([k, v]) => [k, k.includes('duration') ? ' 0ms' : v]));

/** Runs `fn` with a page whose :root carries `values` (a computed style reads them with the leading space browsers keep). */
async function withPage(values, fn) {
  const root = {};
  globalThis.document = { documentElement: root };
  globalThis.getComputedStyle = (node) => (node === root
    ? { getPropertyValue: (name) => values[name] ?? '' }
    : { opacity: '1', transform: 'none', position: 'static', getPropertyValue: () => '', ...node.drawn });
  try {
    return await fn();
  } finally {
    delete globalThis.document;
    delete globalThis.getComputedStyle;
  }
}

/** An element that records what it is asked to animate. */
function element(props = {}) {
  const listeners = {};
  const node = {
    localName: 'div', hidden: false, style: {}, children: [], offsetHeight: 0, calls: [],
    animate(frames, options) {
      node.calls.push({ frames, options });
      return { playState: 'running', finished: new Promise(() => {}), cancel() { this.playState = 'idle'; } };
    },
    addEventListener(type, fn) { (listeners[type] ??= []).push(fn); },
    dispatch(type, event = {}) { for (const fn of listeners[type] ?? []) fn(event); },
    hasAttribute: () => false, setAttribute() {}, removeAttribute() {},
    getClientRects: () => [{}],
    ...props,
  };
  return node;
}

test('importing motion.js under plain Node touches no DOM', async () => {
  assert.equal(typeof globalThis.document, 'undefined');
  const motion = await load();
  for (const name of ['parseDuration', 'tokens', 'accordion', 'easeHeight', 'fadeIn', 'fadeOut', 'glideList', 'showMenu', 'hideMenu']) {
    assert.equal(typeof motion[name], 'function', `exports ${name}`);
  }
});

test('parseDuration reads a CSS time in milliseconds', async () => {
  const { parseDuration } = await load();
  assert.equal(parseDuration('150ms'), 150);
  assert.equal(parseDuration('0.3s'), 300);
  assert.equal(parseDuration('0ms'), 0);
  assert.equal(parseDuration(' 200ms '), 200, 'a computed custom property keeps its leading space');
});

test('parseDuration falls back on an empty or unreadable value', async () => {
  const { parseDuration } = await load();
  assert.equal(parseDuration(''), 0);
  assert.equal(parseDuration('', 42), 42);
  assert.equal(parseDuration('abc', 42), 42);
  assert.equal(parseDuration('150', 42), 42, 'a bare number is not a CSS time');
  assert.equal(parseDuration(undefined, 7), 7);
});

test('tokens() reads the easings and durations off :root', async () => {
  const { tokens } = await load();
  const t = await withPage(TOKENS, () => tokens());
  assert.deepEqual(t, {
    standard: 'cubic-bezier(0.2, 0, 0, 1)',
    decelerate: 'cubic-bezier(0.05, 0.7, 0.1, 1)',
    accelerate: 'cubic-bezier(0.3, 0, 0.8, 0.15)',
    short2: 100, short3: 150, short4: 200, medium2: 300, medium4: 400,
  });
});

test('tokens() without the motion tokens reads every duration as 0', async () => {
  const { tokens } = await load();
  const t = await withPage({}, () => tokens());
  for (const key of ['short2', 'short3', 'short4', 'medium2', 'medium4']) assert.equal(t[key], 0, key);
});

test('easeHeight eases over medium2 on the standard curve', async () => {
  const { easeHeight } = await load();
  const card = element();
  const animation = await withPage(TOKENS, () => easeHeight(card, 120, 300));
  assert.ok(animation);
  assert.equal(card.calls.length, 1);
  const [{ frames, options }] = card.calls;
  assert.equal(options.duration, 300);
  assert.equal(options.easing, 'cubic-bezier(0.2, 0, 0, 1)');
  assert.deepEqual(frames.map((f) => f.height), ['120px', '300px']);
});

test('easeHeight does nothing when the height does not change', async () => {
  const { easeHeight } = await load();
  const card = element();
  assert.equal(await withPage(TOKENS, () => easeHeight(card, 200, 200)), null);
  assert.equal(card.calls.length, 0);
});

test('an ease interrupted part way continues from the height drawn, to the height without it', async () => {
  const { easeHeight } = await load();
  // 120 px tall as drawn while the first ease runs; 300 px its own height once that is cancelled.
  let cancelled = false;
  const card = element();
  Object.defineProperty(card, 'offsetHeight', { get: () => (cancelled ? 300 : 120) });
  card.animate = (frames, options) => {
    card.calls.push({ frames, options });
    return { playState: 'running', finished: new Promise(() => {}), cancel() { cancelled = true; this.playState = 'idle'; } };
  };
  await withPage(TOKENS, () => {
    easeHeight(card, 0, 200);
    // The caller measured both heights with the first ease applied, so both read as drawn.
    easeHeight(card, 120, 120);
  });
  assert.equal(card.calls.length, 2);
  assert.deepEqual(card.calls[1].frames.map((f) => f.height), ['120px', '300px']);
});

test('a menu hidden while it opens shrinks from how it is drawn', async () => {
  const { showMenu, hideMenu } = await load();
  const menu = element({ hidden: true });
  await withPage(TOKENS, () => {
    showMenu(menu);
    assert.equal(menu.hidden, false);
    const [{ frames: grow, options: inOptions }] = menu.calls;
    assert.equal(inOptions.duration, 300);
    assert.equal(inOptions.easing, 'cubic-bezier(0.05, 0.7, 0.1, 1)');
    assert.equal(grow[0].transform, 'scale(0.92)');
    assert.equal(grow[0].transformOrigin, 'top right');
    // Part way in.
    menu.drawn = { opacity: '0.4', transform: 'matrix(0.95, 0, 0, 0.95, 0, 0)' };
    hideMenu(menu);
  });
  const { frames: shrink, options } = menu.calls[1];
  assert.equal(options.duration, 150);
  assert.equal(options.easing, 'cubic-bezier(0.3, 0, 0.8, 0.15)');
  assert.deepEqual([shrink[0].opacity, shrink[0].transform], [0.4, 'matrix(0.95, 0, 0, 0.95, 0, 0)']);
  assert.deepEqual([shrink[1].opacity, shrink[1].transform], [0, 'scale(0.92)']);
  assert.equal(menu.hidden, false, 'hidden only once the fade is done');
});

test('under reduced motion nothing animates and nothing waits', async () => {
  const motion = await load();
  await withPage(REDUCED, async () => {
    const node = element();
    assert.equal(motion.easeHeight(node, 0, 300), null);
    assert.equal(motion.fadeIn(node), null);
    assert.equal(motion.fadeOut(node), null);
    assert.equal(motion.fadeIn(node, motion.tokens().short3), null);

    // The menu is shown and hidden at once.
    const menu = element({ hidden: true });
    motion.showMenu(menu);
    assert.equal(menu.hidden, false);
    motion.hideMenu(menu);
    assert.equal(menu.hidden, true);

    // The list's re-render happens, and the glide resolves straight away.
    const list = element();
    let changed = false;
    await motion.glideList(list, () => { changed = true; }, () => 'key');
    assert.equal(changed, true);

    for (const n of [node, menu, list]) assert.equal(n.calls.length, 0, 'no animation started');
  });
});

test('under reduced motion the accordion opens and closes at once', async () => {
  const { accordion } = await load();
  await withPage(REDUCED, () => {
    const summary = element({ localName: 'summary' });
    const details = element({ localName: 'details', open: false, children: [summary, element()] });
    accordion(details);
    let prevented = 0;
    const click = { target: summary, preventDefault: () => { prevented += 1; } };
    summary.dispatch('click', click);
    assert.equal(details.open, true);
    summary.dispatch('click', click);
    assert.equal(details.open, false);
    assert.equal(prevented, 2, 'the script, not the browser, opens and closes it');
    assert.equal(details.calls.length, 0);
  });
});
