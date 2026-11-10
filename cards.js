'use strict';
const element = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
function renderCard(card, side, variant, playerUrl) {
  const node = element('article', undefined, `card ${side === 'back' ? 'answer' : ''}`);
  if (!card) { node.classList.add('blank'); return node; }
  node.append(element('p', 'HITSTER · ' + variant.name, 'brand'));
  if (side === 'front') {
    const url = new URL(playerUrl);
    url.searchParams.set('id', card.id); url.searchParams.set('variant', variant.id);
    const qr = qrcode(0, 'M'); qr.addData(url.href); qr.make();
    const code = element('div', undefined, 'qr');
    code.innerHTML = qr.createSvgTag({ cellSize: 5, margin: 20, scalable: true }); node.append(code);
  } else {
    const answer = card.answer || {};
    node.append(element('h2', answer.title || 'Auflösung noch ergänzen'));
    if (answer.year) node.append(element('p', String(answer.year), 'year'));
    if (answer.timestamp) node.append(element('p', 'Zeitpunkt: ' + answer.timestamp, 'detail'));
    if (answer.scene) node.append(element('p', answer.scene, 'detail'));
    if (!answer.title) node.append(element('p', 'Film und Jahr in der Kartenliste eintragen.', 'missing'));
  }
  node.append(element('p', `KARTE ${card.id}`, 'card-id'));
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
    const id = new URL(location.href).searchParams.get('variant') || variants[0].id;
    const variant = variants.find(item => item.id === id); if (!variant) throw new Error('Die gewählte Spielvariante existiert nicht.');
    document.querySelector('h1').textContent = variant.name + ' · Spielkarten';
    const response = await fetch(variant.cards, { cache: 'no-store' }); if (!response.ok) throw new Error('Die Kartenliste ist nicht erreichbar.');
    const cards = await response.json();
    if (!Array.isArray(cards)) throw new Error('Die Kartenliste ist ungültig.');
    function render() {
      print.disabled = true;
      const root = document.querySelector('#cards');
      try {
        const playerUrl = new URL(address.value.trim());
        if (!['http:', 'https:'].includes(playerUrl.protocol)) throw new Error();
        // A player URL may already contain query parameters; card IDs replace them below.
        playerUrl.hash = '';
        const content = document.createDocumentFragment();
        const sheets = planSheets(cards, document.querySelector('#edge').value);
        sheets.forEach((sheet, index) => {
          for (const side of ['front', 'back']) {
            content.append(element('p', `Blatt ${index + 1} · ${side === 'front' ? 'Vorderseite / QR-Codes' : 'Rückseite / Auflösungen'}`, 'sheet-label'));
            const page = element('section', undefined, 'sheet');
            page.setAttribute('aria-label', `Blatt ${index + 1} ${side}`);
            sheet[side].forEach(card => page.append(renderCard(card, side, variant, playerUrl.href)));
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
