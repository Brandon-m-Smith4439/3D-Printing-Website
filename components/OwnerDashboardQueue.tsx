"use client";
import { useEffect, useState } from "react";
import type { QueueJob, QueueStatus } from "@/lib/queue-types";

const labels:Record<QueueStatus,string>={queued:"Queued",preparing:"Preparing / slicing",printing:"Printing",finishing:"Finishing",ready:"Ready","on-hold":"On hold",completed:"Completed"};
type Notice={kind:"success"|"error"|"warning";text:string}|null;

export function OwnerDashboardQueue({jobs,onChanged,onNotice,onOpenRequest}:{jobs:QueueJob[];onChanged:()=>Promise<void>;onNotice:(n:Notice)=>void;onOpenRequest:(id:string)=>void}){
  const active=jobs.filter(job=>job.status!=="completed").sort((a,b)=>a.sortOrder-b.sortOrder);
  const [busy,setBusy]=useState(false);
  async function move(job:QueueJob,position:number){
    setBusy(true);
    try{
      const response=await fetch(`/api/owner/queue/${job.id}/position`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({position})});
      const result=await response.json() as {message?:string};
      if(!response.ok)throw new Error(result.message||"Could not reorder queue.");
      await onChanged();
    }catch(error){onNotice({kind:"error",text:error instanceof Error?error.message:"Could not reorder queue."});}
    finally{setBusy(false);}
  }
  return <section className="owner-panel dashboard-queue"><div className="operations-section-heading"><div><p className="eyebrow">PRODUCTION ORDER</p><h3>Edit your queue</h3></div><span>{active.length} active jobs</span></div><p>Move jobs earlier or later, set an exact position, or expand a job to edit its production details.</p><div className="dashboard-queue-list">{active.length?active.map((job,index)=><DashboardQueueRow key={job.id} job={job} index={index} count={active.length} busy={busy} onMove={position=>move(job,position)} onChanged={onChanged} onNotice={onNotice} onOpenRequest={onOpenRequest}/>):<div className="queue-empty compact"><strong>No active production jobs.</strong><span>Approved requests appear here after their deposit is confirmed and they are added to production.</span></div>}</div></section>;
}

function DashboardQueueRow({job,index,count,busy,onMove,onChanged,onNotice,onOpenRequest}:{job:QueueJob;index:number;count:number;busy:boolean;onMove:(position:number)=>Promise<void>;onChanged:()=>Promise<void>;onNotice:(n:Notice)=>void;onOpenRequest:(id:string)=>void}){
  const [position,setPosition]=useState(index+1);
  const [saving,setSaving]=useState(false);
  useEffect(()=>setPosition(index+1),[index]);
  async function save(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();const data=new FormData(event.currentTarget);setSaving(true);
    try{
      const response=await fetch(`/api/owner/queue/${job.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({publicTitle:data.get("title"),status:data.get("status"),estimatedReadyDate:data.get("date"),publicNote:data.get("publicNote"),privateNote:data.get("privateNote")})});
      const result=await response.json() as {message?:string;emailWarning?:string;invoiceWarning?:string};
      if(!response.ok)throw new Error(result.message||"Could not update queue details.");
      onNotice({kind:result.emailWarning||result.invoiceWarning?"warning":"success",text:result.emailWarning||result.invoiceWarning||"Queue details saved."});await onChanged();
    }catch(error){onNotice({kind:"error",text:error instanceof Error?error.message:"Could not update queue details."});}
    finally{setSaving(false);}
  }
  return <article className="dashboard-queue-row"><div className="dashboard-queue-row-heading"><span className="queue-position-number">{index+1}</span><div><strong>{job.publicTitle}</strong><small>{job.publicCode} · {job.customerName} · {job.estimatedReadyDate||"Date pending"}</small></div><span className={`queue-status status-${job.status}`}>{labels[job.status]}</span></div><div className="dashboard-queue-controls"><button type="button" className="button button-secondary button-small" disabled={busy||saving||index===0} onClick={()=>void onMove(index)}>↑ Earlier</button><button type="button" className="button button-secondary button-small" disabled={busy||saving||index===count-1} onClick={()=>void onMove(index+2)}>↓ Later</button><label><span className="sr-only">Position for {job.publicCode}</span><input aria-label={`Position for ${job.publicCode}`} type="number" min="1" max={count} value={position} onChange={event=>setPosition(Number(event.target.value))}/></label><button type="button" className="text-button" disabled={busy||saving||position<1||position>count} onClick={()=>void onMove(position)}>Move to #</button>{job.sourceRequestId&&<button className="text-button" type="button" onClick={()=>onOpenRequest(job.sourceRequestId)}>Open request →</button>}</div><details><summary>Edit job details</summary><form key={job.updatedAt} onSubmit={save}><div className="owner-edit-grid"><label><span>Public title</span><input name="title" defaultValue={job.publicTitle} minLength={2} maxLength={100} required/></label><label><span>Production status</span><select name="status" defaultValue={job.status}>{Object.entries(labels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label><span>Ready date</span><input name="date" type="date" defaultValue={job.estimatedReadyDate}/></label><label><span>Public note</span><input name="publicNote" maxLength={180} defaultValue={job.publicNote}/></label></div><label><span>Private note</span><textarea name="privateNote" rows={2} maxLength={1000} defaultValue={job.privateNote}/></label><button className="button button-small" type="submit" disabled={saving||busy}>{saving?"Saving…":"Save Job Details"}</button></form></details></article>;
}
