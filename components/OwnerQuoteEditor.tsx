"use client";
import { useEffect, useMemo, useState } from "react";
import type { AssemblyMode, QuoteFulfillmentMode, QuoteHistoryEntry, StoredQuote } from "@/lib/quote-types";
import type { StoredRequest } from "@/lib/request-types";

type Notice = { kind:"success"|"error"|"warning"; text:string } | null;
const DEFAULT_TERMS = "By approving this quote, you confirm the project details and authorize production after the required deposit is received. The deposit is applied to materials, machine time, and work performed once production begins. For carrier shipping, you will choose a live USPS, UPS, or FedEx rate before approval; that selected rate becomes part of the final quote total. The remaining balance is due before shipment or at pickup/delivery handoff. Estimated dates may change because of print failures, material availability, carrier conditions, or approved scope changes. Changes requested after approval may require a revised quote.";
function dollars(cents:number){return (cents/100).toFixed(2);}
function money(cents:number){return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(cents/100);}
function cents(value:string){const n=Number(value.replace(/[^0-9.]/g,""));return Number.isFinite(n)?Math.round(n*100):0;}
function numberValue(value:string){const n=Number(value);return Number.isFinite(n)?n:0;}
function historyLabel(item:QuoteHistoryEntry){
  if(item.event==="sent") return "Quote sent";
  if(item.event==="draft-saved") return "Draft saved";
  if(item.event==="approved") return "Customer approved";
  if(item.event==="counter-offer") return "Counter offer";
  if(item.event==="declined") return "Customer declined";
  if(item.event==="shipping-selected") return "Shipping selected";
  return "Deposit received";
}
function assemblyLabel(mode:AssemblyMode){if(mode==="assembled")return "Assembled by Mesh Harbor 3D";if(mode==="disassembled")return "Ship disassembled — customer assembles";return "No assembly required";}
function fulfillmentLabel(mode:QuoteFulfillmentMode){if(mode==="shipping")return "Carrier shipping — customer chooses USPS, UPS, or FedEx";if(mode==="local-delivery")return "Local delivery";return "Local pickup";}

