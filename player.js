'use strict';
const $ = selector => document.querySelector(selector);
let media = $('#audio');
let variants = [], currentVariant = null, cards = [], scanner = null;
let scanning = false, starting = false, busy = false;
let preferredLanguage = 'de', selectedCard = null;
const message = text => { $('#status').textContent = text; };
const time = seconds => Number.isFinite(seconds) ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}` : '0:00';
function syncPlayer() {
  const ready = Boolean(media.getAttribute('src'));
  $('#play').disabled = !ready;
  $('#elapsed').textContent = time(media.currentTime);
  $('#duration').textContent = time(media.duration);
  const progress = Number.isFinite(media.duration) && media.duration > 0 ? Math.min(100, Math.max(0, media.currentTime / media.duration * 100)) : 0;
  $('#progress').setAttribute('stroke-dashoffset', 100 - progress);
  $('#progress-value').setAttribute('aria-valuenow', Math.round(progress));
  $('#play').setAttribute('aria-label', media.paused ? 'Sound abspielen' : 'Sound stoppen');
  $('#play-icon').innerHTML = media.paused ? '<path d="M8 5v14l11-7z"/>' : '<path d="M6 6h12v12H6z"/>';
  $('#record').classList.toggle('playing', !media.paused);
}
async function loadVariant(id) {
  const variant = variants.find(item => item.id === id);
  if (!variant) throw new Error('Unknown variant');
  const response = await fetch(variant.cards, { cache: 'no-cache' });
  if (!response.ok) throw new Error('Cards unavailable');
  const entries = await response.json();
  const base = new URL(variant.cards, location.href);
  cards = entries.map(item => ({ ...item, file: new URL(item.file, base).href,
    tracks: Object.fromEntries(Object.entries(item.tracks || {}).map(([language, path]) => [language, new URL(path, base).href])) }));
  currentVariant = variant;
  $('#print').href = `cards.html?variant=${encodeURIComponent(variant.id)}`;
}
async function play() {
  try { await media.play(); message(''); }
  catch (error) { message(error.name === 'NotAllowedError' ? 'Tippe auf ▶, um zu starten.' : 'Wiedergabe nicht möglich. Versuche es erneut.'); }
  syncPlayer();
}
async function selectCard(id, updateUrl = true, autoplay = true) {
  const card = cards.find(item => item.id === id);
  if (!card) { message('Unbekannte Karte. Bitte erneut scannen.'); return; }
  media.pause(); media.hidden = true;
  media = $(card.type === 'video' ? '#video' : '#audio');
  selectedCard = card;
  const languages = Object.keys(card.tracks);
  const language = languages.includes(preferredLanguage) ? preferredLanguage : languages[0];
  media.src = card.tracks[language] || card.file;
  $('#language-switch').hidden = languages.length < 2;
  $('#language-de').disabled = !card.tracks.de;
  $('#language-en').disabled = !card.tracks.en;
  $('#language-de').setAttribute('aria-pressed', language === 'de');
  $('#language-en').setAttribute('aria-pressed', language === 'en');
  media.hidden = card.type !== 'video';
  $('#record').hidden = card.type === 'video';
  if (updateUrl) {
    const url = new URL(location.href);
    url.searchParams.set('variant', currentVariant.id); url.searchParams.set('id', id);
    history.replaceState(null, '', url);
  }
  syncPlayer();
  if (autoplay) await play();
  else message('Bereit. Tippe auf ▶ oder scanne eine Karte.');
}
async function changeLanguage(language) {
  if (!selectedCard?.tracks[language]) return;
  preferredLanguage = language;
  const wasPlaying = !media.paused;
  // The recordings may have different lengths; each language starts at its scene beginning.
  await selectCard(selectedCard.id, false, wasPlaying);
}
$('#language-de').addEventListener('click', () => changeLanguage('de'));
$('#language-en').addEventListener('click', () => changeLanguage('en'));
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
    const normalizePath = path => path.replace(/\/index\.html$/, '/').replace(/\/$/, '');
    if (url.origin !== location.origin || normalizePath(url.pathname) !== normalizePath(location.pathname)) throw new Error();
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
$('#play').addEventListener('click', () => { if (media.paused) play(); else { media.pause(); media.currentTime = 0; syncPlayer(); } });
async function toggleScanner() {
  if (busy || starting) return;
  if (scanning) { try { await stopScanner(); message(''); } catch { message('Kamera konnte nicht geschlossen werden. Seite neu laden.'); } return; }
  if (!window.Html5Qrcode) { message('Scanner nicht verfügbar. Bitte Seite neu laden.'); return; }
  starting = true; media.pause(); $('#scan').disabled = true;
  $('#scanner-panel').hidden = false;
  try {
    scanner ||= new Html5Qrcode('reader');
    // Decode the full frame: avoids mismatches between cropped previews and the QR region.
    const config = { fps: 10 };
    try {
      await scanner.start({ facingMode: 'environment' }, config, onScan, () => {});
    } catch (error) {
      const reason = String(error?.name || '') + ' ' + String(error);
      if (!/Overconstrained|NotFound|DevicesNotFound/i.test(reason)) throw error;
      await scanner.start({ facingMode: 'user' }, config, onScan, () => {});
    }
    scanning = true; $('#scan-label').textContent = 'Scannen beenden'; message('Halte den QR-Code vor die Kamera.');
  } catch (error) {
    $('#scanner-panel').hidden = true;
    try { scanner?.clear(); } catch {}
    scanner = null;
    const reason = String(error?.name || '') + ' ' + String(error);
    message(/NotAllowed|Permission|denied/i.test(reason) ? 'Kamerazugriff gesperrt. Bitte in den Website-Einstellungen des Browsers erlauben.' : /NotReadable|TrackStart/i.test(reason) ? 'Kamera wird bereits verwendet. Schließe andere Kamera-Apps und versuche es erneut.' : 'Kamera nicht verfügbar. Öffne die Seite direkt in Safari oder Chrome und versuche es erneut.');
  }
  finally { starting = false; $('#scan').disabled = false; }
}
$('#scan').addEventListener('click', toggleScanner);
let touchStart = null;
$('.game').addEventListener('touchstart', event => {
  if (event.touches.length !== 1 || event.target.closest('a, video, #scanner-panel')) { touchStart = null; return; }
  const point = event.touches[0]; touchStart = { x: point.clientX, y: point.clientY };
}, { passive: true });
$('.game').addEventListener('touchend', event => {
  if (!touchStart || !event.changedTouches.length) return;
  const point = event.changedTouches[0];
  const dx = point.clientX - touchStart.x, dy = point.clientY - touchStart.y;
  touchStart = null;
  if (Math.abs(dx) >= 55 && Math.abs(dx) > Math.abs(dy) * 1.5 && !scanning && !$('#scan').disabled) {
    event.preventDefault?.();
    toggleScanner();
  }
}, { passive: false });
$('.game').addEventListener('touchcancel', () => { touchStart = null; });
for (const element of document.querySelectorAll('audio, video')) {
  for (const event of ['play', 'pause', 'timeupdate', 'loadedmetadata', 'durationchange', 'emptied']) element.addEventListener(event, syncPlayer);
  element.addEventListener('error', () => message('Datei nicht verfügbar. Bitte erneut scannen.'));
  element.addEventListener('ended', () => { syncPlayer(); message('Scanne die nächste Karte.'); });
}
async function init() {
  try {
    const response = await fetch('variants.json', { cache: 'no-cache' }); if (!response.ok) throw new Error();
    variants = await response.json(); if (!variants.length) throw new Error();
    const url = new URL(location.href);
    const variantId = url.searchParams.get('variant') || variants[0].id;
    await loadVariant(variantId);
    $('#scan').disabled = false;
    if (url.searchParams.has('id')) await selectCard(url.searchParams.get('id'), false);
    else if (cards.length) await selectCard(cards[0].id, false, false);
  } catch { message('Spiel konnte nicht geladen werden. Bitte Seite neu laden.'); }
}
init();
