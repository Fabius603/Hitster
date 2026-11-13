#!/usr/bin/env node
// Erstellt Hitster-Filmkarten (vorerst nur Deutsch) aus einer Aufnahmevorlage wie filme-150.html.
// Für jeden Eintrag wird spule-zu.mjs mit dem Filmo-Link und der Zeitmarke ausgeführt; es spielt die Szene ab,
// schneidet den Ton des Videos mit und liefert eine MP3. Sobald ein Lauf fertig ist, entsteht aus MP3 und
// Tabellenangaben (Titel, Jahr, Szene, Zeitmarke) die Karte in variants/film/cards.json, dann folgt der nächste Eintrag.
//
//   node filmquiz-vorbereitung/karten-aus-tabelle.mjs [filme-150.html] [--eintraege 1-5,8|all] [--parallel <n>]
//        [--dauer <Sekunden>] [--zuschlag <Sekunden>] [--laut] [--systemton] [--timeout <Sekunden>] [--browser <Pfad>] [--trocken]
//
// --parallel: so viele Filme gleichzeitig aufnehmen (Standard 1, höchstens 6), jeder in einem eigenen Tab.
// --dauer:    feste Aufnahmelänge; sonst Spalte „Dauer der Szene“ aus der Tabelle + --zuschlag (Standard 0 s),
//             ohne Dauer 15 s.
// --laut:     Videos hörbar abspielen (Standard: stumm; der Mitschnitt ist davon unabhängig).
// --systemton: alte Aufnahme über den Windows-Systemton (nur ohne --parallel).
// --trocken:  nur anzeigen, was aufgenommen würde.
// Vorhandene Karten (abgeglichener Titel und Jahr, unabhängig von Sprache und Szene) werden übersprungen,
// ebenso Einträge ohne Filmo-Link.

import { spawnSync } from 'node:child_process';
import { randomInt } from 'node:crypto';
import { existsSync, mkdirSync, openSync, closeSync, readdirSync, readFileSync, renameSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFilms } from '../skills/hitster-filmkarten/scripts/filmplan.mjs';
import { findCard, scanCards } from './kartenstatus.mjs';
import { runRecordingProcess } from './aufnahme-prozess.mjs';
export { findCard } from './kartenstatus.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const CARDS = join(REPO, 'variants', 'film', 'cards.json');
const AUDIO = join(REPO, 'variants', 'film', 'audio');
const SPULE_ZU = join(HERE, 'spule-zu.mjs');

function usage(message) {
  if (message) console.error(`Fehler: ${message}\n`);
  console.error('Aufruf: node filmquiz-vorbereitung/karten-aus-tabelle.mjs [datei.html] [--eintraege 1-5,8|all] [--parallel <n>] [--dauer <s>] [--zuschlag <s>] [--laut] [--systemton] [--timeout <s>] [--browser <Pfad>] [--trocken]');
  process.exit(2);
}

export function parseSelection(text) {
  if (text === 'all') return null;
  const wanted = new Set();
  for (const part of text.split(',')) {
    const m = part.trim().match(/^(\d+)(?:-(\d+))?$/);
    if (!m) throw new Error(`Ungültige Auswahl: ${part}`);
    const [first, last] = [Number(m[1]), Number(m[2] ?? m[1])];
    if (first < 1 || last < first) throw new Error(`Ungültiger Bereich: ${part}`);
    for (let i = first; i <= last; i++) wanted.add(i);
  }
  return wanted;
}

// "Vorschlag im Quellclip (EN): 00:24,6–00:36,0 · 11,5 s" → 11.5
export function suggestedLength(cutHints) {
  const m = cutHints.match(/·\s*(\d+(?:,\d+)?)\s*s\b/);
  return m ? Number(m[1].replace(',', '.')) : null;
}

// Gleiche Vergabe wie im Desktop-Recorder: kleinste freie Nummer ohne Karte und ohne Audiodatei.
export function nextId(cards, audioFiles) {
  const ids = new Set(cards.map((c) => c.id));
  for (let n = 1; ; n++) {
    const id = String(n).padStart(3, '0');
    if (!ids.has(id) && !audioFiles.some((f) => f.startsWith(id))) return id;
  }
}

