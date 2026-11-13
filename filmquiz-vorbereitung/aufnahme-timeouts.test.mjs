import test from 'node:test';
import assert from 'node:assert/strict';
import {Cdp} from './cdp-client.mjs';
import {runRecordingProcess} from './aufnahme-prozess.mjs';

class FakeSocket extends EventTarget {
  constructor(){super();queueMicrotask(()=>this.dispatchEvent(new Event('open')));}
  send(text){this.last=JSON.parse(text);}
  close(){this.dispatchEvent(new Event('close'));}
  reply(result){this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({id:this.last.id,result})}));}
}
test('antwortloser Browserbefehl läuft in ein festes Zeitlimit',async()=>{
  const cdp=new Cdp('test',{WebSocketClass:FakeSocket,commandTimeoutMs:30});await cdp.open();
  await assert.rejects(cdp.send('Runtime.evaluate'),/Zeitlimit.*Runtime.evaluate/);
  assert.equal(cdp.pending.size,0);cdp.close();
});
test('Verbindungsabbruch löst wartende Browserbefehle sofort als Fehler auf',async()=>{
  const cdp=new Cdp('test',{WebSocketClass:FakeSocket});await cdp.open();
  const response=cdp.send('Page.navigate');cdp.ws.close();
  await assert.rejects(response,/geschlossen/);assert.equal(cdp.pending.size,0);
});
test('reguläre Browserantworten werden angenommen und ihr Timer entfernt',async()=>{
  const cdp=new Cdp('test',{WebSocketClass:FakeSocket,commandTimeoutMs:30});await cdp.open();
  const response=cdp.send('Runtime.evaluate');cdp.ws.reply({value:42});
  assert.deepEqual(await response,{value:42});assert.equal(cdp.pending.size,0);cdp.close();
});
test('stiller hängender Aufnahmeprozess blockiert den nächsten Eintrag nicht',async()=>{
  const started=Date.now(),lines=[];
  const options={totalTimeoutMs:3000,idleTimeoutMs:250,onLine:line=>lines.push(line)};
  assert.equal(await runRecordingProcess(process.execPath,['-e','setInterval(()=>{},1000)'],options),124);
  assert.ok(Date.now()-started<2500);assert.ok(lines.some(l=>l.includes('keine Rückmeldung')));
  assert.equal(await runRecordingProcess(process.execPath,['-e','process.exit(0)'],options),0);
});
test('auch ein endlos Meldungen schreibender Player überschreitet das Gesamtlimit nicht',async()=>{
  const lines=[];const started=Date.now();
  assert.equal(await runRecordingProcess(process.execPath,['-e','setInterval(()=>console.log("lädt"),20)'],{totalTimeoutMs:400,idleTimeoutMs:3000,onLine:line=>lines.push(line)}),124);
  assert.ok(Date.now()-started<2500);assert.ok(lines.some(l=>l.includes('maximale Laufzeit')));
});
