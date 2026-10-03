"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { quoteDepositOutstandingCents, quoteDepositRefundDueCents, quoteDepositRefundPending, quoteNetDepositPaidCents, type AssemblyMode, type LocalPaymentMethod, type QuoteFulfillmentMode, type QuoteHistoryEntry, type QuotePaymentMethod, type StoredQuote } from "@/lib/quote-types";
import type { StoredRequest } from "@/lib/request-types";
import type { QueueJob } from "@/lib/queue-types";
import { queueScheduleBoundary, quoteWouldSkipQueue } from "@/lib/queue-schedule";
import { OwnerQuoteCostPanel } from "@/components/OwnerQuoteCostPanel";
import type { BambuFilamentCatalogItem, PricingSettings, QuoteCostInput, QuoteCostSnapshot } from "@/lib/pricing-types";
import type { ResolvedMaterialCost } from "@/lib/material-cost-resolver";
import { quoteElectricityDefaults } from "@/lib/printer-electricity";
import { automaticReadyDate } from "@/lib/quote-ready-date";

type Notice = { kind:"success"|"error"|"warning"; text:string } | null;
type OwnerQuotePricingContext={settings:PricingSettings;catalog:BambuFilamentCatalogItem[];materialCosts:Record<string,ResolvedMaterialCost>;snapshots:QuoteCostSnapshot[]};
function costingFromSnapshot(snapshot:QuoteCostSnapshot|null,settings:PricingSettings):QuoteCostInput{return snapshot?{...quoteElectricityDefaults(snapshot),materialLines:snapshot.materialLines.map(line=>({id:line.id,catalogItemId:line.catalogItemId,grams:line.grams})),machineHours:snapshot.machineHours,designHours:snapshot.designHours,laborHours:snapshot.laborHours,postProcessingHours:snapshot.postProcessingHours,packagingCostCents:snapshot.packagingCostCents,localDeliveryInternalCostCents:snapshot.localDeliveryInternalCostCents,miscellaneousCostCents:snapshot.miscellaneousCostCents,targetMarginBasisPoints:snapshot.targetMarginBasisPoints??2000}:{...quoteElectricityDefaults(null),materialLines:[],machineHours:0,designHours:0,laborHours:0,postProcessingHours:0,packagingCostCents:settings.defaultPackagingCostCents,localDeliveryInternalCostCents:0,miscellaneousCostCents:0,targetMarginBasisPoints:settings.targetContributionMarginBasisPoints??2000};}
const DEFAULT_TERMS = "By approving this quote, you confirm the project details and authorize production after the required deposit is received. The deposit is applied to materials, machine time, and work performed once production begins. For carrier shipping, you will choose a live USPS, UPS, or FedEx rate before approval; that selected rate becomes part of the final quote total. The remaining balance is due before shipment or at pickup/delivery handoff. Estimated dates may change because of print failures, material availability, carrier conditions, or approved scope changes. Changes requested after approval may require a revised quote and fresh approval. If a deposit is already on file, it remains credited to the order; an approved revision can require an additional deposit payment or a partial refund so the upfront amount equals 50% of the revised total.";
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
  if(item.event==="refund-issued") return "Deposit refund";
  return "Deposit received";
}
function assemblyLabel(mode:AssemblyMode){if(mode==="assembled")return "Assembled by Mesh Harbor 3D";if(mode==="disassembled")return "Disassembled — assembly guide included";return "No assembly required";}
function fulfillmentLabel(mode:QuoteFulfillmentMode){if(mode==="shipping")return "Carrier shipping — customer chooses USPS, UPS, or FedEx";if(mode==="local-delivery")return "Local delivery";return "Local pickup";}

