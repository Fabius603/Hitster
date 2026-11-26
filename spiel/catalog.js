'use strict';
// Loads the film and series cards that can be played digitally.
(function (root) {
  const VARIANTS = ['film', 'serien'];

  async function fetchJson(fetchFn, url) {
    const response = await fetchFn(url, { cache: 'no-cache' });
    if (!response.ok) throw new Error('Nicht verfügbar: ' + url);
    return response.json();
  }

  function playable(variantId, cardsUrl, entries) {
    if (!Array.isArray(entries)) return [];
    return entries.filter(card => card && card.key && !card.archived && (card.type || 'audio') === 'audio'
      && card.answer && Number.isInteger(card.answer.year) && typeof card.answer.title === 'string' && card.answer.title.trim())
      .map(card => ({
        id: variantId + ':' + card.key,
        title: card.answer.title.trim(),
        year: card.answer.year,
        audio: new URL((card.tracks && card.tracks.de) || card.file, cardsUrl).href
      }));
  }

  async function loadCatalog(fetchFn, baseUrl) {
    const variantsUrl = new URL('../variants.json', baseUrl);
    const variants = await fetchJson(fetchFn, variantsUrl.href);
    const catalog = {};
    await Promise.all(VARIANTS.map(async id => {
      const variant = Array.isArray(variants) && variants.find(item => item.id === id);
      catalog[id] = [];
      if (!variant || !variant.cards) return;
      const cardsUrl = new URL(variant.cards, variantsUrl).href;
      try { catalog[id] = playable(id, cardsUrl, await fetchJson(fetchFn, cardsUrl)); } catch { catalog[id] = []; }
    }));
    return catalog;
  }

  function deckFor(catalog, deck) {
    if (deck === 'mix') return [...catalog.film, ...catalog.serien];
    return catalog[deck] || [];
  }

  const api = { loadCatalog, deckFor };
  root.HitsterCatalog = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
