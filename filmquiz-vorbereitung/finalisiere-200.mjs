import fs from 'node:fs/promises';
process.env.FILMQUIZ_HELPERS_ONLY='1';
const {get,plain}=await import('./recherche-150.mjs');
const root=new URL('./',import.meta.url);
const reviewed=JSON.parse(await fs.readFile(new URL('../.local/filmquiz-200-review.json',root),'utf8'));
let existing=[];
try{existing=JSON.parse(await fs.readFile(new URL('recherche-200.json',root),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
const edits=new Map((await fs.readFile(new URL('szenen-200-redaktion.txt',root),'utf8')).trim().split(/\r?\n/).map(l=>{const p=l.indexOf('|');return [+l.slice(0,p),l.slice(p+1)];}));
const norm=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const has=(s,w)=>(' '+norm(s)+' ').includes(' '+norm(w)+' ');
const seconds=s=>s.split(':').reduce((a,b)=>60*a+Number(b),0);
const stamp=n=>[Math.floor(n/3600),Math.floor(n%3600/60),Math.floor(n%60)].map(v=>String(v).padStart(2,'0')).join(':');
function lines(html){const start=html.search(/<div\b[^>]*class="transcript-panel[^\"]*"[^>]*data-lang="en"/);if(start<0)return[];const section=html.slice(start);const content=section.slice(section.indexOf('>')+1).split(/<div\b[^>]*class="transcript-panel/)[0];return [...content.matchAll(/class="subtitleTime"[^>]*>(\d\d:\d\d:\d\d\.\d+)\s*(?:--&gt;|-->)\s*(\d\d:\d\d:\d\d\.\d+)<\/div>\s*<div[^>]*class="subtitleLine"[^>]*>([\s\S]*?)<\/div>/g)].map(m=>({start:seconds(m[1]),end:seconds(m[2]),text:plain(m[3])}));}
const extra={18:['Mrs K'],61:['Jannelle'],87:['Lola'],117:['Angela'],170:['Milton'],184:['Manolo'],201:['Saint Edward'],247:['Harrison']};
const cues={18:'movies',61:'softball',87:'water',117:'milk',170:'sailors',184:'floor',201:'sit',247:'bathroom'};
const audit=[];
const films=[];
for(const f of reviewed.filter(f=>edits.has(f.candidateId))){
  if(f.status!=='subtitle-window')throw Error('Kein Schnittfenster: '+f.title);
  const bans=[...f.avoidNames,...(extra[f.candidateId]||[])];
  if(extra[f.candidateId]){
    const all=lines(await get(f.clipUrl)); const choices=[];
    for(let i=0;i<all.length;i++)for(let j=i;j<all.length;j++){
      const end=all[j].end,start=all[i].start,d=end-start;
      if(d>16||bans.some(w=>has(all[j].text,w)))break;
      const text=all.slice(i,j+1).map(l=>l.text).join(' ');
      if(d<5||!has(text,cues[f.candidateId]))continue;
      choices.push({start,end,text,score:-Math.abs(d-11)});
    }
    choices.sort((a,b)=>b.score-a.score);
    if(!choices.length)throw Error('Namenfreies Fenster fehlt: '+f.title);
    const c=choices[0];f.clipStart=c.start;f.clipEnd=c.end;f.review=c.text;f.timestamp=stamp(seconds(f.sourceTimestamp)+c.start);
  }
  if(bans.some(w=>has(f.review,w)))throw Error('Verbotener Begriff: '+f.title);
  audit.push({candidateId:f.candidateId,title:f.title,review:f.review});
  films.push({id:films.length+1,title:f.title,year:f.year,scene:edits.get(f.candidateId),timestamp:f.timestamp,sourceTimestamp:f.sourceTimestamp,clipUrl:f.clipUrl,movieUrl:f.movieUrl,clipStart:f.clipStart,clipEnd:f.clipEnd,durationSeconds:+(f.clipEnd-f.clipStart).toFixed(3),difficulty:'mittel',avoidNames:bans,cutLanguage:'en',cutStatus:'subtitle-window',cutTextStart:f.review.split(/\s+/).slice(0,4).join(' '),cutTextEnd:f.review.split(/\s+/).slice(-4).join(' '),cutNote:'Nur das angegebene Fenster verwenden; Namen und verräterische Begriffe auch direkt davor/danach auslassen. Für die deutsche Fassung den entsprechenden Dialog separat abgleichen.',audioVerified:false,sourceCheckedOn:'2026-11-12',filmoSearchUrl:'http://45.10.243.23/search?q='+encodeURIComponent(f.title)});
}
if(films.length!==200||new Set(films.map(f=>norm(f.title)+'|'+f.year)).size!==200)throw Error('Genau 200 verschiedene Filme erforderlich');
const old=JSON.parse(await fs.readFile(new URL('recherche-150.json',root),'utf8'));
if(films.some(f=>old.some(o=>o.year===f.year&&norm(o.title)===norm(f.title))))throw Error('Überschneidung mit alter Liste');
for(const film of films){
  const previous=existing.find(f=>f.title===film.title&&f.year===film.year);
  if(previous?.filmoUrl&&previous.filmoYear===film.year){
    film.filmoUrl=previous.filmoUrl;
    film.filmoTitle=previous.filmoTitle;
    film.filmoYear=previous.filmoYear;
  }
}
await fs.writeFile(new URL('recherche-200.json',root),JSON.stringify(films,null,2)+'\n');
await fs.writeFile(new URL('../.local/filmquiz-200-final-audit.json',root),JSON.stringify(audit,null,2));
console.log(`200 zusätzliche Filme, ${films.filter(f=>f.year>=1990).length} ab 1990. Untertitelfenster ${Math.min(...films.map(f=>f.durationSeconds)).toFixed(1)}–${Math.max(...films.map(f=>f.durationSeconds)).toFixed(1)} s.`);
