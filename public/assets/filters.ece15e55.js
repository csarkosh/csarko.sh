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
  var sync = () => {
    var p = params(), on = boxes.filter((b) => b.checked).map((b) => b.value);
    p.delete('filter');
    var q = p.toString() + (on.length ? (p.toString() ? '&' : '') + 'filter=' + on.join(',') : '');
    history.replaceState(history.state, '', location.pathname + (q ? '?' + q : '') + location.hash);
  };
  if (want.filter(Boolean).length > boxes.filter((b) => b.checked).length) sync();
  form.addEventListener('change', sync);
  form.addEventListener('reset', () => setTimeout(sync));
})();
