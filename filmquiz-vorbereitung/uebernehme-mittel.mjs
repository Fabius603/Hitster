import fs from 'node:fs/promises';
const root=new URL('./',import.meta.url);
const films=JSON.parse(await fs.readFile(new URL('../.local/filmquiz-mittel-schnittpruefung.json',root),'utf8'));
const notes=new Map((await fs.readFile(new URL('schnitthinweise-mittel.txt',root),'utf8')).trim().split(/\r?\n/).map(line=>{const[id,note]=line.split('|');return[+id,note];}));
const refinements={
25:'Ein Gefangener beschreibt seinem Freund eine abgelegene Feldmauer, einen großen Baum und ein dort verstecktes Versprechen.',
45:'Ein neu eingelieferter Gefangener möchte wissen, ob nachts das Licht brennt, weil er sich in fremden Räumen im Dunkeln fürchtet.',
57:'Ein Faultier wird nach seinem Erfolg mit dem Feuer darauf hingewiesen, dass sein eigener Schwanz brennt.',
67:'Ein strenger Lehrer fordert die Klasse auf, eine bestimmte Buchseite aufzuschlagen.',
74:'Eine Gruppe kleiner Ausbrecher bespricht einen Tunnelplan und die kaputte Schaufel.',
77:'Ein Tal droht überflutet zu werden; ein Tier schlägt vor, sich möglichst schnell zu einem Wasserwesen weiterzuentwickeln.',
98:'Ein Restaurantgast beschwert sich über einen vermeintlich ungebackenen Schokoladenkuchen und bestellt lieber eine Tarte.',
123:'Zwei Menschen diskutieren, ob ein erstaunlich begriffsstutziges Huhn zu irgendetwas taugt oder besser gegessen werden sollte.',
139:'Eine Großmutter erklärt die magische Kerze und die besonderen Gaben ihrer Familie.'
};
for(const f of films){
 f.cutNote=notes.get(f.id);if(!f.cutNote)throw Error('Schnitthinweis fehlt: '+f.id);
 if(refinements[f.id])f.scene=refinements[f.id];
 f.difficulty='mittel';
 delete f.proposed;delete f.proposalError;delete f.cutReview;delete f.cutError;delete f.subtitleCount;delete f.cutCue;delete f.cutDeAvailable;
}
await fs.writeFile(new URL('recherche-150.json',root),JSON.stringify(films,null,2));
await import('./baue-tabelle.mjs');
