# Schnellstart und Plan

$skill = Skillordner, $repo = Hitster-Projekt, $python = funktionierende Python-EXE.
Befehle im Projektordner ausführen. Bei Bedarf vorhandene lokale Python-Pakete nutzen:

```powershell
$env:PYTHONPATH = Join-Path $repo '.local/filmaufnahme/asr'
$env:HF_HOME = Join-Path $repo '.local/filmaufnahme/huggingface'
```

Hier liegen bereits faster-whisper, PyAV und der Modellcache des vorigen Laufs.
Für eine neue Umgebung einmalig faster-whisper 1.2.1, av<17 und NumPy einrichten.
PyAV 19 war mit dieser faster-whisper-Version inkompatibel. Kein erneuter
Modelldownload je Film; --download nur zur erstmaligen Einrichtung verwenden.

## Plan und direkte Verarbeitung

```powershell
node "$skill/scripts/filmplan.mjs" prepare --project "$repo"
node "$skill/scripts/filmplan.mjs" status --project "$repo" --plan "$repo/.local/filmaufnahme/erste-8.json"

& $python "$skill/scripts/prepare_batch.py" --plan "$repo/.local/filmaufnahme/erste-8.json" --entries 2,5,7,8
# Im Folgenden den vom Helfer ausgegebenen Pfad verwenden:
& $python "$skill/scripts/transcribe.py" --plan "$preparedPlan" --entries 2,5,7,8 --model-dir "$repo/.local/filmaufnahme/models" --report "$repo/.local/filmaufnahme/pruefung.json"
# Bericht lesen, Inhalt/Schnitt prüfen und nur geprüfte Spuren im Plan freigeben.
& "$skill/scripts/recorder.ps1" -Project "$repo" -Command import-batch --plan "$preparedPlan" --entries 2,5,7,8
```

Die Auswahl unterstützt 1-8, 1,3,6 und all. Immer den angeforderten Umfang
angeben. prepare überschreibt keinen bestehenden Eingangsplan.
prepare_batch verwendet Dateipfad, Größe, Änderungszeit, Schnitt und Sprachwahl
als Cache-Schlüssel; geänderte Quellen erzeugen neue Dateien und einen neuen
vorbereiteten Plan. Eingangspläne und bereits bearbeitete Pläne bleiben erhalten.
Für Wiederaufnahme direkt den bereits geprüften vorbereiteten Plan verwenden.

Pro Eintrag: sourceId, title, year, scene, timestamp, de, en, optional blocked,
notes, cutHints. Jede Spur hat file, start, length, verified, optional audioStream.
Dateipfade sind relativ zum jeweiligen Planordner; absolute Pfade sind erlaubt.
Der vorbereitete Plan verwendet absolute Pfade. start ist immer in Sekunden
relativ zum Beginn der gewählten Audiospur, nicht relativ zur Rohaufnahme,
wenn file bereits auf einen kompletten Film zeigt.

Beispiel für einen lokalen Film mit zwei Tonspuren:

```json
"de": {"file": "C:/Filme/Film.mkv", "start": 5335, "length": 10, "verified": false},
"en": {"file": "C:/Filme/Film.mkv", "start": 5335, "length": 10, "verified": false}
```

Die Sprachkennungen de/deu/ger und en/eng werden ausgewählt. Bei fehlenden oder
mehrdeutigen Kennungen audioStream setzen: nullbasierter Index **unter den
Audiospuren**, kein globaler Container-Streamindex. Bei einer einzelnen
unbeschrifteten Spur anschließend die tatsächliche Sprache prüfen.
Bei Startzeiten über 30 Sekunden wird direkt zur Szene gesprungen; der
komplette Film wird nicht erst decodiert. Fehlerhafte/fehlende Spuren bleiben
ungeprüft. Der Import akzeptiert ausschließlich vollständige freigegebene Paare.

## Langlebiger Recorder

```powershell
# Nur bei fehlender/geänderter CLI:
& "$skill/scripts/recorder.ps1" -Project "$repo" -Command build
# Einmal für den ganzen Stapel, in einer laufenden interaktiven Shell-Session:
& "$skill/scripts/recorder.ps1" -Project "$repo" -Command session
```

Der Prozess antwortet mit einer JSON-Zeile status=ready. Über write_stdin an
dieselbe Shell-Session senden, mit kurzem yield_time_ms, z. B. 250:

```jsonl
{"command":"devices","requestId":"devices"}
{"command":"start","out":".local/filmaufnahme/raw/010-de.wav","seconds":18,"requestId":"010-de"}
```

Erst nach status=recording die vorbereitete Szene im Browser starten.
18 Sekunden sind ein Beispiel für einen ca. 14 Sekunden langen Dialog;
Dauer entsprechend anpassen. out ist relativ zum per -Project gewählten
Repository. Optional device mit einer ID aus devices angeben. Kein Mikrofon:
aufgenommen wird der gesamte Ton dieses Windows-Ausgangs.

Nach Ende des Dialogs im Browser pausieren und dieselbe Session stoppen:

```jsonl
{"command":"stop","requestId":"010-de-stop"}
```

status=recorded enthält Datei, Dauer und Pegel. Der Timer stoppt spätestens
nach seconds automatisch. Dieselbe Session für Englisch und weitere Filme
verwenden. Dateien werden nicht überschrieben; neue Versuche neu benennen.
Ein alter Timer kann eine neue Aufnahme nicht beenden. Zum Abschluss:

```jsonl
{"command":"quit"}
```

Der alte Einmalbefehl record --out … --seconds … bleibt als Fallback erhalten.
Kein Start-Process ohne wartenden Elternprozess im Sandbox-Betrieb verwenden.

## Prüfung und Wartung

transcribe lädt das Modell nur für noch ungeprüfte/veränderte Dateien,
verwendet beam=1 und schreibt segmentweise Texte in den gemeinsamen Bericht.
Wortzeiten sind optional (--words). Die Cache-Prüfung berücksichtigt
Änderungszeit, Größe und Erkennungsoptionen. stdout enthält nur die Zusammenfassung;
Sprachabweichungen/unsichere oder fehlende Spuren liefern einen Fehlerstatus.
Ein hoher Sprachwert beweist nicht, dass Dialog oder Schnitt richtig sind.
Das Skript setzt niemals verified=true.

Für eine gezielte Vorschau bei Zweifeln:
```powershell
& "$skill/scripts/recorder.ps1" -Project "$repo" -Command cut --file "C:/Pfad/roh.wav" --start 12.4 --length 10 --out "C:/Pfad/vorschau.mp3"
```

Nach Änderungen an Hilfsprogrammen einmal bauen und prüfen:
```powershell
node --test "$skill/scripts/filmplan.test.mjs"
& $python "$skill/scripts/workflow_test.py"
```

Diese Tests erzeugen synthetische Medien in isolierten lokalen Testprojekten.
Sie nehmen keinen Systemton auf und verändern keine vorhandenen Spielkarten.
