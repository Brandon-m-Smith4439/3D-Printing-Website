"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { CustomerNotification } from "@/lib/customer-types";
import type { QueueStatus } from "@/lib/queue-types";
import type { RequestStatus } from "@/lib/request-types";
import type { QuoteStatus } from "@/lib/quote-types";

type ProfileQuote = {
  id:string; revision:number; status:QuoteStatus; totalCents:number; depositCents:number; balanceCents:number; currency:"usd";
  material:string; dimensions:string; estimatedReadyDate:string; notes:string; terms:string; sentAt:string; approvedAt:string; depositPaidAt:string;
};
type ProfileRequest = {
  id: string; requestCode: string; status: RequestStatus; projectType: string; quantity: number; neededBy: string; description: string; createdAt: string;
  quote: ProfileQuote | null;
  queue: null | { publicCode: string; publicTitle: string; status: QueueStatus; position: number | null; estimatedReadyDate: string; publicNote: string; imageUrl: string };
};
type Props = { customer: { displayName: string; email: string; emailVerified: boolean; showQueuePosition: boolean } };
const queueLabels: Record<QueueStatus, string> = { queued: "Queued", preparing: "Preparing / slicing", printing: "Printing now", finishing: "Finishing / cleanup", ready: "Ready", "on-hold": "On hold", completed: "Completed" };
const requestLabels: Record<RequestStatus, string> = { new: "New", reviewing: "Reviewing", quoted: "Quote ready", accepted: "Quote approved", "deposit-paid": "Deposit paid", declined: "Declined", queued: "In queue", completed: "Completed" };
function money(cents:number){return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(cents/100);}

