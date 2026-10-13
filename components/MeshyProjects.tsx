'use client';
import {useEffect,useState,useCallback} from 'react';
import type {ProductProject} from '@/lib/ai-center/projects';
import type {MeshyStore} from '@/lib/ai-center/meshy';
import styles from './AiBusinessCenter.module.css';
type Snapshot=ReturnType<MeshyStore['snapshot']>;
const statusLabels:Record<string,string>={'spend-review':'Spending approval needed',queued:'Waiting for available credits',submitting:'Sending approved request',pending:'Creating candidate','analyze-submitting':'Starting free analysis',analyzing:'Checking printability',review:'Ready for your review',failed:'Needs reconciliation',imported:'Imported for print testing',rejected:'Request rejected'};
export function MeshyProjects({project:p,reload}:{project:ProductProject;reload:()=>Promise<void>}){
 const [data,setData]=useState<Snapshot|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const refresh=useCallback(async()=>{const r=await fetch('/api/owner/business/meshy');if(r.ok)setData(await r.json());},[]);
 useEffect(()=>{void refresh();const timer=setInterval(()=>void refresh(),30000);return()=>clearInterval(timer);},[refresh]);
 async function command(value:unknown){setBusy(true);try{const r=await fetch('/api/owner/business/meshy',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});const v=await r.json();setMessage(v.message);await refresh();if(r.ok)await reload();}catch{setMessage('Connection failed. Refresh before trying again.');}finally{setBusy(false);}}
 const latest=p.revisions.at(-1),passed=latest?.tests.at(-1)?.passed,step=p.release||passed?4:latest?3:data?.jobs.some(j=>j.projectId===p.id&&j.status==='review')?2:1;
 return <details className={styles.approval}><summary>Meshy · generate and refine an original model</summary>
  <ol className={styles.meshySteps} aria-label="Model workflow">
   {['Generate','Review / Refine','Print Test','Prepare for Sale'].map((label,i)=><li key={label} aria-current={i===step-1?'step':undefined}><strong>{i+1}. {label}</strong><span>{['Describe an original decorative model.','Review the candidate and import a valid revision.','Slice, print, and record a physical test.','Review pricing, instructions, and rights.'][i]}</span></li>)}
  </ol>
  <p>Generated candidates stay private. Each imported revision needs its own physical print test before sale preparation. Use CAD for fitted parts; Meshy cannot guarantee dimensions or print success.</p>
  <p>{data?`${data.committedCredits} / ${data.monthlyLimitCredits} credits committed this UTC month · ${data.enabled?'enabled':'disabled'} · ${data.configured?'key configured':'key needed'}`:'Loading Meshy settings…'}. Separate from the $25 OpenAI cap and Meshy subscription.</p>
  <h4>Generate</h4><p>Generation costs 20 credits and requests a triangle mesh near 12,000 triangles. The actual result can vary. Import still requires a structurally valid binary STL within 1 MB and 20,000 triangles.</p>
  <form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void command({action:'enqueue',request:{projectId:p.id,version:p.version,prompt:f.get('prompt'),longestSideMm:Number(f.get('size'))}});}}>
   <label>Original model description<textarea name="prompt" minLength={10} maxLength={800} defaultValue={p.brief.slice(0,800)} required/></label>
   <label>Intended longest side (mm)<input name="size" type="number" min="20" max="150" step="1" defaultValue={60} required/></label>
   <button disabled={busy||!data?.enabled}>Queue Meshy candidate · 20 credits, approval next</button>
  </form>
  <button disabled={busy} onClick={()=>void refresh()}>Refresh status</button><button disabled={busy||!data?.enabled||!data.configured} onClick={()=>void command({action:'run'})}>Continue approved task</button>
  <h4>Review / Refine</h4>
  {data&&!data.jobs.some(j=>j.projectId===p.id)&&<p>No Meshy candidates yet. Queue a description above, then review its spending request.</p>}
  {data?.jobs.filter(j=>j.projectId===p.id).map(j=><article className={styles.approval} key={j.id}>
   <strong>{j.operation==='remesh'?'Simplify mesh':j.operation==='repair'?'Repair':'Generation'} · {statusLabels[j.status]??j.status}</strong><p>{j.note}</p><p>{j.chargedCredits??j.reservedCredits} credits {j.chargedCredits===null?'reserved / uncertain':'reported'} · {j.longestSideMm} mm intended longest side</p>
   {j.version!==p.version&&j.status!=='imported'&&<p>This request refers to an earlier project version. Refresh and use the current revision; it cannot be imported into this version.</p>}
   {j.status==='spend-review'&&<><button disabled={busy||j.version!==p.version} onClick={()=>void command({action:'approve',id:j.id})}>Approve {j.approvalCredits} credits</button><button disabled={busy} onClick={()=>void command({action:'approve',id:j.id,reject:true})}>Reject</button></>}
   {j.artifactId&&<p><a href={`/api/owner/business/assets?id=${j.artifactId}`}>Download private raw STL · scale in slicer before printing</a></p>}
   {j.importCheck&&<div className={j.importCheck.ready?styles.meshyCheck:styles.meshyBlocked}><strong>{j.importCheck.ready?'Ready for structural import':'Import blocked'}</strong><p>{j.importCheck.bytes.toLocaleString()} bytes{j.importCheck.triangles!==undefined?` · ${j.importCheck.triangles.toLocaleString()} triangles`:''}. {j.importCheck.reason}</p>{!j.importCheck.ready&&<p>Download the private STL, simplify or repair it in your slicer, export binary STL within the limits, and upload a new revision in this project. You can also request one 5-credit remesh of an original generation below. Every revised file is validated again.</p>}</div>}
   {j.report!==undefined&&<details><summary>Automated printability report · advisory</summary><pre>{JSON.stringify(j.report,null,2)}</pre></details>}
   {j.status==='review'&&<><button disabled={busy||j.version!==p.version||!j.importCheck?.ready} onClick={()=>void command({action:'import',id:j.id})}>Import scaled revision for physical test</button>{!j.parentId&&<>
    {!data.jobs.some(x=>x.parentId===j.id&&x.operation==='remesh')&&<button disabled={busy||j.version!==p.version||!data.enabled} onClick={()=>void command({action:'remesh',id:j.id})}>Queue one remesh · 5 credits, separate approval</button>}
    {!data.jobs.some(x=>x.parentId===j.id&&x.operation==='repair')&&<button disabled={busy||j.version!==p.version||!data.enabled} onClick={()=>void command({action:'repair',id:j.id})}>Queue one repair · 10 credits, separate approval</button>}
   </>}</>}
   {j.operation==='remesh'&&<p>Remesh simplifies geometry toward 12,000 triangles. It can change detail and does not guarantee a valid or printable model.</p>}
   {j.providerId&&<details><summary>Task reference</summary><p>{j.providerId}</p></details>}
   {['submitting','analyze-submitting','failed'].includes(j.status)&&<p>Reconcile this task in Meshy before queuing a replacement. No automatic paid retry.</p>}
  </article>)}
  <h4>Print Test</h4><p>{latest?passed?'The latest revision has a recorded passing physical test.':'Use the current revision’s print-test form in this project after slicing and printing it. Record dimensions, fit, strength, finish, material, time, and grams.':'Import or upload a valid revision before recording a print test.'}</p>
  <h4>Prepare for Sale</h4><p>{p.release?'A private release package is prepared for the current tested revision.':passed?'Continue with this project’s sales preparation and release package forms.':'A passing physical test of the latest revision is required before preparing its release package.'} New revisions invalidate earlier release preparation.</p>
  <details><summary>Delivery status</summary><p>Last task notification: {data?.lastWebhookAt?new Date(data.lastWebhookAt).toLocaleString():'none recorded yet'}. Notifications request a direct Meshy status check; polling remains available.</p></details>
  <p role="status">{message}</p>
 </details>;
}
