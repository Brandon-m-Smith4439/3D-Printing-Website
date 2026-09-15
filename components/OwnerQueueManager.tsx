"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { QueueFulfillment, QueueJob, QueueStatus } from "@/lib/queue-types";
import type { RequestStatus, StoredRequest } from "@/lib/request-types";
import type { StoredQuote } from "@/lib/quote-types";
import { OwnerQuoteEditor } from "@/components/OwnerQuoteEditor";
import { OwnerSecurityPanel } from "@/components/OwnerSecurityPanel";
import type { GalleryItem, SiteContent } from "@/lib/site";
import { calculateRequestPriority } from "@/lib/request-priority";

const queueLabels: Record<QueueStatus, string> = { queued:"Queued", preparing:"Preparing / slicing", printing:"Printing now", finishing:"Finishing / cleanup", ready:"Ready for pickup / shipping", "on-hold":"On hold", completed:"Completed" };
const requestLabels: Record<RequestStatus, string> = { new:"New", reviewing:"Reviewing", quoted:"Quote sent", accepted:"Quote accepted", "deposit-paid":"Deposit paid", declined:"Declined", queued:"In queue", completed:"Completed" };
const projectLabels: Record<string,string> = { display:"Display / collectible", functional:"Functional part", replacement:"Replacement part", prototype:"Prototype", other:"Custom 3D print" };
const modelLabels: Record<string,string> = { ready:"Yes — print-ready model", "needs-adjustment":"Yes — may need changes", "reference-only":"No — photos / references", "idea-only":"No — idea only" };
const fulfillmentLabels: Record<string,string> = { pickup:"Local pickup", shipping:"Shipping", unsure:"Not sure yet" };
const materialLabels: Record<string,string> = { "no-preference":"No preference", pla:"PLA", petg:"PETG", asa:"ASA", tpu:"TPU / flexible", resin:"Resin", other:"Other / unsure" };

type Notice = { kind:"success"|"error"|"warning"; text:string } | null;
type OwnerTab = "production" | "site" | "security";

