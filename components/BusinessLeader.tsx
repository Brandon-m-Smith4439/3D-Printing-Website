'use client';
import {useState} from 'react';
import type {Agent,Job} from '@/lib/ai-center/types';
import {roleNames} from '@/lib/ai-center/types';
import type {ProductProject} from '@/lib/ai-center/projects';
import styles from './AiBusinessCenter.module.css';
import {ShippingTest} from './ShippingTest';
import {OwnerProjectIntake} from './OwnerProjectIntake';

const statusNames:Record<Job['status'],string>={'spend-review':'Needs spending approval',queued:'Queued',running:'Working',review:'Needs draft review',ready:'Reviewed',rejected:'Rejected',failed:'Failed'};
export function BusinessLeader({jobs,projects,busy,command}:{jobs:Job[];projects:ProductProject[];busy:boolean;command:(value:unknown)=>Promise<boolean>}) {
  const [business,setBusiness]=useState<Agent>('mesh');
  const [message,setMessage]=useState(''),[key,setKey]=useState('');
  const conversations=jobs.filter(j=>j.agent===business&&j.kind==='plan').slice(0,10).reverse();
  return <section className={styles.card} aria-labelledby="business-leader-heading">
    <h2 id="business-leader-heading">Talk to your business leader</h2>
    <p>Send an instruction or idea. The leader returns a plan for review. Project delegation uses the reviewed plan to queue research, design or listing drafts; each paid task still needs spending approval.</p>
    <p>To chat: choose the business, type below and select Send to leader. If it requests spending approval, approve that task in the inbox below. The worker processes eligible tasks; use Process one eligible task for a manual check. The response appears in this conversation after processing.</p>
    <label>Leader business<select value={business} onChange={e=>{setBusiness(e.target.value as Agent);setKey('');}}><option value="mesh">Mesh Harbor 3D</option><option value="products">Independent digital products</option></select></label>
    <div role="log" aria-label="Leader conversation">
      {conversations.length?conversations.map(job=><article key={job.id} className={styles.approval}>
        <p><strong>You</strong> · {new Date(job.createdAt).toLocaleString()}</p><pre>{job.brief}</pre>
        <p><strong>Leader</strong> · {statusNames[job.status]}</p>{job.output?<pre>{job.output}</pre>:<p>A response will appear after this task is approved and processed.</p>}
      </article>):<p>No leader messages for this business yet.</p>}
    </div>
    <form onSubmit={async e=>{e.preventDefault();const requestKey=key||crypto.randomUUID();setKey(requestKey);if(await command({action:'enqueue',task:{agent:business,kind:'plan',brief:message,key:requestKey}})){setMessage('');setKey('');}}}>
      <label>Your instruction<textarea required maxLength={3000} rows={4} value={message} onChange={e=>{setMessage(e.target.value);setKey('');}} placeholder="What should this business work on? Include sources and dates for market claims. Avoid personal information and secrets."/></label>
      <button disabled={busy||!message.trim()}>Send to leader</button>
    </form>
    <p>Each message creates a separate plan task. Earlier messages and customer records are not automatically sent to the model. This chat cannot buy postage, publish listings or send outreach.</p>
    {business==='mesh'&&<OwnerProjectIntake jobs={jobs} busy={busy} command={command}/>}
    <h3>Delegate the next project step</h3>
    {projects.filter(p=>p.business===business).map(project=><div key={project.id} className={styles.approval}><strong>{project.name}</strong><p>Stage: {project.stage}. {project.stage==='test'?'Record your physical print test in the project below before continuing.':'The coordinator selects the next bounded role from the project’s reviewed plan and current stage.'}</p><button disabled={busy||project.stage==='test'} onClick={()=>void command({action:'delegate',id:project.id,version:project.version})}>Queue next step</button></div>)}
    <h3>Agent activity now</h3>
    <div className={styles.tableWrap}><table><thead><tr><th>Agent</th><th>Working</th><th>Queued</th><th>Needs your review</th><th>Latest recorded task</th></tr></thead><tbody>{Object.entries(roleNames).map(([kind,name])=>{const tasks=jobs.filter(j=>j.agent===business&&j.kind===kind),latest=tasks[0];return <tr key={kind}><th scope="row">{name}</th><td>{tasks.filter(j=>j.status==='running').length}</td><td>{tasks.filter(j=>j.status==='queued').length}</td><td>{tasks.filter(j=>j.status==='spend-review'||j.status==='review').length}</td><td>{latest?<details><summary>{statusNames[latest.status]} · {new Date(latest.updatedAt).toLocaleString()}</summary><p>{latest.config.provider} / {latest.config.model}</p><pre>{latest.brief}</pre>{latest.output&&<pre>{latest.output}</pre>}{latest.reason&&<p>{latest.reason}</p>}</details>:'No recorded task'}</td></tr>;})}</tbody></table></div>
    <p>Counts cover the latest 200 tasks. These are roles in a shared worker, with recorded task activity.</p>
    <h3>Research and shipping connections</h3>
    <ShippingTest/>
    <p>Research drafts assess supplied evidence; they do not browse the web. Etsy API research needs an approved app and authorization. Until then, use <a href="https://www.etsy.com/your/shops/me/marketplace-insights" target="_blank" rel="noopener noreferrer">Etsy Marketplace Insights</a> and save dated observations in each project. Search volume, asking prices and badges are signals, not proven sales for your product. Compare functional and decorative opportunities, conversion, competition, seasonality and full costs before choosing a small test batch.</p>
    <p>Shipping labels for custom quotes are managed in the <a href="/owner">owner operations dashboard</a>. Paid orders need confirmed package weight, dimensions and readiness before individual postage approval. Catalog label automation and owner email delivery are not connected yet.</p>
  </section>;
}
