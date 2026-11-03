/* Beam-search playthrough over the real physics (js/physics.js).
   A stage counts as completable only if the search reaches the goal
   without losing a single life, using only left/right/jump inputs. */
'use strict';
const P = require('../js/physics.js');

function clone(S) {
  // structured clone that keeps mover references consistent
  const w = S.world;
  const movers = w.movers.map(m => Object.assign({}, m));
  const p = Object.assign({}, S.p);
  if (S.p.riding) p.riding = movers[w.movers.indexOf(S.p.riding)];
  const world = Object.assign({}, w, {
    movers,
    crumbles: w.crumbles.map(c => Object.assign({}, c)),
    springs: w.springs.map(s => Object.assign({}, s)),
    coins: w.coins, // coins do not affect reachability; shared to save memory
    enemies: w.enemies.map(e => Object.assign({}, e)),
    boss: w.boss ? Object.assign({}, w.boss) : null,
    checkpoints: w.checkpoints.map(c => Object.assign({}, c))
  });
  return { world, p, t: S.t, coins: S.coins, stomps: S.stomps, jumped: S.jumped, jumpBuf: S.jumpBuf, trace: S.trace };
}

// macro actions: [left, right, jumpPress, jumpHoldFrames]; each lasts FR frames
const FR = 12;
const ACTIONS = [
  { r: 1, j: 0 }, { r: 1, j: 1, hold: FR }, { r: 1, j: 1, hold: 4 },
  { l: 1, j: 0 }, { l: 1, j: 1, hold: FR }, { j: 0 }, { j: 1, hold: FR }
];

function apply(S, a) {
  if (a.j && S.p.onGround) S.jumpBuf = P.consts.JUMP_BUFFER;
  for (let f = 0; f < FR; f++) {
    const r = P.step(S, { left: !!a.l, right: !!a.r, jump: !!a.j && f < (a.hold || 0) }, P.STEP);
    if (r === 'goal') return 'goal';
    if (r === 'hurt' || r === 'fall') return 'dead';
  }
  return null;
}

function score(S) {
  const b = S.world.boss;
  let s = S.p.x;
  if (b) s = (b.maxHp - b.hp) * 4000 + (b.dead ? S.p.x : -Math.abs(S.p.x + 23 - (b.x + 62)) + (S.p.vy < 0 ? 0 : -S.p.y));
  return s;
}

function solve(src, opts) {
  opts = opts || {};
  const BEAM = opts.beam || 400, PER = opts.per || 24, MAXT = opts.maxSeconds || 120;
  let beam = [Object.assign(P.newState(src), { trace: [] })];
  const steps = Math.ceil(MAXT / (FR * P.STEP));
  for (let k = 0; k < steps; k++) {
    const next = [], seen = new Set();
    for (const S of beam) {
      for (let ai = 0; ai < ACTIONS.length; ai++) {
        const C = clone(S);
        const r = apply(C, ACTIONS[ai]);
        if (r === 'dead') continue;
        C.trace = S.trace.concat(ai);
        if (r === 'goal') return { ok: true, seconds: C.t, trace: C.trace, stomps: C.stomps };
        const b = C.world.boss;
        const key = [Math.round(C.p.x / 10), Math.round(C.p.y / 10), Math.round(C.p.vx / 80), Math.round(C.p.vy / 150),
          C.p.onGround ? 1 : 0, b ? b.hp + ':' + Math.round(b.x / 40) : '', Math.floor(C.t * 2) % 8].join(',');
        if (seen.has(key)) continue;
        seen.add(key);
        next.push(C);
      }
    }
    if (!next.length) return { ok: false, reason: 'all branches died', at: Math.max(...beam.map(s => s.p.x)) };
    next.sort((a, b) => score(b) - score(a));
    // stratify: at most PER states per 40px column, so states that wait
    // at a ledge for a moving platform are not crowded out
    const per = new Map(); beam = [];
    for (const C of next) {
      const col = Math.round(score(C) / 40), n = per.get(col) || 0;
      if (n >= PER) continue;
      per.set(col, n + 1); beam.push(C);
      if (beam.length >= BEAM) break;
    }
  }
  return { ok: false, reason: 'timeout', at: Math.max(...beam.map(s => s.p.x)) };
}

module.exports = { solve, ACTIONS, FR };
