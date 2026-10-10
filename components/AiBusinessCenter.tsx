'use client';
import { useCallback, useEffect, useState } from 'react';
import type { CenterStore } from '@/lib/ai-center/store';
import type { businessOverview } from '@/lib/ai-center/metrics';
import type { Agent, Job, Settings } from '@/lib/ai-center/types';
import {roleNames} from '@/lib/ai-center/types';
import styles from './AiBusinessCenter.module.css';
import {ProductProjects} from './ProductProjects';
import {LaunchReadiness} from './LaunchReadiness';
import {MarketplaceConnections} from './MarketplaceConnections';
import {OwnerCatalog} from './OwnerCatalog';
import {EtsyPublication} from './EtsyPublication';

type Snapshot=ReturnType<CenterStore['snapshot']>&{business:ReturnType<typeof businessOverview>;providerConfigured:boolean};
const money=(cents:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
const names={mesh:'Mesh Harbor automation',products:'Independent digital products'};
const labels:Record<Job['status'],string>={'spend-review':'Spending approval needed',queued:'Queued',running:'Running',review:'Draft review needed',ready:'Ready for manual use',rejected:'Rejected',failed:'Failed — no retry'};
export function AiBusinessCenter() {
  const [data,setData]=useState<Snapshot|null>(null),[settings,setSettings]=useState<Settings|null>(null);
  const [error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const [agent,setAgent]=useState<Agent>('mesh'),[kind,setKind]=useState<Job['kind']>('review'),[brief,setBrief]=useState(''),[taskKey,setTaskKey]=useState('');
  const load=useCallback(async()=>{
    try {const response=await fetch('/api/owner/business',{cache:'no-store'});const value=await response.json();if(!response.ok)throw Error(value.message||'Unable to load.');setData(value);setSettings(value.settings);setError('');}
    catch(e){setError(e instanceof Error?e.message:'Unable to load.');}
  },[]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{const timer=setInterval(()=>{if(document.visibilityState==='visible'&&!busy)void fetch('/api/owner/business',{cache:'no-store'}).then(async r=>{if(r.ok)setData(await r.json());}).catch(()=>{});},10000);return ()=>clearInterval(timer);},[busy]);
  async function command(value:unknown) {
    setBusy(true);setMessage('');setError('');
    try {const response=await fetch('/api/owner/business',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});const result=await response.json();if(!response.ok)throw Error(result.message);setMessage(result.message);await load();return true;}
    catch(e){setError(e instanceof Error?e.message:'Action failed.');return false;}
    finally {setBusy(false);}
  }
  const configureAgent=(id:Agent,patch:Partial<Settings['agents'][Agent]>)=>setSettings(s=>s?{...s,agents:{...s.agents,[id]:{...s.agents[id],...patch}}}:s);
  const approvals=data?.approvals||[];
  return <div className={styles.center}>
    <div className={styles.notice}><strong>Draft-only workspace</strong><p>Approving a draft marks it ready for manual use. Customer outreach stays draft-only. Storefront and Etsy publication require separate configuration and owner approval; deployment remains an owner decision. Paid API jobs need a separate spending approval.</p></div>
    <div role="status" aria-live="polite">{message}</div>{error&&<p role="alert" className={styles.error}>{error}</p>}
    <button type="button" disabled={busy} onClick={()=>void load()}>Refresh</button>
    {!data||!settings?<p>Waiting for owner data…</p>:<>
      <LaunchReadiness />
      <MarketplaceConnections projects={data.projects} jobs={data.jobs} onProjectChanged={load}/>
      <OwnerCatalog />
      <EtsyPublication projects={data.projects}/>
      <ProductProjects projects={data.projects} jobs={data.jobs} busy={busy} command={command} reload={load}/>
      <div className={styles.grid}>
        <article className={styles.card}><h2>AI budget · {data.month} UTC</h2><p className={styles.big}>{money(data.usage.committedCents)} / {money(data.settings.monthlyLimitCents)}</p><p>Used or reserved. Uncertain reservations: {money(data.usage.uncertainCents)}. Provider invoices may differ.</p></article>
        {(Object.keys(names) as Agent[]).map(id=><article key={id} className={styles.card}><h2>{names[id]}</h2><p className={styles.big}>{money(data.usage.agents[id])} / {money(data.settings.agents[id].monthlyLimitCents)}</p><p>{data.settings.agents[id].provider} · {data.settings.agents[id].model}</p><p>{data.pendingCounts[id]} tasks needing work or review</p></article>)}
      </div>
      <article className={styles.card}><h2>Mesh Harbor activity & finances</h2>{data.business.available?<>
        <p>{data.business.source} · as of {new Date(data.business.asOf).toLocaleString()}</p>
        <div className={styles.metrics}><p><strong>{data.business.counts.requests}</strong> requests · {data.business.counts.activeRequests} active</p><p><strong>{data.business.counts.quotes}</strong> quote records</p><p><strong>{data.business.counts.customers}</strong> registered customers</p><p><strong>{data.business.counts.queue}</strong> production queue records</p></div>
        <div className={styles.metrics}><p>Recorded net payments<br/><strong>{money(data.business.recordedNetPaymentsCents)}</strong></p><p>Costed completed job revenue<br/><strong>{money(data.business.profitability.completed.revenueCents)}</strong></p><p>Costed contribution profit<br/><strong>{money(data.business.profitability.completed.contributionProfitCents)}</strong></p><p>Completed jobs without costing<br/><strong>{data.business.profitability.completed.uncostedCount}</strong></p></div>
        <p className={styles.muted}>{data.business.limitations}</p>
        <h3>Recent request activity</h3>{data.business.recent.length?<ul>{data.business.recent.map(r=><li key={r.id}>{r.code} · {r.status} · {new Date(r.updatedAt).toLocaleString()}</li>)}</ul>:<p>No stored request activity.</p>}
      </>:<p>{data.business.message}</p>}<p>Independent product revenue is unavailable until an approved sales-data adapter is configured.</p></article>
      <div className={styles.grid}>
        <article className={styles.card}><h2>Queue a draft</h2><form onSubmit={async e=>{e.preventDefault();const key=taskKey||crypto.randomUUID();setTaskKey(key);if(await command({action:'enqueue',task:{agent,kind,brief,key}})){setBrief('');setTaskKey('');}}}>
          <label>Revenue engine<select value={agent} onChange={e=>{const id=e.target.value as Agent;setAgent(id);setKind(id==='mesh'?'review':'idea');setTaskKey('');}}><option value="mesh">Mesh Harbor automation</option><option value="products">Independent digital products</option></select></label>
          <label>Task<select value={kind} onChange={e=>{setKind(e.target.value as Job['kind']);setTaskKey('');}}>{(agent==='mesh'?['review','outreach']:['idea','listing']).map(k=><option key={k} value={k}>{k==='review'?'Operations review':k==='outreach'?'Lead/customer outreach draft':k==='idea'?'Product idea':'Listing draft'}</option>)}</select></label>
          <label>Brief<textarea required maxLength={3000} rows={5} value={brief} onChange={e=>{setBrief(e.target.value);setTaskKey('');}} placeholder="Describe the problem, audience, and desired draft. Avoid customer details, secrets, and personal information."/></label>
          <p>Manual tasks send only this brief. Delegated project tasks also include abbreviated project notes, test feedback, research observations and the reviewed leader plan. Customer records are not automatically included. Local templates are free and provide a starting checklist.</p><button disabled={busy||!brief.trim()}>Queue draft</button>
        </form><button type="button" disabled={busy} onClick={()=>void command({action:'run'})}>Process one eligible task</button><p>Each click processes at most one approved job. The optional background worker is configured separately; task status shows recorded activity.</p></article>
        <article className={styles.card}><h2>Approvals inbox · {approvals.length}</h2>{approvals.length?approvals.map(j=><div key={j.id} className={styles.approval}><h3>{names[j.agent]} · {j.kind}</h3><p><strong>{labels[j.status]}</strong></p><p>{j.status==='spend-review'?`Approve one API call up to ${money(j.boundCents)}, using ${j.config.provider} / ${j.config.model}. A separate review follows.`:'Review the complete draft below. Approval permits manual use only.'}</p><details><summary>Review brief{j.output?' and draft':''}</summary><pre>{j.brief}</pre>{j.output&&<pre>{j.output}</pre>}</details><button type="button" disabled={busy} onClick={()=>void command({action:'decide',id:j.id,decision:'approve'})}>{j.status==='spend-review'?'Approve bounded API spend':'Approve draft for manual use'}</button> <button type="button" disabled={busy} onClick={()=>void command({action:'decide',id:j.id,decision:'reject'})}>Reject</button></div>):<p>No pending approvals.</p>}</article>
      </div>
      <article className={styles.card}><h2>Monthly limits & model settings</h2><form onSubmit={e=>{e.preventDefault();void command({action:'configure',settings});}}>
        <label>Total monthly budget (USD)<input type="number" min="0" max="10000" step="0.01" required value={settings.monthlyLimitCents/100} onChange={e=>setSettings({...settings,monthlyLimitCents:Math.round(Number(e.target.value)*100)})}/></label>
        <label className={styles.check}><input type="checkbox" checked={settings.paidEnabled} onChange={e=>setSettings({...settings,paidEnabled:e.target.checked})}/>Enable paid AI jobs (each still needs spending approval)</label>
        <p>OpenAI key: {data.providerConfigured?'configured on server':'not configured'}. Prices must be checked against your provider account before paid use. Budgets apply to this workspace only.</p>
        <div className={styles.grid}>{(Object.keys(names) as Agent[]).map(id=><fieldset key={id}><legend>{names[id]}</legend>
          <label>Monthly business budget (USD)<input type="number" min="0" max="10000" step="0.01" required value={settings.agents[id].monthlyLimitCents/100} onChange={e=>configureAgent(id,{monthlyLimitCents:Math.round(Number(e.target.value)*100)})}/></label>
          <h3>Agent role limits</h3><p>Each role shares the business provider and model. Its cap is an additional ceiling within the business budget. Zero blocks paid calls; free templates remain available.</p>
          {(Object.keys(roleNames) as Job['kind'][]).map(role=><label key={role}>{roleNames[role]} monthly cap (USD) — {money(data.usage.roles[id][role])} used or reserved<input type="number" min="0" max="10000" step="0.01" required value={settings.agents[id].roleLimitsCents[role]/100} onChange={e=>configureAgent(id,{roleLimitsCents:{...settings.agents[id].roleLimitsCents,[role]:Math.round(Number(e.target.value)*100)}})}/></label>)}
          <label>Provider<select value={settings.agents[id].provider} onChange={e=>configureAgent(id,{provider:e.target.value as 'template'|'openai',model:e.target.value==='template'?'local-template':'gpt-4.1-mini'})}><option value="template">Local templates (free)</option><option value="openai">OpenAI API</option></select></label>
          {settings.agents[id].provider==='openai'&&<><label>Model<select value={settings.agents[id].model} onChange={e=>configureAgent(id,{model:e.target.value})}><option>gpt-4.1-mini</option><option>gpt-4o-mini</option></select></label>
          <label>Input price (USD / million tokens)<input required type="number" min="0.01" max="1000" step="0.01" value={settings.agents[id].inputCentsPerMillion/100} onChange={e=>configureAgent(id,{inputCentsPerMillion:Math.round(Number(e.target.value)*100)})}/></label>
          <label>Output price (USD / million tokens)<input required type="number" min="0.01" max="1000" step="0.01" value={settings.agents[id].outputCentsPerMillion/100} onChange={e=>configureAgent(id,{outputCentsPerMillion:Math.round(Number(e.target.value)*100)})}/></label></>}
          <label>Max output tokens<input type="number" min="128" max="2048" required value={settings.agents[id].maxOutputTokens} onChange={e=>configureAgent(id,{maxOutputTokens:Number(e.target.value)})}/></label>
        </fieldset>)}</div><p>Limits use UTC calendar months. Jobs retain the model and prices approved when queued; current total, business and role monthly limits and the paid-AI toggle are checked again when claimed.</p><button disabled={busy}>Save settings</button>
      </form></article>
      <article className={styles.card}><h2>Task queue & drafts</h2><p>Latest 200 tasks. Failed and interrupted jobs are never automatically retried; uncertain spend remains reserved.</p>{data.jobs.length?data.jobs.map(j=><details key={j.id} className={styles.approval}><summary>{names[j.agent]} · {j.kind} · {labels[j.status]} · {money(j.chargedCents??j.reservedCents)}</summary><p>{new Date(j.createdAt).toLocaleString()} · {j.config.provider}/{j.config.model} · job {j.id}</p><pre>{j.brief}</pre>{j.output&&<pre>{j.output}</pre>}{j.reason&&<p>{j.reason}</p>}</details>):<p>No tasks queued yet.</p>}</article>
      <article className={styles.card}><h2>Agent activity log</h2>{data.activity.length?<ol>{data.activity.map((e,i)=><li key={`${e.at}-${i}`}>{new Date(e.at).toLocaleString()} · {e.event}{e.jobId&&` · ${e.jobId.slice(0,8)}`}</li>)}</ol>:<p>No activity yet.</p>}</article>
    </>}
  </div>;
}
