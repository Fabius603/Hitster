'use strict';
const element = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
function renderCard(card, side, variant) {
  const node = element('article', undefined, `card ${side === 'back' ? 'answer' : ''}`);
  if (!card) { node.classList.add('blank'); return node; }
  node.append(element('p', 'HITSTER · ' + variant.name, 'brand'));
  if (side === 'front') {
    const url = new URL('./', location.href);
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
  try {
    const list = await fetch('variants.json'); if (!list.ok) throw new Error();
    const variants = await list.json();
    const id = new URL(location.href).searchParams.get('variant') || variants[0].id;
    const variant = variants.find(item => item.id === id); if (!variant) throw new Error();
    document.querySelector('h1').textContent = variant.name + ' · Spielkarten';
    const response = await fetch(variant.cards); if (!response.ok) throw new Error();
    const cards = await response.json();
    function render() {
      const root = document.querySelector('#cards'); root.replaceChildren();
      const sheets = planSheets(cards, document.querySelector('#edge').value);
      sheets.forEach((sheet, index) => {
        for (const side of ['front', 'back']) {
          root.append(element('p', `Blatt ${index + 1} · ${side === 'front' ? 'Vorderseite / QR-Codes' : 'Rückseite / Auflösungen'}`, 'sheet-label'));
          const page = element('section', undefined, 'sheet');
          page.setAttribute('aria-label', `Blatt ${index + 1} ${side}`);
          sheet[side].forEach(card => page.append(renderCard(card, side, variant)));
          root.append(page);
        }
      });
    }
    document.querySelector('#edge').addEventListener('change', render);
    document.querySelector('#print-cards').addEventListener('click', () => window.print());
    render(); document.querySelector('#print-cards').disabled = !cards.length;
  } catch { document.querySelector('#error').textContent = 'Karten konnten nicht geladen werden. Bitte Seite neu laden.'; }
})();
