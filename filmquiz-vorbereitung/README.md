# Filmquiz: Aufnahmevorlagen

## Tabelle mit 150 Filmen

`filme-150.html` direkt im Browser öffnen. Die Auswahl enthält 150 bekannte Filme von 1975 bis 2024: 138 Filme ab 1990 und zwölf ältere Klassiker. Die aktuelle Fassung zielt auf **mittlere Schwierigkeit**: wiedererkennbare Situationen und Dialoge ohne Figuren-Vorstellungen, Filmtitel-Nennungen oder möglichst offensichtliche Standardsprüche. Die ClipCafe-Links öffnen die ungeschnittenen Quellen, nicht fertige Spielausschnitte.

Die Datei ist eine schlichte Tabelle mit den Spalten Titel, Erscheinungsjahr, Szene, Zeitpunkt im Film, Dauer der Szene, Clip-Link und Filmo-Link. Die Dauer stammt aus dem Schnittfenster nach Untertiteln (nicht abgehört) und fehlt, wo keines ermittelt wurde. Schnitthinweise und zu vermeidende Namen stehen weiterhin in `recherche-150.json`.

Die HTML-Datei benötigt keinen lokalen Server und keine Internetverbindung, bis ein Quellenlink geöffnet wird. Sie lässt sich nach Datenänderungen mit `node filmquiz-vorbereitung/baue-tabelle.mjs` neu erzeugen.

Suche, Jahrzehntfilter, Kopieren der App-Felder und Druckansicht sind enthalten. Zeitangaben lassen sich bearbeiten und werden nach Möglichkeit im Browser gespeichert. Die angegebenen Zeiten stammen aus ClipCafe; sie wurden nicht gegen die tatsächlichen Filmfassungen geprüft. Vor der Aufnahme Szene, Schnittpunkt und Tonspur abgleichen.

Die zusätzliche Spalte **Filmo** verlinkt die Filmseiten auf `http://45.10.243.23/`. Direkte Treffer wurden anhand des Filmtitels und des Erscheinungsjahres abgeglichen. Wo kein eindeutiger Treffer gefunden wurde, steht ausdrücklich **Auf Filmo suchen** mit einem Link zur Suche nach diesem Film. ClipCafe-Links bleiben zusätzlich erhalten.

## Frühere zehn Kartenentwürfe

Gewünschte Tonspuren: **Deutsch und Englisch**.

`karten.html` direkt im Browser öffnen. Die Datei enthält zehn druckbare Kartenentwürfe mit Auflösung und Quellenlink. Die QR-Codes von F01–F09 öffnen die ClipCafe-Quellseite, noch keinen Hitster-Audioplayer. F10 hat noch keinen Clip. Die Karten sind bewusst als Entwurf gekennzeichnet und nicht in die spielbaren Varianten aufgenommen.

## Was noch fehlt

- Noch keine MP3-Dateien heruntergeladen oder erzeugt: Der reguläre ClipCafe-Download zeigt „Anmeldung erforderlich“.
- Bei der geprüften Kevin-Szene bezeichnet die Sprachliste Transkripte, keine nachgewiesenen deutschen Tonspuren.
- Filmzeitpunkte sind Suchmarken aus den Quellen, nicht gegen lokale Filmfassungen geprüft. Bei den Gefährten unterscheiden sich die Quellen nach Fassung deutlich.
- Schnittlängen sind Vorschläge, noch nicht abgehört. `clipOffsetSeconds` bezeichnet den vorgeschlagenen Start innerhalb des verlinkten Clips; `timestamp` den Beginn des Quellclips im Film.
- Inception eignet sich an dieser Stelle eher für ein Bilderquiz. Vor einer Audiofassung eine andere Szene wählen.

Nach Bezug der tatsächlichen Audios können sie mit freien IDs ab 006 in `variants/film/audio/` abgelegt und mit `tracks.de`, `tracks.en` und `answer` in die vorhandene Kartenliste übernommen werden. Die ID muss beim Import erneut auf Verfügbarkeit geprüft werden. Vorhandene Karten und Aufnahmen wurden nicht verändert.

## Video an eine Zeitmarke spulen

`node filmquiz-vorbereitung/spule-zu.mjs <URL> <h:mm:ss>` öffnet die Seite in Brave (falls nicht installiert: Chrome oder Edge), startet das größte Video der Seite, spult zur Zeitmarke und pausiert dort. Das Skript braucht keine npm-Pakete und steuert den Browser über das DevTools-Protokoll. Es findet Videos auch in iframes und Shadow-DOM-Playern. Startet ein Player erst nach einem Klick, löst das Skript einen echten Mausklick auf Play-Knopf oder Video aus. Der Browser bleibt danach offen und nutzt ein eigenes Profil unter `%LOCALAPPDATA%\hitster-spule-zu-brave`, getrennt vom normalen Brave-Profil. Läuft er schon, öffnet ein weiterer Aufruf darin einen neuen Tab. Optionen: `--browser <Pfad>`, `--timeout <Sekunden>` (Standard 120).

