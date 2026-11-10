---
name: hitster-filmkarten
description: Erstellt zweisprachige Hitster-Filmkarten aus filme-150.html mit direktem Medienzuschnitt, gebündelter Sprachprüfung und bei Bedarf Windows-Loopback-Aufnahme.
---

# Hitster-Filmkarten – schneller Stapelablauf

Eingang: aktuelle `filmquiz-vorbereitung/filme-150.html`.
Ergebnis: zwei MP3s pro Film in `variants/film/audio/`, vollständige Karten in
`variants/film/cards.json` und die bestehende Duplex-Druckansicht.
Zeilennummern sind keine Karten-IDs. Keine Veröffentlichung oder Uploads ableiten.

`$skill` ist dieser Skillordner, `$repo` das Hitster-Repository.
Node.js/.NET 8+ sind für den Recorder vorhanden; der direkte Zuschnitt verwendet
Python mit PyAV/NumPy, die Sprachprüfung faster-whisper mit lokalem Basismodell.
Vorhandene Programme, Audios, Modellcache und Aufnahmen wiederverwenden.
Befehle, Session-Protokoll und Planfelder: [references/aufnahme.md](references/aufnahme.md).

## Quellen und Umfang einmal klären

- Plan/HTML einmal einlesen, gewünschte Einträge auswählen, vorhandene passende
  Karten überspringen. Bei geänderter Vorlage einen neuen Plan verwenden;
  bestehende Zuschnitte/Freigaben nicht überschreiben. `cutHints` beachten.
- Schnellster Weg: vorhandene lokale Filme/Clips direkt zuschneiden.
  Bei mehrsprachigen Dateien die passende Audiospur über Sprachkennung oder
  expliziten Audio-Index auswählen. Ein Dateiname beweist keine Sprache.
- Sonst zuerst den verlinkten kurzen Quellclip prüfen: sind beide echten
  Tonspuren verfügbar, diesen verwenden, statt zusätzlich den ganzen Film zu
  öffnen und zu durchsuchen. Untertitel sind keine Audiospuren.
- Regulärer direkter Download ist möglich, wenn die Quelle ihn erlaubt.
  Ein gezielter Versuch genügt; bei Fehler/Timeout zur Aufnahme wechseln.
  Keine Folgeexperimente mit Downloadformaten, keine geratenen Medien-URLs,
  keine Schutz- oder Browserrichtlinien umgehen. Einmal blockierte Quelle
  für diesen Lauf auslassen und andere Einträge fortsetzen.
- Für fehlende Sprachen Filmo-Link nutzen, Titel/Jahr/Fassung prüfen.
  Suchlinks sind keine bestätigten Treffer; keine Neuverfilmung verwechseln.

## Aufnahme nur bei Bedarf

Recorder einmal bauen, falls die CLI fehlt oder sich der Code geändert hat.
Eine langlebige `session` für den ganzen Stapel starten. Start/Stop über deren
Standardeingabe senden; **keinen neuen Shellprozess pro Tonspur starten**.
Das vermeidet den im bisherigen Ablauf beobachteten Shell-Vorlauf von zehn
Sekunden je Aufnahme. Aufnahme-Start bestätigen lassen, dann im Browser Play.

Eigene andere Player pausieren. Rohaufnahme nur um etwa 2–4 Sekunden länger
als den benötigten Dialog wählen; nach dem Dialog stoppen, statt pauschal
35–50 Sekunden pro Spur zu sammeln. Der automatische Timer bleibt als Grenze.
Keine losgelösten Hintergrundprozesse verwenden: sie wurden in dieser
Umgebung beim Ende des aufrufenden Shellprozesses beendet.

Browseraktionen bündeln: Quelle laden und Zustand prüfen; Sprache/Zeit
einstellen und prüfen; nach bestätigtem Recorderstart Play; nach dem Dialog
pausieren und Recorder stoppen. Zwischen eindeutigen Ergebnissen keine
zusätzlichen Screenshots, Vollseitenbäume oder erneuten Kontrollen erzeugen.
Nur tatsächliche UI-Bedienelemente mit den verfügbaren Browserwerkzeugen steuern.

Auf Filmo lädt der äußere Play-Button den eingebetteten Player; dessen Startknopf
ebenfalls betätigen. Bei den geprüften VOE-Playern verschwand dabei die
anfängliche Fehlermeldung. Bei ClipCafe kann der Clip automatisch starten und
wiederholen. Bei dessen geprüftem Zeitregler erwartet die native Werteingabe
Prozent, obwohl der Accessibility-Baum Sekunden anzeigt; Skala einmal prüfen.
Zeitmarken sind Suchmarken: Fassung und tatsächliche Szene abgleichen.

## Gemeinsam verarbeiten, prüfen, importieren

1. Schnittfelder im Plan setzen: `start` ist der Versatz in der Datei,
   `timestamp` die Filmzeit. Beide Sprachen dürfen verschieden lang sein.
2. `prepare_batch.py` einmal für die Auswahl ausführen. Er extrahiert nur
   benötigte Abschnitte, gleicht Pegel an, verwendet Zwischenergebnisse erneut
   und erstellt einen separaten Plan mit `verified: false`.
3. `transcribe.py --plan … --entries …` einmal für den vorbereiteten Plan
   ausführen. Das Modell lädt höchstens einmal; unveränderte Dateien kommen
   aus dem Cache. Standard: schnelle Erkennung, keine Wortzeit-Berechnung,
   keine erzwungene Sprache und keine vollständigen Transkripte im Chat.
4. Den gemeinsamen Bericht lesen: tatsächliche Sprache, Szenenübereinstimmung,
   keine ausgeschlossenen Namen, vollständige Satz-/Wortenden und Fremdton
   prüfen. Bei klarer Übereinstimmung reicht die kombinierte Inhalts- und
   Signalprüfung; nicht jeden Clip mehrfach transkribieren oder vorführen.
   ASR kann auf Musik/Stille halluzinieren. Bei Zweifeln nur die betroffene Spur
   mit `--words --beam 5` oder einer Hörprobe genauer prüfen. Nur nach
   tatsächlicher Prüfung freigeben; keine erfundene Hörprüfung behaupten.
5. Geprüfte Spuren im vorbereiteten Plan auf `verified: true` setzen.
   `import-batch` einmal ausführen: nur freigegebene Paare werden übernommen,
   vorhandene Karten erkannt, Fehler je Eintrag gemeldet.
6. Ein gemeinsamer abschließender Medien-/Kartencheck und eine Druckansicht
   genügen. Bei reiner Kartenerstellung keine Skill-Weiterentwicklung,
   wiederholten Builds, Testläufe, Modellinstallationen oder Audio-Vorschauen
   für jede Karte einschieben. Probleme knapp dokumentieren.

Berichte neue IDs, offene Einträge und Drucklink. QR-Codes auf die gewünschte
Spieladresse richten; lokale Audios sind dort erst nach Veröffentlichung erreichbar.
