"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { CustomerNotification } from "@/lib/customer-types";
import type { QueueStatus } from "@/lib/queue-types";
import type { RequestStatus } from "@/lib/request-types";
import type { AssemblyMode, QuoteFulfillmentMode, QuoteHistoryEntry, QuoteStatus, ShippingSelection } from "@/lib/quote-types";
import type { ShipmentStatus, ShipmentTrackingEvent } from "@/lib/shipment-types";
import { CustomerShippingSelector } from "@/components/CustomerShippingSelector";

type ProfileQuote = {
  id:string; revision:number; status:QuoteStatus; basePriceCents:number; assemblyMode:AssemblyMode; assemblyFeeCents:number; fulfillmentMode:QuoteFulfillmentMode; localDeliveryFeeCents:number; shippingSelection:ShippingSelection|null; totalCents:number; depositCents:number; balanceCents:number; currency:"usd";
  material:string; dimensions:string; estimatedReadyDate:string; notes:string; terms:string; sentAt:string; approvedAt:string; depositPaidAt:string; history:QuoteHistoryEntry[];
};
type ProfileShipment = {
  trackingCode:string; publicTrackingUrl:string; carrier:"USPS"|"UPS"|"FedEx"; service:string; status:ShipmentStatus; statusDetail:string;
  estimatedDeliveryDate:string; purchasedAt:string; deliveredAt:string; trackingEvents:ShipmentTrackingEvent[];
};
type ProfileRequest = {
  id:string; requestCode:string; status:RequestStatus; projectType:string; quantity:number; neededBy:string; description:string; createdAt:string;
  quote:ProfileQuote|null;
  shipment:ProfileShipment|null;
  queue:null|{publicCode:string;publicTitle:string;status:QueueStatus;position:number|null;estimatedReadyDate:string;publicNote:string;imageUrl:string};
};
type Props={customer:{displayName:string;email:string;emailVerified:boolean;showQueuePosition:boolean}};
const queueLabels:Record<QueueStatus,string>={queued:"Queued",preparing:"Preparing / slicing",printing:"Printing now",finishing:"Finishing / cleanup",ready:"Ready","on-hold":"On hold",completed:"Completed"};
const requestLabels:Record<RequestStatus,string>={new:"New",reviewing:"Under review",quoted:"Quote sent",accepted:"Quote approved", "deposit-paid":"Deposit paid",declined:"Declined",queued:"In queue",completed:"Completed"};
const quoteLabels:Record<QuoteStatus,string>={draft:"Quote draft",sent:"Waiting for your response",countered:"Counter offer sent",approved:"Quote approved — deposit due",declined:"Quote declined", "deposit-paid":"Deposit paid",void:"Quote closed"};
function money(cents:number){return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(cents/100);}
function assemblyLabel(mode:AssemblyMode){if(mode==="assembled")return "Assembled by Mesh Harbor 3D";if(mode==="disassembled")return "Ships disassembled — assembly guide included";return "No assembly required";}
function fulfillmentLabel(mode:QuoteFulfillmentMode){if(mode==="shipping")return "Carrier shipping";if(mode==="local-delivery")return "Local delivery";return "Local pickup";}
function shipmentLabel(status:ShipmentStatus){return ({not_created:"Not shipped",review_required:"Shipping review",label_created:"Label created",pre_transit:"Label created",in_transit:"In transit",out_for_delivery:"Out for delivery",delivered:"Delivered",return_to_sender:"Returning to sender",failure:"Delivery exception",unknown:"Tracking update",refund_submitted:"Label refund pending",refunded:"Label refunded",refund_rejected:"Label refund rejected"} as Record<ShipmentStatus,string>)[status]||"Tracking update";}
function trackingLocation(event:ShipmentTrackingEvent){const parts=[event.location?.city,event.location?.state,event.location?.zip].filter(Boolean);return parts.join(", ");}
function displayedStatus(request:ProfileRequest){if(request.shipment?.trackingCode&&!["refunded","refund_rejected"].includes(request.shipment.status))return shipmentLabel(request.shipment.status);if(request.queue)return queueLabels[request.queue.status];if(request.quote?.depositPaidAt)return "Deposit paid";if(request.quote?.status==="deposit-paid")return "Payment record under review";if(request.quote)return quoteLabels[request.quote.status];if(request.status==="deposit-paid")return "Under review — no deposit recorded";if(request.status==="queued")return "Under review — not currently queued";return requestLabels[request.status];}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error("The server took too long to respond. Please try again.");
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