Mit einer Dauer als drittem Argument (`<Sekunden>` oder `m:ss`) spielt das Skript ab der Zeitmarke genau so lange ab und pausiert danach: `node filmquiz-vorbereitung/spule-zu.mjs <URL> 2:16:03 20`. Gemessen wird an der Videozeit, Pufferpausen verkürzen den Ausschnitt also nicht. Zusammen mit `--aufnahme <datei.mp3>` ist die Dauer zugleich die Aufnahmelänge (wie `--dauer`).

Getestet mit dem gemeinfreien Film *Intolerance* (1916) auf Wikimedia Commons:

    node filmquiz-vorbereitung/spule-zu.mjs "https://commons.wikimedia.org/wiki/File:Intolerance_(1916)_by_D._W._Griffith.webm" 2:16:03

Mit `--aufnahme <datei.mp3> --dauer <Sekunden>` spielt das Skript nach dem Spulen ab der Zeitmarke ab, schneidet den Ton des Videos direkt im Browser mit (`captureStream()` + Web Audio), pausiert und speichert die MP3 (Umwandlung über die Recorder-CLI aus `skills/hitster-filmkarten`). Andere Geräusche am PC landen nicht in der Aufnahme. `--stumm` spielt das Video dabei lautlos ab, der Mitschnitt bleibt vollständig. `--quelle system` nimmt stattdessen wie früher den Windows-Systemton auf (Loopback); dann darf kein anderer Ton laufen. `--tab-schliessen` schließt den Tab danach. Die Recorder-CLI muss einmal gebaut sein (`skills/hitster-filmkarten/scripts/recorder.ps1 -Project . -Command build`). Bei kopiergeschützten Playern (DRM) kann der Videoton-Mitschnitt stumm bleiben; das Skript bricht dann mit einer Meldung ab.

## Karten aus der Tabelle erzeugen (vorerst nur Deutsch)

    node filmquiz-vorbereitung/karten-aus-tabelle.mjs [filme-150.html] [--eintraege 1-5,8|all] [--parallel 3] [--trocken]

Oder per Doppelklick bzw. Drag & Drop der HTML-Datei auf `Filmkarten-aufnehmen.cmd` im Hauptordner.

Arbeitet die Einträge ab: Für jeden läuft `spule-zu.mjs` mit Filmo-Link, Zeitmarke und Aufnahme des Videotons. Mit `--parallel <n>` (1–6, Standard 1) laufen bis zu n Filme gleichzeitig in eigenen Browserfenstern; die Ausgaben sind mit der Filmnummer markiert. Bewährt sind 3–5. Fehlgeschlagene Aufnahmen bekommen am Ende einen zweiten Versuch mit höchstens 2 gleichzeitigen Läufen. Filme, deren Filmo-Seite keinen eingebetteten Player hat (z. B. nur Anbieter „Byse“ mit Link auf eine externe Seite), werden übersprungen. Lässt sich der Aufnahme-Browser nicht starten, bricht der Stapel ab; eine hängende Instanz des eigenen Aufnahmeprofils wird vorher automatisch beendet (das normale Brave-Profil bleibt unberührt). Die Videos laufen stumm, mit `--laut` hörbar. `--systemton` nutzt die alte Systemton-Aufnahme (nur ohne `--parallel`). Aus der MP3 und Titel, Jahr, Szene und Zeitmarke der Tabelle entsteht eine Karte mit deutscher Spur (`tracks.de`) in `variants/film/cards.json`, die Audiodatei liegt unter `variants/film/audio/<id>-de.mp3`. Die Aufnahmelänge ist die Spalte „Dauer der Szene“ plus `--zuschlag` (Standard 1,5 s), ohne Dauer 15 s; `--dauer` setzt sie fest. Übersprungen werden Filme, die schon eine Karte haben (Titel + Jahr), und Einträge ohne Filmo-Link. Fehlgeschlagene Einträge werden gemeldet, der Stapel läuft weiter. `--trocken` zeigt nur den Plan. Die Aufnahmen sind nicht geschnitten oder geprüft: anhören und auf Szene, Sprache, Satzenden und auszulassende Namen prüfen.
