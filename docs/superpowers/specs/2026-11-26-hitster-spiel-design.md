# Hitster-Spiel an einem Gerät – Konzept

Stand: 26.11.2026 · Status: Entwurf zur Freigabe

## 1. Ziel und Warum

Mit den eigenen Film- und Serienkarten soll man **ohne gedruckte Karten** spielen können. Alle spielen gemeinsam an **einem Gerät** (Handy oder Tablet). Es liegt in der Mitte oder wird weitergereicht. Der Ton kommt nur aus diesem Gerät, es gibt keine Session und kein Mehrgeräte-Spiel. Gespielt wird **Film**, **Serien** oder **Mix** nach den **Regeln des Original-Hitster**.

Ein früherer Entwurf mit Online-Sessions auf dem eigenen Server ist damit verworfen. Ohne Session braucht es **keinen Server**. Die Spielseite läuft wie der bestehende Player auf GitHub Pages.

### Ziele
- Spieler eintragen, Stapel wählen, spielen und gewinnen, ohne Installation, ohne Konto und ohne Internet außer für die MP3s.
- Die Regeln entsprechen dem Original: Zeitleiste, Tokens, „Hitster!“-Klauen, Sieg bei 10 Karten.
- Das Gerät nimmt den Spielern das Mitzählen ab: Wer dran ist, welche Karten jemand hat und wie viele Tokens. Und es zeigt die Lösung erst im richtigen Moment.
- Ein unterbrochenes Spiel lässt sich fortsetzen (Neuladen, Tab geschlossen, Akku leer).
- Das Aussehen ist das bestehende Hitster-Design.

### Nicht-Ziele
- Mehrere Geräte, Sessions, Online-Spiel, eigener Server
- Benutzerkonten, Ranglisten über das einzelne Spiel hinaus
- Eingetippte Titel und automatische Titelprüfung. Wie im Original sagt man den Titel laut, und die Runde entscheidet.
- Gedruckte Karten einscannen. Der bestehende Scan-Player bleibt unverändert.
- Schutz gegen gezieltes Nachschlagen. Die Kartendaten sind öffentlich, wie im README beschrieben.

### Was wäre ein Fehlschlag, auch wenn es technisch funktioniert?
- Die Lösung blitzt auf, bevor die Karte eingeordnet ist.
- Das Gerät sperrt sich mitten im Zug, oder der Ton startet nicht.
- Ein Fehltipp lässt sich nicht rückgängig machen und verdirbt die Partie.
- Für das Klauen muss man umständlich durch Menüs, während alle gleichzeitig „Hitster!“ rufen.

## 2. Bestandsaufnahme

- **Kartendaten**: `variants.json` → `variants/film/cards.json` (385 Karten) und `variants/serien/cards.json` (über 120 Karten, alle mit `verification.status: "pending"`). Gebraucht werden `key`, `tracks` (derzeit nur `de`), `answer.title` und `answer.year`.
- **Player**: `index.html`, `player.js` und `style.css` liefern den runden Player mit Fortschrittsring und Autoplay-Behandlung. Das Design wird übernommen, der Code nicht verändert.
- **Druckansicht**: Die 12er-Farbpalette `palette-0…11` in `cards.css` gibt das Aussehen der Kartenrückseiten vor.
- **Prüfung**: Der Workflow „Check website“ führt `node --check` und `node --test tests/*.test.cjs` aus. Tests laden Browser-Skripte per `node:vm`.

## 3. Lösungswege

| Weg | Abwägung |
|---|---|
| **A. Statische Seite `spiel/` im bestehenden Repo, auf GitHub Pages (gewählt)** | Kein Server, keine Kosten, dieselbe Domain wie die MP3s und damit keine CORS-Fragen. Gleiche Technik wie der Player (reines JavaScript, kein Build). |
| B. Spielseite auf dem eigenen Server | Bringt ohne Sessions keinen Vorteil, nur zusätzlichen Betrieb. Verworfen. |
| C. Spiel in den bestehenden Player einbauen | Vermischt zwei Bedienkonzepte (Karte scannen und digitales Spiel) und gefährdet die gedruckten QR-Links. Verworfen. |

## 4. Architektur

