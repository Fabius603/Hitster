const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function setup() {
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, { hidden: false, paused: true, duration: 8, currentTime: 0,
      classList: { toggle() {} }, events: {}, addEventListener(name, handler) { this.events[name] = handler; },
      getAttribute(name) { return this[name]; }, setAttribute(name, value) { this[name] = value; },
      pause() { this.paused = true; }, async play() { this.paused = false; } });
    return elements.get(id);
  };
  const variants = [{ id: 'film', cards: 'variants/film/cards.json' }, { id: 'video', cards: 'variants/video/cards.json' }];
  const state = { stopped: 0, url: '' };
  const context = vm.createContext({ URL, location: { href: 'https://example.org/Hitster/', origin: 'https://example.org', pathname: '/Hitster/' },
    history: { replaceState(a, b, url) { state.url = String(url); } },
    document: { querySelector: get, querySelectorAll: () => [get('#audio'), get('#video')] },
    window: { Html5Qrcode: true }, Html5Qrcode: class { async start() {} async stop() { state.stopped++; } clear() {} },
    fetch: async path => ({ ok: true, json: async () => path === 'variants.json' ? variants : [{ id: '001', file: path.includes('/video/') ? 'clip.mp4' : 'audio/001.mp3', type: path.includes('/video/') ? 'video' : 'audio' }] })
  });
  vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../player.js'), 'utf8'), context);
  return { get, context, state };
}
test('QR playback switches variants in place and closes camera; foreign codes rejected', async () => {
  const { get, context, state } = setup();
  await new Promise(setImmediate);
  await get('#scan').events.click();
  await vm.runInContext("onScan('https://example.org/Hitster/?variant=film&id=001')", context);
  assert.equal(get('#audio').src, 'https://example.org/Hitster/variants/film/audio/001.mp3');
  assert.equal(get('#play').disabled, false);
  assert.equal(state.stopped, 1);
  assert.match(state.url, /variant=film/);
  await get('#scan').events.click();
  await vm.runInContext("onScan('https://example.org/Hitster/?variant=video&id=001')", context);
  assert.equal(get('#video').hidden, false);
  assert.equal(get('#record').hidden, true);
  assert.equal(get('#audio').paused, true);
  assert.equal(get('#video').src, 'https://example.org/Hitster/variants/video/clip.mp4');
  await get('#scan').events.click();
  await vm.runInContext("onScan('https://foreign.org/?id=001')", context);
  assert.match(get('#status').textContent, /gehört nicht/);
  await get('#scan').events.click();
  assert.equal(get('#scanner-panel').hidden, true);
});
