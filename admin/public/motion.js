/**
 * Material 3 motion for the admin pages (Cyrus, 2026-10-29; design
 * docs/superpowers/specs/2026-10-29-motion-design.md): the folded sections' accordion, the glide
 * of a list a chip filters, fades, a card easing to a new height, and the account menu. Plain
 * Web Animations, no dependency. Day Hike's page mirrors this API in its own repo.
 *
 * Every easing and duration is a motion token read off :root (theme.css's generated:theme
 * block), never typed here. Under prefers-reduced-motion: reduce the durations read 0ms, and a
 * duration of 0 means the end state at once: nothing is animated and nothing waits. Something
 * interrupted part way continues from where and how it is drawn (its computed height, transform
 * and opacity), never from its layout place.
 *
 * Nothing here touches the DOM until a function is called: the tests import it under plain Node.
 */

const EASINGS = { standard: 'easing-standard', decelerate: 'easing-emphasized-decelerate', accelerate: 'easing-emphasized-accelerate' };
const DURATIONS = ['short2', 'short3', 'short4', 'medium2', 'medium4'];

/** "150ms" → 150, "0.3s" → 300; `fallback` for anything that is not a CSS time. */
export function parseDuration(value, fallback = 0) {
  const m = /^\s*(\d*\.?\d+)(ms|s)\s*$/i.exec(String(value ?? ''));
  if (!m) return fallback;
  const n = Number(m[1]);
  return m[2].toLowerCase() === 's' ? Math.round(n * 1e6) / 1e3 : n;
}

/** The motion tokens as they are on :root now: three easings, and five durations in ms. */
export function tokens() {
  const css = getComputedStyle(document.documentElement);
  const read = (name) => css.getPropertyValue(`--md-${name}`).trim();
  const out = {};
  for (const [key, name] of Object.entries(EASINGS)) out[key] = read(name);
  for (const key of DURATIONS) out[key] = parseDuration(read(`duration-${key}`));
  return out;
}

// One animation, or null when there is nothing to animate: a 0 duration, no easing token, or no
// Web Animations.
function play(node, frames, { duration, easing, delay = 0, fill = 'none' }) {
  if (!(duration > 0) || !easing || typeof node?.animate !== 'function') return null;
  return node.animate(frames, { duration, easing, delay, fill });
}

// Still drawing (running, or finished and holding its last frame), as opposed to cancelled.
const live = (animation) => Boolean(animation) && animation.playState !== 'idle';

// An element's look as it is drawn now, its animations included; with none, its own.
function look(node) {
  const css = getComputedStyle(node);
  return { opacity: Number(css.opacity), transform: css.transform };
}

// A height keyframe. Border-box so the figure is the element's whole height (offsetHeight)
// whatever its own box-sizing; clipped so what does not fit yet stays hidden.
const tall = (px) => ({ height: `${px}px`, boxSizing: 'border-box', overflow: 'clip' });

// Resolves once every animation has finished or been cancelled.
const settled = (animations) => Promise.allSettled(animations.map((a) => a.finished)).then(() => {});

// ---------------------------------------------------------------- eased height

const heights = new WeakMap();

/**
 * Eases `el` from `from` px to `to` px tall (border box, as offsetHeight measures), medium2 on
 * the standard curve; its own height takes over when it ends. Null when `from === to` or the
 * duration is 0. Called again while an ease is in flight on `el`, it starts from the height drawn
 * now and goes to `el`'s own height measured without the old ease (which `to`, read while that
 * ease was applied, cannot be).
 */
export function easeHeight(el, from, to) {
  const t = tokens();
  const prev = heights.get(el);
  heights.delete(el);
  if (live(prev)) {
    from = el.offsetHeight;
    prev.cancel();
    to = el.offsetHeight;
  }
  if (from === to) return null;
  const animation = play(el, [tall(from), tall(to)], { duration: t.medium2, easing: t.standard });
  if (animation) heights.set(el, animation);
  return animation;
}