```text
spiel/
  index.html     Einstieg, alle Bildschirme als <section>, eines sichtbar
  engine.js      Regel-Engine: reine Funktionen, keine DOM-Zugriffe
  app.js         Oberfläche, Audio, Speichern, ruft engine.js auf
  spiel.css      Aussehen, baut auf den Farben von style.css auf
tests/spiel-engine.test.cjs
tests/spiel-app.test.cjs
```

- **Adresse**: `https://hitster.fschlieper.de/spiel/`. Ein Link „Digital spielen“ auf der Startseite ist optional.
- **Kartenkatalog**: `app.js` lädt `../variants.json` und die verlinkten `cards.json`. Karten ohne `answer.year` oder ohne Audio werden ausgelassen. Die Audio-Pfade werden wie in `player.js` relativ zur jeweiligen `cards.json` aufgelöst.
- **Regel-Engine** (`engine.js`): `reduce(state, action, random) → state`. Der Zustand ist reines JSON und damit speicherbar und testbar. Zufall (Mischen, Startkarten, Reihenfolge) kommt über einen mitgegebenen Seed-Zufallsgenerator, damit Tests reproduzierbar sind. Die Datei ist so geschrieben, dass sie im Browser (als globales `HitsterEngine`) und in `node:vm`-Tests läuft, wie bei `player.js`.
- **Speichern**: Nach jeder Aktion wird der Zustand in `localStorage` gespeichert (`hitster-spiel-v1`). Beim Öffnen erscheint „Spiel fortsetzen“, wenn ein laufendes Spiel existiert. Gespeichert werden nur Kartenschlüssel, keine Kartendaten. Fehlt ein Schlüssel nach einem Kartenupdate, wird die Karte aus dem Stapel entfernt. Liegt sie schon in einer Zeitleiste, bleibt sie mit den gespeicherten Werten für Titel und Jahr erhalten.
- **Rückgängig**: Die Engine führt einen Verlauf der letzten 20 Zustände. „↶ Rückgängig“ setzt die letzte Aktion zurück, auch nach dem Aufdecken. Damit ist ein Fehltipp kein Drama.
- **Bildschirm wach halten**: Während des Spiels ist `navigator.wakeLock.request('screen')` aktiv. Nach dem Zurückkehren in den Tab wird es neu angefordert.
- **Audio**: ein einziges `<audio>`-Element. Die nächste Karte lädt während des Aufdeckens vor (`preload="auto"`). Der erste Ton startet durch den Tipp auf „Spiel starten“, wodurch der Browser ihn erlaubt. Danach startet jeder Schnipsel automatisch, ⏵ spielt ihn jederzeit erneut ab.

## 5. Spielregeln (nach Original-Hitster)

Statt „Interpret + Songtitel“ zählt der **Film- bzw. Serientitel**. Statt des Erscheinungsjahrs des Songs gilt `answer.year`.

### 5.1 Aufbau
- **2 bis 10 Spieler**, die man mit Namen einträgt. Die Reihenfolge lässt sich per Ziehen ändern oder zufällig auslosen.
- Jeder bekommt eine zufällige **Startkarte offen** (Titel und Jahr sichtbar) und **2 Tokens**. Mehr als **5 Tokens** kann niemand haben.
- Stapel: **Film**, **Serien** oder **Mix** (beide Stapel zusammen gemischt).
- Ziel: **10 Karten** in der Zeitleiste, einstellbar von 5 bis 15.

