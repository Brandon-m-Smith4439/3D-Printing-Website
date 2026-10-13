'use client';
import {useCallback,useEffect,useState} from 'react';
import type {Job} from '@/lib/ai-center/types';
import type {ProductProject} from '@/lib/ai-center/projects';
import type {ReadinessCheck} from '@/lib/ai-center/readiness';
import {ownerActions,type ShippingAttentionRow} from '@/lib/ai-center/owner-actions';
import styles from './AiBusinessCenter.module.css';
export function OwnerActionCenter({jobs,projects,openProject}:{jobs:Job[];projects:ProductProject[];openProject:(id:string)=>void}){
 const [checks,setChecks]=useState<ReadinessCheck[]>([]),[rows,setRows]=useState<ShippingAttentionRow[]>([]),[errors,setErrors]=useState<string[]>([]),[loading,setLoading]=useState(true),[checkedAt,setCheckedAt]=useState('');
 const refresh=useCallback(async()=>{
  setLoading(true);const failures:string[]=[];
  const results=await Promise.allSettled(['/api/owner/business/readiness','/api/owner/catalog/shipping','/api/owner/business/slicing'].map(async url=>{const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw Error();return r.json();}));
  if(results[0].status==='fulfilled')setChecks(results[0].value.checks);else failures.push('Could not check launch setup.');
  if(results[1].status==='fulfilled'){const shipping=results[1].value;setRows(shipping.rows);setChecks(c=>[...c.filter(x=>x.id!=='live-carrier'),{id:'live-carrier',label:'Live postage connection',status:shipping.credentialMode==='production'&&shipping.liveEnabled?'ready':'action',detail:'The carrier is in test mode or live postage is locked. Verify production carrier billing and webhook setup privately before live shipping. TEST labels cannot mail an order.'}]);}else failures.push('Could not check shipping orders.');
  const slicing=results[2];
  if(slicing.status==='fulfilled'){const enabled=slicing.value.enabled;setChecks(c=>[...c.filter(x=>x.id!=='local-slicing'),{id:'local-slicing',label:'Local slicing computer',status:enabled?'ready':'off',detail:'Pair the awake computer with Bambu Studio, verify the exact printer/material profiles and calibrate real packing supplies. This requires private setup; no printer commands are sent.'}]);}else failures.push('Could not check local slicing setup.');
  setErrors(failures);setLoading(false);setCheckedAt(new Date().toLocaleString());
 },[]);
 useEffect(()=>{void refresh();const timer=setInterval(()=>{if(document.visibilityState==='visible')void refresh();},30000);return()=>clearInterval(timer);},[refresh]);
 const actions=ownerActions({jobs,projects,checks,rows});
 return <section className={styles.card} aria-labelledby="owner-actions-heading"><h2 id="owner-actions-heading">Owner Action Center</h2><p>Your checklist: review an item, open its controls, then approve or complete it there. Items clear when the recorded result changes; opening an item does not mark it done.</p><button disabled={loading} onClick={()=>void refresh()}>Refresh owner checklist</button><p>{loading?'Checking setup and orders…':`Setup and orders checked ${checkedAt}.`} Tasks and projects refresh separately with the dashboard. Counts cover the latest 200 tasks and 100 physical orders.</p>{errors.map(e=><p role="alert" key={e}>{e} Checklist may be incomplete; retry before making a launch decision.</p>)}<div className={styles.grid}>{(['Approvals','Products','Shipping','Setup and problems'] as const).map(group=>{const items=actions.filter(a=>a.group===group);return <div key={group}><h3>{group} · {items.length}</h3>{items.length?<ol>{items.map(a=><li key={a.id}><strong>{a.title}</strong><p>{a.detail}</p><a href={`#${a.target}`} onClick={()=>{if(a.projectId)openProject(a.projectId);}}>Open task</a></li>)}</ol>:<p>{loading||errors.length?'Waiting for complete checks.':'No recorded actions in this group.'}</p>}</div>;})}</div><p>Disabled features are setup decisions, not automatic failures. Configuration presence is not proof of a tested connection. Tax, live payment/postage setup, accurate product presentation and final sales launch still need owner verification. Web-wide trend collection and multicolor slicing are not yet connected.</p></section>;
}