export function ProfileDashboard({ customer }: Props) {
  const router = useRouter(); const search=useSearchParams();
  const [requests, setRequests] = useState<ProfileRequest[]>([]); const [notifications, setNotifications] = useState<CustomerNotification[]>([]);
  const [loading, setLoading] = useState(true); const [busyQuote,setBusyQuote]=useState(""); const [message,setMessage]=useState("");

  async function load() {
    const response = await fetch("/api/account/requests", { cache: "no-store" });
    if (response.status === 401) { router.push("/login"); return; }
    const result = await response.json() as { requests?: ProfileRequest[]; notifications?: CustomerNotification[] };
    setRequests(result.requests || []); setNotifications(result.notifications || []); setLoading(false);
  }
  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 30_000); return () => window.clearInterval(timer); }, []);
  useEffect(()=>{const payment=search.get("payment");if(payment==="success")setMessage("Deposit payment completed. It may take a few seconds for Stripe to confirm it.");if(payment==="cancelled")setMessage("Deposit checkout was cancelled. Your quote is still available.");if(payment==="development")setMessage("Development mode: the deposit was simulated as paid; no real card was charged.");},[search]);

  async function markRead() { await fetch("/api/account/notifications/read", { method: "POST" }); await load(); router.refresh(); }
  async function approveQuote(quoteId:string){setBusyQuote(quoteId);setMessage("");try{const r=await fetch(`/api/account/quotes/${quoteId}/approve`,{method:"POST"});const j=await r.json() as {message?:string};if(!r.ok)throw new Error(j.message||"Could not approve quote.");setMessage(j.message||"Quote approved.");await load();}catch(e){setMessage(e instanceof Error?e.message:"Could not approve quote.");}finally{setBusyQuote("");}}
  async function payDeposit(quoteId:string){setBusyQuote(quoteId);setMessage("");try{const r=await fetch(`/api/account/quotes/${quoteId}/checkout`,{method:"POST"});const j=await r.json() as {url?:string;message?:string};if(!r.ok||!j.url)throw new Error(j.message||"Could not open secure checkout.");window.location.href=j.url;}catch(e){setMessage(e instanceof Error?e.message:"Could not open secure checkout.");setBusyQuote("");}}

  return <div className="profile-dashboard">
    <div className="profile-header-card"><div><p className="eyebrow">YOUR PROFILE</p><h1>{customer.displayName}</h1><p>{customer.email} {customer.emailVerified ? <span className="verified-inline">Verified</span> : <span className="unverified-inline">Not verified</span>}</p></div><div className="profile-header-actions"><Link className="button button-secondary button-small" href="/profile/settings">Settings</Link><Link className="button button-small" href="/custom-request">New Request</Link></div></div>
    {!customer.emailVerified && <div className="profile-verification-callout"><div><strong>Verify your email to approve quotes and unlock secure account changes.</strong><span>Quote acceptance, deposit payment, password changes, and email changes require a verified account.</span></div><Link className="button button-small" href="/profile/settings">Verify Email</Link></div>}
    {message&&<div className="settings-notice info"><span>{message}</span></div>}

    <section className="profile-section" id="notifications"><div className="owner-panel-heading"><div><p className="eyebrow">STATUS UPDATES</p><h2>Notifications</h2></div>{notifications.some((item) => !item.readAt) && <button className="text-button" type="button" onClick={() => void markRead()}>Mark all read</button>}</div>
      {notifications.length === 0 ? <div className="queue-empty compact"><strong>No notifications yet.</strong><span>Status changes will appear here.</span></div> : <div className="profile-notifications">{notifications.slice(0, 12).map((item) => <article className={item.readAt ? "" : "is-unread"} key={item.id}><span className="notification-dot" /><div><strong>{item.requestCode}</strong><p>{item.message}</p><small>{new Date(item.createdAt).toLocaleString()}</small></div></article>)}</div>}
    </section>

    <section className="profile-section" id="requests"><div className="owner-panel-heading"><div><p className="eyebrow">YOUR REQUESTS</p><h2>Requests, quotes & queue status</h2></div><button className="text-button" type="button" onClick={() => void load()}>Refresh</button></div>
      {loading ? <div className="owner-loading">Loading your requests…</div> : requests.length === 0 ? <div className="queue-empty"><strong>No profile-linked requests yet.</strong><span>Sign in before submitting a custom request and it will appear here automatically.</span></div> : <div className="profile-request-list">{requests.map((request) => {
        const title=request.queue?.publicTitle||"Custom 3D print request";const status=request.queue?queueLabels[request.queue.status]:requestLabels[request.status];const q=request.quote;
        return <article className={`profile-request-card ${request.queue?.imageUrl?"has-image":""}`} key={request.id}>
          {request.queue?.imageUrl&&<div className="profile-request-image"><Image src={request.queue.imageUrl} alt={title} fill sizes="160px"/></div>}
          <div className="profile-request-main"><div className="profile-request-top"><div><span>{request.requestCode}</span><h3>{title}</h3><small>Submitted {new Date(request.createdAt).toLocaleDateString()}</small></div><span className={`request-status request-${request.status}`}>{status}</span></div>
            <p>{request.description}</p>
            <div className="profile-request-facts"><span><b>Quantity</b>{request.quantity}</span><span><b>Needed by</b>{request.neededBy||"Not specified"}</span><span><b>Queue position</b>{customer.showQueuePosition?(request.queue?.position?`#${request.queue.position}`:request.queue?"Complete / not active":"Not queued"):"Hidden"}</span><span><b>Estimated ready</b>{request.queue?.estimatedReadyDate||q?.estimatedReadyDate||"Pending"}</span></div>
            {q&&<section className="customer-quote-card"><div className="customer-quote-heading"><div><span className="eyebrow">QUOTE REVISION {q.revision}</span><h4>{q.status==="sent"?"Ready for your approval":q.status==="approved"?"Approved — deposit due":q.status==="deposit-paid"?"Deposit received":"Quote"}</h4></div><strong>{money(q.totalCents)}</strong></div>
              <div className="customer-quote-facts"><span><b>50% deposit</b>{money(q.depositCents)}</span><span><b>Remaining balance</b>{money(q.balanceCents)}</span><span><b>Material</b>{q.material}</span><span><b>Dimensions</b>{q.dimensions}</span></div>
              <details className="quote-terms"><summary>Review quote details & terms</summary><div><p><strong>Estimated ready:</strong> {q.estimatedReadyDate||"To be confirmed"}</p>{q.notes&&<p><strong>Owner notes:</strong> {q.notes}</p>}<p className="quote-terms-text">{q.terms}</p></div></details>
              {q.status==="sent"&&<button className="button button-small" disabled={!customer.emailVerified||busyQuote===q.id} onClick={()=>void approveQuote(q.id)} type="button">{busyQuote===q.id?"Working…":"Approve Quote & Terms"}</button>}
              {q.status==="approved"&&<button className="button button-small" disabled={!customer.emailVerified||busyQuote===q.id} onClick={()=>void payDeposit(q.id)} type="button">{busyQuote===q.id?"Opening secure checkout…":`Pay ${money(q.depositCents)} Deposit Securely`}</button>}
              {q.status==="deposit-paid"&&<div className="quote-paid-badge">✓ Deposit received {q.depositPaidAt?new Date(q.depositPaidAt).toLocaleDateString():""}</div>}
            </section>}
            {request.queue?.publicNote&&<small className="profile-public-note">{request.queue.publicNote}</small>}
          </div>
        </article>;
      })}</div>}
    </section>
  </div>;
}
