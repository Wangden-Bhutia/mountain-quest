// Static checks on stage data. Run: node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const D = require('../js/data.js');
const onGround = (L, x0, x1) => L.ground.some(g => x0 >= g[0] && x1 <= g[1]);

test('story: one intro card and one outro line per chapter', () => {
  assert.strictEqual(D.STORY.length, D.LEVELS.length - 1);
  assert.strictEqual(D.OUTRO.length, D.LEVELS.length - 1);
  assert.ok(D.ENDING.text.length > 50);
});
test('at least 12 stages (double the original 6)', () => assert.ok(D.LEVELS.length >= 12));
for (const [i, L] of D.LEVELS.entries()) {
  test(`stage ${i} ${L.name}: layout sanity`, () => {
    assert.ok(L.goal < L.width, 'goal inside world');
    assert.ok(onGround(L, L.goal - 30, L.goal + 30), 'goal stands on ground');
    assert.ok(onGround(L, 190, 236), 'start on ground');
    for (const cp of L.checkpoints) assert.ok(onGround(L, cp - 20, cp + 26), `checkpoint ${cp} respawns on ground`);
    for (const e of L.enemies) {
      const w = e.t === 'hop' ? 40 : 46;
      assert.ok(onGround(L, e.x - e.range, e.x + e.range + w), `${e.t} at ${e.x} patrols on ground`);
    }
    for (const s of (L.springs || [])) assert.ok(onGround(L, s[0], s[0] + 44), `spring at ${s[0]} on ground`);
    for (const s of (L.spikes || [])) assert.ok(onGround(L, s[0], s[0] + s[1]), `spikes at ${s[0]} on ground`);
    if (L.boss) assert.ok(L.boss.x + L.boss.range + 124 < L.goal, 'boss arena ends before goal');
  });
}
