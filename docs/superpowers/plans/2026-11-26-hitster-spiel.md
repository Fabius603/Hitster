# Hitster-Spiel an einem Gerät – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine statische Seite `spiel/` bauen, auf der 2 bis 10 Spieler an einem Gerät Hitster mit den Film- und Serienkarten nach den Original-Regeln spielen.

**Architecture:** Eine reine Regel-Engine (`spiel/engine.js`) verwandelt einen JSON-Zustand mit Aktionen in einen neuen Zustand. `spiel/catalog.js` baut aus `variants.json` und den `cards.json` den Kartenstapel. `spiel/app.js` zeichnet die Bildschirme, spielt den Ton, speichert in `localStorage` und schickt Tipps als Aktionen an die Engine. Es gibt keinen Server, die Seite läuft auf GitHub Pages.

**Tech Stack:** Reines Browser-JavaScript ohne Build und ohne Abhängigkeiten, CSS, `node:test` mit `node:vm` für Tests (wie `tests/player.test.cjs`).

**Spec:** `docs/superpowers/specs/2026-11-26-hitster-spiel-design.md`

## Global Constraints

- Keine neuen Abhängigkeiten, kein Build-Schritt, kein Framework. Dateien beginnen mit `'use strict';`.
- Engine und Katalog laufen ohne DOM. Sie hängen sich als `globalThis.HitsterEngine` bzw. `globalThis.HitsterCatalog` an und exportieren zusätzlich über `module.exports`, wenn `module` existiert.
- Die Engine verändert übergebene Zustände nie (immer Kopien). Der Zustand bleibt JSON-serialisierbar.
- Regeln: Startkarte offen, Start-Tokens 2 (Profi und Experte: 5), höchstens 5 Tokens, Ziel 10 (einstellbar 5–15), 2 bis 10 Spieler, Überspringen 1 Token, Kaufen 3 Tokens, Klauen 1 Token, Titel-Token +1 auch bei falscher Karte (nur Modus Normal), Rückgängig für die letzten 20 Aktionen.
- Die Lösung (Titel und Jahr der aktuellen Karte) darf vor der Phase `reveal` nirgends im DOM stehen.
- Die Oberfläche ist deutsch. Tippflächen sind mindestens 48 px groß. Farben: `#17102a`, `#ff52a5`, `#dfff62`, `#00ece0`, Ringverlauf `#00ece0 → #eeff57 → #ff398f`, Kartenfarben aus `.palette-0…11` in `cards.css`.
- Bestehende Dateien `index.html`, `player.js`, `style.css` und `cards.*` bleiben unverändert, mit Ausnahme der in Task 6 genannten Zeile.
- Speicherschlüssel in `localStorage`: `hitster-spiel-v1`.

## Review Focus

1. **Neuladen mitten im Zug** (in `hitster` oder `reveal`): Das Spiel muss genau dort weitergehen, ohne eine neue Karte zu ziehen und ohne doppelte Tokenabzüge → Test in Task 4.
2. **Gleiches Jahr mehrfach in der Zeitleiste** (zum Beispiel 1999, 1999, 2004): Jede Lücke an einer 1999er-Karte zählt als richtig. Kein Klau-Erfolg, wenn der aktive Spieler richtig lag → Test in Task 1.
3. **Kartenupdate zwischen zwei Sitzungen** (ein Schlüssel ist im Stapel nicht mehr vorhanden): Die Karte wird aus dem Stapel entfernt, die Zeitleisten bleiben intakt → Test in Task 4.
4. **Leerer Stapel bei sehr kleinem Deck** (zum Beispiel 10 Spieler mit Serienstapel): Startkarten dürfen nicht doppelt vergeben werden. Ist der Stapel leer, endet das Spiel sauber → Test in Task 1.
5. **Ton blockiert oder MP3 fehlt**: Der Zug darf nicht hängen. Der Ausweg „Kostenlos überspringen“ ist erreichbar → Test in Task 5.

---

## Dateistruktur

