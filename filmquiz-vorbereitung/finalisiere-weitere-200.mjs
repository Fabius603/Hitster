import fs from 'node:fs/promises';
process.env.FILMQUIZ_HELPERS_ONLY='1';
const {get,plain}=await import('./recherche-150.mjs');
const root=new URL('./',import.meta.url);
const reviewed=JSON.parse(await fs.readFile(new URL('../.local/weitere-200-review.json',root),'utf8'));
const descriptions=new Map((await fs.readFile(new URL('weitere-200-redaktion.txt',root),'utf8')).trim().split(/\r?\n/).map(l=>{const p=l.indexOf('|');return[+l.slice(0,p),l.slice(p+1)];}));
const old=[...JSON.parse(await fs.readFile(new URL('recherche-150.json',root),'utf8')),...JSON.parse(await fs.readFile(new URL('recherche-200.json',root),'utf8'))];
const norm=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/ß/g,'ss').replace(/[^a-z0-9]+/g,' ').trim();
const has=(s,w)=>(' '+norm(s)+' ').includes(' '+norm(w)+' ');
const sec=s=>s.split(':').reduce((a,b)=>60*a+Number(b),0);
const stamp=n=>[Math.floor(n/3600),Math.floor(n%3600/60),Math.floor(n%60)].map(x=>String(x).padStart(2,'0')).join(':');
function subtitles(html){const start=html.search(/<div\b[^>]*class="transcript-panel[^\"]*"[^>]*data-lang="en"/);if(start<0)return[];const body=html.slice(start),panel=body.slice(body.indexOf('>')+1).split(/<div\b[^>]*class="transcript-panel/)[0];return [...panel.matchAll(/class="subtitleTime"[^>]*>(\d\d:\d\d:\d\d\.\d+)\s*(?:--&gt;|-->)\s*(\d\d:\d\d:\d\d\.\d+)<\/div>\s*<div[^>]*class="subtitleLine"[^>]*>([\s\S]*?)<\/div>/g)].map(m=>({start:sec(m[1]),end:sec(m[2]),text:plain(m[3])}));}
const extra={61:['Dan'],96:['Tony','Stark'],143:['Sebastian'],176:['Betty'],310:['Chen']};
const cues={61:'mailbox',96:'monster',143:'rats',176:'perfume',310:'food'};
const films=[],audit=[];
for(const f of reviewed.filter(f=>descriptions.has(f.candidateId))){
 if(f.status!=='subtitle-window'||!f.filmoUrl||f.filmoYear!==f.year)throw Error('Quelle oder Filmo-Zuordnung fehlt: '+f.title);
 const bans=[...f.avoidNames,...(extra[f.candidateId]||[])];
 if(extra[f.candidateId]){
  const lines=subtitles(await get(f.clipUrl)),windows=[];
  for(let i=0;i<lines.length;i++)for(let j=i;j<lines.length;j++){
   const start=lines[i].start,end=lines[j].end,d=end-start;if(d>16||bans.some(n=>has(lines[j].text,n)))break;
   if(j>i&&lines[j].start-lines[j-1].end>3)break;
   const text=lines.slice(i,j+1).map(l=>l.text).join(' ');if(d<5||!has(text,cues[f.candidateId]))continue;
   windows.push({start,end,text,score:-Math.abs(d-11)});
  }
  windows.sort((a,b)=>b.score-a.score);const w=windows[0];if(!w)throw Error('Schnitt nach Namenprüfung fehlt: '+f.title);
  f.clipStart=w.start;f.clipEnd=w.end;f.review=w.text;f.timestamp=stamp(sec(f.sourceTimestamp)+w.start);
 }
 if(bans.some(n=>has(f.review,n)))throw Error('Ausschluss im Fenster: '+f.title);
 if(/[♪♫]/.test(f.review))throw Error('Liedtext: '+f.title);
 if(old.some(p=>p.clipUrl===f.clipUrl||p.filmoUrl===f.filmoUrl||(p.year===f.year&&(norm(p.title)===norm(f.title)||p.movieUrl===f.movieUrl))))throw Error('Bereits gelistet: '+f.title);
 const film={id:201+films.length,title:f.title,year:f.year,scene:descriptions.get(f.candidateId),timestamp:f.timestamp,sourceTimestamp:f.sourceTimestamp,clipUrl:f.clipUrl,movieUrl:f.movieUrl,clipStart:f.clipStart,clipEnd:f.clipEnd,durationSeconds:+(f.clipEnd-f.clipStart).toFixed(3),difficulty:'mittel',avoidNames:bans,cutLanguage:'en',cutStatus:'subtitle-window',cutTextStart:f.review.split(/\s+/).slice(0,4).join(' '),cutTextEnd:f.review.split(/\s+/).slice(-4).join(' '),cutNote:'Nur das angegebene Untertitelfenster verwenden. Namen, charakteristische Ausdrücke und Musik außerhalb des Fensters nicht übernehmen; deutsche Tonspur und Satzgrenzen separat abgleichen.',audioVerified:false,sourceCheckedOn:'2026-11-12',filmoUrl:f.filmoUrl,filmoTitle:f.filmoTitle,filmoYear:f.filmoYear};
 films.push(film);audit.push({id:film.id,candidateId:f.candidateId,title:f.title,review:f.review});
}
if(films.length!==200||new Set(films.map(f=>f.clipUrl)).size!==200||new Set(films.map(f=>f.filmoUrl)).size!==200)throw Error('Genau 200 eindeutige Einträge erforderlich.');
await fs.writeFile(new URL('recherche-200-weitere.json',root),JSON.stringify(films,null,2)+'\n');
await fs.writeFile(new URL('../.local/weitere-200-final-audit.json',root),JSON.stringify(audit,null,2));
console.log(`200 zusätzliche Szenen mit 200 direkten Filmo-Links. IDs 201–400; ${films.filter(f=>f.year>=1990).length} Filme ab 1990.`);
console.log('Nachgeschnitten:',audit.filter(f=>extra[f.candidateId]));