// ---------------------------------------------------------------- fades

const fades = new WeakMap();

// In: from 0 (or as drawn, a fade in flight) to its own opacity. Out: from as drawn to 0.
function fade(el, arriving, duration, easing, fill) {
  const prev = fades.get(el);
  fades.delete(el);
  const from = live(prev) || !arriving ? look(el).opacity : 0;
  prev?.cancel();
  const to = arriving ? look(el).opacity : 0;
  const animation = play(el, [{ opacity: from }, { opacity: to }], { duration, easing, fill });
  if (animation) fades.set(el, animation);
  return animation;
}

/**
 * Fades `el` in to its own opacity on the standard curve, over `duration` ms (a token's value;
 * medium2, content arriving, by default). From the opacity it is drawn at if a fade is in flight.
 * Null when the duration is 0.
 */
export function fadeIn(el, duration) {
  const t = tokens();
  return fade(el, true, duration ?? t.medium2, t.standard, 'none');
}

/**
 * Fades `el` out on the accelerate curve, over `duration` ms (short3 by default), from the
 * opacity it is drawn at, and holds it invisible until the caller removes or hides it, or a
 * fadeIn brings it back. Null when the duration is 0: the caller hides it at once.
 */
export function fadeOut(el, duration) {
  const t = tokens();
  return fade(el, false, duration ?? t.short3, t.accelerate, 'forwards');
}

// ---------------------------------------------------------------- the accordion

const wired = new WeakSet();

/**
 * A folded section that opens as an accordion. The <details> stays the element (keyboard, screen
 * readers and find-in-page keep working); its summary's click is taken over. Opening: the height
 * grows from closed to full over medium2 on the standard curve while the parts under the summary
 * fade in over short3, starting halfway into that fade's length. Closing: the parts fade out over
 * short2 while the height shrinks to closed over short4, both accelerating, and then `open` is
 * cleared; `data-closing` is on the element meanwhile, for the disclosure arrow to turn with it. A
 * click while it moves is ignored. A toggle it did not cause (find-in-page, a script, another
 * <details name> opening) just opens or closes, ending any motion in flight. Wiring it twice is
 * harmless.
 */
export function accordion(details) {
  if (wired.has(details)) return;
  const summary = [...details.children].find((node) => node.localName === 'summary');
  if (!summary) return;
  wired.add(details);
  let run = [];
  // The `open` a toggle of ours will report; any other toggle came from elsewhere.
  let expect = null;
  const parts = () => [...details.children].filter((node) => node !== summary);
  const set = (open) => {
    expect = open;
    details.open = open;
  };
  const stop = () => {
    run.forEach((a) => a.cancel());
    run = [];
    details.removeAttribute('data-closing');
  };
  const track = (animations, done) => {
    const mine = animations.filter(Boolean);
    if (!mine.length) return done();
    run = mine;
    settled(mine).then(() => {
      if (run !== mine) return;
      run = [];
      done();
      mine.forEach((a) => a.cancel());
    });
  };
  // Its height closed, without closing it (which would fire a toggle): the parts are taken out of
  // the layout for the measurement, within one task, so nothing is drawn that way.
  const closedHeight = () => {
    const was = parts().map((node) => [node, node.style.getPropertyValue('display'), node.style.getPropertyPriority('display')]);
    was.forEach(([node]) => node.style.setProperty('display', 'none', 'important'));
    const height = details.offsetHeight;
    was.forEach(([node, value, priority]) => node.style.setProperty('display', value, priority));
    return height;
  };

  details.addEventListener('toggle', () => {
    const ours = expect !== null && details.open === expect;
    expect = null;
    if (!ours) stop();
  });

  summary.addEventListener('click', (event) => {
    // A link or button inside the summary keeps its own click.
    const inner = event.target?.closest?.('a, button, input, select, textarea, label');
    if (inner && inner !== summary && summary.contains(inner)) return;
    event.preventDefault();
    if (run.length) return;
    const t = tokens();
    if (!details.open) {
      if (!t.medium2) return set(true);
      const from = details.offsetHeight;
      set(true);
      const to = details.offsetHeight;
      track([
        play(details, [tall(from), tall(to)], { duration: t.medium2, easing: t.standard }),
        ...parts().map((node) => play(node, [{ opacity: 0 }, { opacity: look(node).opacity }],
          { duration: t.short3, delay: t.short3 / 2, easing: t.standard, fill: 'backwards' })),
      ], () => {});
    } else {
      if (!t.short4) return set(false);
      const from = details.offsetHeight;
      const to = closedHeight();
      details.setAttribute('data-closing', '');
      track([
        play(details, [tall(from), tall(to)], { duration: t.short4, easing: t.accelerate, fill: 'forwards' }),
        ...parts().map((node) => play(node, [{ opacity: look(node).opacity }, { opacity: 0 }],
          { duration: t.short2, easing: t.accelerate, fill: 'forwards' })),
      ], () => {
        details.removeAttribute('data-closing');
        set(false);
      });
    }
  });
}

