import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// Check the generated artifact, not just the Vite configuration.
const manifest = JSON.parse(readFileSync('dist/manifest.webmanifest', 'utf8'));
assert.equal(manifest.display, 'standalone');
assert.equal(manifest.start_url, '/');
for (const icon of manifest.icons) {
  const png = readFileSync(`dist${icon.src}`);
  const [width, height] = icon.sizes.split('x').map(Number);
  assert.equal(png.readUInt32BE(16), width);
  assert.equal(png.readUInt32BE(20), height);
}
let precache = [];
let navigation;
const workbox = {
  precacheAndRoute(entries) { precache = entries; },
  cleanupOutdatedCaches() {},
  createHandlerBoundToURL(url) { assert.equal(url, 'index.html'); return url; },
  NavigationRoute: class { constructor(handler, options) { this.options = options; } },
  registerRoute(route) { navigation = route; },
};
runInNewContext(readFileSync('dist/sw.js', 'utf8'), {
  self: { define() {}, addEventListener() {} },
  define(_dependencies, factory) { factory(workbox); },
});
assert(precache.some(entry => entry.url === 'index.html'));
assert(precache.some(entry => /Markdown.*\.js$/.test(entry.url)));
for (const { url } of precache) {
  assert(!/^(?:https?:|\/?api\/)/.test(url), `Unexpected cache URL: ${url}`);
  assert(existsSync(`dist/${url}`), `Missing cached asset: ${url}`);
}
assert(navigation.options.denylist.some(rule => rule.test('/api/chat')));
assert(navigation.options.denylist.some(rule => rule.test('/api/status')));
assert(!navigation.options.denylist.some(rule => rule.test('/')));
console.log('PWA checks passed: install manifest, PNG sizes, complete shell cache, and uncached API routes.');
