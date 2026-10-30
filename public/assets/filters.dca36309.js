(() => {
  var form = document.querySelector('form.filters');
  if (!form) return;
  var boxes = [].slice.call(form.querySelectorAll('input[type=checkbox], input[type=radio]'));
  var params = () => new URLSearchParams(location.search);
  var want = (params().get('filter') || '').split(/[\s,]+/);
  var one = false;
  want.forEach((v) => boxes.forEach((b) => {
    if (b.value !== v || (b.type === 'radio' && one)) return;
    b.checked = true;
    if (b.type === 'radio') one = true;
  }));
  if (boxes.some((b) => b.checked)) {
    var chips = [].slice.call(form.children);
    chips.forEach((c) => { c.style.transition = 'none'; });
    form.offsetWidth;
    chips.forEach((c) => { c.style.transition = ''; });
  }
  var sync = () => {
    var p = params(), on = boxes.filter((b) => b.checked).map((b) => b.value);
    p.delete('filter');
    var q = p.toString() + (on.length ? (p.toString() ? '&' : '') + 'filter=' + on.join(',') : '');
    history.replaceState(history.state, '', location.pathname + (q ? '?' + q : '') + location.hash);
  };
  if (want.filter(Boolean).length > boxes.filter((b) => b.checked).length) sync();
  form.addEventListener('change', sync);
  var reset = () => {};
  form.addEventListener('reset', (e) => {
    e.preventDefault();
    boxes.forEach((b) => { b.checked = b.defaultChecked; });
    sync();
    reset();
  });

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
      listH = Math.max(listH, p[1] + p[3]);
    });
  };
  var css = getComputedStyle(document.documentElement);
  var token = (name) => css.getPropertyValue('--md-' + name).trim();
  var ms = (name) => { var v = token('duration-' + name); return (parseFloat(v) || 0) * (/ms$/.test(v) ? 1 : 1000); };
  var glide = (before, h0) => {
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
        var s = drawn.get(li), dx = was[0] - now[0], dy = was[1] - now[1];
        if (Math.abs(dx + s.x) >= 0.5 || Math.abs(dy + s.y) >= 0.5 || s.transform !== 'none' || s.opacity < 1)
          add(li, [{ transform: 'translate(' + dx + 'px, ' + dy + 'px) ' + (s.transform === 'none' ? '' : s.transform), opacity: s.opacity }, { transform: 'none', opacity: 1 }], { duration: move, easing: standard });
      } else if (now && arrive) {
        add(li, [{ opacity: 0, transform: 'translateY(8px) scale(0.98)' }, { opacity: 1, transform: 'none' }],
          { duration: arrive, delay: ms('short2'), easing: token('easing-emphasized-decelerate'), fill: 'backwards' });
      }
    });
    if (h0 !== listH) {
      grow = list.animate([{ height: h0 + 'px', overflow: 'clip' }, { height: listH + 'px', overflow: 'clip' }], { duration: move, easing: standard });
      run.push(grow);
    }
  };
  remember();
  if (window.ResizeObserver) new ResizeObserver(remember).observe(list);
  form.addEventListener('change', () => glide(cache, listH));
  reset = () => glide(cache, listH);
})();