export function OwnerQuoteEditor({request,quote,onChanged,onNotice,onClose}:{request:StoredRequest;quote:StoredQuote|null;onChanged:()=>Promise<void>;onNotice:(n:Notice)=>void;onClose:()=>void}){
  const [basePrice,setBasePrice]=useState(quote?dollars(quote.basePriceCents):"");
  const [assemblyMode,setAssemblyMode]=useState<AssemblyMode>(quote?.assemblyMode||"not-required");
  const [assemblyFee,setAssemblyFee]=useState(quote?.assemblyMode==="assembled"?dollars(quote.assemblyFeeCents):"");
  const defaultFulfillment:QuoteFulfillmentMode=quote?.fulfillmentMode||(request.fulfillmentMethod==="shipping"?"shipping":request.fulfillmentMethod==="local-delivery"?"local-delivery":"pickup");
  const [fulfillmentMode,setFulfillmentMode]=useState<QuoteFulfillmentMode>(defaultFulfillment);
  const [localDeliveryFee,setLocalDeliveryFee]=useState(quote?.fulfillmentMode==="local-delivery"?dollars(quote.localDeliveryFeeCents):"");
  const [packageWeight,setPackageWeight]=useState(quote?.packageWeightOz?String(quote.packageWeightOz):"");
  const [packageLength,setPackageLength]=useState(quote?.packageLengthIn?String(quote.packageLengthIn):"");
  const [packageWidth,setPackageWidth]=useState(quote?.packageWidthIn?String(quote.packageWidthIn):"");
  const [packageHeight,setPackageHeight]=useState(quote?.packageHeightIn?String(quote.packageHeightIn):"");
  const [material,setMaterial]=useState(quote?.material||request.materialPreference||"");
  const [dimensions,setDimensions]=useState(quote?.dimensions||request.dimensions||"");
  const [estimated,setEstimated]=useState(quote?.estimatedReadyDate||request.neededBy||"");
  const [notes,setNotes]=useState(quote?.notes||"");
  const [terms,setTerms]=useState(quote?.terms||DEFAULT_TERMS);
  const [busy,setBusy]=useState(false);
  useEffect(()=>{if(!quote)return;setBasePrice(dollars(quote.basePriceCents));setAssemblyMode(quote.assemblyMode);setAssemblyFee(quote.assemblyMode==="assembled"?dollars(quote.assemblyFeeCents):"");setFulfillmentMode(quote.fulfillmentMode);setLocalDeliveryFee(quote.fulfillmentMode==="local-delivery"?dollars(quote.localDeliveryFeeCents):"");setPackageWeight(quote.packageWeightOz?String(quote.packageWeightOz):"");setPackageLength(quote.packageLengthIn?String(quote.packageLengthIn):"");setPackageWidth(quote.packageWidthIn?String(quote.packageWidthIn):"");setPackageHeight(quote.packageHeightIn?String(quote.packageHeightIn):"");setMaterial(quote.material);setDimensions(quote.dimensions);setEstimated(quote.estimatedReadyDate);setNotes(quote.notes);setTerms(quote.terms);},[quote]);
  useEffect(()=>{function key(event:KeyboardEvent){if(event.key==="Escape")onClose();}window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key);},[onClose]);
  const basePriceCents=cents(basePrice);const assemblyFeeCents=assemblyMode==="assembled"?cents(assemblyFee):0;const localDeliveryFeeCents=fulfillmentMode==="local-delivery"?cents(localDeliveryFee):0;
  const subtotalCents=basePriceCents+assemblyFeeCents+localDeliveryFeeCents;const depositCents=Math.round(subtotalCents/2);const locked=Boolean(quote?.depositPaidAt);
  const latestCustomerResponse=useMemo(()=>[...(quote?.history||[])].reverse().find(item=>item.event==="counter-offer"||item.event==="declined")||null,[quote]);
  function changeAssemblyMode(mode:AssemblyMode){setAssemblyMode(mode);if(mode!=="assembled")setAssemblyFee("");}
  function changeFulfillment(mode:QuoteFulfillmentMode){setFulfillmentMode(mode);if(mode!=="local-delivery")setLocalDeliveryFee("");}
  async function save(action:"save"|"send"){
    const packageWeightOz=numberValue(packageWeight),packageLengthIn=numberValue(packageLength),packageWidthIn=numberValue(packageWidth),packageHeightIn=numberValue(packageHeight);
    if(basePriceCents<50||subtotalCents<50||depositCents<50){onNotice({kind:"error",text:"Enter a valid base print price."});return;}
    if(assemblyMode==="assembled"&&assemblyFeeCents<50){onNotice({kind:"error",text:"Enter the assembly labor charge for an assembled order."});return;}
    if(fulfillmentMode==="local-delivery"&&localDeliveryFeeCents<50){onNotice({kind:"error",text:"Enter the local delivery charge."});return;}
    if(fulfillmentMode==="shipping"&&(packageWeightOz<=0||packageLengthIn<=0||packageWidthIn<=0||packageHeightIn<=0)){onNotice({kind:"error",text:"Enter the packed weight and all box dimensions before sending a live-rate shipping quote."});return;}
    setBusy(true);try{
      const response=await fetch(`/api/owner/requests/${request.id}/quote`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({basePriceCents,assemblyMode,assemblyFeeCents,fulfillmentMode,localDeliveryFeeCents,packageWeightOz,packageLengthIn,packageWidthIn,packageHeightIn,totalCents:subtotalCents,depositCents,material,dimensions,estimatedReadyDate:estimated,notes,terms,action})});
      const result=await response.json() as {message?:string};if(!response.ok)throw new Error(result.message||"Could not save quote.");onNotice({kind:"success",text:result.message||"Quote saved."});await onChanged();if(action==="send")onClose();
    }catch(e){onNotice({kind:"error",text:e instanceof Error?e.message:"Could not save quote."});}finally{setBusy(false);}
  }
  return <div className="quote-workspace-backdrop" role="presentation" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose();}}>
    <section className="quote-workspace" role="dialog" aria-modal="true" aria-label={`Quote workspace for ${request.requestCode}`}>
      <header className="quote-workspace-header"><div><p className="eyebrow">FORMAL QUOTE</p><h2>{request.requestCode} · {request.name}</h2><p>Build, review, revise, and send the customer quote from one workspace.</p></div><button className="quote-workspace-close" type="button" onClick={onClose} aria-label="Close quote workspace">×</button></header>
      <div className="quote-workspace-layout">
        <div className="quote-workspace-main">
          {latestCustomerResponse&&<div className={`quote-response-banner ${latestCustomerResponse.event}`}><strong>{historyLabel(latestCustomerResponse)}</strong><span>{latestCustomerResponse.counterTotalCents?`Proposed total: ${money(latestCustomerResponse.counterTotalCents)}. `:""}{latestCustomerResponse.message||"No additional message."}</span></div>}
          <div className="quote-workspace-section"><div className="quote-section-title"><span>01</span><div><strong>Price & production details</strong><small>Production, assembly, and fulfillment are itemized. Live carrier shipping is added after the customer chooses a rate.</small></div></div>
            <div className="owner-edit-grid quote-money-grid"><label><span>Base print price ($)</span><input value={basePrice} inputMode="decimal" disabled={locked||busy} onChange={e=>setBasePrice(e.target.value)} placeholder="80.00"/></label><label><span>{fulfillmentMode==="shipping"?"Current subtotal ($)":"Total quote ($)"}</span><input value={subtotalCents>0?dollars(subtotalCents):""} disabled readOnly/></label><label><span>{fulfillmentMode==="shipping"?"Current 50% deposit ($)":"Required 50% deposit ($)"}</span><input value={subtotalCents>0?dollars(depositCents):""} disabled readOnly/></label><label><span>Material</span><input value={material} disabled={locked||busy} onChange={e=>setMaterial(e.target.value)} /></label><label><span>Dimensions</span><input value={dimensions} disabled={locked||busy} onChange={e=>setDimensions(e.target.value)} /></label><label><span>Estimated ready</span><input type="date" value={estimated} disabled={locked||busy} onChange={e=>setEstimated(e.target.value)} /></label></div>
            {fulfillmentMode==="shipping"&&<div className="shipping-pending-owner"><strong>Shipping is intentionally pending.</strong><span>The customer will enter their private delivery address and choose a live USPS, UPS, or FedEx rate. Their selected rate will be added to this subtotal before they can approve the quote.</span></div>}
          </div>
          <div className="quote-workspace-section quote-assembly-section"><div className="quote-section-title"><span>02</span><div><strong>Assembly configuration</strong><small>Make the handoff expectation and any assembly labor charge explicit.</small></div></div>
            <div className="quote-assembly-options" role="radiogroup" aria-label="Assembly configuration">
              <button type="button" disabled={locked||busy} className={`quote-assembly-option ${assemblyMode==="assembled"?"is-selected":""}`} onClick={()=>changeAssemblyMode("assembled")}><strong>Assembled by Mesh Harbor 3D</strong><span>You assemble/glue the multi-part print before pickup or shipment. An assembly labor charge is added.</span></button>
              <button type="button" disabled={locked||busy} className={`quote-assembly-option ${assemblyMode==="disassembled"?"is-selected":""}`} onClick={()=>changeAssemblyMode("disassembled")}><strong>Ship disassembled</strong><span>No assembly labor charge. The customer receives separate pieces and will need super glue.</span></button>
              <button type="button" disabled={locked||busy} className={`quote-assembly-option ${assemblyMode==="not-required"?"is-selected":""}`} onClick={()=>changeAssemblyMode("not-required")}><strong>No assembly required</strong><span>Use this for a single-piece print or a project that does not require glued assembly.</span></button>
            </div>
            {assemblyMode==="assembled"&&<label className="quote-assembly-fee"><span>Assembly labor charge ($)</span><input value={assemblyFee} inputMode="decimal" disabled={locked||busy} onChange={e=>setAssemblyFee(e.target.value)} placeholder="15.00"/></label>}
          </div>
          <div className="quote-workspace-section quote-fulfillment-section"><div className="quote-section-title"><span>03</span><div><strong>Fulfillment</strong><small>Pickup is free. Local delivery uses your set fee. Shipping uses automatic live carrier rates.</small></div></div>
            <div className="quote-fulfillment-options" role="radiogroup" aria-label="Fulfillment method">
              <button type="button" disabled={locked||busy} className={`quote-fulfillment-option ${fulfillmentMode==="pickup"?"is-selected":""}`} onClick={()=>changeFulfillment("pickup")}><strong>Local pickup</strong><span>No fulfillment charge.</span></button>
              <button type="button" disabled={locked||busy} className={`quote-fulfillment-option ${fulfillmentMode==="shipping"?"is-selected":""}`} onClick={()=>changeFulfillment("shipping")}><strong>Ship to customer</strong><span>Customer chooses a live USPS, UPS, or FedEx rate before quote approval.</span></button>
              <button type="button" disabled={locked||busy} className={`quote-fulfillment-option ${fulfillmentMode==="local-delivery"?"is-selected":""}`} onClick={()=>changeFulfillment("local-delivery")}><strong>Local delivery</strong><span>You set a delivery fee for your time and mileage.</span></button>
            </div>
            {fulfillmentMode==="local-delivery"&&<label className="quote-assembly-fee"><span>Local delivery fee ($)</span><input value={localDeliveryFee} inputMode="decimal" disabled={locked||busy} onChange={e=>setLocalDeliveryFee(e.target.value)} placeholder="25.00"/><small>This amount is added directly to the quote total.</small></label>}
            {fulfillmentMode==="shipping"&&<div className="quote-package-grid"><label><span>Packed weight (oz)</span><input type="number" min="0.1" step="0.1" value={packageWeight} disabled={locked||busy} onChange={e=>setPackageWeight(e.target.value)} placeholder="32"/></label><label><span>Box length (in)</span><input type="number" min="0.1" step="0.1" value={packageLength} disabled={locked||busy} onChange={e=>setPackageLength(e.target.value)} placeholder="12"/></label><label><span>Box width (in)</span><input type="number" min="0.1" step="0.1" value={packageWidth} disabled={locked||busy} onChange={e=>setPackageWidth(e.target.value)} placeholder="10"/></label><label><span>Box height (in)</span><input type="number" min="0.1" step="0.1" value={packageHeight} disabled={locked||busy} onChange={e=>setPackageHeight(e.target.value)} placeholder="8"/></label><div className="quote-package-help">Use the packed box dimensions and packed weight, including padding and packaging. USPS, UPS, and FedEx rates depend on these values.</div></div>}
            <div className={`quote-fulfillment-summary mode-${fulfillmentMode}`}><strong>{fulfillmentLabel(fulfillmentMode)}</strong><span>{fulfillmentMode==="shipping"?quote?.shippingSelection?`${quote.shippingSelection.carrier} ${quote.shippingSelection.service} selected at ${money(quote.shippingSelection.rateCents)}. Editing and resending this quote will require the customer to select a fresh live rate.`:"Live carrier cost will be added after the customer enters their address and selects a service.":fulfillmentMode==="local-delivery"?`${money(localDeliveryFeeCents)} local delivery fee is included in the quote.`:"No pickup fee is added."}</span></div>
          </div>
          <div className="quote-workspace-section"><div className="quote-section-title"><span>04</span><div><strong>Customer-facing details</strong><small>These notes and terms are preserved in the quote history.</small></div></div><label><span>Quote notes visible to customer</span><textarea rows={3} value={notes} disabled={locked||busy} onChange={e=>setNotes(e.target.value)} placeholder="Finish, color, shipping, scope, or assumptions."/></label><label><span>Terms customer must approve</span><textarea rows={7} value={terms} disabled={locked||busy} onChange={e=>setTerms(e.target.value)} /></label></div>
          <div className="quote-workspace-actions"><button className="button button-cancel" type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="button button-secondary" type="button" disabled={locked||busy} onClick={()=>void save("save")}>{busy?"Saving…":"Save Draft"}</button><button className="button" type="button" disabled={locked||busy||!request.customerAccountId} onClick={()=>void save("send")}>{busy?"Working…":quote?.sentAt?"Send Revised Quote":"Send Quote to Customer"}</button></div>
          {!request.customerAccountId&&<div className="quote-account-warning">This guest request is not linked to a customer profile yet. You can save a draft, but profile approval requires a linked customer account.</div>}{locked&&<div className="quote-paid-badge">✓ Deposit recorded. This quote is locked to preserve the exact terms the customer paid against.</div>}
        </div>
        <aside className="quote-history-panel"><div className="quote-history-heading"><span>Quote history</span><small>{quote?`Revision ${quote.revision} · ${quote.status.replaceAll("-"," ")}`:"No quote yet"}</small></div>{!quote?.history?.length?<div className="quote-history-empty">No quote activity yet.</div>:<div className="quote-history-list">{[...quote.history].reverse().map(item=><article key={item.id} className={`quote-history-entry event-${item.event}`}><div><strong>{historyLabel(item)}</strong><time>{new Date(item.createdAt).toLocaleString()}</time></div><p>{item.summary}</p>{item.counterTotalCents&&<b>{money(item.counterTotalCents)}</b>}{item.message&&<blockquote>{item.message}</blockquote>}{item.snapshot&&<details><summary>Revision {item.snapshot.revision} snapshot</summary><dl><div><dt>Base price</dt><dd>{money(item.snapshot.basePriceCents)}</dd></div><div><dt>Assembly</dt><dd>{assemblyLabel(item.snapshot.assemblyMode)}</dd></div>{item.snapshot.assemblyFeeCents>0&&<div><dt>Assembly labor</dt><dd>{money(item.snapshot.assemblyFeeCents)}</dd></div>}<div><dt>Fulfillment</dt><dd>{fulfillmentLabel(item.snapshot.fulfillmentMode)}</dd></div>{item.snapshot.localDeliveryFeeCents>0&&<div><dt>Local delivery</dt><dd>{money(item.snapshot.localDeliveryFeeCents)}</dd></div>}{item.snapshot.shippingSelection&&<div><dt>Shipping</dt><dd>{item.snapshot.shippingSelection.carrier} {item.snapshot.shippingSelection.service} · {money(item.snapshot.shippingSelection.rateCents)}</dd></div>}<div><dt>Total</dt><dd>{money(item.snapshot.totalCents)}</dd></div><div><dt>Deposit</dt><dd>{money(item.snapshot.depositCents)}</dd></div><div><dt>Material</dt><dd>{item.snapshot.material}</dd></div><div><dt>Dimensions</dt><dd>{item.snapshot.dimensions}</dd></div><div><dt>Estimated</dt><dd>{item.snapshot.estimatedReadyDate||"TBD"}</dd></div></dl></details>}</article>)}</div>}</aside>
      </div>
    </section>
  </div>;
}
