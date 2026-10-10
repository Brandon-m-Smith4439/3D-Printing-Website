import { register } from 'node:module';
register('./ai-center-server-loader.mjs',import.meta.url);
const { CenterStore }=await import('../lib/ai-center/store.ts');
const { runOne }=await import('../lib/ai-center/worker.ts');
const watch=process.argv.includes('--watch');
if(watch&&process.env.AI_CENTER_WORKER_ENABLED!=='true')throw Error('Background worker is disabled. Set AI_CENTER_WORKER_ENABLED=true explicitly.');
let stopped=false;
process.on('SIGTERM',()=>{stopped=true;});
process.on('SIGINT',()=>{stopped=true;});
do {
  const store=new CenterStore();
  try {const job=await runOne(store);if(job)console.log(`AI draft job ${job.id}: ${job.status}`);}
  finally {store.close();}
  if(watch&&!stopped)await new Promise(resolve=>setTimeout(resolve,30_000));
} while(watch&&!stopped);
