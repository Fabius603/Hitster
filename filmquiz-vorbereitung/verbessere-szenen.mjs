import fs from 'node:fs/promises';
process.env.FILMQUIZ_HELPERS_ONLY='1';
const {get,clips}=await import('./recherche-150.mjs');
const root=new URL('./',import.meta.url),file=new URL('../.local/filmquiz-v2-review.json',root);
const data=JSON.parse(await fs.readFile(file,'utf8'));
const corrections={17:'instead',19:'salute',22:'fruiting',23:'great kings',30:'in the box',31:'roll the dice',32:'destruct',35:'flying',39:'tied',40:'Ryan',47:'spelled',48:'commander',49:'sorry',52:'shall not pass',53:'human child',56:'warning',64:'God',65:'carry you',68:'394',69:'no one else',72:'river',74:'put your name',75:'killed the beast',77:'flood',80:'love food',81:'I am Optimus',82:'kiss',83:'no secret',84:'directive',85:'so serious',86:'I am Iron Man',87:'fathers',89:'I see you',92:'kill a dragon',99:'always angry',101:'going on an adventure',103:'Olaf',106:'sell me',107:'messages',111:'sandwich',120:'inside',123:'Duke',124:'music',126:'break the spell',128:'forever',129:'friend',133:'love you',136:'legs',137:'talk about Bruno',140:'good day',141:'not the plane',142:'nine',143:'connects',146:'near zero',147:'Hoverchoc'};
const norm=s=>s.toLowerCase().replace(/&quot;/g,' ').replace(/[^a-z0-9]+/g,' ').trim();
const work=Object.entries(corrections);let cursor=0;
await Promise.all(Array.from({length:3},async()=>{while(cursor<work.length){const[id,key]=work[cursor++],f=data[+id-1];try{
 if(!f.movieUrl){f.movieUrl='https://clip.cafe/'+f.slug+'-'+f.year+'/';}
 const options=clips(await get(f.movieUrl+'~'+encodeURIComponent(key)+'/')).filter(c=>c.url.startsWith(f.movieUrl));
 const words=norm(key).split(' ');const score=c=>(norm(c.excerpt).includes(norm(key))?30:0)+words.filter(w=>norm(c.excerpt).split(' ').includes(w)).length;
 options.sort((a,b)=>score(b)-score(a));let changed=false;
 for(const opt of options.slice(0,5)){
  if(score(opt)===0)continue;
  const html=await get(opt.url),time=html.match(/Timestamp in Movie\s*<\/div>\s*<div[^>]*>\s*(\d\d:\d\d:\d\d)/)?.[1];
  if(!time||time==='00:00:00')continue;
  f.clipUrl=opt.url;f.timestamp=time;f.review=opt.excerpt;f.status='source-time';delete f.error;changed=true;break;
 }
 console.log(id,(changed?'OK ':'BLEIBT ')+(f.review||'').slice(0,230));
 }catch(e){console.log(id,'FEHLER',e.message)}}}));
await fs.writeFile(file,JSON.stringify(data,null,2));