export function germanCard(id, film) {
  const file = `audio/${id}-de.mp3`;
  return {
    id, type: 'audio', file, tracks: { de: file }, description: film.scene,
    answer: { title: film.title, year: film.year, scene: film.scene, timestamp: film.timestamp },
    verification: { status: 'pending', audioVerified: false },
  };
}

const readCards = () => (existsSync(CARDS) ? JSON.parse(readFileSync(CARDS, 'utf8')) : []);

function saveCard(card) {
  const cards = readCards();
  const existing = findCard(cards, card.answer);
  if (existing) return existing;
  if (cards.some((c) => c.id === card.id)) throw new Error(`Karten-ID ${card.id} wurde zwischenzeitlich vergeben.`);
  do {
    card.key = Array.from({length: 12}, () => String.fromCharCode(97 + randomInt(26))).join('');
  } while (cards.some(c => c.key === card.key));
  cards.push(card);
  const tmp = `${CARDS}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(cards, null, 2) + '\n');
  renameSync(tmp, CARDS);
  return card;
}

function refreshList() {
  const result = spawnSync(process.execPath, [join(HERE,'baue-filmliste.mjs')], {encoding:'utf8',windowsHide:true});
  if (result.status !== 0) console.error('Listenstatus konnte nicht aktualisiert werden:', result.stderr || result.error?.message);
  return result.status === 0;
}

function acquireLock() {
  const file=join(REPO,'.local','filmaufnahme','kartenlauf.lock');
  mkdirSync(dirname(file),{recursive:true});
  if (existsSync(file)) {
    const lock=JSON.parse(readFileSync(file,'utf8'));
    let running=true;
    try {process.kill(lock.pid,0);} catch(error) {if(error.code==='ESRCH')running=false;else throw error;}
    if (running) throw new Error(`Es läuft bereits ein Kartenlauf (PID ${lock.pid}).`);
    unlinkSync(file);
  }
  const fd=openSync(file,'wx');writeFileSync(fd,JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}));closeSync(fd);
  const release=()=>{try{const lock=JSON.parse(readFileSync(file,'utf8'));if(lock.pid===process.pid)unlinkSync(file);}catch{}};
  process.once('exit',release);
  return release;
}

function run(args, prefix, length) {
  const timeoutIndex=args.indexOf('--timeout');
  const loadSeconds=timeoutIndex>=0?Number(args[timeoutIndex+1]):120;
  return runRecordingProcess(process.execPath,[SPULE_ZU,...args],{
    prefix,
    totalTimeoutMs:(loadSeconds+length*3+60)*1000,
    idleTimeoutMs:Math.max(60000,(length*3+45)*1000),
  });
}

async function main() {
  const args = process.argv.slice(2);
  let html = join(HERE, 'filme-version-2.html');
  let selection = null;
  let fixedLength = null;
  let extra = 0;
  let dryRun = false;
  let parallel = 1;
  let loud = false;
  let systemSound = false;
  const passThrough = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--eintraege') selection = parseSelection(args[++i] ?? '');
    else if (a === '--dauer') fixedLength = Number(args[++i]);
    else if (a === '--zuschlag') extra = Number(args[++i]);
    else if (a === '--timeout' || a === '--browser') passThrough.push(a, args[++i]);
    else if (a === '--trocken') dryRun = true;
    else if (a === '--parallel') parallel = Number(args[++i]);
    else if (a === '--laut') loud = true;
    else if (a === '--systemton') systemSound = true;
    else if (a === '-h' || a === '--help') usage();
    else if (!a.startsWith('--')) html = resolve(a.trim().replace(/^"|"$/g, ''));
    else usage(`Unbekannte Option ${a}`);
  }
  if (html===join(HERE,'filme-offen.html')) html=join(HERE,'filme-version-2.html');
  if (fixedLength !== null && !(fixedLength > 1 && fixedLength <= 300)) usage('--dauer muss zwischen 1 und 300 liegen.');
  if (!(extra >= 0 && extra <= 30)) usage('--zuschlag muss zwischen 0 und 30 liegen.');
  if (!(Number.isInteger(parallel) && parallel >= 1 && parallel <= 6)) usage('--parallel muss zwischen 1 und 6 liegen.');
  if (systemSound && parallel > 1) usage('--systemton nimmt alles auf, was der PC abspielt, und geht nur ohne --parallel.');
  if (systemSound && loud) usage('--laut ist bei --systemton ohnehin nötig und wird nicht zusätzlich angegeben.');
  const source = systemSound ? ['--quelle', 'system'] : ['--quelle', 'video', ...(loud ? [] : ['--stumm'])];

  if (['filme-200.html','filme-400.html','filme-gesamt.html'].some(name=>resolve(html)===join(HERE,name))) html=join(HERE,'filme-version-1.html');
  const release = dryRun ? () => {} : acquireLock();
  if (!refreshList() && html===join(HERE,'filme-version-2.html')) return process.exitCode=1;
  if (!existsSync(html)) usage(`${html} nicht gefunden.`);
  const films = parseFilms(readFileSync(html, 'utf8')).filter((f) => !selection || selection.has(f.sourceId));
  if (!films.length) usage('Keine passenden Einträge in der Auswahl.');
  console.log(`${films.length} Einträge aus ${html}${dryRun ? ' (Probelauf)' : ''}\n`);

  const scan=scanCards(films,readCards());
  const results = scan.filter(r=>r.status!=='offen').map(r=>({film:r.film,status:r.status,id:r.card?.id}));
  console.log(`Auto-Scan: ${results.filter(r=>r.status==='vorhanden').length} mit Karte übersprungen; ${results.filter(r=>r.status==='kein Filmlink').length} ohne Filmo-Link; ${scan.filter(r=>r.status==='offen').length} aufzunehmen.\n`);
  const startedAt=new Date().toISOString();
  const reportFile=join(REPO,'.local','filmaufnahme','kartenlauf-status.json');
  const report=()=>{if(dryRun)return;writeFileSync(reportFile,JSON.stringify({pid:process.pid,source:html,startedAt,updatedAt:new Date().toISOString(),total:films.length,finished:results.length,remaining:films.length-results.length,results:results.map(r=>({sourceId:r.film.sourceId,title:r.film.title,year:r.film.year,status:r.status,cardId:r.id,error:r.error}))},null,2));};
  report();
  const reserved = new Set(); // IDs laufender Aufnahmen
  let queue = scan.filter(r=>r.status==='offen').map(r=>r.film);
  let next = 0;
  let aborted = null;
  async function worker() {
    while (next < queue.length && !aborted) {
      const index = next++;
      const film = queue[index];
      const label = `[${index + 1}/${queue.length}] #${String(film.sourceId).padStart(3, '0')} ${film.title} (${film.year})`;
      const existing = findCard(readCards(), film);
      if (existing) { console.log(`${label}: Karte ${existing.id} vorhanden – übersprungen.`); results.push({ film, status: 'vorhanden', id: existing.id }); continue; }
      if (!film.filmo || /\/search\b/i.test(film.filmo)) { console.log(`${label}: kein Filmo-Link – übersprungen.`); results.push({ film, status: 'kein Filmlink' }); continue; }

      const suggested = film.duration ?? suggestedLength(film.cutHints);
      const length = fixedLength ?? (suggested ? Math.min(60, suggested + extra) : 15);
      const id = nextId([...readCards(), ...[...reserved].map((r) => ({ id: r }))], existsSync(AUDIO) ? readdirSync(AUDIO) : []);
      const mp3 = join(AUDIO, `${id}-de.mp3`);
      console.log(`${label}: ${film.timestamp}, ${length.toFixed(1)} s → Karte ${id}\n  ${film.filmo}`);
      reserved.add(id);
      if (dryRun) { results.push({ film, status: 'geplant', id }); continue; }

      const prefix = `  [#${String(film.sourceId).padStart(3, '0')}]`;
      const code = await run([film.filmo, film.recordingTimestamp||film.timestamp, '--aufnahme', mp3, '--dauer', length.toFixed(3), '--tab-schliessen', ...source, ...passThrough], prefix, length);
      if (code === 3 && !aborted) aborted = film;
      try {
        if (code === 4) {
          console.log(`${label}: kein eingebetteter Player auf Filmo – übersprungen.\n`);
          results.push({ film, status: 'kein Player' });
        } else if (code === 0 && existsSync(mp3)) {
          try {
            const saved=saveCard(germanCard(id, film));
            const created=saved.id===id;
            console.log(`${label}: ${created?'✓ Karte '+id+' angelegt':'Karte '+saved.id+' bereits vorhanden'}.\n`);
            results.push({ film, status: created?'angelegt':'vorhanden', id:saved.id });
            refreshList();
          } catch (e) {
            console.error(`${label}: ✗ Karte nicht gespeichert: ${e.message} (MP3 bleibt: ${mp3})\n`);
            results.push({ film, status: 'fehler', error: e.message });
          }
        } else {
          const error=code===124?'Zeitlimit überschritten: Player oder Aufnahme reagiert nicht':code===0?'Aufnahmeprozess beendet, aber keine MP3 erzeugt':`spule-zu Exit ${code}`;
          console.error(`${label}: ✗ ${error} – weiter mit dem nächsten Eintrag.\n`);
          results.push({ film, status: 'fehler', error });
        }
      } finally {
        reserved.delete(id);
        report();
      }
    }
  }
  // Versetzt starten, damit sich die Läufe nicht alle gleichzeitig um den Browserstart drängen.
  const runPool = (workers) => Promise.all(Array.from({ length: workers }, (_, w) => new Promise((r) => setTimeout(r, w * 3000)).then(worker)));
  // Probelauf ohne Parallelität, damit die geplanten IDs der tatsächlichen Reihenfolge entsprechen.
  await runPool(dryRun ? 1 : parallel);

  // Zweiter Versuch für fehlgeschlagene Aufnahmen (z. B. Player lieferte bei vielen gleichzeitigen Läufen keine Daten).
  const retry = results.filter((r) => r.status === 'fehler').map((r) => r.film);
  if (retry.length && !aborted && !dryRun) {
    console.log(`\nZweiter Versuch für ${retry.length} fehlgeschlagene Einträge (höchstens 2 gleichzeitig) …\n`);
    for (const film of retry) results.splice(results.findIndex((r) => r.film === film && r.status === 'fehler'), 1);
    queue = retry;
    next = 0;
    await runPool(Math.min(2, parallel));
  }

  const counts = results.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {});
  if (aborted) {
    console.error(`\nAbgebrochen: Der Aufnahme-Browser ließ sich nicht starten (bei #${String(aborted.sourceId).padStart(3, '0')}). Noch nicht bearbeitet: ${films.length - results.length} Einträge.`);
    console.error('Alle Fenster des Aufnahme-Browsers schließen und erneut starten – vorhandene Karten werden übersprungen.');
  }
  console.log('\nZusammenfassung:', Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', '));
  report();
  release();
  const ids = (status) => results.filter((r) => status.includes(r.status)).map((r) => r.film.sourceId).sort((a, b) => a - b).join(',');
  if (ids(['fehler'])) console.log('Fehlgeschlagen (erneut versuchen mit --eintraege):', ids(['fehler']));
  if (ids(['kein Filmlink', 'kein Player'])) console.log('Nicht aufnehmbar (kein Filmo-Link/Player):', ids(['kein Filmlink', 'kein Player']));
  if (results.some((r) => r.status === 'angelegt')) {
    console.log('Bitte die neuen Aufnahmen anhören: Szene, Sprache, Schnittenden und auszulassende Namen prüfen.');
  }
  if (results.some((r) => r.status === 'fehler')) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(`Fehler: ${e.message}`); process.exit(1); });
}
