// filters.js: the filter chips' link, on /projects and /research (Cyrus, 2026-10-29). The chips
// filter on their own through CSS :has(); this only makes a filter shareable. On load it checks
// the chips a link names (?filter=film,games, the chips' values), and as chips change it writes
// the checked ones back into the address bar, so the page you see is the link you copy. Other
// query parameters (a ?ref= campaign tag) are kept. Without it the chips still work; a link just
// opens unfiltered. Whole-line comments like these are stripped before hashing (build_assets.py).
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
    // Written by hand so the commas stay commas (URLSearchParams would write %2C); the values are
    // slugs, so nothing needs escaping.
    var q = p.toString() + (on.length ? (p.toString() ? '&' : '') + 'filter=' + on.join(',') : '');
    history.replaceState(history.state, '', location.pathname + (q ? '?' + q : '') + location.hash);
  };
  form.addEventListener('change', sync);
  // A reset clears the boxes after its event, so sync on the next task.
  form.addEventListener('reset', () => setTimeout(sync));
})();
