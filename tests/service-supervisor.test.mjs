import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
const {supervise}=await import('../scripts/service-supervisor.mjs');
function fixture(){
  const runtime=new EventEmitter();Object.assign(runtime,{execPath:'node',env:{},cwd:()=>'/local'});
  const children=[];
  const spawnChild=()=>{const child=new EventEmitter();child.signals=[];child.kill=signal=>{child.signals.push(signal);queueMicrotask(()=>child.emit('exit',null,signal));};children.push(child);return child;};
  const task=supervise([{name:'web',args:[]},{name:'worker',args:[]}],{runtime,spawnChild,log:()=>{}});
  return {runtime,children,task};
}
const failed=fixture();failed.children[1].emit('exit',1);assert.equal(await failed.task.done,1);assert.deepEqual(failed.children[0].signals,['SIGTERM']);assert.equal(failed.children.length,2);
const stopped=fixture();stopped.runtime.emit('SIGTERM');assert.equal(await stopped.task.done,0);assert.ok(stopped.children.every(c=>c.signals[0]==='SIGTERM'));assert.equal(stopped.runtime.listenerCount('SIGTERM'),0);
const error=fixture();error.children[1].emit('error',Error('secret-bearing error must not be logged'));assert.equal(await error.task.done,1);
console.log('Supervisor shutdown, failure visibility and no restart loop passed.');