| Datei | Verantwortung |
|---|---|
| `spiel/engine.js` (neu) | Zustand, Regeln, Rückgängig. Kein DOM, kein Netzwerk. |
| `spiel/catalog.js` (neu) | Varianten und Karten laden, filtern, Audio-Pfade auflösen, Stapel nach Deck-Wahl liefern |
| `spiel/app.js` (neu) | Bildschirme zeichnen, Eingaben → Aktionen, Audio, Speichern, Wake Lock |
| `spiel/index.html` (neu) | Grundgerüst mit einem `<section data-screen="…">` pro Bildschirm |
| `spiel/spiel.css` (neu) | Aussehen und Animationen |
| `tests/spiel-engine.test.cjs` (neu) | Regel-Tests |
| `tests/spiel-catalog.test.cjs` (neu) | Katalog-Tests |
| `tests/spiel-app.test.cjs` (neu) | App-Tests mit `node:vm` und einem Mini-DOM |
| `scripts/serve.cjs` (ändern) | `spiel/` freigeben |
| `.github/workflows/*.yml` (ändern) | `node --check spiel/*.js` |

**Vorbedingung:** Die Serienvariante (`variants/serien/`, Eintrag in `variants.json`) ist derzeit auf dem Branch `kartenbox` noch nicht committet. Die Umsetzung startet deshalb auf einem neuen Branch `spiel` ab dem aktuellen `kartenbox`-Stand, nachdem der Nutzer die laufenden Änderungen committet hat. Ohne Serien laufen alle Tests trotzdem, weil sie eigene Testdaten verwenden.

---

### Task 1: Regel-Engine – Aufbau, Einordnen, Klauen, Wertung, Ende

**Files:**
- Create: `spiel/engine.js`
- Test: `tests/spiel-engine.test.cjs`

**Interfaces:**
- Produces (alles auf `HitsterEngine`):
  - `createRandom(seed: number) → () => number` – deterministischer Zufallsgenerator (mulberry32), Werte in [0,1).
  - `newGame({ names: string[], settings: Settings, cards: Card[] }, random) → State`
    - `Card = { id: string, title: string, year: number, audio: string }`. `id` hat die Form `"<variante>:<key>"`.
    - `Settings = { deck: 'film'|'serien'|'mix', mode: 'normal'|'profi'|'experte', target: number }`
  - `reduce(state: State, action: Action, random) → State`. Ist eine Aktion in der aktuellen Phase ungültig, kommt **dasselbe Objekt** zurück (`===`).
  - `correctGaps(timeline: TimelineCard[], year: number) → number[]` – alle richtigen Lückenindizes (0 = vor der ersten Karte, `timeline.length` = nach der letzten).
  - `State`:
    ```text
    { v: 1, settings, phase: 'handover'|'placing'|'hitster'|'reveal'|'scored'|'finished',
      players: [{ id: 'p1'…, name, tokens, timeline: TimelineCard[] }],   // timeline nach Jahr sortiert
      deck: Card[], discard: string[], active: number,                   // Index in players
      turn: { card: Card, gap: number|null, steals: [{ playerId, gap }], stealer: string|null,
              result: { placementCorrect, stealWinner: string|null, bought: boolean, titleCorrect: boolean|null } | null } | null,
      winners: string[], history: State[] }
    TimelineCard = { id, title, year }
    ```
  - Aktionen: `{type:'start'}` (handover→placing, zieht `turn.card` vom Stapel), `{type:'selectGap', gap}`, `{type:'place'}` (placing→hitster, nur mit gewählter Lücke), `{type:'beginSteal', playerId}`, `{type:'stealGap', gap}`, `{type:'cancelSteal'}`, `{type:'reveal'}` (hitster→reveal, berechnet `result`), `{type:'judge', correct: boolean}` (reveal→scored, verteilt Karte und Tokens), `{type:'next'}` (scored→handover oder finished).

