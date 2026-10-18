import {createHash,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import type {DatabaseSync} from 'node:sqlite';
import {defaultSlicingConfig,sliceInputSchema,sliceResultSchema,slicingConfigSchema} from './slicing-types.ts';
import type {SliceInput,SliceJob,SliceResult} from './slicing-types.ts';
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
type Worker={id:string;hash:string;expires:string;revoked:number;seen:string};
export class SlicingRecords {
 private db:DatabaseSync;
 constructor(db:DatabaseSync){this.db=db;db.exec(`CREATE TABLE IF NOT EXISTS slice_jobs(id TEXT PRIMARY KEY, request_key TEXT UNIQUE NOT NULL, json TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS slice_workers(id TEXT PRIMARY KEY,hash TEXT NOT NULL,expires TEXT NOT NULL,revoked INTEGER NOT NULL DEFAULT 0,seen TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS slice_config(id INTEGER PRIMARY KEY CHECK(id=1),json TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS slice_limits(worker TEXT NOT NULL,action TEXT NOT NULL,at TEXT NOT NULL,PRIMARY KEY(worker,action));`);}
 private tx<T>(fn:()=>T):T{this.db.exec('BEGIN IMMEDIATE');try{const r=fn();this.db.exec('COMMIT');return r;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 private jobs():SliceJob[]{return (this.db.prepare('SELECT json FROM slice_jobs ORDER BY rowid DESC LIMIT 500').all() as {json:string}[]).map(r=>JSON.parse(r.json));}
 get(id:string):SliceJob{const r=this.db.prepare('SELECT json FROM slice_jobs WHERE id=?').get(id) as {json:string}|undefined;if(!r)throw Error('Job not found');return JSON.parse(r.json);}
 contextHash(id:string){const j=this.get(id);return digest(JSON.stringify({input:j.input,result:j.result,measuredPartMass:j.measuredPartMass??null,config:this.config()}));}
 proposalContext(id:string){return this.tx(()=>{const job=this.get(id),config=this.config(),contextHash=digest(JSON.stringify({input:job.input,result:job.result,measuredPartMass:job.measuredPartMass??null,config}));return {job,config,contextHash};});}
 private save(j:SliceJob){this.db.prepare('UPDATE slice_jobs SET json=? WHERE id=?').run(JSON.stringify(j),j.id);return j;}
 private worker(id:string,now:Date):Worker{const w=this.db.prepare('SELECT * FROM slice_workers WHERE id=?').get(id) as Worker|undefined;if(!w||w.revoked||Date.parse(w.expires)<=now.getTime())throw Error('Invalid worker credential');return w;}
 enqueue(raw:SliceInput,now=new Date(),validate=()=>{}){
  const input=sliceInputSchema.parse(raw);
  if(input.materialPlan.use==='unknown')throw Error('Confirm intended use');
  if(input.materialPlan.use==='outdoor'&&input.profileId!=='x2d-04-020-petg')throw Error('Outdoor products require PETG');
  if(input.materialPlan.multicolor||input.materialPlan.lines.length!==1)throw Error('Multicolor setup needs validated hardware and assignments');
  if(input.materialPlan.lines[0].slot!==1)throw Error('Single color requires slot 1');
  const families={'x2d-04-020-pla-basic':'pla-basic','x2d-04-020-pla-matte':'pla-matte','x2d-04-020-petg':'petg-hf'};
  if(![families[input.profileId]+'-refill',families[input.profileId]+'-spool'].includes(input.materialPlan.lines[0].catalogItemId))throw Error('Material SKU does not match slicer profile');
  const key=digest(JSON.stringify(input));
  return this.tx(()=>{validate();const row=this.db.prepare('SELECT json FROM slice_jobs WHERE request_key=?').get(key) as {json:string}|undefined;if(row)return JSON.parse(row.json) as SliceJob;
   if(this.jobs().length>=500)throw Error('Slice history limit reached; archive before adding jobs');
   const j:SliceJob={id:randomUUID(),input,state:'queued',attempts:0,workerId:'',claimId:'',leaseUntil:'',createdAt:now.toISOString(),updatedAt:now.toISOString(),result:null,reason:''};this.db.prepare('INSERT INTO slice_jobs VALUES(?,?,?)').run(j.id,key,JSON.stringify(j));return j;});
 }
 pair(now=new Date()){const workerId=randomUUID(),token=randomBytes(32).toString('hex'),expiresAt=new Date(now.getTime()+30*86400000).toISOString();
  if(Number((this.db.prepare('SELECT COUNT(*) AS n FROM slice_workers').get() as {n:number}).n)>=50)throw Error('Worker history limit reached');
  this.db.prepare('INSERT INTO slice_workers VALUES(?,?,?,0,?)').run(workerId,digest(token),expiresAt,'');return {workerId,token,expiresAt};}
 authenticate(token:string,now=new Date()){if(!/^[a-f0-9]{64}$/.test(token))throw Error('Invalid worker credential');const h=Buffer.from(digest(token),'hex');for(const w of this.db.prepare('SELECT * FROM slice_workers').all() as Worker[]){if(timingSafeEqual(h,Buffer.from(w.hash,'hex'))){this.worker(w.id,now);return w.id;}}throw Error('Invalid worker credential');}
 revoke(id:string){this.db.prepare('UPDATE slice_workers SET revoked=1 WHERE id=?').run(id);}
 heartbeat(id:string,now=new Date()){this.worker(id,now);this.db.prepare('UPDATE slice_workers SET seen=? WHERE id=?').run(now.toISOString(),id);}
 limit(id:string,action:string,now=new Date()){this.worker(id,now);return this.tx(()=>{const row=this.db.prepare('SELECT at FROM slice_limits WHERE worker=? AND action=?').get(id,action) as {at:string}|undefined;if(row&&now.getTime()-Date.parse(row.at)<30000)throw Error('Rate limited');this.db.prepare('INSERT INTO slice_limits VALUES(?,?,?) ON CONFLICT(worker,action) DO UPDATE SET at=excluded.at').run(id,action,now.toISOString());});}
 claim(id:string,now=new Date()){this.worker(id,now);return this.tx(()=>{
  const jobs=this.jobs().reverse();
  for(const j of jobs)if(j.state==='running'&&Date.parse(j.leaseUntil)<=now.getTime()){j.state=j.attempts>=2?'failed':'queued';j.reason='Worker lease expired';this.save(j);}
  if(jobs.some(j=>j.state==='running'))return null;
  const j=jobs.find(j=>j.state==='queued');if(!j)return null;
  j.state='running';j.attempts++;j.workerId=id;j.claimId=randomUUID();j.leaseUntil=new Date(now.getTime()+300000).toISOString();j.updatedAt=now.toISOString();this.save(j);return {job:j,claimId:j.claimId};
 });}
 claimed(id:string,claimId:string,now=new Date()){this.worker(id,now);const j=this.jobs().find(j=>j.workerId===id&&j.claimId===claimId);if(!j||j.state!=='running'||Date.parse(j.leaseUntil)<=now.getTime())throw Error('Invalid or expired claim');return j;}
 finish(id:string,claimId:string,raw:SliceResult,now=new Date(),validate=(job:SliceJob)=>{void job;}){this.worker(id,now);const result=sliceResultSchema.parse(raw);return this.tx(()=>{
  const existing=this.jobs().find(j=>j.workerId===id&&j.claimId===claimId);
  if(existing?.state==='completed'){validate(existing);if(JSON.stringify(existing.result)!==JSON.stringify(result))throw Error('Different duplicate result');return existing;}
  const j=this.claimed(id,claimId,now);if(result.sourceSha256!==j.input.sha256||result.profileHash!==j.input.profileHash)throw Error('Result source/profile mismatch');
  if(result.filaments.length!==1||result.filaments[0].slot!==1||result.colorChanges!==0)throw Error('Unvalidated multicolor result');
  validate(j);j.result=result;j.state='completed';j.updatedAt=now.toISOString();return this.save(j);
 });}
 fail(id:string,claimId:string,_reason:string,now=new Date()){return this.tx(()=>{const j=this.claimed(id,claimId,now);j.state=j.attempts>=2?'failed':'queued';j.reason='Local slicing failed; check trusted worker setup';j.updatedAt=now.toISOString();return this.save(j);});}
 cancel(id:string){return this.tx(()=>{const j=this.get(id);if(j.state==='completed')throw Error('Completed job cannot be cancelled');j.state='cancelled';j.updatedAt=new Date().toISOString();this.save(j);});}
 retry(id:string,now=new Date(),validate=(job:SliceJob)=>{void job;}){return this.tx(()=>{const j=this.get(id);validate(j);if(!['failed','cancelled'].includes(j.state))throw Error('Only failed/cancelled jobs can be retried');j.state='queued';j.attempts=0;j.claimId='';j.workerId='';j.leaseUntil='';j.reason='Owner explicitly retried task';j.updatedAt=now.toISOString();return this.save(j);});}
 recordPartMass(id:string,grams:number,validate=(job:SliceJob)=>{void job;}){if(!Number.isFinite(grams)||grams<=0||grams>10000)throw Error('Invalid measured part weight');return this.tx(()=>{const j=this.get(id);validate(j);if(j.state!=='completed')throw Error('Completed current slice required');j.measuredPartMass={grams,at:new Date().toISOString()};return this.save(j);});}
 configure(raw:unknown){const c=slicingConfigSchema.parse(raw);this.db.prepare('INSERT INTO slice_config VALUES(1,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json').run(JSON.stringify(c));return c;}
 config(){const r=this.db.prepare('SELECT json FROM slice_config WHERE id=1').get() as {json:string}|undefined;return r?slicingConfigSchema.parse(JSON.parse(r.json)):defaultSlicingConfig();}
 snapshot(now=new Date()){return {jobs:this.jobs(),config:this.config(),workers:(this.db.prepare('SELECT id,expires,revoked,seen FROM slice_workers').all() as Omit<Worker,'hash'>[]).map(w=>({...w,online:!w.revoked&&Date.parse(w.expires)>now.getTime()&&!!w.seen&&now.getTime()-Date.parse(w.seen)<90000}))};}
}
