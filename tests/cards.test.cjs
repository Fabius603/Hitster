const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { resolvePublicPath } = require('../scripts/serve.cjs');

async function setup({ url = 'http://127.0.0.1:8765/cards.html?variant=film', cards, failure = false, manifests = {} } = {}) {
  class Node {
    constructor(tag) { this.tag = tag; this.children = []; this.events = {}; this.value = ''; this.disabled = true; this.classList = { add: name => { this.className += ' ' + name; } }; }
    append(...nodes) { nodes.forEach(node => this.children.push(...(node.tag === 'fragment' ? node.children : [node]))); }
    replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
    setAttribute(key, value) { this[key] = value; }
    addEventListener(key, callback) { this.events[key] = callback; }
  }
  const elements = new Map(['h1', '#cards', '#edge', '#error', '#print-cards', '#player-url', '#edition', '#edition-field'].map(key => [key, new Node(key)]));
  elements.get('#edge').value = 'long';
  elements.get('#player-url').value = 'https://fabius603.github.io/Hitster/';
  const state = { printed: 0, requests: [], urls: [] };
  const entries = cards || Array.from({ length: 5 }, (_, i) => ({ id: String(i + 1).padStart(3, '0'), answer: { title: 'Film ' + (i + 1), year: 2004, scene: 'Szene', timestamp: '00:13:44' } }));
  const editions = Object.keys(manifests).map(id => ({ id, name: id, cards: id + '.json' }));
  const context = vm.createContext({ URL, location: new URL(url),
    document: { querySelector: key => elements.get(key), createElement: tag => new Node(tag), createDocumentFragment: () => new Node('fragment') },
    window: { print() { state.printed++; } },
    fetch: async (name, options) => {
      state.requests.push({ name, options });
      return { ok: !failure, json: async () => name === 'variants.json' ? [{ id: 'film', name: 'Film-Sounds', cards: 'variants/film/cards.json', editions }] : manifests[name.replace(/\.json$/, '')] || entries };
    }
  });
  for (const name of ['vendor/qrcode.js', 'duplex.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', name), 'utf8'), context);
  const generate = context.qrcode;
  context.qrcode = (...args) => {
    const qr = generate(...args); const add = qr.addData;
    qr.addData = value => { state.urls.push(value); add(value); };
    return qr;
  };
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../cards.js'), 'utf8'), context);
  await new Promise(setImmediate);
  return { get: key => elements.get(key), state };
}

test('direct local files explain how to launch printing without attempting blocked fetches', async () => {
  const { get, state } = await setup({ url: 'file:///C:/Hitster/cards.html' });
  assert.match(get('#error').textContent, /Karten-drucken.cmd/);
  assert.equal(state.requests.length, 0);
  assert.equal(get('#print-cards').disabled, true);
});

test('local HTTP loads all five cards with real QR generation and printable paired sheets', async () => {
  const { get, state } = await setup();
  const pages = get('#cards').children.filter(node => node.tag === 'section');
  assert.equal(pages.length, 2);
  assert.equal(pages[0].children.length, 6);
  assert.equal(pages[1].children.length, 6);
  assert.equal(state.urls.length, 5);
  assert.equal(state.urls[4], 'https://fabius603.github.io/Hitster/?variant=film&id=005');
  assert.equal(get('#print-cards').disabled, false);
  assert.match(get('#error').textContent, /5 Karten geladen/);
  assert.ok(state.requests.every(request => request.options.cache === 'no-store'));
  get('#print-cards').events.click(); assert.equal(state.printed, 1);
});

test('published pages use their own deployment address for QR links', async () => {
  const { state } = await setup({ url: 'https://example.org/game/cards.html?variant=film' });
  assert.equal(state.urls[0], 'https://example.org/game/?variant=film&id=001');
});

test('invalid QR addresses disable printing and a corrected address rebuilds all sheets', async () => {
  const { get, state } = await setup();
  get('#player-url').value = 'file:///C:/Hitster/'; get('#player-url').events.input();
  assert.equal(get('#print-cards').disabled, true);
  assert.equal(get('#cards').children.length, 0);
  get('#print-cards').events.click(); assert.equal(state.printed, 0);
  get('#player-url').value = 'https://example.org/play/'; get('#player-url').events.input();
  assert.equal(get('#print-cards').disabled, false);
  assert.equal(state.urls.at(-1), 'https://example.org/play/?variant=film&id=005');
});

test('editions print only their selected cards and share the same permanent QR links', async () => {
  const shared = 'abcdefghjklm', newKey = 'mnopqrstuvwx';
  const options = {
    cards: [{ id: '001', key: shared }, { id: '002', key: newKey }],
    manifests: { v1: [shared], v2: [newKey, shared] }
  };
  const v1 = await setup(options);
  const v2 = await setup({ ...options, url: 'http://127.0.0.1:8765/cards.html?variant=film&edition=v2' });
  assert.equal(v2.get('#edition').value, 'v2');
  assert.deepEqual(v1.state.urls, ['https://fabius603.github.io/Hitster/?variant=film&card=' + shared]);
  assert.deepEqual(v2.state.urls, ['https://fabius603.github.io/Hitster/?variant=film&card=' + newKey, ...v1.state.urls]);
});

test('empty lists and failed requests give actionable status and keep printing disabled', async () => {
  const empty = await setup({ cards: [] });
  assert.match(empty.get('#error').textContent, /noch keine Karten/);
  assert.equal(empty.get('#print-cards').disabled, true);
  const failed = await setup({ failure: true });
  assert.match(failed.get('#error').textContent, /Variantenliste ist nicht erreichbar/);
  assert.equal(failed.get('#print-cards').disabled, true);
});

test('local server serves website assets and refuses project internals and traversal', () => {
  assert.ok(resolvePublicPath('/cards.html'));
  assert.ok(resolvePublicPath('/variants/film/cards.json'));
  assert.ok(resolvePublicPath('/variants/film/audio/005-en.mp3'));
  for (const name of ['/.git/config', '/.local/nuget/private.json', '/desktop/Hitster.Recorder/Models.cs', '/variants/../README.md', '/variants/%5c..%5cREADME.md', '/variants/film/cards.json.bak'])
    assert.equal(resolvePublicPath(name), null, name);
});
