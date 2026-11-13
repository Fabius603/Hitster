#!/usr/bin/env node
// Öffnet eine Seite in Brave (sonst Chrome/Edge), startet das Video, spult zu einer Zeitmarke und pausiert dort.
// Ohne Abhängigkeiten: steuert den Browser über das Chrome DevTools Protocol (Node >= 22).
//
//   node filmquiz-vorbereitung/spule-zu.mjs <URL> <h:mm:ss> [<Dauer>] [--browser <Pfad>] [--timeout <Sekunden>]
//        [--aufnahme <datei.mp3> [--dauer <Sekunden>]] [--tab-schliessen]
//
// Mit <Dauer> (Sekunden oder m:ss, z. B. 20 oder 1:30) wird das Video ab der Zeitmarke so lange abgespielt
// und danach wieder pausiert. Gemessen wird an der Videozeit, Pufferpausen verkürzen den Ausschnitt also nicht.
//
// Mit --aufnahme wird ab der Zeitmarke abgespielt und der Windows-Systemton (Loopback) für --dauer Sekunden
// (Standard 15) aufgenommen, danach pausiert und als MP3 gespeichert. Dafür wird die Recorder-CLI aus
// skills/hitster-filmkarten benötigt (.local/filmaufnahme/build/…/RecorderCli.dll).
//
// Der Browser bleibt danach offen. Er nutzt ein eigenes Profil (%LOCALAPPDATA%\hitster-spule-zu-<browser>),
// damit Anmeldungen zwischen den Läufen erhalten bleiben.

import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { Cdp } from './cdp-client.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RECORDER_DLL = join(REPO, '.local', 'filmaufnahme', 'build', 'bin', 'RecorderCli', 'release', 'RecorderCli.dll');

function usage(message) {
  if (message) console.error(`Fehler: ${message}\n`);
  console.error('Aufruf: node filmquiz-vorbereitung/spule-zu.mjs <URL> <h:mm:ss> [<Dauer>] [--browser <Pfad>] [--timeout <Sekunden>] [--aufnahme <datei.mp3> [--dauer <Sekunden>]] [--tab-schliessen]');
  process.exit(2);
}

// Langlebige Recorder-Session (JSON-Zeilen über stdin/stdout), siehe skills/hitster-filmkarten/references/aufnahme.md.
class Recorder {
  constructor() {
    if (!existsSync(RECORDER_DLL)) {
      throw new Error(`Recorder-CLI fehlt: ${RECORDER_DLL}\nEinmal bauen: powershell -File skills/hitster-filmkarten/scripts/recorder.ps1 -Project . -Command build`);
    }
    this.child = spawn('dotnet', [RECORDER_DLL, 'session', '--project', REPO], { stdio: ['pipe', 'pipe', 'inherit'] });
    this.replies = [];
    this.wake = null;
    let buffer = '';
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', (chunk) => {
      buffer += chunk;
      let i;
      while ((i = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, i).trim();
        buffer = buffer.slice(i + 1);
        try { if (line) this.replies.push(JSON.parse(line)); } catch { /* keine JSON-Zeile */ }
      }
      this.wake?.();
    });
    this.exited = new Promise((r) => this.child.on('exit', r));
    this.exited.then(() => this.wake?.());
  }
  send(message) {
    this.child.stdin.write(JSON.stringify(message) + '\n');
  }
  // Wartet auf die nächste Antwort mit einem der Status (oder "error").
  async waitFor(statuses, timeoutMs = 20000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const index = this.replies.findIndex((r) => statuses.includes(r.status) || r.status === 'error');
      if (index >= 0) {
        const [reply] = this.replies.splice(index, 1);
        if (reply.status === 'error') throw new Error(`Recorder: ${typeof reply.data === 'string' ? reply.data : JSON.stringify(reply.data)}`);
        return reply;
      }
      if (this.child.exitCode !== null) throw new Error('Recorder wurde unerwartet beendet.');
      if (Date.now() > deadline) throw new Error(`Recorder antwortet nicht (erwartet: ${statuses.join('/')}).`);
      await Promise.race([new Promise((r) => { this.wake = r; }), sleep(500)]);
    }
  }
  async quit() {
    if (this.child.exitCode !== null) return;
    try { this.send({ command: 'quit' }); } catch { /* bereits geschlossen */ }
    await Promise.race([this.exited, sleep(5000)]);
    if (this.child.exitCode === null) this.child.kill();
  }
}

function parseTime(text) {
  if (!/^\d+(:\d{1,2}){0,2}(\.\d+)?$/.test(text)) throw new Error(`Ungültige Zeitangabe: ${text}`);
  const parts = text.split(':').map(Number);
  if (parts.slice(1).some((p) => p >= 60)) throw new Error(`Ungültige Zeitangabe: ${text}`);
  return parts.reduce((sum, p) => sum * 60 + p, 0);
}

