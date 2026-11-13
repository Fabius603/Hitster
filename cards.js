'use strict';
const element = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
const paletteSize = 12;
// Decorative arcs around the QR code, drawn as SVG because Chrome misplaces
// CSS masks/conic gradients when printing. Units: mm of the original 65 mm
// card (ring box 53 mm); the SVG scales with the card. Angles: degrees
// clockwise from 12 o'clock.
const rings = [
  ['#e753ac', -10, 306], ['#2b94e8', 191, 284], ['#e0e945', 296, 290], ['#e253a2', 221, 276],
  ['#9466de', 327, 318], ['#ed9752', 61, 302], ['#3fa9ee', 147, 295], ['#e0e945', 278, 264]
];
const ringsSvg = '<svg viewBox="0 0 53 53" xmlns="http://www.w3.org/2000/svg">' + rings.map(([color, start, arc], index) =>
  `<circle cx="26.5" cy="26.5" r="${26.25 - index * 1.9}" pathLength="360" fill="none" stroke="${color}" stroke-width=".5" ` +
  `stroke-dasharray="${arc} ${360 - arc}" transform="rotate(${start - 90} 26.5 26.5)"/>`).join('') + '</svg>';

function renderCard(card, side, variant, playerUrl, colorIndex) {
  const node = element('article', undefined, `card ${side === 'back' ? 'answer' : 'front'}`);
  if (!card) { node.classList.add('blank'); return node; }
  if (side === 'front') {
    node.append(element('p', 'HITSTER · ' + variant.name, 'brand'));
    const url = new URL(playerUrl);
    url.searchParams.set('variant', variant.id);
    url.searchParams.set(card.key ? 'card' : 'id', card.key || card.id);
    const qr = qrcode(0, 'M'); qr.addData(url.href); qr.make();
    const code = element('div', undefined, 'qr');
    const cellSize = 5;
    code.innerHTML = qr.createSvgTag({ cellSize, margin: 2 * cellSize, scalable: true });
    code.setAttribute('role', 'img');
    code.setAttribute('aria-label', 'QR-Code');
    const rings = element('div', undefined, 'qr-rings');
    rings.setAttribute('aria-hidden', 'true');
    rings.innerHTML = ringsSvg;
    node.append(rings, code);
  } else {
    node.classList.add(`palette-${colorIndex}`);
    const answer = card.answer || {};
    // Three rows (title / year / details): the year sits exactly in the card centre.
    const details = element('div', undefined, 'details');
    if (answer.timestamp) details.append(element('p', answer.timestamp, 'timestamp'));
    if (answer.scene) details.append(element('p', answer.scene, 'scene'));
    if (!answer.title) details.append(element('p', 'Film und Jahr in der Kartenliste eintragen.', 'missing'));
    node.append(element('h2', answer.title || 'Auflösung noch ergänzen'), element('p', answer.year ? String(answer.year) : '', 'year'), details);
  }
  return node;
}
(async () => {
  const error = document.querySelector('#error');
  const print = document.querySelector('#print-cards');
  const address = document.querySelector('#player-url');
  if (location.protocol === 'file:') {
    error.textContent = 'Die Karten können nicht direkt als Datei geladen werden. Schließe diese Ansicht und doppelklicke im Projektordner auf Karten-drucken.cmd. Die Karten öffnen sich dann automatisch im Browser.';
    return;
  }
  try {
    if (!['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) address.value = new URL('./', location.href).href;
    const list = await fetch('variants.json', { cache: 'no-store' }); if (!list.ok) throw new Error('Die Variantenliste ist nicht erreichbar.');
    const variants = await list.json();
    if (!Array.isArray(variants) || !variants.length) throw new Error('Die Variantenliste ist leer oder ungültig.');
    const pageUrl = new URL(location.href);
    const id = pageUrl.searchParams.get('variant') || variants[0].id;
    const variant = variants.find(item => item.id === id); if (!variant) throw new Error('Die gewählte Spielvariante existiert nicht.');
    document.querySelector('h1').textContent = variant.name + ' · Spielkarten';
    const response = await fetch(variant.cards, { cache: 'no-store' }); if (!response.ok) throw new Error('Die Kartenliste ist nicht erreichbar.');
    const catalog = await response.json();
    if (!Array.isArray(catalog)) throw new Error('Die Kartenliste ist ungültig.');
    let cards = catalog.filter(card => !card.archived);
    const editions = variant.editions || [];
    if (editions.length) {
      const edition = document.querySelector('#edition');
      for (const entry of editions) {
        const option = element('option', entry.name);
        option.value = entry.id;
        edition.append(option);
      }
      const selected = editions.find(entry => entry.id === pageUrl.searchParams.get('edition')) || editions[0];
      edition.value = selected.id;
      document.querySelector('#edition-field').hidden = false;
      edition.addEventListener('change', () => {
        pageUrl.searchParams.set('edition', edition.value);
        location.href = pageUrl.href;
      });
      const manifest = await fetch(selected.cards, { cache: 'no-store' });
      if (!manifest.ok) throw new Error('Die Versionsliste ist nicht erreichbar.');
      const keys = await manifest.json();
      const byKey = new Map(cards.map(card => [card.key, card]));
      if (!Array.isArray(keys) || keys.some(key => !byKey.has(key))) throw new Error('Die Versionsliste enthält unbekannte Karten.');
      cards = keys.map(key => byKey.get(key));
    }
    const colors = new Map(cards.map((card, index) => [card.id, index % paletteSize]));
    function render() {
      print.disabled = true;
      const root = document.querySelector('#cards');
      try {
        const playerUrl = new URL(address.value.trim());
        if (!['http:', 'https:'].includes(playerUrl.protocol)) throw new Error();
        playerUrl.search = '';
        playerUrl.hash = '';
        const content = document.createDocumentFragment();
        const sheets = planSheets(cards, document.querySelector('#edge').value);
        sheets.forEach((sheet, index) => {
          for (const side of ['front', 'back']) {
            content.append(element('p', `Blatt ${index + 1} · ${side === 'front' ? 'Vorderseite / QR-Codes' : 'Rückseite / Auflösungen'}`, 'sheet-label'));
            const page = element('section', undefined, `sheet sheet-${side}`);
            page.setAttribute('aria-label', `Blatt ${index + 1} ${side}`);
            sheet[side].forEach(card => page.append(renderCard(card, side, variant, playerUrl.href, colors.get(card?.id))));
            content.append(page);
          }
        });
        root.replaceChildren(content);
        print.disabled = !cards.length;
        error.textContent = cards.length ? `${cards.length} Karten geladen · ${sheets.length * 2} Druckseiten.` : 'Diese Variante enthält noch keine Karten.';
      } catch {
        root.replaceChildren();
        error.textContent = 'Die Druckbögen konnten nicht erstellt werden. Bitte eine gültige Spieladresse mit https:// oder http:// eingeben. Falls der Fehler bleibt, lade die Ansicht erneut.';
      }
    }
    document.querySelector('#edge').addEventListener('change', render);
    address.addEventListener('input', render);
    print.addEventListener('click', () => { if (!print.disabled) window.print(); });
    render();
  } catch (cause) { error.textContent = 'Karten konnten nicht geladen werden. ' + cause.message + ' Lokal bitte Karten-drucken.cmd starten und die dort geöffnete Adresse verwenden.'; }
})();
