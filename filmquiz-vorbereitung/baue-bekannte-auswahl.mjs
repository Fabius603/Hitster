import fs from 'node:fs/promises';
const root=new URL('./',import.meta.url);
const reviewed=JSON.parse(await fs.readFile(new URL('../.local/filmquiz-v2-final-review.json',root),'utf8'));
const previous=JSON.parse(await fs.readFile(new URL('recherche-150.json',root),'utf8'));
const films=reviewed.map(({title,year,slug,scene,timestamp,clipUrl})=>{
 const existing=previous.find(f=>f.title===title&&f.year===year)||{};
 const links=Object.fromEntries(Object.entries(existing).filter(([key])=>key.startsWith('filmo')));
 return {title,year,slug,scene,timestamp,clipUrl,status:'source-time',...links};
}).sort((a,b)=>a.year-b.year||a.title.localeCompare(b.title,'de')).map((film,i)=>({id:i+1,...film}));
if(films.length!==150||new Set(films.map(f=>f.title+'|'+f.year)).size!==150)throw Error('150 unterschiedliche Filme erforderlich');
for(const f of films){if(!f.clipUrl||!/^\d{2}:[0-5]\d:[0-5]\d$/.test(f.timestamp))throw Error('Unvollständiger Eintrag: '+f.title);}
await fs.writeFile(new URL('recherche-150.json',root),JSON.stringify(films,null,2));
await import('./baue-tabelle.mjs');
console.log('Ältere Klassiker:',films.filter(f=>f.year<1990).length,'· Filme ab 1990:',films.filter(f=>f.year>=1990).length);
