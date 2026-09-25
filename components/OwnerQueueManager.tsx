"use client";

import Image from "next/image";
import { FormEvent, useEffect, useState } from "react";
import type { QueueJob, QueueStatus } from "@/lib/queue-types";
import type { RequestStatus, StoredRequest } from "@/lib/request-types";
import { quoteDepositOutstandingCents, quoteDepositRefundDueCents, quoteDepositRefundPending, quoteDepositSatisfied, quoteNetDepositPaidCents, type StoredQuote } from "@/lib/quote-types";
import type { ShipmentRecord } from "@/lib/shipment-types";
import { finalInvoicePaid, type FinalInvoiceRecord } from "@/lib/final-invoice-types";
import { OwnerQuoteEditor } from "@/components/OwnerQuoteEditor";
import { OwnerSecurityPanel } from "@/components/OwnerSecurityPanel";
import { OwnerOperationsCenter } from "@/components/OwnerOperationsCenter";
import { OwnerPricingPanel } from "@/components/OwnerPricingPanel";
import { OwnerCostCloseout } from "@/components/OwnerCostCloseout";
import type { GalleryItem, SiteContent } from "@/lib/site";
import { calculateRequestPriority } from "@/lib/request-priority";
import type { CustomerFollowUpRecord, RequestFollowUpControl } from "@/lib/customer-follow-up-types";
import type { BambuFilamentCatalogItem, PricingPreset, PricingSettings, QuoteCostSnapshot } from "@/lib/pricing-types";
import type { ResolvedMaterialCost } from "@/lib/material-cost-resolver";

const queueLabels: Record<QueueStatus, string> = { queued:"Queued", preparing:"Preparing / slicing", printing:"Printing now", finishing:"Finishing / cleanup", ready:"Ready for pickup / shipping", "on-hold":"On hold", completed:"Completed" };
const requestLabels: Record<RequestStatus, string> = { new:"New", reviewing:"Reviewing", quoted:"Quote sent", accepted:"Quote accepted", "deposit-paid":"Deposit paid", declined:"Declined", queued:"In queue", completed:"Completed" };
const projectLabels: Record<string,string> = { display:"Display / collectible", functional:"Functional part", replacement:"Replacement part", prototype:"Prototype", other:"Custom 3D print" };
const modelLabels: Record<string,string> = { ready:"Yes — print-ready model", "needs-adjustment":"Yes — may need changes", "reference-only":"No — photos / references", "idea-only":"No — idea only" };
const fulfillmentLabels: Record<string,string> = { pickup:"Local pickup", shipping:"Shipping", "local-delivery":"Local delivery", unsure:"Not sure yet" };
const assemblyPreferenceLabels: Record<string,string> = { assembled:"Assembled by Mesh Harbor 3D", disassembled:"Disassembled + assembly guide", unsure:"Not sure yet" };
const materialLabels: Record<string,string> = { "no-preference":"No preference", pla:"PLA", petg:"PETG", asa:"ASA", tpu:"TPU / flexible", resin:"Resin", other:"Other / unsure" };

type Notice = { kind:"success"|"error"|"warning"; text:string } | null;
type OwnerTab = "operations" | "production" | "pricing" | "site" | "security";
type OwnerRequestFollowUpView = { control: RequestFollowUpControl; emailEligible: boolean; emailReason: string; emailVerified: boolean; effectiveEmailEnabled: boolean; recent: CustomerFollowUpRecord[] };
type OwnerPricingPayload={settings:PricingSettings;catalog:BambuFilamentCatalogItem[];materialCosts:Record<string,ResolvedMaterialCost>;costing:Record<string,QuoteCostSnapshot[]>;presets:PricingPreset[]};

