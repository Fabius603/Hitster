# Hitster – Karten scannen, Medien abspielen

Mobilfreundliches Kartenspiel für GitHub Pages. Kreisförmiger Player mit Start/Stop, äußerem Fortschrittsring und QR-Scanner für mehrere Varianten. Nach links oder rechts wischen öffnet die Kamera; alternativ den kleinen Scan-Button verwenden. Die Spielseite füllt den Bildschirm ohne Scrollen; im Querformat stehen Player und Scan-Button nebeneinander. Ohne Backend oder externe Laufzeitdienste. Enthält die Variante **Film-Sounds** mit vier eigens synthetisierten Kinoeffekten (keine echten Filmszenen).

## Struktur

```text
variants.json                   # Verzeichnis aller Spielvarianten
variants/
  film/
    cards.json                  # Karten der Filmvariante
    audio/001.mp3               # Vier Beispielsounds: 001–004
index.html                      # Gemeinsamer Player, Variantenauswahl und Scanner
cards.html                      # Druckansicht der gewählten Variante
```

Die QR-Adresse einer Filmkarte verwendet die Varianten-ID und den festen Buchstabenschlüssel aus `cards.json`, zum Beispiel `https://fabius603.github.io/Hitster/?variant=film&card=abcdefghijkl`. Bereits vorhandene QR-Adressen mit `id=…` werden weiterhin gelesen. Der integrierte Scanner verarbeitet auch Karten anderer Varianten im selben Tab und stoppt die vorherige Wiedergabe.

## Neue Kartenversion erstellen

Die Druckansicht lädt standardmäßig **Version 1** mit 275 Filmkarten. Die [Filmliste für Version 1](filmquiz-vorbereitung/filme-version-1.html) ist eine eigene HTML-Datei. `variants/film/version-1.json` enthält die Buchstabenschlüssel in Druckreihenfolge. Der Website-Check schützt die veröffentlichten Dateien der Version 1 vor Änderungen.

1. Neue Filmkarten aufnehmen. Der Recorder und die Stapelaufnahme speichern einen festen `key` je neuer Karte in `variants/film/cards.json`.
2. Eine weitere Liste anlegen, zum Beispiel `variants/film/version-2.json`, und die gewünschten Kartenschlüssel als JSON-Array eintragen. Dieselbe Karte kann in mehreren Versionen stehen.
3. Unter `editions` bei der Filmvariante in `variants.json` einen Eintrag ergänzen, zum Beispiel `{"id":"v2","name":"Version 2","cards":"variants/film/version-2.json"}`. Die Version steht dann in der Druckauswahl.

Die QR-Adresse bleibt bei jeder Druckversion gleich. Der Website-Check prüft, dass vorhandene Buchstabenschlüssel ihren Karten zugeordnet bleiben. Für gedruckte QR-Codes muss die Spieladresse weiterhin erreichbar sein.

## Neue Variante hinzufügen

1. Ordner anlegen, z. B. `variants/filmausschnitte/`.
2. Medien dort ablegen, z. B. `video/001.mp4`.
3. `cards.json` erstellen:
   ```json
   [
     {"id":"001","type":"video","file":"video/001.mp4","description":"Interne Notiz"}
   ]
   ```
   Für Sounds `"type":"audio"` und z. B. `"file":"audio/001.mp3"` verwenden. Die Dateipfade sind relativ zur jeweiligen `cards.json`. Unterstützt sind Audio und Video in browserfähigen Formaten; andere Inhaltsarten benötigen später eine Erweiterung des gemeinsamen Players.
4. In `variants.json` ergänzen:
   ```json
   {"id":"filmausschnitte","name":"Filmausschnitte","description":"Erkenne die Szene.","cards":"variants/filmausschnitte/cards.json"}
   ```
5. Auf `main` pushen. Auswahl und QR-Karten werden automatisch aus diesen Dateien erzeugt.

## Karten drucken und spielen

- **Lokal unter Windows:** `Karten-drucken.cmd` doppelklicken (Node.js erforderlich). Die Druckansicht öffnet sich automatisch; das Serverfenster bis zum Ende geöffnet lassen und anschließend mit Strg+C beenden. Alternativ `node scripts/serve.cjs` starten und die angezeigte Adresse öffnen.
- `cards.html` nicht direkt als Datei öffnen: Browser blockieren dabei das Laden von `cards.json`. Über den lokalen Server werden auch neu gespeicherte Karten direkt angezeigt.
- In der Druckansicht die **Spieladresse für die QR-Codes** kontrollieren. Lokal ist die veröffentlichte GitHub-Pages-Adresse voreingestellt; die QR-Codes sollen auf dem Handy zur veröffentlichten Website führen. Neue Karten und MP3s vorher dort veröffentlichen.

