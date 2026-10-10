import {z} from 'zod';
import {createHash,randomUUID} from 'node:crypto';
import type {DatabaseSync} from 'node:sqlite';
import {inspectStl} from './stl.ts';
const text=z.string().trim().min(1).max(2000);
export const createProjectSchema=z.object({business:z.enum(['mesh','products']),name:z.string().trim().min(1).max(100),brief:text}).strict();
export const projectActionSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('evidence'),label:z.string().trim().min(1).max(120),url:z.url().max(1000).refine(v=>{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password;}),signal:text}).strict(),
 z.object({action:z.literal('test'),revisionId:z.uuid(),passed:z.boolean(),notes:text,printer:z.string().trim().min(1).max(100),material:z.string().trim().min(1).max(100),minutes:z.number().int().min(1).max(10000),grams:z.number().positive().max(10000)}).strict(),
 z.object({action:z.literal('prepare'),description:text,physicalPriceCents:z.number().int().positive().max(1000000),digitalPriceCents:z.number().int().positive().max(1000000),costCents:z.number().int().min(0).max(1000000),stock:z.number().int().min(0).max(10000),license:text,original:z.literal(true)}).strict(),
]);
export type ProjectAction=z.infer<typeof projectActionSchema>;
type PrintTest=Extract<ProjectAction,{action:'test'}>&{at:string};
export type Revision={id:string;filename:string;sha256:string;notes:string;at:string;inspection:ReturnType<typeof inspectStl>;tests:PrintTest[]};
export type ProductProject={id:string;business:'mesh'|'products';name:string;brief:string;version:number;createdAt:string;updatedAt:string;stage:'research'|'design'|'test'|'refine'|'release';evidence:{label:string;url:string;signal:string;at:string}[];revisions:Revision[];release:(Extract<ProjectAction,{action:'prepare'}>&{revisionId:string;at:string})|null};
export class ProjectRecords {
 constructor(privateDb:DatabaseSync){this.db=privateDb;this.db.exec('CREATE TABLE IF NOT EXISTS ai_projects(id TEXT PRIMARY KEY,json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS ai_assets(id TEXT PRIMARY KEY,filename TEXT NOT NULL,data BLOB NOT NULL);');}
 private db:DatabaseSync;
 private ensureAssetSpace(bytes:number){
  const limit=Number(process.env.AI_CENTER_ASSET_LIMIT_BYTES??100_000_000);
  const used=(this.db.prepare('SELECT COALESCE(SUM(length(data)),0) AS bytes FROM ai_assets').get() as {bytes:number}).bytes;
  if(!Number.isSafeInteger(limit)||limit<1||limit>1_000_000_000||used+bytes>limit)throw Error('AI asset storage limit reached or invalid; review storage configuration.');
 }
 list(){return (this.db.prepare('SELECT json FROM ai_projects ORDER BY rowid DESC').all() as {json:string}[]).map(r=>JSON.parse(r.json) as ProductProject);}
 get(id:string,version?:number){const row=this.db.prepare('SELECT json FROM ai_projects WHERE id=?').get(id) as {json:string}|undefined;if(!row)throw Error('Project not found.');const p=JSON.parse(row.json) as ProductProject;if(version!==undefined&&p.version!==version)throw Error('Project changed; refresh before acting.');return p;}
 save(p:ProductProject){p.updatedAt=new Date().toISOString();this.db.prepare('INSERT INTO ai_projects(id,json) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json').run(p.id,JSON.stringify(p));return p;}
 approveResearch(id:string,key:string){const p=this.get(id);if(key===`project-${id}-${p.version}-research`&&p.stage==='research'&&p.evidence.length){p.stage='design';p.version++;this.save(p);}}
 create(input:z.infer<typeof createProjectSchema>){const v=createProjectSchema.parse(input),at=new Date().toISOString();return this.save({...v,id:randomUUID(),version:1,createdAt:at,updatedAt:at,stage:'research',evidence:[],revisions:[],release:null});}
 apply(id:string,version:number,input:ProjectAction){const action=projectActionSchema.parse(input),p=this.get(id,version),at=new Date().toISOString();
  if(action.action==='evidence'){if(p.evidence.length>=50)throw Error('At most 50 evidence records.');p.evidence.push({label:action.label,url:action.url,signal:action.signal,at});if(!p.revisions.length)p.stage='research';}
  else if(action.action==='test'){const r=p.revisions.at(-1);if(!r||r.id!==action.revisionId)throw Error('Test must refer to the current revision.');if(r.tests.length>=50)throw Error('At most 50 tests per revision.');r.tests.push({...action,at});p.release=null;p.stage=action.passed?'design':'refine';}
  else {const r=p.revisions.at(-1);if(!r||!r.tests.at(-1)?.passed)throw Error('Current revision needs a passing physical test.');if(action.physicalPriceCents<=action.costCents)throw Error('Physical price must exceed estimated direct cost.');p.release={...action,revisionId:r.id,at};p.stage='release';}
  p.version++;return this.save(p);
 }
 revision(id:string,version:number,filename:string,notes:string,data:Buffer){this.ensureAssetSpace(data.length);const p=this.get(id,version);if(p.revisions.length>=20)throw Error('At most 20 revisions per project.');if(!/^[a-zA-Z0-9._ -]{1,100}\.stl$/i.test(filename))throw Error('Use a simple STL filename.');text.parse(notes);const r:Revision={id:randomUUID(),filename,sha256:createHash('sha256').update(data).digest('hex'),notes,at:new Date().toISOString(),inspection:inspectStl(data),tests:[]};this.db.prepare('INSERT INTO ai_assets(id,filename,data) VALUES(?,?,?)').run(r.id,filename,data);p.revisions.push(r);p.release=null;p.stage='test';p.version++;return this.save(p);}
 asset(id:string){const r=this.db.prepare('SELECT filename,data FROM ai_assets WHERE id=?').get(id) as {filename:string;data:Uint8Array}|undefined;if(!r)throw Error('File not found.');return {filename:r.filename,data:Buffer.from(r.data)};}
}
