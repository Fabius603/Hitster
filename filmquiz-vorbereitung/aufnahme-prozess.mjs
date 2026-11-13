import {spawn} from 'node:child_process';

// Harte Grenze auch dann, wenn der Browser oder ein offenes Pipe den Kindprozess festhält.
export function runRecordingProcess(command,args,{prefix='',totalTimeoutMs,idleTimeoutMs=60000,onLine=(line,error)=>{(error?process.stderr:process.stdout).write(`${prefix} ${line}\n`);}}={}){
  return new Promise(resolve=>{
    const child=spawn(command,args,{stdio:['ignore','pipe','pipe','ipc'],windowsHide:true});
    let finished=false,timedOut=false,idleTimer,totalTimer,target;
    const cleanupTarget=async()=>{
      if(!target)return;
      try{await fetch(`http://127.0.0.1:${target.port}/json/close/${target.targetId}`,{signal:AbortSignal.timeout(3000)});}catch{}
    };
    const finish=async code=>{if(finished)return;finished=true;clearTimeout(idleTimer);clearTimeout(totalTimer);if(timedOut)await cleanupTarget();resolve(timedOut?124:code);};
    const timeout=reason=>{if(finished||timedOut)return;timedOut=true;onLine(`Zeitlimit: ${reason} – Aufnahme abgebrochen, nächster Eintrag.`,true);child.kill();void finish(124);};
    const touch=()=>{if(finished)return;clearTimeout(idleTimer);idleTimer=setTimeout(()=>timeout('keine Rückmeldung vom Player'),idleTimeoutMs);};
    child.on('message',message=>{if(message?.type==='recording-target'&&Number.isInteger(message.port)&&message.port>0&&/^[a-z0-9-]+$/i.test(message.targetId))target=message;});
    for(const[stream,isError]of[[child.stdout,false],[child.stderr,true]]){
      let rest='';stream.setEncoding('utf8');stream.on('data',chunk=>{touch();const lines=(rest+chunk).split(/\r?\n/);rest=lines.pop();for(const line of lines)onLine(line,isError);});
      stream.on('end',()=>{if(rest)onLine(rest,isError);});
    }
    child.on('exit',code=>void finish(code??1));
    child.on('error',error=>{onLine(error.message,true);void finish(1);});
    totalTimer=setTimeout(()=>timeout('maximale Laufzeit dieses Eintrags erreicht'),totalTimeoutMs);
    touch();
  });
}
