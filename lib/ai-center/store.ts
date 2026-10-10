import 'server-only';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { costBound, defaultSettings, enqueueSchema, monthKey, settingsSchema, usageFor } from './policy.ts';
import type { Agent, Job, Settings } from './types.ts';

export function centerDatabasePath() {
  const business = process.env.DATABASE_PATH || path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(process.cwd(),'data'),'3d-printing-business.sqlite');
  const file = path.resolve(/*turbopackIgnore: true*/ process.env.AI_CENTER_DATABASE_PATH || path.join(path.dirname(business),'ai-business-center.sqlite'));
  if(file.toLowerCase() === path.resolve(/*turbopackIgnore: true*/ business).toLowerCase()) throw new Error('AI state must use a separate database.');
  return file;
}
export class CenterStore {
  private db: DatabaseSync;
  constructor() {
    const file=centerDatabasePath(); mkdirSync(path.dirname(file),{recursive:true});
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS ai_settings (id INTEGER PRIMARY KEY CHECK(id=1), json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS ai_jobs (id TEXT PRIMARY KEY, key TEXT UNIQUE NOT NULL, json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS ai_activity (id INTEGER PRIMARY KEY, at TEXT NOT NULL, job_id TEXT NOT NULL, event TEXT NOT NULL);');
  }
  close() { this.db.close(); }
  private transaction<T>(fn:()=>T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const v=fn(); this.db.exec('COMMIT'); return v; } catch(e) { this.db.exec('ROLLBACK'); throw e; }
  }
  private settings(): Settings { const row=this.db.prepare('SELECT json FROM ai_settings WHERE id=1').get() as {json:string}|undefined; return row?settingsSchema.parse(JSON.parse(row.json)):defaultSettings(); }
  private jobs(): Job[] { return (this.db.prepare('SELECT json FROM ai_jobs ORDER BY rowid DESC').all() as {json:string}[]).map(r=>JSON.parse(r.json)); }
  private job(id: string): Job { const row=this.db.prepare('SELECT json FROM ai_jobs WHERE id=?').get(id) as {json:string}|undefined; if(!row)throw new Error('Task not found.'); return JSON.parse(row.json); }
  private save(job: Job, event: string) { job.updatedAt=new Date().toISOString(); this.db.prepare('INSERT INTO ai_jobs(id,key,json) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json').run(job.id,job.key,JSON.stringify(job)); this.log(job.id,event); }
  private log(id: string,event: string) { this.db.prepare('INSERT INTO ai_activity(at,job_id,event) VALUES(?,?,?)').run(new Date().toISOString(),id,event); }
  snapshot(now=new Date()) {
    const jobs=this.jobs(),month=monthKey(now);
    return { settings:this.settings(),jobs:jobs.slice(0,200),approvals:jobs.filter(j=>['spend-review','review'].includes(j.status)),pendingCounts:{mesh:jobs.filter(j=>j.agent==='mesh'&&['queued','running','spend-review','review'].includes(j.status)).length,products:jobs.filter(j=>j.agent==='products'&&['queued','running','spend-review','review'].includes(j.status)).length},month,usage:{committedCents:usageFor(jobs,month),agents:{mesh:usageFor(jobs,month,'mesh'),products:usageFor(jobs,month,'products')},uncertainCents:jobs.filter(j=>j.month===month && j.chargedCents===null).reduce((n,j)=>n+j.reservedCents,0)},activity:this.db.prepare('SELECT at,job_id AS jobId,event FROM ai_activity ORDER BY id DESC LIMIT 100').all() as {at:string;jobId:string;event:string}[] };
  }
  configure(input: Settings) { const settings=settingsSchema.parse(input); return this.transaction(()=>{this.db.prepare('INSERT INTO ai_settings(id,json) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json').run(JSON.stringify(settings)); this.log('','Owner updated limits and agent configuration'); return settings;}); }
  enqueue(input: {agent:Agent;kind:Job['kind'];brief:string;key:string}) {
    const value=enqueueSchema.parse(input);
    return this.transaction(()=>{
      const existing=this.db.prepare('SELECT json FROM ai_jobs WHERE key=?').get(value.key) as {json:string}|undefined;
      if(existing) { const j:Job=JSON.parse(existing.json); if(j.agent!==value.agent||j.kind!==value.kind||j.brief!==value.brief)throw new Error('Idempotency key used for different task.'); return j; }
      const settings=this.settings(), config={...settings.agents[value.agent]};
      if(config.provider !== 'template' && !settings.paidEnabled)throw new Error('Paid AI is disabled.');
      const now=new Date().toISOString();
      const job:Job={...value,config,id:randomUUID(),createdAt:now,updatedAt:now,status:config.provider==='template'?'queued':'spend-review',month:'',reservedCents:0,chargedCents:null,boundCents:0,output:'',reason:''};
      job.boundCents=costBound(job); this.save(job,'Owner queued draft task'); return job;
    });
  }
  decide(id: string, decision: 'approve'|'reject') {
    return this.transaction(()=>{
      const job=this.job(id);
      if(!['spend-review','review'].includes(job.status))throw new Error('No pending approval.');
      job.status=decision==='reject'?'rejected':job.status==='spend-review'?'queued':'ready';
      this.save(job,decision==='reject'?'Owner rejected task':'Owner approved '+(job.status==='queued'?'bounded API spending':'draft for manual use; no external action')); return job;
    });
  }
  claim(now=new Date()): Job|null {
    return this.transaction(()=>{
      const settings=this.settings(),jobs=this.jobs(),month=monthKey(now);
      // Recover stalled jobs without resending a potentially billed request. Never refund an uncertain reservation.
      for(const j of jobs)if(j.status==='running' && now.getTime()-Date.parse(j.updatedAt)>300_000){j.status='failed';j.reason='Interrupted worker; reservation retained. No automatic retry.';this.save(j,'Interrupted job recovered without retry');}
      for(const job of jobs.slice().reverse()) {
        if(job.status!=='queued')continue;
        if(job.config.provider!=='template' && !settings.paidEnabled)continue;
        if(usageFor(jobs,month)+job.boundCents>settings.monthlyLimitCents || usageFor(jobs,month,job.agent)+job.boundCents>settings.agents[job.agent].monthlyLimitCents)continue;
        job.month=month;job.reservedCents=job.boundCents;job.status='running';this.save(job,'Worker claimed task and reserved budget');return job;
      }
      return null;
    });
  }
  finish(id: string, output: string, chargedCents: number) {
    return this.transaction(()=>{
      const job=this.job(id);if(job.status!=='running')throw new Error('Task is not running.');
      if(!Number.isSafeInteger(chargedCents)||chargedCents<0)throw new Error('Invalid usage.');
      job.status='review';job.output=output.slice(0,24000);job.chargedCents=chargedCents;
      if(chargedCents>job.reservedCents){job.reason='Reported cost exceeded bound; paid AI disabled. Verify provider pricing.';const settings=this.settings();settings.paidEnabled=false;this.db.prepare('INSERT INTO ai_settings(id,json) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json').run(JSON.stringify(settings));}
      this.save(job,'Draft produced; human review required');return job;
    });
  }
  fail(id: string) { return this.transaction(()=>{const job=this.job(id);if(job.status!=='running')throw new Error('Task is not running.');job.status='failed';job.reason='Worker failed or provider outcome uncertain. Reservation retained; no automatic retry.';this.save(job,'Worker failed; reservation retained');return job;}); }
}
