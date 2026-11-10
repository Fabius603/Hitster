import fs from 'node:fs/promises';
const root=new URL('./',import.meta.url);
const films=JSON.parse(await fs.readFile(new URL('recherche-150.json',root),'utf8'));
const corrections={
1:'Ein kleines Mädchen bietet seinem ungewöhnlichen Besucher Blumen an und lässt sie auf dem Wasser treiben.',
3:'Eine junge Frau und ein Seemann streiten darüber, ob Frauen an Bord eines Schiffes nur im Weg sind.',
4:'Schneewittchen verteilt beim Hausputz Aufgaben: Geschirr, Kamin und Fußboden müssen sauber werden.',
5:'Ein Prinz lässt seinem ungebetenen Gast demonstrativ etwas zu essen bringen.',
8:'Zwei Staatschefs unterhalten sich beim Rasieren über die Aussicht durch Glaswände und eine Glasdecke.',
11:'Die Waldtiere begrüßen einander an einem sonnigen Morgen.',
16:'Ein Drehbuchautor diskutiert mit einer Lektorin darüber, ob Filme eine Botschaft haben müssen.',
17:'Ein Schauspieler erläutert vor der Presse sein angebliches Lebensmotto der Würde.',
19:'Jeff und Lisa rätseln darüber, warum ein Nachbar nachts mehrfach mit einem Koffer seine Wohnung verlässt.',
20:'Ein Seemann beklagt sich darüber, dass ein gefundener Schatz zurückgelassen wurde; der Kapitän hält Nahrung für wichtiger.',
23:'Scottie lässt sich von Midge erklären, wie ein neuartiger trägerloser Büstenhalter konstruiert ist.',
25:'Bei einer Rast wird entschieden, wer zuerst Wasser bekommt: Soldaten, Gefangene oder Pferde.',
27:'Dorfbewohner erklären einem alten Mann, dass sie Landwirtschaft beherrschen, aber nicht kämpfen können.',
32:'Mary erzählt den Kindern von einer alten Frau, die Vogelfutter vor einer Kirche verkauft.',
35:'Balu erklärt Mogli seine gelassene Lebenseinstellung. Für einen subtileren Ausschnitt nur die gesprochenen Worte vor dem Lied verwenden.',
41:'Ein junger Betrüger begegnet einem älteren Kollegen und zweifelt zunächst daran, von ihm etwas lernen zu können.',
45:'Travis bittet eine Frau um eine Verabredung im Kino und stellt klar, dass er einen anderen Tag meint.',
46:'Ein Farmer prüft beim Kauf eines Roboters, ob dieser die benötigten technischen Kenntnisse besitzt.',
48:'Frenchy versucht, Sandy beim Ohrlochstechen mit Eis und kaltem Wasser zu helfen.',
52:'Ein Mann denkt allein im Hotelzimmer über seine Heimkehr, seine Ehe und die Rückkehr in den Einsatz nach.',
57:'Ein Kapitän bekommt bei einem Essen frische Feigen angeboten und hat solche Früchte noch nie gegessen.',
58:'Elliott bemerkt, dass seine Schwester dem fremden Besucher das Sprechen beigebracht hat.',
61:'Zwei Freunde vergleichen am Straßenrand das Aussehen, die Kleidung und den Erfolg eines fremden Mannes.',
62:'Ein Kommandant klagt über Personalmangel und erfährt, dass sein oberster Vorgesetzter persönlich zu Besuch kommt.',
63:'Ein frischgebackener Unternehmer fragt seine Sekretärin vergeblich nach Anrufen, Nachrichten und Kunden.',
68:'Ein Lehrer begrüßt die Jugendlichen beim Nachsitzen und erklärt ihnen die Regeln für den Tag.',
74:'Drei Reisende geraten aneinander, weil zwei von ihnen ständig in Reimen sprechen.',
76:'Ein Fremder setzt sich in Charlies Auto und kennt erstaunlich viele Einzelheiten über dessen frühere Ausstattung.',
77:'Eddie wird mit verschwindender Tinte und einem elektrischen Handschlag hereingelegt.',
80:'Eine aufgeregte Möwe versucht ihren Freunden zu erklären, dass eine Braut eine verkleidete Betrügerin ist.',
83:'Auf einem Gartenfest wird einem ungewöhnlichen Gast ein Spiel mit Schere, Stein und Papier vorgeschlagen.',
85:'Belle erkundigt sich nach einem verbotenen Gebäudeflügel; ihr Begleiter versucht, sie mit einer Bibliothek abzulenken.',
86:'Eine Reisende erkundigt sich am Schalter nach einer auf ihren Namen ausgestellten Geldanweisung.',
88:'Eine frisch eingezogene Ordensschwester wird um fünf Uhr morgens geweckt und hält das für viel zu früh.',
97:'Die Spielzeuge beobachten besorgt einen Nachbarjungen, der mit einem Spielzeugsoldaten experimentiert.',
99:'Ein Ermittler wird vor dem gemeinsamen Abendessen auf seine Kleidung angesprochen.',
102:'In einer Kommandozentrale wird berechnet, wann unbekannte Flugobjekte die Erdatmosphäre erreichen.',
106:'Ein Therapeut erklärt seinem jungen Klienten, warum ihn dessen Urteil über ein Gemälde beschäftigt hat.',
111:'Zwei Männer beschließen, gemeinsam Seife herzustellen, und sprechen über das dafür benötigte Fett.',
114:'Ein alter Herrscher deutet einem Vertrauten an, dass er ihn bald mit einer Aufgabe betrauen könnte.',
119:'Beim Gemüseeinkauf erkundigen sich Kundinnen nach dem Chef; dessen Mitarbeiter behauptet, er schlafe zwischen den Blumenkohlköpfen.',
121:'Während einer großen Tierwanderung diskutieren zwei Tiere darüber, wie die kalte Epoche genannt werden sollte.',
122:'Ein junger Mann in Pilotenuniform gibt Autogramme und berichtet seinem Vater von seinen vermeintlichen Karriereplänen.',
123:'Eine junge Frau beruft sich gegenüber zwei Eindringlingen auf ihr Recht, zunächst zu verhandeln.',
125:'Ein Erzähler beschreibt die Wiedersehensfreude von Menschen im Ankunftsbereich eines Flughafens.',
129:'Ein Erzähler stellt die französische Küche und den Aufstieg eines Pariser Spitzenkochs vor.',
130:'Ein Kapitän erfährt durch eine alte Videoaufzeichnung, unter welchen Bedingungen sein Schiff zur Erde zurückkehren soll.',
131:'Bei einer Besprechung wird das auffällig gleichmäßige Wachstum eines Unternehmens angesprochen.',
133:'Jake und seine Kollegen diskutieren über die Bedeutung einer Begrüßung und darüber, jemanden wirklich zu verstehen.',
135:'Driss beschwert sich im Restaurant über einen vermeintlich ungebackenen Schokoladenkuchen und bestellt lieber eine Tarte.',
137:'Zwei kleine Schwestern spielen nachts mit magischem Schnee und bauen gemeinsam eine Schneemannfigur.',
139:'Ein Vater hört in der Schule seines Kindes, dass die Welt vor allem gute Landwirte brauche.',
147:'Ein Besucher wird für die ungewöhnliche Geste bedankt, dem Gastgeber durch Spucken Körperfeuchtigkeit zu schenken.'
};
for(const [id,scene]of Object.entries(corrections))films[Number(id)-1].scene=scene;
Object.assign(films[32],{clipUrl:'https://clip.cafe/the-sound-of-music-1965/play-clothes/',timestamp:'01:12:52',scene:'Maria erklärt dem Kapitän, dass sie die Spielkleidung seiner Kinder aus alten Vorhängen genäht hat.'});
Object.assign(films[80],{clipUrl:'https://clip.cafe/home-alone-1990/is-toothbrush-approved-by-the-american-dental-association/',timestamp:'00:38:52'});
// Nur eigene Kurzbeschreibungen ausliefern; keine längeren Dialogabschriften.
for(const f of films){delete f.excerpt;delete f.clipTitle;delete f.duration;delete f.error;delete f.usedFallback;}
await fs.writeFile(new URL('recherche-150.json',root),JSON.stringify(films,null,2));
