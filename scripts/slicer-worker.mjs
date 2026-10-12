import {setTimeout as delay} from 'node:timers/promises';
import {sliceStl} from './slicer-runner.mjs';import {resolveProfiles} from './slicer-profiles.mjs';
const site=new URL(process.env.AI_CENTER_SLICER_SITE_URL||'');
if(site.username||site.password||site.pathname!=='/'||site.search||site.hash||!(site.protocol==='https:'||(process.env.AI_CENTER_SLICER_ALLOW_LOCALHOST==='true'&&site.protocol==='http:'&&['127.0.0.1','localhost'].includes(site.hostname))))throw Error('Trusted HTTPS site required');
const resourcesDir=process.env.AI_CENTER_SLICER_RESOURCES,executablePath=process.env.AI_CENTER_SLICER_EXECUTABLE,workRoot=process.env.AI_CENTER_SLICER_WORK_ROOT;
if(!resourcesDir||!executablePath||!workRoot)throw Error('Set trusted local executable/resources/work directory');
if(process.argv.includes('--profiles')){for(const id of ['x2d-04-020-pla-basic','x2d-04-020-pla-matte','x2d-04-020-petg'])console.log(id+' '+resolveProfiles(resourcesDir,id).profileHash);process.exit(0);}
const token=process.env.AI_CENTER_SLICER_WORKER_TOKEN;
if(!/^[a-f0-9]{64}$/.test(token||''))throw Error('Private paired worker token required');
const controller=new AbortController();process.once('SIGINT',()=>controller.abort());process.once('SIGTERM',()=>controller.abort());
async function request(path,body){const r=await fetch(new URL(path,site),{method:body?'POST':'GET',headers:{authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(30000)])});if(r.status===401){controller.abort();throw Error('Pairing expired or revoked');}if(!r.ok)throw Error('Worker request failed');return r;}
const heartbeat=setInterval(()=>void request('/api/slicing-worker',{action:'heartbeat'}).catch(()=>{}),30000);heartbeat.unref();
let backoff=30000;
try{while(!controller.signal.aborted){let claim;
 try{await request('/api/slicing-worker',{action:'heartbeat'}).catch(e=>{if(controller.signal.aborted)throw e;});const r=await request('/api/slicing-worker',{action:'claim'});const text=await r.text();if(text.length>20000)throw Error('Claim output too large');claim=JSON.parse(text).claim;
  if(claim){const response=await request('/api/slicing-worker/asset?claimId='+encodeURIComponent(claim.claimId));const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>20_000_000)throw Error('Asset too large');chunks.push(chunk);}const result=await sliceStl({executablePath,resourcesDir,workRoot,profileId:claim.job.input.profileId,profileHash:claim.job.input.profileHash,sourceSha256:claim.job.input.sha256,source:Buffer.concat(chunks),colorHex:claim.job.input.materialPlan.lines[0].colorHex,signal:controller.signal});await request('/api/slicing-worker',{action:'complete',claimId:claim.claimId,result});console.log('Slice estimate submitted');}
  backoff=30000;
 }catch{if(claim&&!controller.signal.aborted)await request('/api/slicing-worker',{action:'fail',claimId:claim.claimId}).catch(()=>{});if(!controller.signal.aborted)console.log('Worker paused or task failed; check private setup and dashboard');backoff=Math.min(120000,backoff*2);}
 await delay(backoff,undefined,{signal:controller.signal}).catch(()=>{});
}}finally{clearInterval(heartbeat);}