async function uploadOwnerImage(file: File) { const form=new FormData(); form.append("image",file); const response=await fetch("/api/owner/upload",{method:"POST",body:form}); const result=await response.json() as {path?:string;message?:string}; if(!response.ok||!result.path) throw new Error(result.message||"Could not upload image."); return result.path; }
function formatSubmitted(value:string){ const d=new Date(value); return Number.isNaN(d.getTime())?value:new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"}).format(d); }
function money(cents:number){return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(cents/100);}

export function OwnerQueueManager(){
  const [jobs,setJobs]=useState<QueueJob[]>([]); const [requests,setRequests]=useState<StoredRequest[]>([]); const [quotes,setQuotes]=useState<StoredQuote[]>([]); const [shipments,setShipments]=useState<ShipmentRecord[]>([]); const [finalInvoices,setFinalInvoices]=useState<FinalInvoiceRecord[]>([]); const [followUps,setFollowUps]=useState<Record<string,OwnerRequestFollowUpView>>({}); const [pricing,setPricing]=useState<OwnerPricingPayload|null>(null); const [siteContent,setSiteContent]=useState<SiteContent|null>(null);
  const [checking,setChecking]=useState(true); const [authenticated,setAuthenticated]=useState(false); const [notice,setNotice]=useState<Notice>(null); const [tab,setTab]=useState<OwnerTab>("operations"); const [focusedRequestId,setFocusedRequestId]=useState("");
  async function loadAll(){ setChecking(true); try{ const [q,r,s]=await Promise.all([fetch("/api/owner/queue",{cache:"no-store"}),fetch("/api/owner/requests",{cache:"no-store"}),fetch("/api/owner/site-content",{cache:"no-store"})]); if([q.status,r.status,s.status].includes(401)){setAuthenticated(false);return;} const qr=await q.json() as {jobs?:QueueJob[];message?:string}; const rr=await r.json() as {requests?:StoredRequest[];quotes?:StoredQuote[];shipments?:ShipmentRecord[];finalInvoices?:FinalInvoiceRecord[];followUps?:Record<string,OwnerRequestFollowUpView>;pricing?:OwnerPricingPayload;message?:string}; const sr=await s.json() as {content?:SiteContent;message?:string}; if(!q.ok)throw new Error(qr.message); if(!r.ok)throw new Error(rr.message); if(!s.ok)throw new Error(sr.message); setJobs(qr.jobs||[]);setRequests(rr.requests||[]);setQuotes(rr.quotes||[]);setShipments(rr.shipments||[]);setFinalInvoices(rr.finalInvoices||[]);setFollowUps(rr.followUps||{});setPricing(rr.pricing||null);setSiteContent(sr.content||null);setAuthenticated(true);}catch(e){setNotice({kind:"error",text:e instanceof Error?e.message:"Could not load owner data."});}finally{setChecking(false);} }
  useEffect(()=>{void loadAll();},[]);
  const newCount=requests.filter(r=>r.status==="new").length;
  async function login(event:FormEvent<HTMLFormElement>){event.preventDefault();const data=new FormData(event.currentTarget);const response=await fetch("/api/owner/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:data.get("password")})});const result=await response.json() as {message?:string};if(!response.ok){setNotice({kind:"error",text:result.message||"Could not sign in."});return;}await loadAll();}
  async function logout(){await fetch("/api/owner/logout",{method:"POST"});setAuthenticated(false);setNotice(null);}
  if(checking&&!authenticated)return <div className="owner-loading">Checking owner session…</div>;
  if(!authenticated)return <div className="owner-login-card"><div><p className="eyebrow">OWNER ACCESS</p><h2>Business control panel</h2><p>Sign in to manage requests, production order, customer status, and site content.</p></div><form onSubmit={login} className="owner-login-form"><label><span>Owner password</span><input name="password" type="password" required maxLength={200}/></label><button className="button" type="submit">Sign in</button></form>{notice&&<div className={`owner-notice ${notice.kind}`}>{notice.text}</div>}</div>;
  return <div className="owner-dashboard">
    <div className="owner-toolbar"><div className="owner-tabs"><button className={tab==="operations"?"is-active":""} onClick={()=>setTab("operations")} type="button">Dashboard</button><button className={tab==="production"?"is-active":""} onClick={()=>setTab("production")} type="button">Production {newCount>0&&<b>{newCount}</b>}</button><button className={tab==="pricing"?"is-active":""} onClick={()=>setTab("pricing")} type="button">Pricing & Profitability</button><button className={tab==="site"?"is-active":""} onClick={()=>setTab("site")} type="button">Site Content</button><button className={tab==="security"?"is-active":""} onClick={()=>setTab("security")} type="button">Security & Backups</button></div><button className="button button-secondary button-small" onClick={logout} type="button">Sign out</button></div>
    {notice&&<div className={`owner-notice ${notice.kind}`}>{notice.text}</div>}
    {tab==="operations"&&<OwnerOperationsCenter onNotice={setNotice} onOpenPricing={()=>setTab("pricing")} onOpenRequest={(requestId)=>{setFocusedRequestId(requestId);setTab("production");}}/>}
    {tab==="production"&&pricing&&<ProductionPanel pricing={pricing} requests={requests} jobs={jobs} quotes={quotes} shipments={shipments} finalInvoices={finalInvoices} followUps={followUps} focusedRequestId={focusedRequestId} onFocusedRequestHandled={()=>setFocusedRequestId("")} onChanged={loadAll} onNotice={setNotice}/>}
    {tab==="pricing"&&<OwnerPricingPanel onNotice={setNotice}/>}
    {tab==="site"&&siteContent&&<SiteContentPanel content={siteContent} onChanged={loadAll} onNotice={setNotice}/>}
    {tab==="security"&&<OwnerSecurityPanel onNotice={setNotice}/>}
  </div>;
}

function ProductionPanel({pricing,requests,jobs,quotes,shipments,finalInvoices,followUps,focusedRequestId,onFocusedRequestHandled,onChanged,onNotice}:{pricing:OwnerPricingPayload;requests:StoredRequest[];jobs:QueueJob[];quotes:StoredQuote[];shipments:ShipmentRecord[];finalInvoices:FinalInvoiceRecord[];followUps:Record<string,OwnerRequestFollowUpView>;focusedRequestId:string;onFocusedRequestHandled:()=>void;onChanged:()=>Promise<void>;onNotice:(n:Notice)=>void}){
  const [filter,setFilter]=useState<"open"|"all">("open");
  const [showInPerson,setShowInPerson]=useState(false);
  useEffect(()=>{
    if(!focusedRequestId)return;
    const target=requests.find(item=>item.id===focusedRequestId);
    if(target&&["declined","completed"].includes(target.status))setFilter("all");
  },[focusedRequestId,requests]);
  useEffect(()=>{
    if(!focusedRequestId)return;
    const timer=window.setTimeout(()=>{
      const element=document.getElementById(`owner-request-${focusedRequestId}`);
      if(!element)return;
      element.scrollIntoView({behavior:"smooth",block:"start"});
      onFocusedRequestHandled();
    },180);
    return ()=>window.clearTimeout(timer);
  },[focusedRequestId,onFocusedRequestHandled]);
  const baseVisible=filter==="all"?requests:requests.filter(r=>!["declined","completed"].includes(r.status));
  const visible=[...baseVisible].sort((a,b)=>{
    const aJob=a.queueJobId?jobs.find(j=>j.id===a.queueJobId):null; const bJob=b.queueJobId?jobs.find(j=>j.id===b.queueJobId):null;
    if(aJob&&bJob)return aJob.sortOrder-bJob.sortOrder; if(aJob)return -1; if(bJob)return 1;
    return calculateRequestPriority(b).score-calculateRequestPriority(a).score || a.createdAt.localeCompare(b.createdAt);
  });
  const linkedIds=new Set(requests.map(r=>r.queueJobId).filter(Boolean)); const manualJobs=jobs.filter(j=>!linkedIds.has(j.id));
  return <>
    <section className="owner-panel production-board"><div className="owner-panel-heading"><div><p className="eyebrow">REQUESTS + QUEUE</p><h2>Production board</h2></div><div className="owner-heading-actions"><button className="button button-small" onClick={()=>setShowInPerson(v=>!v)} type="button">{showInPerson?"Close In-Person Form":"+ Add In-Person Request"}</button><button className={`text-button ${filter==="open"?"is-selected":""}`} onClick={()=>setFilter("open")} type="button">Open</button><button className={`text-button ${filter==="all"?"is-selected":""}`} onClick={()=>setFilter("all")} type="button">All</button><button className="text-button" onClick={()=>void onChanged()} type="button">Refresh</button></div></div>
    {showInPerson&&<InPersonRequestForm onChanged={onChanged} onNotice={onNotice} onClose={()=>setShowInPerson(false)}/>} 
    <p className="owner-panel-intro">Review requests, send formal quotes, and collect the 50% deposit before production. Deposit-paid requests can then be added to the end of the queue and reordered as needed.</p>
    <div className="production-request-list">{visible.length===0?<div className="queue-empty compact"><strong>No matching requests.</strong></div>:visible.map(r=><CombinedRequestCard key={r.id} request={r} quote={quotes.find(q=>q.requestId===r.id&&q.status!=="void")||null} shipment={shipments.find(s=>s.requestId===r.id)||null} finalInvoice={finalInvoices.filter(i=>i.requestId===r.id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0]||null} job={r.queueJobId?jobs.find(j=>j.id===r.queueJobId)||null:null} allJobs={jobs} activeCount={jobs.filter(j=>j.status!=="completed").length} followUp={followUps[r.id]||null} pricing={{settings:pricing.settings,catalog:pricing.catalog,materialCosts:pricing.materialCosts,snapshots:pricing.costing[r.id]||[]}} forceOpen={focusedRequestId===r.id} onChanged={onChanged} onNotice={onNotice}/>)}</div>
    </section>
    <ManualQueueForm onChanged={onChanged} onNotice={onNotice}/>
    {manualJobs.length>0&&<section className="owner-panel"><div className="owner-panel-heading"><div><p className="eyebrow">EXTERNAL ORDERS</p><h2>Manual queue jobs</h2></div></div><div className="owner-job-list">{manualJobs.map(j=><ManualJobCard key={j.id} job={j} activeCount={jobs.filter(x=>x.status!=="completed").length} onChanged={onChanged} onNotice={onNotice}/>)}</div></section>}
  </>;
}

function InPersonRequestForm({onChanged,onNotice,onClose}:{onChanged:()=>Promise<void>;onNotice:(n:Notice)=>void;onClose:()=>void}){
  const [busy,setBusy]=useState(false);
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);
    const form=event.currentTarget;const data=new FormData(form);
    const body={
      name:data.get("name"),email:data.get("email"),phone:data.get("phone"),projectType:data.get("projectType"),
      modelStatus:data.get("modelStatus"),fulfillmentMethod:data.get("fulfillmentMethod"),assemblyPreference:data.get("assemblyPreference"),
      quantity:Number(data.get("quantity")||1),dimensions:data.get("dimensions"),materialPreference:data.get("materialPreference"),
      colorPreference:data.get("colorPreference"),budget:data.get("budget"),neededBy:data.get("neededBy"),
      description:data.get("description"),internalNote:data.get("internalNote"),
    };
    try{
      const response=await fetch("/api/owner/requests",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      const result=await response.json() as {message?:string};if(!response.ok)throw new Error(result.message||"Could not add in-person request.");
      onNotice({kind:"success",text:result.message||"In-person request added."});form.reset();await onChanged();onClose();
    }catch(error){onNotice({kind:"error",text:error instanceof Error?error.message:"Could not add in-person request."});}finally{setBusy(false);}
  }
  return <form className="in-person-request-form" onSubmit={submit}>
    <div className="in-person-request-heading"><div><strong>Add in-person / offline request</strong><span>Only enter what you know now. Missing details can be worked out during review and quoting.</span></div><button className="text-button" type="button" onClick={onClose}>Close</button></div>
    <div className="owner-edit-grid">
      <label><span>Customer name <small className="optional-label">Optional</small></span><input name="name" maxLength={80} placeholder="In-person customer"/></label>
      <label><span>Email <small className="optional-label">Optional</small></span><input name="email" type="email" maxLength={160}/></label>
      <label><span>Phone <small className="optional-label">Optional</small></span><input name="phone" maxLength={30}/></label>
      <label><span>Project type <small className="optional-label">Optional</small></span><select name="projectType" defaultValue="other"><option value="other">Other / custom</option><option value="display">Display / collectible</option><option value="functional">Functional part</option><option value="replacement">Replacement part</option><option value="prototype">Prototype</option></select></label>
      <label><span>3D model status <small className="optional-label">Optional</small></span><select name="modelStatus" defaultValue="idea-only"><option value="idea-only">Idea only / unknown</option><option value="ready">Print-ready model</option><option value="needs-adjustment">Model may need changes</option><option value="reference-only">Photos / references</option></select></label>
      <label><span>Fulfillment <small className="optional-label">Optional</small></span><select name="fulfillmentMethod" defaultValue="unsure"><option value="unsure">Not sure yet</option><option value="pickup">Local pickup</option><option value="shipping">Carrier shipping</option><option value="local-delivery">Local delivery</option></select></label>
      <label><span>Assembly <small className="optional-label">Optional</small></span><select name="assemblyPreference" defaultValue="unsure"><option value="unsure">Not sure / not discussed</option><option value="assembled">Assembled by Mesh Harbor 3D</option><option value="disassembled">Customer assembles</option></select></label>
      <label><span>Quantity</span><input name="quantity" type="number" min={1} max={500} defaultValue={1}/></label>
      <label><span>Needed by <small className="optional-label">Optional</small></span><input name="neededBy" placeholder="M/D/YYYY"/></label>
      <label><span>Dimensions <small className="optional-label">Optional</small></span><input name="dimensions" maxLength={120}/></label>
      <label><span>Material <small className="optional-label">Optional</small></span><select name="materialPreference" defaultValue="no-preference"><option value="no-preference">No preference / unknown</option><option value="pla">PLA</option><option value="petg">PETG</option><option value="asa">ASA</option><option value="tpu">TPU</option><option value="resin">Resin</option><option value="other">Other</option></select></label>
      <label><span>Color <small className="optional-label">Optional</small></span><input name="colorPreference" maxLength={120}/></label>
      <label><span>Budget <small className="optional-label">Optional</small></span><input name="budget" maxLength={80}/></label>
    </div>
    <label><span>What they want made <small className="optional-label">Optional</small></span><textarea name="description" rows={3} maxLength={2500}/></label>
    <label><span>Private owner note <small className="optional-label">Optional</small></span><textarea name="internalNote" rows={2} maxLength={2000}/></label>
    <div className="owner-job-actions"><button className="button" type="submit" disabled={busy}>{busy?"Adding…":"Add Request"}</button><button className="button button-secondary" type="button" onClick={onClose}>Cancel</button></div>
  </form>;
}

function workflowStatus(request:StoredRequest,quote:StoredQuote|null,job:QueueJob|null){
  if(job)return queueLabels[job.status];
  if(quote?.status==="deposit-paid"&&quoteDepositSatisfied(quote))return "Deposit satisfied — ready to schedule";
  if(quote?.status==="approved"&&quoteDepositRefundPending(quote))return "Quote approved — refund processing";
  if(quote?.status==="approved"&&quoteDepositRefundDueCents(quote)>0)return "Quote approved — refund adjustment needs review";
  if(quote?.status==="approved"&&quoteNetDepositPaidCents(quote)>0)return `Quote approved — additional ${money(quoteDepositOutstandingCents(quote))} deposit due`;
  if(quote?.status==="approved")return "Quote approved — deposit due";
  if(quote?.status==="countered")return "Counter offer received";
  if(quote?.status==="declined")return "Quote declined by customer";
  if(quote?.status==="sent"&&quoteNetDepositPaidCents(quote)>0)return "Revised quote sent — deposit credit on file";
  if(quote?.status==="sent")return "Waiting for customer";
  if(quote?.status==="draft"&&quoteNetDepositPaidCents(quote)>0)return "Revised quote draft — deposit credit preserved";
  if(quote?.status==="draft")return "Quote draft";
  if(request.status==="deposit-paid")return "Reviewing — no satisfied deposit recorded";
  if(request.status==="queued")return "Reviewing — not currently queued";
  return requestLabels[request.status];
}
function workflowStatusTone(request:StoredRequest,quote:StoredQuote|null,job:QueueJob|null){
  if(job)return job.status;
  if(quote?.status==="deposit-paid"&&quoteDepositSatisfied(quote))return "deposit-paid";
  if(quote?.status)return quote.status;
  if(request.status==="deposit-paid"||request.status==="queued")return "reviewing";
  return request.status;
}

function CombinedRequestCard({request,quote,shipment,finalInvoice,job,allJobs,activeCount,followUp,pricing,forceOpen,onChanged,onNotice}:{request:StoredRequest;quote:StoredQuote|null;shipment:ShipmentRecord|null;finalInvoice:FinalInvoiceRecord|null;job:QueueJob|null;allJobs:QueueJob[];activeCount:number;followUp:OwnerRequestFollowUpView|null;pricing:{settings:PricingSettings;catalog:BambuFilamentCatalogItem[];materialCosts:Record<string,ResolvedMaterialCost>;snapshots:QuoteCostSnapshot[]}|null;forceOpen:boolean;onChanged:()=>Promise<void>;onNotice:(n:Notice)=>void}){
  const [open,setOpen]=useState(false); const [busy,setBusy]=useState(false); const [followUpBusy,setFollowUpBusy]=useState(false); const [waitingNote,setWaitingNote]=useState(followUp?.control.waitingNote||""); const [position,setPosition]=useState(job&&job.status!=="completed"?job.sortOrder+1:1); const [quoteOpen,setQuoteOpen]=useState(false);
  useEffect(()=>setPosition(job&&job.status!=="completed"?job.sortOrder+1:1),[job]);
  useEffect(()=>{if(forceOpen)setOpen(true);},[forceOpen]);
  useEffect(()=>setWaitingNote(followUp?.control.waitingNote||""),[followUp?.control.waitingNote]);
  const liveStatus=workflowStatus(request,quote,job); const priority=calculateRequestPriority(request); const paidRecord=Boolean(quote&&(quote.payments.length>0||quote.depositPaidAt))||request.status==="completed"; const depositActuallyPaid=Boolean(quote&&quote.status==="deposit-paid"&&quoteDepositSatisfied(quote)); const balancePaid=finalInvoicePaid(finalInvoice);
  const latestQuoteEvent=quote?.history?.length?[...quote.history].sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0]:null;
  async function updateCustomerFollowUp(patch:{paused?:boolean;waitingOnCustomer?:boolean;waitingNote?:string}){if(!request.id)return;setFollowUpBusy(true);try{const response=await fetch(`/api/owner/requests/${request.id}/follow-up`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(patch)});const result=await response.json() as {message?:string};if(!response.ok)throw new Error(result.message||"Could not update customer follow-up settings.");onNotice({kind:"success",text:result.message||"Customer follow-up settings updated."});await onChanged();}catch(e){onNotice({kind:"error",text:e instanceof Error?e.message:"Could not update customer follow-up settings."});}finally{setFollowUpBusy(false);}}
  async function requestStatus(status:string){setBusy(true);try{const response=await fetch(`/api/owner/requests/${request.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status})});const result=await response.json() as {message?:string};if(!response.ok)throw new Error(result.message||"Could not update request.");onNotice({kind:"success",text:result.message||`${request.requestCode} updated.`});await onChanged();}catch(e){onNotice({kind:"error",text:e instanceof Error?e.message:"Could not update request."});}finally{setBusy(false);}}
  async function queueStatus(status:QueueStatus){if(!job)return;if(status==="completed"&&job.status!=="completed"&&!window.confirm(job.customerEmail?`Mark ${job.publicCode} completed and email ${job.customerEmail}?`:`Mark ${job.publicCode} completed? No customer email is stored for this request.`))return;setBusy(true);try{const response=await fetch(`/api/owner/queue/${job.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status})});const result=await response.json() as {message?:string;emailWarning?:string;invoiceWarning?:string;invoiceMessage?:string};if(!response.ok)throw new Error(result.message||"Could not update production status.");const warning=result.emailWarning||result.invoiceWarning||"";onNotice({kind:warning?"warning":"success",text:warning||result.invoiceMessage||"Production status updated."});await onChanged();}catch(e){onNotice({kind:"error",text:e instanceof Error?e.message:"Could not update status."});}finally{setBusy(false);}}
  async function addToQueue(){if(!request.id)return;setBusy(true);try{const response=await fetch(`/api/owner/requests/${request.id}/queue`,{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});const result=await response.json() as {message?:string};if(!response.ok)throw new Error(result.message||"Could not add request to production.");onNotice({kind:"success",text:"Deposit confirmed request added to the end of the production queue."});await onChanged();}catch(e){onNotice({kind:"error",text:e instanceof Error?e.message:"Could not add to production."});}finally{setBusy(false);}}
  async function move(direction:"earlier"|"later"){if(!job)return;await fetch(`/api/owner/queue/${job.id}/move`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({direction})});await onChanged();}
  async function moveTo(){if(!job)return;const response=await fetch(`/api/owner/queue/${job.id}/position`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({position})});const result=await response.json() as {message?:string};if(!response.ok){onNotice({kind:"error",text:result.message||"Could not move queue position."});return;}await onChanged();}
  async function removeFromQueue(){if(!job)return;if(!window.confirm(`Remove ${job.publicTitle} from the active queue? The request will remain stored.${depositActuallyPaid ? " Its recorded deposit will be preserved." : " No deposit is recorded, so it will return to review."}`))return;setBusy(true);try{const response=await fetch(`/api/owner/queue/${job.id}`,{method:"DELETE"});const result=await response.json() as {message?:string};if(!response.ok)throw new Error(result.message||"Could not remove from queue.");onNotice({kind:"success",text:depositActuallyPaid?"Removed from queue. The request is still stored and its deposit record was preserved.":"Removed from queue. The request returned to review because no deposit is recorded."});await onChanged();}catch(e){onNotice({kind:"error",text:e instanceof Error?e.message:"Could not remove from queue."});}finally{setBusy(false);}}
  async function declineRequest(){if(!request.id)return;if(!window.confirm(`Decline ${request.requestCode}?${job?" It will also be removed from the production queue.":""}`))return;setBusy(true);try{if(job){const remove=await fetch(`/api/owner/queue/${job.id}`,{method:"DELETE"});if(!remove.ok)throw new Error("Could not remove the linked queue job.");}const response=await fetch(`/api/owner/requests/${request.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:"declined"})});const result=await response.json() as {message?:string};if(!response.ok)throw new Error(result.message||"Could not decline request.");onNotice({kind:"success",text:`${request.requestCode} declined.`});await onChanged();}catch(e){onNotice({kind:"error",text:e instanceof Error?e.message:"Could not decline request."});}finally{setBusy(false);}}
  async function deleteRequest(){if(!request.id){if(job)await removeFromQueue();return;}if(!window.confirm(`Permanently delete ${request.requestCode}? This removes the request, linked queue job, private attachments, and request notifications. This cannot be undone.`))return;setBusy(true);try{const response=await fetch(`/api/owner/requests/${request.id}`,{method:"DELETE"});const result=await response.json() as {message?:string};if(!response.ok)throw new Error(result.message||"Could not delete request.");onNotice({kind:"success",text:`${request.requestCode} permanently deleted.`});await onChanged();}catch(e){onNotice({kind:"error",text:e instanceof Error?e.message:"Could not delete request."});}finally{setBusy(false);}}
  function toggle(){setOpen(v=>!v);}
  return <article id={`owner-request-${request.id}`} className={`production-request-card ${request.riskLevel==="review"?"owner-request-risk":""}`}>
    <div className="production-request-header" role="button" tabIndex={0} aria-expanded={open} onClick={toggle} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();toggle();}}}>
      <div className="production-expand"><span className="production-chevron">{open?"−":"+"}</span><span className="production-title"><strong>{job?.publicTitle||projectLabels[request.projectType]||"Custom 3D print"}</strong><small><span className={`priority-pill priority-${priority.label.toLowerCase()}`}>{priority.label}</span> {request.requestCode}</small></span></div>
      <span className="production-customer">{request.name}{request.source==="owner"&&<small className="owner-source-badge">In-person</small>}</span><span className="production-email">{request.email||"No email provided"}</span>
      <div className="production-status-select" onClick={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()}>{job?<select aria-label="Production status" value={job.status} disabled={busy} onChange={e=>void queueStatus(e.target.value as QueueStatus)}>{Object.entries(queueLabels).map(([v,l])=><option value={v} key={v}>{l}</option>)}</select>:(["new","reviewing"].includes(request.status)&&(!quote||quote.status==="draft"))?<select aria-label="Request status" value={request.status} disabled={busy} onChange={e=>void requestStatus(e.target.value)}><option value="new">New</option><option value="reviewing">Reviewing</option><option value="declined">Declined</option></select>:<span className={`owner-lifecycle-status status-${workflowStatusTone(request,quote,job)}`}>{liveStatus}</span>}</div>
    </div>
    {open&&<div className="production-request-body owner-request-workspace">
      {request.riskLevel==="review"&&<div className="owner-risk-note"><strong>Security review suggested.</strong><span>Review payment wording carefully before proceeding.</span></div>}
      <div className="owner-request-stage-strip" aria-label="Request workflow"><span className="is-done"><b>1</b>Request</span><span className={quote?.sentAt?"is-done":quote?"is-current":""}><b>2</b>Quote</span><span className={depositActuallyPaid?"is-done":quote?.approvedAt?"is-current":""}><b>3</b>Deposit</span><span className={job&&["ready","completed"].includes(job.status)?"is-done":job?"is-current":""}><b>4</b>Production</span><span className={balancePaid?"is-done":finalInvoice?"is-current":job&&["ready","completed"].includes(job.status)?"is-current":""}><b>5</b>Final balance</span>{quote?.fulfillmentMode==="shipping"&&<span className={shipment?.trackingCode?"is-done":balancePaid?"is-current":""}><b>6</b>Shipping</span>}</div>
      <div className="owner-request-quick-summary"><div><span>Current status</span><strong>{liveStatus}</strong></div><div><span>Priority</span><strong>{priority.label}</strong></div><div><span>Needed by</span><strong>{request.neededBySubmitted||request.neededBy||"Not provided"}</strong></div><div><span>Submitted</span><strong>{formatSubmitted(request.createdAt)}</strong></div></div>
      {followUp&&<section className="owner-request-followup"><div className="owner-request-followup-heading"><div><span>CUSTOMER FOLLOW-UP</span><strong>{followUp.emailEligible?"Eligible for automated reminders":followUp.emailReason||"Not eligible"}</strong></div><div className="owner-followup-badges"><em className={followUp.emailVerified?"is-good":"is-muted"}>{followUp.emailVerified?"Email verified":"Email unverified"}</em><em className={followUp.effectiveEmailEnabled?"is-good":"is-muted"}>{followUp.effectiveEmailEnabled?"Email updates on":"Email updates off"}</em></div></div><div className="owner-request-followup-actions"><button className="button button-secondary button-small" type="button" disabled={followUpBusy} onClick={()=>void updateCustomerFollowUp({paused:!followUp.control.paused})}>{followUp.control.paused?"Resume reminders":"Pause reminders"}</button><button className="button button-secondary button-small" type="button" disabled={followUpBusy} onClick={()=>void updateCustomerFollowUp({waitingOnCustomer:!followUp.control.waitingOnCustomer})}>{followUp.control.waitingOnCustomer?"Clear waiting on customer":"Mark waiting on customer"}</button></div>{followUp.control.waitingOnCustomer&&<div className="owner-followup-note"><label><span>Waiting note <small>Owner only</small></span><textarea rows={2} maxLength={300} value={waitingNote} onChange={e=>setWaitingNote(e.target.value)}/></label><button className="text-button" type="button" disabled={followUpBusy||waitingNote===followUp.control.waitingNote} onClick={()=>void updateCustomerFollowUp({waitingNote})}>Save note</button></div>}{followUp.recent.length>0&&<div className="owner-followup-history"><b>Recent follow-ups</b>{followUp.recent.map(item=><span key={item.id}><strong>{item.type.replaceAll("-"," ")}</strong> · {item.status} · {formatSubmitted(item.updatedAt)}</span>)}</div>}</section>}
      <div className="owner-request-accordion">
        <details open><summary><span>Customer & request</span><small>Contact, fulfillment, and original submission</small></summary><div className="owner-request-detail-grid"><dl><div><dt>Name</dt><dd>{request.name}</dd></div><div><dt>Email</dt><dd>{request.email||"Not provided"}</dd></div><div><dt>Phone</dt><dd>{request.phone||"Not provided"}</dd></div><div><dt>Fulfillment</dt><dd>{fulfillmentLabels[request.fulfillmentMethod]}</dd></div><div><dt>Assembly preference</dt><dd>{assemblyPreferenceLabels[request.assemblyPreference || "unsure"]}</dd></div></dl><dl><div><dt>Project</dt><dd>{projectLabels[request.projectType]||request.projectType}</dd></div><div><dt>3D model</dt><dd>{modelLabels[request.modelStatus]||request.modelStatus}</dd></div><div><dt>Quantity</dt><dd>{request.quantity}</dd></div><div><dt>Budget</dt><dd>{request.budget||"Not provided"}</dd></div></dl></div></details>
        <details><summary><span>Print specifications</span><small>Material, color, dimensions, deadline</small></summary><div className="owner-request-detail-grid"><dl><div><dt>Material</dt><dd>{materialLabels[request.materialPreference]||request.materialPreference}</dd></div><div><dt>Color</dt><dd>{request.colorPreference||"Not provided"}</dd></div></dl><dl><div><dt>Dimensions</dt><dd>{request.dimensions||"Not provided"}</dd></div><div><dt>Needed by</dt><dd>{request.neededBySubmitted||request.neededBy||"Not provided"}</dd></div></dl></div></details>
        <details><summary><span>Customer brief & references</span><small>Original wording is preserved</small></summary><div className="owner-request-brief"><p>{request.description}</p>{request.referenceUrl&&<a className="owner-reference-link" href={request.referenceUrl} target="_blank" rel="noreferrer">Open reference link ↗</a>}{request.attachments&&request.attachments.length>0&&<div className="owner-attachment-list"><strong>Attachments</strong>{request.attachments.map(file=><a key={file.id} href={`/api/owner/attachments/${file.id}`}><span>{file.originalName}</span><small>{file.kind==="image"?"Image":"3D model"} • {(file.size/1024/1024).toFixed(2)} MB • {file.scanStatus==="clean"?"Malware scan passed":"Local development: unscanned"}</small></a>)}</div>}</div></details>
      </div>
      <section className="owner-quote-launch-card"><div><span className="eyebrow">QUOTE WORKFLOW</span><h3>{quote?liveStatus:"No quote created yet"}</h3><p>{latestQuoteEvent?`${latestQuoteEvent.summary} ${new Date(latestQuoteEvent.createdAt).toLocaleString()}`:"Create the quote in its own workspace so the request overview stays easy to scan."}</p></div><div className="owner-quote-launch-actions"><button className="button" type="button" disabled={!request.id||request.status==="declined"} onClick={()=>setQuoteOpen(true)}>{quote?"Open Quote Workspace":"Create Quote"}</button>{quote?.history?.length?<span>{quote.history.length} history event{quote.history.length===1?"":"s"}</span>:null}</div></section>
      {quote&&pricing&&<OwnerCostCloseout requestId={request.id} quote={quote} settings={pricing.settings} catalog={pricing.catalog} materialCosts={pricing.materialCosts} snapshots={pricing.snapshots} onChanged={onChanged} onNotice={onNotice}/>}
      {quote&&job&&(["ready","completed"].includes(job.status)||finalInvoice)&&<OwnerFinalInvoicePanel request={request} quote={quote} invoice={finalInvoice} job={job} onChanged={onChanged} onNotice={onNotice}/>}
      {quote?.fulfillmentMode==="shipping"&&<OwnerShipmentPanel request={request} quote={quote} shipment={shipment} finalInvoice={finalInvoice} job={job} onChanged={onChanged} onNotice={onNotice}/>}
      {job&&!depositActuallyPaid&&<div className="owner-legacy-production-note"><strong>Legacy production item — no deposit recorded.</strong><span>This request entered production before deposit gating. You may remove it from the queue and return it to review without creating a false payment record.</span></div>}
      {job?<LinkedQueueEditor job={job} position={position} setPosition={setPosition} activeCount={activeCount} move={move} moveTo={moveTo} onChanged={onChanged} onNotice={onNotice}/>:<div className="production-not-queued"><strong>{depositActuallyPaid?"Deposit confirmed — ready to schedule.":quote?workflowStatus(request,quote,null):request.status==="deposit-paid"?"No verified deposit is recorded for this legacy request.":"Not in production queue."}</strong><span>{depositActuallyPaid?"Add it to production when ready; it will go to the end of the queue.":quote&&quoteNetDepositPaidCents(quote)>0?"Existing deposit credit is preserved while the revised quote is approved and its deposit adjustment is completed.":request.status==="deposit-paid"&&!quote?.depositPaidAt?"This older status is being ignored until a real payment record exists. You can review, requote, decline, or delete the request normally.":quote?.status==="countered"||quote?.status==="declined"?"Open the Quote Workspace to review the history and send a revised quote if appropriate.":"Production should begin only after quote approval and the current 50% deposit requirement is satisfied."}</span>{depositActuallyPaid&&<button className="button button-small" type="button" disabled={busy} onClick={()=>void addToQueue()}>Add to Production Queue</button>}{request.status==="deposit-paid"&&!depositActuallyPaid&&!quote?.depositPaidAt&&<button className="button button-secondary button-small" type="button" disabled={busy} onClick={()=>void requestStatus("reviewing")}>Correct Status to Reviewing</button>}</div>}
      <div className="owner-job-actions owner-destructive-actions">{job&&<button className="button button-secondary button-small" type="button" disabled={busy} onClick={()=>void removeFromQueue()}>Remove from Queue</button>}{request.id&&request.status!=="declined"&&<button className="text-button danger-text" type="button" disabled={busy||paidRecord} onClick={()=>void declineRequest()}>Decline Request</button>}{request.id&&<button className="text-button danger-text" type="button" disabled={busy||paidRecord} onClick={()=>void deleteRequest()}>Delete Permanently</button>}</div>
      {quoteOpen&&pricing&&<OwnerQuoteEditor request={request} quote={quote} jobs={allJobs} pricing={pricing} onChanged={onChanged} onNotice={onNotice} onClose={()=>setQuoteOpen(false)}/>} 
    </div>}
  </article>;
}
function OwnerFinalInvoicePanel({request,quote,invoice,job,onChanged,onNotice}:{request:StoredRequest;quote:StoredQuote;invoice:FinalInvoiceRecord|null;job:QueueJob;onChanged:()=>Promise<void>;onNotice:(n:Notice)=>void}){
  const [busy,setBusy]=useState(false);
  const remaining=invoice?.amountRemainingCents ?? Math.max(0,quote.totalCents-quoteNetDepositPaidCents(quote));
  async function send(){
    setBusy(true);
    try{
      const response=await fetch(`/api/owner/requests/${request.id}/final-invoice`,{method:"POST"});
      const result=await response.json() as {message?:string};
      if(!response.ok)throw new Error(result.message||"Could not send the final balance invoice.");
      onNotice({kind:"success",text:result.message||"Final balance invoice is ready."});
      await onChanged();
    }catch(error){onNotice({kind:"error",text:error instanceof Error?error.message:"Could not send the final invoice."});}
    finally{setBusy(false);}
  }
  return <section className="owner-final-invoice-panel">
    <div className="owner-shipment-heading"><div><span className="eyebrow">FINAL BALANCE</span><h3>{invoice?invoice.status==="paid"?"Paid in full":invoice.status==="open"?"Stripe invoice sent":"Stripe invoice":"Ready to invoice"}</h3></div>{invoice&&<span className={`final-invoice-status status-${invoice.status}`}>{invoice.status.replaceAll("_"," ")}</span>}</div>
    <div className="owner-shipment-facts"><span><b>Quoted total</b>{money(quote.totalCents)}</span><span><b>Deposit credit</b>{money(quoteNetDepositPaidCents(quote))}</span><span><b>Final balance</b>{money(invoice?.amountDueCents||remaining)}</span>{invoice&&<span><b>Remaining</b>{money(invoice.amountRemainingCents)}</span>}{invoice?.dueDate&&<span><b>Due date</b>{new Date(invoice.dueDate).toLocaleDateString()}</span>}</div>
    {invoice?.paymentFailedAt&&<div className="shipping-rate-review"><strong>Payment attempt failed</strong><span>The customer can retry from the Stripe-hosted invoice page.</span></div>}
    {invoice?.lastError&&<div className="shipping-rate-review"><strong>Invoice needs attention</strong><span>{invoice.lastError}</span></div>}
    {finalInvoicePaid(invoice)?<div className="final-invoice-paid-note"><strong>Final balance paid</strong><span>Pickup, delivery, shipping-label purchase, and completion can now proceed.</span></div>:<div className="owner-job-actions">
      {invoice?.hostedInvoiceUrl&&<a className="button button-secondary button-small" href={invoice.hostedInvoiceUrl} target="_blank" rel="noreferrer">Open Stripe Invoice ↗</a>}
      {invoice?.invoicePdfUrl&&<a className="button button-secondary button-small" href={invoice.invoicePdfUrl} target="_blank" rel="noreferrer">Open Invoice PDF ↗</a>}
      <button className="button button-small" type="button" disabled={busy||!["ready","completed"].includes(job.status)} onClick={()=>void send()}>{busy?"Working…":invoice?"Refresh / Retry Invoice":"Send Final Balance Invoice"}</button>
      <small>{invoice?.status==="open"?"Stripe has the invoice open for customer payment.":job.status==="ready"?"Ready status normally sends this automatically; use this button if it needs a retry.":"Mark production Ready before invoicing."}</small>
    </div>}
  </section>;
}

function OwnerShipmentPanel({request,quote,shipment,finalInvoice,job,onChanged,onNotice}:{request:StoredRequest;quote:StoredQuote;shipment:ShipmentRecord|null;finalInvoice:FinalInvoiceRecord|null;job:QueueJob|null;onChanged:()=>Promise<void>;onNotice:(n:Notice)=>void}){
  const [busy,setBusy]=useState(false);
  const selected=quote.shippingSelection;
  async function buy(force=false){
    if(!selected)return;
    if(!job||!["ready","completed"].includes(job.status)){onNotice({kind:"warning",text:"Mark the production job Ready before purchasing its shipping label."});return;}
    if(force&&!window.confirm(`Current postage changed to ${money(shipment?.proposedRateCents||0)}. Buy this label anyway? The customer quote will not be changed automatically.`))return;
    setBusy(true);
    try{
      const response=await fetch(`/api/owner/requests/${request.id}/shipping-label`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({force})});
      const result=await response.json() as {message?:string;requiresConfirmation?:boolean};
      if(!response.ok)throw new Error(result.message||"Could not purchase shipping label.");
      onNotice({kind:result.requiresConfirmation?"warning":"success",text:result.message||"Shipping label updated."});
      await onChanged();
    }catch(error){onNotice({kind:"error",text:error instanceof Error?error.message:"Could not purchase shipping label."});}
    finally{setBusy(false);}
  }
  async function refund(){
    if(!shipment?.trackingCode||!window.confirm(`Request a void/refund for the ${shipment.carrier} label ${shipment.trackingCode}?`))return;
    setBusy(true);
    try{
      const response=await fetch(`/api/owner/requests/${request.id}/shipping-refund`,{method:"POST"});
      const result=await response.json() as {message?:string};
      if(!response.ok)throw new Error(result.message||"Could not request label refund.");
      onNotice({kind:"success",text:result.message||"Label refund requested."});await onChanged();
    }catch(error){onNotice({kind:"error",text:error instanceof Error?error.message:"Could not request label refund."});}
    finally{setBusy(false);}
  }
  return <section className="owner-shipment-panel">
    <div className="owner-shipment-heading"><div><span className="eyebrow">SHIPPING</span><h3>{shipment?.trackingCode?"Label & tracking":"Carrier fulfillment"}</h3></div>{shipment?.status&&<span className={`shipment-status-badge shipment-${shipment.status}`}>{shipment.status.replaceAll("_"," ")}</span>}</div>
    {selected?<div className="owner-shipment-facts"><span><b>Customer selected</b>{selected.carrier} {selected.service}</span><span><b>Quoted shipping</b>{money(selected.rateCents)}</span><span><b>Destination</b>{selected.address.city}, {selected.address.state} {selected.address.zip}</span>{shipment&&shipment.postageCostCents>0&&<span><b>Actual postage</b>{money(shipment.postageCostCents)}</span>}</div>:<div className="owner-legacy-production-note"><strong>No selected carrier rate.</strong><span>The customer must select shipping before a label can be purchased.</span></div>}
    {shipment?.reviewReason&&<div className="shipping-rate-review"><strong>Owner review required</strong><span>{shipment.reviewReason}</span>{shipment.proposedRateCents>0&&<span>Current matching rate: <b>{money(shipment.proposedRateCents)}</b></span>}</div>}
    {shipment?.trackingCode?<div className="owner-shipment-tracking"><div><strong>{shipment.carrier} {shipment.service}</strong><span>{shipment.trackingCode}</span>{shipment.estimatedDeliveryDate&&<small>Estimated delivery: {shipment.estimatedDeliveryDate}</small>}</div><div className="owner-job-actions">{shipment.labelPdfUrl&&<a className="button button-small" href={shipment.labelPdfUrl} target="_blank" rel="noreferrer">Open PDF Label ↗</a>}{!shipment.labelPdfUrl&&shipment.labelUrl&&<a className="button button-small" href={shipment.labelUrl} target="_blank" rel="noreferrer">Open Label ↗</a>}{shipment.publicTrackingUrl&&<a className="button button-secondary button-small" href={shipment.publicTrackingUrl} target="_blank" rel="noreferrer">Track Package ↗</a>} {!["submitted","refunded"].includes(shipment.refundStatus)&&<button className="text-button danger-text" type="button" disabled={busy} onClick={()=>void refund()}>Void / Refund Label</button>}</div></div>:selected&&<div className="owner-job-actions"><button className="button button-small" type="button" disabled={busy||!depositActuallyPaid(quote)||!finalInvoicePaid(finalInvoice)} onClick={()=>void buy(false)}>{busy?"Working…":"Buy Shipping Label"}</button>{shipment?.status==="review_required"&&shipment.proposedRateId&&<button className="button button-secondary button-small" type="button" disabled={busy} onClick={()=>void buy(true)}>Buy Current Rate Anyway</button>}<small>{!depositActuallyPaid(quote)?"The current quote's 50% deposit requirement must be satisfied first.":!finalInvoicePaid(finalInvoice)?"The final balance invoice must be paid before purchasing postage.":!job||!["ready","completed"].includes(job.status)?"Available when production is Ready.":"EasyPost will re-rate the package before purchase."}</small></div>}
  </section>;
}
function depositActuallyPaid(quote:StoredQuote){return quote.status==="deposit-paid"&&quoteDepositSatisfied(quote);}

function LinkedQueueEditor({job,position,setPosition,activeCount,move,moveTo,onChanged,onNotice}:{job:QueueJob;position:number;setPosition:(n:number)=>void;activeCount:number;move:(d:"earlier"|"later")=>Promise<void>;moveTo:()=>Promise<void>;onChanged:()=>Promise<void>;onNotice:(n:Notice)=>void}){
  const [title,setTitle]=useState(job.publicTitle);const [date,setDate]=useState(job.estimatedReadyDate);const [image,setImage]=useState(job.imageUrl);const [publicNote,setPublicNote]=useState(job.publicNote);const [privateNote,setPrivateNote]=useState(job.privateNote);const [busy,setBusy]=useState(false);
  useEffect(()=>{setTitle(job.publicTitle);setDate(job.estimatedReadyDate);setImage(job.imageUrl);setPublicNote(job.publicNote);setPrivateNote(job.privateNote);},[job]);
  async function choose(file?:File){if(!file)return;setBusy(true);try{setImage(await uploadOwnerImage(file));}catch(e){onNotice({kind:"error",text:e instanceof Error?e.message:"Upload failed."});}finally{setBusy(false);}}
  async function save(){setBusy(true);try{const response=await fetch(`/api/owner/queue/${job.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({publicTitle:title,estimatedReadyDate:date,imageUrl:image,publicNote,privateNote})});const result=await response.json() as {message?:string};if(!response.ok)throw new Error(result.message||"Could not save queue details.");onNotice({kind:"success",text:"Queue details saved."});await onChanged();}catch(e){onNotice({kind:"error",text:e instanceof Error?e.message:"Could not save."});}finally{setBusy(false);}}
  return <div className="linked-queue-editor"><div className="linked-queue-heading"><strong>Queue controls</strong><span>{job.status!=="completed"?`Position #${job.sortOrder+1} of ${activeCount}`:"Completed"}</span></div><div className="linked-queue-grid"><label><span>Public title</span><input value={title} onChange={e=>setTitle(e.target.value)}/></label><label><span>Estimated ready</span><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><label><span>Queue image</span><span className="owner-upload-button compact-upload">Replace image<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>void choose(e.target.files?.[0])}/></span></label><label><span>Public note</span><input value={publicNote} onChange={e=>setPublicNote(e.target.value)} maxLength={180}/></label></div><label><span>Private note</span><textarea rows={2} value={privateNote} onChange={e=>setPrivateNote(e.target.value)} maxLength={1000}/></label>{job.status!=="completed"&&<div className="queue-position-controls"><button className="button button-secondary button-small" type="button" onClick={()=>void move("earlier")}>← Earlier</button><label><span>Position</span><input type="number" min={1} max={activeCount} value={position} onChange={e=>setPosition(Math.max(1,Number(e.target.value)||1))}/></label><button className="button button-secondary button-small" type="button" onClick={()=>void moveTo()}>Move to #</button><button className="button button-secondary button-small" type="button" onClick={()=>void move("later")}>Later →</button></div>}<button className="button button-small" type="button" disabled={busy} onClick={()=>void save()}>{busy?"Saving…":"Save Queue Details"}</button></div>;
}

