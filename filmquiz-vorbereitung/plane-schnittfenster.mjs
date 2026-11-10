import fs from 'node:fs/promises';
process.env.FILMQUIZ_HELPERS_ONLY='1';
const {get,plain}=await import('./recherche-150.mjs');
const root=new URL('./',import.meta.url);
const films=JSON.parse(await fs.readFile(new URL('../.local/filmquiz-mittel-vorschlaege.json',root),'utf8'));
const old=JSON.parse(await fs.readFile(new URL('../.local/filmquiz-erste-auswahl.json',root),'utf8'));
const bans=new Map((await fs.readFile(new URL('namen-auslassen.txt',root),'utf8')).trim().split(/\r?\n/).map(l=>{const[id,words]=l.split('|');return[+id,words.split(',')];}));
const norm=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const contains=(text,phrase)=>(' '+norm(text)+' ').includes(' '+norm(phrase)+' ');
const seconds=s=>s.split(':').reduce((n,v)=>n*60+Number(v),0);
const hhmmss=n=>[Math.floor(n/3600),Math.floor(n%3600/60),Math.floor(n%60)].map(n=>String(n).padStart(2,'0')).join(':');
function subtitles(html,lang){
 const marker=new RegExp('<div\\b[^>]*class="transcript-panel[^\"]*"[^>]*data-lang="'+lang+'"[^>]*>');
 const start=html.search(marker);if(start<0)return[];
 const section=html.slice(start).split(/<div\b[^>]*class="transcript-panel/).slice(0,1)[0];
 // The marker itself starts at the first panel; find its end using the next panel.
 const remaining=html.slice(start);const tail=remaining.slice(remaining.indexOf('>')+1);const content=tail.split(/<div\b[^>]*class="transcript-panel/)[0];
 return [...content.matchAll(/class="subtitleTime"[^>]*>(\d\d:\d\d:\d\d\.\d+)\s*--&gt;\s*(\d\d:\d\d:\d\d\.\d+)<\/div>\s*<div[^>]*class="subtitleLine"[^>]*>([\s\S]*?)<\/div>|class="subtitleTime"[^>]*>(\d\d:\d\d:\d\d\.\d+)\s*-->\s*(\d\d:\d\d:\d\d\.\d+)<\/div>\s*<div[^>]*class="subtitleLine"[^>]*>([\s\S]*?)<\/div>/g)].map(m=>({start:seconds(m[1]||m[4]),end:seconds(m[2]||m[5]),text:plain(m[3]||m[6])})).filter(l=>l.end>l.start&&l.end-l.start<30);
}
const rejected=new Set([48,67,74,78,80,111]);
for(const f of films){
 if(f.proposed&&!rejected.has(f.id)){f.clipUrl=f.proposed.clipUrl;f.timestamp=f.proposed.timestamp;f.scene=f.proposed.scene;f.cutCue=f.proposed.keyword;}
}
const overrides={
5:{clipUrl:'https://clip.cafe/indiana-jones-the-raiders-of-the-lost-ark-1981/snakes-s4/',timestamp:'01:00:47',scene:'Zwei Männer blicken in eine Grabkammer voller Schlangen und streiten kurz darüber, wer zuerst hineingehen soll.',cutCue:'snakes'},
14:{clipUrl:'https://clip.cafe/home-alone-1990/is-toothbrush-approved-by-the-american-dental-association/',timestamp:'00:38:52',cutCue:'toothbrush'},
32:{scene:'Ein Techniker erklärt anhand eines Schachspiels, dass ein rätselhaftes Signal die Angreifer synchronisiert und einen Countdown enthält.',cutCue:'countdown'},
42:{clipUrl:old.find(f=>f.slug==='fight-club').clipUrl,timestamp:old.find(f=>f.slug==='fight-club').timestamp,scene:'Zwei Männer verabreden sich zum Seifemachen und sprechen über das dafür nötige Fett.',cutCue:'soap'},
48:{scene:'Ein maskierter Arenakämpfer antwortet dem Kaiser auf dessen Forderung, sein Gesicht zu zeigen. Nur den Teil ohne seine Namensvorstellung verwenden.',cutCue:'vengeance'},
67:{scene:'Ein Lehrer fordert die Klasse mit seiner markanten Stimme auf, eine bestimmte Buchseite aufzuschlagen.',cutCue:'394'},
89:{scene:'Nach einem missglückten Treffen wird erklärt, dass sich ein Undercover-Offizier durch seine Fingerhaltung beim Bestellen dreier Gläser verraten hat.',cutCue:'three'},
111:{clipUrl:old.find(f=>f.slug==='paddington')?.clipUrl||films.find(f=>f.id===111).clipUrl}
};
// Paddington is not part of the old list: use the earlier verified family scene.
const prior=JSON.parse(await fs.readFile(new URL('../.local/filmquiz-v2-review.json',root),'utf8'));
const paddington=prior.find(f=>f.slug==='paddington');if(paddington){overrides[111]={clipUrl:paddington.clipUrl,timestamp:paddington.timestamp,scene:'Eine Bärenfamilie erklärt, warum ein Marmeladensandwich alle Nährstoffe für einen Tag liefert.',cutCue:'vitamins'};}
for(const[id,value]of Object.entries(overrides))Object.assign(films.find(f=>f.id===+id),value);
const cues=['tattoo','binary','acid','bash','snakes','phone','Twinkie','clothes','Pepsi','spaghetti','toes','desk','finished','toothbrush','commission','accent','prisoner','wishes','instrument','should','fruiting','wreck','stars','pajamas','oak','shrimp','bourbon','soldier','dice','box','falling','countdown','popcorn','number','sugar','spit','earn','rug','cocoa','camp','librarian','soap','cat','remembering','dark','dead','fire','vengeance','breakfast','child','jump','casinos','parfaits','pilot','stew','duck','flame','web','prayers','carry','swimming','pirate','band','bullies','chocolate','cape','394','yet','immortality','defines','chocolate','underwater','airplanes','shovel','right','blue','flood','gum','French','robotic','cheeseburger','soup','father','pencil','lamb','directive','million','tiger','three','kiss','collar','dragon','unicorn','dream','daycare','spell','secretary','chocolat','funeral','volunteer','bounty','adopted','thunder','new','skull','card','pen','pain','reflexes','years','vitamins','instructions','broccoli','potatoes','relationship','banana','garbage','landing','memory','news','suitcase','prize','chicken','hurry','shoes','spell','cake','show','rabbit','Sneakers','minutes','faith','time','older','doughnut','legs','spark','box','gift','coffee','forget','water','nine','admiral','heels','mushroom','zero','morsel','orange','Odyssey'];
for(const f of films)f.cutCue=cues[f.id-1];
const extra={19:['Alma'],27:['Martin','Lewis','Amos','Andy'],52:['Dominic'],57:['Manfred'],67:['Draco','Pomfrey'],100:['Effie'],119:['Stan'],135:['Walt'],141:['Stephen'],150:['Baby Knife']};
let cursor=0;
await Promise.all(Array.from({length:3},async()=>{while(cursor<films.length){const f=films[cursor++];f.avoidNames=[...(bans.get(f.id)||[]),...(extra[f.id]||[])];
 try{
 const html=await get(f.clipUrl);let en=subtitles(html,'en');f.cutLanguage='en';if(!en.length){en=subtitles(html,'fr');f.cutLanguage='fr';}const de=subtitles(html,'de');
 const mediaDuration=Number(html.match(/>Duration<\/div>\s*<div[^>]*>\s*([0-9.]+)\s*seconds/)?.[1])||Infinity;
 const forbidden=l=>f.avoidNames.some(name=>contains(l.text,name));
 const candidates=[];
 for(let i=0;i<en.length;i++){
  if(forbidden(en[i]))continue;
  for(let j=i;j<en.length;j++){
   if(forbidden(en[j]))break;
   const start=en[i].start,end=en[j].end,duration=end-start;if(duration>19)break;
   if(j>i&&en[j].start-en[j-1].end>5)break;
   if(duration<3||end>mediaDuration+0.8)continue;
   const text=en.slice(i,j+1).map(l=>l.text).join(' ');if(text.split(/\s+/).length<5)continue;
   const cue=f.cutCue&&contains(text,f.cutCue)?25:0;
   const score=cue+Math.min(text.split(/\s+/).length,30)/3-Math.abs(duration-11);
   candidates.push({start,end,score,text,deAvailable:de.length>0});
  }
 }
 candidates.sort((a,b)=>b.score-a.score);
 f.sourceTimestamp=f.timestamp;
 const relevant=candidates.filter(c=>!f.cutCue||contains(c.text,f.cutCue));
 if(relevant.length){const best=relevant[0];f.clipStart=+best.start.toFixed(3);f.clipEnd=+best.end.toFixed(3);f.timestamp=hhmmss(seconds(f.sourceTimestamp)+best.start);f.cutStatus='subtitle-window';f.cutTextStart=best.text.split(/\s+/).slice(0,4).join(' ');f.cutTextEnd=best.text.split(/\s+/).slice(-4).join(' ');f.cutReview=best.text;f.cutDeAvailable=best.deAvailable;}
 else{f.cutStatus='manual';f.cutNote='Im verlinkten Ausschnitt Namen auslassen; Schnitt für beide Tonspuren beim Abhören festlegen.';}
 f.subtitleCount=en.length;
 }catch(e){f.cutStatus='manual';f.cutNote='Untertitel nicht auswertbar; Namen beim Abhören auslassen.';f.cutError=e.message;}
}}));
await fs.writeFile(new URL('../.local/filmquiz-mittel-schnittpruefung.json',root),JSON.stringify(films,null,2));
console.log('Schnittfenster:',films.filter(f=>f.cutStatus==='subtitle-window').length,'Manuell:',films.filter(f=>f.cutStatus==='manual').map(f=>({id:f.id,title:f.title,lines:f.subtitleCount,error:f.cutError})));
