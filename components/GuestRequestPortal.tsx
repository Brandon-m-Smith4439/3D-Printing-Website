"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CustomerShippingSelector } from "@/components/CustomerShippingSelector";
import { CustomerPickupScheduler } from "@/components/CustomerPickupScheduler";
import { CUSTOMER_POLICY_VERSION } from "@/lib/customer-policies";
import type { LocalPaymentMethod, QuoteHistoryEntry, QuoteStatus, ShippingSelection } from "@/lib/quote-types";
import type { QueueStatus } from "@/lib/queue-types";
import type { RequestStatus } from "@/lib/request-types";
import { ownerTrackingStatusLabels, type OwnerTrackingStatus } from "@/lib/owner-tracking-status";
import type { ShipmentStatus } from "@/lib/shipment-types";

type GuestQuote={
  id:string;revision:number;status:QuoteStatus;basePriceCents:number;assemblyFeeCents:number;rushFeeCents:number;localDeliveryFeeCents:number;
  fulfillmentMode:"pickup"|"shipping"|"local-delivery";paymentMethod:"stripe"|"cash";localPaymentMethod:LocalPaymentMethod|null;shippingSelection:ShippingSelection|null;
  totalCents:number;depositCents:number;balanceCents:number;material:string;dimensions:string;estimatedReadyDate:string;notes:string;terms:string;
  depositPaidCents:number;depositOutstandingCents:number;cashFinalPaidAt:string;history:QuoteHistoryEntry[];
};
type Props={
  request:{id:string;requestCode:string;status:RequestStatus;ownerTrackingStatus:OwnerTrackingStatus|null;name:string;email:string;projectType:string;quantity:number;description:string;createdAt:string;emailNotifications:boolean};
  quote:GuestQuote|null;
  queue:null|{status:QueueStatus;position:number|null;estimatedReadyDate:string};
  invoice:null|{status:string;amountDueCents:number;amountPaidCents:number;amountRemainingCents:number;hostedInvoiceUrl:string;invoicePdfUrl:string;paidAt:string};
  shipment:null|{trackingCode:string;publicTrackingUrl:string;carrier:string;service:string;status:ShipmentStatus;estimatedDeliveryDate:string};
};

const requestLabels:Record<RequestStatus,string>={new:"New",reviewing:"Under review",quoted:"Quote sent",accepted:"Quote approved","deposit-paid":"Deposit paid",declined:"Declined",queued:"In queue",completed:"Completed"};
const queueLabels:Record<QueueStatus,string>={queued:"Queued",preparing:"Preparing / slicing",printing:"Printing now",finishing:"Finishing / cleanup",ready:"Ready","on-hold":"On hold",completed:"Completed"};
const quoteLabels:Record<QuoteStatus,string>={draft:"Draft",sent:"Waiting for your response",countered:"Counter offer sent",approved:"Approved — deposit due",declined:"Declined","deposit-paid":"Deposit satisfied",void:"Closed"};
function money(cents:number){return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(cents/100);}
function localPaymentLabel(mode:LocalPaymentMethod|null){return({cash:"Cash",zelle:"Zelle","cash-app":"Cash App","apple-cash":"Apple Cash",venmo:"Venmo",paypal:"PayPal"} as Record<string,string>)[mode||""]||"Local payment";}