- [ ] **Step 1: Write the failing tests** in `tests/spiel-engine.test.cjs`. Die Engine wird per `require('../spiel/engine.js')` geladen. Hilfsfunktion `cards(years)` erzeugt `{id:'film:k'+i, title:'T'+i, year, audio:'a'+i+'.mp3'}`.
  - `newGame gives each player one distinct face-up start card and 2 tokens`: 3 Namen, 20 Karten → jede Zeitleiste hat Länge 1, alle Start-IDs verschieden, `deck.length === 17`, `tokens === 2`, `phase === 'handover'`, `active === 0`.
  - `profi and experte start with 5 tokens`.
  - `newGame rejects fewer than 2 or more than 10 names and target outside 5..15` → wirft `RangeError`.
  - `newGame with fewer cards than players + 1 throws RangeError` (Review Focus 4).
  - `correctGaps treats equal years as correct on both sides`: Zeitleiste [1999, 1999, 2004], Jahr 1999 → `[0,1,2]`. Jahr 2000 → `[2]`. Jahr 2010 → `[3]`.
  - `placing a correct gap keeps the card and judge(true) adds a token`: Ergebnis `placementCorrect === true`, nach `judge` hat die Zeitleiste 2 Karten in Jahresreihenfolge, `tokens === 3`.
  - `wrong placement with correct title still grants the token and discards the card`: `discard` enthält die Karten-ID, `tokens === 3`, Zeitleiste unverändert.
  - `tokens never exceed 5`.
  - `steal: stealer pays 1 token immediately, cannot pick the active player's gap or a taken gap, wins the card on a correct gap when the active player was wrong`: Die Karte wandert in die Zeitleiste des Klauenden, an der richtigen Stelle einsortiert.
  - `steal fails when the active player was right` (Review Focus 2: Zeitleiste [1999, 2004], Karte 1999, aktiver Spieler wählt Lücke 0, Klauender Lücke 1): Die Karte geht an den aktiven Spieler, der Klauende behält 1 Token weniger.
  - `beginSteal is ignored for players without tokens and for the active player` (gleiches Objekt zurück).
  - `with two stealers only the one on the correct gap wins`: Zeitleiste [1990, 2000], Karte 1995. Der aktive Spieler wählt 0, A wählt 1, B wählt 2 → A bekommt die Karte, A und B haben je 1 Token weniger.
  - `reaching the target ends the game immediately with that winner`, auch wenn der Gewinner ein Klauender ist.
  - `next with an empty deck finishes the game; winners are most cards, then most tokens, ties allowed` (Review Focus 4).
  - `next advances active cyclically`.
  - `invalid actions return the same object`: `place` ohne Lücke, `judge` in `placing`, `start` in `reveal`.
  - `reduce never mutates its input`: `JSON.stringify` vorher und nachher gleich.

- [ ] **Step 2: Run the tests to verify they fail**
  Run: `node --test tests/spiel-engine.test.cjs`
  Expected: FAIL (`Cannot find module '../spiel/engine.js'`).

- [ ] **Step 3: Implement `spiel/engine.js`** mit den Funktionen aus Interfaces.
  - Mischen mit Fisher-Yates über `random`.
  - Reihenfolge der Spieler wie in `names` (Auslosen macht die App).
  - In `judge`: Im Modus Normal gibt `correct` einen Titel-Token und entscheidet nicht über die Karte. In Profi und Experte gibt es keinen Titel-Token, und der aktive Spieler behält die Karte nur bei `placementCorrect && correct`. Andernfalls geht sie an `stealWinner`, falls vorhanden, sonst in `discard`.
  - Nach dem Verteilen der Karte: Erreicht jemand `settings.target`, wird `phase = 'finished'` und `winners = [id]`.
  - Beim `next` wird ein leerer Stapel zu `finished` mit Gewinnerermittlung nach Karten und dann Tokens.

- [ ] **Step 4: Run the tests to verify they pass**
  Run: `node --test tests/spiel-engine.test.cjs`
  Expected: PASS, alle Tests grün.

- [ ] **Step 5: Commit**
  ```bash
  git add spiel/engine.js tests/spiel-engine.test.cjs
  git commit -m "feat(spiel): add Hitster rule engine"
  ```

### Task 2: Regel-Engine – Tokens einsetzen, Rückgängig, Spieler verwalten, Revanche

**Files:**
- Modify: `spiel/engine.js`
- Test: `tests/spiel-engine.test.cjs`

**Interfaces:**
- Consumes: alles aus Task 1.
- Produces, als weitere Aktionen für `reduce`:
  - `{type:'skip', free?: boolean}` – nur in `placing`. Kostet 1 Token (bei `free: true` keinen). Die alte Karte kommt nach `discard`, eine neue wird gezogen. Ohne Token und ohne `free` ist die Aktion ungültig. Ist der Stapel leer, endet das Spiel.
  - `{type:'buy'}` – nur in `placing` mit mindestens 3 Tokens. Die Karte wird richtig einsortiert, `result = { placementCorrect: true, stealWinner: null, bought: true, titleCorrect: null }`, die Phase springt direkt auf `scored`, und das Ziel wird geprüft.
  - `{type:'addPlayer', name}` – in jeder Phase außer `finished`. Der neue Spieler bekommt eine Startkarte vom Stapel und die Start-Tokens und kommt ans Ende. Höchstens 10 Spieler.
  - `{type:'removePlayer', playerId}` – mindestens 2 Spieler bleiben. Ist der entfernte Spieler aktiv, wird der laufende Zug abgebrochen: Die Karte geht zurück unter den Stapel, und der nächste Spieler ist in `handover`. Steals des Entfernten werden gestrichen (ohne Erstattung).
  - `{type:'adjustTokens', playerId, delta: 1|-1}` – Grenzen 0…5.
  - `{type:'rematch'}` – nur in `finished`. Gleiche Namen und Einstellungen, neues Spiel aus allen Karten (`state.allCards`, siehe unten).
  - `undo(state) → State` – gibt den letzten Eintrag aus `history` zurück oder dasselbe Objekt, wenn `history` leer ist.
  - `State` bekommt `allCards: Card[]` (für Revanche). `history` enthält höchstens 20 Vorgänger. Gespeicherte Vorgänger haben selbst `history: []`, damit der Verlauf nicht verschachtelt wächst.

