/* Mountain Quest - page shell: touch detection, full screen, manual landscape, sound button. */
'use strict';
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
    document.body.classList.add('touch');
    window.__TOUCH = true;
  }
  // no text selection, no long-press callout, no image dragging on the game surface
  document.addEventListener('selectstart', function (e) { e.preventDefault(); }, true);
  document.addEventListener('dragstart', function (e) { e.preventDefault(); }, true);
  document.addEventListener('contextmenu', function (e) {
    var t = e.target;
    if (t && t.closest && t.closest('#touch, #ui, #game, #stage')) e.preventDefault();
  }, true);
  document.onselectstart = function () { return false; };
  (function () {
    var app = document.getElementById('app');
    var stage = document.getElementById('stage');
    var btnRot = document.getElementById('btnRot');
    var btnSnd = document.getElementById('btnSnd');
    var btnFull = document.getElementById('btnFull');
    var toastEl = document.getElementById('toast');
    var rotated = false;
    var toastTimer = 0;

    function toast(msg) {
      toastEl.textContent = msg;
      toastEl.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2400);
    }

    btnSnd.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (!window.__GQ) return;
      window.__GQ.toggleSound();
    });
    window.__MQ_TOAST = toast;
    window.__MQ_SYNC_SOUND = function (m) {
      btnSnd.classList.toggle('off', m);
      btnSnd.setAttribute('aria-label', m ? 'Sound is off, turn on' : 'Sound is on, turn off');
      btnSnd.setAttribute('aria-pressed', m ? 'false' : 'true');
    };

    function fsEl() {
      return document.fullscreenElement || document.webkitFullscreenElement || null;
    }
    function isFS() { return !!fsEl(); }

    function enterFull() {
      var fn = app.requestFullscreen || app.webkitRequestFullscreen;
      if (!fn) return Promise.reject(new Error('unsupported'));
      try {
        var p = fn.call(app, { navigationUI: 'hide' });
        return (p && p.then) ? p : Promise.resolve();
      } catch (e) { return Promise.reject(e); }
    }
    function exitFull() {
      var fn = document.exitFullscreen || document.webkitExitFullscreen;
      if (fn) { try { fn.call(document); } catch (e) {} }
    }

    function syncFS() {
      var on = isFS();
      btnFull.classList.toggle('on', on);
    }
    document.addEventListener('fullscreenchange', syncFS);
    document.addEventListener('webkitfullscreenchange', syncFS);

    btnFull.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (isFS()) { exitFull(); toast('Full screen off'); return; }
      enterFull().then(function () { toast('Full screen on'); })
        .catch(function () { toast('Full screen is not available in this browser'); });
    });

    function applyRotate() {
      if (!rotated) {
        stage.classList.remove('rot');
        stage.style.width = '';
        stage.style.height = '';
        btnRot.classList.remove('on');
        return;
      }
      var w = window.innerWidth, h = window.innerHeight;
      stage.classList.add('rot');
      stage.style.width = h + 'px';
      stage.style.height = w + 'px';
      btnRot.classList.add('on');
    }

    function setRotate(on, msg) {
      rotated = on;
      applyRotate();
      if (msg) toast(msg);
    }

    function lockLandscape() {
      var so = screen.orientation || null;
      if (so && so.lock) {
        try { return so.lock('landscape'); } catch (e) {}
      }
      return Promise.reject(new Error('no lock'));
    }

    btnRot.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();

      if (rotated) {
        var so = screen.orientation || null;
        if (so && so.unlock) { try { so.unlock(); } catch (err) {} }
        setRotate(false, 'Landscape off');
        return;
      }

      enterFull().then(function () {
        return lockLandscape();
      }).then(function () {
        // the browser claims it locked - check that the screen really turned
        setRotate(false);
        setTimeout(function () {
          if (window.innerHeight > window.innerWidth) setRotate(true, 'Turn your phone sideways');
          else toast('Landscape on');
        }, 700);
      }).catch(function () {
        setRotate(true, 'Turn your phone sideways');
      });
    });

    // the device may rotate on its own (auto-rotate on) - then drop the manual turn
    function onResize() {
      if (rotated && window.innerWidth > window.innerHeight) {
        setRotate(false);
      } else if (rotated) {
        applyRotate();
      }
    }
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', function () {
      setTimeout(onResize, 260);
    });

    // F toggles full screen, R toggles the landscape view
    window.addEventListener('keydown', function (e) {
      if (e.code === 'KeyF') {
        e.preventDefault();
        if (isFS()) exitFull();
        else enterFull().catch(function () {});
      }
      if (e.code === 'KeyR' && btnRot.offsetParent !== null) {
        e.preventDefault();
        btnRot.click();
      }
    });

    // a gentle nudge for phones held upright
    if (document.body.classList.contains('touch')) {
      setTimeout(function () {
        if (window.innerHeight > window.innerWidth) btnRot.classList.add('attn');
      }, 1400);
      setTimeout(function () { btnRot.classList.remove('attn'); }, 9000);
    }
  })();
