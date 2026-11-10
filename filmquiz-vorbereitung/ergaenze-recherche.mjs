import fs from 'node:fs/promises';
process.env.FILMQUIZ_HELPERS_ONLY='1';
const {get,clips,plain}=await import('./recherche-150.mjs');
const root=new URL('./',import.meta.url);
const films=JSON.parse(await fs.readFile(new URL('recherche-150.json',root),'utf8'));
const keywords={4:'wash',17:'Moses',20:'food',21:'baby',23:'brassiere',32:'tuppence',33:'curtains',34:'gun',35:'bare',46:'power converters',54:'food',58:'phone',60:'computer',61:'money',62:'rescue',70:'rubber',77:'funny',80:'fork',83:'hands',85:'spoon',102:'cable',115:'clock',117:'beans',123:'parley',124:'Sherman',126:'math',130:'Earth',131:'billion',135:'chocolate'};
const replace=new Set([6,39,41,45,51,52,68,74,76,79,81,87,88,89,97,106,108,111,114,121,122,125,129,133,137,139,142,146,147,148]);
const precise={6:'only had a brain',39:'leave the gun',41:'horse race',45:'movie',51:'Romanes',52:'Charlie',68:'lunch',74:'means',76:'Wapner',79:'apple pie',81:'approved',87:'three',88:'choir',89:'a god',97:'child',106:'painting',108:'tied',111:'make soap',114:'wife',121:'migration',122:'pilot',125:'tea',129:'anyone can cook',133:'feet',137:'summer',139:'textbooks',142:'hate jazz',146:'purpose',147:'stillsuit',148:'captain'};
const work=films.filter(f=>!f.timestamp||replace.has(f.id));
let cursor=0;
await Promise.all(Array.from({length:3},async()=>{while(cursor<work.length){const f=work[cursor++];try{
 let movie=f.movieUrl;
 let base;
 try{base=await get(movie)}catch{
  const search=await get(f.searchUrl);const matches=[...search.matchAll(/href="([^"?#]*-([0-9]{4}))\/?"/g)].filter(m=>+m[2]===f.year);
  const tokens=f.slug.split('-').filter(t=>!['the','and','of','a'].includes(t));
  matches.sort((a,b)=>tokens.filter(t=>b[1].includes(t)).length-tokens.filter(t=>a[1].includes(t)).length);
  if(!matches.length)throw Error('Kein Film gefunden');movie=new URL(matches[0][1]+'/', 'https://clip.cafe/').href;base=await get(movie);f.movieUrl=movie;
 }
 const keyword=precise[f.id]||keywords[f.id]||f.keyword;
 let found=clips(await get(movie+'~'+encodeURIComponent(keyword)+'/'));
 found=found.filter(c=>c.url.startsWith(movie));
 if(!found.length){if(f.timestamp)continue;found=clips(base).filter(c=>c.url.startsWith(movie));f.usedFallback=true;}
 let successful=false;
 for(const selected of found.slice(0,6)){
  const scene=await get(selected.url);const time=scene.match(/Timestamp in Movie\s*<\/div>\s*<div[^>]*>\s*(\d\d:\d\d:\d\d)/)?.[1];
  if(!time||time==='00:00:00')continue;
  f.clipUrl=selected.url;f.excerpt=selected.excerpt;f.timestamp=time;f.status='source-time';delete f.error;
  successful=true;break;
 }
 if(!successful&&!f.timestamp)console.log('OFFEN '+f.id+' '+f.title);
 }catch(e){console.log('FEHLER '+f.id+' '+e.message)}console.log('Geprüft '+f.id);}}));
await fs.writeFile(new URL('recherche-150.json',root),JSON.stringify(films,null,2));
console.log(JSON.stringify(films.reduce((a,f)=>(a[f.status]=(a[f.status]||0)+1,a),{})));
