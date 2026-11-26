'use strict';
// Hitster rules as pure functions: reduce(state, action, random) -> new state.
// State is plain JSON so it can be stored in localStorage and tested in Node.
(function (root) {
  const MAX_TOKENS = 5;
  const MIN_PLAYERS = 2, MAX_PLAYERS = 10;

  function createRandom(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const clone = value => JSON.parse(JSON.stringify(value));
  const startTokens = settings => settings.mode === 'normal' ? 2 : 5;
  const timelineCard = card => ({ id: card.id, title: card.title, year: card.year });

  function shuffle(list, random) {
    const result = list.slice();
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function correctGaps(timeline, year) {
    const gaps = [];
    for (let gap = 0; gap <= timeline.length; gap++) {
      const before = gap === 0 || timeline[gap - 1].year <= year;
      const after = gap === timeline.length || timeline[gap].year >= year;
      if (before && after) gaps.push(gap);
    }
    return gaps;
  }

  function insertSorted(timeline, card) {
    const index = timeline.findIndex(item => item.year > card.year);
    timeline.splice(index === -1 ? timeline.length : index, 0, timelineCard(card));
  }

  function validate(names, settings, cards) {
    if (!Array.isArray(names) || names.length < MIN_PLAYERS || names.length > MAX_PLAYERS) throw new RangeError('2 bis 10 Spieler');
    if (!Number.isInteger(settings.target) || settings.target < 5 || settings.target > 15) throw new RangeError('Ziel 5 bis 15');
    if (!['normal', 'profi', 'experte'].includes(settings.mode)) throw new RangeError('Unbekannter Modus');
    if (!Array.isArray(cards) || cards.length < names.length + 1) throw new RangeError('Zu wenige Karten');
  }

  function newGame({ names, settings, cards }, random) {
    validate(names, settings, cards);
    const deck = shuffle(cards, random);
    const players = names.map((name, index) => ({
      id: 'p' + (index + 1), name, tokens: startTokens(settings), timeline: [timelineCard(deck.shift())]
    }));
    return {
      v: 1, settings: { ...settings }, phase: 'handover', players, deck, discard: [], active: 0,
      turn: null, winners: [], allCards: clone(cards), history: [], nextId: names.length + 1
    };
  }

  const activePlayer = state => state.players[state.active];
  const byId = (state, id) => state.players.find(player => player.id === id);

  function rank(state) {
    const best = Math.max(...state.players.map(p => p.timeline.length));
    const leaders = state.players.filter(p => p.timeline.length === best);
    const tokens = Math.max(...leaders.map(p => p.tokens));
    return leaders.filter(p => p.tokens === tokens).map(p => p.id);
  }

  function finish(state, winners) {
    state.phase = 'finished';
    state.winners = winners;
  }

  // Each handler receives a private copy it may mutate, and returns false for invalid actions.
  const handlers = {
    start(s) {
      if (s.phase !== 'handover') return false;
      if (!s.deck.length) { finish(s, rank(s)); return true; }
      s.turn = { card: s.deck.shift(), gap: null, steals: [], stealer: null, result: null };
      s.phase = 'placing';
    },
    selectGap(s, { gap }) {
      if (s.phase !== 'placing' || !Number.isInteger(gap) || gap < 0 || gap > activePlayer(s).timeline.length) return false;
      s.turn.gap = gap;
    },
    place(s) {
      if (s.phase !== 'placing' || s.turn.gap === null) return false;
      s.phase = 'hitster';
    },
    beginSteal(s, { playerId }) {
      const player = byId(s, playerId);
      if (s.phase !== 'hitster' || !player || player === activePlayer(s) || player.tokens < 1) return false;
      if (s.turn.steals.some(steal => steal.playerId === playerId)) return false;
      s.turn.stealer = playerId;
    },
    stealGap(s, { gap }) {
      const { turn } = s;
      if (s.phase !== 'hitster' || !turn.stealer || !Number.isInteger(gap)) return false;
      if (gap < 0 || gap > activePlayer(s).timeline.length || gap === turn.gap || turn.steals.some(steal => steal.gap === gap)) return false;
      byId(s, turn.stealer).tokens -= 1;
      turn.steals.push({ playerId: turn.stealer, gap });
      turn.stealer = null;
    },
    cancelSteal(s) {
      if (s.phase !== 'hitster' || !s.turn.stealer) return false;
      s.turn.stealer = null;
    },
    reveal(s) {
      if (s.phase !== 'hitster') return false;
      const { turn } = s;
      const gaps = correctGaps(activePlayer(s).timeline, turn.card.year);
      const placementCorrect = gaps.includes(turn.gap);
      const winner = turn.steals.find(steal => gaps.includes(steal.gap));
      const stealsCount = s.settings.mode !== 'normal' || !placementCorrect;
      turn.stealer = null;
      turn.result = { placementCorrect, stealWinner: winner && stealsCount ? winner.playerId : null, bought: false, titleCorrect: null };
      s.phase = 'reveal';
    },
    judge(s, { correct }) {
      if (s.phase !== 'reveal' || typeof correct !== 'boolean') return false;
      const { turn } = s, active = activePlayer(s), result = turn.result;
      result.titleCorrect = correct;
      const normal = s.settings.mode === 'normal';
      if (normal && correct) active.tokens = Math.min(MAX_TOKENS, active.tokens + 1);
      const keeps = result.placementCorrect && (normal || correct);
      const receiver = keeps ? active : result.stealWinner ? byId(s, result.stealWinner) : null;
      result.cardTo = receiver ? receiver.id : null;
      s.phase = 'scored';
      if (!receiver) { s.discard.push(turn.card.id); return; }
      insertSorted(receiver.timeline, turn.card);
      if (receiver.timeline.length >= s.settings.target) finish(s, [receiver.id]);
    },
    next(s) {
      if (s.phase !== 'scored') return false;
      if (!s.deck.length) { finish(s, rank(s)); return; }
      s.active = (s.active + 1) % s.players.length;
      s.turn = null;
      s.phase = 'handover';
    }
  };

  function reduce(state, action, random) {
    const handler = action && handlers[action.type];
    if (!handler) return state;
    const next = clone(state);
    next.history = [];
    if (handler(next, action, random) === false) return state;
    next.history = state.history;
    return next;
  }

  const api = { createRandom, newGame, reduce, correctGaps, MAX_TOKENS };
  root.HitsterEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