- [ ] **Step 1: Write the failing tests**
  - `skip costs one token and draws a new card`. `skip free costs nothing`. `skip without tokens is ignored`.
  - `buy needs 3 tokens, places the card correctly and goes to scored`.
  - `buy can win the game`.
  - `undo restores the previous state including tokens and phase`. `history is capped at 20`. `history entries do not nest` (`history[0].history.length === 0`).
  - `addPlayer during play gets a start card and joins at the end`. `addPlayer beyond 10 is ignored`.
  - `removePlayer of the active player returns the card to the bottom of the deck and hands over to the next`. `removePlayer cannot go below 2`.
  - `adjustTokens respects 0 and 5`.
  - `rematch keeps names and settings and deals new start cards`.

- [ ] **Step 2: Run** `node --test tests/spiel-engine.test.cjs` → Expected: FAIL in den neuen Tests.

- [ ] **Step 3: Implement** die Aktionen und `undo` in `spiel/engine.js`. Jede gültige Aktion außer `undo` legt den Vorzustand (ohne `history`) vorne in `history` ab und kürzt auf 20.

- [ ] **Step 4: Run** `node --test tests/spiel-engine.test.cjs` → Expected: PASS.

- [ ] **Step 5: Commit** `git commit -m "feat(spiel): add tokens, undo and player management"`

### Task 3: Kartenkatalog

**Files:**
- Create: `spiel/catalog.js`
- Test: `tests/spiel-catalog.test.cjs`

**Interfaces:**
- Produces (auf `HitsterCatalog`):
  - `async loadCatalog(fetchFn, baseUrl: string) → { film: Card[], serien: Card[] }`. Lädt `new URL('../variants.json', baseUrl)` und für die Varianten `film` und `serien` jeweils deren `cards`-Datei. Dateien werden mit `{ cache: 'no-cache' }` geladen. Eine Variante, die fehlt oder nicht lädt, ergibt ein leeres Array statt eines Abbruchs.
  - `deckFor(catalog, deck: 'film'|'serien'|'mix') → Card[]`.
  - Filterregeln: nur Karten mit `key`, ohne `archived: true`, mit `type` gleich `audio` oder ohne `type`, mit ganzzahligem `answer.year` und nicht leerem `answer.title`.
  - `audio` = absolute URL von `tracks.de`, sonst `file`, aufgelöst relativ zur URL der jeweiligen `cards.json` (wie `player.js`). `id = variante + ':' + key`.

- [ ] **Step 1: Write the failing tests** mit einem gefälschten `fetchFn`, der auf Pfadenden antwortet:
  - `resolves audio relative to each cards.json`: Basis `https://h.test/spiel/` → `https://h.test/variants/film/audio/001-de.mp3`.
  - `filters archived, video, keyless and yearless cards`.
  - `missing serien variant yields an empty array and mix equals film`.
  - `ids are prefixed by variant so equal keys in film and serien do not collide`.

- [ ] **Step 2: Run** `node --test tests/spiel-catalog.test.cjs` → Expected: FAIL.
- [ ] **Step 3: Implement** `spiel/catalog.js`.
- [ ] **Step 4: Run** → Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(spiel): load film and series card catalog"`

### Task 4: App-Gerüst – Einrichtung, Ablauf, Speichern und Fortsetzen

**Files:**
- Create: `spiel/index.html`, `spiel/app.js`
- Modify: `scripts/serve.cjs` (in `resolvePublicPath` zusätzlich `relative.startsWith('spiel/')` erlauben)
- Test: `tests/spiel-app.test.cjs`