- Druckansicht für Version 1 direkt öffnen mit `cards.html?variant=film&edition=v1`.
- Erst auf der endgültigen Domain drucken.
- „Karte scannen“ verwendet die Rückkamera; HTTPS und Kameraerlaubnis erforderlich.
- Bei blockierter Autowiedergabe im Player auf Play tippen.
- Variante und Karte werden aus dem QR-Link gelesen. Die Versionsauswahl steht in der Druckansicht.
- Lösungen/Titel werden nicht im Player angezeigt. Öffentliche Dateien und Daten bieten keinen Schutz gegen bewusstes Nachschlagen.

## Veröffentlichung

GitHub **Settings → Pages → Source → Deploy from a branch**, Branch **main**, Ordner **/ (root)**. GitHub Pages veröffentlicht die Website nach jedem Push auf `main`. Der Workflow „Check website“ prüft JavaScript, Variantenlisten und Mediendateien. Keine Datenbank und keine Geheimnisse erforderlich.

## Lokal und Prüfung

```sh
python3 -m http.server 8000
# http://localhost:8000 öffnen, nicht file://
node --check player.js
node --check cards.js
node --test tests/player.test.cjs
python3 scripts/check_assets.py
```

Der Asset-Check benötigt ffmpeg/ffprobe. Kamera und Autoplay auf einem echten Handy über HTTPS prüfen (iOS Safari/Android Chrome). Kamerazugriff auf einer unverschlüsselten LAN-IP funktioniert normalerweise nicht.

## Windows-App für eigene Filmkarten

`Filmaufnahme.cmd` im Projektordner startet die native Windows-App. Eine lokal erstellte Version liegt unter `desktop/publish/Hitster.Recorder.exe`. Zum Selbstbauen wird das **.NET-8-SDK oder neuer** benötigt; die normale EXE benötigt die **.NET-8-Desktop-Runtime**. Es sind weder Python noch ffmpeg nötig.

```powershell
# App aus dem Quellcode starten
.\desktop\Start-Recorder.ps1
# EXE und zugehörige Dateien erstellen
.\desktop\Publish-Recorder.ps1
# Optional: Windows-x64-Version inklusive .NET-Runtime erstellen
.\desktop\Publish-Recorder.ps1 -SelfContained
```

1. Unter **Einstellungen** Projektordner, Ausgabegerät und globalen Start/Stopp-Hotkey wählen. Standard: **Strg + Umschalt + F9**. Der Hotkey funktioniert auch bei minimierter App.
2. Im Browser die deutsche Filmszene vorbereiten. Hotkey drücken, Szene abspielen, mit demselben Hotkey stoppen. Die Aufnahme wird automatisch lokal als MP3 gesichert.
3. Im Browser auf Englisch umstellen, zur gleichen Szene zurückspulen und erneut mit dem Hotkey starten/stoppen. Die App gibt die Reihenfolge Deutsch → Englisch vor; sie steuert den Streamingdienst nicht.
4. Bei jeder Spur mit den beiden Reglern **Start** und **Ende** zuschneiden. **Abspielen/Pause** hört ausschließlich den gewählten Ausschnitt vor; **↺** setzt die Vorschau zurück. Schnittänderungen stoppen die Vorschau. Jeder Ausschnitt muss länger als eine und kürzer als 60 Sekunden sein.
5. **Filmtitel, Erscheinungsjahr, Szene und Zeitpunkt im Film (HH:MM:SS)** ausfüllen und **Karte speichern** drücken.

Die App vergibt eine freie ID, exportiert `variants/film/audio/005-de.mp3` und `005-en.mp3` und ergänzt `variants/film/cards.json`. Bestehende Karten und Medien bleiben erhalten. Vor dem Ersetzen der Kartenliste wird `cards.json.bak` als Sicherung angelegt. Bei einem Exportfehler wird keine unvollständige Karte eingetragen. Die Änderungen sind anschließend lokal vorhanden und werden wie bisher erst durch einen Push veröffentlicht.

Aufgenommen wird der **gesamte Ton des gewählten Windows-Ausgabegeräts**, kein Mikrofon. Andere Programme stummschalten. Geschützte Streaming-Wiedergabe kann Aufnahmen verhindern. Stumme Aufnahmen werden mit einer Fehlermeldung abgewiesen. Eine Aufnahme endet nach spätestens zehn Minuten automatisch. Bei Surround-Ton wird für die MP3 einschließlich Mittelkanal auf Stereo heruntergemischt.

