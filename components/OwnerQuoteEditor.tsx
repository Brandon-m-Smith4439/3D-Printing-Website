"use client";
import { useEffect, useMemo, useState } from "react";
import type { QuoteHistoryEntry, StoredQuote } from "@/lib/quote-types";
import type { StoredRequest } from "@/lib/request-types";

type Notice = { kind:"success"|"error"|"warning"; text:string } | null;
const DEFAULT_TERMS = "By approving this quote, you confirm the project details and authorize production after the required deposit is received. The deposit is applied to materials, machine time, and work performed once production begins. The remaining balance is due before shipment or at pickup/delivery handoff. Estimated dates may change because of print failures, material availability, or approved scope changes. Changes requested after approval may require a revised quote.";
function dollars(cents:number){return (cents/100).toFixed(2);}
function money(cents:number){return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(cents/100);}
function cents(value:string){const n=Number(value.replace(/[^0-9.]/g,""));return Number.isFinite(n)?Math.round(n*100):0;}
function historyLabel(item:QuoteHistoryEntry){
  if(item.event==="sent") return "Quote sent";
  if(item.event==="draft-saved") return "Draft saved";
  if(item.event==="approved") return "Customer approved";
  if(item.event==="counter-offer") return "Counter offer";
  if(item.event==="declined") return "Customer declined";
  return "Deposit received";
}

