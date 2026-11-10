import fs from 'node:fs/promises';
process.env.FILMQUIZ_HELPERS_ONLY='1';
const {get,clips}=await import('./recherche-150.mjs');
const root=new URL('./',import.meta.url);
const films=JSON.parse(await fs.readFile(new URL('recherche-150.json',root),'utf8'));
const targets={11:'nice',17:'dignity',33:'whistle',80:'dingle',85:'library',131:'buttons',137:'warm hugs',147:'moisture'};
for(const [id,keyword] of Object.entries(targets)){
 const f=films[Number(id)-1];
 try{const options=clips(await get(f.movieUrl+'~'+encodeURIComponent(keyword)+'/')).filter(c=>c.url.startsWith(f.movieUrl));
 for(const option of options.slice(0,5)){
  const html=await get(option.url);const time=html.match(/Timestamp in Movie\s*<\/div>\s*<div[^>]*>\s*(\d\d:\d\d:\d\d)/)?.[1];
  if(time&&time!=='00:00:00'){f.clipUrl=option.url;f.timestamp=time;f.excerpt=option.excerpt;console.log(id,time,option.excerpt.slice(0,500));break;}
 }
 }catch(e){console.log('Offen',id,e.message)}
}
const f=films[33];f.clipUrl='https://clip.cafe/the-good-the-bad-the-ugly-1966/one-two-s46/';f.timestamp='01:52:49';f.status='source-time';f.scene='Zwei Männer streiten darüber, ob drei oder sechs die perfekte Zahl ist.';delete f.error;
const nemo=films[123];nemo.clipUrl='https://clip.cafe/finding-nemo-2003/p-sherman-42-wallaby-way-sydney-where-are-you-going/';nemo.timestamp='00:40:23';
await fs.writeFile(new URL('recherche-150.json',root),JSON.stringify(films,null,2));
