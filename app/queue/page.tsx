import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getPublicQueue, readQueue } from "@/lib/queue-store";
import { readRequests } from "@/lib/request-store";
import { currentCustomer } from "@/lib/customer-auth";
import type { QueueStatus } from "@/lib/queue-types";
import { QueueAutoRefresh } from "@/components/QueueAutoRefresh";
import { QueueTrackScroller } from "@/components/QueueTrackScroller";

export const metadata: Metadata = { title: "Queue", description: "See the current 3D printing production queue and which project is printing now." };
export const dynamic = "force-dynamic";

const statusLabels: Record<QueueStatus, string> = { queued: "Queued", preparing: "Preparing", printing: "Printing now", finishing: "Finishing", ready: "Ready", "on-hold": "On hold", completed: "Completed" };
function formatDate(value: string) { if (!value) return "Estimate pending"; const [y,m,d]=value.split("-").map(Number); return new Intl.DateTimeFormat("en-US", { month:"short", day:"numeric", year:"numeric" }).format(new Date(Date.UTC(y,m-1,d,12))); }

export default async function QueuePage() {
  const [jobs, fullQueue, requests, customer] = await Promise.all([getPublicQueue(), readQueue(), readRequests(), currentCustomer()]);
  const productionCount = jobs.filter((job) => ["preparing", "printing", "finishing"].includes(job.status)).length;
  const readyCount = jobs.filter((job) => job.status === "ready").length;
  const activeFull = fullQueue.filter((job) => job.status !== "completed").sort((a,b) => (a.status === "printing" ? -1 : 0) - (b.status === "printing" ? -1 : 0) || a.sortOrder-b.sortOrder || a.createdAt.localeCompare(b.createdAt));
  let yourPosition: number | null = null;
  if (customer?.preferences.showQueuePosition) {
    const ownRequestIds = new Set(requests.filter((item) => item.customerAccountId === customer.id).map((item) => item.id));
    const index = activeFull.findIndex((job) => job.sourceRequestId && ownRequestIds.has(job.sourceRequestId));
    yourPosition = index >= 0 ? index + 1 : null;
  }

  return (
    <section className="section queue-page queue-page-direct">
      <div className="container">
        <div className="queue-visual-panel queue-primary-panel">
          <div className="queue-visual-heading queue-compact-heading">
            <div><p className="eyebrow">LIVE PRODUCTION QUEUE</p><h1>Queue</h1></div>
            <div className="queue-heading-meta"><span>Drag, swipe, or scroll left and right</span><QueueAutoRefresh /></div>
          </div>
          {jobs.length === 0 ? <div className="queue-empty"><strong>The queue is clear.</strong><span>There are no active accepted print jobs listed right now.</span></div> : (
            <QueueTrackScroller><div className="queue-track">{jobs.map((job,index) => {
              const isCurrent=index===0; const isActivelyWorked = isCurrent && ["preparing", "printing", "finishing"].includes(job.status); const stage = job.status === "printing" ? "Printing now" : job.status === "preparing" ? "Preparing / slicing" : job.status === "finishing" ? "Finishing / cleanup" : job.status === "ready" ? "Ready for pickup / shipping" : job.status === "on-hold" ? "On hold" : isCurrent ? "Next up" : `Queue #${index+1}`;
              return <article className={`queue-track-item ${isCurrent ? "is-current" : ""}`} key={job.publicCode}>
                <div className="queue-track-image"><Image src={job.imageUrl || "/sample-display.svg"} alt={job.publicTitle} fill sizes="210px" className="queue-track-photo" />{isCurrent && <span className="queue-current-badge">{isActivelyWorked ? "CURRENT" : "NEXT"}</span>}</div>
                <div className="queue-track-node-wrap" aria-hidden="true"><span className={`queue-track-node status-${job.status}`} /></div>
                <div className="queue-track-copy"><span className={`queue-status status-${job.status}`}>{statusLabels[job.status]}</span><strong>{stage}</strong><h3>{job.publicTitle}</h3><p>{job.publicCode} · Qty {job.quantity}</p><small>{formatDate(job.estimatedReadyDate)}</small>{job.publicNote && <em>{job.publicNote}</em>}</div>
              </article>;
            })}</div></QueueTrackScroller>
          )}
        </div>

        <div className="queue-summary-grid queue-summary-below">
          <article><span>Requests in queue</span><strong>{jobs.length}</strong><small>Accepted active production jobs</small></article>
          <article><span>Your position</span><strong>{customer ? (customer.preferences.showQueuePosition ? (yourPosition ? `#${yourPosition}` : "—") : "Hidden") : "Sign in"}</strong><small>{customer ? (customer.preferences.showQueuePosition ? (yourPosition ? "Your next active profile-linked job" : "No active profile-linked job") : "Enable queue position in Account Settings") : "Login to see your queue position"}</small></article>
          <article><span>In production</span><strong>{productionCount}</strong><small>Preparing, printing, or finishing</small></article>
          <article><span>Ready</span><strong>{readyCount}</strong><small>Ready for pickup or shipping</small></article>
        </div>

        <div className="queue-bottom-cta"><div><p className="eyebrow">YOUR REQUESTS</p><h2>{customer ? "Track every request from your profile." : "Want your own queue position?"}</h2><p>{customer ? "Your profile keeps request status, production position, and notifications together." : "Create a profile before submitting a custom request to track it here automatically."}</p></div><Link className="button" href={customer ? "/profile" : "/login"}>{customer ? "Open Profile" : "Login / Create Profile"}</Link></div>
      </div>
    </section>
  );
}
