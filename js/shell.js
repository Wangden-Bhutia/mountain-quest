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

    function toast(msg, ms) {
      toastEl.textContent = msg;
      toastEl.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, ms || 2400);
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

    window.__MQ_FS = {
      enter: function () { if (!isFS()) enterFull().catch(function () {}); },
      toggle: function () { btnFull.click(); },
      isFS: isFS
    };
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
        stage.style.transform = '';
        btnRot.classList.remove('on');
        return;
      }
      // size from the box the page really has (#app is 100dvh), not innerHeight,
      // so the turned stage covers the whole visible screen
      var w = app.clientWidth || window.innerWidth, h = app.clientHeight || window.innerHeight;
      if (window.visualViewport) { w = Math.max(w, Math.round(visualViewport.width)); h = Math.max(h, Math.round(visualViewport.height)); }
      stage.classList.add('rot');
      stage.style.width = h + 'px';
      stage.style.height = w + 'px';
      stage.style.transform = 'translateX(' + w + 'px) rotate(90deg)';
      btnRot.classList.add('on');
    }

    // Safe areas follow the stage. Turned 90 degrees clockwise, the game's left edge
    // is the phone's top (status bar), its top is the phone's right, and so on.
    // Android Chrome reports no insets in a browser tab, so on touch screens the
    // turned game also keeps controls 48px off the real top and 24px off other edges.
    var rawProbe = document.createElement('div');
    rawProbe.className = 'safe-probe raw';
    document.body.appendChild(rawProbe);
    var TOP_MIN = 48, EDGE_MIN = 24;
    function syncSafe() {
      var cs = getComputedStyle(rawProbe);
      var t = parseFloat(cs.paddingTop) || 0, r = parseFloat(cs.paddingRight) || 0,
        b = parseFloat(cs.paddingBottom) || 0, l = parseFloat(cs.paddingLeft) || 0;
      var props = ['--sl', '--st', '--sr', '--sb'];
      if (rotated) {
        var touch = document.body.classList.contains('touch');
        var v = [Math.max(t, touch ? TOP_MIN : 0), Math.max(r, touch ? EDGE_MIN : 0),
          Math.max(b, touch ? EDGE_MIN : 0), Math.max(l, touch ? EDGE_MIN : 0)];
        for (var i = 0; i < 4; i++) stage.style.setProperty(props[i], v[i] + 'px');
      } else {
        for (var j = 0; j < 4; j++) stage.style.removeProperty(props[j]);
      }
      if (window.__MQ_RESAFE) window.__MQ_RESAFE();
    }
    window.__MQ_SYNC_SAFE = syncSafe;
    var HINT_KEY = 'mountain-quest:rot-hint';
    function rotHintOnce() {
      var seen = false;
      try { seen = localStorage.getItem(HINT_KEY) === '1'; localStorage.setItem(HINT_KEY, '1'); } catch (e) { seen = !!window.__mqRotHint; window.__mqRotHint = true; }
      if (seen) return false;
      toast('For full screen, tap Install app or the full-screen button. Tip: turn on auto-rotate so you can hold the phone sideways', 6500);
      return true;
    }

    function setRotate(on, msg) {
      rotated = on;
      applyRotate();
      syncSafe();
      if (window.__MQ_TURN) window.__MQ_TURN();
      if (on && rotHintOnce()) return;
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
        syncSafe();
      }
    }
    window.addEventListener('resize', onResize);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
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

    // ---- landscape first
    // Try to lock landscape on the first tap and whenever full screen starts.
    // Chrome only allows the lock in full screen or an installed app, so it may fail quietly.
    function tryLock() {
      var so = screen.orientation;
      if (!so || !so.lock || !document.body.classList.contains('touch')) return;
      try { var p = so.lock('landscape'); if (p && p.catch) p.catch(function () {}); } catch (err) {}
    }
    var lockedOnce = false;
    var rotFsTried = false;
    function firstGesture() {
      // turned by hand: the first tap also asks for full screen, which hides the status bar
      if (rotated && !rotFsTried && !isFS() && document.body.classList.contains('touch')) {
        rotFsTried = true; enterFull().catch(function () {});
      }
      if (lockedOnce) return; lockedOnce = true;
      if (isFS() || window.matchMedia('(display-mode: fullscreen)').matches || window.matchMedia('(display-mode: standalone)').matches) tryLock();
    }
    document.addEventListener('pointerdown', firstGesture, true);
    document.addEventListener('fullscreenchange', function () { if (isFS()) tryLock(); });

    var turnEl = document.getElementById('turn');
    var PORTRAIT_KEY = 'mountain-quest:portrait-ok';
    function portraitOK() { try { return localStorage.getItem(PORTRAIT_KEY) === '1'; } catch (err) { return !!window.__mqPortraitOK; } }
    function syncTurn() {
      var need = document.body.classList.contains('touch') && window.innerHeight > window.innerWidth &&
        !rotated && !portraitOK();
      if (need === !turnEl.hidden) return;
      turnEl.hidden = !need;
      document.body.classList.toggle('turn-open', need);
      document.dispatchEvent(new CustomEvent('mq-turn', { detail: { open: need } }));
      if (need) { try { document.getElementById('turnRotate').focus({ preventScroll: true }); } catch (err) {} }
    }
    window.__MQ_TURN = syncTurn;
    document.getElementById('turnAnyway').addEventListener('click', function () {
      try { localStorage.setItem(PORTRAIT_KEY, '1'); } catch (err) { window.__mqPortraitOK = true; }
      syncTurn();
      toast('Portrait it is. The rotate button turns the game any time');
    });
    document.getElementById('turnRotate').addEventListener('click', function () { btnRot.click(); });
    window.addEventListener('resize', syncTurn);
    window.addEventListener('orientationchange', function () { setTimeout(syncTurn, 260); });
    syncTurn();

    // a gentle nudge for phones held upright
    if (document.body.classList.contains('touch')) {
      setTimeout(function () {
        if (window.innerHeight > window.innerWidth) btnRot.classList.add('attn');
      }, 1400);
      setTimeout(function () { btnRot.classList.remove('attn'); }, 9000);
    }
  })();
