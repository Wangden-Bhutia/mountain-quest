const { solve } = require('./solver.js');
const D = require('../js/data.js');
const only = process.argv[2] != null ? [+process.argv[2]] : D.LEVELS.map((_, i) => i);
for (const i of only) {
  const t0 = Date.now();
  const r = solve(D.LEVELS[i]);
  console.log(i, D.LEVELS[i].name, r.ok ? 'OK ' + r.seconds.toFixed(1) + 's' : 'FAIL ' + r.reason + ' at x=' + Math.round(r.at), (Date.now() - t0) + 'ms');
}
