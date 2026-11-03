'use strict';
const audio = document.querySelector('#audio');
const status = document.querySelector('#status');
const scanButton = document.querySelector('#scan');
let sounds = [], scanner = null, scanning = false, busy = false, selection = 0;
function message(text) { status.textContent = text; }
async function selectCard(id, updateUrl = true) {
  const item = sounds.find(sound => sound.id === id);
  if (!item) { message('Diese Karte ist unbekannt. Bitte scanne eine gültige Karte.'); return; }
  const ticket = ++selection;
  audio.pause(); audio.src = item.file; audio.hidden = false;
  document.querySelector('#card').textContent = `Karte ${item.id}`;
  if (updateUrl) { const url = new URL(location.href); url.searchParams.set('id', id); history.replaceState(null, '', url); }
  message('Sound wird geladen …');
  try { await audio.play(); if (ticket === selection) message('Film ab! Welcher Film könnte das sein?'); }
  catch (error) { if (ticket === selection) message(error.name === 'NotAllowedError' ? 'Tippe im Player auf ▶, um den Sound zu starten.' : 'Wiedergabe nicht möglich. Versuche es über den Player erneut.'); }
}
async function stopScanner() {
  if (scanner && scanning) { await scanner.stop(); scanning = false; scanner.clear(); }
  document.querySelector('#scanner-panel').hidden = true;
}
async function onScan(value) {
  if (busy) return;
  let id;
  try {
    const url = new URL(value);
    if (url.origin !== location.origin || url.pathname !== location.pathname) throw new Error();
    id = url.searchParams.get('id');
    if (!sounds.some(sound => sound.id === id)) throw new Error();
  } catch { message('Dieser QR-Code gehört nicht zu diesem Spiel.'); return; }
  busy = true;
  try { await stopScanner(); await selectCard(id); }
  catch { message('Die Kamera konnte nicht geschlossen werden. Bitte versuche es erneut.'); }
  finally { busy = false; }
}
scanButton.addEventListener('click', async () => {
  if (scanning || busy) return;
  if (!window.Html5Qrcode) { message('Der QR-Scanner konnte nicht geladen werden. Nutze die Kartennummer.'); return; }
  audio.pause(); scanButton.disabled = true;
  document.querySelector('#scanner-panel').hidden = false;
  try {
    scanner ||= new Html5Qrcode('reader');
    await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 220, height: 220 } }, onScan, () => {});
    scanning = true; message('Halte den QR-Code vor die Kamera.');
  } catch { document.querySelector('#scanner-panel').hidden = true; message('Kein Kamerazugriff. Erlaube die Kamera im Browser oder gib die Kartennummer unten ein.'); }
  finally { scanButton.disabled = false; }
});
document.querySelector('#cancel').addEventListener('click', async () => { try { await stopScanner(); message('Scanner geschlossen.'); } catch { message('Kamera konnte nicht beendet werden. Lade die Seite neu.'); } });
document.querySelector('#manual').addEventListener('submit', event => { event.preventDefault(); selectCard(document.querySelector('#card-id').value.trim().padStart(3, '0')); });
audio.addEventListener('error', () => message('Die Audiodatei konnte nicht geladen werden. Prüfe die Verbindung und die Datei.'));
audio.addEventListener('ended', () => message('Bereit? Scanne die nächste Karte oder spiele den Sound noch einmal ab.'));
async function init() {
  scanButton.disabled = true;
  try {
    const response = await fetch('sounds.json'); if (!response.ok) throw new Error();
    sounds = await response.json();
    for (const item of sounds.slice(0, 4)) {
      const button = document.createElement('button'); button.textContent = `Demo ${item.id}`;
      button.addEventListener('click', () => selectCard(item.id)); document.querySelector('#demos').append(button);
    }
    const id = new URL(location.href).searchParams.get('id'); if (id) await selectCard(id, false);
    scanButton.disabled = false;
  } catch { message('Die Kartenliste konnte nicht geladen werden. Bitte lade die Seite erneut.'); }
}
init();
