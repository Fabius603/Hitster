import fs from 'node:fs/promises';
process.env.FILMQUIZ_HELPERS_ONLY='1';
const {get,clips}=await import('./recherche-150.mjs');
const root=new URL('./',import.meta.url),file=new URL('../.local/filmquiz-v2-review.json',root);
const data=JSON.parse(await fs.readFile(file,'utf8'));
data[114].movieUrl='https://clip.cafe/star-wars-episode-vii-the-force-awakens-2015/';
Object.assign(data[148],{title:'Twilight – Biss zum Morgengrauen',year:2008,slug:'twilight',movieUrl:'https://clip.cafe/twilight-2008/',scene:'Edward und Bella sprechen darüber, dass sich ein gefährlicher Löwe in ein Lamm verliebt hat.'});
const changes={19:'follow him',32:'five seconds',40:'earn this',49:'Wilson',56:'must not',64:'Almighty',81:'my name is',87:'three',107:'messages',115:'Chewie',129:'tree',133:'3000',141:'plane'};
changes[149]='lamb';
const norm=s=>s.toLowerCase().replace(/&quot;/g,' ').replace(/[^a-z0-9]+/g,' ').trim();
for(const[id,key]of Object.entries(changes)){
 const f=data[+id-1];try{
 const options=clips(await get(f.movieUrl+'~'+encodeURIComponent(key)+'/')).filter(c=>c.url.startsWith(f.movieUrl)&&norm(c.excerpt).includes(norm(key)));
 for(const opt of options.slice(0,4)){
  const html=await get(opt.url),time=html.match(/Timestamp in Movie\s*<\/div>\s*<div[^>]*>\s*(\d\d:\d\d:\d\d)/)?.[1];if(!time||time==='00:00:00')continue;
  f.clipUrl=opt.url;f.timestamp=time;f.review=opt.excerpt;f.status='source-time';delete f.error;break;
 }
 console.log(id,f.timestamp||'OFFEN',(f.review||'').slice(0,350));
 }catch(e){console.log(id,'FEHLER',e.message)}
}
await fs.writeFile(file,JSON.stringify(data,null,2));
