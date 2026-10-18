// Isolated localhost only. Packing measurements and cost inputs here are synthetic.
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';import {setTimeout as delay} from 'node:timers/promises';
const base=process.env.AI_TEST_BASE_URL;if(!base||!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base))throw Error('Localhost test server required');
const login=await fetch(base+'/api/owner/login',{method:'POST',headers:{origin:base,'Content-Type':'application/json'},body:JSON.stringify({password:process.env.AI_TEST_OWNER_PASSWORD||'local-owner'})});assert.equal(login.status,200);
const headers={origin:base,cookie:login.headers.get('set-cookie').split(';')[0],'Content-Type':'application/json'};
const post=async(route,data)=>{const r=await fetch(base+route,{method:'POST',headers,body:JSON.stringify(data)});const body=await r.json();assert.equal(r.status,200,JSON.stringify(body));return body;};
const api='/api/owner/business/slicing',center='/api/owner/business';
const get=async route=>await (await fetch(base+route,{headers})).json();
const name='SANDBOX ONLY real local slicing '+crypto.randomUUID().slice(0,8);
await post(center,{action:'createProject',project:{business:'mesh',name,brief:'Disposable test; no physical test, public listing, postage or payment.'}});
let project=(await get(center)).projects.find(p=>p.name===name);
const source=fs.readFileSync(process.env.AI_SLICING_TEST_STL||'../../outputs/meshy-pebble-cable-rest-refined-60mm.stl');
const upload=await fetch(base+'/api/owner/business/assets?'+new URLSearchParams({id:project.id,version:String(project.version),filename:'refined-test.stl',notes:'Isolated worker end-to-end test'}),{method:'POST',headers:{origin:base,cookie:headers.cookie},body:source});assert.equal(upload.status,200);
project=(await get(center)).projects.find(p=>p.id===project.id);
const fixture=JSON.parse(fs.readFileSync('tests/fixtures/slicing/verified-x2d-2026-10-12.json','utf8'));
const snapshot=await get(api);snapshot.config.profileHashes['x2d-04-020-pla-basic']=fixture[0].profileHash;snapshot.config.profileHashes['x2d-04-020-petg']=fixture[1].profileHash;
snapshot.config.presets=[{id:crypto.randomUUID(),name:'HYPOTHETICAL TEST SUPPLIES',internalMm:[80,55,25],externalMm:[85,60,30],boxGrams:20,protectionGrams:10,clearanceMm:5,packagingCents:40,available:true,calibrated:true,quantity:1}];
await post(api,{action:'configure',config:snapshot.config});
const {job}=await post(api,{action:'enqueue',id:project.id,version:project.version,quantity:1,profileId:'x2d-04-020-pla-basic',materialPlan:project.materialPlan});
const pairing=await post(api,{action:'pair'});
const child=spawn(process.execPath,['scripts/slicer-worker.mjs'],{windowsHide:true,stdio:'ignore',env:{...process.env,AI_CENTER_SLICER_SITE_URL:base,AI_CENTER_SLICER_ALLOW_LOCALHOST:'true',AI_CENTER_SLICER_WORKER_TOKEN:pairing.token,AI_CENTER_SLICER_RESOURCES:'C:/Program Files/Bambu Studio/resources/profiles/BBL',AI_CENTER_SLICER_EXECUTABLE:'C:/Program Files/Bambu Studio/bambu-studio.exe',AI_CENTER_SLICER_WORK_ROOT:path.resolve('.superpowers/sdd/2026-10-12-slicing-cost-packing/e2e-worker')}});
try{
 let completed;for(let i=0;i<30;i++){await delay(1000);const view=await get(api);completed=view.jobs.find(j=>j.id===job.id);if(completed.state==='completed')break;assert.ok(!['failed','cancelled'].includes(completed.state));}
 assert.equal(completed.state,'completed');assert.equal(completed.result.slicerVersion,'BambuStudio 02.08.02.60');assert.equal(completed.result.partGrams,null);assert.ok(completed.result.grams>0);
 await post(api,{action:'acceptEstimate',id:project.id,version:project.version,jobId:job.id});project=(await get(center)).projects.find(p=>p.id===project.id);assert.equal(project.revisions[0].tests.length,0);
 const unmeasured=await post(api,{action:'proposal',id:project.id,version:project.version,jobId:job.id,startupWasteGrams:0});assert.equal(unmeasured.pack,null);
 await post(api,{action:'measureMass',jobId:job.id,grams:8,confirmed:true});
 const proposal=await post(api,{action:'proposal',id:project.id,version:project.version,jobId:job.id,startupWasteGrams:0});assert.equal(proposal.pack.grams,38);assert.equal(proposal.pack.ounces,2);
 await post(api,{action:'revoke',workerId:pairing.workerId});
 assert.equal((await fetch(base+'/api/slicing-worker',{method:'POST',headers:{authorization:'Bearer '+pairing.token},body:'{"action":"claim"}'})).status,401);
 console.log(JSON.stringify({projectId:project.id,jobId:job.id,grams:completed.result.grams,seconds:completed.result.seconds,packing:'SYNTHETIC test inputs only',workerRevoked:true}));
}finally{child.kill();}
