import fs from 'node:fs/promises';
process.env.FILMQUIZ_HELPERS_ONLY='1';
const {get,clips}=await import('./recherche-150.mjs');
const root=new URL('./',import.meta.url);
const films=JSON.parse(await fs.readFile(new URL('../.local/filmquiz-v2-review.json',root),'utf8'));
const old=JSON.parse(await fs.readFile(new URL('../.local/filmquiz-erste-auswahl.json',root),'utf8'));
const overrides={
32:{title:'Mission: Impossible – Phantom Protokoll',year:2011,slug:'mission-impossible-4-ghost-protocol',clipUrl:'https://clip.cafe/mission-impossible-4-ghost-protocol-2011/as-always-should-you-or-any-memberof-your-team-be-caught-or-killedthe-secretary-will-disavow-any/',timestamp:'00:19:06'},
49:{clipUrl:'https://clip.cafe/cast-away-2000/im-sorry-wilson/',timestamp:'01:43:53'},
81:{clipUrl:'https://clip.cafe/transformers-2007/are-samuel-james-witwicky-descendent-of-archibald-witwicky/',timestamp:'01:02:54'},
82:{clipUrl:'https://clip.cafe/the-princess-the-frog-2009/i-well-listen/'},
107:{clipUrl:'https://clip.cafe/interstellar-2014/messages-span-23-years-play-it-from-the-beginning/',timestamp:'01:18:42'}
};
for(const[id,values]of Object.entries(overrides))Object.assign(films[+id-1],values);
const avatar=old.find(f=>f.slug==='avatar');films[88].clipUrl=avatar.clipUrl;films[88].timestamp=avatar.timestamp;
// Eine konkrete Chorprobe statt einer beliebigen Unterhaltung im Kloster.
try{const options=clips(await get('https://clip.cafe/sister-act-1992/~octave/'));if(options.length){const opt=options[0];const html=await get(opt.url);const time=html.match(/Timestamp in Movie\s*<\/div>\s*<div[^>]*>\s*(\d\d:\d\d:\d\d)/)?.[1];if(time&&time!=='00:00:00'){Object.assign(films[18],{clipUrl:opt.url,timestamp:time,review:opt.excerpt});console.log('Chorprobe',opt.excerpt.slice(0,600));}}}catch(e){console.log('Chorprobe offen',e.message)}
// Präzise Science-Fiction-Anspielung aus dem tatsächlich verlinkten Ausschnitt.
try{const options=clips(await get('https://clip.cafe/avengers-infinity-war-2018/~Groot/'));const opt=options.find(o=>o.excerpt.includes('Steve Rogers'))||options.find(o=>o.excerpt.toLowerCase().includes('tree'))||options.find(o=>o.excerpt.toLowerCase().includes('groot'));if(opt){const html=await get(opt.url);const time=html.match(/Timestamp in Movie\s*<\/div>\s*<div[^>]*>\s*(\d\d:\d\d:\d\d)/)?.[1];if(time&&time!=='00:00:00'){Object.assign(films[128],{clipUrl:opt.url,timestamp:time,review:opt.excerpt});console.log('Infinity',opt.excerpt.slice(0,700));}}}catch(e){console.log('Infinity offen',e.message)}
for(const f of films.filter(f=>f.clipUrl&&!f.timestamp)){try{const html=await get(f.clipUrl);f.timestamp=html.match(/Timestamp in Movie\s*<\/div>\s*<div[^>]*>\s*(\d\d:\d\d:\d\d)/)?.[1];}catch{}}
const sceneChanges={
3:'Die Crew entdeckt, dass das Blut des fremden Wesens aus Säure besteht und sich durch den Boden des Raumschiffs frisst.',
5:'Indiana flieht in einem Flugzeug, entdeckt eine Schlange und erklärt dem Piloten lautstark, dass er Schlangen hasst.',
11:'John steht dem Anführer der Geiselnehmer gegenüber und antwortet auf dessen Cowboy-Vergleich mit seinem berühmten Spruch.',
13:'Kevin schaut einen Gangsterfilm, in dem ein Mann seinen Gegner mit der Aufforderung verabschiedet, das Wechselgeld zu behalten.',
22:'Mrs. Doubtfire bewirft den neuen Freund ihrer Exfrau mit Obst und behauptet anschließend empört, es sei ein Anschlag aus der Küche gewesen.',
30:'Mills verlangt verzweifelt zu erfahren, was sich in dem gelieferten Paket befindet, während sein Kollege ihn zum Weglegen der Waffe auffordert.',
36:'Agent K erklärt einer Gruppe Augenzeugen das Blitzgerät, mit dem die Men in Black Erinnerungen löschen.',
40:'Der schwer verletzte Captain Miller richtet seine letzten Worte an Ryan und fordert ihn auf, sich das gerettete Leben zu verdienen.',
47:'John Coffey stellt sich vor; seine Gesprächspartnerin vergleicht seinen Nachnamen mit dem Getränk Kaffee.',
53:'Bei der Ausbildung der Monster wird erklärt, dass ein Menschenkind angeblich hochgiftig und gefährlich sei.',
55:'Sid ernennt sich stolz zum Herrscher über das Feuer, während die anderen bemerken, dass sein Schwanz brennt.',
64:'Bruce setzt seine neuen göttlichen Kräfte auf absurde Weise ein und erklärt, dass nun sein Wille geschehen solle.',
68:'Snape übernimmt die Unterrichtsstunde und fordert die Klasse mit seiner markanten Stimme auf, Seite 394 aufzuschlagen.',
80:'Ein Erzähler stellt die französische Küche und den berühmten Pariser Koch Gusteau vor, dessen Motto das Kochen für jeden ist.',
83:'Pos Vater verrät ihm, dass seine berühmte Suppe keine geheime Zutat enthält – und Po versteht, was das für ihn bedeutet.',
84:'WALL·E versucht Kontakt zu EVE aufzunehmen, während sie immer wieder nach seiner Direktive fragt.',
87:'Sophie erklärt ihren Freundinnen, dass sie ihre Hochzeit perfekt machen und endlich ihren Vater erkennen möchte.',
92:'Hicks erklärt, dass sein Leben leichter wäre, wenn er endlich einen Drachen töten könnte; seine Ungeschicklichkeit spricht dagegen.',
103:'Die kleinen Schwestern spielen mit Elsas Schneemagie und erfinden Olaf, der sich mit seiner Vorliebe für Umarmungen vorstellt.',
111:'Paddingtons Familie erklärt, warum ein einziges Marmeladensandwich alle Nährstoffe für einen Bären liefert.',
124:'Miguel erzählt, warum Musik in seiner Familie verboten wurde und seine Vorfahren stattdessen Schuhe herstellen.',
133:'Tony richtet in seiner aufgezeichneten Abschiedsbotschaft seine besondere Liebeserklärung an seine Tochter.',
137:'Mirabel stellt die magischen Familienmitglieder vor; bei dem verschwundenen Bruno wird sofort erklärt, dass man nicht über ihn spricht.',
141:'Maverick wird wegen seiner ungewöhnlichen Karriere zur Rede gestellt: Trotz seiner Flugleistungen ist er noch immer kein Admiral.',
142:'Der gestiefelte Kater begegnet seinen acht verbrauchten Leben, die ihn mit Spitznamen begrüßen und an seine Sterblichkeit erinnern.',
150:'Deadpool erklärt dem Publikum direkt, warum er Wolverines Tod nicht akzeptieren will und was dessen Heilungskräfte damit zu tun haben.'
};
for(const[id,scene]of Object.entries(sceneChanges))films[+id-1].scene=scene;
await fs.writeFile(new URL('../.local/filmquiz-v2-final-review.json',root),JSON.stringify(films,null,2));
console.log('Fehlende Zeiten:',films.filter(f=>!f.timestamp).map(f=>f.title));