export function OwnerQuoteEditor({request,quote,jobs,pricing,onChanged,onNotice,onClose}:{request:StoredRequest;quote:StoredQuote|null;jobs:QueueJob[];pricing:OwnerQuotePricingContext;onChanged:()=>Promise<void>;onNotice:(n:Notice)=>void;onClose:()=>void}){
  const hasDepositHistory=Boolean(quote&&(quote.payments.length>0||quote.depositPaidAt));
  const [revisionMode,setRevisionMode]=useState(!hasDepositHistory);
  const [basePrice,setBasePrice]=useState(quote?dollars(quote.basePriceCents):"");
  const requestAssemblyDefault: AssemblyMode = request.assemblyPreference === "assembled" ? "assembled" : request.assemblyPreference === "disassembled" ? "disassembled" : "not-required";
  const assemblyMode:AssemblyMode=request.assemblyPreference&&request.assemblyPreference!=="unsure"?requestAssemblyDefault:quote?.assemblyMode||requestAssemblyDefault;
  const [rushFee,setRushFee]=useState(quote?.rushFeeCents?dollars(quote.rushFeeCents):"");
  const defaultFulfillment:QuoteFulfillmentMode=quote?.fulfillmentMode||(request.fulfillmentMethod==="shipping"?"shipping":request.fulfillmentMethod==="local-delivery"?"local-delivery":"pickup");
  const fulfillmentMode:QuoteFulfillmentMode=request.fulfillmentMethod!=="unsure"?request.fulfillmentMethod:defaultFulfillment;
  const paymentMethod:QuotePaymentMethod=request.paymentPreference?(request.paymentPreference==="stripe"?"stripe":"cash"):quote?.paymentMethod||"stripe";
  const localPaymentMethod:LocalPaymentMethod=request.paymentPreference&&request.paymentPreference!=="stripe"?request.paymentPreference:quote?.localPaymentMethod||"cash";
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
  const [feedback,setFeedback]=useState("");
  const currentCostSnapshot=useMemo(()=>pricing.snapshots.find(item=>quote&&item.quoteId===quote.id&&item.quoteRevision===quote.revision&&item.status==="estimate")||null,[pricing.snapshots,quote]);
  const [costing,setCosting]=useState<QuoteCostInput>(()=>costingFromSnapshot(currentCostSnapshot,pricing.settings));
  useEffect(()=>{setCosting(costingFromSnapshot(currentCostSnapshot,pricing.settings));},[currentCostSnapshot,pricing.settings]);
  useEffect(()=>{if(!quote){setRevisionMode(true);return;}setRevisionMode(!(quote.payments.length>0||quote.depositPaidAt));setBasePrice(dollars(quote.basePriceCents));setRushFee(quote.rushFeeCents?dollars(quote.rushFeeCents):"");setLocalDeliveryFee(quote.fulfillmentMode==="local-delivery"?dollars(quote.localDeliveryFeeCents):"");setPackageWeight(quote.packageWeightOz?String(quote.packageWeightOz):"");setPackageLength(quote.packageLengthIn?String(quote.packageLengthIn):"");setPackageWidth(quote.packageWidthIn?String(quote.packageWidthIn):"");setPackageHeight(quote.packageHeightIn?String(quote.packageHeightIn):"");setMaterial(quote.material);setDimensions(quote.dimensions);setEstimated(quote.estimatedReadyDate);setNotes(quote.notes);setTerms(quote.terms);},[quote]);
  useEffect(()=>{function key(event:KeyboardEvent){if(event.key==="Escape")onClose();}window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key);},[onClose]);
  const basePriceCents=cents(basePrice);const assemblyFeeCents=0;const rushFeeCents=cents(rushFee);const localDeliveryFeeCents=fulfillmentMode==="local-delivery"?cents(localDeliveryFee):0;
  const subtotalCents=basePriceCents+assemblyFeeCents+rushFeeCents+localDeliveryFeeCents;const depositCents=Math.round(subtotalCents/2);const locked=hasDepositHistory&&!revisionMode;
  const activeShippingCustomerCents=!revisionMode?(quote?.shippingSelection?.rateCents||0):0;
  const costSettings=useMemo(()=>paymentMethod==="cash"?{...pricing.settings,defaultPaymentFeePercentBasisPoints:0,defaultPaymentFeeFixedCents:0}:pricing.settings,[pricing.settings,paymentMethod]);
  const pricingCustomerTotalCents=subtotalCents+activeShippingCustomerCents;
  const pricingShippingInternalCents=!revisionMode?(currentCostSnapshot?.shippingInternalCostCents||activeShippingCustomerCents):0;
  const applySuggestedPrice=useCallback((suggestedTotal:number)=>setBasePrice(dollars(Math.max(0,suggestedTotal-activeShippingCustomerCents))),[activeShippingCustomerCents]);
  const savedQuoteMatches=Boolean(quote&&basePriceCents===quote.basePriceCents&&estimated===quote.estimatedReadyDate&&rushFeeCents===quote.rushFeeCents&&localDeliveryFeeCents===quote.localDeliveryFeeCents&&numberValue(packageWeight)===quote.packageWeightOz&&numberValue(packageLength)===quote.packageLengthIn&&numberValue(packageWidth)===quote.packageWidthIn&&numberValue(packageHeight)===quote.packageHeightIn&&material===quote.material&&dimensions===quote.dimensions&&notes===quote.notes&&terms===quote.terms&&JSON.stringify(costing)===JSON.stringify(costingFromSnapshot(currentCostSnapshot,pricing.settings)));
  useEffect(()=>{const before=document.body.style.overflow;document.body.style.overflow="hidden";return()=>{document.body.style.overflow=before;};},[]);
  const scheduleBoundary=useMemo(()=>queueScheduleBoundary(jobs,request.id),[jobs,request.id]);
  useEffect(()=>{if(locked||(quote&&costing.machineHours===(currentCostSnapshot?.machineHours??0)))return;setEstimated(automaticReadyDate(costing.machineHours,scheduleBoundary.latestDate));},[costing.machineHours,scheduleBoundary.latestDate,locked,quote,currentCostSnapshot]);
  const rushRequired=quoteWouldSkipQueue(jobs,estimated,request.id);
  const depositCreditCents=quote?quoteNetDepositPaidCents(quote):0;
  const previewDepositDifferenceCents=depositCents-depositCreditCents;
  const currentRefundDueCents=quote?quoteDepositRefundDueCents(quote):0;
  const currentRefundPending=Boolean(quote&&quoteDepositRefundPending(quote));
  const currentOutstandingCents=quote?quoteDepositOutstandingCents(quote):0;
  const latestCustomerResponse=useMemo(()=>[...(quote?.history||[])].reverse().find(item=>item.event==="counter-offer"||item.event==="declined")||null,[quote]);
  function beginRevision(){
    if(request.queueJobId){onNotice({kind:"warning",text:"Remove this request from the production queue before revising its paid quote."});return;}
    if(!window.confirm("Start a revised quote? The customer's previous approval will no longer apply. Existing deposit money stays credited and will be reconciled after the customer approves the new revision."))return;
    setRevisionMode(true);
  }
  async function approveInPerson(){
    if(!quote){onNotice({kind:"warning",text:"Save the quote before recording in-person approval."});return;}
    if(!window.confirm("Confirm that the customer reviewed and approved this quote in person? This records the current quote revision and customer-policy version in the audit history."))return;
    setBusy(true);try{
      const response=await fetch(`/api/owner/requests/${request.id}/quote-approve-in-person`,{method:"POST"});
      const result=await response.json() as {message?:string};if(!response.ok)throw new Error(result.message||"Could not record in-person approval.");
      onNotice({kind:"success",text:result.message||"In-person approval recorded."});await onChanged();
    }catch(error){onNotice({kind:"error",text:error instanceof Error?error.message:"Could not record in-person approval."});}finally{setBusy(false);}
  }
  async function retryRefund(){
    setBusy(true);try{
      const response=await fetch(`/api/owner/requests/${request.id}/quote-adjustment`,{method:"POST"});
      const result=await response.json() as {message?:string};if(!response.ok)throw new Error(result.message||"Could not reconcile the refund.");
      onNotice({kind:"success",text:result.message||"Deposit refund reconciled."});await onChanged();
    }catch(e){onNotice({kind:"error",text:e instanceof Error?e.message:"Could not reconcile the refund."});}finally{setBusy(false);}
  }
  async function save(action:"save"|"send"){
    const packageWeightOz=numberValue(packageWeight),packageLengthIn=numberValue(packageLength),packageWidthIn=numberValue(packageWidth),packageHeightIn=numberValue(packageHeight);
    if(basePriceCents<50||subtotalCents<50||depositCents<50){onNotice({kind:"error",text:"Enter a valid base print price."});return;}
    if(rushRequired&&rushFeeCents<50){onNotice({kind:"error",text:`This ready date skips active queue work through ${scheduleBoundary.latestDate}. Add a rush fee or choose a later date.`});return;}
    if(paymentMethod==="cash"&&fulfillmentMode!=="pickup"){onNotice({kind:"error",text:"Local/manual payment is available only for local pickup."});return;}
    if(fulfillmentMode==="local-delivery"&&localDeliveryFeeCents<50){onNotice({kind:"error",text:"Enter the local delivery charge."});return;}
    if(fulfillmentMode==="shipping"&&(packageWeightOz<=0||packageLengthIn<=0||packageWidthIn<=0||packageHeightIn<=0)){onNotice({kind:"error",text:"Enter the packed weight and all box dimensions before sending a live-rate shipping quote."});return;}
    setFeedback("");setBusy(true);try{
      const response=await fetch(`/api/owner/requests/${request.id}/quote`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({basePriceCents,assemblyMode,assemblyFeeCents,rushFeeCents,fulfillmentMode,paymentMethod,localPaymentMethod:paymentMethod==="cash"?localPaymentMethod:null,localDeliveryFeeCents,packageWeightOz,packageLengthIn,packageWidthIn,packageHeightIn,totalCents:subtotalCents,depositCents,material,dimensions,estimatedReadyDate:estimated,notes,terms,action,costing})});
      const result=await response.json() as {message?:string;emailStatus?:string};if(!response.ok)throw new Error(result.message||"Could not save quote.");onNotice({kind:result.emailStatus==="failed"||result.emailStatus==="unconfigured"?"warning":"success",text:result.message||"Quote saved."});await onChanged();if(action==="send")onClose();
    }catch(e){const text=e instanceof Error?e.message:"Could not save quote.";setFeedback(text);onNotice({kind:"error",text});}finally{setBusy(false);}
  }
  return <div className="quote-workspace-backdrop" role="presentation" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose();}}>
    <section className="quote-workspace" role="dialog" aria-modal="true" aria-label={`Quote workspace for ${request.requestCode}`}>
      <header className="quote-workspace-header"><div><p className="eyebrow">FORMAL QUOTE</p><h2>{request.requestCode} · {request.name}</h2><p>Build, review, revise, and send the customer quote from one workspace.</p></div><button className="quote-workspace-close" type="button" onClick={onClose} aria-label="Close quote workspace">×</button></header>
      <div className="quote-workspace-layout">
        <div className="quote-workspace-main">
          {latestCustomerResponse&&<div className={`quote-response-banner ${latestCustomerResponse.event}`}><strong>{historyLabel(latestCustomerResponse)}</strong><span>{latestCustomerResponse.counterTotalCents?`Proposed total: ${money(latestCustomerResponse.counterTotalCents)}. `:""}{latestCustomerResponse.message||"No additional message."}</span></div>}
          {hasDepositHistory&&locked&&<div className="quote-revision-lock"><div><strong>Deposit history is protected</strong><span>{money(depositCreditCents)} is currently credited to this order. Start a new revision to change scope, price, or timing. The customer must approve the new revision before any deposit adjustment occurs.</span>{request.queueJobId&&<small>Remove this request from the production queue before revising it.</small>}{quote?.status==="approved"&&currentOutstandingCents>0&&<small>Current additional deposit due: {money(currentOutstandingCents)}.</small>}</div><button className="button button-secondary button-small" type="button" disabled={busy||Boolean(request.queueJobId)} onClick={beginRevision}>Start Revised Quote</button></div>}
          {hasDepositHistory&&revisionMode&&<div className="quote-adjustment-preview"><strong>Revision deposit preview</strong><span>{fulfillmentMode==="shipping"?`${money(depositCreditCents)} remains credited. The final adjustment will be calculated after the customer selects shipping.`:previewDepositDifferenceCents>0?`If approved, the 50% deposit becomes ${money(depositCents)} and the customer owes only ${money(previewDepositDifferenceCents)} more.`:previewDepositDifferenceCents<0?`If approved, the 50% deposit becomes ${money(depositCents)} and ${money(Math.abs(previewDepositDifferenceCents))} will be refunded to the original payment method.`:`The existing ${money(depositCreditCents)} deposit already matches this revision's 50% requirement.`}</span></div>}
          {quote?.status==="approved"&&currentRefundPending&&<div className="quote-refund-review is-processing"><div><strong>Deposit refund is processing</strong><span>Stripe has accepted the refund request. Production remains blocked until Stripe reports the refund as completed.</span></div></div>}
          {quote?.status==="approved"&&!currentRefundPending&&currentRefundDueCents>0&&<div className="quote-refund-review"><div><strong>Deposit refund needs attention</strong><span>{money(currentRefundDueCents)} still needs to be returned to the customer before this revised deposit is fully reconciled.</span></div><button className="button button-secondary button-small" type="button" disabled={busy} onClick={()=>void retryRefund()}>{busy?"Working…":"Retry Stripe Refund"}</button></div>}
          <OwnerQuoteCostPanel settings={costSettings} catalog={pricing.catalog} materialCosts={pricing.materialCosts} value={costing} customerTotalCents={pricingCustomerTotalCents} shippingInternalCostCents={pricingShippingInternalCents} disabled={locked||busy} onChange={setCosting} onUseSuggestedPrice={applySuggestedPrice}>
          <div className="quote-derived-price"><div className="quote-section-title"><div><strong>Price & ready date</strong><small>The base quote is driven by Cost & Margin. Shipping is added after the customer chooses a live carrier rate.</small></div></div>
            <div className="owner-edit-grid quote-money-grid"><label><span>Calculated base quote ($)</span><input value={basePrice} disabled readOnly/></label><label><span>{fulfillmentMode==="shipping"?"Current subtotal ($)":"Total quote ($)"}</span><input value={subtotalCents>0?dollars(subtotalCents):""} disabled readOnly/></label><label><span>{fulfillmentMode==="shipping"?"Current 50% deposit ($)":"Required 50% deposit ($)"}</span><input value={subtotalCents>0?dollars(depositCents):""} disabled readOnly/></label><label><span>Customer-facing material</span><input value={material} disabled={locked||busy} onChange={e=>setMaterial(e.target.value)} /></label><label><span>Dimensions</span><input value={dimensions} disabled={locked||busy} onChange={e=>setDimensions(e.target.value)} /></label><label><span>Estimated ready</span><input type="date" value={estimated} disabled={locked||busy} onChange={e=>setEstimated(e.target.value)}/><small>Starts with current queue + print duration + 3-day buffer. Adjust when needed.</small></label></div>
            <div className={`quote-schedule-guidance ${rushRequired?"is-rush":""}`}><div><strong>{rushRequired?"Rush scheduling required":"Queue-aware scheduling"}</strong><span>{scheduleBoundary.latestDate?`Current active queue commitments extend through ${scheduleBoundary.latestDate}${scheduleBoundary.latestCode?` (${scheduleBoundary.latestCode})`:""}. You control the final ready date.`:"There are no dated active queue commitments blocking this quote."}</span>{rushRequired&&<small>This date moves the order ahead of existing queue commitments, so a rush fee is required.</small>}</div>{(rushRequired||rushFeeCents>0)&&<label><span>Rush fee ($){!rushRequired&&<small className="optional-label"> Optional</small>}</span><input value={rushFee} inputMode="decimal" disabled={locked||busy} onChange={e=>setRushFee(e.target.value)} placeholder="20.00"/></label>}</div>
            {fulfillmentMode==="shipping"&&<div className="shipping-pending-owner"><strong>Shipping is intentionally pending.</strong><span>The customer will enter their private delivery address and choose a live USPS, UPS, or FedEx rate. Their selected rate will be added to this subtotal before they can approve the quote.</span></div>}
          </div>
          <div className="quote-customer-choices"><strong>Customer choices</strong><dl><div><dt>Receive it</dt><dd>{fulfillmentLabel(fulfillmentMode)}</dd></div><div><dt>Assembly</dt><dd>{request.assemblyPreference==="unsure"?"Confirm with customer before sending":assemblyLabel(assemblyMode)}</dd></div><div><dt>Payment</dt><dd>{paymentMethod==="stripe"?"Card via Stripe":localPaymentMethod.replaceAll("-"," ")}</dd></div></dl><small>Chosen on the request. For in-person requests, record the customer&apos;s choices when adding the request. Assembly labor belongs in post-processing minutes.</small></div>
            {fulfillmentMode==="local-delivery"&&<label className="quote-assembly-fee"><span>Local delivery fee ($)</span><input value={localDeliveryFee} inputMode="decimal" disabled={locked||busy} onChange={e=>setLocalDeliveryFee(e.target.value)} placeholder="25.00"/><small>This amount is added directly to the quote total.</small></label>}
            {fulfillmentMode==="shipping"&&<div className="quote-package-grid"><label><span>Packed weight (oz)</span><input type="number" min="0.1" step="0.1" value={packageWeight} disabled={locked||busy} onChange={e=>setPackageWeight(e.target.value)} placeholder="32"/></label><label><span>Box length (in)</span><input type="number" min="0.1" step="0.1" value={packageLength} disabled={locked||busy} onChange={e=>setPackageLength(e.target.value)} placeholder="12"/></label><label><span>Box width (in)</span><input type="number" min="0.1" step="0.1" value={packageWidth} disabled={locked||busy} onChange={e=>setPackageWidth(e.target.value)} placeholder="10"/></label><label><span>Box height (in)</span><input type="number" min="0.1" step="0.1" value={packageHeight} disabled={locked||busy} onChange={e=>setPackageHeight(e.target.value)} placeholder="8"/></label><div className="quote-package-help">Use the packed box dimensions and packed weight, including padding and packaging. USPS, UPS, and FedEx rates depend on these values.</div></div>}
            <div className={`quote-fulfillment-summary mode-${fulfillmentMode}`}><strong>{fulfillmentLabel(fulfillmentMode)}</strong><span>{fulfillmentMode==="shipping"?quote?.shippingSelection?`${quote.shippingSelection.carrier} ${quote.shippingSelection.service} selected at ${money(quote.shippingSelection.rateCents)}. Editing and resending this quote will require the customer to select a fresh live rate.`:"Live carrier cost will be added after the customer enters their address and selects a service.":fulfillmentMode==="local-delivery"?`${money(localDeliveryFeeCents)} local delivery fee is included in the quote.`:"No pickup fee is added."}</span></div>
          </OwnerQuoteCostPanel>
          <div className="quote-workspace-section"><div className="quote-section-title"><span>02</span><div><strong>Customer-facing details</strong><small>These notes and terms are preserved in the quote history.</small></div></div><label><span>Quote notes visible to customer</span><textarea rows={3} value={notes} disabled={locked||busy} onChange={e=>setNotes(e.target.value)} placeholder="Finish, color, shipping, scope, or assumptions."/></label><label><span>Terms customer must approve</span><textarea rows={7} value={terms} disabled={locked||busy} onChange={e=>setTerms(e.target.value)} /></label></div>
          {feedback&&<div className="owner-notice error" role="alert">{feedback}</div>}
          {request.source==="owner"&&quote&&!savedQuoteMatches&&<small>Save the current quote before recording in-person approval.</small>}
          <div className="quote-workspace-actions"><button className="button button-cancel" type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="button button-secondary" type="button" disabled={locked||busy} onClick={()=>void save("save")}>{busy?"Saving…":"Save Draft"}</button>{request.source==="owner"&&quote&&["draft","sent"].includes(quote.status)&&<button className="button button-secondary" type="button" disabled={busy||locked||!savedQuoteMatches||request.fulfillmentMethod==="unsure"||!request.assemblyPreference||request.assemblyPreference==="unsure"} onClick={()=>void approveInPerson()}>Customer Approved In Person</button>}<button className="button" type="button" disabled={locked||busy||(!request.customerAccountId&&!request.email.trim())} onClick={()=>void save("send")}>{busy?"Working…":hasDepositHistory||quote?.sentAt?"Send Revised Quote":"Send Quote to Customer"}</button></div>
          {request.source==="owner"?<div className="quote-account-warning is-info">In-person request: save the quote, send it to the customer email, or record their approval in person. No verified account is required.</div>:<div className="quote-account-warning is-info">Customer-submitted request: fulfillment is locked to the customer&apos;s selection. Quote approval works through either their verified account or the secure link sent to their request email.</div>}
        </div>
        <aside className="quote-history-panel"><div className="quote-history-heading"><span>Quote history</span><small>{quote?`Revision ${quote.revision} · ${quote.status.replaceAll("-"," ")}`:"No quote yet"}</small></div>{!quote?.history?.length?<div className="quote-history-empty">No quote activity yet.</div>:<div className="quote-history-list">{[...quote.history].reverse().map(item=><article key={item.id} className={`quote-history-entry event-${item.event}`}><div><strong>{historyLabel(item)}</strong><time>{new Date(item.createdAt).toLocaleString()}</time></div><p>{item.summary}</p>{item.counterTotalCents&&<b>{money(item.counterTotalCents)}</b>}{item.message&&<blockquote>{item.message}</blockquote>}{item.snapshot&&<details><summary>Revision {item.snapshot.revision} snapshot</summary><dl><div><dt>Base price</dt><dd>{money(item.snapshot.basePriceCents)}</dd></div><div><dt>Assembly</dt><dd>{assemblyLabel(item.snapshot.assemblyMode)}</dd></div>{item.snapshot.assemblyFeeCents>0&&<div><dt>Assembly labor</dt><dd>{money(item.snapshot.assemblyFeeCents)}</dd></div>}{item.snapshot.rushFeeCents>0&&<div><dt>Rush fee</dt><dd>{money(item.snapshot.rushFeeCents)}</dd></div>}<div><dt>Fulfillment</dt><dd>{fulfillmentLabel(item.snapshot.fulfillmentMode)}</dd></div>{item.snapshot.localDeliveryFeeCents>0&&<div><dt>Local delivery</dt><dd>{money(item.snapshot.localDeliveryFeeCents)}</dd></div>}{item.snapshot.shippingSelection&&<div><dt>Shipping</dt><dd>{item.snapshot.shippingSelection.carrier} {item.snapshot.shippingSelection.service} · {money(item.snapshot.shippingSelection.rateCents)}</dd></div>}<div><dt>Total</dt><dd>{money(item.snapshot.totalCents)}</dd></div><div><dt>Deposit</dt><dd>{money(item.snapshot.depositCents)}</dd></div><div><dt>Material</dt><dd>{item.snapshot.material}</dd></div><div><dt>Dimensions</dt><dd>{item.snapshot.dimensions}</dd></div><div><dt>Estimated</dt><dd>{item.snapshot.estimatedReadyDate||"TBD"}</dd></div></dl></details>}</article>)}</div>}</aside>
      </div>
    </section>
  </div>;
}
