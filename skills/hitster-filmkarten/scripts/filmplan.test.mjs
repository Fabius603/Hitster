import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {parseFilms, matchingCard} from './filmplan.mjs';

const repo = path.resolve(process.env.HITSTER_PROJECT || '.');
const html = fs.readFileSync(path.join(repo,'filmquiz-vorbereitung/filme-150.html'),'utf8');

test('alle 150 HTML-Zeilen samt Zeiten, Links und Entities einlesen',()=>{
  const films = parseFilms(html);
  assert.equal(films.length,150);
  const sourceTime=html.match(/<td class="time">([^<]+)<\/td>/)[1];
  assert.equal(films[0].timestamp,sourceTime);
  assert.equal(films[0].title,'Der weiße Hai');
  assert.ok(!films[0].scene.includes('Schnitt & Auslassen'));
  if (html.includes('class="cut-box"')) assert.match(films[0].cutHints,/Schnitt & Auslassen/);
  assert.equal(films[149].title,'Deadpool & Wolverine');
  assert.ok(films.every(f=>(!f.filmo || new URL(f.filmo).protocol==='http:') &&new URL(f.clipCafe).protocol==='https:'));
  assert.ok(films.every(f=> f.de.verified === false && f.en.verified === false));
  assert.throws(()=>parseFilms(html.replace(`<td class="time">${sourceTime}<`,'<td class="time">01:99:28<')),/Ungültige Zeit/);
  assert.throws(()=>parseFilms('<html/>'),/Keine eindeutigen/);
});

test('Kartenabgleich verlangt beide Sprachen und dieselbe Szene/Zeit',()=>{
  const entry = parseFilms(html)[0];
  const card = {id:'006',tracks:{de:'de.mp3',en:'en.mp3'},answer:{...entry}};
  assert.equal(matchingCard([card],entry),card);
  assert.equal(matchingCard([{...card,tracks:{de:'de.mp3'}}],entry),undefined);
  assert.equal(matchingCard([card],{...entry,timestamp:'00:00:01'}),undefined);
});

function wav(file) {
  const rate = 44100, count = rate*6;
  const buffer = Buffer.alloc(44+count*2);
  buffer.write('RIFF'); buffer.writeUInt32LE(buffer.length-8,4); buffer.write('WAVEfmt ',8);
  buffer.writeUInt32LE(16,16); buffer.writeUInt16LE(1,20); buffer.writeUInt16LE(1,22);
  buffer.writeUInt32LE(rate,24); buffer.writeUInt32LE(rate*2,28); buffer.writeUInt16LE(2,32);
  buffer.writeUInt16LE(16,34); buffer.write('data',36); buffer.writeUInt32LE(count*2,40);
  for(let i=rate*2;i<count;i++) buffer.writeInt16LE(Math.round(9000*Math.sin(2*Math.PI*440*i/rate)),44+i*2);
  fs.writeFileSync(file,buffer);
}