async function uploadOwnerImage(file: File) { const form=new FormData(); form.append("image",file); const response=await fetch("/api/owner/upload",{method:"POST",body:form}); const result=await response.json() as {path?:string;message?:string}; if(!response.ok||!result.path) throw new Error(result.message||"Could not upload image."); return result.path; }
function formatSubmitted(value:string){ const d=new Date(value); return Number.isNaN(d.getTime())?value:new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"}).format(d); }

export function OwnerQueueManager(){
  const [jobs,setJobs]=useState<QueueJob[]>([]); const [requests,setRequests]=useState<StoredRequest[]>([]); const [quotes,setQuotes]=useState<StoredQuote[]>([]); const [siteContent,setSiteContent]=useState<SiteContent|null>(null);
  const [checking,setChecking]=useState(true); const [authenticated,setAuthenticated]=useState(false); const [notice,setNotice]=useState<Notice>(null); const [tab,setTab]=useState<OwnerTab>("production");
  async function loadAll(){ setChecking(true); try{ const [q,r,s]=await Promise.all([fetch("/api/owner/queue",{cache:"no-store"}),fetch("/api/owner/requests",{cache:"no-store"}),fetch("/api/owner/site-content",{cache:"no-store"})]); if([q.status,r.status,s.status].includes(401)){setAuthenticated(false);return;} const qr=await q.json() as {jobs?:QueueJob[];message?:string}; const rr=await r.json() as {requests?:StoredRequest[];quotes?:StoredQuote[];message?:string}; const sr=await s.json() as {content?:SiteContent;message?:string}; if(!q.ok)throw new Error(qr.message); if(!r.ok)throw new Error(rr.message); if(!s.ok)throw new Error(sr.message); setJobs(qr.jobs||[]);setRequests(rr.requests||[]);setQuotes(rr.quotes||[]);setSiteContent(sr.content||null);setAuthenticated(true);}catch(e){setNotice({kind:"error",text:e instanceof Error?e.message:"Could not load owner data."});}finally{setChecking(false);} }
  useEffect(()=>{void loadAll();},[]);
  const activeCount=useMemo(()=>jobs.filter(j=>j.status!=="completed").length,[jobs]); const newCount=requests.filter(r=>r.status==="new").length;
  async function login(event:FormEvent<HTMLFormElement>){event.preventDefault();const data=new FormData(event.currentTarget);const response=await fetch("/api/owner/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:data.get("password")})});const result=await response.json() as {message?:string};if(!response.ok){setNotice({kind:"error",text:result.message||"Could not sign in."});return;}await loadAll();}
  async function logout(){await fetch("/api/owner/logout",{method:"POST"});setAuthenticated(false);setNotice(null);}
  if(checking&&!authenticated)return <div className="owner-loading">Checking owner session…</div>;
  if(!authenticated)return <div className="owner-login-card"><div><p className="eyebrow">OWNER ACCESS</p><h2>Business control panel</h2><p>Sign in to manage requests, production order, customer status, and site content.</p></div><form onSubmit={login} className="owner-login-form"><label><span>Owner password</span><input name="password" type="password" required maxLength={200}/></label><button className="button" type="submit">Sign in</button></form>{notice&&<div className={`owner-notice ${notice.kind}`}>{notice.text}</div>}</div>;
  return <div className="owner-dashboard">
    <div className="owner-overview"><article><span>New requests</span><strong>{newCount}</strong><small>Waiting for review</small></article><article><span>Active queue</span><strong>{activeCount}</strong><small>Public production positions</small></article><article><span>Total requests</span><strong>{requests.length}</strong><small>Stored customer requests</small></article></div>
    <div className="owner-toolbar"><div className="owner-tabs"><button className={tab==="production"?"is-active":""} onClick={()=>setTab("production")} type="button">Production {newCount>0&&<b>{newCount}</b>}</button><button className={tab==="site"?"is-active":""} onClick={()=>setTab("site")} type="button">Site Content</button><button className={tab==="security"?"is-active":""} onClick={()=>setTab("security")} type="button">Security & Backups</button></div><button className="button button-secondary button-small" onClick={logout} type="button">Sign out</button></div>
    {notice&&<div className={`owner-notice ${notice.kind}`}>{notice.text}</div>}
    {tab==="production"&&<ProductionPanel requests={requests} jobs={jobs} quotes={quotes} onChanged={loadAll} onNotice={setNotice}/>} {tab==="site"&&siteContent&&<SiteContentPanel content={siteContent} onChanged={loadAll} onNotice={setNotice}/>} {tab==="security"&&<OwnerSecurityPanel onNotice={setNotice}/>} 
  </div>;
}

function ProductionPanel({requests,jobs,quotes,onChanged,onNotice}:{requests:StoredRequest[];jobs:QueueJob[];quotes:StoredQuote[];onChanged:()=>Promise<void>;onNotice:(n:Notice)=>void}){
  const [filter,setFilter]=useState<"open"|"all">("open");
  const baseVisible=filter==="all"?requests:requests.filter(r=>!["declined","completed"].includes(r.status));
  const visible=[...baseVisible].sort((a,b)=>{
    const aJob=a.queueJobId?jobs.find(j=>j.id===a.queueJobId):null; const bJob=b.queueJobId?jobs.find(j=>j.id===b.queueJobId):null;
    if(aJob&&bJob)return aJob.sortOrder-bJob.sortOrder; if(aJob)return -1; if(bJob)return 1;
    return calculateRequestPriority(b).score-calculateRequestPriority(a).score || a.createdAt.localeCompare(b.createdAt);
  });
  const linkedIds=new Set(requests.map(r=>r.queueJobId).filter(Boolean)); const manualJobs=jobs.filter(j=>!linkedIds.has(j.id));
  return <>
    <section className="owner-panel production-board"><div className="owner-panel-heading"><div><p className="eyebrow">REQUESTS + QUEUE</p><h2>Production board</h2></div><div className="owner-heading-actions"><button className={`text-button ${filter==="open"?"is-selected":""}`} onClick={()=>setFilter("open")} type="button">Open</button><button className={`text-button ${filter==="all"?"is-selected":""}`} onClick={()=>setFilter("all")} type="button">All</button><button className="text-button" onClick={()=>void onChanged()} type="button">Refresh</button></div></div>
    <p className="owner-panel-intro">Review requests, send formal quotes, and collect the 50% deposit before production. Deposit-paid requests can then be added to the end of the queue and reordered as needed.</p>
    <div className="production-request-list">{visible.length===0?<div className="queue-empty compact"><strong>No matching requests.</strong></div>:visible.map(r=><CombinedRequestCard key={r.id} request={r} quote={quotes.find(q=>q.requestId===r.id&&q.status!=="void")||null} job={r.queueJobId?jobs.find(j=>j.id===r.queueJobId)||null:null} activeCount={jobs.filter(j=>j.status!=="completed").length} onChanged={onChanged} onNotice={onNotice}/>)}</div>
    </section>
    <ManualQueueForm onChanged={onChanged} onNotice={onNotice}/>
    {manualJobs.length>0&&<section className="owner-panel"><div className="owner-panel-heading"><div><p className="eyebrow">EXTERNAL ORDERS</p><h2>Manual queue jobs</h2></div></div><div className="owner-job-list">{manualJobs.map(j=><ManualJobCard key={j.id} job={j} activeCount={jobs.filter(x=>x.status!=="completed").length} onChanged={onChanged} onNotice={onNotice}/>)}</div></section>}
  </>;
}

function CombinedRequestCard({request,quote,job,activeCount,onChanged,onNotice}:{request:StoredRequest;quote:StoredQuote|null;job:QueueJob|null;activeCount:number;onChanged:()=>Promise<void>;onNotice:(n:Notice)=>void}){
  const [open,setOpen]=useState(false); const [busy,setBusy]=useState(false); const [position,setPosition]=useState(job&&job.status!=="completed"?job.sortOrder+1:1);
  useEffect(()=>setPosition(job&&job.status!=="completed"?job.sortOrder+1:1),[job]);
  const liveStatus=job?queueLabels[job.status]:requestLabels[request.status]; const priority=calculateRequestPriority(request); const paidRecord=Boolean(quote?.depositPaidAt)||["deposit-paid","queued","completed"].includes(request.status);
  async function requestStatus(status:string){setBusy(true);try{const response=await fetch(`/api/owner/requests/${request.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status})});const result=await response.json() as {message?:string};if(!response.ok)throw new Error(result.message||"Could not update request.");onNotice({kind:"success",text:result.message||`${request.requestCode} updated.`});await onChanged();}catch(e){onNotice({kind:"error",text:e instanceof Error?e.message:"Could not update request."});}finally{setBusy(false);}}
  async function queueStatus(status:QueueStatus){if(!job)return;if(status==="completed"&&job.status!=="completed"&&!window.confirm(`Mark ${job.publicCode} completed and email ${job.customerEmail}?`))return;setBusy(true);try{const response=await fetch(`/api/owner/queue/${job.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status})});const result=await response.json() as {message?:string;emailWarning?:string};if(!response.ok)throw new Error(result.message||"Could not update production status.");onNotice({kind:result.emailWarning?"warning":"success",text:result.emailWarning||"Production status updated."});await onChanged();}catch(e){onNotice({kind:"error",text:e instanceof Error?e.message:"Could not update status."});}finally{setBusy(false);}}
  async function addToQueue(){if(!request.id)return;setBusy(true);try{const response=await fetch(`/api/owner/requests/${request.id}/queue`,{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});const result=await response.json() as {message?:string};if(!response.ok)throw new Error(result.message||"Could not add request to production.");onNotice({kind:"success",text:"Deposit confirmed request added to the end of the production queue."});await onChanged();}catch(e){onNotice({kind:"error",text:e instanceof Error?e.message:"Could not add to production."});}finally{setBusy(false);}}
  async function move(direction:"earlier"|"later"){if(!job)return;await fetch(`/api/owner/queue/${job.id}/move`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({direction})});await onChanged();}
  async function moveTo(){if(!job)return;const response=await fetch(`/api/owner/queue/${job.id}/position`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({position})});const result=await response.json() as {message?:string};if(!response.ok){onNotice({kind:"error",text:result.message||"Could not move queue position."});return;}await onChanged();}
  async function removeFromQueue(){if(!job)return;if(!window.confirm(`Remove ${job.publicTitle} from the active queue? The request will remain stored and keep its deposit-paid status.`))return;setBusy(true);try{const response=await fetch(`/api/owner/queue/${job.id}`,{method:"DELETE"});const result=await response.json() as {message?:string};if(!response.ok)throw new Error(result.message||"Could not remove from queue.");onNotice({kind:"success",text:"Removed from queue. The request is still stored."});await onChanged();}catch(e){onNotice({kind:"error",text:e instanceof Error?e.message:"Could not remove from queue."});}finally{setBusy(false);}}
  async function declineRequest(){if(!request.id)return;if(!window.confirm(`Decline ${request.requestCode}?${job?" It will also be removed from the production queue.":""}`))return;setBusy(true);try{if(job){const remove=await fetch(`/api/owner/queue/${job.id}`,{method:"DELETE"});if(!remove.ok)throw new Error("Could not remove the linked queue job.");}const response=await fetch(`/api/owner/requests/${request.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:"declined"})});const result=await response.json() as {message?:string};if(!response.ok)throw new Error(result.message||"Could not decline request.");onNotice({kind:"success",text:`${request.requestCode} declined.`});await onChanged();}catch(e){onNotice({kind:"error",text:e instanceof Error?e.message:"Could not decline request."});}finally{setBusy(false);}}
  async function deleteRequest(){if(!request.id){if(job)await removeFromQueue();return;}if(!window.confirm(`Permanently delete ${request.requestCode}? This removes the request, linked queue job, private attachments, and request notifications. This cannot be undone.`))return;setBusy(true);try{const response=await fetch(`/api/owner/requests/${request.id}`,{method:"DELETE"});const result=await response.json() as {message?:string};if(!response.ok)throw new Error(result.message||"Could not delete request.");onNotice({kind:"success",text:`${request.requestCode} permanently deleted.`});await onChanged();}catch(e){onNotice({kind:"error",text:e instanceof Error?e.message:"Could not delete request."});}finally{setBusy(false);}}
  function toggle(){setOpen(v=>!v);}
  return <article className={`production-request-card ${request.riskLevel==="review"?"owner-request-risk":""}`}>
    <div className="production-request-header" role="button" tabIndex={0} aria-expanded={open} onClick={toggle} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();toggle();}}}>
      <div className="production-expand"><span className="production-chevron">{open?"−":"+"}</span><span className="production-title"><strong>{job?.publicTitle||projectLabels[request.projectType]||"Custom 3D print"}</strong><small><span className={`priority-pill priority-${priority.label.toLowerCase()}`}>{priority.label}</span> {priority.reason}</small></span></div>
      <span className="production-customer">{request.name}</span><span className="production-email">{request.email}</span>
      <div className="production-status-select" onClick={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()}>{job?<select aria-label="Production status" value={job.status} disabled={busy} onChange={e=>void queueStatus(e.target.value as QueueStatus)}>{Object.entries(queueLabels).map(([v,l])=><option value={v} key={v}>{l}</option>)}</select>:["new","reviewing","declined"].includes(request.status)?<select aria-label="Request status" value={request.status} disabled={busy} onChange={e=>void requestStatus(e.target.value)}><option value="new">New</option><option value="reviewing">Reviewing</option><option value="declined">Declined</option></select>:<span className={`owner-lifecycle-status status-${request.status}`}>{requestLabels[request.status]}</span>}</div>
    </div>
    {open&&<div className="production-request-body">
      {request.riskLevel==="review"&&<div className="owner-risk-note"><strong>Security review suggested.</strong><span>Review payment wording carefully before proceeding.</span></div>}
      <div className="owner-request-facts"><span><b>Request</b>{request.requestCode}</span><span><b>Status</b>{liveStatus}</span><span><b>Priority</b>{priority.label}</span><span><b>Project</b>{projectLabels[request.projectType]||request.projectType}</span><span><b>Model</b>{modelLabels[request.modelStatus]||request.modelStatus}</span><span><b>Fulfillment</b>{fulfillmentLabels[request.fulfillmentMethod]}</span><span><b>Quantity</b>{request.quantity}</span><span><b>Material</b>{materialLabels[request.materialPreference]||request.materialPreference}</span><span><b>Dimensions</b>{request.dimensions||"Not provided"}</span><span><b>Color</b>{request.colorPreference||"Not provided"}</span><span><b>Needed by</b>{request.neededBySubmitted||request.neededBy||"Not provided"}</span><span><b>Budget</b>{request.budget||"Not provided"}</span><span><b>Submitted</b>{formatSubmitted(request.createdAt)}</span></div>
      <div className="owner-request-description">{request.description}</div>{request.referenceUrl&&<a className="owner-reference-link" href={request.referenceUrl} target="_blank" rel="noopener noreferrer">Open customer reference ↗</a>}
      {request.attachments&&request.attachments.length>0&&<div className="owner-attachment-list"><strong>Customer attachments</strong>{request.attachments.map(file=><a key={file.id} href={`/api/owner/attachments/${file.id}`}><span>{file.originalName}</span><small>{file.kind==="image"?"Image":"3D model"} • {(file.size/1024/1024).toFixed(2)} MB • {file.scanStatus==="clean"?"Malware scan passed":"Local development: unscanned"}</small></a>)}</div>}
      {request.id&&request.status!=="declined"&&<OwnerQuoteEditor request={request} quote={quote} onChanged={onChanged} onNotice={onNotice}/>} 
      {job?<LinkedQueueEditor job={job} position={position} setPosition={setPosition} activeCount={activeCount} move={move} moveTo={moveTo} onChanged={onChanged} onNotice={onNotice}/>:<div className="production-not-queued"><strong>{request.status==="deposit-paid"?"Deposit confirmed — ready to schedule.":request.status==="accepted"?"Quote approved — waiting for deposit.":request.status==="quoted"?"Quote sent — waiting for customer approval.":"Not in production queue."}</strong><span>{request.status==="deposit-paid"?"Add it to production when you are ready. It will be appended to the end of the queue.":request.status==="accepted"?"Production should not begin until the 50% deposit is confirmed.":request.status==="quoted"?"The customer can approve the exact quote terms from their Profile.":"Prepare and send a formal quote before production begins."}</span>{request.status==="deposit-paid"&&<button className="button button-small" type="button" disabled={busy} onClick={()=>void addToQueue()}>Add to Production Queue</button>}</div>}
      <div className="owner-destructive-actions">{job&&<button className="button button-secondary button-small danger-button" type="button" disabled={busy} onClick={()=>void removeFromQueue()}>Remove from Queue</button>}{request.id&&request.status!=="declined"&&!paidRecord&&<button className="button button-secondary button-small danger-button" type="button" disabled={busy} onClick={()=>void declineRequest()}>Decline Request</button>}{request.id&&paidRecord?<span className="owner-record-retained">Paid records are retained for accounting and audit history.</span>:<button className="text-button danger-text" type="button" disabled={busy} onClick={()=>void deleteRequest()}>{request.id?"Delete Request Permanently":"Remove Manual Job"}</button>}</div>
    </div>}
  </article>;
}

function LinkedQueueEditor({job,position,setPosition,activeCount,move,moveTo,onChanged,onNotice}:{job:QueueJob;position:number;setPosition:(n:number)=>void;activeCount:number;move:(d:"earlier"|"later")=>Promise<void>;moveTo:()=>Promise<void>;onChanged:()=>Promise<void>;onNotice:(n:Notice)=>void}){
  const [title,setTitle]=useState(job.publicTitle);const [date,setDate]=useState(job.estimatedReadyDate);const [image,setImage]=useState(job.imageUrl);const [publicNote,setPublicNote]=useState(job.publicNote);const [privateNote,setPrivateNote]=useState(job.privateNote);const [busy,setBusy]=useState(false);
  useEffect(()=>{setTitle(job.publicTitle);setDate(job.estimatedReadyDate);setImage(job.imageUrl);setPublicNote(job.publicNote);setPrivateNote(job.privateNote);},[job]);
  async function choose(file?:File){if(!file)return;setBusy(true);try{setImage(await uploadOwnerImage(file));}catch(e){onNotice({kind:"error",text:e instanceof Error?e.message:"Upload failed."});}finally{setBusy(false);}}
  async function save(){setBusy(true);try{const response=await fetch(`/api/owner/queue/${job.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({publicTitle:title,estimatedReadyDate:date,imageUrl:image,publicNote,privateNote})});const result=await response.json() as {message?:string};if(!response.ok)throw new Error(result.message||"Could not save queue details.");onNotice({kind:"success",text:"Queue details saved."});await onChanged();}catch(e){onNotice({kind:"error",text:e instanceof Error?e.message:"Could not save."});}finally{setBusy(false);}}
  return <div className="linked-queue-editor"><div className="linked-queue-heading"><strong>Queue controls</strong><span>{job.status!=="completed"?`Position #${job.sortOrder+1} of ${activeCount}`:"Completed"}</span></div><div className="linked-queue-grid"><label><span>Public title</span><input value={title} onChange={e=>setTitle(e.target.value)}/></label><label><span>Estimated ready</span><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><label><span>Queue image</span><span className="owner-upload-button compact-upload">Replace image<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>void choose(e.target.files?.[0])}/></span></label><label><span>Public note</span><input value={publicNote} onChange={e=>setPublicNote(e.target.value)} maxLength={180}/></label></div><label><span>Private note</span><textarea rows={2} value={privateNote} onChange={e=>setPrivateNote(e.target.value)} maxLength={1000}/></label>{job.status!=="completed"&&<div className="queue-position-controls"><button className="button button-secondary button-small" type="button" onClick={()=>void move("earlier")}>← Earlier</button><label><span>Position</span><input type="number" min={1} max={activeCount} value={position} onChange={e=>setPosition(Math.max(1,Number(e.target.value)||1))}/></label><button className="button button-secondary button-small" type="button" onClick={()=>void moveTo()}>Move to #</button><button className="button button-secondary button-small" type="button" onClick={()=>void move("later")}>Later →</button></div>}<button className="button button-small" type="button" disabled={busy} onClick={()=>void save()}>{busy?"Saving…":"Save Queue Details"}</button></div>;
}

