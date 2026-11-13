import fs from 'node:fs/promises';
import {scanCards, uniqueFilms} from './kartenstatus.mjs';
const root=new URL('./',import.meta.url);
async function writeOutput(file,data){const temp=new URL(file.href+'.'+process.pid+'.tmp');await fs.writeFile(temp,data);await fs.rename(temp,file);}
const films=JSON.parse(await fs.readFile(new URL('filme-version-2.json',root),'utf8'));
if(films.some(film=>!Number.isSafeInteger(film.id)||film.id<1)||
   new Set(films.map(film=>film.id)).size!==films.length||
   uniqueFilms(structuredClone(films)).length!==films.length) {
  throw Error('Version 2 erfordert eindeutige Filme und positive, eindeutige IDs.');
}
const cards=JSON.parse(await fs.readFile(new URL('../variants/film/cards.json',root),'utf8'));
const versionKeys=new Set(JSON.parse(await fs.readFile(new URL('../variants/film/version-1.json',root),'utf8')));
const versionCards=cards.filter(card=>versionKeys.has(card.key));
if(versionCards.length!==versionKeys.size)throw Error('Nicht alle Karten der Version 1 wurden im Kartenkatalog gefunden.');
if(scanCards(films,versionCards).some(({card})=>card))throw Error('Ein Film aus Version 2 hat bereits eine Karte in Version 1.');

