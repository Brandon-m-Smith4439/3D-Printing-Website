import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
const dir=mkdtempSync(path.join(tmpdir(),'meshy-remesh-'));
process.env.AI_CENTER_DATABASE_PATH=path.join(dir,'center.sqlite');
process.env.AI_CENTER_MESHY_ENABLED='true';
process.env.AI_CENTER_MESHY_API_KEY='fixture-not-a-real-key';
const {CenterStore}=await import('../lib/ai-center/store.ts');
const {MeshyStore,runMeshyOne}=await import('../lib/ai-center/meshy.ts');
const {generateTray}=await import('../lib/ai-center/stl.ts');
const center=new CenterStore(),store=new MeshyStore();
const provider='0193bfc5-ee4f-73f8-8525-44b398884ce9',remeshProvider='0193bfc5-ee4f-73f8-8525-44b398884ceb',analysis='0193bfc5-ee4f-73f8-8525-44b398884cec';
try {
 const p=center.createProject({business:'mesh',name:'Original cable rest',brief:'Original decorative pebble cable rest'});
 const input={projectId:p.id,version:p.version,prompt:p.brief,longestSideMm:60};
 const job=store.enqueue(input);store.approve(job.id);
 await runMeshyOne(store,async()=>Response.json({result:provider}));
 let j=store.get(job.id);const oversized=Buffer.alloc(84+90120*50);oversized.writeUInt32LE(90120,80);
 j=store.recordAsset(j,oversized);j.status='review';j.chargedCredits=20;store.save(j);
 const blocked=store.snapshot().jobs.find(x=>x.id===j.id).importCheck;
 assert.ok(blocked,'stored candidates need an explicit import-readiness result');
 assert.equal(blocked.ready,false,'oversized stored candidates must visibly block import');
 assert.equal(blocked.triangles,90120);assert.equal(blocked.bytes,oversized.length);
 assert.match(blocked.reason,/1 MB/);
 assert.throws(()=>store.importRevision(j.id),/1 MB/);
 assert.equal(center.product(p.id).version,p.version,'blocked import must not alter project');
 const remesh=store.enqueue(input,j.id,'remesh');
 assert.equal(remesh.operation,'remesh');assert.equal(remesh.status,'spend-review');
 assert.match(remesh.note,/5 credits/);
 assert.equal(await runMeshyOne(store,async()=>{throw Error('must not call provider before approval');}),null);
 store.approve(remesh.id);
 let posts=0;
 const submit=async(url,opts)=>{posts++;assert.equal(String(url),'https://api.meshy.ai/openapi/v1/remesh');assert.equal(opts.method,'POST');assert.deepEqual(JSON.parse(opts.body),{input_task_id:provider,topology:'triangle',target_polycount:12000,target_formats:['stl']});return Response.json({result:remeshProvider});};
 await runMeshyOne(store,submit);
 assert.equal(posts,1);assert.equal(store.get(remesh.id).reservedCredits,5);
 assert.equal(store.snapshot().committedCredits,25);
 assert.throws(()=>store.enqueue(input,j.id,'remesh'),/existing Meshy task|one.*remesh/i);
 let poll=store.get(remesh.id);poll.pollAt=0;poll.leaseUntil=0;store.save(poll);
 const oldLease=store.claim(),realNow=Date.now;let newLease;
 try{Date.now=()=>realNow()+91000;newLease=store.claim();}finally{Date.now=realNow;}
 assert.ok(newLease);assert.notEqual(oldLease.leaseToken,newLease.leaseToken);
 assert.throws(()=>store.save({...oldLease,note:'Stale remesh response'}),/lease/,'remesh polling must keep stale worker fencing');
 const tray=generateTray({width:120,length:80,height:24,wall:4,base:4});
 const complete=async(url,opts)=>{
  if(String(url).startsWith('https://assets.meshy.ai/'))return new Response(tray);
  if(opts.method==='POST'){posts++;assert.equal(String(url),'https://api.meshy.ai/openapi/v1/print/analyze');assert.equal(JSON.parse(opts.body).input_task_id,remeshProvider);return Response.json({result:analysis});}
  if(String(url).includes('/print/analyze/'))return Response.json({id:analysis,status:'SUCCEEDED',printability:{status:'pass'}});
  assert.equal(String(url),'https://api.meshy.ai/openapi/v1/remesh/'+remeshProvider);
  return Response.json({id:remeshProvider,status:'SUCCEEDED',consumed_credits:5,model_urls:{stl:'https://assets.meshy.ai/tasks/remeshed.stl'}});
 };
 function ready(id){const current=store.get(id);current.pollAt=0;current.leaseUntil=0;store.save(current);}
 ready(remesh.id);await runMeshyOne(store,complete);assert.equal(store.get(remesh.id).status,'analyzing');
 ready(remesh.id);await runMeshyOne(store,complete);assert.equal(store.get(remesh.id).status,'review');
 assert.equal(posts,2,'only one paid remesh and one free analysis');
 assert.equal(store.snapshot().jobs.find(x=>x.id===remesh.id).importCheck.ready,true);
 assert.throws(()=>store.enqueue(input,j.id,'remesh'),/one.*remesh/i);
 const repair=store.enqueue(input,j.id);store.approve(repair.id);
 assert.equal(store.claim(),null,'20 + 5 + 10 must exceed the unchanged 30-credit cap');
 assert.equal(store.get(repair.id).status,'queued');
 const imported=store.importRevision(remesh.id);
 assert.equal(imported.stage,'test');assert.equal(imported.release,null);assert.equal(imported.revisions.at(-1).tests.length,0);
 assert.equal(Math.max(...imported.revisions.at(-1).inspection.sizeMm),60);
 assert.throws(()=>store.enqueue(input,j.id,'remesh'),/Project changed/);
 // Stale approvals are rejected before any new provider submission once budget is available.
 process.env.AI_CENTER_MESHY_MONTHLY_CREDITS='100';
 assert.equal(store.claim(),null);assert.equal(store.get(repair.id).status,'rejected');
 const other=center.createProject({business:'mesh',name:'Original second rest',brief:'Original second decorative rest'});
 const otherInput={...input,projectId:other.id,version:other.version};
 let source=store.enqueue(otherInput);source.providerId=provider;source.status='review';store.save(source);
 const uncertain=store.enqueue(otherInput,source.id,'remesh');store.approve(uncertain.id);
 let attempts=0;await runMeshyOne(store,async()=>{attempts++;throw Error('Connection lost after provider submission');});
 assert.equal(store.get(uncertain.id).status,'failed');assert.equal(store.get(uncertain.id).reservedCredits,5);
 await runMeshyOne(store,async()=>{attempts++;throw Error('must not retry paid request');});
 assert.equal(attempts,1,'uncertain paid remesh must never be automatically resubmitted');
 console.log('Meshy oversized candidate, explicit remesh approval, analysis, credit cap and physical-test checks passed.');
} finally {store.close();center.close();rmSync(dir,{recursive:true,force:true});}
