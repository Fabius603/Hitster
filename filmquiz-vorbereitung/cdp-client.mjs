export class Cdp {
  constructor(wsUrl, {WebSocketClass=WebSocket, commandTimeoutMs=15000, openTimeoutMs=10000}={}) {
    this.ws=new WebSocketClass(wsUrl);
    this.commandTimeoutMs=commandTimeoutMs;this.openTimeoutMs=openTimeoutMs;
    this.nextId=1;this.pending=new Map();this.listeners=[];this.closed=false;
    this.ws.addEventListener('message',event=>{
      let msg;try{msg=JSON.parse(event.data);}catch{return;}
      if(msg.id&&this.pending.has(msg.id)){
        const request=this.pending.get(msg.id);this.pending.delete(msg.id);clearTimeout(request.timer);
        msg.error?request.reject(new Error(msg.error.message)):request.resolve(msg.result);
      }else if(msg.method){
        if(msg.method==='Target.detachedFromTarget')for(const[id,request]of this.pending){
          if(request.sessionId===msg.params?.sessionId){clearTimeout(request.timer);this.pending.delete(id);request.reject(new Error('Player-Frame wurde geschlossen.'));}
        }
        for(const fn of this.listeners)fn(msg);
      }
    });
    this.ws.addEventListener('close',()=>this.fail(new Error('DevTools-Verbindung wurde geschlossen.')));
    this.ws.addEventListener('error',()=>this.fail(new Error('DevTools-Verbindung fehlgeschlagen.')));
  }
  fail(error){this.closed=true;for(const request of this.pending.values()){clearTimeout(request.timer);request.reject(error);}this.pending.clear();}
  open(){return new Promise((resolve,reject)=>{
    if(this.closed){reject(new Error('DevTools-Verbindung ist geschlossen.'));return;}
    const finish=(error)=>{clearTimeout(timer);this.ws.removeEventListener('open',onOpen);this.ws.removeEventListener('error',onError);this.ws.removeEventListener('close',onError);error?reject(error):resolve();};
    const onOpen=()=>finish();const onError=()=>finish(new Error('DevTools-Verbindung fehlgeschlagen.'));
    const timer=setTimeout(()=>{finish(new Error('Zeitlimit beim Öffnen der DevTools-Verbindung.'));this.close();},this.openTimeoutMs);
    this.ws.addEventListener('open',onOpen,{once:true});this.ws.addEventListener('error',onError,{once:true});this.ws.addEventListener('close',onError,{once:true});
  });}
  send(method,params={},sessionId,timeoutMs=this.commandTimeoutMs){return new Promise((resolve,reject)=>{
    if(this.closed){reject(new Error('DevTools-Verbindung ist geschlossen.'));return;}
    const id=this.nextId++;
    const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error(`Zeitlimit bei Browserbefehl ${method} (${Math.round(timeoutMs/1000)} s).`));},timeoutMs);
    this.pending.set(id,{resolve,reject,timer,sessionId});
    try{this.ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));}catch(error){clearTimeout(timer);this.pending.delete(id);reject(error);}
  });}
  on(fn){this.listeners.push(fn);}
  close(){this.fail(new Error('DevTools-Verbindung beendet.'));try{this.ws.close();}catch{}}
}
