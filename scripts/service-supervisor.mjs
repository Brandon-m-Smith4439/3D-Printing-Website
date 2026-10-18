import {spawn} from 'node:child_process';

// Same container, cwd and environment: SQLite reservations and assets share the existing volume.
// A failed child stops the service; there is no hidden restart or provider retry loop.
export function supervise(plan,{runtime=process,spawnChild=spawn,graceMs=50000,log=console.error}={}) {
  const children=new Set();let stopping=false,result=0,timer;
  let resolveDone;const done=new Promise(resolve=>{resolveDone=resolve;});
  const finish=()=>{
    if(!stopping||children.size)return;
    clearTimeout(timer);runtime.off('SIGTERM',onSignal);runtime.off('SIGINT',onSignal);resolveDone(result);
  };
  const stop=(code=0)=>{
    if(stopping)return;
    stopping=true;result=code;
    timer=setTimeout(()=>{for(const child of children)child.kill('SIGKILL');},graceMs);timer.unref();
    for(const child of children)child.kill('SIGTERM');finish();
  };
  const onSignal=()=>stop(0);
  runtime.on('SIGTERM',onSignal);runtime.on('SIGINT',onSignal);
  for(const service of plan){
    if(stopping)break;
    try {
      const child=spawnChild(runtime.execPath,service.args,{stdio:'inherit',env:runtime.env,cwd:runtime.cwd()});
      children.add(child);
      child.on('error',()=>{children.delete(child);log(`${service.name} could not start.`);stop(1);finish();});
      child.on('exit',()=>{children.delete(child);if(!stopping){log(`${service.name} stopped unexpectedly.`);stop(1);}finish();});
    } catch {log(`${service.name} could not start.`);stop(1);}
  }
  if(!plan.length)stop(1);
  return {done,stop};
}
