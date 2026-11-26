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

test('entering placing sets audio src to the card audio and plays', async () => {
  const { app, audio } = await setup();
  await startGame(app);
  app.act('go');
  assert.equal(audio.src, app.state.turn.card.audio);
  assert.equal(audio.plays, 1);
  app.act('skip');
  assert.equal(audio.src, app.state.turn.card.audio);
  assert.equal(audio.plays, 2);
  app.act('gap', '0'); app.act('place');
  assert.equal(audio.paused, true);
});

test('audio error shows a free skip that draws a new card without token cost', async () => {
  const { app, audio, root } = await setup();
  await startGame(app);
  app.act('go');
  const first = app.state.turn.card.id;
  audio.listeners.error();
  assert.match(root.innerHTML, /Ton nicht verfügbar/);
  assert.match(root.innerHTML, /data-action="freeSkip"/);
  app.act('freeSkip');
  assert.notEqual(app.state.turn.card.id, first);
  assert.equal(app.state.players[0].tokens, 2);
  assert.doesNotMatch(root.innerHTML, /Ton nicht verfügbar/);
});

test('NotAllowedError shows the tap hint and keeps the turn playable', async () => {
  const audio = fakeAudio();
  audio.playError = Object.assign(new Error('blocked'), { name: 'NotAllowedError' });
  const { app, root } = await setup({ audio });
  await startGame(app);
  app.act('go');
  await new Promise(setImmediate);
  assert.match(root.innerHTML, /Tippe auf ⏵, um zu starten\./);
  assert.doesNotMatch(root.innerHTML, /Ton nicht verfügbar/);
  app.act('gap', '0');
  assert.equal(app.state.turn.gap, 0);
});

test('missing wakeLock API does not throw and an available one is requested on start', async () => {
  await assert.doesNotReject(async () => { const { app } = await setup(); await startGame(app); });
  const requests = [];
  const { app } = await setup({ navigatorStub: { wakeLock: { request: async type => { requests.push(type); return { release() {} }; } } } });
  await startGame(app);
  assert.deepEqual([...requests], ['screen']);
});

test('timeline heading uses the German genitive', async () => {
  const { app, root } = await setup();
  await startGame(app, ['Fabius', 'Lea']);
  app.act('go');
  assert.match(root.innerHTML, /Fabius’ Zeitleiste/);
});

test('leaving setup with Zurück keeps the saved game', async () => {
  const first = await setup();
  await startGame(first.app);
  const second = await setup({ storage: first.storage });
  second.app.act('newGame');
  second.app.act('back');
  assert.ok(first.storage.getItem('hitster-spiel-v1'));
  assert.match(second.root.innerHTML, /Spiel fortsetzen/);
});

test('a new game replaces the old saved game in the start menu', async () => {
  const first = await setup();
  await startGame(first.app);
  const second = await setup({ storage: first.storage });
  await startGame(second.app, ['Neu', 'Auch']);
  second.app.act('menu'); second.app.act('endGame'); second.app.act('confirmEnd');
  assert.doesNotMatch(second.root.innerHTML, /Spiel fortsetzen/);
});

test('Spiel beenden asks for confirmation before deleting', async () => {
  const { app, root, storage } = await setup();
  await startGame(app);
  app.act('menu');
  app.act('endGame');
  assert.ok(storage.getItem('hitster-spiel-v1'));
  assert.match(root.innerHTML, /Wirklich beenden\?/);
  app.act('confirmEnd');
  assert.equal(storage.getItem('hitster-spiel-v1'), null);
  assert.equal(app.state, null);
});

test('profi reveal says a correct steal depends on the title', async () => {
  const { app, root } = await setup();
  app.act('newGame'); app.act('mode', 'profi'); app.act('setName', '0', 'Lea'); app.act('setName', '1', 'Tom');
  app.act('startGame'); app.act('go');
  const card = app.state.turn.card;
  // Test-only: give Lea a start card with the same year, so both gaps around it are correct.
  app.state.players[0].timeline = [{ id: 'film:same', title: 'Gleich', year: card.year }];
  app.act('gap', '0'); app.act('place');
  app.act('steal', 'p2'); app.act('stealGap', '1');
  app.act('reveal');
  assert.equal(app.state.turn.result.placementCorrect, true);
  assert.equal(app.state.turn.result.stealWinner, 'p2');
  assert.match(root.innerHTML, /Tom klaut, falls Lea den Titel nicht kennt/);
  assert.doesNotMatch(root.innerHTML, /klaut die Karte!/);
});

test('pausing while the clip loads (AbortError) is not reported as missing audio', async () => {
  const audio = fakeAudio();
  audio.playError = Object.assign(new Error('interrupted'), { name: 'AbortError' });
  const { app, root } = await setup({ audio });
  await startGame(app);
  app.act('go');
  await new Promise(setImmediate);
  assert.doesNotMatch(root.innerHTML, /Ton nicht verfügbar/);
});
