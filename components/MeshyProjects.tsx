'use client';
import {useEffect,useState,useCallback} from 'react';
import type {ProductProject} from '@/lib/ai-center/projects';
import type {MeshyStore} from '@/lib/ai-center/meshy';
import styles from './AiBusinessCenter.module.css';
type Snapshot=ReturnType<MeshyStore['snapshot']>;
export function MeshyProjects({project:p,reload}:{project:ProductProject;reload:()=>Promise<void>}){
 const [data,setData]=useState<Snapshot|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const refresh=useCallback(async()=>{const r=await fetch('/api/owner/business/meshy');if(r.ok)setData(await r.json());},[]);
 useEffect(()=>{void refresh();const timer=setInterval(()=>void refresh(),30000);return()=>clearInterval(timer);},[refresh]);
 async function command(value:unknown){setBusy(true);try{const r=await fetch('/api/owner/business/meshy',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});const v=await r.json();setMessage(v.message);await refresh();if(r.ok)await reload();}catch{setMessage('Connection failed. Refresh before trying again.');}finally{setBusy(false);}}
 return <details className={styles.approval}><summary>Meshy · original decorative models</summary>
  <p>Private candidates → automated analysis → owner import → slicer and physical print test. Use CAD for fitted parts. Meshy cannot guarantee dimensions or print success.</p>
  <p>{data?`${data.committedCredits} / ${data.monthlyLimitCredits} credits committed this UTC month · ${data.enabled?'enabled':'disabled'} · ${data.configured?'key configured':'key needed'}`:'Loading Meshy settings…'}. Separate from the $25 OpenAI cap and Meshy subscription.</p>
  <form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void command({action:'enqueue',request:{projectId:p.id,version:p.version,prompt:f.get('prompt'),longestSideMm:Number(f.get('size'))}});}}>
   <label>Original model description<textarea name="prompt" minLength={10} maxLength={800} defaultValue={p.brief.slice(0,800)} required/></label>
   <label>Intended longest side (mm)<input name="size" type="number" min="20" max="150" step="1" defaultValue={60} required/></label>
   <button disabled={busy||!data?.enabled}>Queue Meshy candidate · 20 credits, approval next</button>
  </form>
  <button disabled={busy} onClick={()=>void refresh()}>Refresh status</button><button disabled={busy||!data?.enabled} onClick={()=>void command({action:'run'})}>Process one eligible Meshy step</button>
  {data?.jobs.filter(j=>j.projectId===p.id).map(j=><article className={styles.approval} key={j.id}>
   <strong>{j.parentId?'Repair':'Generation'} · {j.status}</strong><p>{j.note}</p><p>{j.chargedCredits??j.reservedCredits} credits {j.chargedCredits===null?'reserved / uncertain':'reported'} · {j.longestSideMm} mm intended longest side</p>
   {j.status==='spend-review'&&<><button disabled={busy} onClick={()=>void command({action:'approve',id:j.id})}>Approve {j.parentId?10:20} credits</button><button disabled={busy} onClick={()=>void command({action:'approve',id:j.id,reject:true})}>Reject</button></>}
   {j.artifactId&&<p><a href={`/api/owner/business/assets?id=${j.artifactId}`}>Download private raw STL · scale in slicer before printing</a></p>}
   {j.report!==undefined&&<details><summary>Automated printability report · advisory</summary><pre>{JSON.stringify(j.report,null,2)}</pre></details>}
   {j.status==='review'&&<><button disabled={busy||j.version!==p.version} onClick={()=>void command({action:'import',id:j.id})}>Import scaled revision for physical test</button>{!j.parentId&&!data.jobs.some(x=>x.parentId===j.id)&&<button disabled={busy||j.version!==p.version} onClick={()=>void command({action:'repair',id:j.id})}>Queue one repair · 10 credits, separate approval</button>}</>}
   {['submitting','analyze-submitting','failed'].includes(j.status)&&<p>Reconcile this task in Meshy before queuing a replacement. No automatic paid retry.</p>}
  </article>)}<p role="status">{message}</p>
 </details>;
}
