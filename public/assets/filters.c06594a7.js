(() => {
  var form = document.querySelector('form.filters');
  if (!form) return;
  var boxes = [].slice.call(form.querySelectorAll('input[type=checkbox]'));
  var params = () => new URLSearchParams(location.search);
  var want = (params().get('filter') || '').split(/[\s,]+/);
  boxes.forEach((b) => { if (want.indexOf(b.value) >= 0) b.checked = true; });
  var sync = () => {
    var p = params(), on = boxes.filter((b) => b.checked).map((b) => b.value);
    p.delete('filter');
    var q = p.toString() + (on.length ? (p.toString() ? '&' : '') + 'filter=' + on.join(',') : '');
    history.replaceState(history.state, '', location.pathname + (q ? '?' + q : '') + location.hash);
  };
  form.addEventListener('change', sync);
  form.addEventListener('reset', () => setTimeout(sync));
})();
