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
  // German genitive: "Leas", but "Fabius’" for names ending in an s-sound.
  const owner = name => /[sßxz]$/i.test(name) ? name + '’' : name + 's';
  const DECKS = [['film', 'Film'], ['serien', 'Serien'], ['mix', 'Mix']];
  const MODES = [['normal', 'Normal'], ['profi', 'Profi'], ['experte', 'Experte']];

  function createApp({ root: container, storage, fetch, baseUrl, audio = null, random = E.createRandom(Date.now() >>> 0),
    announce = () => {}, onRender = () => {}, install = { ios: false, standalone: false } }) {
    let state = null, catalog = null, saved = null, error = '', installPrompt = null;
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
        if (err && err.name === 'AbortError') return; // paused or replaced while loading
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
        saved = null;
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
      menu() { ui.menu = !ui.menu; ui.confirmEnd = false; render(); },
      tokens(value) { const [playerId, delta] = value.split('|'); dispatch({ type: 'adjustTokens', playerId, delta: Number(delta) }); },
      setNewName(value) { ui.newName = String(value || '').slice(0, 16); },
      addPlayer() { if (dispatch({ type: 'addPlayer', name: ui.newName })) { ui.newName = ''; render(); } },
      removePlayer(playerId) { dispatch({ type: 'removePlayer', playerId }); },
      back() { ui.screen = 'start'; render(); },
      endGame() { ui.confirmEnd = true; render(); },
      keepPlaying() { ui.confirmEnd = false; render(); },
      confirmEnd() { state = null; saved = null; ui.menu = false; ui.confirmEnd = false; ui.screen = 'start'; persist(); render(); },
      retry() { load(); },
      install() {
        const prompt = installPrompt;
        if (!prompt) return;
        installPrompt = null;
        Promise.resolve(prompt.prompt()).then(() => prompt.userChoice).catch(() => {}).then(() => render());
      }
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

    // ---------- views (design direction A: card table) ----------
    const COLORS = ['#ffd34f', '#6fd3e0', '#a6e07a', '#ff9a6b', '#c9a3ff', '#ff7fb6', '#7fd1ff', '#f2e27a', '#9be3c6', '#ffb3a1'];
    const colorOf = id => COLORS[(parseInt(String(id).slice(1), 10) - 1) % COLORS.length] || COLORS[0];
    const avatar = p => `<i class="avatar" style="--c:${colorOf(p.id)}" aria-hidden="true">${escapeHtml(([...p.name][0] || '?').toUpperCase())}</i>`;
    const coins = n => `<span class="coins" role="img" aria-label="${n} ${n === 1 ? 'Token' : 'Tokens'}">${'<b></b>'.repeat(n)}${'<b class="off"></b>'.repeat(Math.max(0, E.MAX_TOKENS - n))}</span>`;
    const cardFace = (card, cls = '') => `<div class="face ${cls} palette-${palette(card.id)}"><b>${card.year}</b><span>${escapeHtml(card.title)}</span></div>`;
    const panel = (title, body) => `<div class="table"><h2 class="label">${title}</h2>${body}</div>`;
    function timeline(player, { mode = 'none', selected = null, taken = {} } = {}) {
      const items = player.timeline, parts = [];
      const label = gap => gap === 0 ? `Vor ${items[0].year}` : gap === items.length ? `Nach ${items[items.length - 1].year}` : `Zwischen ${items[gap - 1].year} und ${items[gap].year}`;
      for (let gap = 0; gap <= items.length; gap++) {
        if (mode !== 'none') {
          const owner = taken[gap];
          const cls = 'slot' + (gap === selected ? ' sel' : '') + (owner ? ' taken' : '');
          const content = owner ? avatar(owner) : gap === selected ? '?' : '+';
          parts.push(button(content, mode === 'select' ? 'gap' : 'stealGap', { value: gap, cls,
            aria: label(gap) + (owner ? `, belegt von ${owner.name}` : ''), disabled: Boolean(owner) || mode === 'show' }));
        }
        if (gap < items.length) parts.push(cardFace(items[gap], 'mini'));
      }
      return `<div class="timeline" role="list">${parts.join('')}</div>`;
    }
    function scoreboard() {
      return `<header class="bar"><ol class="players">${state.players.map((p, i) =>
        `<li class="chip${i === state.active && state.phase !== 'finished' ? ' on' : ''}" aria-label="${escapeHtml(p.name)}: ${p.timeline.length} Karten, ${p.tokens} Tokens">${avatar(p)}<span class="pname">${escapeHtml(p.name)}</span><small>${p.timeline.length}</small>${coins(p.tokens)}</li>`).join('')}</ol>` +
        `${button('⋯', 'menu', { cls: 'icon ghost', aria: 'Menü und Rückgängig' })}</header>`;
    }
    function mystery(controls) {
      const inner = controls
        ? `<svg class="progress-ring" viewBox="0 0 120 120" aria-hidden="true"><circle class="ring-track" cx="60" cy="60" r="56"/><circle id="progress" class="ring-fill" cx="60" cy="60" r="56" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100"/></svg>` +
          button('<svg id="play-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>', 'toggleAudio', { cls: 'vinyl', aria: 'Ausschnitt abspielen' }) +
          `<em class="clock"><span id="elapsed">0:00</span> / <span id="duration">0:00</span></em>`
        : `<div class="vinyl still" aria-hidden="true"><span>?</span></div><em>HITSTER</em>`;
      return `<div class="mystery${controls ? '' : ' idle'}" id="${controls ? 'record' : 'card-back'}">${inner}</div>`;
    }
    // Offer installation: Android/desktop via the browser's prompt, iPhone via the share menu.
    function installOffer() {
      if (install.standalone) return '';
      if (installPrompt) return button('⤓ App installieren', 'install', { cls: 'link install' });
      if (install.ios) return '<p class="hint install-hint">Als App installieren: unten auf <b>Teilen</b> tippen, dann <b>Zum Home-Bildschirm</b>.</p>';
      return '';
    }
    const views = {
      loading: () => `<section class="screen center">${mystery(false)}<p class="label">Lade Karten …</p></section>`,
      error: () => `<section class="screen center"><h1 class="logo">HITSTER</h1><p class="hint">Karten konnten nicht geladen werden.</p>${button('Erneut versuchen', 'retry', { cls: 'primary' })}</section>`,
      start: () => `<section class="screen center start"><h1 class="logo">HITSTER</h1><p class="label">Film &amp; Serie · an einem Gerät</p>${mystery(false)}<div class="stack">` +
        (saved ? button('Spiel fortsetzen', 'resume', { cls: 'primary wide' }) : '') + button('Neues Spiel', 'newGame', { cls: saved ? 'ghost wide' : 'primary wide' }) + '</div>' + installOffer() + '</section>',
      setup: () => {
        const choice = (list, current, action) => `<div class="segmented" role="group">${list.map(([id, label]) =>
          `<button type="button" data-action="${action}" data-value="${id}" aria-pressed="${id === current}"${action === 'deck' && C.deckFor(catalog, id).length < 3 ? ' disabled' : ''}>${label}${action === 'deck' ? ` <small>${C.deckFor(catalog, id).length}</small>` : ''}</button>`).join('')}</div>`;
        return `<section class="screen setup"><h1 class="title">Neues Spiel</h1>` + panel('Spieler', `<ol class="names">${ui.names.map((n, i) =>
          `<li>${avatar({ id: 'p' + (i + 1), name: n || String(i + 1) })}<input type="text" maxlength="16" placeholder="Name ${i + 1}" aria-label="Name Spieler ${i + 1}" value="${escapeHtml(n)}" data-input="setName" data-value="${i}">` +
          `${button('↑', 'moveName', { value: `${i}|-1`, cls: 'icon ghost', aria: 'Nach oben', disabled: i === 0 })}${button('↓', 'moveName', { value: `${i}|1`, cls: 'icon ghost', aria: 'Nach unten', disabled: i === ui.names.length - 1 })}` +
          `${button('✕', 'removeName', { value: i, cls: 'icon ghost', aria: 'Entfernen', disabled: ui.names.length <= 2 })}</li>`).join('')}</ol>` +
          `<div class="row">${button('+ Spieler', 'addName', { cls: 'ghost small', disabled: ui.names.length >= 10 })}${button('🎲 Reihenfolge auslosen', 'shuffleNames', { cls: 'ghost small' })}</div>`) +
          panel('Stapel', choice(DECKS, ui.deck, 'deck')) + panel('Modus', choice(MODES, ui.mode, 'mode')) +
          panel('Ziel', `<div class="stepper">${button('−', 'target', { value: -1, cls: 'icon ghost', aria: 'Weniger Karten' })}<strong>${ui.target} Karten</strong>${button('+', 'target', { value: 1, cls: 'icon ghost', aria: 'Mehr Karten' })}</div>`) +
          `<div class="dock">${button('Spiel starten', 'startGame', { cls: 'primary wide', disabled: !canStart() })}${button('Zurück', 'back', { cls: 'link' })}</div></section>`;
      },
      handover: () => { const p = active(); return `<section class="screen center handover"><p class="label">Nächster Zug</p><h1 class="big-name">${escapeHtml(p.name)}</h1><p class="lead">ist dran</p>` +
        `${mystery(false)}<p class="stats">${p.timeline.length} ${p.timeline.length === 1 ? 'Karte' : 'Karten'} ${coins(p.tokens)}</p>${button('Los ▶', 'go', { cls: 'primary wide' })}</section>`; },
      placing: () => { const p = active(); return `<section class="screen play"><div class="stage"><p class="label">Du bist dran</p><h1 class="name">${escapeHtml(p.name)}</h1>${mystery(true)}` +
        `<p class="audio-note" id="audio-note" role="status">${escapeHtml(ui.audioNote || '')}</p>${ui.audioFailed ? button('Kostenlos überspringen', 'freeSkip', { cls: 'ghost small' }) : ''}` +
        `<p class="hint">Titel? Jetzt laut sagen!</p><div class="row">${button('Überspringen · 1 Token', 'skip', { cls: 'ghost small', disabled: p.tokens < 1 })}${button('Kaufen · 3 Tokens', 'buy', { cls: 'ghost small', disabled: p.tokens < 3 })}</div></div>` +
        panel(`${escapeHtml(owner(p.name))} Zeitleiste`, timeline(p, { mode: 'select', selected: state.turn.gap }) +
          (state.turn.gap !== null ? button('Hier einordnen', 'place', { cls: 'primary wide' }) : '<p class="hint">Tippe auf eine Lücke zwischen den Karten.</p>')) + '</section>'; },
      hitster: () => {
        const p = active(), turn = state.turn, taken = {};
        taken[turn.gap] = p;
        turn.steals.forEach(steal => { taken[steal.gap] = state.players.find(o => o.id === steal.playerId); });
        const thieves = state.players.filter(o => o !== p && o.tokens > 0 && !turn.steals.some(s => s.playerId === o.id));
        const stealing = turn.stealer ? `<p class="lead">${escapeHtml(name(turn.stealer))}: wähle eine freie Lücke</p>${button('Abbrechen', 'cancelSteal', { cls: 'link' })}` :
          `<div class="thieves">${thieves.map(o => button(`${avatar(o)}<span>${escapeHtml(o.name)}</span>${coins(o.tokens)}`, 'steal', { value: o.id, cls: 'chip-button' })).join('') || '<p class="hint">Niemand hat Tokens zum Klauen.</p>'}</div>`;
        return `<section class="screen play"><div class="stage"><h1 class="shout">HITSTER!?</h1><p class="lead">Wer klaut?</p><p class="hint">Wer glaubt, dass ${escapeHtml(p.name)} falsch liegt, tippt seinen Namen (1 Token).</p>${stealing}</div>` +
          panel(`${escapeHtml(owner(p.name))} Zeitleiste`, timeline(p, { mode: turn.stealer ? 'steal' : 'show', taken }) + (turn.stealer ? '' : button('Aufdecken', 'reveal', { cls: 'primary wide' }))) + '</section>';
      },
      reveal: () => {
        const { card, result, steals } = state.turn, p = active();
        const line = (ok, who, text) => `<li class="${ok === true ? 'ok' : ok === false ? 'no' : 'maybe'}">${avatar(who)}<span>${text}</span></li>`;
        const lines = [line(result.placementCorrect, p, result.placementCorrect ? `${escapeHtml(p.name)} liegt richtig` : `${escapeHtml(p.name)} liegt daneben`)];
        // In profi/experte a correct steal only takes effect if the active player misses the title.
        const pending = result.placementCorrect && result.stealWinner;
        steals.forEach(s => {
          const thief = state.players.find(o => o.id === s.playerId);
          if (!thief) return;
          lines.push(s.playerId !== result.stealWinner ? line(false, thief, `${escapeHtml(thief.name)} verliert 1 Token`) :
            pending ? line(null, thief, `${escapeHtml(thief.name)} klaut, falls ${escapeHtml(p.name)} den Titel nicht kennt`) : line(true, thief, `${escapeHtml(thief.name)} klaut die Karte!`));
        });
        const question = state.settings.mode === 'experte' ? `Hat ${escapeHtml(p.name)} Titel und Jahr richtig genannt?` : `Hat ${escapeHtml(p.name)} den Titel richtig genannt?`;
        return `<section class="screen center reveal">${cardFace(card, 'big flip')}<ul class="outcome">${lines.join('')}</ul><p class="lead">${question}</p>` +
          `<div class="row two">${button('✔ Ja', 'judge', { value: 'yes', cls: 'primary' })}${button('✘ Nein', 'judge', { value: 'no', cls: 'ghost' })}</div></section>`;
      },
      scored: () => {
        const { card, result } = state.turn, receiver = result.cardTo && state.players.find(p => p.id === result.cardTo);
        const text = result.bought ? `${escapeHtml(active().name)} hat die Karte gekauft` : receiver ? `${escapeHtml(receiver.name)} bekommt die Karte` : 'Die Karte wird abgelegt';
        const bonus = state.settings.mode === 'normal' && result.titleCorrect ? `<p class="hint">Titel richtig: +1 Token für ${escapeHtml(active().name)}</p>` : '';
        return `<section class="screen center scored">${cardFace(card, 'big')}<p class="lead">${text}</p>${bonus}` +
          (receiver ? panel(`${escapeHtml(owner(receiver.name))} Zeitleiste`, timeline(receiver)) : '') + button('Nächster Zug', 'next', { cls: 'primary wide' }) + '</section>';
      },
      finished: () => {
        const ranking = state.players.slice().sort((a, b) => b.timeline.length - a.timeline.length || b.tokens - a.tokens);
        const winners = state.winners.map(id => state.players.find(p => p.id === id)).filter(Boolean);
        return `<section class="screen center finished"><div class="confetti" aria-hidden="true">${'<i></i>'.repeat(40)}</div><p class="label">Gewonnen</p><div class="winners">${winners.map(avatar).join('')}</div><h1 class="big-name">${winners.map(w => escapeHtml(w.name)).join(' &amp; ')}</h1>` +
          panel('Rangliste', `<ol class="ranking">${ranking.map(p => `<li><details><summary>${avatar(p)}<span>${escapeHtml(p.name)}</span><small>${p.timeline.length} Karten</small>${coins(p.tokens)}</summary>${timeline(p)}</details></li>`).join('')}</ol>`) +
          `<div class="row two">${button('Revanche', 'rematch', { cls: 'primary' })}${button('Neues Spiel', 'confirmEnd', { cls: 'ghost' })}</div></section>`;
      }
    };
    function menu() {
      return `<div class="menu" role="dialog" aria-modal="true" aria-label="Menü"><div class="sheet"><div class="sheet-head"><h2 class="title">Menü</h2>${button('Schließen', 'menu', { cls: 'link' })}</div>` +
        button('↶ Letzte Aktion rückgängig', 'undo', { cls: 'ghost wide', disabled: !state.history.length }) +
        `<h2 class="label">Spielstand bearbeiten</h2><ul class="edit">${state.players.map(p => `<li><details><summary>${avatar(p)}<span>${escapeHtml(p.name)}</span><small>${p.timeline.length} Karten</small></summary>${timeline(p)}</details>` +
          `<span class="tokens-edit">${button('−', 'tokens', { value: `${p.id}|-1`, cls: 'icon ghost', aria: `${p.name} ein Token weniger`, disabled: p.tokens <= 0 })}${coins(p.tokens)}${button('+', 'tokens', { value: `${p.id}|1`, cls: 'icon ghost', aria: `${p.name} ein Token mehr`, disabled: p.tokens >= E.MAX_TOKENS })}` +
          `${button('✕', 'removePlayer', { value: p.id, cls: 'icon ghost', aria: `${p.name} entfernen`, disabled: state.players.length <= 2 })}</span></li>`).join('')}</ul>` +
        `<div class="add-row"><input type="text" maxlength="16" placeholder="Neuer Spieler" aria-label="Neuer Spieler" data-input="setNewName" value="${escapeHtml(ui.newName)}">${button('Hinzufügen', 'addPlayer', { cls: 'ghost small', disabled: state.players.length >= 10 })}</div>` +
        (ui.confirmEnd ? `<div class="confirm-box"><p class="lead">Wirklich beenden? Der Spielstand wird gelöscht.</p><div class="row two">${button('Ja, beenden', 'confirmEnd', { cls: 'danger-btn' })}${button('Weiterspielen', 'keepPlaying', { cls: 'ghost' })}</div></div>` :
          button('Spiel beenden', 'endGame', { cls: 'link danger' })) + '</div></div>';
    }

    function html() {
      if (ui.screen !== 'game' || !state) return (views[ui.screen] || views.start)();
      const inPlay = state.phase !== 'finished';
      return (inPlay ? scoreboard() : '') + views[state.phase]() + (ui.menu && inPlay ? menu() : '');
    }
    function render() {
      // Keep the horizontal scroll of timelines across re-renders and centre the chosen gap.
      const scrolls = typeof document !== 'undefined' ? [...document.querySelectorAll('.timeline')].map(t => t.scrollLeft) : [];
      container.innerHTML = html();
      if (typeof document !== 'undefined') {
        document.querySelectorAll('.timeline').forEach((t, i) => { if (scrolls[i]) t.scrollLeft = scrolls[i]; });
        const selected = document.querySelector('.gap.selected');
        if (selected && selected.scrollIntoView) selected.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
        if (audio) updateRing();
      }
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

    function setInstallPrompt(event) { installPrompt = install.standalone ? null : event; render(); }
    const app = { act, html, ui, get state() { return state; }, dispatch, ready: null, actions, keepAwake, setInstallPrompt };
    app.ready = load();
    return app;
  }

  function boot() {
    const container = document.getElementById('app');
    const live = document.getElementById('announce');
    const standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const app = createApp({ root: container, storage: localStorage, fetch: fetch.bind(window), baseUrl: location.href,
      audio: document.getElementById('audio'), announce: text => { live.textContent = text; }, install: { ios, standalone } });
    window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); app.setInstallPrompt(event); });
    window.addEventListener('appinstalled', () => app.setInstallPrompt(null));
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
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