export function OwnerQuoteEditor({request,quote,onChanged,onNotice,onClose}:{request:StoredRequest;quote:StoredQuote|null;onChanged:()=>Promise<void>;onNotice:(n:Notice)=>void;onClose:()=>void}){
  const [total,setTotal]=useState(quote?dollars(quote.totalCents):"");
  const [material,setMaterial]=useState(quote?.material||request.materialPreference||"");const [dimensions,setDimensions]=useState(quote?.dimensions||request.dimensions||"");
  const [estimated,setEstimated]=useState(quote?.estimatedReadyDate||request.neededBy||"");const [notes,setNotes]=useState(quote?.notes||"");const [terms,setTerms]=useState(quote?.terms||DEFAULT_TERMS);const [busy,setBusy]=useState(false);
  useEffect(()=>{if(!quote)return;setTotal(dollars(quote.totalCents));setMaterial(quote.material);setDimensions(quote.dimensions);setEstimated(quote.estimatedReadyDate);setNotes(quote.notes);setTerms(quote.terms);},[quote]);
  useEffect(()=>{function key(event:KeyboardEvent){if(event.key==="Escape")onClose();}window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key);},[onClose]);
  const totalCents=cents(total);const depositCents=Math.round(totalCents/2);const locked=Boolean(quote?.depositPaidAt);
  const latestCustomerResponse=useMemo(()=>[...(quote?.history||[])].reverse().find(item=>item.event==="counter-offer"||item.event==="declined")||null,[quote]);
  async function save(action:"save"|"send"){
    if(totalCents<50||depositCents<50){onNotice({kind:"error",text:"Enter a valid total and deposit amount."});return;}
    setBusy(true);try{const response=await fetch(`/api/owner/requests/${request.id}/quote`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({totalCents,depositCents,material,dimensions,estimatedReadyDate:estimated,notes,terms,action})});const result=await response.json() as {message?:string};if(!response.ok)throw new Error(result.message||"Could not save quote.");onNotice({kind:"success",text:result.message||"Quote saved."});await onChanged();if(action==="send")onClose();}catch(e){onNotice({kind:"error",text:e instanceof Error?e.message:"Could not save quote."});}finally{setBusy(false);}
  }
  return <div className="quote-workspace-backdrop" role="presentation" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose();}}>
    <section className="quote-workspace" role="dialog" aria-modal="true" aria-label={`Quote workspace for ${request.requestCode}`}>
      <header className="quote-workspace-header"><div><p className="eyebrow">FORMAL QUOTE</p><h2>{request.requestCode} · {request.name}</h2><p>Build, review, revise, and send the customer quote from one workspace.</p></div><button className="quote-workspace-close" type="button" onClick={onClose} aria-label="Close quote workspace">×</button></header>
      <div className="quote-workspace-layout">
        <div className="quote-workspace-main">
          {latestCustomerResponse&&<div className={`quote-response-banner ${latestCustomerResponse.event}`}><strong>{historyLabel(latestCustomerResponse)}</strong><span>{latestCustomerResponse.counterTotalCents?`Proposed total: ${money(latestCustomerResponse.counterTotalCents)}. `:""}{latestCustomerResponse.message||"No additional message."}</span></div>}
          <div className="quote-workspace-section"><div className="quote-section-title"><span>01</span><div><strong>Price & production details</strong><small>The 50% deposit is calculated automatically.</small></div></div>
            <div className="owner-edit-grid quote-money-grid"><label><span>Total quote ($)</span><input value={total} inputMode="decimal" disabled={locked||busy} onChange={e=>setTotal(e.target.value)} placeholder="80.00"/></label><label><span>Required 50% deposit ($)</span><input value={totalCents>0?dollars(depositCents):""} disabled readOnly placeholder="40.00"/></label><label><span>Material</span><input value={material} disabled={locked||busy} onChange={e=>setMaterial(e.target.value)} /></label><label><span>Dimensions</span><input value={dimensions} disabled={locked||busy} onChange={e=>setDimensions(e.target.value)} /></label><label><span>Estimated ready</span><input type="date" value={estimated} disabled={locked||busy} onChange={e=>setEstimated(e.target.value)} /></label></div>
          </div>
          <div className="quote-workspace-section"><div className="quote-section-title"><span>02</span><div><strong>Customer-facing details</strong><small>These notes and terms are preserved in the quote history.</small></div></div>
            <label><span>Quote notes visible to customer</span><textarea rows={3} value={notes} disabled={locked||busy} onChange={e=>setNotes(e.target.value)} placeholder="Finish, color, shipping, scope, or assumptions."/></label>
            <label><span>Terms customer must approve</span><textarea rows={7} value={terms} disabled={locked||busy} onChange={e=>setTerms(e.target.value)} /></label>
          </div>
          <div className="quote-workspace-actions"><button className="button button-secondary" type="button" disabled={locked||busy} onClick={()=>void save("save")}>{busy?"Saving…":"Save Draft"}</button><button className="button" type="button" disabled={locked||busy||!request.customerAccountId} onClick={()=>void save("send")}>{busy?"Working…":quote?.sentAt?"Send Revised Quote":"Send Quote to Customer"}</button></div>
          {!request.customerAccountId&&<div className="quote-account-warning">This guest request is not linked to a customer profile yet. You can save a draft, but profile approval requires a linked account.</div>}
          {locked&&<div className="quote-paid-badge">✓ Deposit recorded. This quote is locked to preserve the exact terms the customer paid against.</div>}
        </div>
        <aside className="quote-history-panel"><div className="quote-history-heading"><span>Quote history</span><small>{quote?`Revision ${quote.revision} · ${quote.status.replaceAll("-"," ")}`:"No quote yet"}</small></div>
          {!quote?.history?.length?<div className="quote-history-empty">No quote activity yet.</div>:<div className="quote-history-list">{[...quote.history].reverse().map(item=><article key={item.id} className={`quote-history-entry event-${item.event}`}><div><strong>{historyLabel(item)}</strong><time>{new Date(item.createdAt).toLocaleString()}</time></div><p>{item.summary}</p>{item.counterTotalCents&&<b>{money(item.counterTotalCents)}</b>}{item.message&&<blockquote>{item.message}</blockquote>}{item.snapshot&&<details><summary>Revision {item.snapshot.revision} snapshot</summary><dl><div><dt>Total</dt><dd>{money(item.snapshot.totalCents)}</dd></div><div><dt>Deposit</dt><dd>{money(item.snapshot.depositCents)}</dd></div><div><dt>Material</dt><dd>{item.snapshot.material}</dd></div><div><dt>Dimensions</dt><dd>{item.snapshot.dimensions}</dd></div><div><dt>Estimated</dt><dd>{item.snapshot.estimatedReadyDate||"TBD"}</dd></div></dl></details>}</article>)}</div>}
        </aside>
      </div>
    </section>
  </div>;
}
