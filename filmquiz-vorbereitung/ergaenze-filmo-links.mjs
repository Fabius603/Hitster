import fs from 'node:fs/promises';
const root=new URL('./',import.meta.url),cache=new URL('../.local/filmo-recherche/',root);
await fs.mkdir(cache,{recursive:true});
const films=JSON.parse(await fs.readFile(new URL('recherche-150.json',root),'utf8'));
const decode=s=>s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#039;|&apos;/g,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n));
const plain=s=>decode(s.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim());
const norm=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/ß/g,'ss').replace(/[^a-z0-9]+/g,' ').trim();
async function get(url){const file=new URL(Buffer.from(url).toString('base64url')+'.html',cache);try{return await fs.readFile(file,'utf8')}catch{}const response=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('HTTP '+response.status);const html=await response.text();await fs.writeFile(file,html);return html;}
function results(html){return [...html.matchAll(/<a\b[^>]*href="(http:\/\/45\.10\.243\.23\/movies\/[^"?#]+)"[^>]*>([\s\S]*?)<\/a>/g)].map(m=>({url:m[1],title:plain(m[2].match(/<h[234][^>]*>([\s\S]*?)<\/h[234]>/)?.[1]||'')})).filter(x=>x.title);}
function score(title,f){const a=norm(title),b=norm(f.title),en=norm(f.slug.replaceAll('-',' '));if(a===b||a===en)return 2;if(a.startsWith(b+' ')||a.startsWith(en+' '))return 1.2;const tokens=s=>s.split(' ').filter(t=>t.length>1&&!['der','die','das','the','and','und','of','ein','eine','des','von'].includes(t));const aa=tokens(a);const sim=q=>{const bb=tokens(q);return aa.filter(t=>bb.includes(t)).length/Math.max(aa.length,bb.length,1)};return Math.max(sim(b),sim(en));}
async function find(f){
 f.filmoSearchUrl='http://45.10.243.23/search?q='+encodeURIComponent(f.title);
 const queries=[f.title,f.title.split(/\s[–—]\s|:/)[0],f.slug.replaceAll('-',' ')].filter((q,i,a)=>a.indexOf(q)===i);
 const examined=new Set();
 for(const query of queries){
  let found;try{found=results(await get('http://45.10.243.23/search?q='+encodeURIComponent(query)))}catch(e){f.filmoError=e.message;continue;}
  found.sort((a,b)=>score(b.title,f)-score(a.title,f));
  for(const candidate of found.slice(0,5)){
   if(examined.has(candidate.url)||score(candidate.title,f)<0.45)continue;examined.add(candidate.url);
   try{const html=await get(candidate.url);const title=plain(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1]||'');const year=html.match(/ft-meta-label[^>]*>\s*(\d{4})\s*<\/span>/)?.[1]||html.match(/Erscheinungsdatum:\s*(\d{4})/)?.[1];
    if(+year===f.year&&score(title,f)>=0.45){f.filmoUrl=candidate.url;f.filmoTitle=title;f.filmoYear=+year;delete f.filmoError;return;}
   }catch(e){f.filmoError=e.message;}
  }
 }
}
let cursor=0,done=0;
await Promise.all(Array.from({length:4},async()=>{while(cursor<films.length){const f=films[cursor++];if(!f.filmoUrl)await find(f);done++;if(done%15===0)console.log(done+'/150 · '+films.filter(x=>x.filmoUrl).length+' zugeordnet');}}));
await fs.writeFile(new URL('recherche-150.json',root),JSON.stringify(films,null,2));
console.log('NICHT GEFUNDEN:',JSON.stringify(films.filter(f=>!f.filmoUrl).map(({id,title,year,filmoError})=>({id,title,year,filmoError}))));
console.log('PRÜFEN:',JSON.stringify(films.filter(f=>f.filmoUrl&&norm(f.title)!==norm(f.filmoTitle)).map(({id,title,filmoTitle,year})=>({id,title,filmoTitle,year}))));