function ManualQueueForm({onChanged,onNotice}:{onChanged:()=>Promise<void>;onNotice:(n:Notice)=>void}){const [imageUrl,setImageUrl]=useState("");const [busy,setBusy]=useState(false);async function choose(file?:File){if(!file)return;setBusy(true);try{setImageUrl(await uploadOwnerImage(file));}catch(e){onNotice({kind:"error",text:e instanceof Error?e.message:"Upload failed."});}finally{setBusy(false);}}async function create(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=event.currentTarget;const d=new FormData(form);setBusy(true);try{const response=await fetch("/api/owner/queue",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({publicTitle:d.get("publicTitle"),customerName:d.get("customerName"),customerEmail:d.get("customerEmail"),fulfillmentMethod:d.get("fulfillmentMethod"),quantity:Number(d.get("quantity")||1),estimatedReadyDate:d.get("estimatedReadyDate")||"",imageUrl,publicNote:d.get("publicNote")||"",privateNote:d.get("privateNote")||""})});const result=await response.json() as {message?:string};if(!response.ok)throw new Error(result.message||"Could not add job.");form.reset();setImageUrl("");onNotice({kind:"success",text:"Manual job added to the end of the queue."});await onChanged();}catch(e){onNotice({kind:"error",text:e instanceof Error?e.message:"Could not add job."});}finally{setBusy(false);}}return <section className="owner-panel owner-manual-collapsed"><details><summary><span><p className="eyebrow">EXTERNAL ORDER</p><strong>Add Etsy, Whatnot, repeat, or in-person job</strong></span><span>+</span></summary><form className="owner-create-form" onSubmit={create}><div className="form-grid two-col"><label><span>Public print name *</span><input name="publicTitle" required/></label><label><span>Customer name *</span><input name="customerName" required/></label><label><span>Customer email *</span><input name="customerEmail" type="email" required/></label><label><span>Fulfillment</span><select name="fulfillmentMethod" defaultValue="unsure"><option value="pickup">Pickup</option><option value="shipping">Shipping</option><option value="unsure">Not decided</option></select></label><label><span>Quantity</span><input name="quantity" type="number" min={1} defaultValue={1}/></label><label><span>Estimated ready</span><input name="estimatedReadyDate" type="date"/></label></div><label className="owner-upload-button inline">Choose image<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>void choose(e.target.files?.[0])}/></label><label><span>Public note</span><input name="publicNote"/></label><label><span>Private note</span><textarea name="privateNote" rows={2}/></label><button className="button" type="submit" disabled={busy}>{busy?"Working…":"Add to Queue"}</button></form></details></section>}

