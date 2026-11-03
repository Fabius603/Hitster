# Filmrausch – Film-Soundquiz

Statische, mobilfreundliche Website für GitHub Pages. Ohne Backend, Benutzerkonto oder externe Laufzeitdienste. QR-Scanner und QR-Generator sind lokal unter `vendor/` eingebunden.

## Spielen

- Karte mit der Handykamera scannen: `https://DEINNAME.github.io/film-hitster/?id=001`.
- Bei blockierter automatischer Wiedergabe im Audioplayer auf Play tippen.
- „Karte scannen“ öffnet die Rückkamera (HTTPS und Kameraerlaubnis erforderlich).
- Weitere Codes werden auf derselben Seite verarbeitet: alter Sound stoppt, neuer Sound startet. Es öffnen sich keine weiteren Tabs.
- Alternativ unter „Ohne Kamera spielen“ eine Kartennummer eingeben oder eine Demo wählen.
- `cards.html` erzeugt alle QR-Karten aus `sounds.json`. Über den Browser drucken oder als PDF speichern. Erst auf der endgültigen Website-Adresse drucken!

## Eigene Sounds hinzufügen

1. MP3 unter `audio/005.mp3` ablegen.
2. Eintrag in `sounds.json` ergänzen:
   ```json
   {"id":"005","file":"audio/005.mp3","description":"Interne Beschreibung"}
   ```
3. Auf `main` committen. Der Workflow veröffentlicht die Änderung automatisch.
4. Die neue Karte auf `cards.html` drucken.

IDs müssen eindeutig sein; bestehende IDs und Domain nach dem Druck beibehalten. Beschreibung wird im Spieler nicht angezeigt. Die Daten sind öffentlich und kein Spoilerschutz gegen das bewusste Nachschlagen im Quelltext. Nutze nur Audios, die du veröffentlichen darfst.

## Vier Beispielsounds

`001` Weltraum-Signal · `002` Spannung · `003` Abenteuer-Fanfare · `004` Mysteriöse Glocken.

Die Demos sind eigens synthetisierte Effekte, keine Ausschnitte oder Zitate aus Filmen. Sie dienen zum Funktionstest und enthalten keine Film-/Jahreslösungen. Mit `python3 scripts/generate_demo_audio.py` reproduzierbar (Python 3 und ffmpeg erforderlich). Die Demo-Audiodateien werden unter CC0-1.0 bereitgestellt.

## Hosting

Unter **Settings → Pages → Build and deployment → Source** „GitHub Actions“ wählen, falls noch nicht eingerichtet. Der Workflow `.github/workflows/pages.yml` veröffentlicht nur die benötigten Website-Dateien. GitHub Pages muss im Repository/Tarif verfügbar sein.

## Lokal starten

```sh
python3 -m http.server 8000
```

Dann `http://localhost:8000` öffnen. Nicht per `file://`, da die Kartenliste mit Fetch geladen wird. Kamera funktioniert auf localhost oder HTTPS, auf einer unverschlüsselten LAN-IP normalerweise nicht. Im Zweifel Kartennummer verwenden.

## Prüfung

```sh
node --check player.js
node --check cards.js
python3 scripts/check_assets.py
```

Kamera- und Autoplayverhalten sind browserabhängig. Auf iOS Safari und Android Chrome mit HTTPS testen: erste Karte öffnen, Sound starten, Kamera erlauben, nächste Karte scannen, Scanner schließen, ungültigen Code prüfen und Kartennummer eingeben. Bei verweigertem Autoplay bleibt der Audioplayer bedienbar.

## Abhängigkeiten

- html5-qrcode 2.3.8 – Apache-2.0; Lizenz unter `vendor/`.
- qrcode-generator 1.4.4 – MIT; Copyright und Lizenz im Dateikopf von `vendor/qrcode.js`.
