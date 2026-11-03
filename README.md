# Hitster – Karten scannen, Medien abspielen

Mobilfreundliches Kartenspiel für GitHub Pages. Gemeinsamer Player und QR-Scanner für mehrere Varianten. Ohne Backend oder externe Laufzeitdienste. Enthält die Variante **Film-Sounds** mit vier eigens synthetisierten Kinoeffekten (keine echten Filmszenen).

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

Eine Karte verweist auf `https://fabius603.github.io/Hitster/?variant=film&id=001`.
Variante und Karten-ID bestimmen gemeinsam den Inhalt. Jede Variante kann daher wieder mit Karte `001` beginnen. Der integrierte Scanner verarbeitet auch Karten anderer Varianten im selben Tab und stoppt die vorherige Wiedergabe. Die normale Handykamera öffnet zunächst die Website.

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

- Auf der Startseite Variante wählen, dann im Fußbereich „QR-Karten drucken“ öffnen.
- Erst auf der endgültigen Domain drucken. Domain, Varianten-ID und Karten-ID später beibehalten.
- „Karte scannen“ verwendet die Rückkamera; HTTPS und Kameraerlaubnis erforderlich.
- Bei blockierter Autowiedergabe im Player auf Play tippen.
- Unter „Ohne Kamera spielen“ Kartennummer eingeben oder die ersten vier Karten ausprobieren.
- Lösungen/Titel werden nicht im Player angezeigt. Öffentliche Dateien und Daten bieten keinen Schutz gegen bewusstes Nachschlagen.

## Veröffentlichung

GitHub **Settings → Pages → Source → Deploy from a branch**, Branch **main**, Ordner **/ (root)**. GitHub Pages veröffentlicht die Website nach jedem Push auf `main`. Der Workflow „Check website“ prüft JavaScript, Variantenlisten und Mediendateien. Keine Datenbank und keine Geheimnisse erforderlich.

## Lokal und Prüfung

```sh
python3 -m http.server 8000
# http://localhost:8000 öffnen, nicht file://
node --check player.js
node --check cards.js
python3 scripts/check_assets.py
```

Der Asset-Check benötigt ffmpeg/ffprobe. Kamera und Autoplay auf einem echten Handy über HTTPS prüfen (iOS Safari/Android Chrome). Kamerazugriff auf einer unverschlüsselten LAN-IP funktioniert normalerweise nicht.

## Beispielsounds und Lizenzen

Vier Demos à acht Sekunden: Weltraum-Signal, Spannung, Abenteuer-Fanfare, mysteriöse Glocken. Eigenständig synthetisiert; unter CC0-1.0 bereitgestellt. Reproduzierbar mit `python3 scripts/generate_demo_audio.py` (Python 3 und ffmpeg).

Eigene Film- und Audioinhalte nur mit den nötigen Veröffentlichungsrechten hochladen.

Lokal eingebundene Bibliotheken: html5-qrcode 2.3.8 (Apache-2.0, Lizenz unter `vendor/`); qrcode-generator 1.4.4 (MIT, Lizenz im Dateikopf von `vendor/qrcode.js`).
