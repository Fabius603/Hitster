'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../spiel/catalog.js');

const film = [
  { id: '001', key: 'abc', type: 'audio', file: 'audio/001.mp3', tracks: { de: 'audio/001-de.mp3' }, answer: { title: 'Alien', year: 1979 } },
  { id: '002', key: 'arch', archived: true, file: 'audio/002.mp3', answer: { title: 'Alt', year: 1980 } },
  { id: '003', key: 'vid', type: 'video', file: 'video/003.mp4', answer: { title: 'Video', year: 1981 } },
  { id: '004', file: 'audio/004.mp3', answer: { title: 'Ohne Key', year: 1982 } },
  { id: '005', key: 'noyear', file: 'audio/005.mp3', answer: { title: 'Ohne Jahr' } },
  { id: '006', key: 'notitle', file: 'audio/006.mp3', answer: { title: ' ', year: 1990 } },
  { id: '007', key: 'plain', file: 'audio/007.mp3', answer: { title: 'Matrix', year: 1999 } }
];
const serien = [{ id: '001', key: 'abc', file: 'audio/001-de.mp3', answer: { title: 'Breaking Bad', year: 2008 } }];

function fakeFetch(files) {
  const calls = [];
  const fn = async (url, options) => {
    calls.push({ url: String(url), options });
    const hit = Object.entries(files).find(([end]) => String(url).endsWith(end));
    if (!hit) return { ok: false, json: async () => { throw new Error('404'); } };
    return { ok: true, json: async () => hit[1] };
  };
  fn.calls = calls;
  return fn;
}
const variants = withSerien => [
  { id: 'film', cards: 'variants/film/cards.json' },
  ...(withSerien ? [{ id: 'serien', cards: 'variants/serien/cards.json' }] : [])
];

test('resolves audio relative to each cards.json, preferring the German track', async () => {
  const fetch = fakeFetch({ 'variants.json': variants(false), 'film/cards.json': film });
  const catalog = await C.loadCatalog(fetch, 'https://h.test/spiel/');
  assert.equal(catalog.film[0].audio, 'https://h.test/variants/film/audio/001-de.mp3');
  assert.equal(catalog.film[1].audio, 'https://h.test/variants/film/audio/007.mp3');
  assert.ok(fetch.calls.every(call => call.options && call.options.cache === 'no-cache'));
});

test('filters archived, video, keyless, yearless and titleless cards', async () => {
  const catalog = await C.loadCatalog(fakeFetch({ 'variants.json': variants(false), 'film/cards.json': film }), 'https://h.test/spiel/');
  assert.deepEqual(catalog.film.map(card => card.title), ['Alien', 'Matrix']);
  assert.deepEqual(Object.keys(catalog.film[0]).sort(), ['audio', 'id', 'title', 'year']);
});

test('missing serien variant yields an empty array and mix equals film', async () => {
  const catalog = await C.loadCatalog(fakeFetch({ 'variants.json': variants(false), 'film/cards.json': film }), 'https://h.test/spiel/');
  assert.deepEqual(catalog.serien, []);
  assert.deepEqual(C.deckFor(catalog, 'mix'), catalog.film);
});

test('a serien file that fails to load yields an empty array', async () => {
  const catalog = await C.loadCatalog(fakeFetch({ 'variants.json': variants(true), 'film/cards.json': film }), 'https://h.test/spiel/');
  assert.equal(catalog.film.length, 2);
  assert.deepEqual(catalog.serien, []);
});

test('ids are prefixed by variant so equal keys in film and serien do not collide', async () => {
  const catalog = await C.loadCatalog(fakeFetch({ 'variants.json': variants(true), 'film/cards.json': film, 'serien/cards.json': serien }), 'https://h.test/spiel/');
  assert.equal(catalog.film[0].id, 'film:abc');
  assert.equal(catalog.serien[0].id, 'serien:abc');
  assert.equal(C.deckFor(catalog, 'mix').length, 3);
  assert.deepEqual(C.deckFor(catalog, 'serien'), catalog.serien);
});

test('a failing variants.json rejects so the app can show an error', async () => {
  await assert.rejects(C.loadCatalog(fakeFetch({}), 'https://h.test/spiel/'));
});