### 5.2 Ablauf eines Zuges
1. **Übergabe**: Der Bildschirm „**Lea ist dran**“ wird angezeigt. Ein Tipp auf „Los“ startet den Schnipsel. Das Gerät kann dabei weitergereicht werden.
2. **Hören und Einordnen**: Die Zeitleiste von Lea erscheint. Sie tippt auf eine Lücke: davor, dazwischen oder danach. Bei gleichem Jahr gilt jede angrenzende Lücke als richtig.
3. **Titel laut sagen**: Wer den Titel kennt, sagt ihn jetzt laut, vor dem Aufdecken. Ein kleiner Hinweis auf dem Bildschirm erinnert daran.
4. **„Hitster!“**: Nach „Einordnen“ erscheint für einige Sekunden ein großes Feld „**Hitster!? Wer klaut?**“ mit den Namen aller anderen Spieler, die noch Tokens haben. Wer gerufen hat, wird angetippt und wählt eine **andere freie Lücke in Leas Zeitleiste**. Das kostet 1 Token. Es können mehrere klauen, jede Lücke aber nur einer. Wer zuerst angetippt wird, darf zuerst wählen, und das entspricht „wer zuerst ruft“. „Niemand“ oder „Aufdecken“ schließt das Feld.
5. **Aufdecken**: Die Karte dreht sich um und zeigt Jahr und Titel. Das Gerät wertet aus:
   - Lea liegt richtig: Sie behält die Karte. Klauende verlieren ihren Token.
   - Lea liegt falsch, ein Klauender richtig: Er bekommt die Karte in **seine eigene** Zeitleiste, automatisch richtig einsortiert.
   - Alle falsch: Die Karte wird abgelegt.
6. **Titel werten**: „**Hat Lea den Titel richtig genannt?**“ ✔ / ✘. Ein Häkchen gibt **+1 Token**, auch wenn die Karte falsch lag (wie im Original). Es entscheidet die Runde.
7. **Weiter**: Ein Tipp auf „Nächster Zug“ macht den nächsten Spieler aktiv.

### 5.3 Tokens einsetzen
- **Überspringen** (1 Token): Der aktive Spieler bekommt einen neuen Schnipsel, solange er noch nicht eingeordnet hat.
- **Karte kaufen** (3 Tokens): Die aktuelle Karte wird direkt richtig einsortiert, ohne „Hitster!“-Feld.
- **Klauen** (1 Token): siehe 5.2, Schritt 4.

### 5.4 Ende
- Wer **10 Karten** erreicht, gewinnt sofort, auch durch Klauen.
- Ist der Stapel leer, gewinnt der Spieler mit den meisten Karten. Bei Gleichstand entscheiden die Tokens, sonst gibt es mehrere Sieger.
- Danach folgt der Endbildschirm mit Rangliste und den Zeitleisten zum Durchsehen, dazu „Revanche“ (gleiche Spieler und Einstellungen, neu gemischt) und „Neues Spiel“.

### 5.5 Spielmodi (wie im Original)
- **Normal**: wie oben (Standard).
- **Profi**: Die Karte zählt nur, wenn zusätzlich der Titel stimmt. Bei der Frage in Schritt 6 wird die Karte bei ✘ abgelegt. Jeder startet mit 5 Tokens.
- **Experte**: Zusätzlich muss das **genaue Jahr** laut genannt werden. Schritt 6 fragt „Titel **und** Jahr richtig?“.
- **Kooperativ** (später): eine gemeinsame Zeitleiste für alle.

### 5.6 Sonderfälle
- **Ton fehlt** (MP3 lädt nicht): Es erscheint „Ton nicht verfügbar“, und die Karte kann kostenlos übersprungen werden.
- **Spieler hinzufügen oder entfernen während des Spiels**: im Menü ⋯. Neue Spieler bekommen eine Startkarte und 2 Tokens und kommen ans Ende der Reihenfolge.
- **Tokens oder Karten von Hand korrigieren**: Im Menü ⋯ → „Spielstand bearbeiten“ lassen sich Tokens mit ±1 ändern. Für alles Weitere gibt es „Rückgängig“.

### 5.7 Zustandsautomat
```text
setup ─start─► handover ─los─► placing ─einordnen─► hitster ─aufdecken─► reveal ─titel ✔/✘─► scored ─weiter─► handover
                                 │ skip ↺              │                                        │
                                 └ buy ──────────────────────────────────► reveal               └─ Sieg/Stapel leer ─► finished ─revanche─► handover
```

## 6. Design

