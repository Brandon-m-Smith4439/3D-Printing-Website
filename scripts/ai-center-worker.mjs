import { register } from 'node:module';
register('./ai-center-server-loader.mjs',import.meta.url);
const { CenterStore }=await import('../lib/ai-center/store.ts');
const { runOne }=await import('../lib/ai-center/worker.ts');
const {runMarketplaceResearch}=await import('../lib/marketplace/research.ts');
const {ensureSidecarBackup}=await import('./center-backups.mjs');
const watch=process.argv.includes('--watch');
if(watch&&process.env.AI_CENTER_WORKER_ENABLED!=='true')throw Error('Background worker is disabled. Set AI_CENTER_WORKER_ENABLED=true explicitly.');
let stopped=false;
let lastBackupDay='';
process.on('SIGTERM',()=>{stopped=true;});
process.on('SIGINT',()=>{stopped=true;});
do {
  const today=new Date().toISOString().slice(0,10);
  if(lastBackupDay!==today){lastBackupDay=today;try{await ensureSidecarBackup();}catch{console.error('Control center backup failed. Review volume space and backup setup. No retry this process day.');}}
  if(!stopped)try{await runMarketplaceResearch();}catch{console.error('Marketplace research configuration needs owner review.');}
  if(stopped)break;
  const store=new CenterStore();
  try {if(process.env.AI_CENTER_COORDINATOR_ENABLED==='true')store.coordinateOne();const job=await runOne(store);if(job)console.log(`AI draft job ${job.id}: ${job.status}`);}
  finally {store.close();}
  if(watch&&!stopped)await new Promise(resolve=>setTimeout(resolve,30_000));
} while(watch&&!stopped);
