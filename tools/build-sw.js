#!/usr/bin/env node
// Builds sw.js with a precache list and a version made from the file hashes.
// `node tools/build-sw.js --check` exits 1 if sw.js is stale (used in CI).
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.join(__dirname, '..');
const FILES = ['index.html', 'manifest.webmanifest', 'css/style.css',
  'js/shell.js', 'js/assets.js', 'js/physics.js', 'js/data.js', 'js/game.js', 'js/pwa.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'];
const h = crypto.createHash('sha256');
for (const f of FILES) { h.update(f + '\0'); h.update(fs.readFileSync(path.join(root, f))); }
const version = h.digest('hex').slice(0, 12);
const out = fs.readFileSync(path.join(__dirname, 'sw.template.js'), 'utf8')
  .replace('__VERSION__', version)
  .replace('__PRECACHE__', JSON.stringify(['./'].concat(FILES.map(f => './' + f)), null, 2));
const target = path.join(root, 'sw.js');
if (process.argv.includes('--check')) {
  const cur = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
  if (cur !== out) { console.error('sw.js is stale: run `node tools/build-sw.js`'); process.exit(1); }
  console.log('sw.js is up to date (version ' + version + ')');
} else {
  fs.writeFileSync(target, out);
  console.log('wrote sw.js version ' + version + ' with ' + (FILES.length + 1) + ' entries');
}
module.exports = { FILES };
