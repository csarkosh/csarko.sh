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
    if (document.readyState === 'complete') send(); else addEventListener('load', send);
  });
  o.observe(end);
})();
