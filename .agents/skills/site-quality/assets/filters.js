// filters.js: the filter chips' link, on /projects and /research (Cyrus, 2026-10-29). The chips
// filter on their own through CSS :has(); this only makes a filter shareable. On load it checks
// the chips a link names (?filter=film,games, the chips' values), and as chips change it writes
// the checked ones back into the address bar, so the page you see is the link you copy. Other
// query parameters (a ?ref= campaign tag) are kept. Without it the chips still work; a link just
// opens unfiltered. Whole-line comments like these are stripped before hashing (build_assets.py).
(() => {
  var form = document.querySelector('form.filters');
  if (!form) return;
  // /research's chips are checkboxes (several at once); /projects' are radios (one at a time), so a
  // link naming several opens on the first of them that the page has.
  var boxes = [].slice.call(form.querySelectorAll('input[type=checkbox], input[type=radio]'));
  var params = () => new URLSearchParams(location.search);
  var want = (params().get('filter') || '').split(/[\s,]+/);
  var one = false;
  want.forEach((v) => boxes.forEach((b) => {
    if (b.value !== v || (b.type === 'radio' && one)) return;
    b.checked = true;
    if (b.type === 'radio') one = true;
  }));
  // The page may have been styled before this ran, so the chips a link lit would fade in as if
  // clicked: a link's filter is simply there, so they take their state with no transition.
  if (boxes.some((b) => b.checked)) {
    var chips = [].slice.call(form.children);
    chips.forEach((c) => { c.style.transition = 'none'; });
    form.offsetWidth;
    chips.forEach((c) => { c.style.transition = ''; });
  }
  var sync = () => {
    var p = params(), on = boxes.filter((b) => b.checked).map((b) => b.value);
    p.delete('filter');
    // Written by hand so the commas stay commas (URLSearchParams would write %2C); the values are
    // slugs, so nothing needs escaping.
    var q = p.toString() + (on.length ? (p.toString() ? '&' : '') + 'filter=' + on.join(',') : '');
    history.replaceState(history.state, '', location.pathname + (q ? '?' + q : '') + location.hash);
  };
  // A link that named more than the chips took (two kinds on /projects) is rewritten to what shows.
  if (want.filter(Boolean).length > boxes.filter((b) => b.checked).length) sync();
  form.addEventListener('change', sync);
  // A reset clears the boxes after its event, so sync on the next task.
  form.addEventListener('reset', () => setTimeout(sync));

  // The glide (Material 3 motion, Cyrus 2026-10-29): leaving cards fade out where they were,
  // staying cards move from their old place to their new one, arriving cards fade in and rise, and
  // the list's height eases so nothing under it jumps. By the time a chip's change event fires,
  // :has() has already filtered the list, so "before" is a cache of each card's place in the list
  // (offsetLeft/Top within the list, which docs_lib.mjs positions: layout, not the transforms of a
  // glide in flight), refreshed whenever the list's size changes (load, fonts, a lazy picture, a
  // resize: a ResizeObserver) and after each glide. Every timing is a motion token; under reduced
  // motion they read 0ms and the filter is simply instant. The ?filter= applied above never
  // glides: nothing has changed yet when the cache is first taken.
  var list = document.querySelector('.project-list, .all-docs');
  if (!list || !list.animate) return;
  var items = [].slice.call(list.children), cache = new Map(), listH = 0, run = [], grow;
  var place = (li) => [li.offsetLeft, li.offsetTop, li.offsetWidth, li.offsetHeight];
  var remember = () => {
    cache = new Map();
    listH = 0;
    items.forEach((li) => {
      if (!li.offsetParent) return;
      var p = place(li);
      cache.set(li, p);
      // The list's natural height, from its cards: its own height is pinned while it eases.
      listH = Math.max(listH, p[1] + p[3]);
    });
  };
  var css = getComputedStyle(document.documentElement);
  var token = (name) => css.getPropertyValue('--md-' + name).trim();
  var ms = (name) => { var v = token('duration-' + name); return (parseFloat(v) || 0) * (/ms$/.test(v) ? 1 : 1000); };
  var glide = (before, h0) => {
    // A click during a glide starts from what is on screen: the list's height as it is, and each
    // card as it is drawn, its place plus the move or rise it is part way through, at the opacity it
    // has. A card this click hid has no style to read, so it is shown for the reading.
    if (grow && grow.playState === 'running') h0 = list.offsetHeight;
    var hid = items.filter((li) => before.has(li) && !li.offsetParent);
    hid.forEach((li) => { li.style.display = 'flex'; });
    var drawn = new Map(items.filter((li) => li.offsetParent).map((li) => {
      var cs = getComputedStyle(li), m = new DOMMatrix(cs.transform);
      return [li, { transform: cs.transform, opacity: +cs.opacity, x: m.e, y: m.f }];
    }));
    hid.forEach((li) => { li.style.display = ''; });
    run.forEach((a) => a.cancel());
    run = [];
    [].slice.call(list.querySelectorAll('[data-ghost]')).forEach((g) => g.remove());
    remember();
    var out = ms('short3'), move = ms('medium4'), arrive = ms('medium2');
    if (!move) return;
    var standard = token('easing-standard'), add = (el, frames, opts) => run.push(el.animate(frames, opts));
    items.forEach((li) => {
      var was = before.get(li), now = cache.get(li);
      if (was && !now && out) {
        var g = li.cloneNode(true);
        g.setAttribute('data-ghost', '');
        g.setAttribute('aria-hidden', 'true');
        g.inert = true;
        [g].concat([].slice.call(g.querySelectorAll('[id]'))).forEach((el) => el.removeAttribute('id'));
        var look = drawn.get(li);
        Object.assign(g.style, { display: 'flex', position: 'absolute', margin: 0, pointerEvents: 'none', transform: look.transform,
          left: was[0] + 'px', top: was[1] + 'px', width: was[2] + 'px', height: was[3] + 'px' });
        list.appendChild(g);
        var fade = g.animate([{ opacity: look.opacity }, { opacity: 0 }], { duration: out, easing: token('easing-emphasized-accelerate'), fill: 'forwards' });
        fade.onfinish = () => g.remove();
        run.push(fade);
      } else if (was && now) {
        var s = drawn.get(li), dx = was[0] + s.x - now[0], dy = was[1] + s.y - now[1];
        if (Math.abs(dx) >= 0.5 || Math.abs(dy) >= 0.5)
          add(li, [{ transform: 'translate(' + dx + 'px, ' + dy + 'px)' }, { transform: 'none' }], { duration: move, easing: standard });
      } else if (now && arrive) {
        add(li, [{ opacity: 0, transform: 'translateY(8px) scale(0.98)' }, { opacity: 1, transform: 'none' }],
          { duration: arrive, delay: ms('short2'), easing: token('easing-emphasized-decelerate'), fill: 'backwards' });
      }
    });
    // The height is clipped while it eases, so a card outside it shows only as the list reaches it.
    if (h0 !== listH) {
      grow = list.animate([{ height: h0 + 'px', overflow: 'clip' }, { height: listH + 'px', overflow: 'clip' }], { duration: move, easing: standard });
      run.push(grow);
    }
  };
  remember();
  if (window.ResizeObserver) new ResizeObserver(remember).observe(list);
  form.addEventListener('change', () => glide(cache, listH));
  // The reset's boxes clear after its event, so glide on the next task, as sync does, from the
  // places as they were now (a frame drawn in between would re-measure the filtered list).
  form.addEventListener('reset', () => {
    var before = cache, h0 = listH;
    setTimeout(() => glide(before, h0));
  });
})();
