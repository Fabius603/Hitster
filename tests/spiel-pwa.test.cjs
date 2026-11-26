'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const spiel = (...parts) => path.join(__dirname, '../spiel', ...parts);
const pngSize = file => { const b = fs.readFileSync(file); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

test('manifest makes the game installable as a standalone app', () => {
  const manifest = JSON.parse(fs.readFileSync(spiel('manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.name, 'Hitster');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.ok(manifest.icons.some(i => i.sizes === '192x192'));
  assert.ok(manifest.icons.some(i => i.sizes === '512x512' && i.purpose === 'maskable'));
  for (const icon of manifest.icons) {
    const [w, h] = pngSize(spiel(icon.src));
    assert.equal(`${w}x${h}`, icon.sizes, icon.src);
  }
});

test('index.html links the manifest, icons and the iOS home screen settings', () => {
  const html = fs.readFileSync(spiel('index.html'), 'utf8');
  assert.match(html, /<link rel="manifest" href="manifest\.webmanifest">/);
  assert.match(html, /<link rel="apple-touch-icon" href="icons\/icon-180\.png">/);
  assert.match(html, /<link rel="icon" [^>]*href="icons\/icon-32\.png">/);
  assert.match(html, /name="apple-mobile-web-app-capable" content="yes"/);
  assert.equal(pngSize(spiel('icons/icon-180.png')).join('x'), '180x180');
});

function loadWorker() {
  const listeners = {};
  const context = vm.createContext({ URL, Response, console,
    self: { addEventListener: (type, fn) => { listeners[type] = fn; }, location: new URL('https://h.test/spiel/sw.js'), skipWaiting() {}, clients: { claim: async () => {} } },
    caches: { open: async () => ({ addAll: async () => {}, put: async () => {}, match: async () => undefined }), keys: async () => [], delete: async () => true, match: async () => undefined },
    fetch: async () => new Response('ok') });
  vm.runInContext(fs.readFileSync(spiel('sw.js'), 'utf8'), context);
  return { listeners, context };
}

test('service worker precaches only files that exist', () => {
  const { context } = loadWorker();
  const files = context.HitsterSW.PRECACHE;
  assert.ok(files.includes('./') && files.includes('app.js') && files.includes('manifest.webmanifest'));
  for (const file of files.filter(f => f !== './')) assert.ok(fs.existsSync(path.resolve(spiel(), file)), file);
});

test('service worker leaves audio and other sites to the network', () => {
  const { listeners } = loadWorker();
  const handled = url => { let used = false; listeners.fetch({ request: { url, method: 'GET', mode: 'no-cors' }, respondWith() { used = true; } }); return used; };
  assert.equal(handled('https://h.test/variants/film/audio/003-de.mp3'), false);
  assert.equal(handled('https://other.test/spiel/app.js'), false);
  assert.equal(handled('https://h.test/spiel/app.js'), true);
  assert.equal(handled('https://h.test/variants.json'), true);
  assert.equal(handled('https://h.test/variants/serien/cards.json'), true);
});

// --- install button in the app ---
async function setupApp(install) {
  const context = vm.createContext({ URL, console, setTimeout, clearTimeout, navigator: {} });
  for (const file of ['catalog.js', 'engine.js', 'app.js']) vm.runInContext(fs.readFileSync(spiel(file), 'utf8'), context);
  const cards = Array.from({ length: 10 }, (_, i) => ({ id: String(i), key: 'k' + i, file: `a${i}.mp3`, answer: { title: 'T' + i, year: 1990 + i } }));
  const fetch = async url => String(url).endsWith('variants.json') ? { ok: true, json: async () => [{ id: 'film', cards: 'variants/film/cards.json' }] } : { ok: true, json: async () => cards };
  const storage = { getItem: () => null, setItem() {}, removeItem() {} };
  const root = { innerHTML: '' };
  const app = context.HitsterApp.createApp({ root, storage, fetch, baseUrl: 'https://h.test/spiel/', install });
  await app.ready;
  return { app, root };
}

test('start screen offers "App installieren" once the browser allows it', async () => {
  const { app, root } = await setupApp({ ios: false, standalone: false });
  assert.doesNotMatch(root.innerHTML, /App installieren/);
  let prompted = 0;
  app.setInstallPrompt({ prompt: async () => { prompted++; }, userChoice: Promise.resolve({ outcome: 'accepted' }) });
  assert.match(root.innerHTML, /data-action="install"/);
  app.act('install');
  assert.equal(prompted, 1);
  await new Promise(setImmediate);
  assert.doesNotMatch(root.innerHTML, /data-action="install"/);
});

test('iPhone users get a hint how to add the game to the home screen', async () => {
  const { root } = await setupApp({ ios: true, standalone: false });
  assert.match(root.innerHTML, /Zum Home-Bildschirm/);
});

test('no install hint inside the installed app', async () => {
  const { app, root } = await setupApp({ ios: true, standalone: true });
  app.setInstallPrompt({ prompt: async () => {}, userChoice: Promise.resolve({}) });
  assert.doesNotMatch(root.innerHTML, /Zum Home-Bildschirm|App installieren/);
});