export function ProfileDashboard({customer}:Props){
  const router=useRouter();const search=useSearchParams();
  const [requests,setRequests]=useState<ProfileRequest[]>([]);const [notifications,setNotifications]=useState<CustomerNotification[]>([]);const [loading,setLoading]=useState(true);const [busyQuote,setBusyQuote]=useState("");const [message,setMessage]=useState("");
  const [counterQuoteId,setCounterQuoteId]=useState("");const [counterAmount,setCounterAmount]=useState("");const [counterMessage,setCounterMessage]=useState("");
  async function load(){try{const response=await fetchWithTimeout("/api/account/requests",{cache:"no-store"});if(response.status===401){router.push("/login");return;}const result=await response.json() as {requests?:ProfileRequest[];notifications?:CustomerNotification[],message?:string};if(!response.ok)throw new Error(result.message||"Could not refresh your requests.");setRequests(result.requests||[]);setNotifications(result.notifications||[]);}catch(error){setMessage(error instanceof Error?error.message:"Could not refresh your requests.");}finally{setLoading(false);}}
  // Start a single polling loop for the lifetime of this dashboard.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(()=>{void load();const timer=window.setInterval(()=>void load(),30_000);return()=>window.clearInterval(timer);},[]);
  useEffect(()=>{const payment=search.get("payment");if(payment==="success")setMessage("Deposit payment completed. It may take a few seconds for Stripe to confirm it.");if(payment==="cancelled")setMessage("Deposit checkout was cancelled. Your quote is still available.");if(payment==="development")setMessage("Development mode: the deposit was simulated as paid; no real card was charged.");},[search]);
  async function markRead(){await fetch("/api/account/notifications/read",{method:"POST"});await load();router.refresh();}
  async function approveQuote(quoteId:string){setBusyQuote(quoteId);setMessage("");try{const r=await fetchWithTimeout(`/api/account/quotes/${quoteId}/approve`,{method:"POST"});const j=await r.json() as {message?:string};if(!r.ok)throw new Error(j.message||"Could not approve quote.");setMessage(j.message||"Quote approved.");await load();}catch(e){setMessage(e instanceof Error?e.message:"Could not approve quote.");}finally{setBusyQuote("");}}
  async function respondQuote(quoteId:string,action:"decline"|"counter"){
    if(action==="decline"&&!window.confirm("Decline this quote? The request will stay available for the owner to review or revise."))return;
    const amount=Math.round(Number(counterAmount.replace(/[^0-9.]/g,""))*100);
    if(action==="counter"&&(!Number.isFinite(amount)||amount<50||counterMessage.trim().length<3)){setMessage("Enter a valid counter-offer total and a short message explaining what you would like changed.");return;}
    setBusyQuote(quoteId);setMessage("");try{const body=action==="counter"?{action,counterTotalCents:amount,message:counterMessage}:{action,message:""};const r=await fetchWithTimeout(`/api/account/quotes/${quoteId}/respond`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const j=await r.json() as {message?:string};if(!r.ok)throw new Error(j.message||"Could not send your response.");setMessage(j.message||"Response sent.");setCounterQuoteId("");setCounterAmount("");setCounterMessage("");await load();}catch(e){setMessage(e instanceof Error?e.message:"Could not send your response.");}finally{setBusyQuote("");}}
  async function payDeposit(quoteId:string){setBusyQuote(quoteId);setMessage("");try{const r=await fetchWithTimeout(`/api/account/quotes/${quoteId}/checkout`,{method:"POST"});const j=await r.json() as {url?:string;message?:string};if(!r.ok||!j.url)throw new Error(j.message||"Could not open secure checkout.");window.location.href=j.url;}catch(e){setMessage(e instanceof Error?e.message:"Could not open secure checkout.");setBusyQuote("");}}

  return <div className="profile-dashboard">
    <div className="profile-header-card"><div><p className="eyebrow">YOUR PROFILE</p><h1>{customer.displayName}</h1><p>{customer.email} {customer.emailVerified?<span className="verified-inline">Verified</span>:<span className="unverified-inline">Not verified</span>}</p></div><div className="profile-header-actions"><Link className="button button-secondary button-small" href="/profile/settings">Settings</Link><Link className="button button-small" href="/custom-request">New Request</Link></div></div>
    {!customer.emailVerified&&<div className="profile-verification-callout"><div><strong>Verify your email to approve or negotiate quotes and unlock secure account changes.</strong><span>Quote acceptance, counter offers, deposit payment, password changes, and email changes require a verified account.</span></div><Link className="button button-small" href="/profile/settings">Verify Email</Link></div>}
    {message&&<div className="settings-notice info"><span>{message}</span></div>}
    <section className="profile-section" id="notifications"><div className="owner-panel-heading"><div><p className="eyebrow">STATUS UPDATES</p><h2>Notifications</h2></div>{notifications.some(item=>!item.readAt)&&<button className="text-button" type="button" onClick={()=>void markRead()}>Mark all read</button>}</div>{notifications.length===0?<div className="queue-empty compact"><strong>No notifications yet.</strong><span>Status changes will appear here.</span></div>:<div className="profile-notifications">{notifications.slice(0,12).map(item=><article className={item.readAt?"":"is-unread"} key={item.id}><span className="notification-dot"/><div><strong>{item.requestCode}</strong><p>{item.message}</p><small>{new Date(item.createdAt).toLocaleString()}</small></div></article>)}</div>}</section>
    <section className="profile-section" id="requests"><div className="owner-panel-heading"><div><p className="eyebrow">YOUR REQUESTS</p><h2>Requests, quotes & queue status</h2></div><button className="text-button" type="button" onClick={()=>void load()}>Refresh</button></div>
      {loading?<div className="owner-loading">Loading your requests…</div>:requests.length===0?<div className="queue-empty"><strong>No profile-linked requests yet.</strong><span>Sign in before submitting a custom request and it will appear here automatically.</span></div>:<div className="profile-request-list">{requests.map(request=>{const title=request.queue?.publicTitle||"Custom 3D print request";const status=displayedStatus(request);const q=request.quote;const awaitingShipping=Boolean(q&&q.fulfillmentMode==="shipping"&&!q.shippingSelection);return <article className={`profile-request-card ${request.queue?.imageUrl?"has-image":""}`} key={request.id}>
        {request.queue?.imageUrl&&<div className="profile-request-image"><Image src={request.queue.imageUrl} alt={title} fill sizes="160px"/></div>}
        <div className="profile-request-main"><div className="profile-request-top"><div><span>{request.requestCode}</span><h3>{title}</h3><small>Submitted {new Date(request.createdAt).toLocaleDateString()}</small></div><span className={`request-status quote-status-${q?.status||request.status}`}>{status}</span></div><p>{request.description}</p>
          <div className="profile-request-facts"><span><b>Quantity</b>{request.quantity}</span><span><b>Needed by</b>{request.neededBy||"Not specified"}</span><span><b>Queue position</b>{customer.showQueuePosition?(request.queue?.position?`#${request.queue.position}`:request.queue?"Complete / not active":"Not queued"):"Hidden"}</span><span><b>Estimated ready</b>{request.queue?.estimatedReadyDate||q?.estimatedReadyDate||"Pending"}</span></div>
          {q&&<section className="customer-quote-card"><div className="customer-quote-heading"><div><span className="eyebrow">QUOTE REVISION {q.revision}</span><h4>{quoteLabels[q.status]}</h4></div><strong>{awaitingShipping?`${money(q.totalCents)} subtotal`:money(q.totalCents)}</strong></div><div className="customer-quote-facts"><span><b>Base print</b>{money(q.basePriceCents)}</span>{q.assemblyFeeCents>0&&<span><b>Assembly labor</b>{money(q.assemblyFeeCents)}</span>}{q.localDeliveryFeeCents>0&&<span><b>Local delivery</b>{money(q.localDeliveryFeeCents)}</span>}{q.shippingSelection&&<span><b>Shipping</b>{money(q.shippingSelection.rateCents)}</span>}<span><b>Fulfillment</b>{fulfillmentLabel(q.fulfillmentMode)}</span><span><b>50% deposit</b>{awaitingShipping?"Calculated after shipping":money(q.depositCents)}</span><span><b>Remaining balance</b>{awaitingShipping?"Calculated after shipping":money(q.balanceCents)}</span><span><b>Material</b>{q.material}</span><span><b>Dimensions</b>{q.dimensions}</span></div><div className={`customer-assembly-callout mode-${q.assemblyMode}`}><strong>{assemblyLabel(q.assemblyMode)}</strong><span>{q.assemblyMode==="assembled"?`Assembly labor is included in your quote${q.assemblyFeeCents>0?` (${money(q.assemblyFeeCents)})`:""}. Your print will be delivered/shipped assembled.`:q.assemblyMode==="disassembled"?"Your print will arrive as separate pieces with an assembly guide. Final assembly may require super glue.":"This print does not require glued assembly."}</span></div>
            <details className="quote-terms"><summary>Review quote details & terms</summary><div><p><strong>Estimated ready:</strong> {q.estimatedReadyDate||"To be confirmed"}</p>{q.notes&&<p><strong>Owner notes:</strong> {q.notes}</p>}<p className="quote-terms-text">{q.terms}</p></div></details>
            {q.status==="sent"&&q.fulfillmentMode==="shipping"&&<CustomerShippingSelector quoteId={q.id} existing={q.shippingSelection} customerName={customer.displayName} onChanged={load} onMessage={setMessage}/>}
            {q.status==="sent"&&<div className="customer-quote-response-block">{!customer.emailVerified&&<div className="quote-verification-needed"><strong>Email verification required</strong><span>Verify your email before approving, declining, or countering this quote.</span><Link href="/profile/settings">Verify email</Link></div>}<div className="customer-quote-response-actions"><button className={`button button-small ${busyQuote===q.id?"is-loading":""}`} disabled={!customer.emailVerified||busyQuote===q.id||(q.fulfillmentMode==="shipping"&&!q.shippingSelection)} title={!customer.emailVerified?"Verify your email to approve this quote.":q.fulfillmentMode==="shipping"&&!q.shippingSelection?"Choose a live USPS, UPS, or FedEx shipping rate first.":undefined} onClick={()=>void approveQuote(q.id)} type="button">{busyQuote===q.id?<><span className="button-spinner" aria-hidden="true"/>Approving…</>:q.fulfillmentMode==="shipping"&&!q.shippingSelection?"Choose Shipping Before Approval":"Approve Quote & Terms"}</button><button className="button button-secondary button-small" disabled={!customer.emailVerified||busyQuote===q.id} title={!customer.emailVerified?"Verify your email to send a counter offer.":undefined} onClick={()=>setCounterQuoteId(counterQuoteId===q.id?"":q.id)} type="button">Counter Offer</button><button className="text-button danger-text" disabled={!customer.emailVerified||busyQuote===q.id} title={!customer.emailVerified?"Verify your email to decline this quote.":undefined} onClick={()=>void respondQuote(q.id,"decline")} type="button">Decline Quote</button></div></div>}
            {counterQuoteId===q.id&&q.status==="sent"&&<div className="customer-counter-form"><div><label><span>Your proposed total ($)</span><input inputMode="decimal" value={counterAmount} onChange={e=>setCounterAmount(e.target.value)} placeholder="75.00"/></label><label><span>What would you like changed?</span><textarea rows={3} value={counterMessage} onChange={e=>setCounterMessage(e.target.value)} placeholder="Explain the price, material, timing, or scope you want adjusted."/></label></div><button className="button button-small" disabled={busyQuote===q.id} type="button" onClick={()=>void respondQuote(q.id,"counter")}>Send Counter Offer</button></div>}
            {q.status==="approved"&&<button className={`button button-small ${busyQuote===q.id?"is-loading":""}`} disabled={!customer.emailVerified||busyQuote===q.id} onClick={()=>void payDeposit(q.id)} type="button">{busyQuote===q.id?<><span className="button-spinner" aria-hidden="true"/>Opening secure checkout…</>:`Pay ${money(q.depositCents)} Deposit Securely`}</button>}
            {q.status==="countered"&&<div className="quote-response-state">Your counter offer was sent. The owner can respond with a revised quote.</div>}{q.status==="declined"&&<div className="quote-response-state">You declined this quote. The owner may revise it or close the request.</div>}{q.status==="deposit-paid"&&<div className="quote-paid-badge">✓ Deposit received {q.depositPaidAt?new Date(q.depositPaidAt).toLocaleDateString():""}</div>}
            {q.history?.length>0&&<details className="customer-quote-history"><summary>Quote history ({q.history.length})</summary><div>{[...q.history].reverse().map(item=><article key={item.id}><div><strong>{item.summary}</strong><time>{new Date(item.createdAt).toLocaleString()}</time></div>{item.counterTotalCents&&<b>Counter: {money(item.counterTotalCents)}</b>}{item.message&&<p>{item.message}</p>}</article>)}</div></details>}
          </section>}
          {request.shipment?.trackingCode&&<section className="customer-shipment-card">
            <div className="customer-shipment-heading"><div><span className="eyebrow">SHIPMENT TRACKING</span><h4>{shipmentLabel(request.shipment.status)}</h4></div><span className={`shipment-status-badge shipment-${request.shipment.status}`}>{request.shipment.carrier} {request.shipment.service}</span></div>
            <div className="customer-shipment-facts"><span><b>Tracking number</b>{request.shipment.trackingCode}</span><span><b>Estimated delivery</b>{request.shipment.estimatedDeliveryDate||"Carrier estimate pending"}</span>{request.shipment.deliveredAt&&<span><b>Delivered</b>{new Date(request.shipment.deliveredAt).toLocaleString()}</span>}</div>
            {request.shipment.publicTrackingUrl&&<a className="button button-secondary button-small shipment-track-link" href={request.shipment.publicTrackingUrl} target="_blank" rel="noreferrer">Track with carrier ↗</a>}
            {request.shipment.statusDetail&&<p className="shipment-status-detail">{request.shipment.statusDetail.replaceAll("_"," ")}</p>}
            {request.shipment.trackingEvents?.length>0&&<details className="customer-tracking-history"><summary>Tracking history ({request.shipment.trackingEvents.length})</summary><div className="tracking-timeline">{[...request.shipment.trackingEvents].sort((a,b)=>(b.datetime||"").localeCompare(a.datetime||"")).map(event=><article key={event.id}><span className="tracking-dot"/><div><strong>{event.message||event.status.replaceAll("_"," ")||"Carrier update"}</strong><small>{event.datetime?new Date(event.datetime).toLocaleString():""}{trackingLocation(event)?` · ${trackingLocation(event)}`:""}</small></div></article>)}</div></details>}
          </section>}
          {request.queue?.publicNote&&<small className="profile-public-note">{request.queue.publicNote}</small>}
        </div>
      </article>;})}</div>}
    </section>
  </div>;
}
