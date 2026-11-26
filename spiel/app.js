'use strict';
// Screens for the single-device Hitster game. Rendering is a pure function of
// (state, ui) into HTML; clicks reach act() through data-action attributes.
(function (root) {
  const STORAGE_KEY = 'hitster-spiel-v1';
  const E = root.HitsterEngine, C = root.HitsterCatalog;

  const escapeHtml = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const palette = id => [...String(id)].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 12;
  const button = (label, action, { value = '', cls = '', disabled = false, aria = '' } = {}) =>
    `<button type="button" class="${cls}" data-action="${action}" data-value="${escapeHtml(value)}"${aria ? ` aria-label="${escapeHtml(aria)}"` : ''}${disabled ? ' disabled' : ''}>${label}</button>`;
  const tokens = n => `${n}&nbsp;●`;
  // German genitive: "Leas", but "Fabius’" for names ending in an s-sound.
  const owner = name => /[sßxz]$/i.test(name) ? name + '’' : name + 's';
  const DECKS = [['film', 'Film'], ['serien', 'Serien'], ['mix', 'Mix']];
  const MODES = [['normal', 'Normal'], ['profi', 'Profi'], ['experte', 'Experte']];

  function createApp({ root: container, storage, fetch, baseUrl, audio = null, random = E.createRandom(Date.now() >>> 0),
    announce = () => {}, onRender = () => {} }) {
    let state = null, catalog = null, saved = null, error = '';
    const ui = { screen: 'loading', names: ['', ''], deck: 'film', mode: 'normal', target: 10, menu: false, newName: '' };

    function readSaved() {
      try { const raw = storage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
    }
    function persist() {
      try { if (state) storage.setItem(STORAGE_KEY, JSON.stringify(state)); else storage.removeItem(STORAGE_KEY); } catch { /* storage full or blocked */ }
    }
    // Align a saved game with the current card catalog: unknown deck cards are dropped, audio refreshed.
    function reconcile(game) {
      const known = {};
      [...catalog.film, ...catalog.serien].forEach(card => { known[card.id] = card; });
      game.deck = game.deck.filter(id => known[id]);
      Object.keys(known).forEach(id => { if (game.cards[id]) game.cards[id] = { ...known[id] }; });
      return game;
    }

    function dispatch(action) {
      const next = E.reduce(state, action, random);
      if (next === state) return false;
      setState(next);
      return true;
    }
    function setState(next) {
      const before = state && state.phase;
      state = next;
      persist();
      if (state && state.phase !== before) {
        announce(announcement());
        if (state.phase === 'handover') { playedId = null; vibrate(); }
      }
      syncAudio();
      render();
    }

    // ---------- audio, wake lock ----------
    let playedId = null, loadedSrc = '', wakeLock = null;
    const nav = () => root.navigator || {};
    function vibrate() { try { const n = nav(); if (n.vibrate && (!n.userActivation || n.userActivation.hasBeenActive)) n.vibrate(80); } catch { /* unsupported */ } }
    function keepAwake() {
      try {
        if (!nav().wakeLock || !state || state.phase === 'finished') return;
        nav().wakeLock.request('screen').then(lock => { wakeLock = lock; }, () => {});
      } catch { /* unsupported */ }
    }
    function setNote(text, failed = false) { ui.audioNote = text; ui.audioFailed = failed; }
    function playCurrent() {
      if (!audio || !state || !state.turn) return;
      const src = state.turn.card.audio;
      if (loadedSrc !== src) { audio.src = src; loadedSrc = src; }
      setNote('');
      // play() must run synchronously inside the tap, otherwise iOS blocks it.
      let attempt;
      try { attempt = Promise.resolve(audio.play()); } catch (err) { attempt = Promise.reject(err); }
      attempt.then(() => { if (ui.audioNote) { setNote(''); render(); } }, err => {
        if (err && err.name === 'NotAllowedError') setNote('Tippe auf ⏵, um zu starten.');
        else setNote('Ton nicht verfügbar', true);
        render();
      });
    }
    function syncAudio() {
      if (!audio) return;
      if (state && state.phase === 'placing') {
        if (state.turn.card.id !== playedId) { playedId = state.turn.card.id; playCurrent(); }
        return;
      }
      audio.pause();
      setNote('');
      if (state && state.phase === 'reveal' && state.deck.length && typeof Audio !== 'undefined') {
        const next = state.cards[state.deck[0]];
        if (next) { const preload = new Audio(); preload.preload = 'auto'; preload.src = next.audio; }
      }
    }
    if (audio) {
      audio.addEventListener('error', () => { if (state && state.phase === 'placing' && loadedSrc) { setNote('Ton nicht verfügbar', true); render(); } });
      ['timeupdate', 'play', 'pause', 'ended', 'loadedmetadata'].forEach(type => audio.addEventListener(type, updateRing));
    }
    function updateRing() {
      if (typeof document === 'undefined') return;
      const time = t => Number.isFinite(t) ? `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}` : '0:00';
      const progress = document.getElementById('progress'), record = document.getElementById('record');
      if (!progress) return;
      const pct = audio.duration > 0 ? Math.min(100, audio.currentTime / audio.duration * 100) : 0;
      progress.setAttribute('stroke-dashoffset', 100 - pct);
      document.getElementById('elapsed').textContent = time(audio.currentTime);
      document.getElementById('duration').textContent = time(audio.duration);
      document.getElementById('play-icon').innerHTML = audio.paused ? '<path d="M8 5v14l11-7z"/>' : '<path d="M6 6h12v12H6z"/>';
      record.classList.toggle('playing', !audio.paused);
    }
    const name = id => { const p = state.players.find(player => player.id === id); return p ? p.name : ''; };
    const active = () => state.players[state.active];
    function announcement() {
      const p = active();
      switch (state.phase) {
        case 'handover': return `${p.name} ist dran`;
        case 'placing': return 'Wo gehört die Karte hin?';
        case 'hitster': return 'Hitster? Wer klaut?';
        case 'reveal': return `${state.turn.card.title}, ${state.turn.card.year}`;
        case 'scored': return state.turn.result.cardTo ? `${name(state.turn.result.cardTo)} bekommt die Karte` : 'Karte abgelegt';
        case 'finished': return `${state.winners.map(name).join(' und ')} gewinnt`;
        default: return '';
      }
    }

    const actions = {
      resume() { if (saved) { state = reconcile(saved); saved = null; ui.screen = 'game'; ui.menu = false; persist(); keepAwake(); render(); } },
      toggleAudio() {
        if (!audio || !state || state.phase !== 'placing') return;
        if (audio.paused) { playedId = state.turn.card.id; playCurrent(); render(); } else audio.pause();
      },
      newGame() { ui.screen = 'setup'; ui.menu = false; render(); },
      setName(index, value) { ui.names[Number(index)] = String(value || '').slice(0, 16); refreshSetupButton(); },
      addName() { if (ui.names.length < 10) ui.names.push(''); render(); },
      removeName(index) { if (ui.names.length > 2) ui.names.splice(Number(index), 1); render(); },
      moveName(value) {
        const [index, dir] = value.split('|').map(Number), to = index + dir;
        if (to < 0 || to >= ui.names.length) return;
        [ui.names[index], ui.names[to]] = [ui.names[to], ui.names[index]];
        render();
      },
      shuffleNames() {
        for (let i = ui.names.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [ui.names[i], ui.names[j]] = [ui.names[j], ui.names[i]]; }
        render();
      },
      deck(value) { ui.deck = value; render(); },
      mode(value) { ui.mode = value; render(); },
      target(delta) { ui.target = Math.min(15, Math.max(5, ui.target + Number(delta))); render(); },
      startGame() {
        if (!canStart()) return;
        const names = ui.names.map(n => n.trim()).filter(Boolean);
        ui.screen = 'game';
        setState(E.newGame({ names, settings: { deck: ui.deck, mode: ui.mode, target: ui.target }, cards: C.deckFor(catalog, ui.deck) }, random));
        keepAwake();
      },
      go() { dispatch({ type: 'start' }); },
      gap(value) {
        const gap = Number(value);
        if (state.phase === 'placing' && state.turn.gap === gap) dispatch({ type: 'place' });
        else dispatch({ type: 'selectGap', gap });
      },
      place() { dispatch({ type: 'place' }); },
      skip() { dispatch({ type: 'skip' }); },
      freeSkip() { if (ui.audioFailed) dispatch({ type: 'skip', free: true }); },
      buy() { dispatch({ type: 'buy' }); },
      steal(playerId) { dispatch({ type: 'beginSteal', playerId }); },
      stealGap(value) { dispatch({ type: 'stealGap', gap: Number(value) }); },
      cancelSteal() { dispatch({ type: 'cancelSteal' }); },
      reveal() { dispatch({ type: 'reveal' }); },
      judge(value) { dispatch({ type: 'judge', correct: value === 'yes' }); },
      next() { dispatch({ type: 'next' }); },
      rematch() { dispatch({ type: 'rematch' }); },
      undo() { const previous = E.undo(state); if (previous !== state) setState(previous); },
      menu() { ui.menu = !ui.menu; render(); },
      tokens(value) { const [playerId, delta] = value.split('|'); dispatch({ type: 'adjustTokens', playerId, delta: Number(delta) }); },
      setNewName(value) { ui.newName = String(value || '').slice(0, 16); },
      addPlayer() { if (dispatch({ type: 'addPlayer', name: ui.newName })) { ui.newName = ''; render(); } },
      removePlayer(playerId) { dispatch({ type: 'removePlayer', playerId }); },
      endGame() { state = null; ui.menu = false; ui.screen = 'start'; persist(); render(); },
      retry() { load(); }
    };

    function canStart() {
      const names = ui.names.map(n => n.trim()).filter(Boolean);
      return names.length >= 2 && names.length <= 10 && C.deckFor(catalog, ui.deck).length > names.length;
    }
    function refreshSetupButton() {
      // Typing must not re-render (it would drop focus); only the start button state changes.
      if (typeof document !== 'undefined') {
        const start = document.querySelector('[data-action="startGame"]');
        if (start) start.disabled = !canStart();
      } else render();
    }

    // ---------- views ----------
    function timeline(player, { mode = 'none', selected = null, taken = {} } = {}) {
      const items = player.timeline, parts = [];
      const label = gap => gap === 0 ? `Vor ${items[0].year}` : gap === items.length ? `Nach ${items[items.length - 1].year}` : `Zwischen ${items[gap - 1].year} und ${items[gap].year}`;
      for (let gap = 0; gap <= items.length; gap++) {
        if (mode !== 'none') {
          const owner = taken[gap];
          const cls = 'gap' + (gap === selected ? ' selected' : '') + (owner ? ' taken' : '');
          const action = mode === 'select' ? 'gap' : 'stealGap';
          parts.push(button(owner ? `<span>${escapeHtml(owner)}</span>` : '+', action, { value: gap, cls, aria: label(gap) + (owner ? `, belegt von ${owner}` : ''), disabled: Boolean(owner) || mode === 'show' }));
        }
        if (gap < items.length) {
          const card = items[gap];
          parts.push(`<div class="tcard palette-${palette(card.id)}"><b>${card.year}</b><span>${escapeHtml(card.title)}</span></div>`);
        }
      }
      return `<div class="timeline" role="list">${parts.join('')}</div>`;
    }
    function scoreboard() {
      return `<header class="bar"><ol class="scores">${state.players.map((p, i) =>
        `<li class="${i === state.active && state.phase !== 'finished' ? 'current' : ''}"><span class="pname">${escapeHtml(p.name)}</span> <span>${p.timeline.length}&nbsp;🃏</span> <span>${tokens(p.tokens)}</span></li>`).join('')}</ol>` +
        `${button('↶', 'undo', { cls: 'icon', aria: 'Rückgängig', disabled: !state.history.length })}${button('⋯', 'menu', { cls: 'icon', aria: 'Menü' })}</header>`;
    }
    function player() {
      return `<div class="record" id="record"><svg class="progress-ring" viewBox="0 0 300 300" aria-hidden="true"><defs><linearGradient id="rainbow" x1="0" y1="1" x2="1" y2="0"><stop stop-color="#00ece0"/><stop offset=".45" stop-color="#eeff57"/><stop offset="1" stop-color="#ff398f"/></linearGradient></defs><circle class="ring-track" cx="150" cy="150" r="139"/><circle id="progress" class="ring-fill" cx="150" cy="150" r="139" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100"/></svg>` +
        `<div class="record-face">${button('<svg id="play-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>', 'toggleAudio', { cls: 'play', aria: 'Ausschnitt abspielen' })}<div class="clock"><span id="elapsed">0:00</span> / <span id="duration">0:00</span></div></div></div>` +
        `<p class="audio-note" id="audio-note" role="status">${escapeHtml(ui.audioNote || '')}</p>${ui.audioFailed ? button('Kostenlos überspringen', 'freeSkip', { cls: 'secondary' }) : ''}`;
    }
    const views = {
      loading: () => `<section class="screen center"><p class="micro">LADE KARTEN …</p></section>`,
      error: () => `<section class="screen center"><h1 class="logo">HITSTER</h1><p>Karten konnten nicht geladen werden.</p>${button('Erneut versuchen', 'retry', { cls: 'primary' })}</section>`,
      start: () => `<section class="screen center"><h1 class="logo">HITSTER</h1><p class="micro">DIGITAL AN EINEM GERÄT</p><div class="ring-logo" aria-hidden="true"></div>` +
        (saved ? button('Spiel fortsetzen', 'resume', { cls: 'confirm' }) : '') + button('Neues Spiel', 'newGame', { cls: 'primary' }) + '</section>',
      setup: () => {
        const choice = (list, current, action) => `<div class="choices" role="group">${list.map(([id, label]) =>
          `<button type="button" data-action="${action}" data-value="${id}" aria-pressed="${id === current}"${action === 'deck' && C.deckFor(catalog, id).length < 3 ? ' disabled' : ''}>${label}${action === 'deck' ? ` <small>${C.deckFor(catalog, id).length}</small>` : ''}</button>`).join('')}</div>`;
        return `<section class="screen setup"><h2 class="micro">SPIELER</h2><ol class="names">${ui.names.map((n, i) =>
          `<li><input type="text" maxlength="16" placeholder="Name ${i + 1}" aria-label="Name Spieler ${i + 1}" value="${escapeHtml(n)}" data-input="setName" data-value="${i}">` +
          `${button('↑', 'moveName', { value: `${i}|-1`, cls: 'icon', aria: 'Nach oben', disabled: i === 0 })}${button('↓', 'moveName', { value: `${i}|1`, cls: 'icon', aria: 'Nach unten', disabled: i === ui.names.length - 1 })}` +
          `${button('✕', 'removeName', { value: i, cls: 'icon', aria: 'Entfernen', disabled: ui.names.length <= 2 })}</li>`).join('')}</ol>` +
          `<div class="row">${button('+ Spieler', 'addName', { cls: 'secondary', disabled: ui.names.length >= 10 })}${button('🎲 Reihenfolge auslosen', 'shuffleNames', { cls: 'secondary' })}</div>` +
          `<h2 class="micro">STAPEL</h2>${choice(DECKS, ui.deck, 'deck')}<h2 class="micro">MODUS</h2>${choice(MODES, ui.mode, 'mode')}` +
          `<h2 class="micro">ZIEL</h2><div class="row stepper">${button('‹', 'target', { value: -1, cls: 'icon', aria: 'Weniger Karten' })}<strong>${ui.target} Karten</strong>${button('›', 'target', { value: 1, cls: 'icon', aria: 'Mehr Karten' })}</div>` +
          button('Spiel starten', 'startGame', { cls: 'primary wide', disabled: !canStart() }) + button('Zurück', 'endGame', { cls: 'link' }) + '</section>';
      },
      handover: () => { const p = active(); return `<section class="screen center handover"><h1 class="big-name">${escapeHtml(p.name)}</h1><p class="lead">ist dran</p><p class="stats">${p.timeline.length}&nbsp;🃏 · ${tokens(p.tokens)}</p>${button('Los ▶', 'go', { cls: 'primary huge' })}</section>`; },
      placing: () => { const p = active(); return `<section class="screen play"><div class="stage">${player()}<p class="hint">Titel? Jetzt laut sagen!</p>` +
        `<div class="row">${button(`Überspringen ${tokens(1)}`, 'skip', { cls: 'secondary', disabled: p.tokens < 1 })}${button(`Kaufen ${tokens(3)}`, 'buy', { cls: 'secondary', disabled: p.tokens < 3 })}</div></div>` +
        `<div class="line"><h2 class="micro">${escapeHtml(owner(p.name))} Zeitleiste</h2>${timeline(p, { mode: 'select', selected: state.turn.gap })}` +
        (state.turn.gap !== null ? button('Hier einordnen', 'place', { cls: 'confirm wide' }) : '<p class="hint">Tippe auf eine Lücke.</p>') + '</div></section>'; },
      hitster: () => {
        const p = active(), turn = state.turn, taken = {};
        taken[turn.gap] = p.name;
        turn.steals.forEach(steal => { taken[steal.gap] = name(steal.playerId); });
        const thieves = state.players.filter(o => o !== p && o.tokens > 0 && !turn.steals.some(s => s.playerId === o.id));
        const stealing = turn.stealer ? `<p class="lead">${escapeHtml(name(turn.stealer))} → wähle eine Lücke</p>${button('Abbrechen', 'cancelSteal', { cls: 'link' })}` :
          `<div class="row thieves">${thieves.map(o => button(`${escapeHtml(o.name)} ${tokens(o.tokens)}`, 'steal', { value: o.id, cls: 'primary' })).join('') || '<p class="hint">Niemand hat Tokens zum Klauen.</p>'}</div>`;
        return `<section class="screen play"><div class="stage"><h1 class="shout">HITSTER!?</h1><p class="lead">Wer klaut?</p>${stealing}</div>` +
          `<div class="line"><h2 class="micro">${escapeHtml(owner(p.name))} Zeitleiste</h2>${timeline(p, { mode: turn.stealer ? 'steal' : 'show', taken })}${turn.stealer ? '' : button('Aufdecken', 'reveal', { cls: 'confirm wide' })}</div></section>`;
      },
      reveal: () => {
        const { card, result, steals } = state.turn, p = active();
        const lines = [result.placementCorrect ? `✔ ${escapeHtml(p.name)} liegt richtig` : `✘ ${escapeHtml(p.name)} liegt daneben`];
        steals.forEach(s => lines.push(s.playerId === result.stealWinner ? `✔ ${escapeHtml(name(s.playerId))} klaut die Karte!` : `✘ ${escapeHtml(name(s.playerId))} verliert ${tokens(1)}`));
        const question = state.settings.mode === 'experte' ? `Hat ${escapeHtml(p.name)} Titel und Jahr richtig genannt?` : `Hat ${escapeHtml(p.name)} den Titel richtig genannt?`;
        return `<section class="screen center reveal"><div class="flip palette-${palette(card.id)}"><b>${card.year}</b><span>${escapeHtml(card.title)}</span></div>` +
          `<ul class="outcome">${lines.map(l => `<li>${l}</li>`).join('')}</ul><p class="lead">${question}</p><div class="row">${button('✔ Ja', 'judge', { value: 'yes', cls: 'confirm' })}${button('✘ Nein', 'judge', { value: 'no', cls: 'primary' })}</div></section>`;
      },
      scored: () => {
        const { card, result } = state.turn, receiver = result.cardTo && state.players.find(p => p.id === result.cardTo);
        const text = result.bought ? `${escapeHtml(active().name)} hat die Karte gekauft` : receiver ? `${escapeHtml(receiver.name)} bekommt die Karte` : 'Die Karte wird abgelegt';
        const bonus = state.settings.mode === 'normal' && result.titleCorrect ? `<p class="hint">Titel richtig: +${tokens(1)} für ${escapeHtml(active().name)}</p>` : '';
        return `<section class="screen center scored"><div class="flip small palette-${palette(card.id)}"><b>${card.year}</b><span>${escapeHtml(card.title)}</span></div><p class="lead">${text}</p>${bonus}` +
          (receiver ? timeline(receiver) : '') + button('Nächster Zug', 'next', { cls: 'primary wide' }) + '</section>';
      },
      finished: () => {
        const ranking = state.players.slice().sort((a, b) => b.timeline.length - a.timeline.length || b.tokens - a.tokens);
        return `<section class="screen center finished"><div class="confetti" aria-hidden="true">${'<i></i>'.repeat(40)}</div><p class="micro">GEWONNEN</p><h1 class="big-name">${state.winners.map(id => escapeHtml(name(id))).join(' &amp; ')}</h1>` +
          `<ol class="ranking">${ranking.map(p => `<li><details><summary>${escapeHtml(p.name)} · ${p.timeline.length}&nbsp;🃏 · ${tokens(p.tokens)}</summary>${timeline(p)}</details></li>`).join('')}</ol>` +
          `<div class="row">${button('Revanche', 'rematch', { cls: 'primary' })}${button('Neues Spiel', 'endGame', { cls: 'secondary' })}</div></section>`;
      }
    };
    function menu() {
      return `<div class="menu" role="dialog" aria-modal="true" aria-label="Menü"><div class="sheet"><div class="row">${button('↶ Rückgängig', 'undo', { cls: 'secondary', disabled: !state.history.length })}${button('Schließen', 'menu', { cls: 'link' })}</div>` +
        `<h2 class="micro">Spielstand bearbeiten</h2><ul class="edit">${state.players.map(p => `<li><details><summary>${escapeHtml(p.name)} · ${p.timeline.length}&nbsp;🃏</summary>${timeline(p)}</details>` +
          `<span class="row">${button('−', 'tokens', { value: `${p.id}|-1`, cls: 'icon', aria: `${p.name} ein Token weniger`, disabled: p.tokens <= 0 })}<b>${tokens(p.tokens)}</b>${button('+', 'tokens', { value: `${p.id}|1`, cls: 'icon', aria: `${p.name} ein Token mehr`, disabled: p.tokens >= E.MAX_TOKENS })}` +
          `${button('✕', 'removePlayer', { value: p.id, cls: 'icon', aria: `${p.name} entfernen`, disabled: state.players.length <= 2 })}</span></li>`).join('')}</ul>` +
        `<div class="row"><input type="text" maxlength="16" placeholder="Neuer Spieler" aria-label="Neuer Spieler" data-input="setNewName" value="${escapeHtml(ui.newName)}">${button('Hinzufügen', 'addPlayer', { cls: 'secondary', disabled: state.players.length >= 10 })}</div>` +
        `${button('Spiel beenden', 'endGame', { cls: 'link danger' })}</div></div>`;
    }

    function html() {
      if (ui.screen !== 'game' || !state) return (views[ui.screen] || views.start)();
      const inPlay = state.phase !== 'finished';
      return (inPlay ? scoreboard() : '') + views[state.phase]() + (ui.menu && inPlay ? menu() : '');
    }
    function render() {
      container.innerHTML = html();
      onRender(state, ui);
    }

    async function load() {
      ui.screen = 'loading'; render();
      try {
        catalog = await C.loadCatalog(fetch, baseUrl);
        saved = readSaved();
        if (saved && (saved.v !== 1 || saved.phase === 'finished' || !Array.isArray(saved.players))) saved = null;
        ui.screen = 'start';
      } catch { ui.screen = 'error'; }
      render();
    }

    function act(action, value = '', input) {
      const handler = actions[action];
      if (!handler) return;
      if (action === 'setName') handler(value, input);
      else if (action === 'setNewName') handler(input);
      else handler(value);
    }

    const app = { act, html, ui, get state() { return state; }, dispatch, ready: null, actions, keepAwake };
    app.ready = load();
    return app;
  }

  function boot() {
    const container = document.getElementById('app');
    const live = document.getElementById('announce');
    const app = createApp({ root: container, storage: localStorage, fetch: fetch.bind(window), baseUrl: location.href,
      audio: document.getElementById('audio'), announce: text => { live.textContent = text; } });
    container.addEventListener('click', event => {
      const target = event.target.closest('[data-action]');
      if (target && !target.disabled) app.act(target.dataset.action, target.dataset.value);
    });
    container.addEventListener('input', event => {
      const target = event.target.closest('[data-input]');
      if (target) app.act(target.dataset.input, target.dataset.value, target.value);
    });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') app.keepAwake(); });
    root.hitsterApp = app;
  }

  root.HitsterApp = { createApp, escapeHtml };
  if (typeof document !== 'undefined' && document.getElementById && document.getElementById('app')) boot();
})(typeof globalThis !== 'undefined' ? globalThis : this);
