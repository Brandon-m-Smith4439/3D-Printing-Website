"use client";
import { useEffect, useState } from "react";
import type { StoredQuote } from "@/lib/quote-types";
import type { StoredRequest } from "@/lib/request-types";

type Notice = { kind:"success"|"error"|"warning"; text:string } | null;
const DEFAULT_TERMS = "By approving this quote, you confirm the project details and authorize production after the required deposit is received. The deposit is applied to materials, machine time, and work performed once production begins. The remaining balance is due before shipment or at pickup/delivery handoff. Estimated dates may change because of print failures, material availability, or approved scope changes. Changes requested after approval may require a revised quote.";
function dollars(cents:number){return (cents/100).toFixed(2);}
function cents(value:string){const n=Number(value.replace(/[^0-9.]/g,""));return Number.isFinite(n)?Math.round(n*100):0;}

export function OwnerQuoteEditor({request,quote,onChanged,onNotice}:{request:StoredRequest;quote:StoredQuote|null;onChanged:()=>Promise<void>;onNotice:(n:Notice)=>void}){
  const [total,setTotal]=useState(quote?dollars(quote.totalCents):"");
  const [material,setMaterial]=useState(quote?.material||request.materialPreference||"");const [dimensions,setDimensions]=useState(quote?.dimensions||request.dimensions||"");
  const [estimated,setEstimated]=useState(quote?.estimatedReadyDate||request.neededBy||"");const [notes,setNotes]=useState(quote?.notes||"");const [terms,setTerms]=useState(quote?.terms||DEFAULT_TERMS);const [busy,setBusy]=useState(false);
  useEffect(()=>{if(!quote)return;setTotal(dollars(quote.totalCents));setMaterial(quote.material);setDimensions(quote.dimensions);setEstimated(quote.estimatedReadyDate);setNotes(quote.notes);setTerms(quote.terms);},[quote]);
  const totalCents=cents(total);const depositCents=Math.round(totalCents/2);
  async function save(action:"save"|"send"){
    if(totalCents<50||depositCents<50){onNotice({kind:"error",text:"Enter a valid total and deposit amount."});return;}
    setBusy(true);try{const response=await fetch(`/api/owner/requests/${request.id}/quote`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({totalCents,depositCents,material,dimensions,estimatedReadyDate:estimated,notes,terms,action})});const result=await response.json() as {message?:string};if(!response.ok)throw new Error(result.message||"Could not save quote.");onNotice({kind:"success",text:result.message||"Quote saved."});await onChanged();}catch(e){onNotice({kind:"error",text:e instanceof Error?e.message:"Could not save quote."});}finally{setBusy(false);}
  }
  const locked=Boolean(quote?.depositPaidAt);
  return <section className="owner-quote-editor"><div className="linked-queue-heading"><div><strong>Formal quote</strong><span>{quote?`Revision ${quote.revision} • ${quote.status.replaceAll("-"," ")}`:"Not created yet"}</span></div>{!request.customerAccountId&&<small className="quote-account-warning">Guest request: a draft can be saved, but profile approval requires a linked customer account.</small>}</div>
    <div className="owner-edit-grid quote-money-grid"><label><span>Total quote ($)</span><input value={total} inputMode="decimal" disabled={locked||busy} onChange={e=>setTotal(e.target.value)} placeholder="80.00"/></label><label><span>Required 50% deposit ($)</span><input value={totalCents>0?dollars(depositCents):""} inputMode="decimal" disabled readOnly placeholder="40.00"/><small>Calculated automatically from the total quote.</small></label><label><span>Material</span><input value={material} disabled={locked||busy} onChange={e=>setMaterial(e.target.value)} /></label><label><span>Dimensions</span><input value={dimensions} disabled={locked||busy} onChange={e=>setDimensions(e.target.value)} /></label><label><span>Estimated ready</span><input type="date" value={estimated} disabled={locked||busy} onChange={e=>setEstimated(e.target.value)} /></label></div>
    <label><span>Quote notes visible to customer</span><textarea rows={2} value={notes} disabled={locked||busy} onChange={e=>setNotes(e.target.value)} placeholder="Optional finish, color, shipping, or scope notes."/></label>
    <label><span>Terms customer must approve</span><textarea rows={5} value={terms} disabled={locked||busy} onChange={e=>setTerms(e.target.value)} /></label>
    <div className="owner-job-actions"><button className="button button-secondary button-small" type="button" disabled={locked||busy} onClick={()=>void save("save")}>{busy?"Saving…":"Save Draft"}</button><button className="button button-small" type="button" disabled={locked||busy||!request.customerAccountId} onClick={()=>void save("send")}>{busy?"Working…":quote?.sentAt?"Send Revised Quote":"Send Quote to Profile"}</button></div>
    {quote?.sentAt&&<div className="quote-timeline"><span><b>Sent</b>{new Date(quote.sentAt).toLocaleString()}</span>{quote.approvedAt&&<span><b>Approved</b>{new Date(quote.approvedAt).toLocaleString()}</span>}{quote.depositPaidAt&&<span><b>Deposit paid</b>{new Date(quote.depositPaidAt).toLocaleString()}</span>}</div>}
    {locked&&<div className="quote-paid-badge">✓ Deposit recorded. Paid quotes are locked to preserve the exact agreed terms.</div>}
  </section>;
}
