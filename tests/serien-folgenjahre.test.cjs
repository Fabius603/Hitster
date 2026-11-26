'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = () => import(pathToFileURL(path.join(__dirname, '../scripts/serien-folgenjahre.mjs')).href);
const card = (season, episode, extra = {}) => ({ id: 'x', key: 'k' + season + episode, answer: { title: 'Serie', year: 2008, seriesId: 'tt1', season, episode, ...extra } });

test('applyEpisodeYears stores the air date and year of each episode', async () => {
  const { applyEpisodeYears } = await load();
  const cards = [card(4, 6), card(5, 7)];
  const dates = { 'tt1|4|6': '2011-08-21', 'tt1|5|7': '2012-08-19' };
  const result = applyEpisodeYears(cards, (id, s, e) => dates[`${id}|${s}|${e}`] || null);
  assert.deepEqual(cards.map(c => [c.answer.episodeYear, c.answer.airdate]), [[2011, '2011-08-21'], [2012, '2012-08-19']]);
  assert.equal(result.updated, 2);
  assert.deepEqual(result.missing, []);
  assert.equal(cards[0].answer.year, 2008, 'series start year stays unchanged');
});

test('applyEpisodeYears reports unknown episodes and keeps existing values', async () => {
  const { applyEpisodeYears } = await load();
  const cards = [card(1, 1, { episodeYear: 2009, airdate: '2009-01-01' }), card(9, 9)];
  const result = applyEpisodeYears(cards, () => null);
  assert.equal(cards[0].answer.episodeYear, 2009);
  assert.equal(cards[1].answer.episodeYear, undefined);
  assert.deepEqual(result.missing, ['Serie S9E9']);
  assert.equal(result.updated, 0);
});

test('applyEpisodeYears ignores malformed air dates and cards without series data', async () => {
  const { applyEpisodeYears } = await load();
  const cards = [card(1, 2), { id: 'y', key: 'film', answer: { title: 'Film', year: 1999 } }];
  const result = applyEpisodeYears(cards, () => 'unbekannt');
  assert.equal(cards[0].answer.episodeYear, undefined);
  assert.equal(cards[1].answer.episodeYear, undefined);
  assert.deepEqual(result.missing, ['Serie S1E2']);
});

test('episodeIndex maps TVmaze episodes to season and number', async () => {
  const { episodeIndex } = await load();
  const index = episodeIndex([{ season: 1, number: 1, airdate: '2008-01-20' }, { season: 1, number: null, airdate: '2008-02-01' }, { season: 2, number: 3, airdate: '' }]);
  assert.equal(index.get('1|1'), '2008-01-20');
  assert.equal(index.get('2|3'), undefined);
  assert.equal(index.size, 1);
});
