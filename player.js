'use strict';
const $ = selector => document.querySelector(selector);
let media = $('#audio');
let variants = [], currentVariant = null, cards = [], scanner = null;
let scanning = false, starting = false, busy = false;
const message = text => { $('#status').textContent = text; };
const time = seconds => Number.isFinite(seconds) ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}` : '0:00';
function syncPlayer() {
  const ready = Boolean(media.getAttribute('src'));
  $('#play').disabled = !ready;
  $('#seek').disabled = !Number.isFinite(media.duration) || !ready;
  $('#elapsed').textContent = time(media.currentTime);
  $('#duration').textContent = time(media.duration);
  $('#seek').value = media.duration > 0 ? media.currentTime / media.duration * 100 : 0;
  $('#play').setAttribute('aria-label', media.paused ? 'Sound abspielen' : 'Sound pausieren');
  $('#play-icon').innerHTML = media.paused ? '<path d="M8 5v14l11-7z"/>' : '<path d="M6 5h4v14H6zm8 0h4v14h-4z"/>';
  $('#record').classList.toggle('playing', !media.paused);
}
async function loadVariant(id) {
  const variant = variants.find(item => item.id === id);
  if (!variant) throw new Error('Unknown variant');
  const response = await fetch(variant.cards);
  if (!response.ok) throw new Error('Cards unavailable');
  const entries = await response.json();
  const base = new URL(variant.cards, location.href);
  cards = entries.map(item => ({ ...item, file: new URL(item.file, base).href }));
  currentVariant = variant;
}
async function play() {
  try { await media.play(); message(''); }
  catch (error) { message(error.name === 'NotAllowedError' ? 'Tippe auf ▶, um zu starten.' : 'Wiedergabe nicht möglich. Versuche es erneut.'); }
  syncPlayer();
}
async function selectCard(id, updateUrl = true) {
  const card = cards.find(item => item.id === id);
  if (!card) { message('Unbekannte Karte. Bitte erneut scannen.'); return; }
  media.pause(); media.hidden = true;
  media = $(card.type === 'video' ? '#video' : '#audio');
  media.src = card.file;
  media.hidden = card.type !== 'video';
  $('#record').hidden = card.type === 'video';
  if (updateUrl) {
    const url = new URL(location.href);
    url.searchParams.set('variant', currentVariant.id); url.searchParams.set('id', id);
    history.replaceState(null, '', url);
  }
  syncPlayer();
  await play();
}
async function stopScanner() {
  if (scanner && scanning) { await scanner.stop(); scanning = false; scanner.clear(); }
  $('#scanner-panel').hidden = true;
  $('#scan-label').textContent = 'QR-Code scannen';
}
async function onScan(value) {
  if (busy || starting || !scanning) return;
  let id, variantId;
  try {
    const url = new URL(value);
    if (url.origin !== location.origin || url.pathname !== location.pathname) throw new Error();
    id = url.searchParams.get('id'); variantId = url.searchParams.get('variant') || 'film';
    if (!variants.some(item => item.id === variantId)) throw new Error();
  } catch { message('Dieser QR-Code gehört nicht zu diesem Spiel.'); return; }
  busy = true;
  try {
    if (variantId !== currentVariant?.id) await loadVariant(variantId);
    if (!cards.some(item => item.id === id)) { message('Unbekannte Karte. Bitte erneut scannen.'); return; }
    await stopScanner(); await selectCard(id);
  } catch { message('Karte konnte nicht geladen werden. Bitte erneut versuchen.'); }
  finally { busy = false; }
}
$('#play').addEventListener('click', () => { if (media.paused) play(); else media.pause(); });
$('#seek').addEventListener('input', event => { if (Number.isFinite(media.duration)) media.currentTime = Number(event.target.value) / 100 * media.duration; });
$('#scan').addEventListener('click', async () => {
  if (busy || starting) return;
  if (scanning) { try { await stopScanner(); message(''); } catch { message('Kamera konnte nicht geschlossen werden. Seite neu laden.'); } return; }
  if (!window.Html5Qrcode) { message('Scanner nicht verfügbar. Bitte Seite neu laden.'); return; }
  starting = true; media.pause(); $('#scan').disabled = true;
  $('#scanner-panel').hidden = false;
  try {
    scanner ||= new Html5Qrcode('reader');
    await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: (width, height) => { const side = Math.max(50, Math.floor(Math.min(width, height) * .7)); return { width: side, height: side }; } }, onScan, () => {});
    scanning = true; $('#scan-label').textContent = 'Scannen beenden'; message('Halte den QR-Code vor die Kamera.');
  } catch { $('#scanner-panel').hidden = true; message('Kamera nicht verfügbar. Bitte Kamerazugriff im Browser erlauben.'); }
  finally { starting = false; $('#scan').disabled = false; }
});
for (const element of document.querySelectorAll('audio, video')) {
  for (const event of ['play', 'pause', 'timeupdate', 'loadedmetadata', 'durationchange', 'emptied']) element.addEventListener(event, syncPlayer);
  element.addEventListener('error', () => message('Datei nicht verfügbar. Bitte erneut scannen.'));
  element.addEventListener('ended', () => { syncPlayer(); message('Scanne die nächste Karte.'); });
}
async function init() {
  try {
    const response = await fetch('variants.json'); if (!response.ok) throw new Error();
    variants = await response.json(); if (!variants.length) throw new Error();
    const url = new URL(location.href);
    const variantId = url.searchParams.get('variant') || variants[0].id;
    await loadVariant(variantId);
    $('#scan').disabled = false;
    if (url.searchParams.has('id')) await selectCard(url.searchParams.get('id'), false);
  } catch { message('Spiel konnte nicht geladen werden. Bitte Seite neu laden.'); }
}
init();