**Interfaces:**
- Consumes: `HitsterEngine.*` (Task 1+2), `HitsterCatalog.*` (Task 3).
- Produces:
  - `index.html` lädt `../style.css` nicht, sondern `spiel.css`, und die Skripte `catalog.js`, `engine.js` und `app.js` mit `defer`. Pro Bildschirm gibt es ein `<section data-screen="start|setup|handover|placing|hitster|reveal|scored|finished">`. Es ist immer nur eins sichtbar (`hidden`). Dazu kommen ein Menü-Dialog `<dialog id="menu">` und eine `aria-live="polite"`-Region `#announce`.
  - `app.js` hält `let state` und `let catalog`. Zentrale Funktion: `dispatch(action)`. Sie ruft `reduce` auf, speichert und ruft `render()` auf. `render()` zeichnet nur aus `state`.
  - Speichern: `localStorage.setItem('hitster-spiel-v1', JSON.stringify(state))`. Beim Laden wird mit `catalog` abgeglichen: `deck`-Karten, deren `id` nicht mehr im Katalog ist, werden entfernt. Zeitleisten bleiben unverändert (Review Focus 3).
  - Einrichtung: Namensliste (Hinzufügen, Entfernen, Hoch/Runter-Buttons statt Ziehen), „Reihenfolge auslosen“, Deck- und Modus-Auswahl als Buttongruppen mit `aria-pressed`, Ziel mit ‹ ›. „Spiel starten“ ist nur bei 2–10 nicht leeren Namen aktiv.
  - Zeitleiste als Funktion `renderTimeline(container, timeline, { gaps: 'select'|'steal'|'none', selected, taken: {gap: name} })`. Lücken sind `<button>` mit `aria-label` „Vor 1972“, „Zwischen 1972 und 1994“, „Nach 2008“. Karten haben die Klasse `palette-${n}`, wobei `n` aus der ID gehasht wird (Summe der Zeichencodes % 12, stabil über Neuladen).

- [ ] **Step 1: Write the failing tests** in `tests/spiel-app.test.cjs`. Ein Mini-DOM wie in `tests/player.test.cjs`, mit `localStorage`-Ersatz und `fetch`-Ersatz. `catalog.js` und `engine.js` werden vorher in denselben Kontext geladen.
  - `start screen offers "Spiel fortsetzen" only when a saved game exists`.
  - `setup with 2 names starts a game and shows handover with the first name`.
  - `solution is not in the DOM before reveal`: Nach `start`, `selectGap` und `place` taucht weder `turn.card.title` noch `String(turn.card.year)` im Text von `placing` oder `hitster` auf.
  - `reload in hitster phase resumes the same card without charging tokens again` (Review Focus 1): Spiel bis `hitster` mit einem Steal, `localStorage` behalten, Kontext neu aufbauen → gleiche `turn.card.id`, gleiche Tokenstände.
  - `saved deck drops cards missing from the catalog but keeps timelines` (Review Focus 3).
  - `gap buttons carry descriptive aria-labels`.

- [ ] **Step 2: Run** `node --test tests/spiel-app.test.cjs` → Expected: FAIL.
- [ ] **Step 3: Implement** `spiel/index.html` und `spiel/app.js` gemäß Interfaces. Bildschirmtexte wie in den Skizzen von Spec 6.2, zum Beispiel „ist dran“, „Titel? Jetzt laut sagen!“, „HITSTER!? Wer klaut?“, „Hat Lea den Titel richtig genannt?“ (in Experte: „Titel und Jahr richtig?“), „Nächster Zug“, „Revanche“, „Neues Spiel“. Das Menü enthält „Rückgängig“, „Zeitleisten ansehen“, „Spielstand bearbeiten“ (Tokens ±), „Spieler hinzufügen/entfernen“ und „Spiel beenden“ (löscht den Speicher nach `confirm`).
- [ ] **Step 4: Run** `node --test tests/*.test.cjs` → Expected: PASS (auch die bestehenden Tests).
- [ ] **Step 5: Commit** `git commit -m "feat(spiel): add game screens, persistence and resume"`

### Task 5: Audio, Wake Lock und Fehlerfälle

**Files:**
- Modify: `spiel/app.js`, `spiel/index.html`
- Test: `tests/spiel-app.test.cjs`

