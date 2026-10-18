import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';

const dir=mkdtempSync(path.join(process.env.LEGACY_TEST_TEMP||tmpdir(),'mesh-role-limits-'));
process.env.AI_CENTER_DATABASE_PATH=path.join(dir,'ai.sqlite');
const {CenterStore}=await import('../lib/ai-center/store.ts');
const {defaultSettings,settingsSchema}=await import('../lib/ai-center/policy.ts');
const store=new CenterStore();
const now=new Date('2026-10-10T12:00:00Z');
try {
  const settings=defaultSettings();
  assert.equal(settings.agents.mesh.roleLimitsCents.research,1000);
  const legacy=JSON.parse(JSON.stringify(settings));
  delete legacy.agents.mesh.roleLimitsCents;
  assert.equal(settingsSchema.parse(legacy).agents.mesh.roleLimitsCents.research,1000);
  settings.paidEnabled=true;
  settings.agents.mesh={...settings.agents.mesh,provider:'openai',model:'gpt-4.1-mini',inputCentsPerMillion:400,outputCentsPerMillion:1600};
  settings.agents.mesh.roleLimitsCents.research=0;
  store.configure(settings);
  const research=store.enqueue({agent:'mesh',kind:'research',brief:'Review supplied evidence.',key:'role-research-1'});
  store.decide(research.id,'approve');
  // A blocked role must not stall other eligible roles.
  const design=store.enqueue({agent:'mesh',kind:'design',brief:'Draft dimensions.',key:'role-design-001'});
  store.decide(design.id,'approve');
  assert.equal(store.claim(now).id,design.id);
  store.finish(design.id,'Draft dimensions',1);
  assert.equal(store.claim(now),null);
  settings.agents.mesh.roleLimitsCents.research=research.boundCents;
  store.configure(settings);
  assert.equal(store.claim(now).id,research.id);
  store.fail(research.id);
  assert.equal(store.snapshot(now).usage.roles.mesh.research,research.boundCents);
  settings.agents.mesh.roleLimitsCents.research=0;
  settings.agents.mesh.provider='template';store.configure(settings);
  const free=store.enqueue({agent:'mesh',kind:'research',brief:'Free evidence checklist.',key:'role-free-research'});
  assert.equal(store.claim(now).id,free.id,'Free templates remain available after lowering an already-used role cap');
  store.finish(free.id,'Checklist',0);
  settings.agents.mesh.provider='openai';settings.agents.mesh.roleLimitsCents.research=research.boundCents;store.configure(settings);
  const next=store.enqueue({agent:'mesh',kind:'research',brief:'Review more evidence.',key:'role-research-2'});
  store.decide(next.id,'approve');
  assert.equal(store.claim(now),null,'Uncertain calls retain the role reservation');
  assert.equal(store.claim(new Date('2026-11-01T12:00:00Z')).id,next.id,'UTC month resets role usage');
  store.finish(next.id,'Draft',0);
  assert.equal(store.snapshot(new Date('2026-11-02')).usage.roles.mesh.research,0);
  assert.equal(store.snapshot(now).usage.roles.mesh.design,1);
  assert.equal(store.snapshot(now).usage.roles.products.research,0);
  const later=store.enqueue({agent:'mesh',kind:'design',brief:'Approved before cap was reduced.',key:'role-design-002'});
  store.decide(later.id,'approve');
  settings.agents.mesh.roleLimitsCents.design=0;
  settings.agents.mesh.roleLimitsCents.review=1;
  store.configure(settings);
  assert.equal(store.claim(new Date('2026-12-01')),null,'Latest limits apply to already approved jobs');
  // Several processes compete for the same one-cent role cap, with ample global/business budgets.
  settings.agents.mesh.inputCentsPerMillion=40;
  settings.agents.mesh.outputCentsPerMillion=160;
  store.configure(settings);
  for(let i=0;i<6;i++) {
    const job=store.enqueue({agent:'mesh',kind:'review',brief:'Review operations',key:`role-race-${i}`});
    assert.equal(job.boundCents,1);store.decide(job.id,'approve');
  }
  const launch=()=>new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['--experimental-strip-types','--experimental-loader','./tests/server-only-loader.mjs','tests/ai-claim-child.mjs'],{env:{...process.env,NODE_NO_WARNINGS:'1'}});
    let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);child.on('error',reject);child.on('exit',code=>code===0?resolve(JSON.parse(out)):reject(Error(err)));
  });
  const claims=await Promise.all(Array.from({length:6},launch));
  assert.equal(claims.filter(Boolean).length,1,'Concurrent workers cannot overspend a role cap');
  assert.equal(store.snapshot().usage.roles.mesh.review,1);
  settings.agents.mesh.roleLimitsCents.design=-1;
  assert.throws(()=>store.configure(settings));
  console.log('Independent role limits, legacy settings and uncertain reservations passed.');
} finally {store.close();rmSync(dir,{recursive:true,force:true});}
