'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const E = require('../spiel/engine.js');

const cards = years => years.map((year, i) => ({ id: 'film:k' + i, title: 'T' + i, year, audio: 'a' + i + '.mp3' }));
const settings = (extra = {}) => ({ deck: 'film', mode: 'normal', target: 10, ...extra });
const tl = years => years.map((year, i) => ({ id: 'tl:' + year + ':' + i, title: 'S' + i, year }));

// Builds a game, then overwrites timelines and the next card so scenarios are explicit.
function scenario({ timelines, card, tokens = 2, mode = 'normal', target = 10, deck = [1900, 1901, 1902] }) {
  const names = timelines.map((_, i) => 'P' + i);
  let state = E.newGame({ names, settings: settings({ mode, target }), cards: cards(new Array(names.length + 5).fill(1950)) }, E.createRandom(1));
  state = JSON.parse(JSON.stringify(state));
  state.players.forEach((p, i) => { p.timeline = tl(timelines[i]); p.tokens = Array.isArray(tokens) ? tokens[i] : tokens; });
  state.deck = [{ id: 'film:card', title: 'Karte', year: card, audio: 'x.mp3' }, ...cards(deck).map(c => ({ ...c, id: c.id + 'd' }))];
  return state;
}
const run = (state, ...actions) => actions.reduce((s, a) => E.reduce(s, a, E.createRandom(2)), state);
const placeAt = gap => [{ type: 'start' }, { type: 'selectGap', gap }, { type: 'place' }];

test('newGame gives each player one distinct face-up start card and 2 tokens', () => {
  const s = E.newGame({ names: ['A', 'B', 'C'], settings: settings(), cards: cards([...Array(20).keys()].map(i => 1960 + i)) }, E.createRandom(7));
  assert.equal(s.phase, 'handover');
  assert.equal(s.active, 0);
  assert.equal(s.deck.length, 17);
  assert.ok(s.players.every(p => p.timeline.length === 1 && p.tokens === 2));
  assert.equal(new Set(s.players.map(p => p.timeline[0].id)).size, 3);
  assert.equal(s.allCards.length, 20);
  assert.deepEqual(s.history, []);
});

test('profi and experte start with 5 tokens', () => {
  for (const mode of ['profi', 'experte']) {
    const s = E.newGame({ names: ['A', 'B'], settings: settings({ mode }), cards: cards([1, 2, 3, 4]) }, E.createRandom(1));
    assert.ok(s.players.every(p => p.tokens === 5));
  }
});

test('newGame rejects fewer than 2 or more than 10 names and target outside 5..15', () => {
  const many = cards([...Array(30).keys()]);
  assert.throws(() => E.newGame({ names: ['A'], settings: settings(), cards: many }, E.createRandom(1)), RangeError);
  assert.throws(() => E.newGame({ names: [...'ABCDEFGHIJK'], settings: settings(), cards: many }, E.createRandom(1)), RangeError);
  assert.throws(() => E.newGame({ names: ['A', 'B'], settings: settings({ target: 4 }), cards: many }, E.createRandom(1)), RangeError);
  assert.throws(() => E.newGame({ names: ['A', 'B'], settings: settings({ target: 16 }), cards: many }, E.createRandom(1)), RangeError);
});

test('newGame with fewer cards than players + 1 throws RangeError', () => {
  assert.throws(() => E.newGame({ names: ['A', 'B', 'C'], settings: settings(), cards: cards([1, 2, 3]) }, E.createRandom(1)), RangeError);
});

test('correctGaps treats equal years as correct on both sides', () => {
  const line = tl([1999, 1999, 2004]);
  assert.deepEqual(E.correctGaps(line, 1999), [0, 1, 2]);
  assert.deepEqual(E.correctGaps(line, 2000), [2]);
  assert.deepEqual(E.correctGaps(line, 2010), [3]);
  assert.deepEqual(E.correctGaps(line, 1990), [0]);
});

test('placing a correct gap keeps the card and judge(true) adds a token', () => {
  let s = run(scenario({ timelines: [[1990], [2000]], card: 1995 }), ...placeAt(1), { type: 'reveal' });
  assert.equal(s.phase, 'reveal');
  assert.equal(s.turn.result.placementCorrect, true);
  s = run(s, { type: 'judge', correct: true });
  assert.equal(s.phase, 'scored');
  assert.deepEqual(s.players[0].timeline.map(c => c.year), [1990, 1995]);
  assert.equal(s.players[0].tokens, 3);
});

test('wrong placement with correct title still grants the token and discards the card', () => {
  const s = run(scenario({ timelines: [[1990], [2000]], card: 1995 }), ...placeAt(0), { type: 'reveal' }, { type: 'judge', correct: true });
  assert.equal(s.turn.result.placementCorrect, false);
  assert.ok(s.discard.includes('film:card'));
  assert.equal(s.players[0].timeline.length, 1);
  assert.equal(s.players[0].tokens, 3);
});

test('tokens never exceed 5', () => {
  const s = run(scenario({ timelines: [[1990], [2000]], card: 1995, tokens: 5 }), ...placeAt(1), { type: 'reveal' }, { type: 'judge', correct: true });
  assert.equal(s.players[0].tokens, 5);
});

