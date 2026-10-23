(() => {
  var d = document, heads = [].slice.call(d.querySelectorAll('.prose .section-head:not([data-read-end])')),
    rail = [].slice.call(d.querySelectorAll('.rail a')), secs = {}, cur, queued;
  if (!heads.length) return;
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
