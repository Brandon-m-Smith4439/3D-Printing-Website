import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
const dir=mkdtempSync(path.join(tmpdir(),'meshy-'));
process.env.AI_CENTER_DATABASE_PATH=path.join(dir,'center.sqlite');
process.env.AI_CENTER_MESHY_ENABLED='true';
process.env.AI_CENTER_MESHY_API_KEY='fixture-not-a-real-key';
const {CenterStore}=await import('../lib/ai-center/store.ts');
const meshyModule=await import('../lib/ai-center/meshy.ts').catch(()=>({}));
assert.equal(typeof meshyModule.MeshyStore,'function','Meshy durable queue must exist');
const {MeshyStore,runMeshyOne,meshAssetUrl}=meshyModule;
const center=new CenterStore(),store=new MeshyStore();
try {
 const p=center.createProject({business:'mesh',name:'Original pebble holder',brief:'Original decorative PLA pebble holder'});
 const j=store.enqueue({projectId:p.id,version:p.version,prompt:'Original pebble holder',longestSideMm:60});
 assert.equal(j.status,'spend-review');
 assert.equal(await runMeshyOne(store),null);
 store.approve(j.id);
 let creates=0;
 const fake=async(url,opts)=>{
  if(opts.method==='POST'){creates++;assert.equal(JSON.parse(opts.body).ai_model,'meshy-6');return Response.json({result:'0193bfc5-ee4f-73f8-8525-44b398884ce9'});}
  return Response.json({id:'0193bfc5-ee4f-73f8-8525-44b398884ce9',status:'IN_PROGRESS'});
 };
 await runMeshyOne(store,fake);
 assert.equal(creates,1);
 assert.equal(store.snapshot().jobs[0].status,'pending');
 await runMeshyOne(store,fake);
 assert.equal(creates,1,'polling must not create a duplicate billed task');
 let delayed=store.get(j.id);delayed.pollAt=0;store.save(delayed);
 await runMeshyOne(store,async()=>new Response('busy',{status:429}));
 assert.equal(store.get(j.id).status,'pending','read-only transient failure must preserve resumable task');
 assert.equal(store.get(j.id).reservedCredits,20);
 assert.equal(store.notify(store.get(j.id).providerId),true);
 assert.ok(store.snapshot().lastWebhookAt>0,'known notifications must be visible for delivery verification');
 const leased=store.claim();assert.ok(leased,'known webhook should schedule an authoritative check');
 assert.equal(store.claim(),null,'in-flight polling must have an exclusive lease');
 const realNow=Date.now;let replacement;
 try{Date.now=()=>realNow()+91000;replacement=store.claim();}finally{Date.now=realNow;}
 assert.ok(replacement,'expired read-only check can be reclaimed');
 assert.throws(()=>store.save({...leased,note:'Delayed old response'}),/lease/,'old worker must not overwrite newer progress');
 const p2=center.createProject({business:'mesh',name:'Other original design',brief:'Different original PLA design'});
 const second=store.enqueue({projectId:p2.id,version:p2.version,prompt:'Different original design',longestSideMm:60});store.approve(second.id);
 assert.equal(await runMeshyOne(store,fake),null,'30-credit cap must block second 20-credit call');
 assert.equal(store.snapshot().committedCredits,20);
 assert.throws(()=>meshAssetUrl('https://assets.meshy.ai.evil.test/x'));
 assert.throws(()=>meshAssetUrl('http://assets.meshy.ai/x'));
 assert.throws(()=>meshAssetUrl('https://user:pass@assets.meshy.ai/x'));
 assert.equal(meshAssetUrl('https://assets.meshy.ai/tasks/model.stl').hostname,'assets.meshy.ai');
 assert.equal(store.notify('unknown-provider-task'),false);
 const {generateTray}=await import('../lib/ai-center/stl.ts');
 const tray=generateTray({width:120,length:80,height:24,wall:4,base:4});
 const generationId=store.get(j.id).providerId,analysisId='0193bfc5-ee4f-73f8-8525-44b398884cea';
 const completed=async(url,opts)=>{
  if(String(url).startsWith('https://assets.meshy.ai/'))return new Response(tray);
  if(opts.method==='POST'){assert.equal(JSON.parse(opts.body).intended_print_longest_side_mm,60);return Response.json({result:analysisId});}
  if(String(url).includes('/print/analyze/'))return Response.json({id:analysisId,status:'SUCCEEDED',printability:{status:'warning',metrics:{is_watertight:true}}});
  return Response.json({id:generationId,status:'SUCCEEDED',consumed_credits:20,model_urls:{stl:'https://assets.meshy.ai/tasks/candidate.stl'}});
 };
 let pending=store.get(j.id);pending.pollAt=0;pending.leaseUntil=0;store.save(pending);
 await runMeshyOne(store,completed);
 assert.ok(store.get(j.id).artifactId,'completed STL must be preserved privately');
 assert.equal(store.get(j.id).status,'analyzing');
 pending=store.get(j.id);pending.pollAt=0;pending.leaseUntil=0;store.save(pending);
 await runMeshyOne(store,completed);
 assert.equal(store.get(j.id).status,'review');
 assert.equal(store.get(j.id).report.status,'warning','warning must not become a physical pass');
 const repair=store.enqueue({projectId:p.id,version:p.version,prompt:j.prompt,longestSideMm:60},j.id);
 assert.equal(repair.status,'spend-review');
 store.approve(repair.id,true);
 assert.throws(()=>store.enqueue({projectId:p.id,version:p.version,prompt:j.prompt,longestSideMm:60},j.id),/one approved repair/);
 const imported=store.importRevision(j.id);
 assert.equal(Math.max(...imported.revisions.at(-1).inspection.sizeMm),60);
 assert.equal(imported.stage,'test');
 assert.equal(imported.revisions.at(-1).tests.length,0);
 assert.equal(imported.release,null);
 assert.throws(()=>store.importRevision(j.id));
 console.log('Meshy approval, durable submission, credit cap and asset-host checks passed.');
} finally {store.close();center.close();rmSync(dir,{recursive:true,force:true});}
