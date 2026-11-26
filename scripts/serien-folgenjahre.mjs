// Adds the air date of each episode to the series cards, so the game can use the
// year the episode aired instead of the year the series started.
//
// Usage: node scripts/serien-folgenjahre.mjs [path/to/serien/cards.json]
// Source: TVmaze (public API, no key). Only the public IMDb IDs of the series are sent.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const API = 'https://api.tvmaze.com';
const DELAY_MS = 600; // TVmaze allows about 20 requests per 10 seconds.

export function episodeIndex(episodes) {
  const index = new Map();
  for (const item of episodes || []) {
    if (Number.isInteger(item.season) && Number.isInteger(item.number) && /^\d{4}-\d{2}-\d{2}$/.test(item.airdate || '')) {
      index.set(`${item.season}|${item.number}`, item.airdate);
    }
  }
  return index;
}

export function applyEpisodeYears(cards, lookup) {
  let updated = 0;
  const missing = [];
  for (const card of cards) {
    const answer = card && card.answer;
    if (!answer || !answer.seriesId || !Number.isInteger(answer.season) || !Number.isInteger(answer.episode)) continue;
    const airdate = lookup(answer.seriesId, answer.season, answer.episode);
    if (typeof airdate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(airdate)) {
      if (Number.isInteger(answer.episodeYear)) continue; // keep a year found earlier
      missing.push(`${answer.title} S${answer.season}E${answer.episode}`);
      continue;
    }
    const year = Number(airdate.slice(0, 4));
    if (answer.airdate !== airdate || answer.episodeYear !== year) updated++;
    answer.airdate = airdate;
    answer.episodeYear = year;
  }
  return { updated, missing };
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function getJson(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'hitster-card-tools' } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`${response.status} bei ${url}`);
  return response.json();
}

async function fetchEpisodes(imdbId) {
  const show = await getJson(`${API}/lookup/shows?imdb=${encodeURIComponent(imdbId)}`);
  if (!show) return new Map();
  await sleep(DELAY_MS);
  return episodeIndex(await getJson(`${API}/shows/${show.id}/episodes`));
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const file = path.resolve(process.argv[2] || path.join(root, 'variants/serien/cards.json'));
  const raw = await readFile(file, 'utf8');
  const cards = JSON.parse(raw);
  const ids = [...new Set(cards.map(card => card.answer && card.answer.seriesId).filter(Boolean))];
  const bySeries = new Map();
  for (const [i, id] of ids.entries()) {
    try { bySeries.set(id, await fetchEpisodes(id)); }
    catch (error) { console.warn(`Übersprungen ${id}: ${error.message}`); bySeries.set(id, new Map()); }
    process.stdout.write(`\r${i + 1}/${ids.length} Serien abgefragt`);
    await sleep(DELAY_MS);
  }
  process.stdout.write('\n');
  const result = applyEpisodeYears(cards, (id, season, episode) => (bySeries.get(id) || new Map()).get(`${season}|${episode}`) || null);
  const newline = raw.includes('\r\n') ? '\r\n' : '\n';
  await writeFile(file, JSON.stringify(cards, null, 2).replace(/\n/g, newline) + newline);
  console.log(`${result.updated} Karten aktualisiert, ${cards.length - result.missing.length} mit Folgenjahr.`);
  if (result.missing.length) console.log(`Ohne Ausstrahlungsdatum (${result.missing.length}):\n  ${result.missing.join('\n  ')}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
