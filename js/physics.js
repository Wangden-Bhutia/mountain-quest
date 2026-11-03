/* Mountain Quest - world model and physics.
   Pure logic: no DOM, no audio, no drawing, so the same code runs in the game
   and in the node solvability checks (tests/solvability.test.js). */
(function (root) {
  'use strict';
  var W = 960, H = 540, GY = 460;
  var STEP = 1 / 120;                       // fixed simulation step (seconds)
  var GRAV = 2400, MAXFALL = 1250, MAXSPD = 320, ACC = 2800, AIRACC = 1900, FRIC = 2700, JUMPV = -900;
  var JUMP_CUT = -320, COYOTE = 0.1, JUMP_BUFFER = 0.13, SPRINGV = -1320, STOMPV = -560;
  var CRUMBLE_DELAY = 0.45, CRUMBLE_BACK = 2.8;

  function makePlayer(x, y) {
    return {
      x: x, y: y, w: 46, h: 112, vx: 0, vy: 0,
      onGround: false, coyote: 0, face: 1, anim: 0, tilt: 0, sq: 0,
      spawnX: x, spawnY: y, riding: null, inv: 0
    };
  }

  function buildWorld(src) {
    var w = {
      name: src.name, width: src.width, tutorial: !!src.tutorial,
      theme: src.theme || 'meadow', song: src.song || 'meadow',
      slippery: !!src.slippery,
      ground: src.ground,
      platforms: src.platforms || [],
      movers: (src.movers || []).map(function (m) {
        return { x: m.x, y: m.y, w: m.w, h: m.h, ax: m.ax || 0, ay: m.ay || 0, spd: m.spd || 1, ph: m.ph || 0, cx: m.x, cy: m.y, pcx: m.x, pcy: m.y };
      }),
      crumbles: (src.crumbles || []).map(function (c) { return { x: c[0], y: c[1], w: c[2], t: 0, state: 'solid', back: 0 }; }),
      springs: (src.springs || []).map(function (s) { return { x: s[0], y: s[1] == null ? GY : s[1], w: 44, squash: 0 }; }),
      spikes: (src.spikes || []).map(function (s) { return { x: s[0], w: s[1], y: s[2] == null ? GY - 22 : s[2] - 22, h: 22 }; }),
      wind: (src.wind || []).map(function (z) { return { x0: z[0], x1: z[1], f: z[2] }; }),
      coins: (src.coins || []).map(function (c, i) { return { x: c[0], y: c[1], taken: false, ph: (i * 1.7) % 6.28 }; }),
      enemies: (src.enemies || []).map(function (e, i) {
        var hop = e.t === 'hop';
        return {
          type: e.t, x: e.x, y: e.y, baseX: e.x, baseY: e.y,
          w: hop ? 40 : 46, h: hop ? 38 : 42,
          dir: i % 2 ? 1 : -1, range: e.range || 100,
          spd: hop ? 92 : 74, vy: 0, dead: false, deadT: 0, ph: (i * 2.3) % 6.28,
          friendly: !!e.friendly
        };
      }),
      boss: src.boss ? {
        x: src.boss.x, y: GY - 104, w: 124, h: 104, baseX: src.boss.x, range: src.boss.range || 260,
        dir: -1, hp: src.boss.hp || 3, maxHp: src.boss.hp || 3, inv: 0, vy: 0, dead: false, deadT: 0, hopT: 1.2
      } : null,
      checkpoints: (src.checkpoints || []).map(function (x) { return { x: x, hit: false }; }),
      goal: src.goal,
      start: { x: 190, y: GY - 112 }   // clear of the left touch pads in landscape
    };
    return w;
  }

  function newState(src) {
    var w = buildWorld(src);
    return { world: w, p: makePlayer(w.start.x, w.start.y), t: 0, coins: 0, stomps: 0, jumped: false, jumpBuf: 0 };
  }

  function overlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function solidsFor(w) {
    var s = [], i;
    for (i = 0; i < w.ground.length; i++) s.push({ x: w.ground[i][0], y: GY, w: w.ground[i][1] - w.ground[i][0], h: 220 });
    for (i = 0; i < w.platforms.length; i++) s.push({ x: w.platforms[i][0], y: w.platforms[i][1], w: w.platforms[i][2], h: 18, oneWay: true });
    for (i = 0; i < w.movers.length; i++) {
      var m = w.movers[i];
      s.push({ x: m.cx, y: m.cy, w: m.w, h: m.h, mover: m, oneWay: true });
    }
    for (i = 0; i < w.crumbles.length; i++) {
      var c = w.crumbles[i];
      if (c.state !== 'gone') s.push({ x: c.x, y: c.y, w: c.w, h: 18, oneWay: true, crumble: c });
    }
    return s;
  }

  function bossSpeed(b) { return 95 + (b.maxHp - b.hp) * 55; }

  /* Advance the world by dt (use STEP). input = { left, right, jump } held flags.
     S.jumpBuf is set by the caller when jump is pressed.
     fx (optional) receives cosmetic events: fx(name, x, y).
     Returns null, 'goal', 'hurt' or 'fall'. */
  function step(S, input, dt, fx) {
    fx = fx || noop;
    var w = S.world, p = S.p, i;
    S.t += dt;

    for (i = 0; i < w.movers.length; i++) {
      var m = w.movers[i];
      m.pcx = m.cx; m.pcy = m.cy;
      m.cx = m.x + Math.sin(S.t * m.spd + m.ph) * m.ax;
      m.cy = m.y + Math.sin(S.t * m.spd + m.ph) * m.ay;
    }
    for (i = 0; i < w.crumbles.length; i++) {
      var cr = w.crumbles[i];
      if (cr.state === 'shake') { cr.t -= dt; if (cr.t <= 0) { cr.state = 'gone'; cr.back = CRUMBLE_BACK; fx('crumble', cr.x + cr.w / 2, cr.y); } }
      else if (cr.state === 'gone') { cr.back -= dt; if (cr.back <= 0 && !overlap(p, { x: cr.x, y: cr.y, w: cr.w, h: 18 })) cr.state = 'solid'; }
    }
    for (i = 0; i < w.springs.length; i++) if (w.springs[i].squash > 0) w.springs[i].squash -= dt;
    if (p.riding) { p.x += p.riding.cx - p.riding.pcx; p.y += p.riding.cy - p.riding.pcy; }

    var solids = solidsFor(w);

    var ax = 0;
    if (input.left) ax -= 1;
    if (input.right) ax += 1;
    var slip = w.slippery && p.onGround && !p.riding;
    var acc = p.onGround ? (slip ? ACC * 0.45 : ACC) : AIRACC;
    if (ax !== 0) {
      p.vx += ax * acc * dt;
      if (p.vx > MAXSPD) p.vx = MAXSPD;
      if (p.vx < -MAXSPD) p.vx = -MAXSPD;
      p.face = ax;
    } else {
      var f = (slip ? FRIC * 0.16 : FRIC) * dt;
      if (p.vx > f) p.vx -= f; else if (p.vx < -f) p.vx += f; else p.vx = 0;
    }
    // wind pushes in the air and on the ground (a little less on the ground)
    for (i = 0; i < w.wind.length; i++) {
      var z = w.wind[i], cx = p.x + p.w / 2;
      if (cx > z.x0 && cx < z.x1) {
        var gust = 0.75 + 0.25 * Math.sin(S.t * 1.7 + z.x0);
        p.x += z.f * gust * (p.onGround ? 0.7 : 1) * dt;
      }
    }

    S.jumpBuf -= dt;
    if (p.onGround) p.coyote = COYOTE; else p.coyote -= dt;
    if (S.jumpBuf > 0 && p.coyote > 0) {
      p.vy = JUMPV; p.onGround = false; p.coyote = 0; S.jumpBuf = 0; p.riding = null;
      S.jumped = true; p.sq = 0.5;
      fx('jump', p.x + p.w / 2, p.y + p.h);
    }
    if (!input.jump && p.vy < JUMP_CUT && !p.sprung) p.vy = JUMP_CUT;
    if (p.vy >= 0) p.sprung = false;

    p.vy += GRAV * dt;
    if (p.vy > MAXFALL) p.vy = MAXFALL;

    p.x += p.vx * dt;
    for (i = 0; i < solids.length; i++) {
      var s = solids[i];
      if (s.oneWay) continue;
      if (!overlap(p, s)) continue;
      if (p.x + p.w / 2 < s.x + s.w / 2) p.x = s.x - p.w; else p.x = s.x + s.w;
      p.vx = 0;
    }
    if (p.x < 0) { p.x = 0; p.vx = 0; }
    if (p.x > w.width - p.w) { p.x = w.width - p.w; p.vx = 0; }

    var wasGround = p.onGround;
    var prevBottom = p.y + p.h;
    p.y += p.vy * dt;
    p.onGround = false; p.riding = null;
    for (i = 0; i < solids.length; i++) {
      var t = solids[i];
      if (!overlap(p, t)) continue;
      if (t.oneWay) {
        if (p.vy >= 0 && prevBottom <= t.y + 10) {
          p.y = t.y - p.h; p.vy = 0; p.onGround = true;
          if (t.mover) p.riding = t.mover;
          if (t.crumble && t.crumble.state === 'solid') { t.crumble.state = 'shake'; t.crumble.t = CRUMBLE_DELAY; }
        }
      } else if (p.vy >= 0 && prevBottom <= t.y + 24) {
        p.y = t.y - p.h; p.vy = 0; p.onGround = true;
      } else if (p.vy < 0) {
        p.y = t.y + t.h; p.vy = 0;
      }
    }
    // springs
    for (i = 0; i < w.springs.length; i++) {
      var sp = w.springs[i];
      var box = { x: sp.x, y: sp.y - 16, w: sp.w, h: 16 };
      if (p.vy >= 0 && overlap({ x: p.x + 8, y: p.y, w: p.w - 16, h: p.h }, box)) {
        p.y = box.y - p.h; p.vy = SPRINGV; p.onGround = false; p.sprung = true; sp.squash = 0.25; p.sq = 0.6;
        fx('spring', sp.x + sp.w / 2, sp.y - 10);
      }
    }
    if (!wasGround && p.onGround) { p.sq = 1; fx('land', p.x + p.w / 2, p.y + p.h); }

    p.anim += Math.abs(p.vx) * dt * 0.055;
    var lim = p.onGround ? 0.09 : 0.13;
    var targetTilt = Math.max(-lim, Math.min(lim, p.vx / MAXSPD * lim));
    p.tilt += (targetTilt - p.tilt) * Math.min(1, dt * 10);
    p.sq += (0 - p.sq) * Math.min(1, dt * 9);
    if (p.inv > 0) p.inv -= dt;

    // hazards
    if (p.inv <= 0) {
      for (i = 0; i < w.spikes.length; i++) {
        var sk = w.spikes[i];
        if (overlap({ x: p.x + 6, y: p.y, w: p.w - 12, h: p.h }, { x: sk.x + 4, y: sk.y + 6, w: sk.w - 8, h: sk.h - 6 })) return 'hurt';
      }
    }

    for (i = 0; i < w.enemies.length; i++) {
      var e = w.enemies[i];
      if (e.dead) { e.deadT -= dt; continue; }
      if (e.type === 'hop') {
        e.vy += 1900 * dt;
        e.y += e.vy * dt;
        if (e.y > e.baseY) { e.y = e.baseY; e.vy = -540; }
      }
      e.x += e.dir * e.spd * dt;
      if (e.x < e.baseX - e.range) { e.x = e.baseX - e.range; e.dir = 1; }
      if (e.x > e.baseX + e.range) { e.x = e.baseX + e.range; e.dir = -1; }
      if (overlap(p, e)) {
        var feet = p.y + p.h;
        if (p.vy > 120 && feet - e.y < 40) {
          e.dead = true; e.deadT = 0.55;
          p.vy = STOMPV; p.sq = 0.7;
          S.coins += 1; S.stomps++;
          fx('stomp', e.x + e.w / 2, e.y + e.h / 2);
        } else if (e.friendly) {
          if (p.x + p.w / 2 < e.x + e.w / 2) { p.x = e.x - p.w - 1; p.vx = -120; }
          else { p.x = e.x + e.w + 1; p.vx = 120; }
          p.vy = -260;
          fx('nudge', p.x, p.y);
        } else if (p.inv <= 0) {
          return 'hurt';
        }
      }
    }

    var b = w.boss;
    if (b && !b.dead) {
      if (b.inv > 0) b.inv -= dt;
      b.x += b.dir * bossSpeed(b) * dt;
      if (b.x < b.baseX - b.range) { b.x = b.baseX - b.range; b.dir = 1; }
      if (b.x > b.baseX + b.range) { b.x = b.baseX + b.range; b.dir = -1; }
      // on the last horn he hops now and then
      if (b.hp === 1) {
        b.hopT -= dt;
        if (b.hopT <= 0 && b.y >= GY - b.h) { b.vy = -620; b.hopT = 1.6; }
      }
      b.vy += 1900 * dt; b.y += b.vy * dt;
      if (b.y > GY - b.h) { b.y = GY - b.h; b.vy = 0; }
      var hb = { x: b.x + 10, y: b.y + 8, w: b.w - 20, h: b.h - 8 };
      if (overlap(p, hb)) {
        if (p.vy > 120 && p.y + p.h - b.y < 48 && b.inv <= 0) {
          b.hp--; b.inv = 1.0; p.vy = -820; p.sprung = true; p.sq = 0.8;
          fx('bosshit', b.x + b.w / 2, b.y);
          if (b.hp <= 0) { b.dead = true; b.deadT = 1.2; fx('bossdown', b.x + b.w / 2, b.y + b.h / 2); }
        } else if (b.inv <= 0 && p.inv <= 0) {
          return 'hurt';
        } else if (p.inv <= 0 && b.inv > 0) {
          // after a hit he is dazed: push the player aside instead of hurting
          p.vx = p.x < b.x + b.w / 2 ? -260 : 260; p.vy = -300;
        }
      }
    } else if (b && b.dead && b.deadT > 0) b.deadT -= dt;

    for (i = 0; i < w.coins.length; i++) {
      var c = w.coins[i];
      if (c.taken) continue;
      if (p.x + p.w > c.x - 13 && p.x < c.x + 13 && p.y + p.h > c.y - 15 && p.y < c.y + 15) {
        c.taken = true; S.coins++;
        fx('coin', c.x, c.y);
      }
    }

    for (i = 0; i < w.checkpoints.length; i++) {
      var cp = w.checkpoints[i];
      if (!cp.hit && p.x + p.w / 2 > cp.x) {
        cp.hit = true;
        p.spawnX = cp.x - 20; p.spawnY = GY - 112;
        fx('checkpoint', cp.x, GY - 90);
      }
    }

    if (p.x + p.w / 2 > w.goal && goalOpen(w)) return 'goal';
    if (p.y > H + 60) return 'fall';
    return null;
  }

  function goalOpen(w) { return !w.boss || w.boss.dead; }

  function respawn(S) {
    var p = S.p;
    S.p = makePlayer(p.spawnX, p.spawnY);
    S.p.inv = 1.1;
    S.jumpBuf = 0;
  }

  function noop() {}

  var api = {
    W: W, H: H, GY: GY, STEP: STEP,
    consts: { GRAV: GRAV, MAXFALL: MAXFALL, MAXSPD: MAXSPD, JUMPV: JUMPV, JUMP_BUFFER: JUMP_BUFFER, COYOTE: COYOTE, SPRINGV: SPRINGV },
    makePlayer: makePlayer, buildWorld: buildWorld, newState: newState, step: step,
    respawn: respawn, overlap: overlap, solidsFor: solidsFor, goalOpen: goalOpen
  };
  root.MQ_PHYS = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
