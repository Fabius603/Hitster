'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = name => fs.readFileSync(path.join(__dirname, '../spiel', name), 'utf8');
const filmCards = count => Array.from({ length: count }, (_, i) => ({
  id: String(i), key: 'k' + i, file: `audio/${i}.mp3`, answer: { title: 'Film Nummer ' + i, year: 1900 + i * 3 }
}));

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { data, getItem: key => data.has(key) ? data.get(key) : null, setItem: (key, value) => data.set(key, String(value)), removeItem: key => data.delete(key) };
}

function fakeAudio() {
  return { src: '', paused: true, currentTime: 0, duration: 20, plays: 0, listeners: {}, playError: null,
    addEventListener(name, fn) { this.listeners[name] = fn; },
    async play() { this.plays++; if (this.playError) throw this.playError; this.paused = false; },
    pause() { this.paused = true; }, load() {} };
}

async function setup({ storage = memoryStorage(), cards = filmCards(40), audio = fakeAudio(), navigatorStub = {} } = {}) {
  const context = vm.createContext({ URL, console, setTimeout, clearTimeout, navigator: navigatorStub });
  for (const file of ['catalog.js', 'engine.js', 'app.js']) vm.runInContext(source(file), context);
  const fetch = async url => {
    if (String(url).endsWith('variants.json')) return { ok: true, json: async () => [{ id: 'film', cards: 'variants/film/cards.json' }] };
    if (String(url).endsWith('film/cards.json')) return { ok: true, json: async () => cards };
    return { ok: false, json: async () => null };
  };
  const root = { innerHTML: '' };
  const announced = [];
  const app = context.HitsterApp.createApp({ root, storage, fetch, baseUrl: 'https://h.test/spiel/', audio,
    random: context.HitsterEngine.createRandom(5), announce: text => announced.push(text) });
  await app.ready;
  return { app, root, storage, audio, announced, context };
}

async function startGame(app, names = ['Lea', 'Tom']) {
  app.act('newGame');
  names.forEach((name, index) => { if (index >= 2) app.act('addName'); app.act('setName', String(index), name); });
  app.act('startGame');
}

test('start screen offers "Spiel fortsetzen" only when a saved game exists', async () => {
  const fresh = await setup();
  assert.doesNotMatch(fresh.root.innerHTML, /Spiel fortsetzen/);
  assert.match(fresh.root.innerHTML, /Neues Spiel/);
  await startGame(fresh.app);
  const again = await setup({ storage: fresh.storage });
  assert.match(again.root.innerHTML, /Spiel fortsetzen/);
  again.app.act('resume');
  assert.equal(again.app.state.phase, 'handover');
});

test('setup with 2 names starts a game and shows handover with the first name', async () => {
  const { app, root, storage } = await setup();
  app.act('newGame');
  app.act('setName', '0', 'Lea');
  assert.match(root.innerHTML, /disabled[^>]*data-action="startGame"|data-action="startGame"[^>]*disabled/);
  app.act('setName', '1', 'Tom');
  app.act('startGame');
  assert.equal(app.state.phase, 'handover');
  assert.match(root.innerHTML, /Lea/);
  assert.match(root.innerHTML, /ist dran/);
  assert.ok(storage.getItem('hitster-spiel-v1'));
});

test('solution is not in the DOM before reveal', async () => {
  const { app, root } = await setup();
  await startGame(app);
  app.act('go');
  const { title, year } = app.state.turn.card;
  const hidden = () => { assert.ok(!root.innerHTML.includes(title), 'title leaked'); assert.ok(!root.innerHTML.includes(String(year)), 'year leaked'); };
  hidden();
  app.act('gap', '0');
  hidden();
  app.act('place');
  assert.equal(app.state.phase, 'hitster');
  hidden();
  app.act('reveal');
  assert.ok(root.innerHTML.includes(String(year)));
  assert.ok(root.innerHTML.includes(title));
});

test('reload in hitster phase resumes the same card without charging tokens again', async () => {
  const first = await setup();
  await startGame(first.app);
  first.app.act('go'); first.app.act('gap', '0'); first.app.act('place');
  first.app.act('steal', 'p2'); first.app.act('stealGap', '1');
  const before = first.app.state;
  const second = await setup({ storage: first.storage });
  second.app.act('resume');
  assert.equal(second.app.state.phase, 'hitster');
  assert.equal(second.app.state.turn.card.id, before.turn.card.id);
  assert.equal(JSON.stringify(second.app.state.players.map(p => p.tokens)), JSON.stringify(before.players.map(p => p.tokens)));
  assert.equal(second.audio.plays, 0);
});

test('saved deck drops cards missing from the catalog but keeps timelines', async () => {
  const first = await setup();
  await startGame(first.app);
  const saved = first.app.state;
  const startIds = saved.players.map(p => p.timeline[0].id);
  const remaining = filmCards(40).filter(card => !startIds.includes('film:' + card.key)).slice(5);
  const second = await setup({ storage: first.storage, cards: remaining });
  second.app.act('resume');
  const ids = new Set(remaining.map(card => 'film:' + card.key));
  assert.ok(second.app.state.deck.every(id => ids.has(id)));
  assert.equal(second.app.state.deck.length, saved.deck.length - 5);
  assert.equal(JSON.stringify(second.app.state.players.map(p => p.timeline[0].id)), JSON.stringify(startIds));
});

test('gap buttons carry descriptive aria-labels', async () => {
  const { app, root } = await setup();
  await startGame(app);
  app.act('go');
  const year = app.state.players[0].timeline[0].year;
  assert.match(root.innerHTML, new RegExp(`aria-label="Vor ${year}"`));
  assert.match(root.innerHTML, new RegExp(`aria-label="Nach ${year}"`));
});

test('player names are HTML-escaped', async () => {
  const { app, root } = await setup();
  await startGame(app, ['<img src=x onerror=alert(1)>', 'Tom']);
  assert.ok(!root.innerHTML.includes('<img'));
  assert.match(root.innerHTML, /&lt;img/);
});

test('undo and menu actions are reachable during play', async () => {
  const { app, root } = await setup();
  await startGame(app);
  app.act('go');
  app.act('undo');
  assert.equal(app.state.phase, 'handover');
  app.act('menu');
  assert.match(root.innerHTML, /Spielstand bearbeiten/);
  app.act('tokens', 'p1|-1');
  assert.equal(app.state.players[0].tokens, 1);
});

test('local dev server serves the spiel folder and its index', () => {
  const { resolvePublicPath } = require('../scripts/serve.cjs');
  assert.ok(String(resolvePublicPath('/spiel/')).endsWith(path.join('spiel', 'index.html')));
  assert.ok(String(resolvePublicPath('/spiel/app.js')).endsWith(path.join('spiel', 'app.js')));
  assert.equal(resolvePublicPath('/spiel/../.git/config'), null);
});
