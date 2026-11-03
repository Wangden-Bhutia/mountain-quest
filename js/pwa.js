/* Mountain Quest - offline support (service worker) and the "Install app" button. */
'use strict';
(function () {
  var toast = function (m) { if (window.__MQ_TOAST) window.__MQ_TOAST(m); };
  var deferred = null;

  function standalone() {
    return (window.matchMedia && (window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches)) || window.navigator.standalone === true;
  }
  function isIOS() {
    var ua = navigator.userAgent || '';
    return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }
  // 'prompt' (Chrome/Android offered install), 'ios' (show Add to Home Screen hint), or 'none'
  function mode() {
    if (standalone()) return 'none';
    if (deferred) return 'prompt';
    if (isIOS()) return 'ios';
    return 'none';
  }
  function sync() {
    var m = mode(), els = document.querySelectorAll('[data-act="install"]');
    for (var i = 0; i < els.length; i++) els[i].hidden = m === 'none';
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    sync();
  });
  window.addEventListener('appinstalled', function () {
    deferred = null; sync();
    toast('Installed. You can play from your home screen, even offline');
  });

  window.__MQ_INSTALL = function () {
    var m = mode();
    if (m === 'prompt') {
      var e = deferred;
      deferred = null;
      try { e.prompt(); } catch (err) {}
      Promise.resolve(e.userChoice).then(function (c) {
        if (c && c.outcome === 'dismissed') { deferred = null; }
        sync();
      });
      sync();
      return 'prompt';
    }
    if (m === 'ios') return 'ios';
    return 'none';
  };
  window.__MQ_INSTALL_MODE = mode;

  sync();

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === '127.0.0.1' || location.hostname === 'localhost')) {
    var hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' }).then(function (reg) {
      // phones keep tabs alive for days: look for a new build whenever the game comes back
      document.addEventListener('visibilitychange', function () { if (!document.hidden) reg.update().catch(function () {}); });
    }).catch(function () {});
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      // first install takes control quietly; later changes mean a new version is ready
      if (hadController) {
        var st = window.__MQ && window.__MQ.state ? window.__MQ.state() : null;
        var busy = st && st.state === 'play' && !st.paused;
        if (busy) toast('Update ready. It will load next time you open the game');
        else location.reload();   // not mid-run: switch to the new build now
      }
      hadController = true;
    });
  }
})();