export function GuestRequestPortal({request,quote,queue,invoice,shipment}:Props){
  const router=useRouter();
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const [policyAccepted,setPolicyAccepted]=useState(false);
  const [counterOpen,setCounterOpen]=useState(false);
  const [counterTotal,setCounterTotal]=useState("");
  const [counterMessage,setCounterMessage]=useState("");
  const [emailUpdates,setEmailUpdates]=useState(request.emailNotifications);

  async function refresh(){router.refresh();}

  async function approve(){
    if(!quote||!policyAccepted)return;
    setBusy(true);setMessage("");
    try{
      const response=await fetch(`/api/guest/quotes/${quote.id}/approve`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({accepted:true,policyVersion:CUSTOMER_POLICY_VERSION})});
      const result=await response.json() as {message?:string};if(!response.ok)throw new Error(result.message||"Could not approve the quote.");
      setMessage(result.message||"Quote approved.");setPolicyAccepted(false);await refresh();
    }catch(error){setMessage(error instanceof Error?error.message:"Could not approve the quote.");}finally{setBusy(false);}
  }

  async function respond(action:"counter"|"decline"){
    if(!quote)return;
    setBusy(true);setMessage("");
    try{
      const body=action==="counter"
        ? {action,counterTotalCents:Math.round(Number(counterTotal)*100),message:counterMessage}
        : {action,message:counterMessage};
      const response=await fetch(`/api/guest/quotes/${quote.id}/respond`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      const result=await response.json() as {message?:string};if(!response.ok)throw new Error(result.message||"Could not save your quote response.");
      setMessage(result.message||"Response sent.");setCounterOpen(false);setCounterTotal("");setCounterMessage("");await refresh();
    }catch(error){setMessage(error instanceof Error?error.message:"Could not save your quote response.");}finally{setBusy(false);}
  }

  async function payDeposit(){
    if(!quote)return;
    setBusy(true);setMessage("");
    try{
      const response=await fetch(`/api/guest/quotes/${quote.id}/checkout`,{method:"POST"});
      const result=await response.json() as {message?:string;url?:string};if(!response.ok||!result.url)throw new Error(result.message||"Could not open secure checkout.");
      window.location.assign(result.url);
    }catch(error){setMessage(error instanceof Error?error.message:"Could not open secure checkout.");setBusy(false);}
  }

  async function toggleEmailUpdates(){
    const next=!emailUpdates;setBusy(true);setMessage("");
    try{
      const response=await fetch("/api/guest/request/preferences",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({emailNotifications:next})});
      const result=await response.json() as {message?:string};if(!response.ok)throw new Error(result.message||"Could not update email preferences.");
      setEmailUpdates(next);setMessage(result.message||"Email preference updated.");
    }catch(error){setMessage(error instanceof Error?error.message:"Could not update email preferences.");}finally{setBusy(false);}
  }

  const requestState=request.ownerTrackingStatus?ownerTrackingStatusLabels[request.ownerTrackingStatus]:queue?queueLabels[queue.status]:requestLabels[request.status];
  return <div className="container guest-request-page">
    <header className="guest-request-hero">
      <div><p className="eyebrow">SECURE REQUEST PORTAL</p><h1>{request.requestCode}</h1><p>This private page was opened from the secure link sent to <strong>{request.email}</strong>.</p></div>
      <div className="guest-request-state"><span>{requestState}</span>{queue?.position&&<small>Queue position #{queue.position}</small>}</div>
    </header>

    {message&&<div className="form-status info" role="status">{message}</div>}

    <section className="guest-request-summary owner-panel">
      <div><span>Project</span><strong>{request.description}</strong></div>
      <div><span>Quantity</span><strong>{request.quantity}</strong></div>
      <div><span>Submitted</span><strong>{new Date(request.createdAt).toLocaleDateString()}</strong></div>
      <div><span>Current status</span><strong>{requestState}</strong></div>
    </section>

    <section className="guest-email-preferences owner-panel">
      <div><p className="eyebrow">EMAIL UPDATES</p><h2>Keep using this email link.</h2><p>No account is required. Quote/payment emails are always sent when action is required; optional production status emails can be turned on or off here.</p></div>
      <button className={emailUpdates?"button button-secondary button-small":"button button-small"} type="button" disabled={busy} onClick={()=>void toggleEmailUpdates()}>{emailUpdates?"Status emails on":"Turn status emails on"}</button>
    </section>

    {!quote&&<section className="guest-request-waiting owner-panel"><p className="eyebrow">QUOTE REVIEW</p><h2>Mesh Harbor 3D is reviewing your request.</h2><p>When the quote is ready, this page will show the full price, fulfillment details, estimated ready date, terms, and response controls. You will also receive an email.</p></section>}

    {quote&&<section className="customer-quote-card guest-quote-card">
      <div className="customer-quote-heading"><div><span className="eyebrow">QUOTE REVISION {quote.revision}</span><h2>{quoteLabels[quote.status]}</h2></div><strong>{money(quote.totalCents)}</strong></div>
      <div className="customer-quote-facts">
        <span><b>Print / service</b>{money(quote.basePriceCents)}</span>
        {quote.assemblyFeeCents>0&&<span><b>Assembly</b>{money(quote.assemblyFeeCents)}</span>}
        {quote.rushFeeCents>0&&<span><b>Rush</b>{money(quote.rushFeeCents)}</span>}
        {quote.shippingSelection&&<span><b>Shipping</b>{money(quote.shippingSelection.rateCents)}</span>}
        <span><b>Deposit</b>{money(quote.depositCents)}</span>
        <span><b>Balance</b>{money(quote.balanceCents)}</span>
        <span><b>Material</b>{quote.material}</span>
        <span><b>Estimated ready</b>{quote.estimatedReadyDate||"To be confirmed"}</span>
      </div>
      {quote.notes&&<div className="customer-tax-callout"><strong>Mesh Harbor 3D notes</strong><span>{quote.notes}</span></div>}
      {quote.paymentMethod==="stripe"?<div className="customer-tax-callout"><strong>Stripe Automatic Tax</strong><span>Applicable tax is calculated by Stripe during secure payment and is not included in the pre-tax quote total shown above.</span></div>:<div className="customer-tax-callout"><strong>{localPaymentLabel(quote.localPaymentMethod)} · local pickup</strong><span>Mesh Harbor 3D will coordinate the exact payment instructions privately by email. Payment is not considered received until the owner confirms it.</span></div>}

      {quote.status==="sent"&&quote.fulfillmentMode==="shipping"&&<CustomerShippingSelector quoteId={quote.id} existing={quote.shippingSelection} customerName={request.name} apiBase="/api/guest/quotes" onChanged={refresh} onMessage={setMessage}/>}

      {quote.status==="sent"&&<div className="customer-quote-response-block">
        <label className="customer-policy-acceptance"><input type="checkbox" checked={policyAccepted} disabled={busy} onChange={event=>setPolicyAccepted(event.target.checked)}/><span><strong>I reviewed this quote and agree to the current customer policies.</strong><small>I agree to the <Link href="/terms" target="_blank">Custom Order Terms</Link> and <Link href="/fulfillment" target="_blank">Fulfillment Policy</Link> ({CUSTOMER_POLICY_VERSION}).</small></span></label>
        <div className="customer-quote-response-actions"><button className="button button-small" type="button" disabled={busy||!policyAccepted||(quote.fulfillmentMode==="shipping"&&!quote.shippingSelection)} onClick={()=>void approve()}>{quote.fulfillmentMode==="shipping"&&!quote.shippingSelection?"Choose Shipping Before Approval":!policyAccepted?"Accept Policies Before Approval":"Approve Quote & Terms"}</button><button className="button button-secondary button-small" type="button" disabled={busy} onClick={()=>setCounterOpen(current=>!current)}>Counter Offer</button><button className="text-button danger-text" type="button" disabled={busy} onClick={()=>void respond("decline")}>Decline Quote</button></div>
      </div>}

      {counterOpen&&quote.status==="sent"&&<div className="customer-counter-panel"><label><span>Your proposed total ($)</span><input type="number" min="0.50" step="0.01" value={counterTotal} onChange={event=>setCounterTotal(event.target.value)}/></label><label><span>What would you like changed?</span><textarea rows={4} maxLength={1200} value={counterMessage} onChange={event=>setCounterMessage(event.target.value)} placeholder="Explain the price, material, timing, or scope you want adjusted."/></label><button className="button button-small" type="button" disabled={busy||Number(counterTotal)<=0||counterMessage.trim().length<3} onClick={()=>void respond("counter")}>Send Counter Offer</button></div>}

      {quote.status==="approved"&&quote.depositOutstandingCents>0&&quote.paymentMethod==="stripe"&&<button className="button button-small" type="button" disabled={busy} onClick={()=>void payDeposit()}>{busy?"Opening secure checkout…":`Pay ${money(quote.depositOutstandingCents)} Deposit Securely`}</button>}
      {quote.status==="approved"&&quote.depositOutstandingCents>0&&quote.paymentMethod==="cash"&&<div className="quote-response-state"><strong>{localPaymentLabel(quote.localPaymentMethod)} deposit awaiting owner confirmation</strong><span>Follow the private Mesh Harbor 3D payment instructions sent by email. Production starts only after receipt is confirmed.</span></div>}
      {quote.status==="deposit-paid"&&<div className="quote-paid-badge">✓ Deposit requirement satisfied · {money(quote.depositPaidCents)} applied</div>}

      {quote.history.length>0&&<details className="customer-quote-history"><summary>Quote history ({quote.history.length})</summary><div>{[...quote.history].reverse().map(item=><article key={item.id}><div><strong>{item.summary}</strong><time>{new Date(item.createdAt).toLocaleString()}</time></div>{item.counterTotalCents&&<b>Counter: {money(item.counterTotalCents)}</b>}{item.message&&<p>{item.message}</p>}</article>)}</div></details>}
    </section>}

    {invoice&&<section className="customer-final-invoice-card">
      <div className="customer-shipment-heading"><div><span className="eyebrow">FINAL BALANCE</span><h3>{invoice.status==="paid"?"Paid in full":"Invoice ready"}</h3></div><span className={`final-invoice-status status-${invoice.status}`}>{invoice.status}</span></div>
      <div className="customer-shipment-facts"><span><b>Total due</b>{money(invoice.amountDueCents)}</span><span><b>Paid</b>{money(invoice.amountPaidCents)}</span><span><b>Remaining</b>{money(invoice.amountRemainingCents)}</span></div>
      {invoice.status!=="paid"&&invoice.hostedInvoiceUrl&&<a className="button button-small" href={invoice.hostedInvoiceUrl} target="_blank" rel="noreferrer">Pay Final Balance Securely ↗</a>}
      {invoice.invoicePdfUrl&&<a className="button button-secondary button-small" href={invoice.invoicePdfUrl} target="_blank" rel="noreferrer">Invoice PDF ↗</a>}
    </section>}

    {shipment?.trackingCode&&<section className="customer-shipment-card"><div className="customer-shipment-heading"><div><span className="eyebrow">SHIPMENT</span><h3>{shipment.status.replaceAll("_"," ")}</h3></div><span className="shipment-status-badge">{shipment.carrier} {shipment.service}</span></div><div className="customer-shipment-facts"><span><b>Tracking</b>{shipment.trackingCode}</span><span><b>Estimated delivery</b>{shipment.estimatedDeliveryDate||"Carrier estimate pending"}</span></div>{shipment.publicTrackingUrl&&<a className="button button-secondary button-small" href={shipment.publicTrackingUrl} target="_blank" rel="noreferrer">Track with carrier ↗</a>}</section>}

    {quote?.fulfillmentMode==="pickup"&&queue?.status==="ready"&&<CustomerPickupScheduler requestId={request.id} emailVerified={true} apiBase="/api/guest/requests" onChanged={refresh} onMessage={setMessage}/>}

    <section className="guest-account-upgrade owner-panel"><div><p className="eyebrow">OPTIONAL ACCOUNT</p><h3>Want all future requests in one place?</h3><p>Create an account with the same email and verify it. Matching guest requests are automatically linked to your profile.</p></div><Link className="button button-secondary button-small" href={`/login?mode=register&email=${encodeURIComponent(request.email)}`}>Create Account</Link></section>
  </div>;
}