function ManualQueueForm({onChanged,onNotice}:{onChanged:()=>Promise<void>;onNotice:(n:Notice)=>void}){const [imageUrl,setImageUrl]=useState("");const [busy,setBusy]=useState(false);async function choose(file?:File){if(!file)return;setBusy(true);try{setImageUrl(await uploadOwnerImage(file));}catch(e){onNotice({kind:"error",text:e instanceof Error?e.message:"Upload failed."});}finally{setBusy(false);}}async function create(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=event.currentTarget;const d=new FormData(form);setBusy(true);try{const response=await fetch("/api/owner/queue",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({publicTitle:d.get("publicTitle"),customerName:d.get("customerName"),customerEmail:d.get("customerEmail"),fulfillmentMethod:d.get("fulfillmentMethod"),quantity:Number(d.get("quantity")||1),estimatedReadyDate:d.get("estimatedReadyDate")||"",imageUrl,publicNote:d.get("publicNote")||"",privateNote:d.get("privateNote")||""})});const result=await response.json() as {message?:string};if(!response.ok)throw new Error(result.message||"Could not add job.");form.reset();setImageUrl("");onNotice({kind:"success",text:"Manual job added to the end of the queue."});await onChanged();}catch(e){onNotice({kind:"error",text:e instanceof Error?e.message:"Could not add job."});}finally{setBusy(false);}}return <section className="owner-panel owner-manual-collapsed"><details><summary><span><p className="eyebrow">EXTERNAL ORDER</p><strong>Add Etsy, Whatnot, repeat, or in-person job</strong></span><span>+</span></summary><form className="owner-create-form" onSubmit={create}><div className="form-grid two-col"><label><span>Public print name *</span><input name="publicTitle" required/></label><label><span>Customer name *</span><input name="customerName" required/></label><label><span>Customer email *</span><input name="customerEmail" type="email" required/></label><label><span>Fulfillment</span><select name="fulfillmentMethod" defaultValue="unsure"><option value="pickup">Pickup</option><option value="shipping">Shipping</option><option value="local-delivery">Local delivery</option><option value="unsure">Not decided</option></select></label><label><span>Quantity</span><input name="quantity" type="number" min={1} defaultValue={1}/></label><label><span>Estimated ready</span><input name="estimatedReadyDate" type="date"/></label></div><label className="owner-upload-button inline">Choose image<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>void choose(e.target.files?.[0])}/></label><label><span>Public note</span><input name="publicNote"/></label><label><span>Private note</span><textarea name="privateNote" rows={2}/></label><button className="button" type="submit" disabled={busy}>{busy?"Working…":"Add to Queue"}</button></form></details></section>}

