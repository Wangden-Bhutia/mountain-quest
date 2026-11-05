/* Pure joystick math: no DOM. Same code runs in the game and in node --test. */
(function (root) {
  'use strict';
  var DEAD = 0.25;   // fraction of the ring radius that counts as "centered"

  // dx, dy are pointer offset from the stick centre in CSS pixels; radius is the ring.
  // Returns normalised axes (clamped to the unit circle) plus held left/right flags.
  // Up does not jump: Jump is its own button so multi-touch stays reliable.
  function map(dx, dy, radius) {
    var r = Math.max(1, +radius || 1);
    var nx = dx / r, ny = dy / r;
    var mag = Math.sqrt(nx * nx + ny * ny);
    if (mag > 1) { nx /= mag; ny /= mag; mag = 1; }
    var left = false, right = false;
    if (mag >= DEAD) {
      if (nx <= -DEAD) left = true;
      if (nx >= DEAD) right = true;
    }
    return { nx: nx, ny: ny, mag: mag, left: left, right: right };
  }

  function clampKnob(dx, dy, radius) {
    var r = Math.max(1, +radius || 1);
    var mag = Math.sqrt(dx * dx + dy * dy);
    if (mag > r && mag > 0) { dx = dx / mag * r; dy = dy / mag * r; }
    return { dx: dx, dy: dy };
  }

  var api = { DEAD: DEAD, map: map, clampKnob: clampKnob };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MQ_STICK = api;
})(typeof window !== 'undefined' ? window : globalThis);
