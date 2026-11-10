import fs from 'node:fs/promises';
process.env.FILMQUIZ_HELPERS_ONLY='1';
const {get,clips}=await import('./recherche-150.mjs');
const root=new URL('./',import.meta.url);
const old=JSON.parse(await fs.readFile(new URL('recherche-150.json',root),'utf8'));
const source=(await fs.readFile(new URL('filme-bekannt.txt',root),'utf8')).trim().split(/\r?\n/).map((line,i)=>{const[title,year,slug,scene,keyword]=line.split('|');return{id:i+1,title,year:+year,slug,scene,keyword};});
const norm=s=>s.toLowerCase().replace(/&quot;/g,' ').replace(/[^a-z0-9]+/g,' ').trim();
async function movie(f){
 const previous=old.find(o=>o.year===f.year&&o.slug===f.slug);
 let url=previous?.movieUrl||'https://clip.cafe/'+f.slug+'-'+f.year+'/';
 try{await get(url);return url}catch{}
 const search=await get(f.searchUrl);
 const candidates=[...search.matchAll(/href="([^"?#]*-([0-9]{4}))\/?"/g)].filter(m=>+m[2]===f.year);
 const tokens=f.slug.split('-').filter(t=>!['the','and','of','a','in'].includes(t));
 candidates.sort((a,b)=>tokens.filter(t=>b[1].includes(t)).length-tokens.filter(t=>a[1].includes(t)).length);
 if(!candidates.length)throw Error('Filmseite nicht gefunden');
 return new URL(candidates[0][1]+'/', 'https://clip.cafe/').href;
}
async function research(f){
 f.searchUrl='https://clip.cafe/?s='+encodeURIComponent(f.slug.replaceAll('-',' '))+'&ss=1';
 try{
 f.movieUrl=await movie(f);
 const keyword=f.keyword==='88'?'miles':f.keyword;
 let candidates=clips(await get(f.movieUrl+'~'+encodeURIComponent(keyword)+'/')).filter(c=>c.url.startsWith(f.movieUrl));
 const words=norm(keyword).split(' ');
 candidates.sort((a,b)=>{const score=c=>(norm(c.excerpt).includes(norm(keyword))?20:0)+words.filter(w=>norm(c.excerpt).includes(w)).length;return score(b)-score(a);});
 for(const candidate of candidates.slice(0,5)){
  const html=await get(candidate.url);
  const time=html.match(/Timestamp in Movie\s*<\/div>\s*<div[^>]*>\s*(\d\d:\d\d:\d\d)/)?.[1];
  if(!time||time==='00:00:00')continue;
  f.clipUrl=candidate.url;f.timestamp=time;f.review=candidate.excerpt;f.status='source-time';return;
 }
 f.status='no-match';
 }catch(e){f.status='fetch-error';f.error=e.message;}
}
let cursor=0,done=0;
await Promise.all(Array.from({length:4},async()=>{while(cursor<source.length){await research(source[cursor++]);done++;if(done%15===0)console.log(done+'/'+source.length);}}));
await fs.writeFile(new URL('../.local/filmquiz-v2-review.json',root),JSON.stringify(source,null,2));
console.log(JSON.stringify(source.reduce((a,f)=>(a[f.status]=(a[f.status]||0)+1,a),{})));
