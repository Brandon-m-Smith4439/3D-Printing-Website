import 'server-only';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID,createHash} from 'node:crypto';
import {z} from 'zod';
import {CenterStore,centerDatabasePath} from './store.ts';
import {inspectStl} from './stl.ts';
import {ProjectRecords} from './projects.ts';

export const meshRequest=z.object({projectId:z.uuid(),version:z.number().int().positive(),prompt:z.string().trim().min(10).max(800),longestSideMm:z.number().int().min(20).max(150)}).strict();
type MeshJob=z.infer<typeof meshRequest>&{id:string;parentId?:string;model:'meshy-6';status:'spend-review'|'queued'|'submitting'|'pending'|'analyze-submitting'|'analyzing'|'review'|'failed'|'imported'|'rejected';createdAt:string;month:string;reservedCredits:number;chargedCredits:number|null;providerId?:string;analysisId?:string;pollAt:number;leaseUntil?:number;leaseToken?:string;artifactId?:string;sha256?:string;report?:unknown;note:string};
const taskId=z.uuid();
const enabled=()=>process.env.AI_CENTER_MESHY_ENABLED==='true';
function limit(){const n=Number(process.env.AI_CENTER_MESHY_MONTHLY_CREDITS??30);if(!Number.isSafeInteger(n)||n<0||n>10000)throw Error('Invalid Meshy credit cap.');return n;}
const month=()=>new Date().toISOString().slice(0,7);
export class MeshyStore {
 private db:DatabaseSync;
 private projects:ProjectRecords;
 constructor(){const center=new CenterStore();center.close();this.db=new DatabaseSync(centerDatabasePath());this.db.exec('PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS ai_meshy_jobs(id TEXT PRIMARY KEY,json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS ai_meshy_notifications(id TEXT PRIMARY KEY,at INTEGER NOT NULL);');this.projects=new ProjectRecords(this.db);}
 close(){this.db.close();}
 private transaction<T>(fn:()=>T){this.db.exec('BEGIN IMMEDIATE');try{const v=fn();this.db.exec('COMMIT');return v;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 private jobs(){return (this.db.prepare('SELECT json FROM ai_meshy_jobs ORDER BY rowid DESC').all() as {json:string}[]).map(r=>JSON.parse(r.json) as MeshJob);}
 get(id:string){const j=this.jobs().find(j=>j.id===id);if(!j)throw Error('Meshy task not found.');return j;}
 private put(j:MeshJob){this.db.prepare('INSERT INTO ai_meshy_jobs(id,json) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json').run(j.id,JSON.stringify(j));return j;}
 save(j:MeshJob){const r=this.db.prepare("INSERT INTO ai_meshy_jobs(id,json) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json WHERE json_extract(ai_meshy_jobs.json,'$.leaseToken') IS json_extract(excluded.json,'$.leaseToken')").run(j.id,JSON.stringify(j));if(!r.changes)throw Error('Worker lease changed; discard stale response.');return j;}
 private log(id:string,event:string){this.db.prepare('INSERT INTO ai_activity(at,job_id,event) VALUES(?,?,?)').run(new Date().toISOString(),id,event);}
 snapshot(){const jobs=this.jobs();return {enabled:enabled(),configured:Boolean(process.env.AI_CENTER_MESHY_API_KEY),monthlyLimitCredits:limit(),committedCredits:jobs.filter(j=>j.month===month()).reduce((n,j)=>n+(j.chargedCredits??j.reservedCredits),0),jobs:jobs.slice(0,100)};}
 enqueue(input:z.infer<typeof meshRequest>,parentId?:string){const v=meshRequest.parse(input);return this.transaction(()=>{
  this.projects.get(v.projectId,v.version);
  if(!enabled())throw Error('Meshy disabled.');
  if(this.jobs().some(j=>j.projectId===v.projectId&&!['review','failed','imported','rejected'].includes(j.status)))throw Error('Finish this project’s existing Meshy task first.');
  if(parentId){const parent=this.get(parentId);if(parent.parentId||!parent.providerId||parent.status!=='review'||parent.projectId!==v.projectId||this.jobs().some(j=>j.parentId===parentId))throw Error('Only one approved repair per generation.');}
  const j:MeshJob={...v,id:randomUUID(),model:'meshy-6',parentId,status:'spend-review',createdAt:new Date().toISOString(),month:'',reservedCredits:0,chargedCredits:null,pollAt:0,note:'Owner approval required: '+(parentId?'10':'20')+' credits. No automatic publishing.'};this.save(j);this.log(j.id,'Meshy draft queued for owner spending approval');return j;
 });}
 approve(id:string,reject=false){return this.transaction(()=>{const j=this.get(id);if(j.status!=='spend-review')throw Error('No spending approval pending.');j.status=reject?'rejected':'queued';this.save(j);this.log(j.id,reject?'Owner rejected Meshy task':'Owner approved bounded Meshy credit spending');return j;});}
 claim(){return this.transaction(()=>{
  if(!enabled()||!process.env.AI_CENTER_MESHY_API_KEY)return null;
  const jobs=this.jobs(),used=this.snapshot().committedCredits,now=Date.now();
  if(jobs.some(j=>j.chargedCredits!==null&&j.chargedCredits>j.reservedCredits))return null;
  // Submitting is deliberately never reclaimed: an interrupted POST may already be billed.
  for(const j of jobs.slice().reverse()){
   if(['pending','analyzing'].includes(j.status)&&j.pollAt<=now&&(j.leaseUntil??0)<=now){j.pollAt=now+60_000;j.leaseUntil=now+90_000;j.leaseToken=randomUUID();return this.put(j);}
   if(j.status!=='queued')continue;
   const cost=j.parentId?10:20;if(used+cost>limit())continue;
   try{this.projects.get(j.projectId,j.version);}catch{j.status='rejected';j.note='Project changed before spending.';this.save(j);continue;}
   j.month=month();j.reservedCredits=cost;j.status='submitting';j.pollAt=now+60_000;j.leaseToken=randomUUID();this.put(j);this.log(j.id,'Meshy credits reserved before provider submission');return j;
  }return null;
 });}
 notify(providerId:string){return this.transaction(()=>{const j=this.jobs().find(j=>j.providerId===providerId||j.analysisId===providerId);if(!j||!['pending','analyzing'].includes(j.status))return false;
  // Durable notification only: callbacks cannot bypass the worker lease or supply results.
  this.db.prepare('INSERT INTO ai_meshy_notifications(id,at) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET at=excluded.at').run(j.id,Date.now());
  if((j.leaseUntil??0)<=Date.now()){j.pollAt=Date.now();this.save(j);}
  return true;
 });}
 asset(data:Buffer){if(!data.length||data.length>20_000_000)throw Error('Meshy STL exceeds private asset limit.');const quota=Number(process.env.AI_CENTER_ASSET_LIMIT_BYTES??100_000_000);const used=(this.db.prepare('SELECT COALESCE(SUM(length(data)),0) AS bytes FROM ai_assets').get() as {bytes:number}).bytes;if(!Number.isSafeInteger(quota)||quota<1||quota>1_000_000_000||used+data.length>quota)throw Error('Private asset quota exceeded.');const id=randomUUID();this.db.prepare('INSERT INTO ai_assets(id,filename,data) VALUES(?,?,?)').run(id,'meshy-unvalidated.stl',data);return id;}
 recordAsset(j:MeshJob,data:Buffer){return this.transaction(()=>{const current=this.get(j.id);if(current.leaseToken!==j.leaseToken)throw Error('Worker lease changed.');if(current.artifactId)return current;current.artifactId=this.asset(data);current.sha256=createHash('sha256').update(data).digest('hex');return this.save(current);});}
 importRevision(id:string){return this.transaction(()=>{const j=this.get(id);if(j.status!=='review'||!j.artifactId)throw Error('Model is not ready for owner import.');
  const raw=this.projects.asset(j.artifactId).data;const data=scaledStl(raw,j.longestSideMm);const p=this.projects.revision(j.projectId,j.version,'meshy-candidate.stl',`Meshy ${j.model}; source task ${j.providerId}; original file SHA256 ${j.sha256}; scaled longest side ${j.longestSideMm} mm. Automated report is advisory. Slicer review and physical test required.`,data);j.status='imported';this.save(j);this.log(j.id,'Owner imported Meshy revision; physical print test required');return p;
 });}
}
// Only the official asset host is permitted; no redirects or user-supplied URLs.
export function meshAssetUrl(value:string){const u=new URL(value);if(u.protocol!=='https:'||u.hostname!=='assets.meshy.ai'||u.port||u.username||u.password)throw Error('Untrusted Meshy asset location.');return u;}
async function bounded(response:Response,max:number){if(!response.ok||Number(response.headers.get('content-length')||0)>max)throw Error('Provider response rejected.');const reader=response.body?.getReader();if(!reader)throw Error('Empty response.');const chunks:Uint8Array[]=[];let bytes=0;try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>max)throw Error('Provider response too large.');chunks.push(part.value);}return Buffer.concat(chunks);}finally{await reader.cancel();}}
async function api(endpoint:string,body:unknown,fetcher:typeof fetch){const key=process.env.AI_CENTER_MESHY_API_KEY;if(!key)throw Error('Meshy key missing.');const response=await fetcher('https://api.meshy.ai'+endpoint,{method:body===undefined?'GET':'POST',redirect:'error',signal:AbortSignal.timeout(20_000),headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return JSON.parse((await bounded(response,200_000)).toString());}
export async function runMeshyOne(store:MeshyStore,fetcher:typeof fetch=fetch){let j=store.claim();if(!j)return null;
 try{
  if(j.status==='submitting'){
   const body=j.parentId?{input_task_id:store.get(j.parentId).providerId,printer_type:'fdm',intended_print_longest_side_mm:j.longestSideMm}:{mode:'preview',model_type:'standard',ai_model:j.model,prompt:j.prompt,should_remesh:false,target_formats:['stl'],moderation:true};
   const result=await api(j.parentId?'/openapi/v1/print/repair':'/openapi/v2/text-to-3d',body,fetcher);j.providerId=taskId.parse(result.result);j.status='pending';store.save(j);return j;
  }
  const endpoint=j.status==='analyzing'?'/openapi/v1/print/analyze/':j.parentId?'/openapi/v1/print/repair/':'/openapi/v2/text-to-3d/';
  const response=await api(endpoint+taskId.parse(j.status==='analyzing'?j.analysisId:j.providerId),undefined,fetcher);
  if(response.id!==(j.status==='analyzing'?j.analysisId:j.providerId))throw Error('Wrong provider task.');
  if(response.status==='FAILED'||response.status==='CANCELED'){j.status='failed';j.note='Provider task failed. Reserved credits retained until verified reconciliation.';return store.save(j);}
  if(response.status!=='SUCCEEDED'){if(Date.now()-Date.parse(j.createdAt)>3*86400_000){j.status='failed';j.note='Task expired; manual provider reconciliation required.';}j.leaseUntil=0;return store.save(j);}
  if(j.status==='analyzing'){j.report=response.printability??{status:'unknown'};j.status='review';j.note='Review report and import candidate. No physical print test has been performed.';return store.save(j);}
  if(Number.isSafeInteger(response.consumed_credits)&&response.consumed_credits>=0)j.chargedCredits=response.consumed_credits;
  if(j.chargedCredits!==null&&j.chargedCredits>j.reservedCredits){j.status='failed';j.note='Provider exceeded approved credit bound; disable Meshy and reconcile.';return store.save(j);}
  store.save(j);
  if(!j.artifactId){const url=meshAssetUrl(z.string().parse(response.model_urls?.stl));const asset=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(20_000)});j=store.recordAsset(j,await bounded(asset,20_000_000));}
  j.status='analyze-submitting';store.save(j);
  const analysis=await api('/openapi/v1/print/analyze',{input_task_id:j.providerId,printer_type:'fdm',intended_print_longest_side_mm:j.longestSideMm},fetcher);j.analysisId=taskId.parse(analysis.result);j.status='analyzing';j.pollAt=Date.now()+60_000;return store.save(j);
 }catch{
  if(['pending','analyzing'].includes(j.status)&&Date.now()-Date.parse(j.createdAt)<3*86400_000){j.leaseUntil=0;j.pollAt=Date.now()+60_000;j.note='Status or download check unavailable; read-only checks will resume. No paid resubmission.';return store.save(j);}
  j.status='failed';j.note='Provider outcome uncertain or file rejected. Reservation and any private file retained. No automatic resubmission; reconcile in Meshy.';return store.save(j);
 }
}
function scaledStl(data:Buffer,longest:number){
 const inspection=inspectStl(data);const n=data.readUInt32LE(80);if(data.length!==84+50*n)throw Error('Import requires a binary STL; convert in your slicer first.');const out=Buffer.from(data),scale=longest/Math.max(...inspection.sizeMm);if(!Number.isFinite(scale)||scale<=0)throw Error('Invalid model bounds.');
 for(let t=0;t<n;t++)for(let v=0;v<3;v++)for(let axis=0;axis<3;axis++){const offset=84+t*50+12+v*12+axis*4;out.writeFloatLE(data.readFloatLE(offset)*scale,offset);}inspectStl(out);return out;
}