async function buildList(films, file, title, statusFile, otherLink) {
const scan=scanCards(films,cards);
const states=new Map(scan.map(s=>[s.film.id,s]));
const scannedAt=new Date().toISOString();
const counts={vorhanden:scan.filter(s=>s.card).length,offen:scan.filter(s=>s.status==='offen').length,ohneLink:scan.filter(s=>s.status==='kein Filmlink').length};
const total=films.length;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const link=(url,label)=>`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;
const offset=s=>s.toFixed(3).replace('.',',')+' s';
const rows=films.map(f=>`<tr data-id="${f.id}" data-year="${f.year}" data-card-status="${states.get(f.id).status}" data-recording-time="${f.timestamp}${f.clipStart!=null?(f.clipStart%1).toFixed(3).slice(1):''}" data-recording-duration="${f.durationSeconds}" data-title-aliases="${esc(JSON.stringify([f.filmoTitle||f.title,f.movieUrl?new URL(f.movieUrl).pathname.split('/').filter(Boolean)[0].replace(/-\d{4}$/,'').replaceAll('-',' '):f.title]))}"><td class="number">${f.id}</td><td class="card-status">${states.get(f.id).card?'Karte '+esc(states.get(f.id).card.id):states.get(f.id).status==='offen'?'Noch keine Karte':'Keine Karte · kein Filmo-Link'}</td><td class="film">${esc(f.title)}</td><td class="year">${f.year}</td><td class="scene">${esc(f.scene)}</td><td class="time">${esc(f.timestamp)}</td><td class="duration">${f.durationSeconds.toFixed(1).replace('.',',')} s</td><td class="clip">${link(f.clipUrl,'Clip öffnen')}</td><td class="filmo">${f.filmoUrl?link(f.filmoUrl,'Film öffnen'):''}</td><td class="cut"><details><summary>Schnitt &amp; Ausschlüsse</summary><p>Im Quellclip: ${offset(f.clipStart)} bis ${offset(f.clipEnd)}. Quellbeginn im Film: ${esc(f.sourceTimestamp)}.</p><p>Beginn: „${esc(f.cutTextStart)} …“<br>Ende: „… ${esc(f.cutTextEnd)}“</p><p>Auslassen: ${esc(f.avoidNames.join(', '))}.</p><p>${esc(f.cutNote)}</p></details></td></tr>`).join('\n');
const html=`<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} (${total} Filme)</title>
<style>
:root{color-scheme:light;--line:#d9dde4;--ink:#182332;--muted:#566476;--accent:#164a70}*{box-sizing:border-box}body{font:14px/1.5 system-ui,sans-serif;margin:0;color:var(--ink);background:#f6f7f9}main{max-width:1800px;margin:auto;padding:26px}h1{font-size:28px;line-height:1.2;margin:0 0 12px}p{max-width:1100px;margin:8px 0}a{color:var(--accent)}.intro{background:white;border:1px solid var(--line);border-radius:10px;padding:22px;margin-bottom:18px}.eyebrow{color:var(--muted);font-size:12px;letter-spacing:.08em;text-transform:uppercase;margin:0 0 8px}.note{color:var(--muted)}.tools{display:flex;align-items:end;gap:16px;flex-wrap:wrap;margin:18px 0}label{display:flex;flex-direction:column;gap:5px;font-weight:600}input,select,button{font:inherit;border:1px solid #aab4c0;background:white;border-radius:6px;padding:9px 12px;color:inherit}input{width:min(420px,80vw)}button{cursor:pointer}#count{color:var(--muted);margin-left:auto}.table-wrap{overflow:auto;background:white;border:1px solid var(--line);border-radius:8px}table{border-collapse:collapse;width:100%;min-width:1220px}th,td{text-align:left;vertical-align:top;padding:11px 12px;border-bottom:1px solid var(--line)}th{background:#eaf0f5;position:sticky;top:0;font-size:12px}tbody tr:last-child td{border-bottom:0}tr:nth-child(even){background:#fafbfd}tr[hidden]{display:none}.film{min-width:190px;font-weight:600}.scene{min-width:280px;max-width:440px}.time,.duration{white-space:nowrap;font-variant-numeric:tabular-nums}.number{color:var(--muted)}.cut{min-width:210px;max-width:310px}summary{cursor:pointer;color:var(--accent)}details p{font-size:12px;max-width:310px}footer{color:var(--muted);font-size:12px;margin:16px 0}@media(max-width:650px){main{padding:14px}.intro{padding:16px}h1{font-size:24px}#count{margin-left:0}}@media print{body{background:white;font-size:9pt}main{padding:0}.intro{padding:0;border:0}.tools,.cut,th:last-child{display:none}.table-wrap{overflow:visible;border:0}table{min-width:0}th{position:static}th,td{padding:5px}.film,.scene{min-width:0}.scene{max-width:none}a{color:inherit;text-decoration:none}tr{break-inside:avoid}thead{display:table-header-group}@page{size:A4 landscape;margin:10mm}}
</style></head><body><main>
<section class="intro"><h1>${title}</h1>
<p>${total} Filme. ${otherLink}</p>
<p class="note">Die Schnittfenster wurden anhand englischer Untertitel auf die aufgeführten Namen und Begriffe geprüft. <strong>Die Audios sind noch nicht abgehört.</strong> Zeitmarken sind Suchmarken aus ClipCafe und können je nach Filmfassung abweichen. Deutsche Tonspuren und Schnittgrenzen vor der Verwendung separat prüfen.</p>
<p class="note">„Clip öffnen“ führt zum vollständigen Quellclip. „Film öffnen“ führt zur zugeordneten Filmo-Seite.</p></section>
<p class="scan-summary">Karten-Scan: <strong id="existing-count">${counts.vorhanden}</strong> vorhanden · <strong id="open-count">${counts.offen}</strong> aufnehmbar · <strong id="no-link-count">${counts.ohneLink}</strong> ohne Filmo-Link. <span id="scan-time">Stand: ${esc(scannedAt)}</span></p><p class="note">Der Aufnahmestart und jede neu gespeicherte Karte aktualisieren diese Datei automatisch. Bereits angelegte Karten werden beim erneuten Einlesen der gesamten Datei übersprungen.</p><div class="tools"><label for="card-filter">Kartenstatus<select id="card-filter"><option value="all">Alle Einträge</option><option value="missing">Noch keine Karte</option><option value="open">Aufnehmbar ohne Karte</option><option value="existing">Karte vorhanden</option></select></label><label for="search">Titel oder Szene suchen<input id="search" type="search" placeholder="z. B. Frühstück, Kaffee, Speed"></label><label for="decade">Jahrzehnt<select id="decade"><option value="">Alle Jahrzehnte</option>${[1940,1950,1960,1970,1980,1990,2000,2010,2020].map(d=>`<option value="${d}">${d}er</option>`).join('')}</select></label><button id="print" type="button">Auswahl drucken</button><output id="count" aria-live="polite">${total} von ${total} Szenen</output></div>
<div class="table-wrap"><table><thead><tr><th>Nr.</th><th>Kartenstatus</th><th>Titel</th><th>Erscheinungsjahr</th><th>Szene</th><th>Zeitpunkt im Film</th><th>Dauer der Szene</th><th>Clip-Link</th><th>Filmo-Link</th><th>Schnitthinweise</th></tr></thead><tbody>
${rows}
</tbody></table></div><footer>Datenbasis: filme-version-2.json. Dauern beziehen sich auf die Untertitelfenster, nicht auf eine geprüfte Aufnahme.</footer>
</main><script>
const search=document.querySelector('#search'),decade=document.querySelector('#decade'),cardFilter=document.querySelector('#card-filter'),rows=[...document.querySelectorAll('tbody tr')];
const normalize=s=>s.normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLocaleLowerCase('de');
const index=rows.map(row=>({row,id:Number(row.dataset.id),status:row.dataset.cardStatus,text:normalize(row.querySelector('.film').textContent+' '+row.querySelector('.scene').textContent),year:Number(row.dataset.year)}));
function filter(){const q=normalize(search.value.trim()),d=Number(decade.value);let count=0;for(const item of index){const match=(!q||item.text.includes(q))&&(!d||Math.floor(item.year/10)*10===d)&&(cardFilter.value==='all'||(cardFilter.value==='existing'?item.status==='vorhanden':cardFilter.value==='open'?item.status==='offen':item.status!=='vorhanden'));item.row.hidden=!match;if(match)count++;}document.querySelector('#count').textContent=count+' von ${total} Szenen';}
cardFilter.addEventListener('change',filter);search.addEventListener('input',filter);decade.addEventListener('change',filter);document.querySelector('#print').addEventListener('click',()=>window.print());

window.applyFilmCardScan=snapshot=>{
for(const entry of snapshot.entries){const item=index.find(item=>item.id===entry.sourceId);if(!item)continue;item.status=entry.status;item.row.dataset.cardStatus=entry.status;item.row.querySelector('.card-status').textContent=entry.cardId?'Karte '+entry.cardId:entry.status==='offen'?'Noch keine Karte':'Keine Karte · kein Filmo-Link';}
document.querySelector('#existing-count').textContent=snapshot.counts.vorhanden;document.querySelector('#open-count').textContent=snapshot.counts.offen;document.querySelector('#no-link-count').textContent=snapshot.counts.ohneLink;document.querySelector('#scan-time').textContent='Stand: '+snapshot.scannedAt;filter();
};
function loadCardScan(){const script=document.createElement('script');script.src='${statusFile}.js?scan='+Date.now();script.onload=script.onerror=()=>script.remove();document.head.appendChild(script);}
loadCardScan();setInterval(loadCardScan,15000);
</script></body></html>\n`;
const status={scannedAt,total,counts,entries:scan.map(s=>({sourceId:s.film.id,title:s.film.title,year:s.film.year,status:s.status,cardId:s.card?.id??null}))};
await writeOutput(new URL(file+'.html',root),html);
await writeOutput(new URL(file+'.txt',root),films.map(f=>[f.id,f.title,f.year,f.scene,f.timestamp,f.durationSeconds.toFixed(3),f.clipUrl].join('|')).join('\n')+'\n');
await writeOutput(new URL(statusFile+'.json',root),JSON.stringify(status,null,2)+'\n');
await writeOutput(new URL(statusFile+'.js',root),'window.applyFilmCardScan?.('+JSON.stringify(status)+');\n');
console.log(`${title}: ${total} Filme; ${counts.vorhanden} mit Karte, ${counts.offen} mit Link und ohne Karte, ${counts.ohneLink} ohne Filmo-Link.`);
}

await buildList(films, 'filme-version-2', 'Filmkarten – Version 2 in Vorbereitung', 'kartenstatus-offen', '<a href="filme-version-1.html">Filmkarten der Version 1</a>');
