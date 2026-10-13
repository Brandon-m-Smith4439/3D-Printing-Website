'use client';
import {useState} from 'react';
import type {Job} from '@/lib/ai-center/types';
import {parseIntakeDraft,type IntakeDraft} from '@/lib/ai-center/intake';
import styles from './AiBusinessCenter.module.css';
export function OwnerProjectIntake({jobs,busy,command}:{jobs:Job[];busy:boolean;command:(value:unknown)=>Promise<boolean>}){
  const [notes,setNotes]=useState(''),[queueKey,setQueueKey]=useState(''),[saveKey,setSaveKey]=useState('');
  const [draft,setDraft]=useState<IntakeDraft|null>(null),[saving,setSaving]=useState(false),[message,setMessage]=useState('');
  const [customerEmail,setCustomerEmail]=useState(''),[customerPhone,setCustomerPhone]=useState(''),[contactReviewed,setContactReviewed]=useState(false);
  function review(value:IntakeDraft,key=crypto.randomUUID()){setDraft(value);setSaveKey(key);setCustomerEmail('');setCustomerPhone('');setContactReviewed(false);setMessage('Review and correct every field before saving.');}
  return <section aria-labelledby="owner-project-intake-heading">
    <h3 id="owner-project-intake-heading">Log an in-person project</h3>
    <p>Tell Operations about a possible project or one you are working on. It drafts a request for your review. The free provider creates a basic template for you to complete. Saving adds it to your existing owner request board without emailing a customer or recording payment.</p>
    <label>Project notes<textarea rows={3} maxLength={2400} value={notes} onChange={e=>{setNotes(e.target.value);setQueueKey('');}} placeholder="A possible drawer-handle project, or two handles I am printing now. Leave out contact details and secrets."/></label>
    <button disabled={busy||!notes.trim()} onClick={async()=>{const key=queueKey||`intake-${crypto.randomUUID()}`;setQueueKey(key);if(await command({action:'enqueue',task:{agent:'mesh',kind:'review',key,brief:`Draft an in-person project from these notes. Return only JSON with name (max 80 characters), description (max 2500), quantity (integer 1-500), stage (on-hold for maybe, new, reviewing, preparing, printing, finishing or ready). Use reviewing when unclear. Do not invent facts, contacts or payments. Owner notes:\n${notes}`}})){setNotes('');setQueueKey('');}}}>Ask Operations to draft</button>{' '}
    <button disabled={!notes.trim()||saving} onClick={()=>review({name:'In-person project',description:notes,quantity:1,stage:'reviewing'})}>Review notes manually</button>
    {jobs.filter(j=>j.agent==='mesh'&&j.kind==='review'&&j.key.startsWith('intake-')).slice(0,5).map(job=><div key={job.id} className={styles.approval}><p>Intake task: {job.status}</p>{job.output&&<><details><summary>Agent draft</summary><pre>{job.output}</pre></details><button disabled={saving} onClick={()=>{try{review(parseIntakeDraft(job.output),job.key.slice(7));}catch{setMessage('The agent did not return a valid draft. Use the manual review option; no request was saved.');}}}>Review this draft</button></>}</div>)}
    {draft&&<form onSubmit={async e=>{e.preventDefault();setSaving(true);try{const response=await fetch('/api/owner/business/intake',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...draft,key:saveKey,customerEmail,customerPhone,contactReviewed})});const result=await response.json();setMessage(result.message||'Unable to save.');if(response.ok){setDraft(null);setSaveKey('');}}catch{setMessage('Could not confirm the save. Retry with this same draft to avoid a duplicate.');}finally{setSaving(false);}}}>
      <label>Project name<input required maxLength={80} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
      <label>Description<textarea required maxLength={2500} value={draft.description} onChange={e=>setDraft({...draft,description:e.target.value})}/></label>
      <label>Quantity<input type="number" min={1} max={500} required value={draft.quantity} onChange={e=>setDraft({...draft,quantity:Number(e.target.value)})}/></label>
      <p>Optional customer contact is saved privately and is not sent to the AI. Notifications start disabled. Add it now if you need to email a quote later; existing saved request contact fields are read-only.</p>
      <label>Customer email<input type="email" maxLength={160} value={customerEmail} onChange={e=>{setCustomerEmail(e.target.value);setContactReviewed(false);}}/></label>
      <label>Customer phone<input type="tel" maxLength={30} value={customerPhone} onChange={e=>{setCustomerPhone(e.target.value);setContactReviewed(false);}}/></label>
      {(customerEmail||customerPhone)&&<label className={styles.check}><input type="checkbox" checked={contactReviewed} onChange={e=>setContactReviewed(e.target.checked)}/>I reviewed this customer&apos;s contact details for this request.</label>}
      <label>Stage<select value={draft.stage} onChange={e=>setDraft({...draft,stage:e.target.value as IntakeDraft['stage']})}>{['on-hold','new','reviewing','preparing','printing','finishing','ready'].map(stage=><option key={stage} value={stage}>{stage==='on-hold'?'Maybe / on hold':stage}</option>)}</select></label>
      <button disabled={saving||Boolean((customerEmail||customerPhone)&&!contactReviewed)}>{saving?'Saving…':'Approve and save to request board'}</button>
    </form>}
    {message&&<p role="status">{message}</p>}
    <p><a href="/owner">Open owner request board</a> to prepare the quote and manage production. Saving an intake does not send a quote.</p>
  </section>;
}
