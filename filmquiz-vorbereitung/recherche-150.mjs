import fs from 'node:fs/promises';
const root = new URL('./', import.meta.url);
const cache = new URL('../.local/filmquiz-recherche/', root);
await fs.mkdir(cache, {recursive:true});
const decode = s => s.replace(/&quot;/g,'"').replace(/&#039;|&apos;/g,"'").replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n));
const plain = s => decode(s.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim());
async function get(url) {
 const path = new URL(Buffer.from(url).toString('base64url')+'.html',cache);
 try{return await fs.readFile(path,'utf8')}catch{}
 const response = await fetch(url,{signal:AbortSignal.timeout(25000)});
 if(!response.ok)throw Error('HTTP '+response.status);
 const html=await response.text();await fs.writeFile(path,html);return html;
}
const lines=(await fs.readFile(new URL('filme-150.txt',root),'utf8')).trim().split(/\r?\n/);
const films=lines.map((line,index)=>{const [title,year,slug,scene,keyword]=line.split('|');return {id:index+1,title,year:+year,slug,scene,keyword};});
const overrides={'e-t-the-extra-terrestrial':'e-t-the-extra-terrestrial-1982','se7en':'se7en-1995'};
function clips(html){return [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*class="[^"]*smallClipContainer[^\"]*"[^>]*>([\s\S]*?)<\/a>/g)].map(m=>({url:new URL(decode(m[1]),'https://clip.cafe/').href,excerpt:plain(m[2].match(/class="clipTitle"[^>]*title="([^"]*)"/)?.[1]||m[2].match(/<span class="clipTitle"[^>]*>([\s\S]*?)<\/span>/)?.[1]||''),duration:plain(m[2].match(/class="videoDuration"[^>]*>([^<]*)/)?.[1]||'')}));}
async function research(film){
 const movieUrl='https://clip.cafe/'+(overrides[film.slug]||film.slug+'-'+film.year)+'/';
 film.movieUrl=movieUrl;film.searchUrl='https://clip.cafe/?s='+encodeURIComponent(film.slug.replaceAll('-',' '))+'&ss=1';
 try{
  const html=await get(movieUrl+'~'+encodeURIComponent(film.keyword)+'/');
  const found=clips(html).filter(c=>c.url.includes('-'+film.year+'/'));
  if(!found.length){film.status='no-match';return film;}
  const selected=found.find(c=>c.excerpt.toLowerCase().includes(film.keyword.toLowerCase()))||found[0];
  film.clipUrl=selected.url;film.excerpt=selected.excerpt;
  const sceneHtml=await get(film.clipUrl);
  const stamp=sceneHtml.match(/Timestamp in Movie\s*<\/div>\s*<div[^>]*>\s*(\d\d:\d\d:\d\d)/)?.[1];
  const label=sceneHtml.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1];
  if(label)film.clipTitle=plain(label);
  film.timestamp=stamp&&stamp!=='00:00:00'?stamp:null;
  film.duration=sceneHtml.match(/>Duration<\/div>\s*<div[^>]*>\s*([^<]+)/)?.[1]?.trim()||selected.duration;
  film.status=film.timestamp?'source-time':'no-time';
 }catch(error){film.status='fetch-error';film.error=error.message;}
 return film;
}
export {get, clips, plain};
if (!process.env.FILMQUIZ_HELPERS_ONLY) {
let next=0,done=0;
await Promise.all(Array.from({length:4},async()=>{while(next<films.length){const film=films[next++];await research(film);done++;if(done%10===0)console.log(done+'/'+films.length+' recherchiert');await fs.writeFile(new URL('recherche-150.json',root),JSON.stringify(films,null,2));}}));
console.log(JSON.stringify(films.reduce((a,f)=>(a[f.status]=(a[f.status]||0)+1,a),{})));
}