// ---------------------------------------------------------------- the glide

const glides = new WeakMap();

function stopGlide(host) {
  const state = glides.get(host);
  if (!state) return;
  glides.delete(host);
  state.run.forEach((a) => a.cancel());
  state.ghosts.forEach((g) => g.remove());
  if (state.position !== undefined) host.style.position = state.position;
}

/**
 * The glide of a list across a re-render (a chip that filters it): `change()` replaces `host`'s
 * children, and old and new children are matched by `keyOf` (unique within the list). Children
 * that stay glide from their old place to their new one (medium4, standard); new ones arrive,
 * fading in and rising 8 px with a slight scale (medium2, emphasized decelerate, short2 in); old
 * ones that are gone fade out where they were, as ghosts (short3, emphasized accelerate); and the
 * host's height eases to its new height over medium4. The timings are the public site's glide
 * (filters.js). A change during a glide starts from what is drawn. Resolves when it has settled;
 * at once, after `change()`, under reduced motion.
 */
export function glideList(host, change, keyOf) {
  const t = tokens();
  if (!t.medium4 || typeof host.animate !== 'function') {
    stopGlide(host);
    change();
    return Promise.resolve();
  }
  const children = () => [...host.children].filter((node) => !node.hasAttribute('data-ghost'));
  const shown = (node) => node.getClientRects().length > 0;

  // What is on screen: the host's height and each child as drawn, a glide in flight included.
  const fromHeight = host.offsetHeight;
  const before = new Map();
  for (const node of children()) {
    const key = keyOf(node);
    if (key != null && shown(node)) before.set(key, { node, ...look(node) });
  }
  stopGlide(host);
  // Then where each one is laid out, with that glide gone.
  const placeOf = (origin) => (node) => {
    const r = node.getBoundingClientRect();
    return { x: r.left - origin.left, y: r.top - origin.top, width: r.width, height: r.height };
  };
  const placeBefore = placeOf(host.getBoundingClientRect());
  for (const was of before.values()) was.at = placeBefore(was.node);

  change();

  const toHeight = host.offsetHeight;
  const placeAfter = placeOf(host.getBoundingClientRect());
  const state = { run: [], ghosts: [], position: undefined };
  const add = (animation) => { if (animation) state.run.push(animation); return animation; };
  const kept = new Set();

  for (const node of children()) {
    if (!shown(node)) continue;
    const key = keyOf(node);
    const was = key != null ? before.get(key) : undefined;
    const own = look(node);
    if (was) {
      kept.add(key);
      const at = placeAfter(node);
      const dx = was.at.x - at.x;
      const dy = was.at.y - at.y;
      const drawn = was.transform === 'none' ? '' : ` ${was.transform}`;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && !drawn && was.opacity === own.opacity) continue;
      add(play(node, [{ transform: `translate(${dx}px, ${dy}px)${drawn}`, opacity: was.opacity }, own],
        { duration: t.medium4, easing: t.standard }));
    } else {
      add(play(node, [{ opacity: 0, transform: 'translateY(8px) scale(0.98)' }, own],
        { duration: t.medium2, delay: t.short2, easing: t.decelerate, fill: 'backwards' }));
    }
  }

  for (const [key, was] of before) {
    if (kept.has(key) || !t.short3) continue;
    if (state.position === undefined && getComputedStyle(host).position === 'static') {
      state.position = host.style.position;
      host.style.position = 'relative';
    }
    const ghost = was.node.cloneNode(true);
    for (const node of [ghost, ...ghost.querySelectorAll('[id]')]) node.removeAttribute('id');
    ghost.setAttribute('data-ghost', '');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.inert = true;
    Object.assign(ghost.style, {
      position: 'absolute', margin: '0', boxSizing: 'border-box', pointerEvents: 'none',
      left: `${was.at.x - host.clientLeft + host.scrollLeft}px`, top: `${was.at.y - host.clientTop + host.scrollTop}px`,
      width: `${was.at.width}px`, height: `${was.at.height}px`, transform: was.transform, opacity: String(was.opacity),
    });
    host.append(ghost);
    state.ghosts.push(ghost);
    const out = add(play(ghost, [{ opacity: was.opacity }, { opacity: 0 }], { duration: t.short3, easing: t.accelerate, fill: 'forwards' }));
    out?.finished.then(() => ghost.remove(), () => {});
  }

  if (fromHeight !== toHeight) add(play(host, [tall(fromHeight), tall(toHeight)], { duration: t.medium4, easing: t.standard }));

  glides.set(host, state);
  return settled(state.run).then(() => {
    if (glides.get(host) !== state) return;
    glides.delete(host);
    state.ghosts.forEach((g) => g.remove());
    if (state.position !== undefined) host.style.position = state.position;
  });
}