function formatTime(seconds) {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function findBrowser() {
  const roots = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean);
  // Reihenfolge = Vorrang: Brave zuerst.
  const candidates = roots.flatMap((root) => [
    join(root, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
    join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ]);
  candidates.push('/Applications/Brave Browser.app/Contents/MacOS/Brave Browser', '/usr/bin/brave-browser', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium');
  return candidates.find((p) => existsSync(p));
}

// Läuft im Browser in jedem Frame. Wählt das größte <video>, klickt sonst einen Play-Knopf.
const PAGE_HELPERS = String.raw`
window.__spuleZu ??= {
  // querySelectorAll, das auch in offene Shadow-Roots (Web-Component-Player) hineinsucht.
  deepAll(selector, root = document, out = []) {
    out.push(...root.querySelectorAll(selector));
    for (const el of root.querySelectorAll('*')) if (el.shadowRoot) this.deepAll(selector, el.shadowRoot, out);
    return out;
  },
  video() {
    const all = this.deepAll('video');
    const visible = all.filter((v) => v.getBoundingClientRect().width > 0);
    const list = visible.length ? visible : all;
    // Ein Video mit geladenen Daten schlägt Vorschau-Elemente, danach entscheidet die Größe.
    list.sort((a, b) => (b.readyState - a.readyState) || ((b.clientWidth * b.clientHeight) - (a.clientWidth * a.clientHeight)));
    return list[0] || null;
  },
  status() {
    const v = this.video();
    if (!v) return null;
    return { readyState: v.readyState, duration: v.duration, currentTime: v.currentTime, paused: v.paused, src: v.currentSrc || v.src };
  },
  visible(el) {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  },
  // iframes, die (noch) leer sind: kein src oder about:blank, z. B. <iframe class="provider-frame__iframe d-none" src="about:blank">.
  isEmptyFrame(f) {
    const src = (f.getAttribute('src') || '').trim();
    return !src || src === 'about:blank';
  },
  // Lädt nachgeladene ("lazy") Player-iframes: steht die echte Adresse in einem data-Attribut, wird sie gesetzt
  // und das iframe sichtbar gemacht. Liefert die Anzahl aktivierter iframes.
  activateLazyFrames() {
    let count = 0;
    for (const f of this.deepAll('iframe')) {
      if (this.isEmptyFrame(f)) {
        const attr = [...f.attributes].find((a) => a.name.startsWith('data-') && /^(https?:)?\/\//i.test(a.value.trim()));
        if (!attr) continue;
        f.src = attr.value.trim();
        count++;
      } else if (this.visible(f) || !/provider|player|video|embed|stream/i.test(String(f.className) + ' ' + String(f.parentElement?.className || ''))) continue;
      // Geladen, aber versteckt (d-none, hidden, display:none): einblenden, damit der Player läuft und klickbar ist.
      for (let el = f, i = 0; el && i < 4; el = el.parentElement, i++) {
        el.classList.remove('d-none', 'hidden', 'is-hidden');
        el.removeAttribute('hidden');
        if (getComputedStyle(el).display === 'none') el.style.setProperty('display', 'block', 'important');
      }
    }
    return count;
  },
  // Klickbare Auslöser rund um ein leeres iframe (Anbieter-Auswahl, "Inhalt laden", Datenschutz-Overlay …).
  lazyFrameTriggers() {
    const clickable = 'button, a, [role="button"], [onclick], [data-provider-frame-button], [data-provider], [class*="provider-frame__" i]';
    const words = /laden|load|abspielen|play|starten|anzeigen|show|akzeptieren|accept|zustimmen|erlauben|allow|weiter|stream/i;
    const out = [];
    for (const f of this.deepAll('iframe').filter((x) => this.isEmptyFrame(x))) {
      // Bis zu fünf Ebenen nach oben im Container des iframes suchen.
      for (let box = f.parentElement, i = 0; box && i < 5 && box !== document.body; box = box.parentElement, i++) {
        const cands = [...box.querySelectorAll(clickable)].filter((el) => el.tagName !== 'IFRAME' && !el.contains(f) && this.visible(el));
        if (!cands.length) continue;
        // Passende Beschriftung zuerst, sonst der erste sichtbare Auslöser.
        cands.sort((a, b) => Number(words.test(b.textContent + ' ' + (b.getAttribute('aria-label') || ''))) - Number(words.test(a.textContent + ' ' + (a.getAttribute('aria-label') || ''))));
        out.push(cands[0]);
        break;
      }
    }
    return out;
  },
  // Liefert die Bildschirmposition (CSS-Pixel im Frame) für einen echten Mausklick.
  //   mode 'buttons': sichtbarer Play-Knopf oder Auslöser eines nachgeladenen Player-iframes
  //   mode 'video':   Mitte des Videos
  //   mode 'frame':   Mitte des größten sichtbaren Player-iframes (Klick landet im eingebetteten Player)
  clickTarget(mode) {
    const center = (el, what) => {
      el.scrollIntoView({ block: 'center', inline: 'center' });
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, what };
    };
    if (mode === 'buttons') {
      const selectors = [
        '.vjs-big-play-button', '.jw-display-icon-display', '.jw-icon-playback', '.plyr__control--overlaid',
        '.ytp-large-play-button', '[data-plyr="play"]', 'button[aria-label*="play" i]', 'button[title*="play" i]',
        '[class*="play-button" i]', '[class*="playbutton" i]', '[class*="btn-play" i]',
      ];
      for (const sel of selectors) {
        const el = this.deepAll(sel).find((e) => this.visible(e));
        if (el) return center(el, sel);
      }
      const trigger = this.lazyFrameTriggers()[0];
      if (trigger) return center(trigger, 'Player-Auslöser "' + (trigger.textContent.trim().slice(0, 40) || trigger.className) + '"');
      return null;
    }
    if (mode === 'video') {
      const v = this.video();
      return v ? center(v, 'video') : null;
    }
    if (mode === 'frame') {
      const frames = this.deepAll('iframe').filter((f) => !this.isEmptyFrame(f) && f.clientWidth >= 200 && f.clientHeight >= 120);
      frames.sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight);
      return frames[0] ? center(frames[0], 'Player-iframe') : null;
    }
    return null;
  },
  async play() {
    const v = this.video();
    if (!v) return 'kein-video';
    // Manche Player setzen nur das src-Attribut und laden erst später: Laden anstoßen.
    if (v.networkState === HTMLMediaElement.NETWORK_EMPTY) v.load();
    // play() kann bei langsamen Quellen lange offen bleiben: nicht darauf warten.
    const tryPlay = () => Promise.race([v.play().then(() => 'ok'), new Promise((r) => setTimeout(() => r('ausstehend'), 3000))]);
    v.muted = false;
    try { return await tryPlay(); } catch (e) {
      v.muted = true;
      try { return (await tryPlay()) + '-stumm'; } catch (e2) { return 'fehler: ' + e2.message; }
    }
  },
  // Für die Aufnahme: mit Ton abspielen und warten, bis die Zeit tatsächlich läuft.
  async playAudible() {
    const v = this.video();
    if (!v) return { playing: false, error: 'kein-video' };
    const t0 = performance.now();
    const start = v.currentTime;
    v.muted = false;
    if (v.volume === 0) v.volume = 1;
    try { await Promise.race([v.play(), new Promise((r) => setTimeout(r, 5000))]); } catch (e) { return { playing: false, error: e.message }; }
    while (performance.now() - t0 < 8000 && (v.paused || v.currentTime <= start + 0.05)) await new Promise((r) => setTimeout(r, 50));
    return { playing: !v.paused && v.currentTime > start, muted: v.muted, delayMs: performance.now() - t0, error: v.paused ? 'pausiert' : 'Zeit läuft nicht' };
  },
  // Spielt ab der aktuellen Position "seconds" Sekunden Videozeit ab und pausiert dann.
  async playFor(seconds) {
    const v = this.video();
    if (!v) return { error: 'kein-video' };
    const start = v.currentTime;
    const end = Number.isFinite(v.duration) ? Math.min(start + seconds, v.duration) : start + seconds;
    v.muted = false;
    if (v.volume === 0) v.volume = 1;
    const tryPlay = () => Promise.race([v.play(), new Promise((r) => setTimeout(r, 5000))]);
    try { await tryPlay(); } catch {
      v.muted = true;
      try { await tryPlay(); } catch (e) { return { error: e.message }; }
    }
    // Notbremse, falls das Video hängen bleibt: höchstens dreifache Dauer + 30 s Wanduhrzeit.
    const wallLimit = performance.now() + (seconds * 3 + 30) * 1000;
    let timedOut = false;
    while (v.currentTime < end - 0.02 && !v.ended) {
      if (performance.now() > wallLimit) { timedOut = true; break; }
      // Manche Player pausieren beim Spulen selbst: Wiedergabe fortsetzen.
      if (v.paused) v.play().catch(() => {});
      const rest = (end - v.currentTime) / (v.playbackRate || 1);
      await new Promise((r) => setTimeout(r, rest > 0.5 ? Math.min(250, (rest - 0.3) * 1000) : 10));
    }
    v.pause();
    return { start, currentTime: v.currentTime, paused: v.paused, muted: v.muted, ended: v.ended, timedOut };
  },
  // Nimmt nur den Ton dieses Videos auf (captureStream + Web Audio), unabhängig vom Systemton.
  // Spielt ab der aktuellen Position "seconds" Sekunden ab, pausiert und liefert eine WAV (Base64).
  // mute: Lautsprecher stumm lassen (nur sinnvoll, wenn der Mitschnitt davon unberührt bleibt).
  async recordVideoAudio(seconds, mute) {
    const v = this.video();
    if (!v) return { error: 'kein-video' };
    const capture = v.captureStream || v.mozCaptureStream;
    if (!capture) return { error: 'captureStream wird nicht unterstützt' };
    let stream;
    try { stream = capture.call(v); } catch (e) { return { error: 'captureStream: ' + e.message }; }
    const ctx = new AudioContext();
    try { await ctx.resume(); } catch { /* läuft ggf. erst nach play() */ }
    const rate = ctx.sampleRate, maxFrames = Math.ceil(seconds * rate);
    const chunks = [[], []];
    let active = false, frames = 0, source = null;
    const proc = ctx.createScriptProcessor(4096, 2, 2);
    proc.onaudioprocess = (e) => {
      if (!active || frames >= maxFrames) return;
      const n = Math.min(e.inputBuffer.length, maxFrames - frames);
      for (let c = 0; c < 2; c++) chunks[c].push(e.inputBuffer.getChannelData(Math.min(c, e.inputBuffer.numberOfChannels - 1)).slice(0, n));
      frames += n;
    };
    const attach = () => {
      const track = stream.getAudioTracks()[0];
      if (track && !source) { source = ctx.createMediaStreamSource(new MediaStream([track])); source.connect(proc); }
    };
    attach();
    stream.addEventListener('addtrack', attach);
    proc.connect(ctx.destination); // gibt Stille aus, nötig damit onaudioprocess läuft
    const start = v.currentTime;
    v.muted = !!mute;
    if (v.volume === 0) v.volume = 1;
    try { await Promise.race([v.play(), new Promise((r) => setTimeout(r, 5000))]); } catch (e) { ctx.close(); return { error: 'play: ' + e.message }; }
    await ctx.resume().catch(() => {});
    const t0 = performance.now();
    while (performance.now() - t0 < 8000 && (v.paused || v.currentTime <= start + 0.02)) await new Promise((r) => setTimeout(r, 10));
    if (v.paused || v.currentTime <= start) { v.pause(); ctx.close(); return { error: 'Wiedergabe startet nicht' }; }
    attach();
    active = true;
    const wallLimit = performance.now() + (seconds * 3 + 30) * 1000;
    let timedOut = false, lastVideoTime = v.currentTime, lastProgress = performance.now();
    while (frames < maxFrames && !v.ended) {
      if (v.error || performance.now() > wallLimit) { timedOut = true; break; }
      if (v.currentTime > lastVideoTime + 0.02) { lastVideoTime = v.currentTime; lastProgress = performance.now(); }
      if (performance.now() - lastProgress > 12000) { timedOut = true; break; }
      if (v.paused) v.play().catch(() => {});
      await new Promise((r) => setTimeout(r, 50));
    }
    active = false;
    v.pause();
    stream.getTracks().forEach((t) => t.stop());
    await ctx.close().catch(() => {});
    if (timedOut) return { error: 'Videowiedergabe hängt oder liefert keine Daten' };
    if (v.currentTime - start < seconds - 1) return { error: 'Video wurde nicht vollständig abgespielt' };
    if (!source) return { error: 'Video-Stream enthält keine Tonspur' };
    // 16-Bit-PCM-WAV, Stereo
    const pcm = new DataView(new ArrayBuffer(44 + frames * 4));
    const str = (o, s) => { for (let i = 0; i < s.length; i++) pcm.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); pcm.setUint32(4, 36 + frames * 4, true); str(8, 'WAVEfmt '); pcm.setUint32(16, 16, true);
    pcm.setUint16(20, 1, true); pcm.setUint16(22, 2, true); pcm.setUint32(24, rate, true); pcm.setUint32(28, rate * 4, true);
    pcm.setUint16(32, 4, true); pcm.setUint16(34, 16, true); str(36, 'data'); pcm.setUint32(40, frames * 4, true);
    let peak = 0;
    for (let c = 0; c < 2; c++) {
      let i = 0;
      for (const chunk of chunks[c]) for (const s of chunk) {
        const x = Math.max(-1, Math.min(1, s));
        peak = Math.max(peak, Math.abs(x));
        pcm.setInt16(44 + i++ * 4 + c * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true);
      }
    }
    const wav = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(new Blob([pcm.buffer], { type: 'audio/wav' })); });
    return { wav, peak, seconds: frames / rate, rate, start, currentTime: v.currentTime, ended: v.ended, timedOut, muted: v.muted };
  },
  async seekAndPause(target) {
    const v = this.video();
    if (!v) return { error: 'kein-video' };
    if (Number.isFinite(v.duration) && target > v.duration) return { error: 'zu-lang', duration: v.duration };
    const seeked = new Promise((r) => { v.addEventListener('seeked', r, { once: true }); setTimeout(r, 15000); });
    v.currentTime = target;
    await seeked;
    v.pause();
    // Manche Player setzen die Wiedergabe nach dem Spulen fort: kurz warten und erneut pausieren.
    await new Promise((r) => setTimeout(r, 1500));
    if (!v.paused) v.pause();
    if (Math.abs(v.currentTime - target) > 2) {
      const again = new Promise((r) => { v.addEventListener('seeked', r, { once: true }); setTimeout(r, 15000); });
      v.currentTime = target;
      await again;
      v.pause();
    }
    return { currentTime: v.currentTime, paused: v.paused, duration: v.duration };
  },
};
true;
`;

async function main() {
  const args = process.argv.slice(2);
  const positional = [];
  let browserPath;
  let timeoutSec = 120;
  let recordTo;
  let recordSec = 15;
  let closeTab = false;
  let recordSource = 'video';
  let muteSpeakers = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--browser') browserPath = args[++i];
    else if (args[i] === '--timeout') timeoutSec = Number(args[++i]);
    else if (args[i] === '--aufnahme') recordTo = resolve(args[++i] ?? '');
    else if (args[i] === '--dauer') recordSec = Number(args[++i]);
    else if (args[i] === '--tab-schliessen') closeTab = true;
    else if (args[i] === '--quelle') recordSource = args[++i];
    else if (args[i] === '--stumm') muteSpeakers = true;
    else if (args[i] === '-h' || args[i] === '--help') usage();
    else positional.push(args[i]);
  }
  if (positional.length < 2 || positional.length > 3) usage('URL und Zeitmarke angeben (optional danach die Dauer).');
  const [url, timeText, durationText] = positional;
  if (!/^https?:\/\//i.test(url)) usage('Die URL muss mit http:// oder https:// beginnen.');
  let target;
  try { target = parseTime(timeText); } catch (e) { usage(e.message); }
  let playSec;
  if (durationText !== undefined) {
    try { playSec = parseTime(durationText); } catch { usage(`Ungültige Dauer: ${durationText}`); }
    if (!(playSec > 0)) usage('Die Dauer muss größer als 0 sein.');
    // Bei einer Aufnahme ist die Dauer die Aufnahmelänge (--dauer bleibt als ältere Schreibweise erhalten).
    if (recordTo) {
      if (args.includes('--dauer') && recordSec !== playSec) usage('Dauer doppelt und widersprüchlich angegeben (<Dauer> und --dauer).');
      recordSec = playSec;
    }
  }
  if (recordTo) {
    if (!/\.mp3$/i.test(recordTo)) usage('--aufnahme braucht eine .mp3-Datei.');
    if (existsSync(recordTo)) usage(`${recordTo} existiert bereits.`);
    if (!(recordSec > 1 && recordSec <= 300)) usage('--dauer muss zwischen 1 und 300 Sekunden liegen.');
    if (!['video', 'system'].includes(recordSource)) usage('--quelle muss video oder system sein.');
    if (muteSpeakers && recordSource !== 'video') usage('--stumm geht nur mit --quelle video.');
    if (!existsSync(RECORDER_DLL)) usage(`Recorder-CLI fehlt: ${RECORDER_DLL}\nEinmal bauen: powershell -File skills/hitster-filmkarten/scripts/recorder.ps1 -Project . -Command build`);
  }

  browserPath ??= findBrowser();
  if (!browserPath || !existsSync(browserPath)) usage('Kein Brave/Chrome/Edge gefunden. Pfad mit --browser angeben.');

  const profile = join(process.env.LOCALAPPDATA || process.env.HOME || '.', `hitster-spule-zu-${basename(browserPath).replace(/\.exe$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`);
  mkdirSync(profile, { recursive: true });
  const portFile = join(profile, 'DevToolsActivePort');
  const readPort = () => (existsSync(portFile) ? readFileSync(portFile, 'utf8').split('\n')[0].trim() : null);
  const reachable = async (p) => {
    try { return (await fetch(`http://127.0.0.1:${p}/json/version`, { signal: AbortSignal.timeout(4000) })).ok; } catch { return false; }
  };
  // Prozesse des Browsers, die genau dieses (eigene) Profil nutzen – nie das normale Browserprofil.
  const profilePids = () => {
    try {
      if (process.platform === 'win32') {
        const ps = `Get-CimInstance Win32_Process -Filter "Name='${basename(browserPath)}'" | Where-Object { $_.CommandLine -like '*${basename(profile)}*' -and $_.CommandLine -notlike '*--type=*' } | ForEach-Object { $_.ProcessId }`;
        return execFileSync('powershell.exe', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).split(/\s+/).filter(Boolean).map(Number);
      }
      return execFileSync('ps', ['-eo', 'pid=,args='], { encoding: 'utf8' }).split('\n')
        .filter((l) => l.includes(profile) && !l.includes('--type=')).map((l) => Number(l.trim().split(/\s+/)[0]));
    } catch { return []; }
  };

  // Läuft der Browser mit diesem Profil schon (z. B. vom letzten Aufruf), wird er wiederverwendet.
  let port = readPort();
  let pageTarget;
  // Parallele Aufrufe: nur einer startet den Browser, die anderen warten auf dessen DevTools-Port.
  const lockFile = join(profile, 'spule-zu-start.lock');
  let ownsLock = false;
  if (!(port && await reachable(port))) {
    // Bis zu 60 s auf einen Start durch einen anderen Lauf warten (dessen Sperre ist höchstens 45 s gültig).
    for (let i = 0; i < 300; i++) {
      try { writeFileSync(lockFile, String(process.pid), { flag: 'wx' }); ownsLock = true; break; } catch { /* anderer Start läuft */ }
      try { if (Date.now() - statSync(lockFile).mtimeMs > 45000) { rmSync(lockFile, { force: true }); continue; } } catch { /* weg */ }
      await sleep(200);
      port = readPort();
      if (port && await reachable(port)) break;
    }
    if (ownsLock) {
      port = readPort();
      if (port && await reachable(port)) { rmSync(lockFile, { force: true }); ownsLock = false; }
    } else if (!(port && await reachable(port))) {
      throw Object.assign(new Error('Ein anderer Lauf startet den Browser, aber er wurde nicht rechtzeitig bereit.'), { browserStart: true });
    }
  }
  if (ownsLock) {
    // Läuft das Aufnahmeprofil noch, ohne dass DevTools antwortet (hängende oder halb beendete Instanz),
    // würde ein neuer Start nur an diese Instanz übergeben und nie einen Port öffnen: alte Instanz beenden.
    const stale = profilePids();
    if (stale.length) {
      console.log(`Aufnahme-Browser antwortet nicht – beende alte Instanz (PID ${stale.join(', ')}) …`);
      for (const pid of stale) { try { process.kill(pid); } catch { /* schon beendet */ } }
      for (let i = 0; i < 50 && profilePids().length; i++) await sleep(200);
      if (profilePids().length) {
        rmSync(lockFile, { force: true });
        throw Object.assign(new Error(`Alte Browser-Instanz mit dem Profil ${profile} lässt sich nicht beenden. Bitte dieses Brave-Fenster schließen.`), { browserStart: true });
      }
    }
  }
  if (!ownsLock && port && await reachable(port)) {
    console.log('Nutze bereits geöffneten Browser, neues Fenster …');
    // Eigenes Fenster statt Hintergrund-Tab: manche Player laden in verborgenen Tabs keine Videodaten.
    const { webSocketDebuggerUrl } = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    const browserCdp = new Cdp(webSocketDebuggerUrl);
    await browserCdp.open();
    let targetId;
    try { ({ targetId } = await browserCdp.send('Target.createTarget', { url: 'about:blank', newWindow: true })); } finally { browserCdp.close(); }
    pageTarget = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.id === targetId);
  } else {
    rmSync(portFile, { force: true });
    console.log(`Starte ${browserPath}`);
    const child = spawn(browserPath, [
      `--user-data-dir=${profile}`,
      '--remote-debugging-port=0',
      '--autoplay-policy=no-user-gesture-required',
      // Verborgene Fenster/Tabs sollen Medien trotzdem laden und abspielen.
      '--disable-background-media-suspend',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--disable-background-timer-throttling',
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank',
    ], { detached: true, stdio: 'ignore' });
    child.unref();

    port = null;
    for (let i = 0; i < 100 && !port; i++) {
      await sleep(200);
      port = readPort();
    }
    rmSync(lockFile, { force: true });
    if (!port) throw Object.assign(new Error('Browser hat keinen DevTools-Port geöffnet. Bitte alle Fenster dieses Browserprofils schließen und erneut versuchen.'), { browserStart: true });
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    pageTarget = targets.find((t) => t.type === 'page');
  }
  if (!pageTarget) throw new Error('Kein Browser-Tab gefunden.');
  const cdp = new Cdp(pageTarget.webSocketDebuggerUrl);
  await cdp.open();
  try {

  // Frames anderer Herkunft (eingebettete Player) als eigene Sitzungen anhängen.
  const frameSessions = new Set();
  cdp.on((msg) => {
    if (msg.method === 'Target.attachedToTarget' && msg.params.targetInfo.type === 'iframe') {
      const sid = msg.params.sessionId;
      frameSessions.add(sid);
      cdp.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true }, sid).catch(() => {});
    } else if (msg.method === 'Target.detachedFromTarget') {
      frameSessions.delete(msg.params.sessionId);
    }
  });
  await cdp.send('Page.enable');
  await cdp.send('Page.bringToFront');
  await cdp.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });

  process.send?.({type:'recording-target',port,targetId:pageTarget.id});
  console.log(`Öffne ${url}`);
  const loaded = new Promise((resolve) => cdp.on((m) => { if (m.method === 'Page.loadEventFired' && !m.sessionId) resolve(); }));
  await cdp.send('Page.navigate', { url });
  await Promise.race([loaded, sleep(30000)]);

  // Wertet Code im Hauptdokument, in gleichartigen iframes und in angehängten Frames aus.
  async function evalIn(sessionId, expression, timeoutMs = 15000) {
    await cdp.send('Runtime.evaluate', { expression: PAGE_HELPERS }, sessionId);
    const res = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true }, sessionId, timeoutMs);
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text || 'Player-Skript fehlgeschlagen.');
    return res.result?.value;
  }
  // Echter Mausklick (vertrauenswürdiges Ereignis, das Player-Overlays akzeptieren).
  async function realClick(sessionId, x, y) {
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
      await cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }, sessionId);
    }
  }
  const contexts = () => [undefined, ...frameSessions];

  // Bestes Video über alle Frames: geladene Videos zuerst.
  async function findVideoContext() {
    let best = null;
    for (const sid of contexts()) {
      try {
        const status = await evalIn(sid, 'window.__spuleZu.status()');
        if (status && (!best || status.readyState > best.status.readyState)) best = { sid, status };
      } catch { /* Frame inzwischen weg */ }
    }
    return best;
  }
  const isReady = (s) => s?.readyState >= 1 && Number.isFinite(s.duration) && s.duration > 0;

  // Schleife: Video suchen, Wiedergabe anstoßen, bei Stillstand Play-Knopf bzw. Video anklicken.
  const deadline = Date.now() + timeoutSec * 1000;
  let found = null;
  let lastPlay = 0;
  let lastKick = Date.now();
  let announced = false;
  while (Date.now() < deadline) {
    // Leere Player-iframes (src="about:blank" + Adresse in data-Attribut) laden.
    for (const sid of contexts()) {
      try {
        const n = await evalIn(sid, 'window.__spuleZu.activateLazyFrames()');
        if (n) console.log(`Nachgeladenen Player aktiviert (${n} iframe${n > 1 ? 's' : ''}).`);
      } catch { /* Frame inzwischen weg */ }
    }
    found = await findVideoContext();
    if (isReady(found?.status)) break;
    // Filmo ohne eingebetteten Player (z. B. nur Anbieter „Byse“): nur ein Link auf eine externe Seite.
    if (!found) {
      const check = `(() => { const docs = [document]; for (const f of window.__spuleZu.deepAll('iframe')) { try { if (f.contentDocument) docs.push(f.contentDocument); } catch {} }
        return docs.some((d) => /auf einer externen Seite gehostet|hosted on an external (site|page)/i.test(d.body?.innerText || '')); })()`;
      let external = false;
      for (const sid of contexts()) external ||= await evalIn(sid, check).catch(() => false);
      if (external) throw Object.assign(new Error('Kein eingebetteter Player – das Video liegt nur auf einer externen Seite.'), { noPlayer: true });
    }
    if (found && Date.now() - lastPlay > 5000) {
      if (!announced) { console.log('Video gefunden, starte Wiedergabe …'); announced = true; }
      const playResult = await evalIn(found.sid, 'window.__spuleZu.play()');
      if (String(playResult).startsWith('fehler')) console.warn(`Wiedergabe-Start: ${playResult}`);
      lastPlay = Date.now();
    }
    // Viele Player erzeugen bzw. laden das echte <video> erst nach einem Klick.
    if (Date.now() - lastKick > (found ? 6000 : 2000)) {
      // Erst Knöpfe/Auslöser in allen Frames, dann das Video bzw. – ohne Video – das Player-iframe selbst.
      const modes = ['buttons', found ? 'video' : 'frame'];
      clicking: for (const mode of modes) {
        for (const sid of contexts()) {
          try {
            const expr = `window.__spuleZu.clickTarget(${JSON.stringify(mode)})`;
            if (await evalIn(sid, expr)) {
              await sleep(300); // Position nach scrollIntoView neu bestimmen
              const pos = await evalIn(sid, expr);
              if (!pos) continue;
              await realClick(sid, pos.x, pos.y);
              console.log(`Geklickt: ${pos.what}`);
              break clicking;
            }
          } catch { /* ignorieren */ }
        }
      }
      lastKick = Date.now();
      lastPlay = 0;
    }
    await sleep(700);
  }
  if (!found) throw new Error(`Kein <video> innerhalb von ${timeoutSec} s gefunden.`);
  if (!isReady(found.status)) throw new Error('Videolänge nicht ermittelbar (Metadaten nicht geladen).');
  // Erst jetzt sicher abspielen, falls der Klick ein neues Video erzeugt hat.
  await evalIn(found.sid, 'window.__spuleZu.play()');
  console.log(`Länge: ${formatTime(found.status.duration)}, spule zu ${formatTime(target)} …`);

  const result = await evalIn(found.sid, `window.__spuleZu.seekAndPause(${target})`, 40000);
  if (result?.error === 'zu-lang') throw new Error(`Zeitmarke ${formatTime(target)} liegt hinter dem Ende (${formatTime(result.duration)}).`);
  if (result?.error) throw new Error(result.error);

  const offBy = Math.abs(result.currentTime - target);
  console.log(`Fertig: ${formatTime(result.currentTime)} (${result.currentTime.toFixed(2)} s), ${result.paused ? 'pausiert' : 'NICHT pausiert'}.`);
  if (offBy > 2 || !result.paused) {
    if (recordTo) throw new Error('Zeitmarke nicht sicher erreicht – keine Aufnahme.');
    if (playSec) throw new Error('Zeitmarke nicht sicher erreicht – keine Wiedergabe.');
    process.exitCode = 1;
  }
  if (recordTo) await (recordSource === 'video' ? recordVideo(found.sid) : record(found.sid));
  else if (playSec) await playFor(found.sid);

  // Nimmt nur den Ton des Videos auf (kein Systemton) – mehrere Läufe können parallel laufen.
  async function recordVideo(sid) {
    console.log(`Aufnahme des Videotons läuft (${recordSec} s${muteSpeakers ? ', Lautsprecher stumm' : ''}) …`);
    const r = await evalIn(sid, `window.__spuleZu.recordVideoAudio(${recordSec}, ${muteSpeakers})`, (recordSec * 3 + 45) * 1000);
    if (!r) throw new Error('Videoton-Aufnahme lieferte kein Ergebnis.');
    if (r.error) throw new Error(`Videoton-Aufnahme: ${r.error}`);
    if (!(r.peak > 0.001)) throw new Error(`Aufnahme ist stumm (Spitze ${r.peak?.toFixed(4)}) – Player gibt den Ton evtl. nicht frei (Kopierschutz?).`);
    if (r.timedOut) console.warn('Video blieb hängen – Aufnahme nach Zeitlimit beendet.');
    if (r.ended && r.seconds < recordSec - 0.1) console.warn('Videoende erreicht, bevor die Dauer abgelaufen war.');
    const wav = join(REPO, '.local', 'filmaufnahme', 'raw', `${basename(recordTo, '.mp3')}-${Date.now()}.wav`);
    mkdirSync(dirname(wav), { recursive: true });
    writeFileSync(wav, Buffer.from(r.wav, 'base64'));
    const length = Math.floor(r.seconds * 10) / 10;
    mkdirSync(dirname(recordTo), { recursive: true });
    execFileSync('dotnet', [RECORDER_DLL, 'cut', '--file', wav, '--start', '0', '--length', String(length), '--out', recordTo], { stdio: ['ignore', 'ignore', 'inherit'] });
    console.log(`MP3: ${recordTo} (${length.toFixed(1)} s, Spitze ${r.peak.toFixed(2)})`);
  }

  // Spielt ab der Zeitmarke für die angegebene Dauer ab und pausiert dann.
  async function playFor(sid) {
    console.log(`Spiele ${playSec} s ab …`);
    const played = await evalIn(sid, `window.__spuleZu.playFor(${playSec})`, (playSec * 3 + 45) * 1000);
    if (played?.error) throw new Error(`Wiedergabe: ${played.error}`);
    if (played.muted) console.warn('Hinweis: Video lief stumm (Browser hat Ton blockiert).');
    const actual = played.currentTime - played.start;
    console.log(`Gestoppt bei ${formatTime(played.currentTime)} (${played.currentTime.toFixed(2)} s), abgespielt: ${actual.toFixed(2)} s${played.paused ? '' : ', NICHT pausiert'}.`);
    if (played.timedOut) { console.warn('Video blieb hängen – Wiedergabe nach Zeitlimit abgebrochen.'); process.exitCode = 1; }
    else if (played.ended && actual < playSec - 0.1) console.warn('Videoende erreicht, bevor die Dauer abgelaufen war.');
  }

  // Spielt ab der Zeitmarke ab, nimmt den Systemton auf und speichert ihn als MP3.
  async function record(sid) {
    const wav = join(REPO, '.local', 'filmaufnahme', 'raw', `${basename(recordTo, '.mp3')}-${Date.now()}.wav`);
    const recorder = new Recorder();
    try {
      await recorder.waitFor(['ready']);
      recorder.send({ command: 'start', out: wav, seconds: recordSec + 10, requestId: 'start' });
      await recorder.waitFor(['recording']);
      const started = await evalIn(sid, 'window.__spuleZu.playAudible()');
      if (!started?.playing) throw new Error(`Wiedergabe startet nicht (${started?.error || 'unbekannt'}).`);
      if (started.muted) throw new Error('Video läuft nur stumm – Aufnahme abgebrochen.');
      console.log(`Aufnahme läuft (${recordSec} s) …`);
      await sleep(recordSec * 1000);
      await evalIn(sid, 'window.__spuleZu.video()?.pause()');
      recorder.send({ command: 'stop', requestId: 'stop' });
      const { data } = await recorder.waitFor(['recorded']);
      if (!(data?.Peak > 0.001)) throw new Error('Aufnahme ist stumm (Systemton/Ausgabegerät prüfen).');
      // Etwas Vorlauf (Aufnahme lief schon vor dem Play) abschneiden.
      const lead = Math.min(Math.max(0, (started.delayMs ?? 0) / 1000), 2);
      const length = Math.floor(Math.min(recordSec, data.Duration - lead - 0.05) * 10) / 10;
      mkdirSync(dirname(recordTo), { recursive: true });
      execFileSync('dotnet', [RECORDER_DLL, 'cut', '--file', wav, '--start', lead.toFixed(2), '--length', String(length), '--out', recordTo], { stdio: ['ignore', 'ignore', 'inherit'] });
      console.log(`MP3: ${recordTo} (${length.toFixed(1)} s)`);
    } finally {
      await recorder.quit();
    }
  }
  } finally {
    // Tab dieses Laufs schließen; der letzte Tab wird nur geleert, damit der Browser offen bleibt.
    if (closeTab) {
      try {
        const pages = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).filter((t) => t.type === 'page');
        if (pages.length > 1) await fetch(`http://127.0.0.1:${port}/json/close/${pageTarget.id}`);
        else await cdp.send('Page.navigate', { url: 'about:blank' });
      } catch { /* Tab bereits weg */ }
    }
    cdp.close();
  }
}

// Exit 3: Browser nicht verfügbar – ein Stapel (karten-aus-tabelle) bricht dann ab, statt jeden Eintrag scheitern zu lassen.
// Exit 4: Seite hat keinen eingebetteten Player – der Stapel überspringt den Film.
main().catch((e) => { console.error(`${e.noPlayer ? 'Übersprungen' : 'Fehler'}: ${e.message}`); process.exit(e.browserStart ? 3 : e.noPlayer ? 4 : 1); });
