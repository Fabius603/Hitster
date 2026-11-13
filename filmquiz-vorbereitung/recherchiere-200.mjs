import fs from 'node:fs/promises';
process.env.FILMQUIZ_HELPERS_ONLY = '1';
const {get, clips, plain} = await import('./recherche-150.mjs');
const root = new URL('./', import.meta.url);
const local = new URL('../.local/filmquiz-200-review.json', root);
const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const contains = (s, word) => (' '+norm(s)+' ').includes(' '+norm(word)+' ');
const sec = s => s.split(':').reduce((a,b)=>60*a+Number(b),0);
const stamp = n => [Math.floor(n/3600),Math.floor(n%3600/60),Math.floor(n%60)].map(x=>String(x).padStart(2,'0')).join(':');
function subtitles(html) {
  const start = html.search(/<div\b[^>]*class="transcript-panel[^\"]*"[^>]*data-lang="en"/);
  if (start < 0) return [];
  const body = html.slice(start); const panel = body.slice(body.indexOf('>')+1).split(/<div\b[^>]*class="transcript-panel/)[0];
  return [...panel.matchAll(/class="subtitleTime"[^>]*>(\d\d:\d\d:\d\d\.\d+)\s*(?:--&gt;|-->)\s*(\d\d:\d\d:\d\d\.\d+)<\/div>\s*<div[^>]*class="subtitleLine"[^>]*>([\s\S]*?)<\/div>/g)].map(m=>({start:sec(m[1]),end:sec(m[2]),text:plain(m[3])}));
}
let films = (await fs.readFile(new URL('filme-200-kandidaten.txt',root),'utf8')).trim().split(/\r?\n/).map((l,i)=>{const [title,year,slug,keyword,bans]=l.split('|');return {candidateId:i+1,title,year:+year,slug,keyword,avoidNames:bans.split(',')};});
let cached=[]; try {cached=JSON.parse(await fs.readFile(local,'utf8'));} catch {}
const old=JSON.parse(await fs.readFile(new URL('recherche-150.json',root),'utf8'));
async function research(f) {
  if (old.some(o=>norm(o.title)===norm(f.title)&&o.year===f.year)) {f.status='old-film';return;}
  f.movieUrl=`https://clip.cafe/${f.slug}-${f.year}/`;
  f.searchUrl='https://clip.cafe/?s='+encodeURIComponent(f.slug.replaceAll('-',' '))+'&ss=1';
  try {
    let html;
    try {html=await get(f.movieUrl+'~'+encodeURIComponent(f.keyword)+'/');}
    catch {const search=await get(f.searchUrl);const urls=[...search.matchAll(/href="([^"?#]*-(\d{4}))\/?"/g)].filter(m=>+m[2]===f.year);const words=f.slug.split('-').filter(w=>w.length>2);urls.sort((a,b)=>words.filter(w=>b[1].includes(w)).length-words.filter(w=>a[1].includes(w)).length);if(!urls.length)throw Error('Keine Filmseite');f.movieUrl=new URL(urls[0][1]+'/', 'https://clip.cafe/').href;html=await get(f.movieUrl+'~'+encodeURIComponent(f.keyword)+'/');}
    let choices=clips(html).filter(c=>c.url.startsWith(f.movieUrl));
    choices.sort((a,b)=>Number(contains(b.excerpt,f.keyword))-Number(contains(a.excerpt,f.keyword)));
    if(!choices.length) choices=clips(await get(f.movieUrl)).filter(c=>c.url.startsWith(f.movieUrl));
    for(const c of choices.slice(0,5)) {
      const detail=await get(c.url);
      const time=detail.match(/Timestamp in Movie\s*<\/div>\s*<div[^>]*>\s*(\d\d:\d\d:\d\d)/)?.[1];
      if(!time || time==='00:00:00') continue;
      const lines=subtitles(detail);const windows=[];
      for(let i=0;i<lines.length;i++) for(let j=i;j<lines.length;j++) {
        const selected=lines.slice(i,j+1);const text=selected.map(l=>l.text).join(' ');const duration=lines[j].end-lines[i].start;
        if(duration>16 || f.avoidNames.some(n=>contains(lines[j].text,n))) break;
        if(duration<7 || text.split(/\s+/).length<10)continue;
        windows.push({clipStart:lines[i].start,clipEnd:lines[j].end,review:text,score:(contains(text,f.keyword)?25:0)-Math.abs(duration-11)});
      }
      windows.sort((a,b)=>b.score-a.score);
      if(!windows.length)continue;
      const w=windows[0];Object.assign(f,w,{clipUrl:c.url,sourceTimestamp:time,timestamp:stamp(sec(time)+w.clipStart),status:'subtitle-window',keywordMatched:contains(w.review,f.keyword)});delete f.score;return;
    }
    f.status='no-window';
  } catch(e) {f.status='error';f.error=e.message;}
}
let cursor=0,done=0;
await Promise.all(Array.from({length:4},async()=>{while(cursor<films.length){const f=films[cursor++];const prev=cached.find(c=>c.slug===f.slug&&c.keyword===f.keyword&&c.status==='subtitle-window');if(prev)Object.assign(f,prev);else await research(f);if(++done%20===0)console.log(`${done}/${films.length}`);await fs.writeFile(local,JSON.stringify(films,null,2));}}));
await fs.writeFile(local,JSON.stringify(films,null,2));
console.log(JSON.stringify(films.reduce((a,f)=>(a[f.status]=(a[f.status]||0)+1,a),{})));
