const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function setup(cardOverrides = {}) {
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
    fetch: async path => ({ ok: true, json: async () => path === 'variants.json' ? variants : [{ id: '001', file: path.includes('/video/') ? 'clip.mp4' : 'audio/001.mp3', type: path.includes('/video/') ? 'video' : 'audio', ...cardOverrides }] })
  });
  vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../player.js'), 'utf8'), context);
  return { get, context, state };
}

test('bilingual cards resolve both tracks, retain language preference and preserve pause', async () => {
  const { get, context } = setup({ tracks: { de: 'audio/001-de.mp3', en: 'audio/001-en.mp3' } });
  await new Promise(setImmediate);
  assert.match(get('#audio').src, /001-de.mp3$/);
  assert.equal(get('#language-switch').hidden, false);
  await get('#language-en').events.click();
  assert.match(get('#audio').src, /001-en.mp3$/);
  assert.equal(get('#audio').paused, true);
  assert.equal(get('#language-en')['aria-pressed'], true);
  await get('#play').events.click();
  await get('#language-de').events.click();
  assert.equal(get('#audio').paused, false);
  assert.match(get('#audio').src, /001-de.mp3$/);
  await get('#language-en').events.click();
  await vm.runInContext("selectCard('001', false, false)", context);
  assert.match(get('#audio').src, /001-en.mp3$/);
});

test('legacy cards keep their original file and hide the language selector', async () => {
  const { get } = setup();
  await new Promise(setImmediate);
  assert.match(get('#audio').src, /audio\/001.mp3$/);
  assert.equal(get('#language-switch').hidden, true);
});
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
test('ring tracks playback, stop resets it, and swipes in both directions open camera', async () => {
  const { get, context } = setup();
  await new Promise(setImmediate);
  await vm.runInContext("selectCard('001')", context);
  get('#audio').currentTime = 4;
  get('#audio').events.timeupdate();
  assert.equal(get('#progress')['stroke-dashoffset'], 50);
  assert.equal(get('#progress-value')['aria-valuenow'], 50);
  assert.equal(get('#print').href, 'cards.html?variant=film');
  get('#play').events.click();
  assert.equal(get('#audio').currentTime, 0);
  assert.equal(get('#audio').paused, true);
  assert.equal(get('#progress')['stroke-dashoffset'], 100);
  for (const end of [20, 280]) {
    get('.game').events.touchstart({ touches: [{clientX:150, clientY:100}], target:{closest:()=>null} });
    get('.game').events.touchend({ changedTouches: [{clientX:end, clientY:105}] });
    await new Promise(setImmediate);
    assert.equal(get('#scan-label').textContent, 'Scannen beenden');
    await get('#scan').events.click();
  }
  get('.game').events.touchstart({ touches: [{clientX:150, clientY:100}], target:{closest:()=>null} });
  get('.game').events.touchend({ changedTouches: [{clientX:155, clientY:220}] });
  assert.equal(get('#scanner-panel').hidden, true, 'Vertical gesture must not open camera');
});
test('direct opening prepares audio without autoplay and central button starts it', async () => {
  const { get } = setup();
  await new Promise(setImmediate);
  assert.equal(get('#play').disabled, false);
  assert.equal(get('#audio').paused, true);
  assert.match(get('#audio').src, /001\.mp3$/);
  get('#play').events.click();
  await new Promise(setImmediate);
  assert.equal(get('#audio').paused, false);
});
test('camera permission denial restores scan button and allows retry', async () => {
  const { get, context } = setup();
  await new Promise(setImmediate);
  vm.runInContext("Html5Qrcode.prototype.start = async function() { const error = new Error('Permission denied'); error.name = 'NotAllowedError'; throw error; }", context);
  await get('#scan').events.click();
  assert.match(get('#status').textContent, /Kamerazugriff gesperrt/);
  assert.equal(get('#scan').disabled, false);
  assert.equal(get('#scanner-panel').hidden, true);
  vm.runInContext('Html5Qrcode.prototype.start = async function() {}', context);
  await get('#scan').events.click();
  assert.equal(get('#scan-label').textContent, 'Scannen beenden');
});
test('equivalent index.html QR path is accepted', async () => {
  const { get, context } = setup();
  await new Promise(setImmediate);
  await get('#scan').events.click();
  await vm.runInContext("onScan('https://example.org/Hitster/index.html?variant=film&id=001')", context);
  assert.equal(get('#audio').paused, false);
  assert.equal(get('#scanner-panel').hidden, true);
});
