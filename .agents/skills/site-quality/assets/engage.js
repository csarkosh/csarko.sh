// engage.js: counts one "read-<slug>" GoatCounter event when the reader reaches the end of a doc.
//
// Doc pages only: build_assets.py writes the <script defer data-slug> tag after count.js and
// strips these comment lines from the hashed copy, so the file fits what the 10 KB script budget
// leaves after count.js (see SKILL.md, "Analytics"). The end is the element docs_lib.mjs marks
// data-read-end: the Sources heading when the doc has one, else the "Written by" box.
//
// Nothing here can throw on a page without GoatCounter: a blocked count.js leaves window.goatcounter
// undefined and the event is simply not sent, and count.js itself ignores localhost and file:// previews.
(function () {
  var s = document.currentScript, end = document.querySelector('[data-read-end]');
  if (!s || !window.IntersectionObserver || !end) return;
  var o = new IntersectionObserver(function (es) {
    if (!es[es.length - 1].isIntersecting) return;
    o.disconnect();
    var send = function () {
      var g = window.goatcounter;
      if (g && g.count) g.count({ path: 'read-' + s.dataset.slug, event: true });
    };
    // count.js is async, so on a short doc the end can be on screen before it has run; the load
    // event waits for async scripts, so after it goatcounter is either there or blocked for good.
    if (document.readyState === 'complete') send(); else addEventListener('load', send);
  });
  o.observe(end);
})();
