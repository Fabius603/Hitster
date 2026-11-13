import fs from 'node:fs/promises';
process.env.FILMQUIZ_HELPERS_ONLY='1';
const {get,clips,plain}=await import('./recherche-150.mjs');
const root=new URL('./',import.meta.url);
const local=new URL('../.local/weitere-200-review.json',root);
const previous=[...JSON.parse(await fs.readFile(new URL('recherche-150.json',root),'utf8')),...JSON.parse(await fs.readFile(new URL('recherche-200.json',root),'utf8'))];
const norm=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/ß/g,'ss').replace(/[^a-z0-9]+/g,' ').trim();
const has=(s,w)=>(' '+norm(s)+' ').includes(' '+norm(w)+' ');
const sec=s=>s.split(':').reduce((a,b)=>60*a+Number(b),0);
const stamp=n=>[Math.floor(n/3600),Math.floor(n%3600/60),Math.floor(n%60)].map(x=>String(x).padStart(2,'0')).join(':');
function subtitles(html){
 const start=html.search(/<div\b[^>]*class="transcript-panel[^\"]*"[^>]*data-lang="en"/);if(start<0)return[];
 const body=html.slice(start),panel=body.slice(body.indexOf('>')+1).split(/<div\b[^>]*class="transcript-panel/)[0];
 return [...panel.matchAll(/class="subtitleTime"[^>]*>(\d\d:\d\d:\d\d\.\d+)\s*(?:--&gt;|-->)\s*(\d\d:\d\d:\d\d\.\d+)<\/div>\s*<div[^>]*class="subtitleLine"[^>]*>([\s\S]*?)<\/div>/g)].map(m=>({start:sec(m[1]),end:sec(m[2]),text:plain(m[3])}));
}
async function filmoGet(url){
 const file=new URL('../.local/filmo-recherche/'+Buffer.from(url).toString('base64url')+'.html',root);
 try{return await fs.readFile(file,'utf8')}catch{}
 const response=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('Filmo HTTP '+response.status);
 const html=await response.text();await fs.writeFile(file,html);return html;
}
const films=(await fs.readFile(new URL('weitere-200-kandidaten.txt',root),'utf8')).trim().split(/\r?\n/).map((l,i)=>{const[key,slug,keyword,bans]=l.split('|');return{candidateId:i+1,filmoUrl:'http://45.10.243.23/movies/'+key,slug,keyword,avoidNames:bans.split(',')};});
let cached=[];try{cached=JSON.parse(await fs.readFile(local,'utf8'))}catch{}
async function research(f){
 try{
  const html=await filmoGet(f.filmoUrl);
  f.title=plain(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1]||'');
  f.year=+(html.match(/ft-meta-label[^>]*>\s*(\d{4})\s*<\/span>/)?.[1]||html.match(/Erscheinungsdatum:\s*(\d{4})/)?.[1]);
  if(!f.title||!f.year)throw Error('Filmo-Metadaten fehlen');
  f.filmoTitle=f.title;f.filmoYear=f.year;
  const movieSlug=f.slug.replace(/-\d{4}$/,'');
  if(previous.some(p=>p.year===f.year&&(p.filmoUrl===f.filmoUrl||norm(p.title)===norm(f.title)||norm((p.slug||p.movieUrl?.split('/')[3]||'').replace(/-\d{4}$/,'').replaceAll('-',' '))===norm(movieSlug.replaceAll('-',' '))))){f.status='old-film';return;}
  f.movieUrl=`https://clip.cafe/${f.slug}-${f.year}/`;
  let catalog;try{catalog=await get(f.movieUrl+'~'+encodeURIComponent(f.keyword)+'/');}catch{
   const search=await get('https://clip.cafe/?s='+encodeURIComponent(f.slug.replaceAll('-',' '))+'&ss=1');
   const urls=[...search.matchAll(/href="([^"?#]*-(\d{4}))\/?"/g)].filter(m=>+m[2]===f.year);
   const words=f.slug.split('-').filter(w=>w.length>2);urls.sort((a,b)=>words.filter(w=>b[1].includes(w)).length-words.filter(w=>a[1].includes(w)).length);
   if(!urls.length)throw Error('Keine passende ClipCafe-Filmseite');
   f.movieUrl=new URL(urls[0][1]+'/', 'https://clip.cafe/').href;catalog=await get(f.movieUrl+'~'+encodeURIComponent(f.keyword)+'/');
  }
  let choices=clips(catalog).filter(c=>c.url.startsWith(f.movieUrl));
  if(!choices.length)choices=clips(await get(f.movieUrl)).filter(c=>c.url.startsWith(f.movieUrl));
  choices.sort((a,b)=>Number(has(b.excerpt,f.keyword))-Number(has(a.excerpt,f.keyword)));
  const alternatives=[];
  for(const c of choices.slice(0,6)){
   if(previous.some(p=>p.clipUrl===c.url))continue;
   const detail=await get(c.url),time=detail.match(/Timestamp in Movie\s*<\/div>\s*<div[^>]*>\s*(\d\d:\d\d:\d\d)/)?.[1];
   if(!time||time==='00:00:00')continue;
   const lines=subtitles(detail),windows=[];
   for(let i=0;i<lines.length;i++)for(let j=i;j<lines.length;j++){
    const start=lines[i].start,end=lines[j].end,duration=end-start;
    if(duration>16||f.avoidNames.some(n=>has(lines[j].text,n)))break;
    if(j>i&&lines[j].start-lines[j-1].end>3)break;
    const text=lines.slice(i,j+1).map(l=>l.text).join(' ');
    if(duration<7||text.split(/\s+/).length<10)continue;
    const song=/[♪♫]|\bJ J\b/i.test(text);
    windows.push({clipStart:start,clipEnd:end,review:text,score:(has(text,f.keyword)?30:0)-Math.abs(duration-11)-(song?100:0)});
   }
   windows.sort((a,b)=>b.score-a.score);if(!windows.length)continue;
   const w=windows[0];alternatives.push({...w,clipUrl:c.url,sourceTimestamp:time,timestamp:stamp(sec(time)+w.clipStart)});
   if(w.score>23)break;
  }
  alternatives.sort((a,b)=>b.score-a.score);
  if(!alternatives.length){f.status='no-window';return;}
  Object.assign(f,alternatives[0],{status:'subtitle-window'});delete f.score;
 }catch(e){f.status='error';f.error=e.message;}
}
let next=0,done=0;
await Promise.all(Array.from({length:4},async()=>{while(next<films.length){const f=films[next++];const c=cached.find(c=>c.filmoUrl===f.filmoUrl&&c.keyword===f.keyword&&c.status==='subtitle-window');if(c)Object.assign(f,c);else await research(f);if(++done%20===0)console.log(`${done}/${films.length}`);}}));
await fs.writeFile(local,JSON.stringify(films,null,2));
console.log(JSON.stringify(films.reduce((a,f)=>(a[f.status]=(a[f.status]||0)+1,a),{})));