test('echter MP3-Import, freie IDs, Wiederholung und fehlerhafte Spuren',()=>{
  const dll = path.join(repo,'.local/filmaufnahme/build/bin/RecorderCli/release/RecorderCli.dll');
  assert.ok(fs.existsSync(dll),'Zuerst recorder.ps1 -Command build ausführen.');
  const base = path.join(repo,'.local/filmaufnahme/tests');
  fs.mkdirSync(base,{recursive:true});
  const project = fs.mkdtempSync(path.join(base,'case-'));
  const audio = path.join(project,'variants/film/audio');
  fs.mkdirSync(audio,{recursive:true});
  fs.writeFileSync(path.join(project,'variants.json'),'[]');
  const cardsFile=path.join(project,'variants/film/cards.json');
  fs.writeFileSync(cardsFile,JSON.stringify([{id:'001',file:'audio/001.mp3',description:'Vorhanden'}]));
  fs.writeFileSync(path.join(audio,'002-en.mp3'),'belegter Dateiname');
  const raw=path.join(project,'raw.wav'); wav(raw);
  const entry=parseFilms(html)[0];
  entry.de={file:'raw.wav',start:2,length:2,verified:true};
  entry.en={...entry.de};
  const planPath=path.join(project,'plan.json');
  const save=()=>fs.writeFileSync(planPath,JSON.stringify({version:1,entries:[entry]}));
  const cli=(...args)=>spawnSync('dotnet',[dll,...args],{encoding:'utf8',timeout:30000});
  const preview=path.join(project,'preview.mp3');
  let previewResult=cli('cut','--file',raw,'--start','2','--length','2','--out',preview);
  assert.equal(previewResult.status,0,previewResult.stderr);
  const previewBytes=fs.readFileSync(preview);
  previewResult=cli('cut','--file',raw,'--start','2','--length','2','--out',preview);
  assert.notEqual(previewResult.status,0);
  assert.deepEqual(fs.readFileSync(preview),previewBytes);
  const run=()=>cli('import','--project',project,'--plan',planPath,'--entry','1');
  save();
  let result=run();
  assert.equal(result.status,0,result.stderr); assert.match(result.stdout,/SAVED 003/);
  const cards=JSON.parse(fs.readFileSync(cardsFile,'utf8'));
  assert.equal(cards.length,2); assert.equal(cards[0].id,'001');
  assert.equal(cards[1].answer.title,entry.title);
  for(const lang of ['de','en']) {
    const mp3=path.join(project,'variants/film',cards[1].tracks[lang]);
    assert.ok(fs.statSync(mp3).size>1000);
    result=cli('inspect','--file',mp3);
    assert.equal(result.status,0,result.stderr);
    const info=JSON.parse(result.stdout); assert.ok(info.Duration>1.9 && info.Duration<2.2);
  }
  result=run(); assert.equal(result.status,0,result.stderr); assert.match(result.stdout,/EXISTS 003/);
  assert.equal(JSON.parse(fs.readFileSync(cardsFile,'utf8')).length,2);
  const before=fs.readFileSync(cardsFile,'utf8');
  entry.timestamp='01:21:29'; entry.en.verified=false; save();
  result=run(); assert.notEqual(result.status,0); assert.match(result.stderr,/nicht geprüft/);
  entry.en.verified=true; entry.en.start=0; entry.en.length=1.5; save();
  result=run(); assert.notEqual(result.status,0); assert.match(result.stderr,/stumm/);
  entry.en.start=5; entry.en.length=2; save();
  result=run(); assert.notEqual(result.status,0);
  assert.equal(fs.readFileSync(cardsFile,'utf8'),before);
  assert.deepEqual(fs.readdirSync(audio).sort(),['002-en.mp3','003-de.mp3','003-en.mp3']);
  result=cli('record','--out',raw,'--seconds','3');
  assert.notEqual(result.status,0); assert.ok(fs.statSync(raw).size>1000);
  const session=spawnSync('dotnet',[dll,'session','--project',project],{
    input:[{command:'start',out:raw,seconds:3,requestId:1},{command:'stop'},{command:'quit'}].map(x=>JSON.stringify(x)).join('\n')+'\n',
    encoding:'utf8',timeout:10000});
  assert.equal(session.status,0,session.stderr);
  const messages=session.stdout.trim().split(/\r?\n/).map(x=>JSON.parse(x));
  assert.deepEqual(messages.map(x=>x.status),['ready','error','idle','bye']);
  assert.equal(messages[1].requestId,'1');
  entry.timestamp=cards[1].answer.timestamp;
  entry.de={file:'raw.wav',start:2,length:2,verified:true}; entry.en={...entry.de};
  const pending={...structuredClone(entry),sourceId:2,de:{...entry.de,verified:false}};
  const blocked={...structuredClone(entry),sourceId:3,blocked:'Quelle fehlt'};
  const broken={...structuredClone(entry),sourceId:4,timestamp:'00:00:09',en:{...entry.en,file:'missing.wav'}};
  fs.writeFileSync(planPath,JSON.stringify({version:1,entries:[entry,pending,blocked,broken]}));
  result=cli('import-batch','--project',project,'--plan',planPath,'--entries','1-4');
  assert.equal(result.status,1);
  assert.deepEqual(JSON.parse(result.stdout).map(x=>x.Status),['EXISTS','PENDING','BLOCKED','FAILED']);
  assert.equal(fs.readFileSync(cardsFile,'utf8'),before);
});
