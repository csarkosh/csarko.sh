// reading.js: a doc page's one script of our own (2026-10-23). It lights the contents rail's
// current section, and tells lib-visits which sections were read: a "section" event once a
// section has spent 5 seconds across the middle of a visible screen, n 0 for the opening before
// section 01. A flick to the bottom passes every section in under a second and sends nothing, so
// the events tell a reader from a skimmer, which the leave beacon's depth and end mark cannot.
// Whole-line comments like these are stripped before the file is hashed (build_assets.py).
(() => {
  var d = document, heads = [].slice.call(d.querySelectorAll('.prose .section-head:not([data-read-end])')),
    rail = [].slice.call(d.querySelectorAll('.rail a')), secs = {}, cur, queued;
  if (!heads.length) return;
  // The last section whose heading is above the middle of the screen; -1 in the opening.
  var at = () => {
    var mid = innerHeight / 2, c = -1;
    heads.forEach((h, i) => { if (h.getBoundingClientRect().top < mid) c = i; });
    return c;
  };
  var spy = () => {
    queued = 0;
    var c = at();
    if (c === cur) return;
    cur = c;
    var href = c < 0 ? '' : '#' + heads[c].querySelector('h2').id;
    rail.forEach((a) => { if (a.getAttribute('href') === href) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
  };
  addEventListener('scroll', () => { if (!queued) { queued = 1; requestAnimationFrame(spy); } }, { passive: true });
  spy();
  setInterval(() => {
    if (d.visibilityState !== 'visible') return;
    var n = at() + 1;
    secs[n] = (secs[n] || 0) + 1;
    if (secs[n] === 5 && window.visits) visits.send('section', { n: n, of: heads.length });
  }, 1000);
})();