**Interfaces:**
- Consumes: `dispatch`, `render` aus Task 4, `{type:'skip', free:true}` aus Task 2.
- Produces:
  - Ein `<audio id="audio" preload="auto">`. Beim Wechsel in `placing` wird `src = turn.card.audio` gesetzt und `play()` aufgerufen. Der Tipp auf „Los ▶“ ist die Nutzergeste, die den Ton erlaubt. Der Ring-Player (Markup und Fortschritt wie in `index.html`) zeigt Zeit und Fortschritt. ⏵ spielt den Ausschnitt erneut ab, ■ stoppt ihn.
  - Bei `NotAllowedError` erscheint „Tippe auf ⏵, um zu starten.“. Bei `error`-Event oder einem `play()`-Fehler anderer Art erscheint „Ton nicht verfügbar“ mit dem Button „Kostenlos überspringen“, der `{type:'skip', free:true}` sendet.
  - In `reveal` lädt ein zweites, unsichtbares `new Audio()` die erste Karte von `state.deck` vor.
  - Wake Lock: `navigator.wakeLock?.request('screen')` beim Spielstart und bei `visibilitychange` → `visible`, solange die Phase nicht `finished` ist. Fehler werden ignoriert.
  - Bei jedem Phasenwechsel wird `#announce` gesetzt („Lea ist dran“, „Tom klaut die Karte“ und so weiter), und `navigator.vibrate?.(80)` läuft in `handover`.

- [ ] **Step 1: Write the failing tests**
  - `entering placing sets audio src to the card audio and plays`.
  - `audio error shows a free skip that draws a new card without token cost` (Review Focus 5).
  - `NotAllowedError shows the tap hint and keeps the turn playable`.
  - `missing wakeLock API does not throw`.
- [ ] **Step 2: Run** → Expected: FAIL.
- [ ] **Step 3: Implement** gemäß Interfaces.
- [ ] **Step 4: Run** `node --test tests/*.test.cjs` → Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(spiel): add audio playback, wake lock and audio failure recovery"`

### Task 6: Design, Animationen, CI und Livecheck

**Files:**
- Create: `spiel/spiel.css`
- Modify: `.github/workflows/<check-website>.yml` (im Schritt „Check JavaScript syntax“ `node --check spiel/engine.js spiel/catalog.js spiel/app.js` ergänzen)
- Modify (optional, nur nach Rückfrage beim Nutzer): `index.html` → Link „Digital spielen“

**Interfaces:**
- Consumes: Klassen und Struktur aus Task 4/5.
- Produces: das Aussehen nach Spec 6.1 bis 6.4.
  - Hintergrund und Ringe wie `body` in `style.css`.
  - Der Name auf `handover` ist mindestens `clamp(40px, 12vw, 96px)` groß.
  - Die Zeitleiste ist waagerecht scrollbar (`overflow-x: auto; scroll-snap-type: x proximity`). Eine gewählte Lücke pulsiert in Cyan, mit `scrollIntoView({inline:'center'})` beim Auswählen.
  - Karten: Palettenfarben aus `cards.css`, `.palette-0` bis `.palette-11` mit den gleichen `--tint`-Werten (kopiert, nicht importiert, weil `cards.css` Druckregeln enthält).
  - Karten-Flip in `reveal` 400 ms (`transform: rotateY`), Einschieben mit `cubic-bezier(.3,1.4,.5,1)`, Konfetti in `finished` aus 40 absolut positionierten `<i>` in den Ringfarben. Alles entfällt bei `prefers-reduced-motion: reduce`.
  - Ab `min-width: 768px` oder im Querformat stehen Player und Zeitleiste nebeneinander (Grid mit zwei Spalten).
  - Fokusrahmen `3px solid #00ece0`, Tippflächen mindestens 48 px.

- [ ] **Step 1: Implement** `spiel/spiel.css` und die Workflow-Zeile.
- [ ] **Step 2: Run** `node --check spiel/engine.js && node --check spiel/catalog.js && node --check spiel/app.js && node --test tests/*.test.cjs` → Expected: alles PASS.
- [ ] **Step 3: Browser-Check** mit `preview_start {name: "karten"}` und dann `http://localhost:8765/spiel/`.
  - Eine Partie mit 3 Spielern im Mix-Stapel: Einordnen, ein Klau mit Erfolg, ein Klau ohne Erfolg, Kaufen, Überspringen, Rückgängig, Neuladen in `hitster`.
  - In der Konsole keine Fehler. Screenshots in Hochformat (375×812) und Querformat.
- [ ] **Step 4: Commit** `git commit -m "feat(spiel): style game screens and add CI syntax check"`
- [ ] **Step 5: Nutzer bitten**, einen echten Handytest zu machen (iOS Safari und Android Chrome: erster Ton, Bildschirm bleibt wach, Fortsetzen nach dem Schließen des Tabs). Den Link „Digital spielen“ nur nach seiner Zustimmung einbauen.
