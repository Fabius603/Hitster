'use strict';
(async () => {
  try {
    const list = await fetch('variants.json'); if (!list.ok) throw new Error();
    const variants = await list.json();
    const id = new URL(location.href).searchParams.get('variant') || variants[0].id;
    const variant = variants.find(item => item.id === id); if (!variant) throw new Error();
    document.querySelector('h1').textContent = variant.name + ' · Spielkarten';
    const response = await fetch(variant.cards); if (!response.ok) throw new Error();
    const sounds = await response.json();
    for (const sound of sounds) {
      const url = new URL('./', location.href); url.searchParams.set('id', sound.id); url.searchParams.set('variant', variant.id);
      const qr = qrcode(0, 'M'); qr.addData(url.href); qr.make();
      const card = document.createElement('article'); card.className = 'card';
      const title = document.createElement('p'); title.textContent = 'HITSTER · ' + variant.name; card.append(title);
      const code = document.createElement('div'); code.innerHTML = qr.createSvgTag({ cellSize: 5, margin: 20, scalable: true }); card.append(code);
      const number = document.createElement('p'); number.textContent = `KARTE ${sound.id}`; card.append(number);
      const link = document.createElement('a'); link.href = url.href; link.textContent = 'Sound ausprobieren'; card.append(link);
      document.querySelector('#cards').append(card);
    }
  } catch { document.querySelector('#error').textContent = 'Karten konnten nicht geladen werden. Bitte Seite neu laden.'; }
})();