// ---------------------------------------------------------------- the menu

// Each menu's show or hide in flight.
const menus = new WeakMap();
// It grows from the account button's corner (the menu hangs from the nav's right edge).
const CORNER = 'top right';
const SMALL = { opacity: 0, transform: 'scale(0.92)' };

/** Shows `menu`: it grows from 0.92 and fades in from its top-right corner, medium2, emphasized decelerate. */
export function showMenu(menu) {
  const prev = menus.get(menu);
  if (prev?.showing && live(prev.animation)) return;
  if (!menu.hidden && !live(prev?.animation)) return;
  const t = tokens();
  const from = live(prev?.animation) ? look(menu) : SMALL;
  prev?.animation.cancel();
  menus.delete(menu);
  menu.hidden = false;
  const animation = play(menu, [{ ...from, transformOrigin: CORNER }, { ...look(menu), transformOrigin: CORNER }],
    { duration: t.medium2, easing: t.decelerate });
  if (animation) menus.set(menu, { showing: true, animation });
}

/** Hides `menu`: it shrinks to 0.92 and fades out, short3, emphasized accelerate, and is `hidden` when done. */
export function hideMenu(menu) {
  const prev = menus.get(menu);
  if (menu.hidden || (prev && !prev.showing && live(prev.animation))) return;
  const t = tokens();
  const from = look(menu);
  prev?.animation.cancel();
  menus.delete(menu);
  const animation = play(menu, [{ ...from, transformOrigin: CORNER }, { ...SMALL, transformOrigin: CORNER }],
    { duration: t.short3, easing: t.accelerate, fill: 'forwards' });
  if (!animation) {
    menu.hidden = true;
    return;
  }
  menus.set(menu, { showing: false, animation });
  animation.finished.then(() => {
    if (menus.get(menu)?.animation !== animation) return;
    menus.delete(menu);
    menu.hidden = true;
    animation.cancel();
  }, () => {});
}
