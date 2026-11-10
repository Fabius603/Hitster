import fs from 'node:fs/promises';
process.env.FILMQUIZ_HELPERS_ONLY='1';
const {get,clips}=await import('./recherche-150.mjs');
const root=new URL('./',import.meta.url);
const films=JSON.parse(await fs.readFile(new URL('../.local/filmquiz-mittel-vorschlaege.json',root),'utf8'));
const requests=(await fs.readFile(new URL('../.local/filmquiz-mittel-letzte.txt',root),'utf8')).trim().split(/\r?\n/).map(l=>{const[id,keyword,scene]=l.split('|');return{id:+id,keyword,scene};});
const norm=s=>s.toLowerCase().replace(/&quot;/g,' ').replace(/[^a-z0-9]+/g,' ').trim();
let cursor=0,done=0;
await Promise.all(Array.from({length:3},async()=>{while(cursor<requests.length){const request=requests[cursor++],f=films.find(f=>f.id===request.id);try{
 const movie=new URL(f.clipUrl);movie.pathname='/'+movie.pathname.split('/')[1]+'/';
 const choices=clips(await get(movie.href+'~'+encodeURIComponent(request.keyword)+'/')).filter(c=>c.url.startsWith(movie.href)&&norm(c.excerpt).includes(norm(request.keyword)));
 for(const c of choices.slice(0,4)){
  const html=await get(c.url);const time=html.match(/Timestamp in Movie\s*<\/div>\s*<div[^>]*>\s*(\d\d:\d\d:\d\d)/)?.[1];if(!time||time==='00:00:00')continue;
  f.proposed={clipUrl:c.url,timestamp:time,scene:request.scene,excerpt:c.excerpt,keyword:request.keyword};break;
 }
 }catch(e){f.proposalError=e.message;}done++;if(done%10===0)console.log(done+'/'+requests.length+' Alternativen geprüft');}}));
await fs.writeFile(new URL('../.local/filmquiz-mittel-vorschlaege.json',root),JSON.stringify(films,null,2));
console.log('Alternativen:',films.filter(f=>f.proposed).length);
console.log('Ohne neuen Treffer:',requests.filter(r=>!films.find(f=>f.id===r.id).proposed).map(r=>r.id));


