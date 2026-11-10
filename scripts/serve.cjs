'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.wav': 'audio/wav',
  '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.webm': 'video/webm',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};
const publicFiles = new Set(['index.html', 'cards.html', 'style.css', 'cards.css', 'player.js', 'cards.js', 'duplex.js', 'variants.json']);

function resolvePublicPath(url) {
  const pathname = decodeURIComponent(new URL(url, 'http://localhost').pathname);
  const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
  if (relative.includes('\\') || relative.split('/').some(part => part.startsWith('.'))) return null;
  if (!publicFiles.has(relative) && !relative.startsWith('variants/') && !relative.startsWith('vendor/')) return null;
  if (!types[path.extname(relative).toLowerCase()]) return null;
  const file = path.resolve(root, relative);
  return file.startsWith(root + path.sep) ? file : null;
}

function createServer() {
  return http.createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, { Allow: 'GET, HEAD' }).end(); return; }
    try {
      const file = resolvePublicPath(request.url);
      if (!file) { response.writeHead(404).end('Nicht gefunden'); return; }
      const real = await fs.realpath(file);
      if (!real.startsWith(root + path.sep)) { response.writeHead(404).end(); return; }
      const data = await fs.readFile(real);
      response.writeHead(200, { 'Content-Type': types[path.extname(file).toLowerCase()], 'Content-Length': data.length });
      response.end(request.method === 'HEAD' ? undefined : data);
    } catch (error) {
      response.writeHead(error instanceof URIError ? 400 : 404).end('Datei nicht verfügbar');
    }
  });
}

if (require.main === module) {
  const server = createServer();
  let port = 8765;
  server.on('error', error => {
    if (error.code === 'EADDRINUSE' && port < 8775) { server.listen(++port, '127.0.0.1'); return; }
    console.error('Der lokale Server konnte nicht gestartet werden:', error.message); process.exitCode = 1;
  });
  server.on('listening', () => {
    const url = `http://127.0.0.1:${port}/cards.html?variant=film`;
    console.log(`Hitster-Karten: ${url}\nDieses Fenster während des Druckens geöffnet lassen. Beenden mit Strg+C.`);
    if (process.argv.includes('--open-cards') && process.platform === 'win32') {
      const browser = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Start-Process '${url}'`], { windowsHide: true, stdio: 'ignore' });
      browser.on('error', () => console.error('Browser bitte über die oben angezeigte Adresse öffnen.'));
    }
  });
  server.listen(port, '127.0.0.1');
}
module.exports = { createServer, resolvePublicPath };