function ManualJobCard({job,activeCount,onChanged,onNotice}:{job:QueueJob;activeCount:number;onChanged:()=>Promise<void>;onNotice:(n:Notice)=>void}){const fakeRequest={id:"",requestCode:job.publicCode,status:"queued",name:job.customerName,email:job.customerEmail,phone:"",projectType:"other",modelStatus:"ready",fulfillmentMethod:job.fulfillmentMethod,quantity:job.quantity,dimensions:"",materialPreference:"no-preference",colorPreference:"",budget:"",neededBy:job.estimatedReadyDate,referenceUrl:"",description:"Manual / external order",imageUrl:job.imageUrl,internalNote:"",createdAt:job.createdAt,updatedAt:job.updatedAt,queuedAt:job.createdAt,queueJobId:job.id} as StoredRequest;return <CombinedRequestCard request={fakeRequest} quote={null} job={job} activeCount={activeCount} onChanged={onChanged} onNotice={onNotice}/>}

function SiteContentPanel({ content, onChanged, onNotice }: { content: SiteContent; onChanged: () => Promise<void>; onNotice: (notice: Notice) => void }) {
  const [draft, setDraft] = useState<SiteContent>(content);
  const [busy, setBusy] = useState(false);
  useEffect(() => setDraft(content), [content]);

  function patch(values: Partial<SiteContent>) { setDraft((current) => ({ ...current, ...values })); }
  function patchGallery(index: number, values: Partial<GalleryItem>) { setDraft((current) => ({ ...current, galleryItems: current.galleryItems.map((item, i) => i === index ? { ...item, ...values } : item) })); }

  async function uploadLogo(file: File | undefined) {
    if (!file) return; setBusy(true);
    try { patch({ logoImage: await uploadOwnerImage(file) }); onNotice({ kind: "success", text: "Logo uploaded. Save Site Content to publish it." }); }
    catch (error) { onNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not upload logo." }); }
    finally { setBusy(false); }
  }

  async function uploadGallery(index: number, file: File | undefined) {
    if (!file) return; setBusy(true);
    try { patchGallery(index, { image: await uploadOwnerImage(file) }); onNotice({ kind: "success", text: "Gallery image uploaded. Save Site Content to publish it." }); }
    catch (error) { onNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not upload gallery image." }); }
    finally { setBusy(false); }
  }

  async function save() {
    setBusy(true); onNotice(null);
    try {
      const response = await fetch("/api/owner/site-content", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(result.message || "Could not save site content.");
      onNotice({ kind: "success", text: "Site content saved. Public pages will use the new branding, links, and gallery." }); await onChanged();
    } catch (error) { onNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not save site content." }); }
    finally { setBusy(false); }
  }

  function addGalleryItem() {
    setDraft((current) => ({ ...current, galleryItems: [...current.galleryItems, { id: `gallery-${Date.now()}`, title: "New print", category: "Custom", description: "Describe this print.", image: "/sample-display.svg", featured: false }] }));
  }

  return (
    <section className="owner-panel">
      <div className="owner-panel-heading"><div><p className="eyebrow">PUBLIC WEBSITE</p><h2>Edit branding, shops, and gallery</h2></div><button className="button button-small" type="button" onClick={() => void save()} disabled={busy}>{busy ? "Saving…" : "Save Site Content"}</button></div>
      <p className="owner-panel-intro">These controls replace most source-code editing. Uploaded images are owner-only and limited to PNG, JPEG, or WebP files up to 5 MB.</p>

      <div className="site-editor-grid">
        <div className="site-editor-form">
          <label><span>Business name</span><input value={draft.name} maxLength={80} onChange={(event) => patch({ name: event.target.value })} /></label>
          <label><span>Tagline</span><input value={draft.tagline} maxLength={140} onChange={(event) => patch({ tagline: event.target.value })} /></label>
          <label><span>Short description</span><textarea rows={3} value={draft.description} maxLength={300} onChange={(event) => patch({ description: event.target.value })} /></label>
          <div className="owner-edit-grid">
            <label><span>Hero logo letters</span><input value={draft.logoLetters} maxLength={4} onChange={(event) => patch({ logoLetters: event.target.value })} /></label>
            <label><span>Etsy shop URL</span><input type="url" value={draft.etsyUrl} onChange={(event) => patch({ etsyUrl: event.target.value })} /></label>
            <label><span>Whatnot shop URL</span><input type="url" value={draft.whatnotUrl} onChange={(event) => patch({ whatnotUrl: event.target.value })} /></label>
          </div>
        </div>
        <div className="site-logo-editor">
          <div className="site-logo-preview"><Image src={draft.logoImage} alt={draft.logoAlt} fill sizes="220px" /></div>
          <label className="owner-upload-button">Upload new logo<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void uploadLogo(event.target.files?.[0])} /></label>
          <label><span>Logo alt text</span><input value={draft.logoAlt} maxLength={120} onChange={(event) => patch({ logoAlt: event.target.value })} /></label>
        </div>
      </div>

      <div className="owner-gallery-heading"><div><p className="eyebrow">GALLERY MANAGER</p><h3>Public print images</h3></div><button className="button button-secondary button-small" type="button" onClick={addGalleryItem}>+ Add Gallery Item</button></div>
      <div className="owner-gallery-editor">
        {draft.galleryItems.map((item, index) => (
          <article className="owner-gallery-item" key={item.id}>
            <div className="owner-gallery-preview"><Image src={item.image} alt={item.title} fill sizes="180px" /></div>
            <div className="owner-gallery-fields">
              <div className="owner-edit-grid">
                <label><span>Title</span><input value={item.title} maxLength={100} onChange={(event) => patchGallery(index, { title: event.target.value })} /></label>
                <label><span>Category</span><input value={item.category} maxLength={60} onChange={(event) => patchGallery(index, { category: event.target.value })} /></label>
              </div>
              <label><span>Description</span><textarea rows={2} value={item.description} maxLength={400} onChange={(event) => patchGallery(index, { description: event.target.value })} /></label>
              <div className="owner-job-actions">
                <label className="owner-upload-button compact-upload">Replace image<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void uploadGallery(index, event.target.files?.[0])} /></label>
                <button className="text-button danger-text" type="button" onClick={() => setDraft((current) => ({ ...current, galleryItems: current.galleryItems.filter((_, i) => i !== index) }))}>Remove</button>
              </div>
            </div>
          </article>
        ))}
      </div>
      <div className="owner-save-footer"><button className="button" type="button" onClick={() => void save()} disabled={busy}>{busy ? "Saving…" : "Save All Site Changes"}</button></div>
    </section>
  );
}