### 6.0 Überarbeitung: Richtung „Spieltisch“ (26.11.2026)
Der erste Entwurf war dem Nutzer zu unübersichtlich. Aus drei Entwürfen (Spieltisch, Partyshow, Ruhig & klar) hat er **Spieltisch** gewählt. Das gilt vor 6.1 bis 6.3:
- Dunkler, violetter Tisch (`#2c1d4a` → `#0e0a1a`). Die aktuelle Karte liegt verdeckt in der Mitte: pink-violett, leicht gedreht, mit einer Schallplatte als Play-Knopf und einem Fortschrittsring.
- Die eigenen Karten liegen als farbige Mini-Karten (Druckpalette) auf einer „Tischplatte“ darunter. Lücken sind schmale Schlitze, die gewählte Lücke ist pink mit „?“.
- Pro Bildschirm gibt es genau einen weißen Hauptknopf, Nebenaktionen sind Umrandungs-Knöpfe.
- Spieler erscheinen als Chips mit farbigem Initialen-Kreis. Tokens sind gelbe Punkte (5 Plätze). Der aktive Chip ist weiß mit pinkem Ring, die anderen zeigen nur Initiale und Kartenzahl.
- Rückgängig steckt im Menü ⋯ (oben rechts).

### 6.1 Leitlinie
Die Seite setzt den bestehenden Player fort: Hintergrund `#17102a` mit unscharfen Pink- und Lime-Ringen, der runde Player mit Fortschrittsring (Verlauf Cyan `#00ece0` → Lime `#eeff57` → Pink `#ff398f`), Pink `#ff52a5` für die Hauptaktion, Lime `#dfff62` für Bestätigen und Cyan für Auswahl und Fokus. Die Schrift ist Arial/Helvetica, fett, kleine Beschriftungen in Versalien mit Sperrung.

Die **Karten in den Zeitleisten** sehen aus wie die gedruckten Rückseiten: Grundfarbe aus der 12er-Palette der Druckansicht, groß das Jahr, darunter klein der Titel.

Weil alle auf dasselbe Gerät schauen, gilt: **große Schrift, große Tippflächen** (mindestens 48 px), wichtige Infos auch aus 1 m Abstand lesbar. Optimiert ist die Seite für ein Handy im Hochformat. Auf einem Tablet oder im Querformat stehen der Player und die Zeitleiste nebeneinander.

### 6.2 Bildschirme

**Start**
```text
┌──────────────────────────┐
│        HITSTER           │
│        ◯ Ring            │
│  [ Spiel fortsetzen ]    │  ← nur wenn gespeichert, Lime
│  [ Neues Spiel ]         │  ← Pink
└──────────────────────────┘
```

**Einrichtung**
```text
┌──────────────────────────┐
│ SPIELER                  │
│ ≡ Fabius            ✕    │
│ ≡ Lea               ✕    │
│ ≡ Tom               ✕    │
│ [+ Spieler hinzufügen]   │
│ [🎲 Reihenfolge auslosen] │
├──────────────────────────┤
│ Stapel  (Film)(Serien)(Mix)
│ Modus   (Normal)(Profi)(Experte)
│ Ziel    ‹ 10 › Karten    │
├──────────────────────────┤
│      [ Spiel starten ]   │
└──────────────────────────┘
```

**Übergabe**
```text
┌──────────────────────────┐
│                          │
│        LEA               │  ← sehr groß
│     ist dran             │
│   7 🃏    2 ●            │
│                          │
│        [ Los ▶ ]         │
└──────────────────────────┘
```

**Einordnen**
```text
┌──────────────────────────┐
│ Fabius 4🃏2● · Lea 7🃏2● · Tom 3🃏1●   ⋯ │  ← aktiver hervorgehoben
├──────────────────────────┤
│        ╭──────╮          │
│        │  ⏵   │ 0:12/0:20│  ← Ring-Player
│        ╰──────╯          │
│  Titel? Jetzt laut sagen!│
│ [Überspringen 1●] [Kaufen 3●]
├──────────────────────────┤
│ LEAS ZEITLEISTE          │
│ ┆+┆[1972]┆+┆[1994]┆+┆[2008]┆+┆ │  ← waagerecht scrollbar
│      [ Hier einordnen ]  │  ← erscheint nach Wahl einer Lücke
└──────────────────────────┘
```
Antippen einer Lücke wählt sie aus (Cyan, pulsierend), „Hier einordnen“ bestätigt. Lücken sind breit genug für Daumen, bei vielen Karten scrollt die Zeitleiste zur Auswahl mit.

