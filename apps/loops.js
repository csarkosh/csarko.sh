// apps.csarko.sh's one script of its own: plays a picture's loop (product.mjs loopedHtml) only
// while it is worth playing. A loop is loaded the first time it is wanted and plays while its
// picture is on screen and is the one its swap and the layout switch show; it pauses the moment
// either stops being true. Under Reduce Motion nothing plays (the CSS hides the loops too).
(() => {
  const loops = [...document.querySelectorAll('video.loop[data-src]')];
  if (!loops.length || !('IntersectionObserver' in window)) return;
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const onScreen = new Set();

  // Shown: no box from the picture up to the page is hidden, or faded all the way out (a swap
  // or a layout not chosen). Mid-crossfade counts as shown.
  const shown = (el) => {
    for (; el && el !== document.body; el = el.parentElement) {
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
    }
    return true;
  };

  const update = (v) => {
    if (!still.matches && onScreen.has(v) && shown(v.parentElement)) {
      if (!v.src) {
        v.muted = true;
        v.src = v.dataset.src;
      }
      if (v.paused) v.play().catch(() => {});
    } else if (!v.paused) {
      v.pause();
    }
  };
  const updateAll = () => loops.forEach(update);

  const seen = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) onScreen.add(e.target);
      else onScreen.delete(e.target);
      update(e.target);
    }
  });
  for (const v of loops) {
    v.addEventListener('playing', () => v.classList.add('on'));
    seen.observe(v);
  }

  // A swap chip or the layout switch: look again at once (what was shown may be fading out)
  // and once the crossfade has run its course.
  document.addEventListener('change', (e) => {
    if (!e.target.matches('.swap-input, .layout-input')) return;
    updateAll();
    setTimeout(updateAll, 450);
  });
  still.addEventListener('change', updateAll);
})();