test('steal: stealer pays immediately, cannot take the active gap or a taken gap, and wins on a correct gap', () => {
  let s = run(scenario({ timelines: [[1990, 2000], [1980], [1970]], card: 1995 }), ...placeAt(0));
  assert.equal(s.phase, 'hitster');
  s = run(s, { type: 'beginSteal', playerId: 'p2' });
  assert.equal(s.turn.stealer, 'p2');
  assert.equal(E.reduce(s, { type: 'stealGap', gap: 0 }, E.createRandom(1)), s);
  s = run(s, { type: 'stealGap', gap: 1 });
  assert.equal(s.players[1].tokens, 1);
  assert.deepEqual(s.turn.steals, [{ playerId: 'p2', gap: 1 }]);
  s = run(s, { type: 'beginSteal', playerId: 'p3' });
  assert.equal(E.reduce(s, { type: 'stealGap', gap: 1 }, E.createRandom(1)), s);
  s = run(s, { type: 'cancelSteal' }, { type: 'reveal' });
  assert.equal(s.turn.result.stealWinner, 'p2');
  s = run(s, { type: 'judge', correct: false });
  assert.deepEqual(s.players[1].timeline.map(c => c.year), [1980, 1995]);
  assert.equal(s.players[0].timeline.length, 2);
});

test('steal fails when the active player was right on an equal year', () => {
  let s = run(scenario({ timelines: [[1999, 2004], [1980]], card: 1999 }), ...placeAt(0),
    { type: 'beginSteal', playerId: 'p2' }, { type: 'stealGap', gap: 1 }, { type: 'reveal' });
  assert.equal(s.turn.result.placementCorrect, true);
  assert.equal(s.turn.result.stealWinner, null);
  s = run(s, { type: 'judge', correct: false });
  assert.equal(s.players[0].timeline.length, 3);
  assert.equal(s.players[1].tokens, 1);
});

test('beginSteal is ignored for players without tokens and for the active player', () => {
  const s = run(scenario({ timelines: [[1990], [2000]], card: 1995, tokens: [2, 0] }), ...placeAt(0));
  assert.equal(E.reduce(s, { type: 'beginSteal', playerId: 'p2' }, E.createRandom(1)), s);
  assert.equal(E.reduce(s, { type: 'beginSteal', playerId: 'p1' }, E.createRandom(1)), s);
});

test('with two stealers only the one on the correct gap wins', () => {
  const s = run(scenario({ timelines: [[1990, 2000], [1], [2]], card: 1995 }), ...placeAt(0),
    { type: 'beginSteal', playerId: 'p2' }, { type: 'stealGap', gap: 1 },
    { type: 'beginSteal', playerId: 'p3' }, { type: 'stealGap', gap: 2 },
    { type: 'reveal' }, { type: 'judge', correct: false });
  assert.equal(s.players[1].timeline.length, 2);
  assert.equal(s.players[2].timeline.length, 1);
  assert.equal(s.players[1].tokens, 1);
  assert.equal(s.players[2].tokens, 1);
});

test('reaching the target ends the game immediately with that winner, also by stealing', () => {
  const s = run(scenario({ timelines: [[1990, 2000], [1, 2, 3, 4]], card: 1995, target: 5 }), ...placeAt(0),
    { type: 'beginSteal', playerId: 'p2' }, { type: 'stealGap', gap: 1 }, { type: 'reveal' }, { type: 'judge', correct: false });
  assert.equal(s.phase, 'finished');
  assert.deepEqual(s.winners, ['p2']);
});

test('next with an empty deck finishes the game; winners by cards, then tokens, ties allowed', () => {
  let s = scenario({ timelines: [[1990], [2000]], card: 1995, deck: [] });
  s = run(s, ...placeAt(1), { type: 'reveal' }, { type: 'judge', correct: false }, { type: 'next' });
  assert.equal(s.phase, 'finished');
  assert.deepEqual(s.winners, ['p1']);
  let t = scenario({ timelines: [[1990], [2000]], card: 1995, deck: [] });
  t = run(t, ...placeAt(0), { type: 'reveal' }, { type: 'judge', correct: false }, { type: 'next' });
  assert.deepEqual(t.winners, ['p1', 'p2']);
  let u = scenario({ timelines: [[1990], [2000]], card: 1995, deck: [] });
  u = run(u, ...placeAt(0), { type: 'reveal' }, { type: 'judge', correct: true }, { type: 'next' });
  assert.deepEqual(u.winners, ['p1']);
});

test('next advances active cyclically and returns to handover', () => {
  let s = scenario({ timelines: [[1990], [2000]], card: 1995 });
  s = run(s, ...placeAt(1), { type: 'reveal' }, { type: 'judge', correct: false }, { type: 'next' });
  assert.equal(s.phase, 'handover');
  assert.equal(s.active, 1);
  assert.equal(s.turn, null);
  s = run(s, ...placeAt(0), { type: 'reveal' }, { type: 'judge', correct: false }, { type: 'next' });
  assert.equal(s.active, 0);
});

test('invalid actions return the same object', () => {
  const s = run(scenario({ timelines: [[1990], [2000]], card: 1995 }), { type: 'start' });
  assert.equal(E.reduce(s, { type: 'place' }, E.createRandom(1)), s);
  assert.equal(E.reduce(s, { type: 'judge', correct: true }, E.createRandom(1)), s);
  const r = run(s, { type: 'selectGap', gap: 0 }, { type: 'place' }, { type: 'reveal' });
  assert.equal(E.reduce(r, { type: 'start' }, E.createRandom(1)), r);
  assert.equal(E.reduce(s, { type: 'selectGap', gap: 5 }, E.createRandom(1)), s);
});

test('reduce never mutates its input', () => {
  const s = scenario({ timelines: [[1990, 2000], [1980]], card: 1995 });
  const before = JSON.stringify(s);
  run(s, ...placeAt(0), { type: 'beginSteal', playerId: 'p2' }, { type: 'stealGap', gap: 1 }, { type: 'reveal' }, { type: 'judge', correct: true }, { type: 'next' });
  assert.equal(JSON.stringify(s), before);
});
