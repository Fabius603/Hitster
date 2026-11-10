import fs from 'node:fs/promises';
const root=new URL('./',import.meta.url);
const films=JSON.parse(await fs.readFile(new URL('recherche-150.json',root),'utf8'));
if(films.length!==150||new Set(films.map(f=>f.title+'|'+f.year)).size!==150)throw Error('150 unterschiedliche Filme erforderlich.');
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const link=url=>`<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(url)}</a>`;
const duration=f=>f.clipStart!=null&&f.clipEnd!=null?(f.clipEnd-f.clipStart).toFixed(1).replace('.',',')+' s':'';
const rows=films.map(f=>`<tr data-id="${f.id}"><td class="film">${escape(f.title)}</td><td class="year">${f.year}</td><td class="scene">${escape(f.scene)}</td><td class="time">${escape(f.timestamp||'')}</td><td class="duration">${duration(f)}</td><td class="clip">${link(f.clipUrl||f.searchUrl)}</td><td class="filmo">${f.filmoUrl?link(f.filmoUrl):''}</td></tr>`).join('\n');
const html=`<!doctype html>
<html lang="de"><head><meta charset="utf-8"><title>150 Filme</title>
<style>body{font:14px system-ui,sans-serif;margin:16px}table{border-collapse:collapse}th,td{border:1px solid #ccc;padding:4px 8px;text-align:left;vertical-align:top}th{background:#eee}</style>
</head><body>
<table><thead><tr><th>Titel</th><th>Erscheinungsjahr</th><th>Szene</th><th>Zeitpunkt im Film</th><th>Dauer der Szene</th><th>Clip-Link</th><th>Filmo-Link</th></tr></thead><tbody>
${rows}
</tbody></table>
</body></html>
`;
await fs.writeFile(new URL('filme-150.html',root),html);
console.log(`HTML erstellt: ${films.length} Filme.`);
