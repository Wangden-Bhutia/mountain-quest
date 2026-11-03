/* Mountain Quest - game: rendering, audio, input, menus, saving.
   World physics live in physics.js and stage data in data.js. */
'use strict';
(function () {
  var PHYS = window.MQ_PHYS, DATA = window.MQ_DATA;
  var W = PHYS.W, H = PHYS.H, GY = PHYS.GY, STEP = PHYS.STEP;
  var LEVELS = DATA.LEVELS;
  var SHORE = null;

  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var DPR = Math.min(window.devicePixelRatio || 1, 2);
  function sizeCanvas() {
    var d = Math.min(window.devicePixelRatio || 1, 2);
    if (d === DPR && canvas.width === Math.round(W * DPR)) return;   // avoid clearing the canvas on every resize
    DPR = d;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
  }
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
  window.addEventListener('resize', sizeCanvas);

  // ---------------------------------------------------------------- save data
  var SAVE_KEY = 'mountain-quest:v1';
  var storageOK = true, storageWarned = false;
  function defaults() {
    return { v: 2, unlocked: 0, best: {}, finished: false,
      settings: { muted: false, sfx: true, music: true, motion: 'auto' } };
  }
  function loadSave() {
    var d = defaults();
    try {
      var raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return d;
      var s = JSON.parse(raw);
      if (!s || typeof s !== 'object') return d;
      // v1 saves (12 chapters) -> v2: five chapters were inserted after
      // Starlit Gorge (index 9), so later chapter numbers move up by five
      var old = (s.v | 0) < 2;
      var shift = function (i) { return old && i >= 10 ? i + 5 : i; };
      d.unlocked = Math.max(0, Math.min(LEVELS.length - 1, shift(s.unlocked | 0)));
      if (s.best && typeof s.best === 'object') {
        for (var k in s.best) {
          if (!Object.prototype.hasOwnProperty.call(s.best, k)) continue;
          var nk = shift(+k);
          if (+k >= 0 && nk < LEVELS.length) d.best[String(nk)] = Math.max(0, s.best[k] | 0);
        }
      }
      if (old && s.finished) d.unlocked = LEVELS.length - 1;
      d.finished = !!s.finished;
      if (s.settings) {
        d.settings.muted = !!s.settings.muted;
        d.settings.sfx = s.settings.sfx !== false;
        d.settings.music = s.settings.music !== false;
        d.settings.motion = ['auto', 'on', 'off'].indexOf(s.settings.motion) >= 0 ? s.settings.motion : 'auto';
      }
    } catch (e) { storageOK = false; }
    return d;
  }
  var SAVE = loadSave();
  function writeSave() {
    try { window.localStorage.setItem(SAVE_KEY, JSON.stringify(SAVE)); storageOK = true; }
    catch (e) {
      storageOK = false;
      if (!storageWarned) { storageWarned = true; toast('Progress can\u2019t be saved in this browser'); }
    }
  }
  function toast(msg) { if (window.__MQ_TOAST) window.__MQ_TOAST(msg); }

  // reduced motion: system setting unless the player chose otherwise
  var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var RM = false;
  function syncMotion() {
    var m = SAVE.settings.motion;
    RM = m === 'on' ? true : m === 'off' ? false : !!(mq && mq.matches);
    document.body.classList.toggle('rm', RM);
  }
  syncMotion();
  if (mq && mq.addEventListener) mq.addEventListener('change', syncMotion);

  // ---------------------------------------------------------------- assets
  var sprite = new Image(); sprite.src = ASSETS.sprite;
  var faceImg = new Image(); faceImg.src = ASSETS.face;
  var SPR_H = 88, SPR_W = 88 * (ASSETS.sprite_w / ASSETS.sprite_h);

  // ---------------------------------------------------------------- audio
  // The AudioContext is created on the first user gesture only (unlockAudio),
  // so Chrome never logs the autoplay warning and iOS/Android start cleanly.
  var AC = null, muted = !!SAVE.settings.muted;
  function ac() { return AC; }
  function unlockAudio() {
    if (!AC) {
      var C = window.AudioContext || window.webkitAudioContext;
      if (C) { try { AC = new C(); } catch (e) { AC = null; } }
      if (AC && mus.want) { var w = mus.want; mus.want = null; playSong(w.name, w.loop); }
    }
    if (AC && AC.state === 'suspended' && !document.hidden) { try { AC.resume(); } catch (e) {} }
  }
  function tone(f0, f1, dur, type, vol, delay) {
    if (muted || !SAVE.settings.sfx) return;
    var a = ac(); if (!a) return;
    var t0 = a.currentTime + (delay || 0);
    var o = a.createOscillator(), g = a.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(f0, t0);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol == null ? 0.09 : vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(a.destination);
    o.start(t0); o.stop(t0 + dur + 0.04);
  }
  var SFX = {
    jump: function () { tone(430, 780, 0.15, 'square', 0.06); },
    coin: function () { tone(1046, 1046, 0.06, 'square', 0.05); tone(1568, 1568, 0.12, 'square', 0.05, 0.06); },
    stomp: function () { tone(260, 80, 0.13, 'triangle', 0.1); },
    land: function () { tone(160, 90, 0.08, 'triangle', 0.05); },
    hurt: function () { tone(440, 110, 0.32, 'sawtooth', 0.07); },
    checkpoint: function () { tone(660, 660, 0.09, 'triangle', 0.06); tone(990, 990, 0.13, 'triangle', 0.06, 0.09); },
    win: function () { [523, 659, 784, 1046].forEach(function (f, i) { tone(f, f, 0.17, 'triangle', 0.07, i * 0.12); }); },
    over: function () { [392, 311, 247, 175].forEach(function (f, i) { tone(f, f * 0.92, 0.24, 'sawtooth', 0.06, i * 0.16); }); },
    ui: function () { tone(720, 900, 0.08, 'square', 0.05); },
    spring: function () { tone(300, 1200, 0.22, 'triangle', 0.08); },
    crumble: function () { tone(180, 60, 0.18, 'sawtooth', 0.04); },
    bosshit: function () { tone(200, 60, 0.25, 'square', 0.1); tone(520, 260, 0.2, 'triangle', 0.06, 0.05); }
  };

  // ---------------------------------------------------------------- music
  var NOTE_OFF = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function nf(name) {
    var m = /^([A-G])(#?)(-?\d)$/.exec(name);
    if (!m) return 0;
    var midi = (parseInt(m[3], 10) + 1) * 12 + NOTE_OFF[m[1]] + (m[2] ? 1 : 0);
    return 440 * Math.pow(2, (midi - 69) / 12);
  }
  function seq(str) { return str.trim().split(/\s+/); }

  var SONGS = {
    title: {
      tempo: 120,
      lead: seq('G4 . B4 . D5 . B4 .  A4 . C5 . E5 . D5 .  G4 . B4 . D5 . G5 .  F#5 . E5 . D5 . . .'),
      bass: seq('G2 . . . D3 . . .  C3 . . . G2 . . .  G2 . . . D3 . . .  E3 . . . D3 . . .'),
      drums: 'k.h.s.h.k.h.s.h.'
    },
    meadow: {
      tempo: 138,
      lead: seq('C5 . E5 . G5 . E5 .  D5 . F5 . A5 . G5 .  E5 . G5 . C6 . B5 .  A5 . G5 . F5 . E5 .'),
      bass: seq('C3 . . . G2 . . .  D3 . . . A2 . . .  C3 . . . F2 . . .  G2 . . . G2 . . .'),
      drums: 'k.h.s.h.k.h.s.h.'
    },
    lake: {
      tempo: 118,
      lead: seq('A4 . C5 . E5 . C5 .  B4 . D5 . F5 . E5 .  A4 . C5 . E5 . A5 .  G5 . E5 . D5 . C5 .'),
      bass: seq('A2 . . . E3 . . .  F2 . . . C3 . . .  A2 . . . E3 . . .  D3 . . . E3 . . .'),
      drums: 'k..h.s..hk.h.s.h.'
    },
    pines: {
      tempo: 112,
      lead: seq('D5 . F5 . A5 . F5 .  E5 . G5 . B5 . A5 .  D5 . F5 . A5 . D6 .  C6 . A5 . G5 . F5 .'),
      bass: seq('D3 . . . A2 . . .  B2 . . . F2 . . .  D3 . . . A2 . . .  G2 . . . A2 . . .'),
      drums: 'k..h..s.k..h.s.h.'
    },
    ice: {
      tempo: 146,
      lead: seq('E5 . B5 . E5 . B5 .  G5 . D6 . B5 . G5 .  E5 . B5 . E5 . G5 .  A5 . E6 . B5 . F#5 .'),
      bass: seq('E2 . . . B2 . . .  G2 . . . D3 . . .  E2 . . . B2 . . .  A2 . . . B2 . . .'),
      drums: 'k.h.s.h.k.h.s.s.'
    },
    summit: {
      tempo: 126,
      lead: seq('C5 . . G4 . C5 . E5  G5 . . E5 . G5 . C6  B5 . G5 . E5 . D5 .  C5 . E5 . G5 . C6 .'),
      bass: seq('C3 . . . G2 . . .  C3 . . . G2 . . .  A2 . . . E3 . . .  F2 . . . G2 . . .'),
      drums: 'k.h.s.h.k.h.s.hk'
    },
    fanfare: {
      tempo: 150,
      lead: seq('C5 . E5 . G5 . C6 .  . G5 . C6 . . . .'),
      bass: seq('C3 . . . C3 . . .  F2 . . . G2 . . .'),
      drums: 'k.h.s.hk.h.s.h.'
    },
    boss: {
      tempo: 152,
      lead: seq('E4 . G4 . A4 . G4 .  E4 . D4 . E4 . . .  E4 . G4 . B4 . A4 .  G4 . E4 . D4 . E4 .'),
      bass: seq('E2 . E2 . E2 . E2 .  C2 . C2 . D2 . D2 .  E2 . E2 . E2 . E2 .  C2 . D2 . E2 . . .'),
      drums: 'k.hsk.hsk.hsk.ss'
    },
    sad: {
      tempo: 96,
      lead: seq('G4 . F4 . E4 . D4 .  . C4 . . . . . .'),
      bass: seq('C3 . . . G2 . . .  C3 . . . . . . .'),
      drums: 'k...s.......h...'
    }
  };

  var mus = { song: null, name: '', step: 0, next: 0, gain: null, noise: null, loop: true, want: null };

  function musicOut() {
    var a = ac(); if (!a) return null;
    if (!mus.gain) {
      mus.gain = a.createGain();
      mus.gain.gain.value = 0.42;
      mus.gain.connect(a.destination);
    }
    return mus.gain;
  }

  function noiseBuf(a) {
    if (mus.noise) return mus.noise;
    var len = Math.floor(a.sampleRate * 0.3);
    var b = a.createBuffer(1, len, a.sampleRate);
    var d = b.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    mus.noise = b;
    return b;
  }

  function voice(f, t, dur, type, vol, out) {
    var a = ac(); if (!a || !f) return;
    var o = a.createOscillator(), g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out);
    o.start(t); o.stop(t + dur + 0.03);
  }

  function drum(kind, t, out) {
    var a = ac(); if (!a) return;
    if (kind === 'k') {
      var o = a.createOscillator(), g = a.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(160, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      g.gain.setValueAtTime(0.17, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
      o.connect(g); g.connect(out);
      o.start(t); o.stop(t + 0.2);
    } else {
      var s = a.createBufferSource(), g2 = a.createGain(), bp = a.createBiquadFilter();
      s.buffer = noiseBuf(a);
      bp.type = 'highpass';
      bp.frequency.value = kind === 's' ? 1400 : 6500;
      g2.gain.setValueAtTime(kind === 's' ? 0.085 : 0.045, t);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 's' ? 0.13 : 0.05));
      s.connect(bp); bp.connect(g2); g2.connect(out);
      s.start(t); s.stop(t + 0.2);
    }
  }

  function playSong(name, loop) {
    if (!SONGS[name]) return;
    var a = ac(); if (!a) { mus.want = { name: name, loop: loop }; return; }
    var out = musicOut(); if (!out) return;
    if (mus.name === name && mus.song) return;
    mus.name = name; mus.song = SONGS[name]; mus.step = 0;
    mus.loop = loop !== false;
    mus.next = a.currentTime + 0.06;
  }

  function stopSong() { mus.song = null; mus.name = ''; mus.want = null; }

  function musicTick() {
    if (!mus.song) return;
    var a = ac(); if (!a) return;
    if (muted || !SAVE.settings.music) { mus.next = a.currentTime + 0.3; return; }
    var out = musicOut(); if (!out) return;
    var s = mus.song, spb = 60 / s.tempo / 2;
    if (mus.next < a.currentTime) mus.next = a.currentTime + 0.05;
    while (mus.next < a.currentTime + 0.3) {
      var i = mus.step % s.lead.length;
      var t = mus.next;
      var ln = s.lead[i];
      if (ln && ln !== '.') voice(nf(ln), t, spb * 1.7, 'square', 0.042, out);
      var bn = s.bass[i % s.bass.length];
      if (bn && bn !== '.') voice(nf(bn), t, spb * 2.0, 'triangle', 0.07, out);
      var dk = s.drums.charAt(mus.step % s.drums.length);
      if (dk && dk !== '.') drum(dk, t, out);
      mus.next += spb;
      mus.step++;
      if (!mus.loop && mus.step >= s.lead.length) { mus.song = null; mus.name = ''; break; }
    }
  }
  // ---------------------------------------------------------------- input
  var held = { left: false, right: false, jump: false };
  function menuOpen() { return !!UI.open; }
  function press(k) {
    unlockAudio();
    held[k] = true;
    if (k === 'jump' && G.state === 'play' && !G.paused && G.S) G.S.jumpBuf = PHYS.consts.JUMP_BUFFER;
    onAction(k);
  }
  function release(k) { held[k] = false; }
  function releaseAll() {
    held.left = held.right = held.jump = false;
    var on = document.querySelectorAll('#touch button.on');
    for (var i = 0; i < on.length; i++) on[i].classList.remove('on');
  }

  var KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'jump', KeyW: 'jump', Space: 'jump'
  };
  window.addEventListener('keydown', function (e) {
    unlockAudio();
    if (document.body.classList.contains('turn-open')) return;
    if (e.code === 'Escape') { e.preventDefault(); onEscape(); return; }
    if (e.code === 'KeyP' && (!menuOpen() || UI.open === 'pause')) { togglePause(); e.preventDefault(); return; }
    if (menuOpen()) return;   // let menu buttons take Space / Enter normally
    if (e.code === 'KeyM') { setMuted(!SAVE.settings.muted); e.preventDefault(); return; }
    if (e.code === 'Enter' && G.state !== 'play') { e.preventDefault(); onAction('jump'); return; }
    var k = KEYMAP[e.code];
    if (k) { if (!e.repeat) press(k); e.preventDefault(); }
  });
  window.addEventListener('keyup', function (e) {
    var k = KEYMAP[e.code];
    if (k) { release(k); e.preventDefault(); }
  });
  // a key or finger released while the page is in the background never sends
  // keyup / pointerup, so clear everything when focus goes away
  window.addEventListener('blur', function () { releaseAll(); autoPause(); });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      releaseAll(); autoPause();
      if (AC && AC.state === 'running') { try { AC.suspend(); } catch (e) {} }
    } else if (AC && AC.state === 'suspended') { try { AC.resume(); } catch (e) {} }
  });

  function canvasPoint(e) {
    var cw = canvas.clientWidth || W, ch = canvas.clientHeight || H;
    var sc = Math.min(cw / W, ch / H);
    var ox = (cw - W * sc) / 2, oy = (ch - H * sc) / 2;
    var px = (e.offsetX == null ? 0 : e.offsetX);
    var py = (e.offsetY == null ? 0 : e.offsetY);
    return { x: (px - ox) / sc, y: (py - oy) / sc };
  }

  canvas.addEventListener('pointerdown', function (e) {
    unlockAudio();
    if (menuOpen()) return;
    var pt = canvasPoint(e);
    if (G.state === 'gameover') {
      for (var i = 0; i < GO_BTN.length; i++) {
        var b = GO_BTN[i];
        if (pt.x >= b.x && pt.x <= b.x + b.w && pt.y >= b.y && pt.y <= b.y + b.h) {
          if (b.id === 'replay') replay(); else endToTitle();
          return;
        }
      }
      return;
    }
    onAction('jump');
  });

  canvas.addEventListener('pointermove', function (e) {
    if (G.state !== 'gameover') { G.hoverBtn = null; return; }
    var pt = canvasPoint(e);
    G.hoverBtn = null;
    for (var i = 0; i < GO_BTN.length; i++) {
      var b = GO_BTN[i];
      if (pt.x >= b.x && pt.x <= b.x + b.w && pt.y >= b.y && pt.y <= b.y + b.h) G.hoverBtn = b.id;
    }
  });

  (function bindTouch() {
    var btns = document.querySelectorAll('[data-k]');
    for (var i = 0; i < btns.length; i++) {
      (function (b) {
        var k = b.getAttribute('data-k');
        b.addEventListener('pointerdown', function (e) {
          e.preventDefault();
          try { b.setPointerCapture(e.pointerId); } catch (err) {}
          b.classList.add('on'); press(k);
        });
        var up = function (e) { if (e) e.preventDefault(); b.classList.remove('on'); release(k); };
        b.addEventListener('pointerup', up);
        b.addEventListener('pointercancel', up);
        b.addEventListener('lostpointercapture', up);
        b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
      })(btns[i]);
    }
  })();

  // ---------------------------------------------------------------- tutorial
  var TUTORIAL = [
    { text: 'Tap  ▶  to walk right', kb: 'Press  →  to walk right', btn: 'right', done: function () { return G.p.x > 330; } },
    { text: 'Tap  JUMP  to jump', kb: 'Press  SPACE  to jump', btn: 'jump', done: function () { return G.jumped; } },
    { text: 'Run into the coins to collect them', btn: 'right', done: function () { return G.coins >= 3; } },
    { text: 'Jump across the water', btn: 'jump', done: function () { return G.p.x > 800; } },
    { text: 'Jump on a grump to bounce off it', btn: 'jump', done: function () { return G.stomps > 0; } },
    { text: 'Reach the pink flag!', btn: null, done: function () { return false; } }
  ];

  // ---------------------------------------------------------------- state
  var G = {
    state: 'title', idx: 0, lives: 3, coins: 0, total: 0,
    t: 0, camX: 0, look: 0, banner: 0, world: null, p: null, S: null,
    parts: [], shake: 0, flash: 0, paused: false,
    storyIdx: 0, storyT: 0, theme: null, themeName: 'meadow',
    tutStep: 0, jumped: false, stomps: 0, confetti: [], confettiT: 0
  };

  function syncFromSim() { var S = G.S; G.p = S.p; G.world = S.world; G.coins = S.coins; G.stomps = S.stomps; G.jumped = S.jumped; }

  function loadLevel(i) {
    var src = LEVELS[i];
    G.idx = i;
    G.S = PHYS.newState(src);
    syncFromSim();
    G.themeName = G.world.theme;
    G.theme = THEMES[G.world.theme] || THEMES.meadow;
    G.camX = 0; G.look = 0;
    G.banner = 2.4;
    G.parts = []; G.confetti = []; G.confettiT = 0;
    G.tutStep = 0;
    G.paused = false;
    setupSnow(G.theme);
    G.state = 'play';
    stopSong();
    playSong(G.world.song, true);
    releaseAll();
    syncHintButtons();
    syncChrome();
  }

  function setupSnow(th) {
    G.snow = [];
    var n = th.flakes || 0;
    if (RM) n = Math.round(n / 3);
    for (var i = 0; i < n; i++) {
      G.snow.push({ x: Math.random() * W, y: Math.random() * H, r: 1 + Math.random() * 2.2, sp: 22 + Math.random() * 46, dr: -18 + Math.random() * 36 });
    }
  }

  function storyNeed() {
    var st = DATA.STORY[Math.max(0, G.storyIdx - 1)];
    return st ? st.text.length / 95 + 0.4 : 0;
  }

  function showStory(i) {
    G.storyIdx = i; G.storyT = 0;
    G.state = 'story';
    G.world = null; G.p = null; G.S = null;
    G.themeName = LEVELS[i].theme;
    G.theme = THEMES[LEVELS[i].theme] || THEMES.meadow;
    setupSnow(G.theme);
    playSong('title', true);
    syncHintButtons(); syncChrome();
  }

  // start a chapter: training goes straight to play, chapters get their story card
  function startChapter(i, fresh) {
    if (fresh) { G.lives = 3; G.total = 0; }
    UI.close();
    if (i === 0) loadLevel(0); else showStory(i);
    SFX.ui();
  }

  function respawn() {
    PHYS.respawn(G.S);
    syncFromSim();
    G.flash = RM ? 0.08 : 0.25;
  }

  function replay() { G.lives = 3; loadLevel(G.idx); }

  function onAction(k) {
    if (k !== 'jump' || menuOpen()) return;
    if (G.state === 'title') { UI.show('main'); return; }
    if (G.state === 'story') {
      if (G.storyT < storyNeed() && !RM) { G.storyT = 99; return; }
      loadLevel(G.storyIdx);
      return;
    }
    if (G.state === 'complete') { if (G.t > 0.35) nextLevel(); return; }
    if (G.state === 'gameover') { if (G.t > 0.5) replay(); return; }
    if (G.state === 'win') { if (G.t > 0.8) { endToTitle(); UI.show('credits'); } return; }
  }

  function completeLevel() {
    G.state = 'complete'; G.t = 0;
    G.total += G.coins;
    var k = String(G.idx);
    SAVE.best[k] = Math.max(SAVE.best[k] || 0, G.coins);
    if (G.idx + 1 < LEVELS.length) SAVE.unlocked = Math.max(SAVE.unlocked, G.idx + 1);
    else { SAVE.finished = true; SAVE.unlocked = LEVELS.length - 1; }
    writeSave();
    spawnConfetti(RM ? 30 : 150);
    G.confettiT = RM ? 0 : 2.6;
    syncHintButtons(); syncChrome();
    SFX.win();
    burst(G.p.x + G.p.w / 2, G.p.y + 20, 26, '#ffe89a', 260, 1.1);
  }

  function nextLevel() {
    if (G.idx + 1 >= LEVELS.length) {
      G.state = 'win'; G.t = 0;
      spawnConfetti(RM ? 40 : 190);
      G.confettiT = RM ? 0 : 3.4;
      stopSong(); playSong('fanfare', false);
      SFX.win();
      syncChrome();
    } else {
      showStory(G.idx + 1);
    }
  }

  function endGame() {
    G.state = 'gameover'; G.t = 0;
    stopSong(); playSong('sad', false);
    SFX.over();
    releaseAll(); syncHintButtons(); syncChrome();
  }

  function endToTitle() {
    stopSong(); playSong('title', true);
    G.world = null; G.p = null; G.S = null;
    G.parts = []; G.confetti = []; G.confettiT = 0;
    G.state = 'title'; G.t = 0; G.lives = 3; G.paused = false;
    G.theme = THEMES.meadow; G.themeName = 'meadow'; G.camX = 0;
    setupSnow(G.theme);
    syncHintButtons(); syncChrome();
    UI.show('main');
  }

  function togglePause() {
    if (G.state !== 'play') return;
    if (G.paused) { G.paused = false; UI.close(); }
    else { G.paused = true; releaseAll(); UI.show('pause'); }
    syncChrome();
  }
  function autoPause() { if (G.state === 'play' && !G.paused) togglePause(); }

  function onEscape() {
    if (UI.open && UI.open !== 'main' && UI.open !== 'pause') { UI.back(); return; }
    if (UI.open === 'pause') { togglePause(); return; }
    if (G.state === 'play') { togglePause(); return; }
    if (G.state === 'gameover') { endToTitle(); return; }
  }

  function setMuted(m) {
    SAVE.settings.muted = !!m; muted = !!m; writeSave();
    if (window.__MQ_SYNC_SOUND) window.__MQ_SYNC_SOUND(muted);
    toast(muted ? 'Sound off' : 'Sound on');
  }

  function burst(x, y, n, color, spread, life) {
    if (RM) n = Math.ceil(n / 3);
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, sp = (spread || 160) * (0.35 + Math.random() * 0.8);
      G.parts.push({
        x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
        life: (life || 0.6) * (0.6 + Math.random() * 0.7), max: life || 0.6,
        color: color, size: 2 + Math.random() * 3.5, g: 900
      });
    }
  }

  function shake(v) { if (!RM) G.shake = v; }

  function fx(name, x, y) {
    switch (name) {
      case 'jump': SFX.jump(); burst(x, y, 6, '#e8f2ff', 90, 0.35); break;
      case 'land': SFX.land(); burst(x, y, 7, '#dbe8d2', 110, 0.35); break;
      case 'stomp': SFX.stomp(); burst(x, y, 12, '#c9d7e2', 190, 0.6); break;
      case 'coin': SFX.coin(); burst(x, y, 6, '#ffd85e', 130, 0.5); break;
      case 'checkpoint': SFX.checkpoint(); burst(x, y, 12, '#ffd0e0', 170, 0.7); break;
      case 'spring': SFX.spring(); burst(x, y, 8, '#ffd0e0', 140, 0.4); break;
      case 'crumble': SFX.crumble(); burst(x, y + 9, 10, '#a08c79', 120, 0.6); break;
      case 'nudge': SFX.land(); break;
      case 'bosshit': SFX.bosshit(); shake(0.4); burst(x, y, 18, '#f1e6c4', 240, 0.8); break;
      case 'bossdown': SFX.win(); shake(0.6); burst(x, y, 40, '#ffe89a', 320, 1.2); toast('Old Horn gives up the clapper!'); break;
    }
  }

  function loseLife(water) {
    G.lives--;
    SFX.hurt();
    if (water) burst(G.p.x + G.p.w / 2, GY + 30, 20, '#a9d8f0', 220, 0.8);
    else burst(G.p.x + G.p.w / 2, G.p.y + G.p.h / 2, 18, '#ff8fa8', 240, 0.8);
    shake(0.35);
    if (G.lives <= 0) endGame(); else respawn();
  }

  function updateWorld(dt) {
    var r = PHYS.step(G.S, held, dt, fx);
    syncFromSim();
    if (r === 'hurt') { loseLife(false); return; }
    if (r === 'fall') { loseLife(true); return; }
    if (r === 'goal') { completeLevel(); return; }

    var w = G.world, p = G.p;
    if (w.tutorial && G.tutStep < TUTORIAL.length) {
      var st = TUTORIAL[G.tutStep];
      if (st.done()) {
        G.tutStep++;
        SFX.checkpoint();
        burst(p.x + p.w / 2, p.y + 20, 10, '#ffe89a', 150, 0.6);
        syncHintButtons();
      }
    }

    // camera: smooth follow with a little look-ahead in the facing direction
    G.look += (p.face * 70 - G.look) * Math.min(1, dt * 2.5);
    var target = p.x + p.w / 2 - W * 0.4 + G.look;
    target = Math.max(0, Math.min(w.width - W, target));
    G.camX += (target - G.camX) * (1 - Math.exp(-dt * 8));
  }

  function updateParts(dt) {
    for (var i = G.parts.length - 1; i >= 0; i--) {
      var q = G.parts[i];
      q.vy += (q.g || 900) * dt;
      q.x += q.vx * dt; q.y += q.vy * dt;
      q.life -= dt;
      if (q.life <= 0) G.parts.splice(i, 1);
    }
    if (G.confettiT > 0) {
      G.confettiT -= dt;
      if (Math.random() < 0.75 * dt * 60) spawnConfetti(2);
    }
    for (var ci = G.confetti.length - 1; ci >= 0; ci--) {
      var cf = G.confetti[ci];
      cf.vy += 70 * dt;
      cf.x += (cf.vx + Math.sin(G.t * 2.4 + cf.sway) * 46) * dt;
      cf.y += cf.vy * dt;
      cf.rot += cf.vr * dt;
      if (cf.y > H + 40) G.confetti.splice(ci, 1);
    }
    if (G.snow && G.snow.length) {
      for (var si = 0; si < G.snow.length; si++) {
        var fl = G.snow[si];
        fl.y += fl.sp * dt;
        fl.x += (Math.sin(G.t * 0.8 + si) * 14 + fl.dr) * dt;
        if (fl.y > H + 6) { fl.y = -6; fl.x = Math.random() * W; }
        if (fl.x < -10) fl.x = W + 10;
        if (fl.x > W + 10) fl.x = -10;
      }
    }
    if (G.shake > 0) G.shake -= dt;
    if (G.flash > 0) G.flash -= dt;
    if (G.banner > 0) G.banner -= dt;
  }
  // ---------------------------------------------------------------- scenery
  var skyGrad = null, peakLayer = null, hillLayer = null;

  function fillMountains(g, pts, color, snow) {
    var i;
    g.beginPath();
    g.moveTo(pts[0][0], 600);
    for (i = 0; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.lineTo(pts[pts.length - 1][0], 600);
    g.closePath();
    g.fillStyle = color;
    g.fill();

    if (!snow) return;
    g.save();
    g.clip();
    for (i = 1; i < pts.length - 1; i++) {
      var a = pts[i - 1], b = pts[i], c = pts[i + 1];
      if (!(b[1] < a[1] && b[1] < c[1])) continue;
      var w2 = 26 + Math.abs(Math.sin(i * 2.3)) * 12;
      var d2 = 46 + Math.abs(Math.cos(i * 1.7)) * 22;
      g.beginPath();
      g.moveTo(b[0] - w2, b[1] + d2);
      g.lineTo(b[0] - w2 * 0.42, b[1] + d2 * 0.55);
      g.lineTo(b[0] - w2 * 0.16, b[1] + d2 * 0.78);
      g.lineTo(b[0], b[1] - 1);
      g.lineTo(b[0] + w2 * 0.26, b[1] + d2 * 0.6);
      g.lineTo(b[0] + w2 * 0.58, b[1] + d2 * 0.86);
      g.lineTo(b[0] + w2, b[1] + d2);
      g.closePath();
      g.fillStyle = 'rgba(246,251,255,0.96)';
      g.fill();
    }
    g.restore();
  }

  function fillHills(g, pts, color) {
    g.beginPath();
    g.moveTo(pts[0][0], 600);
    for (var i = 1; i < pts.length; i++) {
      var p = pts[i - 1], q = pts[i];
      var mx = (p[0] + q[0]) / 2;
      g.quadraticCurveTo(mx, Math.min(p[1], q[1]) - 12, q[0], q[1]);
    }
    g.lineTo(pts[pts.length - 1][0], 600);
    g.closePath();
    g.fillStyle = color;
    g.fill();
  }

  var THEMES = {
    meadow: {
      sky: ['#8fc7ea', '#c3e2f5', '#eaf6fb'], sun: 'rgba(255,247,214,0.95)',
      peaksBack: '#a8c0d4', peaksFront: '#6d8399', snowCaps: true,
      hills: ['#7bb287', '#54996a'], treeline: null,
      water: ['#5f9ec4', '#4a86ad', '#2f6486'],
      grass: '#4e9c4f', grassTop: '#67bb5f', blade: '#3f8a44', dirt: '#6d5540',
      platTop: '#5cb35a', platBody: '#8a6a4c', platHi: '#74cd6c',
      deco: 'flower', flakes: 0
    },
    lake: {
      sky: ['#7fc0e8', '#bfe3f6', '#e9f7fd'], sun: 'rgba(255,250,224,0.95)',
      peaksBack: '#9fbdd6', peaksFront: '#64809b', snowCaps: true,
      hills: ['#6fae87', '#4a8f68'], treeline: null,
      water: ['#57a3cd', '#3f88b3', '#2a6b8e'],
      grass: '#4b9d55', grassTop: '#68c06a', blade: '#3c8a47', dirt: '#6a5340',
      platTop: '#5cb35a', platBody: '#8a6a4c', platHi: '#74cd6c',
      deco: 'reed', flakes: 0
    },
    pines: {
      sky: ['#6fa8cf', '#a9cfe4', '#dcecf3'], sun: 'rgba(255,246,210,0.7)',
      peaksBack: '#8fa8ba', peaksFront: '#5b7288', snowCaps: false,
      hills: ['#4d8a63', '#31674a'], treeline: '#26543c',
      water: ['#3f7f9e', '#336a86', '#1f4a63'],
      grass: '#3f8a4c', grassTop: '#59a75f', blade: '#2f6f3b', dirt: '#5a4632',
      platTop: '#4f9d57', platBody: '#7a5c40', platHi: '#69bd6b',
      deco: 'pine', flakes: 0
    },
    ice: {
      sky: ['#a2c9e0', '#d2eaf6', '#f1faff'], sun: 'rgba(255,255,255,0.85)',
      peaksBack: '#c2d8e6', peaksFront: '#93adc0', snowCaps: true,
      hills: ['#d3e6f0', '#aac6d6'], treeline: null,
      water: ['#8fc4dd', '#6ba8c6', '#4d87a6'],
      grass: '#dceef8', grassTop: '#ffffff', blade: '#bcd6e6', dirt: '#8fa6b6',
      platTop: '#bfe0ef', platBody: '#7f97a8', platHi: '#e6f6ff',
      deco: 'snow', flakes: 70
    },
    summit: {
      sky: ['#93c2e4', '#c9e3f3', '#ecf8fd'], sun: 'rgba(255,252,232,0.9)',
      peaksBack: '#b9cede', peaksFront: '#87a0b5', snowCaps: true,
      hills: ['#a8b6ae', '#7b8d86'], treeline: null,
      water: ['#7fb0c9', '#639bb6', '#487a95'],
      grass: '#a3b2a8', grassTop: '#c6d2c9', blade: '#87968d', dirt: '#7d6a58',
      platTop: '#9fae9f', platBody: '#7a6a58', platHi: '#c3cfc2',
      deco: 'rock', flakes: 50
    },
    // new chapters
    ridge: {
      sky: ['#c79bb8', '#ecc3c4', '#fbe3d2'], sun: 'rgba(255,226,196,0.95)', cloud: 'rgba(255,240,236,0.85)',
      peaksBack: '#b79ab2', peaksFront: '#86708f', snowCaps: true,
      hills: ['#9d8a98', '#7c6a7a'], treeline: null,
      water: ['#8f8fb5', '#73739b', '#55557c'],
      grass: '#9c8f86', grassTop: '#c2b4a6', blade: '#7f726a', dirt: '#6e5a4e',
      platTop: '#b5a597', platBody: '#7a6658', platHi: '#d6c8b9',
      deco: 'rock', flakes: 20
    },
    storm: {
      sky: ['#5d6f82', '#8597a8', '#b9c6d1'], sun: 'rgba(230,238,245,0.35)', cloud: 'rgba(214,222,230,0.85)',
      peaksBack: '#7a8b9a', peaksFront: '#55687a', snowCaps: true,
      hills: ['#8496a3', '#64788a'], treeline: null,
      water: ['#55738a', '#445f74', '#2f475a'],
      grass: '#c5d3dc', grassTop: '#eef4f8', blade: '#a3b4c0', dirt: '#68727c',
      platTop: '#cfdbe3', platBody: '#6f7b86', platHi: '#f2f7fa',
      deco: 'snow', flakes: 130
    },
    dusk: {
      sky: ['#141d3b', '#2c3a68', '#5b5f8f'], sun: 'rgba(236,236,255,0.55)', cloud: 'rgba(120,132,180,0.45)', stars: true,
      peaksBack: '#36406b', peaksFront: '#262e52', snowCaps: true,
      hills: ['#2f3d5c', '#22304a'], treeline: '#1b2740',
      water: ['#2c4468', '#223756', '#172742'],
      grass: '#4a6a78', grassTop: '#6d93a0', blade: '#3b5866', dirt: '#3b3448',
      platTop: '#7fa3b0', platBody: '#4d4660', platHi: '#a9cad5',
      deco: 'rock', flakes: 0
    },
    dawn: {
      sky: ['#f2b98a', '#f9d9a8', '#fdf0d6'], sun: 'rgba(255,236,190,0.98)', cloud: 'rgba(255,248,236,0.9)',
      peaksBack: '#d8b4a4', peaksFront: '#a8837e', snowCaps: true,
      hills: ['#9fbf86', '#77a06a'], treeline: null,
      water: ['#7fb6c8', '#5f9ab0', '#447c93'],
      grass: '#5ea152', grassTop: '#7cc066', blade: '#4a8a44', dirt: '#6d5540',
      platTop: '#68b85c', platBody: '#8a6a4c', platHi: '#86d276',
      deco: 'flower', flakes: 0
    }
  };

  var PEAKS_BACK = [[-60, 300], [90, 200], [210, 262], [350, 128], [470, 240], [560, 300],
                    [690, 168], [800, 258], [930, 112], [1050, 236], [1160, 290], [1280, 170],
                    [1390, 250], [1520, 300], [1560, 300]];
  var PEAKS_FRONT = [[-60, 350], [80, 268], [200, 330], [320, 208], [430, 318], [540, 356],
                     [650, 250], [760, 330], [880, 190], [990, 310], [1100, 348], [1210, 262],
                     [1320, 336], [1440, 250], [1560, 340]];
  var HILL_A = [[-60, 130], [140, 96], [330, 132], [520, 92], [720, 126], [900, 94],
                [1090, 130], [1280, 100], [1470, 128], [1560, 118]];
  var HILL_B = [[-60, 176], [180, 148], [380, 180], [600, 146], [820, 178], [1040, 150],
                [1240, 182], [1440, 152], [1560, 172]];

  var layerCache = {};

  function layersFor(name) {
    if (layerCache[name]) return layerCache[name];
    var th = THEMES[name] || THEMES.meadow;

    var pk = document.createElement('canvas');
    pk.width = 1500; pk.height = 400;
    var g1 = pk.getContext('2d');
    fillMountains(g1, PEAKS_BACK, th.peaksBack, false);
    fillMountains(g1, PEAKS_FRONT, th.peaksFront, th.snowCaps);

    var hl = document.createElement('canvas');
    hl.width = 1500; hl.height = 260;
    var g2 = hl.getContext('2d');
    fillHills(g2, HILL_A, th.hills[0]);
    fillHills(g2, HILL_B, th.hills[1]);
    if (th.treeline) {
      g2.fillStyle = th.treeline;
      for (var x = -40; x < 1540; x += 46) {
        var hgt = 44 + ((x * 37) % 30);
        var base = 214;
        g2.beginPath();
        g2.moveTo(x, base);
        g2.lineTo(x + 17, base - hgt);
        g2.lineTo(x + 34, base);
        g2.closePath();
        g2.fill();
        g2.fillRect(x + 15, base - 4, 4, 10);
      }
    }

    var out = { peaks: pk, hills: hl };
    layerCache[name] = out;
    return out;
  }

  function buildLayers() { layersFor('meadow'); layersFor('pines'); }

  function tileLayer(layer, camX, par, y) {
    var off = -((camX * par) % layer.width);
    for (var x = off - layer.width; x < W + layer.width; x += layer.width) {
      ctx.drawImage(layer, Math.round(x), y);
    }
  }

  function themeSky(th) {
    if (!th._sky) {
      var g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, th.sky[0]);
      g.addColorStop(0.45, th.sky[1]);
      g.addColorStop(1, th.sky[2]);
      th._sky = g;
    }
    return th._sky;
  }

  function drawSky(camX, th) {
    ctx.fillStyle = themeSky(th);
    ctx.fillRect(0, 0, W, H);

    var sx = 800 - (camX * 0.04) % 200;
    var gr = ctx.createRadialGradient(sx, 90, 10, sx, 90, 150);
    gr.addColorStop(0, th.sun);
    gr.addColorStop(1, 'rgba(255,247,214,0)');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(sx, 90, 150, 0, 6.2832); ctx.fill();

    if (th.stars) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (var si = 0; si < 60; si++) {
        var stx = ((si * 157 - camX * 0.02) % W + W) % W, sty = (si * 89) % 300;
        var tw = RM ? 1 : 0.6 + 0.4 * Math.sin(G.t * 2 + si);
        ctx.globalAlpha = tw;
        ctx.fillRect(stx, sty, 2, 2);
      }
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = th.cloud || 'rgba(255,255,255,0.9)';
    for (var i = 0; i < 7; i++) {
      var cx = ((i * 340 - camX * 0.1 + G.t * 8) % 1600) - 300;
      var cy = 50 + (i % 3) * 46;
      cloud(cx, cy, 1 + (i % 2) * 0.35);
    }
  }

  function cloud(x, y, s) {
    ctx.beginPath();
    ctx.arc(x, y, 26 * s, 0, 6.2832);
    ctx.arc(x + 30 * s, y - 12 * s, 32 * s, 0, 6.2832);
    ctx.arc(x + 66 * s, y + 2 * s, 24 * s, 0, 6.2832);
    ctx.arc(x + 34 * s, y + 14 * s, 26 * s, 0, 6.2832);
    ctx.fill();
  }

  function drawScenery(camX, th) {
    var L = layersFor(G.themeName || 'meadow');
    tileLayer(L.peaks, camX, 0.14, 150);
    if (!th._hz) {
      var hz = ctx.createLinearGradient(0, 330, 0, 440);
      var hzc = th.stars ? '60,72,120' : '224,240,250';
      hz.addColorStop(0, 'rgba(' + hzc + ',0)');
      hz.addColorStop(0.55, 'rgba(' + hzc + ',0.42)');
      hz.addColorStop(1, 'rgba(' + hzc + ',0.88)');
      th._hz = hz;
    }
    ctx.fillStyle = th._hz;
    ctx.fillRect(0, 330, W, 110);
    tileLayer(L.hills, camX, 0.32, 300);

    if (!th._water) {
      var lg = ctx.createLinearGradient(0, 420, 0, H);
      lg.addColorStop(0, th.water[0]);
      lg.addColorStop(0.4, th.water[1]);
      lg.addColorStop(1, th.water[2]);
      th._water = lg;
    }
    ctx.fillStyle = th._water;
    ctx.fillRect(0, 420, W, H - 420);

    if (!SHORE) {
      SHORE = ctx.createLinearGradient(0, 420, 0, 448);
      SHORE.addColorStop(0, 'rgba(236,248,253,0.85)');
      SHORE.addColorStop(1, 'rgba(236,248,253,0)');
    }
    ctx.fillStyle = SHORE;
    ctx.fillRect(0, 420, W, 28);

    ctx.strokeStyle = 'rgba(255,255,255,0.32)';
    ctx.lineWidth = 2;
    for (var i = 0; i < 9; i++) {
      var yy = 432 + i * 11;
      var xx = ((i * 190 - camX * 0.45 + G.t * 12) % 500) - 60;
      ctx.beginPath();
      ctx.moveTo(xx, yy);
      ctx.lineTo(xx + 70 + (i % 3) * 40, yy);
      ctx.stroke();
    }
  }

  function rr(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function drawGround(w, camX, th) {
    for (var i = 0; i < w.ground.length; i++) {
      var x0 = w.ground[i][0] - camX, x1 = w.ground[i][1] - camX;
      if (x1 < -40 || x0 > W + 40) continue;
      var gwd = x1 - x0;

      ctx.fillStyle = th.dirt;
      ctx.fillRect(x0, GY + 8, gwd, H - GY);
      ctx.fillStyle = 'rgba(0,0,0,0.10)';
      for (var k = 0; k < gwd; k += 26) {
        var sxx = x0 + ((k * 37) % gwd);
        ctx.fillRect(sxx, GY + 26 + ((k * 53) % 46), 8, 4);
      }
      ctx.fillStyle = th.grass;
      ctx.fillRect(x0, GY, gwd, 14);
      ctx.fillStyle = th.grassTop;
      ctx.fillRect(x0, GY, gwd, 7);
      ctx.fillStyle = th.blade;
      for (var b = 0; b < gwd; b += 17) {
        ctx.fillRect(x0 + b, GY - 4, 3, 5);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      ctx.fillRect(x0, GY, 4, H - GY);
      ctx.fillRect(x1 - 4, GY, 4, H - GY);

      drawDeco(x0, gwd, th, w.ground[i][0]);
    }
  }

  function drawDeco(x0, gwd, th, worldX) {
    var step = th.deco === 'pine' ? 260 : 200;
    for (var f = 60; f < gwd - 40; f += step) {
      var fx = x0 + f, fy = GY - 6;
      if (th.deco === 'flower') {
        ctx.fillStyle = '#f4f0ff';
        ctx.beginPath(); ctx.arc(fx, fy, 3, 0, 6.2832); ctx.fill();
        ctx.fillStyle = '#ffd85e';
        ctx.beginPath(); ctx.arc(fx, fy, 1.4, 0, 6.2832); ctx.fill();
      } else if (th.deco === 'reed') {
        ctx.strokeStyle = 'rgba(40,110,90,0.75)';
        ctx.lineWidth = 2;
        for (var r = 0; r < 3; r++) {
          ctx.beginPath();
          ctx.moveTo(fx + r * 5, GY);
          ctx.quadraticCurveTo(fx + r * 5 + 3, GY - 12, fx + r * 5 + 8, GY - 20);
          ctx.stroke();
        }
      } else if (th.deco === 'pine') {
        var h = 78 + ((worldX + f) % 40);
        ctx.fillStyle = '#3b2f22';
        ctx.fillRect(fx - 3, GY - 12, 6, 14);
        ctx.fillStyle = '#2c6142';
        for (var t = 0; t < 3; t++) {
          var yy = GY - 10 - t * (h * 0.26);
          var ww = 26 - t * 6;
          ctx.beginPath();
          ctx.moveTo(fx - ww, yy);
          ctx.lineTo(fx, yy - h * 0.42);
          ctx.lineTo(fx + ww, yy);
          ctx.closePath();
          ctx.fill();
        }
      } else if (th.deco === 'snow') {
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.beginPath(); ctx.ellipse(fx, fy + 2, 16, 5, 0, 0, 6.2832); ctx.fill();
        ctx.fillStyle = 'rgba(180,214,232,0.9)';
        ctx.beginPath(); ctx.ellipse(fx, fy + 5, 12, 3, 0, 0, 6.2832); ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(120,130,124,0.85)';
        ctx.beginPath();
        ctx.moveTo(fx - 12, fy + 2);
        ctx.lineTo(fx - 4, fy - 9);
        ctx.lineTo(fx + 7, fy - 6);
        ctx.lineTo(fx + 13, fy + 2);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  function drawPlatforms(w, camX, th) {
    for (var i = 0; i < w.platforms.length; i++) {
      var p = w.platforms[i];
      var x = p[0] - camX;
      if (x + p[2] < -20 || x > W + 20) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.13)';
      rr(x + 3, p[1] + 5, p[2], 18, 8); ctx.fill();
      ctx.fillStyle = th.platBody;
      rr(x, p[1], p[2], 18, 7); ctx.fill();
      ctx.fillStyle = th.platTop;
      rr(x, p[1], p[2], 9, 6); ctx.fill();
      ctx.fillStyle = th.platHi;
      rr(x + 3, p[1] + 1, p[2] - 6, 4, 3); ctx.fill();
    }
    for (var j = 0; j < w.movers.length; j++) {
      var m = w.movers[j];
      var mx = m.cx - camX;
      if (mx + m.w < -20 || mx > W + 20) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      rr(mx + 3, m.cy + 5, m.w, m.h, 7); ctx.fill();
      ctx.fillStyle = '#b08a63';
      rr(mx, m.cy, m.w, m.h, 7); ctx.fill();
      ctx.fillStyle = '#7fd07a';
      rr(mx, m.cy, m.w, 8, 6); ctx.fill();
      // chain hint
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(mx + m.w / 2, m.cy + m.h);
      ctx.lineTo(mx + m.w / 2, m.cy + m.h + 16);
      ctx.stroke();
    }
  }

  function drawCoin(c, camX) {
    if (c.taken) return;
    var x = c.x - camX, y = c.y;
    if (x < -30 || x > W + 30) return;
    var s = Math.abs(Math.cos(G.t * 3.4 + c.ph));
    var rw = 5 + s * 7, rh = 13;
    ctx.save();
    ctx.translate(x, y);
    var g = ctx.createLinearGradient(-rw, 0, rw, 0);
    g.addColorStop(0, '#e0a52a');
    g.addColorStop(0.45, '#ffdd6b');
    g.addColorStop(1, '#e0a52a');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(0, 0, rw, rh, 0, 0, 6.2832); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(0, 0, Math.max(1.5, rw * 0.55), rh * 0.7, 0, 0, 6.2832); ctx.stroke();
    ctx.restore();
  }

  function drawEnemy(e, camX) {
    var x = e.x - camX, y = e.y;
    if (x < -80 || x > W + 80) return;
    if (e.dead) {
      if (e.deadT <= 0) return;
      var k = Math.max(0, e.deadT / 0.55);
      ctx.save();
      ctx.globalAlpha = k;
      ctx.translate(x + e.w / 2, y + e.h);
      ctx.scale(1.15, 0.35);
      ctx.fillStyle = '#5a6b7c';
      ctx.beginPath(); ctx.arc(0, -e.h / 2, e.w / 2, 0, 6.2832); ctx.fill();
      ctx.restore();
      return;
    }
    var bob = Math.sin(G.t * 8 + e.ph) * 2;
    ctx.save();
    ctx.translate(x + e.w / 2, y + e.h / 2 + bob);
    if (e.dir < 0) ctx.scale(-1, 1);

    if (e.type === 'hop') {
      ctx.fillStyle = '#e08a3c';
      ctx.beginPath(); ctx.ellipse(0, 0, e.w / 2, e.h / 2, 0, 0, 6.2832); ctx.fill();
      ctx.fillStyle = '#f7b667';
      ctx.beginPath(); ctx.ellipse(0, 4, e.w / 2 - 6, e.h / 2 - 8, 0, 0, 6.2832); ctx.fill();
      // feet
      ctx.fillStyle = '#a85f22';
      ctx.beginPath(); ctx.ellipse(-10, e.h / 2 - 2, 7, 4, 0, 0, 6.2832); ctx.fill();
      ctx.beginPath(); ctx.ellipse(10, e.h / 2 - 2, 7, 4, 0, 0, 6.2832); ctx.fill();
    } else {
      ctx.fillStyle = '#5a6b7c';
      ctx.beginPath(); ctx.ellipse(0, 0, e.w / 2, e.h / 2, 0, 0, 6.2832); ctx.fill();
      // fur tufts
      ctx.beginPath();
      ctx.moveTo(-e.w / 2 + 4, -2); ctx.lineTo(-e.w / 2 - 5, -8); ctx.lineTo(-e.w / 2 + 6, -10);
      ctx.moveTo(e.w / 2 - 4, -2); ctx.lineTo(e.w / 2 + 5, -8); ctx.lineTo(e.w / 2 - 6, -10);
      ctx.fill();
      ctx.fillStyle = '#7d8fa0';
      ctx.beginPath(); ctx.ellipse(0, 5, e.w / 2 - 7, e.h / 2 - 10, 0, 0, 6.2832); ctx.fill();
      // horns
      ctx.fillStyle = '#e8e2cf';
      ctx.beginPath(); ctx.moveTo(-12, -e.h / 2 + 3); ctx.lineTo(-17, -e.h / 2 - 7); ctx.lineTo(-7, -e.h / 2 + 1); ctx.fill();
      ctx.beginPath(); ctx.moveTo(12, -e.h / 2 + 3); ctx.lineTo(17, -e.h / 2 - 7); ctx.lineTo(7, -e.h / 2 + 1); ctx.fill();
      // feet
      ctx.fillStyle = '#3d4a57';
      ctx.beginPath(); ctx.ellipse(-11, e.h / 2 - 1, 8, 4.5, 0, 0, 6.2832); ctx.fill();
      ctx.beginPath(); ctx.ellipse(11, e.h / 2 - 1, 8, 4.5, 0, 0, 6.2832); ctx.fill();
    }
    // eyes
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(6, -5, 5.4, 0, 6.2832); ctx.arc(17, -5, 5.4, 0, 6.2832); ctx.fill();
    ctx.fillStyle = '#20262e';
    ctx.beginPath(); ctx.arc(7.6, -4.4, 2.6, 0, 6.2832); ctx.arc(18.6, -4.4, 2.6, 0, 6.2832); ctx.fill();
    ctx.restore();
  }

  function drawLeg(hx, hy, ang, len, shade) {
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(ang);
    ctx.fillStyle = shade ? '#1a5741' : '#26765c';
    rr(-6.5, -4, 13, len + 4, 6); ctx.fill();
    ctx.fillStyle = shade ? '#17503b' : '#1f6b53';
    rr(-6.5, len - 8, 13, 8, 4); ctx.fill();
    // shoe
    ctx.fillStyle = shade ? '#242d35' : '#333f49';
    rr(-9, len - 5, 20, 10, 5); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    rr(-7, len - 4, 12, 2.5, 1.5); ctx.fill();
    ctx.restore();
  }

  function drawPlayer(p, camX) {
    var x = p.x - camX;
    if (p.inv > 0 && Math.floor(G.t * 16) % 2 === 0) return;
    var cy = p.y;
    var sq = p.sq;

    // shadow
    if (p.onGround) {
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      ctx.beginPath(); ctx.ellipse(x + p.w / 2, cy + p.h - 2, 24, 6, 0, 0, 6.2832); ctx.fill();
    }

    var hipY = cy + p.h - 33 + sq * 3;
    var swing = p.onGround ? Math.sin(p.anim * 2.2) * 0.55 : 0.42;
    var len = 33 - sq * 4;

    // back leg
    drawLeg(x + p.w / 2 - 7, hipY, p.onGround ? -swing : -0.45, len, true);
    // front leg
    drawLeg(x + p.w / 2 + 7, hipY, p.onGround ? swing : 0.45, len, false);

    // torso sprite
    ctx.save();
    ctx.translate(x + p.w / 2, cy + SPR_H);
    if (p.face < 0) ctx.scale(-1, 1);
    ctx.rotate(p.tilt);
    var sh = SPR_H * (1 + sq * 0.06), sw = SPR_W * (1 - sq * 0.04);
    ctx.drawImage(sprite, -sw / 2, -sh, sw, sh);
    ctx.restore();
  }

  function drawCheckpoint(cp, camX) {
    var x = cp.x - camX;
    if (x < -40 || x > W + 40) return;
    ctx.fillStyle = '#9aa4ad';
    ctx.fillRect(x - 2, GY - 96, 4, 96);
    ctx.fillStyle = cp.hit ? '#7ee08a' : '#ff9db8';
    var wave = Math.sin(G.t * 5 + x * 0.05) * 4;
    ctx.beginPath();
    ctx.moveTo(x + 2, GY - 94);
    ctx.quadraticCurveTo(x + 26, GY - 88 + wave, x + 46, GY - 92);
    ctx.lineTo(x + 46, GY - 70);
    ctx.quadraticCurveTo(x + 26, GY - 66 + wave, x + 2, GY - 72);
    ctx.closePath(); ctx.fill();
  }

  function drawGoal(w, camX) {
    var x = w.goal - camX;
    if (x < -160 || x > W + 160) return;
    var locked = !PHYS.goalOpen(w);
    ctx.save();
    if (locked) ctx.globalAlpha = 0.35;
    // pole
    ctx.fillStyle = '#cfd8de';
    ctx.fillRect(x - 3, GY - 210, 6, 210);
    ctx.fillStyle = '#f6d76a';
    ctx.beginPath(); ctx.arc(x, GY - 216, 9, 0, 6.2832); ctx.fill();
    // flag
    var wave = RM ? 0 : Math.sin(G.t * 4) * 7;
    var g = ctx.createLinearGradient(x, 0, x + 90, 0);
    g.addColorStop(0, '#ff9db8');
    g.addColorStop(1, '#ffd0e0');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x + 3, GY - 206);
    ctx.quadraticCurveTo(x + 45, GY - 196 + wave, x + 92, GY - 204);
    ctx.lineTo(x + 92, GY - 156);
    ctx.quadraticCurveTo(x + 45, GY - 148 + wave, x + 3, GY - 156);
    ctx.closePath(); ctx.fill();
    // base
    ctx.fillStyle = '#8f9aa3';
    rr(x - 22, GY - 12, 44, 14, 5); ctx.fill();
    ctx.restore();
  }

  function drawSnow() {
    if (!G.snow || !G.snow.length) return;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (var i = 0; i < G.snow.length; i++) {
      var f = G.snow[i];
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, 6.2832);
      ctx.fill();
    }
  }

  var CONF_COLORS = ['#ff9db8', '#ffd85e', '#7fd07a', '#8fc7ea', '#ffffff', '#ff8a5c', '#c9a7ff'];

  function spawnConfetti(n) {
    for (var i = 0; i < n; i++) {
      G.confetti.push({
        x: Math.random() * W,
        y: -30 - Math.random() * 280,
        vx: (Math.random() - 0.5) * 90,
        vy: 90 + Math.random() * 180,
        w: 6 + Math.random() * 8,
        h: 9 + Math.random() * 10,
        rot: Math.random() * 6.28,
        vr: (Math.random() - 0.5) * 9,
        sway: Math.random() * 6.28,
        color: CONF_COLORS[(Math.random() * CONF_COLORS.length) | 0]
      });
    }
  }

  function drawConfetti() {
    for (var i = 0; i < G.confetti.length; i++) {
      var c = G.confetti[i];
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rot);
      ctx.fillStyle = c.color;
      ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h * Math.abs(Math.cos(c.rot * 0.9)) + 2);
      ctx.restore();
    }
  }

  function syncHintButtons() {
    try {
      var all = document.querySelectorAll('[data-k]');
      for (var i = 0; i < all.length; i++) all[i].classList.remove('hint');
      if (!G.world || !G.world.tutorial || G.state !== 'play') return;
      var st = TUTORIAL[G.tutStep];
      if (!st || !st.btn) return;
      var b = document.querySelector('[data-k="' + st.btn + '"]');
      if (b) b.classList.add('hint');
    } catch (e) {}
  }

  function drawHint() {
    var st = TUTORIAL[G.tutStep];
    if (!st) return;
    var label = (window.__TOUCH || !st.kb) ? st.text : st.kb;
    var font = '800 21px "Trebuchet MS", Verdana, sans-serif';
    ctx.font = font;
    var tw = ctx.measureText(label).width;
    var pw = tw + 54, ph = 54;
    var x = W / 2 - pw / 2, y = 108 + Math.sin(G.t * 2.2) * 3;
    ctx.save();
    ctx.fillStyle = 'rgba(14,30,44,0.84)';
    rr(x, y, pw, ph, 26); ctx.fill();
    ctx.strokeStyle = 'rgba(255,208,224,0.75)';
    ctx.lineWidth = 2;
    rr(x, y, pw, ph, 26); ctx.stroke();
    txt(label, W / 2, y + ph / 2 + 1, 21, '#ffffff', 'center', '800');
    ctx.fillStyle = 'rgba(14,30,44,0.84)';
    ctx.beginPath();
    ctx.moveTo(W / 2 - 11, y + ph - 1);
    ctx.lineTo(W / 2 + 11, y + ph - 1);
    ctx.lineTo(W / 2, y + ph + 13);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawParts(camX) {
    for (var i = 0; i < G.parts.length; i++) {
      var q = G.parts[i];
      var a = Math.max(0, Math.min(1, q.life / q.max));
      ctx.globalAlpha = a;
      ctx.fillStyle = q.color;
      ctx.beginPath();
      ctx.arc(q.x - camX, q.y, q.size * a, 0, 6.2832);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- new stage pieces
  function drawCrumbles(w, camX, th) {
    for (var i = 0; i < w.crumbles.length; i++) {
      var c = w.crumbles[i];
      var x = c.x - camX;
      if (x + c.w < -20 || x > W + 20) continue;
      if (c.state === 'gone') {
        if (c.back < 0.8) {
          ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 2;
          ctx.setLineDash([6, 6]); rr(x, c.y, c.w, 18, 7); ctx.stroke(); ctx.setLineDash([]);
        }
        continue;
      }
      var jx = (c.state === 'shake' && !RM) ? Math.sin(G.t * 70) * 2 : 0;
      ctx.fillStyle = 'rgba(0,0,0,0.13)';
      rr(x + 3 + jx, c.y + 5, c.w, 18, 8); ctx.fill();
      ctx.fillStyle = '#8b7766';
      rr(x + jx, c.y, c.w, 18, 7); ctx.fill();
      ctx.fillStyle = '#b9a896';
      rr(x + jx, c.y, c.w, 8, 6); ctx.fill();
      // cracks so the player can tell these stones apart
      ctx.strokeStyle = c.state === 'shake' ? '#5b2f2f' : 'rgba(60,44,36,0.75)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + jx + c.w * 0.3, c.y + 2); ctx.lineTo(x + jx + c.w * 0.36, c.y + 10); ctx.lineTo(x + jx + c.w * 0.3, c.y + 17);
      ctx.moveTo(x + jx + c.w * 0.68, c.y + 2); ctx.lineTo(x + jx + c.w * 0.62, c.y + 9); ctx.lineTo(x + jx + c.w * 0.7, c.y + 17);
      ctx.stroke();
    }
  }

  function drawSprings(w, camX) {
    for (var i = 0; i < w.springs.length; i++) {
      var s = w.springs[i];
      var x = s.x - camX;
      if (x + s.w < -20 || x > W + 20) continue;
      var h = s.squash > 0 ? 8 : 16;
      ctx.fillStyle = '#5c4632';
      rr(x, s.y - 5, s.w, 6, 3); ctx.fill();
      ctx.strokeStyle = '#cfd8de'; ctx.lineWidth = 3;
      ctx.beginPath();
      for (var k = 0; k < 4; k++) {
        ctx.moveTo(x + 8, s.y - 5 - k * h / 4); ctx.lineTo(x + s.w - 8, s.y - 5 - (k + 0.5) * h / 4);
      }
      ctx.stroke();
      ctx.fillStyle = '#ff7f9f';
      rr(x - 2, s.y - 9 - h, s.w + 4, 8, 4); ctx.fill();
      ctx.fillStyle = '#ffd0e0';
      rr(x + 2, s.y - 8 - h, s.w - 4, 3, 2); ctx.fill();
    }
  }

  function drawSpikes(w, camX, th) {
    var ice = th.deco === 'snow';
    for (var i = 0; i < w.spikes.length; i++) {
      var s = w.spikes[i];
      var x = s.x - camX;
      if (x + s.w < -20 || x > W + 20) continue;
      var n = Math.max(1, Math.round(s.w / 20)), sw = s.w / n;
      for (var k = 0; k < n; k++) {
        ctx.fillStyle = ice ? '#bfe6f7' : '#8d97a1';
        ctx.beginPath();
        ctx.moveTo(x + k * sw, s.y + s.h); ctx.lineTo(x + k * sw + sw / 2, s.y); ctx.lineTo(x + (k + 1) * sw, s.y + s.h);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = ice ? '#ffffff' : '#c3cbd2';
        ctx.beginPath();
        ctx.moveTo(x + k * sw + sw / 2, s.y); ctx.lineTo(x + k * sw + sw * 0.62, s.y + s.h); ctx.lineTo(x + k * sw + sw / 2, s.y + s.h);
        ctx.closePath(); ctx.fill();
      }
    }
  }

  function drawWind(w, camX) {
    if (!w.wind.length) return;
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    for (var i = 0; i < w.wind.length; i++) {
      var z = w.wind[i];
      var x0 = z.x0 - camX, x1 = z.x1 - camX;
      if (x1 < 0 || x0 > W) continue;
      var dir = z.f > 0 ? 1 : -1, len = z.x1 - z.x0;
      var n = Math.min(26, Math.round(len / 60));
      for (var k = 0; k < n; k++) {
        var phase = RM ? 0.5 : ((G.t * Math.abs(z.f) * 2.2 + k * 97) % len) / len;
        var fx = dir > 0 ? phase : 1 - phase;
        var sx = x0 + fx * len, sy = 150 + (k * 53) % 290;
        if (sx < -40 || sx > W + 40) continue;
        ctx.globalAlpha = 0.25 + 0.35 * Math.sin(phase * Math.PI);
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx - dir * 34, sy); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  // Old Horn: a giant grump, drawn with the same shapes as the little ones
  function drawBoss(b, camX) {
    if (!b || (b.dead && b.deadT <= 0)) return;
    var x = b.x - camX;
    if (x < -200 || x > W + 200) return;
    if (b.inv > 0 && !b.dead && Math.floor(G.t * 14) % 2 === 0) return;
    var S = b.w / 46;
    ctx.save();
    ctx.translate(x + b.w / 2, b.y + b.h / 2);
    if (b.dead) { ctx.globalAlpha = Math.max(0, b.deadT / 1.2); ctx.scale(1.1, 0.6); }
    if (b.dir < 0) ctx.scale(-1, 1);
    ctx.scale(S, b.h / 42);
    var e = { w: 46, h: 42 };
    ctx.fillStyle = '#4c5a69';
    ctx.beginPath(); ctx.ellipse(0, 0, e.w / 2, e.h / 2, 0, 0, 6.2832); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-e.w / 2 + 4, -2); ctx.lineTo(-e.w / 2 - 5, -8); ctx.lineTo(-e.w / 2 + 6, -10);
    ctx.moveTo(e.w / 2 - 4, -2); ctx.lineTo(e.w / 2 + 5, -8); ctx.lineTo(e.w / 2 - 6, -10);
    ctx.fill();
    ctx.fillStyle = '#9aa9b6';
    ctx.beginPath(); ctx.ellipse(0, 5, e.w / 2 - 7, e.h / 2 - 10, 0, 0, 6.2832); ctx.fill();
    // three big horns: one for each bounce he can take
    for (var k = 0; k < b.maxHp; k++) {
      ctx.fillStyle = k < b.hp ? '#f1e6c4' : 'rgba(241,230,196,0.25)';
      var hx = -12 + k * 12;
      ctx.beginPath(); ctx.moveTo(hx - 4, -e.h / 2 + 3); ctx.lineTo(hx, -e.h / 2 - 9); ctx.lineTo(hx + 4, -e.h / 2 + 3); ctx.fill();
    }
    ctx.fillStyle = '#2e3842';
    ctx.beginPath(); ctx.ellipse(-11, e.h / 2 - 1, 8, 4.5, 0, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.ellipse(11, e.h / 2 - 1, 8, 4.5, 0, 0, 6.2832); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(6, -5, 5.4, 0, 6.2832); ctx.arc(17, -5, 5.4, 0, 6.2832); ctx.fill();
    ctx.fillStyle = '#20262e';
    var sleepy = b.inv > 0 ? 1.2 : 2.6;
    ctx.beginPath(); ctx.arc(7.6, -4.4, sleepy, 0, 6.2832); ctx.arc(18.6, -4.4, sleepy, 0, 6.2832); ctx.fill();
    // bushy eyebrows
    ctx.strokeStyle = '#e8e2cf'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(1, -12); ctx.lineTo(11, -10); ctx.moveTo(13, -10); ctx.lineTo(23, -12); ctx.stroke();
    ctx.restore();
  }
  // ---------------------------------------------------------------- HUD
  function txt(str, x, y, size, color, align, weight) {
    ctx.font = (weight || '800') + ' ' + size + 'px "Trebuchet MS", Verdana, sans-serif';
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(str, x, y);
  }

  function txtShadow(str, x, y, size, color, align, weight) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 3;
    txt(str, x, y, size, color, align, weight);
    ctx.restore();
  }

  function roundFace(x, y, r) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 6.2832);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.clip();
    var d = r * 2.55;
    ctx.drawImage(faceImg, x - d / 2, y - d * 0.46, d, d);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.stroke();
  }

  function drawHUD() {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.28)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;

    // lives pill
    ctx.fillStyle = 'rgba(22,38,54,0.45)';
    rr(18, 16, 132, 52, 26); ctx.fill();
    roundFace(46, 42, 20);
    txt('× ' + Math.max(0, G.lives), 76, 44, 26, '#ffffff', 'left');

    // coins pill
    ctx.fillStyle = 'rgba(22,38,54,0.45)';
    rr(164, 16, 128, 52, 26); ctx.fill();
    ctx.fillStyle = '#ffd85e';
    ctx.beginPath(); ctx.arc(196, 42, 14, 0, 6.2832); ctx.fill();
    ctx.fillStyle = '#e0a52a';
    ctx.beginPath(); ctx.arc(196, 42, 8, 0, 6.2832); ctx.fill();
    txt('' + G.coins, 218, 44, 26, '#ffffff', 'left');
    ctx.restore();

    // chapter + level name
    var head = G.world.tutorial ? 'Training Ground' : ('Chapter ' + G.idx + ' · ' + G.world.name);
    var boss = G.world.boss;
    txtShadow(head, W / 2, 40, 23, 'rgba(255,255,255,0.95)', 'center');

    // progress
    var prog = Math.max(0, Math.min(1, (G.p.x / G.world.goal)));
    ctx.fillStyle = 'rgba(22,38,54,0.35)';
    rr(W / 2 - 120, 58, 240, 10, 5); ctx.fill();
    ctx.fillStyle = '#ffd0e0';
    rr(W / 2 - 120, 58, 240 * prog, 10, 5); ctx.fill();
    roundFace(W / 2 - 120 + 240 * prog, 63, 9);
    if (boss && !boss.dead) {
      txt('Old Horn', W / 2, 92, 16, '#ffe89a', 'center', '800');
      for (var bh = 0; bh < boss.maxHp; bh++) {
        ctx.fillStyle = bh < boss.hp ? '#ffe89a' : 'rgba(255,255,255,0.25)';
        rr(W / 2 - 52 + bh * 36, 104, 32, 10, 5); ctx.fill();
      }
    }

    // mute hint (keyboard only)
    if (window.__TOUCH) { return; }
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = 'rgba(22,38,54,0.45)';
    rr(18, 76, 132, 28, 14); ctx.fill();
    txt(muted ? 'M  sound off' : 'M  sound on', 32, 91, 14, '#ffffff', 'left', '600');
    ctx.globalAlpha = 1;
  }

  function coinsTxt(n) { return n + (n === 1 ? ' coin' : ' coins'); }

  function panel(x, y, w, h) {
    ctx.fillStyle = 'rgba(14,30,44,0.72)';
    rr(x, y, w, h, 26); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 2;
    rr(x, y, w, h, 26); ctx.stroke();
  }

  function drawTitle() {
    ctx.fillStyle = 'rgba(8,22,34,0.42)';
    ctx.fillRect(0, 0, W, H);

    var bob = Math.sin(G.t * 2) * 4;

    var tx = W * 0.3;
    txtShadow('MOUNTAIN QUEST', tx, 82, 50, '#ffffff', 'center');
    txt('a seventeen-chapter platform adventure', tx, 124, 18, 'rgba(255,255,255,0.94)', 'center', '600');
    txt('starring our bravest little mountaineer', tx, 148, 18, 'rgba(255,255,255,0.94)', 'center', '600');

    // grassy mound the hero stands on
    var mx = W * 0.3, my = 440;
    ctx.fillStyle = '#4e9c4f';
    ctx.beginPath();
    ctx.moveTo(mx - 120, my + 8);
    ctx.quadraticCurveTo(mx - 96, my - 22, mx - 40, my - 24);
    ctx.quadraticCurveTo(mx, my - 26, mx + 44, my - 23);
    ctx.quadraticCurveTo(mx + 100, my - 21, mx + 120, my + 8);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#67bb5f';
    ctx.beginPath();
    ctx.moveTo(mx - 108, my + 2);
    ctx.quadraticCurveTo(mx - 70, my - 24, mx, my - 25);
    ctx.quadraticCurveTo(mx + 70, my - 24, mx + 108, my + 2);
    ctx.quadraticCurveTo(mx, my - 8, mx - 108, my + 2);
    ctx.closePath(); ctx.fill();

    // hero standing on the mound
    var sh = 186, sw = sh * (ASSETS.sprite_w / ASSETS.sprite_h);
    var feetY = my - 20 + bob, legLen = 62, hipY = feetY - legLen;
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath(); ctx.ellipse(mx, feetY + 4, 40, 9, 0, 0, 6.2832); ctx.fill();
    ctx.save();
    ctx.translate(mx, hipY);
    ctx.scale(2.3, 2.3);
    drawLeg(-3.05, 0, 0.05, 27, true);
    drawLeg(3.05, 0, -0.05, 27, false);
    ctx.restore();
    ctx.drawImage(sprite, mx - sw / 2, hipY + 8 - sh, sw, sh);

    var hint = window.__TOUCH
      ? 'on-screen buttons move and jump  ·  rotate button for landscape'
      : '← →  move  ·  SPACE  jump  ·  P  pause  ·  M  sound  ·  F  full screen';
    txt(hint, tx, 520, 13, 'rgba(255,255,255,0.85)', 'center', '600');
  }

  function drawComplete() {
    ctx.fillStyle = 'rgba(8,22,34,0.55)';
    ctx.fillRect(0, 0, W, H);
    panel(W / 2 - 300, 110, 600, 320);
    txtShadow(G.world.tutorial ? 'TRAINING DONE!' : 'CHAPTER CLEAR!', W / 2, 176, 44, '#ffe89a', 'center');
    roundFace(W / 2, 234, 32);
    var outro = G.world.tutorial
      ? 'She knows how to run, jump and bounce now. The trail up the valley is waiting.'
      : (DATA.OUTRO[G.idx - 1] || '');
    var lines = wrapText(outro, 500, '600 19px "Trebuchet MS", Verdana, sans-serif');
    for (var i = 0; i < lines.length; i++) {
      txt(lines[i], W / 2, 292 + i * 26, 19, '#ffffff', 'center', '600');
    }
    txt(G.world.name + '  ·  ' + coinsTxt(G.coins), W / 2, 350, 20, '#ffd0e0', 'center', '700');
    var a = RM ? 1 : 0.6 + Math.sin(G.t * 5) * 0.4;
    ctx.globalAlpha = a;
    var label = G.idx + 1 >= LEVELS.length ? 'SPACE / TAP to ring the bell' : 'SPACE / TAP to continue the story';
    txt(label, W / 2, 400, 19, '#ffe89a', 'center');
    ctx.globalAlpha = 1;
  }

  var GO_BTN = [
    { id: 'replay', x: W / 2 - 236, y: 282, w: 224, h: 66, label: 'REPLAY' },
    { id: 'end', x: W / 2 + 12, y: 282, w: 224, h: 66, label: 'END GAME' }
  ];

  function drawGoBtn(b) {
    var hot = G.hoverBtn === b.id;
    ctx.fillStyle = hot ? 'rgba(255,208,224,0.95)' : 'rgba(255,255,255,0.16)';
    rr(b.x, b.y, b.w, b.h, 20); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2;
    rr(b.x, b.y, b.w, b.h, 20); ctx.stroke();
    txt(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1, 19, hot ? '#1b2b38' : '#ffffff', 'center', '800');
  }

  function drawGameOver() {
    ctx.fillStyle = 'rgba(8,22,34,0.62)';
    ctx.fillRect(0, 0, W, H);
    panel(W / 2 - 270, 130, 540, 296);
    txtShadow('OUT OF LIVES', W / 2, 186, 40, '#ffffff', 'center');
    txt('You had ' + coinsTxt(G.coins) + ' on this trail.', W / 2, 230, 20, 'rgba(255,255,255,0.9)', 'center', '600');
    for (var i = 0; i < GO_BTN.length; i++) drawGoBtn(GO_BTN[i]);
    txt('SPACE / JUMP  replay   ·   ESC  end', W / 2, 392, 15, 'rgba(255,255,255,0.7)', 'center', '600');
  }

  function drawWin() {
    ctx.fillStyle = 'rgba(8,22,34,0.55)';
    ctx.fillRect(0, 0, W, H);
    panel(W / 2 - 290, 70, 580, 390);
    txtShadow(DATA.ENDING.title, W / 2, 124, 40, '#ffe89a', 'center');
    roundFace(W / 2, 196, 34);
    var el = [], paras = DATA.ENDING.text.split('\n\n');
    for (var pi = 0; pi < paras.length; pi++) {
      el = el.concat(wrapText(paras[pi], 500, '600 16px "Trebuchet MS", Verdana, sans-serif'));
    }
    for (var i = 0; i < el.length; i++) {
      txt(el[i], W / 2, 244 + i * 21, 16, '#ffffff', 'center', '600');
    }
    txt('Coins this journey: ' + G.total, W / 2, 244 + el.length * 21 + 10, 20, '#ffd0e0', 'center');
    var a = RM ? 1 : 0.6 + Math.sin(G.t * 5) * 0.4;
    ctx.globalAlpha = a;
    txt('SPACE / TAP for the credits', W / 2, 444, 19, '#ffffff', 'center');
    ctx.globalAlpha = 1;
  }

  function drawPaused() {
    ctx.fillStyle = 'rgba(8,22,34,0.5)';
    ctx.fillRect(0, 0, W, H);

  }

  function wrapText(str, maxW, font) {
    ctx.font = font;
    var out = [], words = String(str).split(' '), line = '';
    for (var i = 0; i < words.length; i++) {
      var test = line ? line + ' ' + words[i] : words[i];
      if (ctx.measureText(test).width > maxW && line) { out.push(line); line = words[i]; }
      else line = test;
    }
    if (line) out.push(line);
    return out;
  }

  function drawStory() {
    var st = DATA.STORY[Math.max(0, G.storyIdx - 1)] || DATA.STORY[0];
    ctx.fillStyle = 'rgba(8,22,34,0.55)';
    ctx.fillRect(0, 0, W, H);

    var px = 110, py = 50, pw = 740, ph = 440;
    panel(px, py, pw, ph);
    roundFace(px + 70, py + 74, 42);

    txt('CHAPTER ' + G.storyIdx + ' OF ' + (LEVELS.length - 1), px + 134, py + 54, 17, '#ffd0e0', 'left', '800');
    txtShadow(st.title, px + 134, py + 90, 34, '#ffffff', 'left');

    var font = '600 18px "Trebuchet MS", Verdana, sans-serif';
    var lines = [], paras = st.text.split('\n\n'), i, j;
    for (i = 0; i < paras.length; i++) {
      var wl = wrapText(paras[i], pw - 84, font);
      for (j = 0; j < wl.length; j++) lines.push(wl[j]);
      if (i < paras.length - 1) lines.push('');
    }

    var budget = RM ? 99999 : Math.floor(G.storyT * 95);
    var y = py + 148;
    for (i = 0; i < lines.length; i++) {
      var ln = lines[i];
      if (ln === '') { y += 18; continue; }
      if (budget > 0) {
        txt(ln.slice(0, budget), px + 42, y, 18, 'rgba(255,255,255,0.94)', 'left', '600');
        budget -= ln.length;
      }
      y += 25;
    }

    if (G.storyT >= storyNeed() || RM) {
      var a = RM ? 1 : 0.6 + Math.sin(G.t * 5) * 0.4;
      ctx.globalAlpha = a;
      txt('SPACE / TAP to set off', W / 2, py + ph - 30, 19, '#ffe89a', 'center');
      ctx.globalAlpha = 1;
    }
  }

  // ---------------------------------------------------------------- render
  function render() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);

    var camX = Math.round(G.camX * 2) / 2;
    ctx.save();
    if (G.shake > 0 && !RM) {
      ctx.translate((Math.random() - 0.5) * 10 * G.shake, (Math.random() - 0.5) * 10 * G.shake);
    }

    var th = G.theme || THEMES.meadow;
    drawSky(camX, th);
    drawScenery(camX, th);

    if (G.world) {
      var w = G.world;
      drawGround(w, camX, th);
      drawPlatforms(w, camX, th);
      drawCrumbles(w, camX, th);
      drawSprings(w, camX);
      drawSpikes(w, camX, th);
      for (var i = 0; i < w.checkpoints.length; i++) drawCheckpoint(w.checkpoints[i], camX);
      drawGoal(w, camX);
      for (var j = 0; j < w.coins.length; j++) drawCoin(w.coins[j], camX);
      for (var k = 0; k < w.enemies.length; k++) drawEnemy(w.enemies[k], camX);
      drawBoss(w.boss, camX);
      if (G.p) drawPlayer(G.p, camX);
      drawParts(camX);
      drawWind(w, camX);
    }
    drawSnow();
    ctx.restore();

    if (G.state === 'play') {
      drawHUD();
      if (G.banner > 0) {
        var a = Math.min(1, G.banner) * Math.min(1, (2.2 - G.banner) * 4);
        ctx.globalAlpha = Math.max(0, Math.min(1, a));
        ctx.fillStyle = 'rgba(14,30,44,0.6)';
        rr(W / 2 - 200, 200, 400, 78, 22); ctx.fill();
        txt(G.world.name, W / 2, 226, 30, '#ffffff', 'center');
        var sub = G.world.tutorial ? 'let us learn the buttons' : ('chapter ' + G.idx + ' of ' + (LEVELS.length - 1));
        txt(sub, W / 2, 258, 16, '#ffd0e0', 'center', '600');
        ctx.globalAlpha = 1;
      }
      if (G.world.tutorial && G.tutStep < TUTORIAL.length) drawHint();
      if (G.paused) drawPaused();
    } else if (G.state === 'title') {
      drawTitle();
    } else if (G.state === 'story') {
      drawStory();
    } else if (G.state === 'complete') {
      drawHUD();
      drawComplete();
    } else if (G.state === 'gameover') {
      drawHUD();
      drawGameOver();
    } else if (G.state === 'win') {
      drawWin();
    }

    if (G.state === 'complete' || G.state === 'win') drawConfetti();

    if (G.flash > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + (G.flash * 0.9) + ')';
      ctx.fillRect(0, 0, W, H);
    }
  }

  // ---------------------------------------------------------------- loop
  // Fixed 120 Hz simulation with an accumulator: the same jump goes the same
  // distance on a 30, 60, 90 or 144 Hz screen, and long hitches are capped.
  var last = 0, acc = 0;
  function tick(dt) {
    G.t += dt;
    if (G.state === 'story') G.storyT += dt;
    if (G.state === 'play' && !G.paused) updateWorld(dt);
    if (!(G.state === 'play' && G.paused)) updateParts(dt);
  }
  function frame(ts) {
    if (!last) last = ts;
    var dt = (ts - last) / 1000;
    last = ts;
    if (dt > 0.25) dt = 0.25;
    if (dt < 0) dt = 0;
    acc += dt;
    var n = 0;
    while (acc >= STEP && n < 40) { tick(STEP); acc -= STEP; n++; }
    if (n >= 40) acc = 0;
    musicTick();
    render();
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- menus (DOM)
  var UI = (function () {
    var root = document.getElementById('menu');
    var panels = {};
    var list = root.querySelectorAll('[data-panel]');
    for (var i = 0; i < list.length; i++) panels[list[i].getAttribute('data-panel')] = list[i];
    var stack = [];
    var api = { open: null };

    function render(name) {
      if (name === 'main') {
        var cont = document.getElementById('mContinue');
        var has = SAVE.unlocked > 0;
        cont.hidden = !has;
        if (has) cont.textContent = 'Continue \u00b7 ' + (SAVE.unlocked === 0 ? 'Training' : 'Chapter ' + SAVE.unlocked);
        document.getElementById('mNew').textContent = has ? 'New journey' : 'Start';
      }
      if (name === 'chapters') {
        var grid = document.getElementById('chapterGrid');
        grid.textContent = '';
        for (var i = 0; i < LEVELS.length; i++) {
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'chap';
          var locked = i > SAVE.unlocked;
          b.disabled = locked;
          var best = SAVE.best[String(i)];
          var label = i === 0 ? 'Training' : 'Chapter ' + i;
          b.innerHTML = '<span class="cn"></span><span class="ct"></span><span class="cb"></span>';
          b.children[0].textContent = label;
          b.children[1].textContent = locked ? 'Locked' : LEVELS[i].name;
          b.children[2].textContent = locked ? '' : (best != null ? 'best ' + best + ' coins' : 'not cleared yet');
          (function (idx) { b.addEventListener('click', function () { startChapter(idx, true); }); })(i);
          grid.appendChild(b);
        }
      }
      if (name === 'settings') {
        setToggle('sMusic', SAVE.settings.music);
        setToggle('sSfx', SAVE.settings.sfx);
        setToggle('sMute', !SAVE.settings.muted);
        var m = document.getElementById('sMotion');
        m.textContent = { auto: 'Auto (system)', on: 'Reduced', off: 'Full' }[SAVE.settings.motion];
        document.getElementById('sStore').hidden = storageOK;
      }
      if (name === 'credits') {
        var box = document.getElementById('storyList');
        box.textContent = '';
        var upto = SAVE.finished ? LEVELS.length - 1 : SAVE.unlocked;
        for (var c = 1; c <= upto && c <= DATA.STORY.length; c++) {
          var h = document.createElement('h3'); h.textContent = 'Chapter ' + c + ' \u00b7 ' + DATA.STORY[c - 1].title;
          var p = document.createElement('p'); p.textContent = DATA.STORY[c - 1].text.replace(/\n\n/g, ' ');
          box.appendChild(h); box.appendChild(p);
        }
        if (SAVE.finished) {
          var he = document.createElement('h3'); he.textContent = 'Ending \u00b7 The Bell Rings Again';
          var pe = document.createElement('p'); pe.textContent = DATA.ENDING.text.replace(/\n\n/g, ' ');
          box.appendChild(he); box.appendChild(pe);
        }
        if (upto < 1) {
          var p0 = document.createElement('p'); p0.textContent = 'Finish the training to start the story.';
          box.appendChild(p0);
        } else if (!SAVE.finished) {
          var pn = document.createElement('p'); pn.className = 'muted'; pn.textContent = 'More of the story opens as you climb.';
          box.appendChild(pn);
        }
      }
    }
    function setToggle(id, on) {
      var el = document.getElementById(id);
      el.setAttribute('aria-pressed', on ? 'true' : 'false');
      el.textContent = on ? 'On' : 'Off';
    }
    function showOnly(name) {
      for (var k in panels) panels[k].hidden = k !== name;
      root.hidden = !name;
      api.open = name || null;
      syncChrome();
      if (name) {
        render(name);
        var f = panels[name].querySelector('button:not([disabled]):not([hidden])');
        if (f && !window.__TOUCH) { try { f.focus({ preventScroll: true }); } catch (e) { f.focus(); } }
      }
    }
    api.show = function (name) { if (api.open && api.open !== name) stack.push(api.open); showOnly(name); };
    api.back = function () { showOnly(stack.pop() || (G.state === 'title' ? 'main' : (G.paused ? 'pause' : null))); };
    api.close = function () { stack = []; showOnly(null); };
    api.refresh = function () { if (api.open) render(api.open); };

    root.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button[data-act]') : null;
      if (!b) return;
      unlockAudio();
      var act = b.getAttribute('data-act');
      SFX.ui();
      switch (act) {
        case 'continue': startChapter(SAVE.unlocked, true); break;
        case 'new': startChapter(0, true); break;
        case 'chapters': api.show('chapters'); break;
        case 'settings': api.show('settings'); break;
        case 'credits': api.show('credits'); break;
        case 'help': api.show('help'); break;
        case 'install': if (window.__MQ_INSTALL && window.__MQ_INSTALL() === 'ios') api.show('iosinstall'); break;
        case 'back': api.back(); break;
        case 'resume': togglePause(); break;
        case 'restart': G.paused = false; api.close(); replay(); break;
        case 'quit': G.paused = false; api.close(); endToTitle(); break;
        case 'music': SAVE.settings.music = !SAVE.settings.music; writeSave(); render('settings'); break;
        case 'sfx': SAVE.settings.sfx = !SAVE.settings.sfx; writeSave(); render('settings'); break;
        case 'mute': setMuted(!SAVE.settings.muted); render('settings'); break;
        case 'motion':
          SAVE.settings.motion = { auto: 'on', on: 'off', off: 'auto' }[SAVE.settings.motion];
          writeSave(); syncMotion(); setupSnow(G.theme || THEMES.meadow); render('settings'); break;
        case 'reset':
          if (window.confirm('Reset all progress? Your settings stay.')) {
            var keep = SAVE.settings; SAVE = defaults(); SAVE.settings = keep; writeSave(); toast('Progress reset'); render('settings');
          }
          break;
      }
    });
    return api;
  })();

  function syncChrome() {
    var b = document.body;
    b.classList.toggle('menu-open', !!UI.open);
    b.classList.toggle('playing', G.state === 'play' && !G.paused);
    b.classList.toggle('title-screen', G.state === 'title');
    var pb = document.getElementById('btnPause');
    if (pb) pb.hidden = !(G.state === 'play');
  }

  // the turn-your-phone card pauses the game while it is up
  document.addEventListener('mq-turn', function (e) { if (e.detail && e.detail.open) { releaseAll(); autoPause(); } });
  document.getElementById('btnPause').addEventListener('click', function (e) {
    e.preventDefault(); e.stopPropagation(); togglePause();
  });

  buildLayers();

  window.__GQ = {
    toggleSound: function () { setMuted(!SAVE.settings.muted); return muted; },
    isMuted: function () { return muted; }
  };
  // test hooks (read-only views + a few safe actions) used by tests/e2e.spec.js
  window.__MQ = {
    state: function () { return { turn: document.body.classList.contains('turn-open'), state: G.state, idx: G.idx, lives: G.lives, coins: G.coins, paused: G.paused, x: G.p ? G.p.x : null, menu: UI.open, rm: RM, held: { l: held.left, r: held.right, j: held.jump }, audio: AC ? AC.state : 'none', save: SAVE }; },
    start: function (i) { startChapter(i, true); },
    load: function (i) { UI.close(); G.lives = 3; loadLevel(i); },
    win: function () { if (G.state === 'play') completeLevel(); },
    end: function () { if (G.state === 'play') { G.idx = LEVELS.length - 1; completeLevel(); } }
  };

  var started = false;
  function go() {
    if (started) return;
    started = true;
    G.state = 'title';
    G.theme = THEMES.meadow;
    playSong('title', true);
    UI.show('main');
    syncChrome();
    if (window.__MQ_SYNC_SOUND) window.__MQ_SYNC_SOUND(muted);
    requestAnimationFrame(frame);
  }
  var loaded = 0;
  function onLoad() { loaded++; if (loaded >= 2) go(); }
  sprite.addEventListener('load', onLoad);
  faceImg.addEventListener('load', onLoad);
  sprite.addEventListener('error', go);
  faceImg.addEventListener('error', go);
  if (sprite.complete && faceImg.complete) go();
  setTimeout(go, 2500);
})();
