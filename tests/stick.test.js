// Unit tests for js/stick.js. Run: node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const S = require('../js/stick.js');

test('dead zone: tiny nudge is centred (no left/right)', () => {
  const m = S.map(10, 0, 100); // 0.1 < 0.25
  assert.strictEqual(m.left, false);
  assert.strictEqual(m.right, false);
  assert.ok(m.mag < S.DEAD);
});

test('dead zone boundary: 25% still centred, just over fires', () => {
  assert.strictEqual(S.map(24, 0, 100).right, false);
  assert.strictEqual(S.map(26, 0, 100).right, true);
  assert.strictEqual(S.map(-26, 0, 100).left, true);
});

test('right and left map from horizontal axis only', () => {
  assert.deepStrictEqual(
    [S.map(80, 0, 100).left, S.map(80, 0, 100).right],
    [false, true]
  );
  assert.deepStrictEqual(
    [S.map(-80, 10, 100).left, S.map(-80, 10, 100).right],
    [true, false]
  );
});

test('mostly vertical push does not walk (no up-to-jump, no false left/right)', () => {
  const m = S.map(5, -90, 100);
  assert.strictEqual(m.left, false);
  assert.strictEqual(m.right, false);
  assert.ok(m.mag > S.DEAD);
});

test('knob is clamped to the ring', () => {
  const c = S.clampKnob(200, 0, 50);
  assert.ok(Math.abs(c.dx - 50) < 1e-9);
  assert.ok(Math.abs(c.dy) < 1e-9);
  const d = S.clampKnob(30, 40, 100); // already inside
  assert.strictEqual(d.dx, 30);
  assert.strictEqual(d.dy, 40);
});

test('map normalises beyond the ring to the unit circle', () => {
  const m = S.map(300, 0, 100);
  assert.ok(Math.abs(m.nx - 1) < 1e-9);
  assert.ok(Math.abs(m.mag - 1) < 1e-9);
  assert.strictEqual(m.right, true);
});