Rohaufnahmen als WAV und automatisch erzeugte ungeschnittene MP3s bleiben unter `%LOCALAPPDATA%\HitsterRecorder\recordings` erhalten, bis du sie selbst löschst. Über die Einstellungen lässt sich dieser Ordner öffnen. WAV-Dateien werden für den Schnitt verwendet, damit die MP3 nicht mehrfach verlustbehaftet bearbeitet wird. Die Einstellungen liegen nebenan in `settings.json`.

Zweisprachige Karten ergänzen das bestehende Format um `tracks`; `file` bleibt als deutsche Standardspur erhalten:

```json
{
  "id": "005",
  "type": "audio",
  "file": "audio/005-de.mp3",
  "tracks": {"de": "audio/005-de.mp3", "en": "audio/005-en.mp3"},
  "description": "Beschreibung der Szene",
  "answer": {"title": "Filmtitel", "year": 1999, "scene": "Beschreibung der Szene", "timestamp": "01:12:34"}
}
```

Der Spiele-Player zeigt bei diesen Karten **Deutsch / English** an und behält die gewählte Sprache beim nächsten Scan bei. Ein Sprachwechsel startet den anderen Ausschnitt am Anfang und übernimmt den Wiedergabe-/Pausezustand. Alte Karten mit nur `file` funktionieren weiterhin.

Technik: WPF, Windows WASAPI-Loopback, globaler Windows-Hotkey und Windows-Media-Foundation-MP3-Encoder über [NAudio 2.2.1](https://github.com/naudio/NAudio/tree/v2.2.1) (MIT). Die Anwendung läuft ohne Administratorrechte.

Prüfung der Windows-App inklusive echtem MP3-Export, Schnitt, Surround-Downmix, ID-Vergabe, Speicherkonflikten und Fehler-Rollback:

```powershell
dotnet run --project desktop/Hitster.Recorder.Tests --configuration Release
# Zusätzlich reale Windows-Hotkeys, Regler/Play/Pause und ca. 1 s Loopback-Aufnahme prüfen
dotnet run --project desktop/Hitster.Recorder.Tests --configuration Release -- --windows-smoke
```

## Beispielsounds und Lizenzen

Vier Demos à acht Sekunden: Weltraum-Signal, Spannung, Abenteuer-Fanfare, mysteriöse Glocken. Eigenständig synthetisiert; unter CC0-1.0 bereitgestellt. Reproduzierbar mit `python3 scripts/generate_demo_audio.py` (Python 3 und ffmpeg).

Eigene Film- und Audioinhalte nur mit den nötigen Veröffentlichungsrechten hochladen.

Lokal eingebundene Bibliotheken: html5-qrcode 2.3.8 (Apache-2.0, Lizenz unter `vendor/`); qrcode-generator 1.4.4 (MIT, Lizenz im Dateikopf von `vendor/qrcode.js`).

## Beidseitige Spielkarten

Die Druckseite erzeugt A4-Hochformat-Bögen mit acht Karten (70 × 70 mm, 5 mm weißer Rand rundum, QR-Codes auf weißem Hintergrund): erst QR-Vorderseite, dann zugehörige Auflösungs-Rückseite. Standard ist Duplex an der langen Kante (Spalten der Rückseite gespiegelt). Kurze Kante ist auswählbar (Zeilen gespiegelt). Leere Plätze bleiben erhalten, damit auch unvollständige Bögen zusammenpassen.

Drucken: A4, Hochformat, 100 %/tatsächliche Größe, Duplex mit derselben Wendekante wie in der Ansicht; Kopf-/Fußzeilen aus. Zuerst Seiten 1–2 testen, einen QR-Code scannen und die passende Rückseite prüfen und danach ausschneiden. Druckerversatz ist geräteabhängig.

Auflösung je Karte in `variants/<variante>/cards.json` hinterlegen:

```json
"answer": {
  "title": "Filmtitel",
  "year": 1999,
  "timestamp": "01:12:34",
  "scene": "Kurze Beschreibung der Szene"
}
```

`timestamp` und `scene` sind optional; der Zeitpunkt bezieht sich auf die verwendete Filmfassung. Für andere Varianten ist `title` allgemein der Lösungstitel. Die vier synthetischen Demos haben keinen echten Film und kein Filmjahr; ihre Rückseiten sind entsprechend gekennzeichnet. Die Auflösung erscheint ausschließlich auf der Druckseite, nicht im Player.
