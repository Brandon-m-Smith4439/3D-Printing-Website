import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const dir=mkdtempSync(path.join(tmpdir(),'ai-concurrency-'));
process.env.AI_CENTER_DATABASE_PATH=path.join(dir,'ai.sqlite');
const {CenterStore}=await import('../lib/ai-center/store.ts');
const store=new CenterStore();
try {
  const s=store.snapshot().settings;s.paidEnabled=true;s.monthlyLimitCents=1;
  s.agents.mesh={...s.agents.mesh,provider:'openai',model:'gpt-4.1-mini',inputCentsPerMillion:40,outputCentsPerMillion:160,monthlyLimitCents:100};
  store.configure(s);
  for(let i=0;i<8;i++){const job=store.enqueue({agent:'mesh',kind:'review',brief:'Review operations',key:`concurrent-${i}`});assert.equal(job.boundCents,1);store.decide(job.id,'approve');}
  const launch=()=>new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['--experimental-strip-types','--experimental-loader','./tests/server-only-loader.mjs','tests/ai-claim-child.mjs'],{env:{...process.env,NODE_NO_WARNINGS:'1'}});
    let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);child.on('error',reject);child.on('exit',code=>code===0?resolve(JSON.parse(out)):reject(Error(err)));
  });
  const claims=await Promise.all(Array.from({length:6},launch));
  assert.equal(claims.filter(Boolean).length,1);
  assert.equal(store.snapshot().usage.committedCents,1);
  assert.equal(store.snapshot().jobs.filter(j=>j.status==='running').length,1);
  const claimed=claims.find(Boolean);
  const settings=store.snapshot().settings;settings.paidEnabled=false;store.configure(settings);
  assert.equal(store.claim(),null);
  store.finish(claimed.id,'Draft',1);
  store.decide(claimed.id,'reject');
  assert.equal(store.snapshot().usage.committedCents,1);
  console.log('AI multi-process claims and global budget checks passed.');
}finally{store.close();rmSync(dir,{recursive:true,force:true});}
