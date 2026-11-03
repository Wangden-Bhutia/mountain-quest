// Every stage must be finishable by a scripted player using only
// left / right / jump, on the real physics, without losing a life.
const test = require('node:test');
const assert = require('node:assert');
const D = require('../js/data.js');
const { solve } = require('./solver.js');
for (const [i, L] of D.LEVELS.entries()) {
  test(`stage ${i} "${L.name}" is completable`, () => {
    const r = solve(L);
    assert.ok(r.ok, `not solved: ${r.reason} (furthest x=${Math.round(r.at)}, goal=${L.goal})`);
    if (L.boss) assert.ok(r.trace.length > 0);
  });
}

test('control: the checker rejects an impossible stage', () => {
  const bad = { name: 'impossible', width: 2000, ground: [[0, 600], [1300, 2000]], platforms: [], coins: [], enemies: [], checkpoints: [], goal: 1800 };
  assert.strictEqual(solve(bad, { maxSeconds: 20 }).ok, false);
});
