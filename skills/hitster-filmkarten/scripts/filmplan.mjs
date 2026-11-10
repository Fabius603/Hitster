import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function decode(text) {
  return text.replace(/&#(x[0-9a-f]+|\d+);|&(amp|quot|apos|lt|gt|nbsp);/gi, (_, n, name) =>
    n ? String.fromCodePoint(n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : Number(n))
      : ({amp:'&', quot:'"', apos:"'", lt:'<', gt:'>', nbsp:' '})[name.toLowerCase()]);
}

export function parseFilms(html) {
  const films = [];
  for (const match of html.matchAll(/<tr\b[^>]*data-id="(\d+)"[^>]*>([\s\S]*?)<\/tr>/g)) {
    const row = match[2];
    const get = (regex, field) => {
      const value = row.match(regex)?.[1];
      if (!value) throw new Error(`Zeile ${match[1]}: ${field} fehlt (HTML-Format prüfen).`);
      return decode(value.replace(/<[^>]*>/g, '')).trim();
    };
    const title = get(/<td class="film">([\s\S]*?)<\/td>/, 'Titel');
    const year = Number(get(/<td class="year">(\d{4})<\/td>/, 'Jahr'));
    const scene = get(/<td class="scene">([\s\S]*?)(?:<div class="cut-box">|<\/td>)/, 'Szene');
    const cutBox = row.match(/<div class="cut-box">([\s\S]*?)<\/div>/)?.[1];
    const cutHints = cutBox ? decode(cutBox.replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim() : '';
    const timestamp = get(/<td class="time">([^<]+)<\/td>/, 'Zeit');
    if (!/^\d{2,3}:[0-5]\d:[0-5]\d$/.test(timestamp)) throw new Error(`Ungültige Zeit: ${timestamp}`);
    const durationText = row.match(/<td class="duration">\s*(\d+(?:[,.]\d+)?)\s*s?\s*<\/td>/)?.[1];
    const duration = durationText ? Number(durationText.replace(',', '.')) : null;
    const sourceId = Number(match[1]);
    const track = lang => ({file:`raw/${String(sourceId).padStart(3,'0')}-${lang}.wav`, start:0, length:20, verified:false});
    films.push({sourceId, title, year, scene, timestamp, duration,
      filmo:decode(row.match(/<td class="filmo">\s*<a href="([^"]+)"/)?.[1] ?? ''),
      clipCafe:get(/<td class="clip">\s*<a href="([^"]+)"/, 'ClipCafe'),
      de:track('de'), en:track('en'), cutHints, blocked:null, notes:''});
  }
  if (!films.length || new Set(films.map(f=>f.sourceId)).size !== films.length) throw new Error('Keine eindeutigen Filmzeilen gefunden.');
  return films;
}

export function matchingCard(cards, entry) {
  return cards.find(c => c.tracks?.de && c.tracks?.en && c.answer?.title === entry.title &&
    c.answer?.year === entry.year && c.answer?.scene === entry.scene && c.answer?.timestamp === entry.timestamp);
}

function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!['prepare','status'].includes(command) || args.length % 2) throw new Error('Aufruf: filmplan.mjs prepare|status --project PFAD [--html PFAD] [--plan PFAD]');
  const options = {};
  for (let i=0; i<args.length; i+=2) {
    if (!['--project','--html','--plan'].includes(args[i])) throw new Error(`Unbekannte Option ${args[i]}`);
    options[args[i]] = args[i+1];
  }
  const project = path.resolve(options['--project'] || '.');
  const planPath = path.resolve(options['--plan'] || path.join(project,'.local/filmaufnahme/plan.json'));
  if (command === 'prepare') {
    const html = path.resolve(options['--html'] || path.join(project,'filmquiz-vorbereitung/filme-150.html'));
    const entries = parseFilms(fs.readFileSync(html,'utf8'));
    fs.mkdirSync(path.dirname(planPath),{recursive:true});
    fs.writeFileSync(planPath, JSON.stringify({version:1, html, entries},null,2)+'\n', {flag:'wx'});
    console.log(`${entries.length} Filme: ${planPath}`);
  } else {
    const plan = JSON.parse(fs.readFileSync(planPath,'utf8'));
    const cards = JSON.parse(fs.readFileSync(path.join(project,'variants/film/cards.json'),'utf8'));
    const counts = {imported:0, blocked:0, ready:0, pending:0};
    for (const entry of plan.entries) {
      const card = matchingCard(cards, entry);
      const state = card ? 'imported' : entry.blocked ? 'blocked' : entry.de.verified && entry.en.verified ? 'ready' : 'pending';
      counts[state]++;
      console.log(`${String(entry.sourceId).padStart(3,'0')} ${state}${card ? ' #'+card.id : ''}: ${entry.title}${entry.blocked && !card ? ' — '+entry.blocked : ''}`);
    }
    console.log(JSON.stringify(counts));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch(error) { console.error(error.message); process.exitCode=1; }
}
