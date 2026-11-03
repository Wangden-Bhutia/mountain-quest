// Unit tests for js/physics.js. Run: node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const P = require('../js/physics.js');
const GY = P.GY;
const flat = (extra) => Object.assign({ name: 't', width: 3000, ground: [[0, 3000]], platforms: [], coins: [], enemies: [], checkpoints: [], goal: 2900 }, extra || {});
function settle(S) { for (let i = 0; i < 60; i++) P.step(S, {}, P.STEP); }
function run(S, input, secs) { let r = null; const n = Math.round(secs / P.STEP); for (let i = 0; i < n && !r; i++) r = P.step(S, input, P.STEP); return r; }
function peak(S, holdFrames) {
  S.jumpBuf = P.consts.JUMP_BUFFER; let minY = S.p.y;
  for (let f = 0; f < 120; f++) { P.step(S, { jump: f < holdFrames }, P.STEP); minY = Math.min(minY, S.p.y); }
  return S.p.y - minY;
}

test('player lands and stands on the ground', () => {
  const S = P.newState(flat()); settle(S);
  assert.ok(S.p.onGround); assert.strictEqual(S.p.y + S.p.h, GY);
});
test('variable jump height: holding jump goes higher than a tap', () => {
  const a = P.newState(flat()); settle(a); const hi = peak(a, 120);
  const b = P.newState(flat()); settle(b); const lo = peak(b, 2);
  assert.ok(hi > 150 && hi < 175, 'full jump about 168px, got ' + hi);
  assert.ok(lo < hi * 0.4, 'tap jump much lower, got ' + lo);
});
test('jump buffer: pressing just before landing still jumps', () => {
  const S = P.newState(flat()); S.p.y = GY - S.p.h - 12; // in the air, about to land
  S.jumpBuf = P.consts.JUMP_BUFFER;
  let jumped = false;
  for (let i = 0; i < 40; i++) { P.step(S, { jump: true }, P.STEP); if (S.p.vy < -500) jumped = true; }
  assert.ok(jumped);
});
test('coyote time: a jump just after walking off a ledge still works', () => {
  const S = P.newState(flat({ ground: [[0, 300], [600, 3000]] }));
  settle(S); S.p.x = 300 - S.p.w + 2; S.p.vx = 300;
  let air = 0;
  while (S.p.onGround || air === 0) { P.step(S, { right: true }, P.STEP); if (!S.p.onGround) air++; }
  for (let i = 0; i < 4; i++) P.step(S, { right: true }, P.STEP); // ~40ms after leaving the ledge
  S.jumpBuf = P.consts.JUMP_BUFFER; P.step(S, { right: true, jump: true }, P.STEP);
  assert.ok(S.p.vy < -800, 'jumped, vy=' + S.p.vy);
});
test('fixed timestep: identical result whatever the screen refresh rate', () => {
  function sim(fps) {
    const S = P.newState(flat()); let acc = 0; const frame = 1 / fps;
    for (let t = 0; t < 3; t += frame) { acc += frame; while (acc >= P.STEP) { P.step(S, { right: true, jump: t < 0.4 }, P.STEP); acc -= P.STEP; } if (Math.abs(t - 0.05) < frame) S.jumpBuf = P.consts.JUMP_BUFFER; }
    return S.p;
  }
  const a = sim(60), b = sim(120), c = sim(30);
  assert.ok(Math.abs(a.x - b.x) < 12 && Math.abs(a.x - c.x) < 12, [a.x, b.x, c.x].join(' '));
});
test('spikes hurt, springs launch high', () => {
  const S = P.newState(flat({ spikes: [[200, 60]] })); settle(S);
  assert.strictEqual(run(S, { right: true }, 2), 'hurt');
  const T = P.newState(flat({ springs: [[150]] })); settle(T);
  let minY = 1e9; for (let i = 0; i < 240; i++) { P.step(T, { right: i < 50 }, P.STEP); minY = Math.min(minY, T.p.y + T.p.h); }
  assert.ok(GY - minY > 300, 'spring height ' + (GY - minY));
});
test('crumbling stone falls after being stood on, then comes back', () => {
  const S = P.newState(flat({ ground: [[0, 200]], crumbles: [[60, 300, 100]] }));
  S.p.x = 80; S.p.y = 300 - S.p.h - 5;
  run(S, {}, 0.2); assert.strictEqual(S.world.crumbles[0].state, 'shake');
  run(S, {}, 0.4); assert.strictEqual(S.world.crumbles[0].state, 'gone');
  const S2 = P.newState(flat({ crumbles: [[600, 300, 100]] })); S2.world.crumbles[0].state = 'gone'; S2.world.crumbles[0].back = 0.1;
  run(S2, {}, 0.3); assert.strictEqual(S2.world.crumbles[0].state, 'solid');
});
test('ice is slippery: you slide further after letting go', () => {
  function slide(slippery) { const S = P.newState(flat({ slippery })); settle(S); run(S, { right: true }, 1); const x0 = S.p.x; run(S, {}, 1); return S.p.x - x0; }
  assert.ok(slide(true) > slide(false) * 3);
});
test('wind pushes the player', () => {
  const S = P.newState(flat({ wind: [[0, 3000, -150]] })); settle(S); const x0 = S.p.x + 400; S.p.x = x0; run(S, {}, 1);
  assert.ok(S.p.x < x0 - 60);
});
test('boss: goal stays locked until Old Horn is beaten', () => {
  const S = P.newState(flat({ boss: { x: 1500, range: 10, hp: 3 }, goal: 400 }));
  S.p.x = 500; settle(S);
  assert.strictEqual(P.goalOpen(S.world), false);
  S.world.boss.hp = 0; S.world.boss.dead = true;
  assert.strictEqual(run(S, {}, 0.1), 'goal');
});
test('stomping a grump bounces the player and gives a coin', () => {
  const S = P.newState(flat({ enemies: [{ t: 'walk', x: 300, y: GY - 42, range: 1 }] }));
  S.p.x = 290; S.p.y = GY - 42 - S.p.h - 60; S.p.vy = 300;
  const r = run(S, {}, 0.2);
  assert.strictEqual(r, null); assert.strictEqual(S.stomps, 1); assert.strictEqual(S.coins, 1);
});
