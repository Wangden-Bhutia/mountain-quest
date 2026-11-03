// Manifest and service-worker checks. Run: node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const root = path.join(__dirname, '..');
const m = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
function pngSize(f) { const b = fs.readFileSync(path.join(root, f)); assert.strictEqual(b.toString('ascii', 1, 4), 'PNG'); return [b.readUInt32BE(16), b.readUInt32BE(20)]; }

test('manifest has the fields browsers need to offer install', () => {
  assert.strictEqual(m.id, '/mountain-quest/');
  assert.strictEqual(m.start_url, './'); assert.strictEqual(m.scope, './');
  assert.ok(['fullscreen', 'standalone'].includes(m.display));
  assert.strictEqual(m.orientation, 'landscape');
  assert.match(m.theme_color, /^#[0-9a-f]{6}$/i); assert.match(m.background_color, /^#[0-9a-f]{6}$/i);
  assert.ok(m.name && m.short_name && m.short_name.length <= 12);
});
test('icons exist with the declared sizes, incl. 192, 512 and maskable', () => {
  for (const ic of m.icons) {
    assert.ok(!/^https?:|^\//.test(ic.src), 'relative icon path');
    const [w, h] = pngSize(ic.src); assert.strictEqual(`${w}x${h}`, ic.sizes);
  }
  assert.ok(m.icons.some(i => i.sizes === '192x192')); assert.ok(m.icons.some(i => i.sizes === '512x512' && i.purpose === 'any'));
  assert.ok(m.icons.some(i => i.purpose === 'maskable'));
});
test('sw.js precache list is up to date (CI fails if stale)', () => {
  execFileSync('node', [path.join(root, 'tools/build-sw.js'), '--check'], { stdio: 'pipe' });
});
test('every precached file exists and is same-origin', () => {
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const list = JSON.parse(sw.match(/var PRECACHE = (\[[\s\S]*?\]);/)[1]);
  for (const u of list) { assert.ok(u.startsWith('./')); if (u !== './') assert.ok(fs.existsSync(path.join(root, u)), u); }
  assert.ok(!/https?:\/\//.test(sw), 'no absolute URLs in the service worker');
});
test('index.html links the manifest and keeps a strict CSP', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /rel="manifest" href="manifest.webmanifest"/);
  const csp = html.match(/Content-Security-Policy" content="([^"]+)"/)[1];
  assert.match(csp, /default-src 'none'/); assert.match(csp, /worker-src 'self'/); assert.match(csp, /manifest-src 'self'/);
  assert.ok(!/https?:|\*|unsafe/.test(csp), csp);
});
