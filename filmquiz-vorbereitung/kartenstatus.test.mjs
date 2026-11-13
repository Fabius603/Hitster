import test from 'node:test';
import assert from 'node:assert/strict';
import {findCard, scanCards, uniqueFilms} from './kartenstatus.mjs';

test('bereits angelegte Karten trotz Schreibvarianten und anderer Szene erkennen', () => {
  const card = {id:'123',tracks:{de:'audio/123-de.mp3'},answer:{title:'Der König – Rückkehr',year:'2001',timestamp:'00:00:01'}};
  assert.equal(findCard([card],{title:'Der Konig - Ruckkehr',year:2001,timestamp:'00:50:00'}),card);
  assert.equal(findCard([card],{title:'Der König',year:2001}),card);
  assert.equal(findCard([card],{title:'Der König',year:2020}),undefined);
  assert.equal(findCard([{...card,tracks:{en:'en.mp3'}}],{title:'Der König',year:2001}).id,card.id);
});

test('ähnliche Titel desselben Jahres nicht als vorhandene Karte behandeln', () => {
  const cards=[{id:'1',answer:{title:'Bullet Train Down',year:2022}}];
  assert.equal(findCard(cards,{title:'Bullet Train',year:2022}),undefined);
});

test('Queue nach jedem Kartenstand neu bestimmen; Suchlinks nicht aufnehmen', () => {
  const film={id:1,title:'Ein Film',year:2000,filmoUrl:'http://example.com/movies/ein-film'};
  const noLink={id:2,title:'Ohne Link',year:2001,filmoUrl:'http://example.com/search?q=film'};
  assert.deepEqual(scanCards([film,noLink],[]).map(r=>r.status),['offen','kein Filmlink']);
  assert.deepEqual(scanCards([film,noLink],[{id:'5',answer:{title:'Ein Film',year:2000}}]).map(r=>r.status),['vorhanden','kein Filmlink']);
});

test('überlappende Listen nur einmal übernehmen; Neuverfilmungen erhalten', () => {
  const a={id:1,title:'Ein Film',year:2000,clipUrl:'https://clip/a'};
  const b={id:2,title:'Ein Film',year:2000,clipUrl:'https://clip/a',filmoUrl:'http://example.com/movies/a'};
  const c={id:3,title:'Ein Film',year:2020,clipUrl:'https://clip/b'};
  const result=uniqueFilms([structuredClone(a),b,c]);
  assert.equal(result.length,2);assert.equal(result[0].filmoUrl,b.filmoUrl);
});