function ManualJobCard({job,activeCount,onChanged,onNotice}:{job:QueueJob;activeCount:number;onChanged:()=>Promise<void>;onNotice:(n:Notice)=>void}){const fakeRequest={id:"",requestCode:job.publicCode,status:"queued",name:job.customerName,email:job.customerEmail,phone:"",projectType:"other",modelStatus:"ready",fulfillmentMethod:job.fulfillmentMethod,assemblyPreference:"unsure",quantity:job.quantity,dimensions:"",materialPreference:"no-preference",colorPreference:"",budget:"",neededBy:job.estimatedReadyDate,referenceUrl:"",description:"Manual / external order",imageUrl:job.imageUrl,internalNote:"",createdAt:job.createdAt,updatedAt:job.updatedAt,queuedAt:job.createdAt,queueJobId:job.id} as StoredRequest;return <CombinedRequestCard request={fakeRequest} quote={null} shipment={null} finalInvoice={null} job={job} allJobs={[job]} activeCount={activeCount} followUp={null} pricing={null} forceOpen={false} onChanged={onChanged} onNotice={onNotice}/>}

function SiteContentPanel({ content, onChanged, onNotice }: { content: SiteContent; onChanged: () => Promise<void>; onNotice: (notice: Notice) => void }) {
  const [draft, setDraft] = useState<SiteContent>(content);
  const [busy, setBusy] = useState(false);
  useEffect(() => setDraft(content), [content]);

  function patch(values: Partial<SiteContent>) { setDraft((current) => ({ ...current, ...values })); }
  function patchShippingOrigin(values: Partial<SiteContent["shippingOrigin"]>) { setDraft((current) => ({ ...current, shippingOrigin: { ...current.shippingOrigin, ...values } })); }
  function patchGallery(index: number, values: Partial<GalleryItem>) { setDraft((current) => ({ ...current, galleryItems: current.galleryItems.map((item, i) => i === index ? { ...item, ...values } : item) })); }

  async function uploadLogo(file: File | undefined) {
    if (!file) return; setBusy(true);
    try { patch({ logoImage: await uploadOwnerImage(file) }); onNotice({ kind: "success", text: "Brand icon uploaded. Save Site Content to publish it." }); }
    catch (error) { onNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not upload brand icon." }); }
    finally { setBusy(false); }
  }

  async function uploadWordmark(file: File | undefined) {
    if (!file) return; setBusy(true);
    try { patch({ wordmarkImage: await uploadOwnerImage(file) }); onNotice({ kind: "success", text: "Wordmark uploaded. Save Site Content to publish it." }); }
    catch (error) { onNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not upload wordmark." }); }
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
          <label className="owner-upload-button">Upload brand icon<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void uploadLogo(event.target.files?.[0])} /></label>
          <div className="site-wordmark-preview"><Image src={draft.wordmarkImage} alt={`${draft.name} wordmark`} fill sizes="320px" /></div>
          <label className="owner-upload-button">Upload horizontal wordmark<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void uploadWordmark(event.target.files?.[0])} /></label>
          <label><span>Logo alt text</span><input value={draft.logoAlt} maxLength={120} onChange={(event) => patch({ logoAlt: event.target.value })} /></label>
        </div>
      </div>

      <div className="owner-shipping-origin-editor">
        <div className="owner-gallery-heading"><div><p className="eyebrow">SHIPPING ORIGIN</p><h3>Ship-from address</h3><p>This private address is used only to calculate USPS, UPS, and FedEx rates. It is never shown on the public Queue.</p></div></div>
        <div className="owner-edit-grid shipping-origin-grid">
          <label><span>Business / sender name</span><input autoComplete="organization" value={draft.shippingOrigin.name} maxLength={120} onChange={(event) => patchShippingOrigin({ name: event.target.value })} /></label>
          <label className="wide"><span>Street address</span><input autoComplete="address-line1" value={draft.shippingOrigin.street1} maxLength={120} onChange={(event) => patchShippingOrigin({ street1: event.target.value })} placeholder="123 Main St" /></label>
          <label><span>Suite / unit</span><input autoComplete="address-line2" value={draft.shippingOrigin.street2} maxLength={120} onChange={(event) => patchShippingOrigin({ street2: event.target.value })} placeholder="Optional" /></label>
          <label><span>City</span><input autoComplete="address-level2" value={draft.shippingOrigin.city} maxLength={80} onChange={(event) => patchShippingOrigin({ city: event.target.value })} /></label>
          <label><span>State</span><input autoComplete="address-level1" value={draft.shippingOrigin.state} maxLength={2} onChange={(event) => patchShippingOrigin({ state: event.target.value.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase() })} placeholder="NC" /></label>
          <label><span>ZIP code</span><input autoComplete="postal-code" inputMode="numeric" value={draft.shippingOrigin.zip} maxLength={10} onChange={(event) => { const digits = event.target.value.replace(/\D/g, "").slice(0, 9); patchShippingOrigin({ zip: digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits }); }} placeholder="28110" /></label>
        </div>
        <div className="shipping-origin-note"><strong>Live-rate checklist</strong><span>Save this address, then add your EasyPost API key to the host&apos;s secret environment variables. The Security &amp; Backups tab will show when both pieces are ready.</span></div>
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
