# Filmquiz: Aufnahmevorlagen

## Version 1 und Version 2

[Version 1](filme-version-1.html) enthält die 275 vorhandenen Karten aus der bisherigen 400er-Liste. Die Zeilen sind von 1 bis 275 nummeriert. [Version 2](filme-version-2.html) ist die Arbeitsliste für neue Filme und beginnt mit den 121 übrigen Filmen. Beide Listen gibt es auch als JSON und TXT. Die früheren Dateien `filme-gesamt.html`, `filme-200.html` und `filme-400.html` führen zu Version 1. `filme-offen.html` führt zu Version 2.

Neue Filme in `filme-version-2.json` mit einer neuen eindeutigen `id` ergänzen. Danach erzeugt `node filmquiz-vorbereitung/baue-filmliste.mjs` die HTML- und TXT-Ansicht für Version 2. Sobald die Karten fertig sind, kann Version 2 als Druckversion registriert werden. Das Vorgehen steht in der [Projekt-README](../README.md#neue-kartenversion-erstellen).

Der gemeinsame Abgleich in `kartenstatus.mjs` prüft Titelvarianten und Erscheinungsjahr gegen `variants/film/cards.json`. Groß-/Kleinschreibung, Umlaute, Bindestriche und explizite Titelzusätze werden berücksichtigt; andere Erscheinungsjahre und nur ähnlich beginnende Titel bleiben verschiedene Filme. Eine vorhandene Karte genügt unabhängig von Sprache, Szene und Zeitmarke: Der Lauf legt keinen zweiten Eintrag für denselben Film an.

Die Aufnahmeliste zeigt **Karte vorhanden**, **Noch keine Karte** oder **Keine Karte · kein Filmo-Link** und lässt sich danach filtern. Beim Aufnahmestart und nach jeder gespeicherten Karte wird der Scan neu erzeugt. Die geöffnete HTML-Datei lädt den erzeugten Status alle 15 Sekunden nach, auch beim Öffnen als lokale Datei. `kartenstatus-offen.json` enthält den Scanbericht. `kartenstatus-offen.js` liefert ihn an die Aufnahmeliste. Neuaufbau: `node filmquiz-vorbereitung/baue-filmliste.mjs`. Der bisherige Buildername bleibt als kompatibler Einstieg erhalten.

Weitere Aufnahmen starten oder fortsetzen:

```powershell
node filmquiz-vorbereitung/karten-aus-tabelle.mjs --parallel 4 --timeout 90
```

Ohne Dateiangabe verwendet das Skript `filme-version-2.html`. Alte Pfade zur Gesamt-, 200er- und 400er-HTML-Datei verweisen auf Version 1. Doppelklick auf `Filmkarten-aufnehmen.cmd` verwendet sie ebenfalls. `--trocken` zeigt nur den Plan. Bereits vorhandene Karten und Einträge ohne Filmo-Link werden vor dem Aufnahmebeginn ausgefiltert und vor jeder einzelnen Aufnahme erneut geprüft. Ein Prozess-Lock verhindert zwei gleichzeitige Stapelläufe. `.local/filmaufnahme/kartenlauf-status.json` enthält Fortschritt und Ergebnisse. Die kleinste freie Karten-ID wird unabhängig von den Tabellenzeilen vergeben.

Nicht reagierende Player blockieren den Stapel nicht mehr: Browserbefehle haben standardmäßig 15 Sekunden Zeit, der Verbindungsaufbau 10 Sekunden. Seek- und Aufnahmebefehle erhalten eigene begrenzte Laufzeiten. Verbindungsabbrüche und geschlossene Frames brechen wartende Befehle sofort ab. Während des Mitschnitts wird ein für 12 Sekunden stillstehendes Video als Fehler behandelt. Zusätzlich begrenzt der Stapel jeden Kindprozess auf `--timeout + 3 × Aufnahmelänge + 60` Sekunden sowie mindestens 60 Sekunden ohne Rückmeldung. Beim Überschreiten beendet er den Aufnahmeprozess, schließt ausschließlich dessen bekannten Player-Tab und arbeitet weiter. Der Fehler wird protokolliert und am Stapelende höchstens einmal erneut versucht.

Aufgenommen wird vorerst die deutsche Spur. Millisekunden und geplante Dauer der Schnittfenster bleiben erhalten; der Standard-Nachlauf beträgt jetzt **0 Sekunden**, um keine nachfolgenden Namen aufzunehmen. `--zuschlag` lässt sich bei Bedarf explizit setzen. Neue Karten erhalten `verification.status: "pending"` und `audioVerified: false`: Speicherung ist noch keine Hörfreigabe. Szene, Sprache und Schnitt müssen geprüft werden.

## Recherchequellen für die 400 Szenen

Die Recherche umfasst die bisherigen 200 zusätzlichen Szenen und **200 neue Einträge mit den Nummern 201–400**. Jeder neue Eintrag hat einen direkten Filmo-Link mit abgeglichenem Titel und Erscheinungsjahr. Die neuen Filme überschneiden sich weder mit der ursprünglichen 150er-Auswahl noch mit der bisherigen 200er-Auswahl. 170 der neu hinzugefügten Filme erschienen ab 1990. Die bisherigen 200 Datensätze bleiben erhalten; ihre fehlenden Filmo-Links bleiben leer.

Die Filmlisten bieten Titel-/Szenensuche und einen Jahrzehntfilter. Die gefilterte Auswahl lässt sich drucken. Die Schnittfenster sind anhand englischer Untertitel geprüft; der Kartenstatus zeigt den jeweiligen Aufnahmestand.

Die Ergänzung liegt in `recherche-200-weitere.json`, die daraus gebildeten Listen unter `filme-version-1.*` und `filme-version-2.*`. `recherche-200.json` und `filme-200.txt` enthalten weiterhin die bisherigen 200 Einträge. Der Listen-Generator aktualisiert die Ansichten von Version 2 und ihren Kartenstatus. Recherchepool und ausgewählte Beschreibungen: `weitere-200-kandidaten.txt`, `weitere-200-redaktion.txt`. Zur erneuten Recherche `recherchiere-weitere-200.mjs`, danach `finalisiere-weitere-200.mjs` ausführen; Zwischenergebnisse liegen unter `.local/`.

## Zusätzliche Liste mit 200 Szenen

Die ursprüngliche Ergänzung in `recherche-200.json` enthält **200 weitere Filme ohne Überschneidung mit der 150er-Liste**: 167 ab 1990 und 33 ältere Filme. Die Auswahl zielt auf mittlere Schwierigkeit durch Stimmen, Dialog und Situation. Sie ist eine der beiden Quellen für Version 1 und die Liste weiterer Aufnahmen. Die bestehende 150er-Liste und Karten wurden nicht verändert.

Jede Szene hat einen geprüften ClipCafe-Seitenlink, eine Quellenzeitmarke und ein Schnittfenster anhand englischer Untertitel. Die Fenster dauern 5,0–13,3 Sekunden, im Median etwa 10,8 Sekunden. Unter **Schnitt & Ausschlüsse** stehen der Versatz im Quellclip, kurze Anfangs-/Endhinweise und auszulassende Namen beziehungsweise verräterische Begriffe. Die ausgewählten englischen Untertitel enthalten die jeweiligen Ausschlüsse nicht. Das ist keine Hörprüfung: Tonspuren, deutsche Übersetzung, Fassungsunterschiede und saubere Satzgrenzen müssen vor der Aufnahme abgeglichen werden. Die ganze Quellseite kann Namen und bekannte Sprüche enthalten, die außerhalb des vorgesehenen Fensters liegen.

Die Spalte **Filmo-Link** enthält direkte Filmseiten, deren Titel und Erscheinungsjahr abgeglichen wurden. Ohne eindeutigen Treffer bleibt die `filmo`-Zelle leer; Suchlinks werden nicht angezeigt. Die Zuordnung bestätigt noch keine verfügbaren Tonspuren. Ergänzen fehlender Links: `node filmquiz-vorbereitung/ergaenze-filmo-links.mjs recherche-200.json`, danach die Tabelle neu erzeugen. Die Finalisierung erhält bereits zugeordnete Filmo-Links.

Daten: `recherche-200.json`; kompakte Textfassung: `filme-200.txt`. Neuaufbau der Tabelle: `node filmquiz-vorbereitung/baue-tabelle-200.mjs`. `filme-200-kandidaten.txt` enthält den größeren Recherchepool, `szenen-200-redaktion.txt` die 200 ausgewählten Beschreibungen. Recherche und Finalisierung: `recherchiere-200.mjs`, danach `finalisiere-200.mjs`; die Recherche legt ihre Zwischenergebnisse unter `.local/` ab. Stand: 12. November 2026.

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

Arbeitet die Einträge ab: Für jeden läuft `spule-zu.mjs` mit Filmo-Link, Zeitmarke und Aufnahme des Videotons. Mit `--parallel <n>` (1–6, Standard 1) laufen bis zu n Filme gleichzeitig in eigenen Browserfenstern; die Ausgaben sind mit der Filmnummer markiert. Bewährt sind 3–5. Fehlgeschlagene Aufnahmen bekommen am Ende einen zweiten Versuch mit höchstens 2 gleichzeitigen Läufen. Filme, deren Filmo-Seite keinen eingebetteten Player hat (z. B. nur Anbieter „Byse“ mit Link auf eine externe Seite), werden übersprungen. Lässt sich der Aufnahme-Browser nicht starten, bricht der Stapel ab; eine hängende Instanz des eigenen Aufnahmeprofils wird vorher automatisch beendet (das normale Brave-Profil bleibt unberührt). Die Videos laufen stumm, mit `--laut` hörbar. `--systemton` nutzt die alte Systemton-Aufnahme (nur ohne `--parallel`). Aus der MP3 und Titel, Jahr, Szene und Zeitmarke der Tabelle entsteht eine Karte mit deutscher Spur (`tracks.de`) in `variants/film/cards.json`, die Audiodatei liegt unter `variants/film/audio/<id>-de.mp3`. Die Aufnahmelänge ist die Spalte „Dauer der Szene“ plus `--zuschlag` (Standard 0 s), ohne Dauer 15 s; `--dauer` setzt sie fest. Übersprungen werden Filme, die schon eine Karte haben (Titel + Jahr), und Einträge ohne Filmo-Link. Fehlgeschlagene Einträge werden gemeldet, der Stapel läuft weiter. `--trocken` zeigt nur den Plan. Die Aufnahmen sind nicht geschnitten oder geprüft: anhören und auf Szene, Sprache, Satzenden und auszulassende Namen prüfen.