**Hitster!**
```text
┌──────────────────────────┐
│     HITSTER!?            │
│     Wer klaut?           │
│  [ Fabius 2● ] [ Tom 1● ]│  ← Pink, groß
│                          │
│ ┆ ┆[1972]┆▣┆[1994]┆ ┆[2008]┆ ┆ │  ▣ = Leas Wahl
│  Tom → wähle eine Lücke  │
│                          │
│       [ Aufdecken ]      │  ← Lime
└──────────────────────────┘
```
Nach Tippen auf einen Namen wählt dieser Spieler seine Lücke. Belegte Lücken zeigen den Namen (zum Beispiel „Tom“).

**Aufdecken und Wertung**
```text
┌──────────────────────────┐
│     ┌───────────────┐    │
│     │     1999      │    │  ← Karte dreht sich, Palettenfarbe
│     │    Matrix     │    │
│     └───────────────┘    │
│  ✘ Lea lag daneben       │
│  ✔ Tom klaut die Karte!  │
│                          │
│ Hat Lea den Titel        │
│ richtig genannt?         │
│     [ ✔ Ja ] [ ✘ Nein ]  │
└──────────────────────────┘
```
Danach folgt „Nächster Zug“. Die Zeitleiste animiert, wie die Karte einsortiert wird.

**Ende**: Name des Siegers groß, Konfetti in den Ringfarben, Rangliste, die Zeitleisten zum Antippen, „Revanche“ und „Neues Spiel“.

**Menü ⋯**: Rückgängig · Zeitleisten aller ansehen · Spielstand bearbeiten · Spieler hinzufügen/entfernen · Spiel beenden.

### 6.3 Animationen
Karten-Flip 400 ms, das Einschieben in die Zeitleiste mit Federeffekt, beim Klauen fliegt die Karte zum Spielernamen, beim Sieg Konfetti. Bei `prefers-reduced-motion` gibt es keine Animationen. Keine zusätzlichen Soundeffekte, damit sie nicht mit den Schnipseln konkurrieren.

### 6.4 Barrierefreiheit
Zustandswechsel werden per `aria-live` angesagt („Lea ist dran“, „Tom klaut die Karte“). Lücken sind Buttons mit Beschriftung („Zwischen 1972 und 1994“), Kontraste mindestens 4,5:1 und Fokusrahmen in Cyan wie bisher.

## 7. Prüfung
- **Regel-Engine** (`node --test`): richtige und falsche Lücke, gleiches Jahr, mehrere Klauende und belegte Lücken, Klauen ohne Token nicht möglich, Token-Grenze 5, Titelwertung bei falscher Karte, Überspringen, Kaufen, Sieg durch Klauen, leerer Stapel, Profi- und Experte-Modus, Rückgängig, Spieler hinzufügen und entfernen.
- **App** (`node:vm` wie `player.test.cjs`): Katalog laden, Mix, Pfadauflösung, Speichern und Fortsetzen, die Lösung steht vor dem Aufdecken nicht im DOM.
- Der Workflow „Check website“ wird um `node --check spiel/*.js` ergänzt.
- **Gerätetest** auf einem echten Handy (iOS Safari und Android Chrome): erster Ton, Bildschirm bleibt wach, Fortsetzen nach dem Schließen des Tabs.

## 8. Umsetzung in Etappen
1. Regel-Engine mit Tests
2. Einrichtung, Übergabe, Einordnen, Aufdecken, Ende (funktional)
3. Hitster!-Feld, Tokens, Rückgängig, Speichern und Fortsetzen
4. Design und Animationen, Gerätetest
5. Profi- und Experte-Modus

## 9. Eigene Festlegungen (bitte prüfen)
- Adresse `hitster.fschlieper.de/spiel/` auf GitHub Pages, kein eigener Server
- Titel wird laut gesagt, die Runde wertet mit ✔/✘. Keine Eingabe per Tastatur.
- Klauen über Antippen des Namens. Die Reihenfolge des Antippens gilt als „wer zuerst ruft“.
- Rückgängig für die letzten 20 Aktionen
- Serienkarten werden trotz `verification: pending` verwendet
- Gespielt wird mit allen Filmkarten aus `cards.json`, nicht nur mit Version 1
- 2 bis 10 Spieler

## 10. Offen für die Umsetzung
- Genaue Abstände, Größen und Animationswerte
- Ob die Startseite des Players einen Link „Digital spielen“ bekommt
