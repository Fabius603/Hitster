// Gemeinsamer Kartenabgleich für HTML-Liste und Aufnahme-Queue.
export const normalizeTitle = (title) => String(title ?? '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/ß/g, 'ss')
  .replace(/[^a-z0-9]+/g, ' ').trim();

export function titleKeys(film) {
  const titles = [film.title, film.filmoTitle, ...(film.titleAliases ?? [])].filter(Boolean);
  // Nur explizite Titelzusätze trennen: "Bullet Train Down" bleibt ein anderer Film.
  return new Set(titles.flatMap(t => [t, ...t.split(/\s+[–—-]\s+|:\s+/)])
    .map(normalizeTitle).filter(Boolean));
}

export function findCard(cards, film) {
  const keys = titleKeys(film);
  return cards.find(card => !card.archived && card.answer && Number(card.answer.year) === Number(film.year)
    && [...titleKeys(card.answer)].some(key => keys.has(key)));
}

export function scanCards(films, cards) {
  return films.map(film => {
    const card = findCard(cards, film);
    const url = film.filmoUrl ?? film.filmo;
    return { film, card, status: card ? 'vorhanden' : url && !/\/search\b/i.test(url) ? 'offen' : 'kein Filmlink' };
  });
}

export function uniqueFilms(films) {
  const result = [];
  for (const film of films) {
    const previous = result.find(other => Number(other.year) === Number(film.year)
      && ((film.clipUrl && film.clipUrl === other.clipUrl)
        || (film.filmoUrl && film.filmoUrl === other.filmoUrl)
        || [...titleKeys(film)].some(key => titleKeys(other).has(key))));
    if (!previous) result.push(film);
    else if (!previous.filmoUrl && film.filmoUrl) {
      previous.filmoUrl = film.filmoUrl;
      previous.filmoTitle = film.filmoTitle;
      previous.filmoYear = film.filmoYear;
    }
  }
  return result;
}
