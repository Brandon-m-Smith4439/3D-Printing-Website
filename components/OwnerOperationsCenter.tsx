"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  OwnerAttentionItem,
  OwnerOperationsSnapshot,
  OwnerSearchRecord,
} from "@/lib/owner-operations-types";

type Notice = { kind: "success" | "error" | "warning"; text: string } | null;

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
}

function percent(basisPoints: number) {
  return `${(basisPoints / 100).toFixed(1)}%`;
}

function ageLabel(hours: number) {
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function attentionLabel(item: OwnerAttentionItem) {
  return item.severity === "urgent" ? "Urgent" : item.severity === "action" ? "Needs action" : "Watch";
}

function searchMeta(item: OwnerSearchRecord) {
  return [
    item.customerName,
    item.queueCode ? `Queue ${item.queueCode}` : "",
    item.invoiceNumber ? `Invoice ${item.invoiceNumber}` : "",
    item.trackingCode ? `Tracking ${item.trackingCode}` : "",
  ].filter(Boolean).join(" • ");
}

export function OwnerOperationsCenter({
  onOpenRequest,
  onOpenPricing,
  onNotice,
}: {
  onOpenRequest: (requestId: string) => void;
  onOpenPricing: () => void;
  onNotice: (notice: Notice) => void;
}) {
  const [snapshot, setSnapshot] = useState<OwnerOperationsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [followUpBusy, setFollowUpBusy] = useState("");
  const [followUpPreview, setFollowUpPreview] = useState<{due:Array<{id:string;requestCode:string;type:string;blockedReason:string}>;upcoming:Array<{id:string;requestCode:string;type:string;blockedReason:string}>;blocked:Array<{id:string;requestCode:string;type:string;blockedReason:string}>}|null>(null);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/owner/operations", { cache: "no-store" });
      const result = await response.json() as { snapshot?: OwnerOperationsSnapshot; message?: string };
      if (!response.ok || !result.snapshot) throw new Error(result.message || "Could not load the Operations Center.");
      setSnapshot(result.snapshot);
    } catch (error) {
      onNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not load the Operations Center." });
    } finally {
      setLoading(false);
    }
  }

  async function previewFollowUps() {
    setFollowUpBusy("preview");
    try {
      const response = await fetch("/api/owner/follow-ups/preview", { method: "POST" });
      const result = await response.json() as { preview?: typeof followUpPreview; message?: string };
      if (!response.ok || !result.preview) throw new Error(result.message || "Could not preview customer follow-ups.");
      setFollowUpPreview(result.preview);
    } catch (error) { onNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not preview customer follow-ups." }); }
    finally { setFollowUpBusy(""); }
  }

  async function setFollowUpEnabled(enabled: boolean) {
    setFollowUpBusy("settings");
    try {
      const response = await fetch("/api/owner/follow-ups/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }) });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message || "Could not update customer follow-up automation.");
      onNotice({ kind: "success", text: result.message || "Customer follow-up automation updated." });
      await load();
    } catch (error) { onNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not update customer follow-up automation." }); }
    finally { setFollowUpBusy(""); }
  }

  useEffect(() => { void load(); }, []);

  const searchResults = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized && snapshot
      ? snapshot.search.filter((item) => item.haystack.includes(normalized)).slice(0, 12)
      : [];
  }, [query, snapshot]);

  if (loading && !snapshot) {
    return <section className="owner-panel operations-loading"><strong>Loading Operations Center…</strong></section>;
  }

  if (!snapshot) {
    return <section className="owner-panel operations-loading"><strong>Operations Center is temporarily unavailable.</strong><button className="button button-small" type="button" onClick={() => void load()}>Try Again</button></section>;
  }

  const kpis = [
    { key: "urgent", label: "Urgent", value: snapshot.counts.urgent, detail: "Needs immediate review", tone: snapshot.counts.urgent ? "urgent" : "good" },
    { key: "action", label: "Needs action", value: snapshot.counts.action, detail: "Owner action requested", tone: snapshot.counts.action ? "action" : "good" },
    { key: "watch", label: "Watching", value: snapshot.counts.watch, detail: "Keep an eye on these", tone: snapshot.counts.watch ? "watch" : "good" },
    { key: "new", label: "New requests", value: snapshot.counts.newRequests, detail: "Waiting for review", tone: snapshot.counts.newRequests ? "action" : "good" },
    { key: "production", label: "Active production", value: snapshot.counts.activeProduction, detail: "Jobs not completed", tone: "neutral" },
    { key: "balances", label: "Final balances", value: snapshot.counts.finalBalancesDue, detail: "Open Stripe invoices", tone: snapshot.counts.finalBalancesDue ? "watch" : "good" },
    { key: "followups", label: "Follow-ups due", value: snapshot.counts.followUpsDue, detail: "Customer reminders ready", tone: snapshot.counts.followUpsDue ? "action" : "good" },
    { key: "completed", label: "Completed", value: snapshot.counts.completed, detail: "Finished requests", tone: "neutral" },
  ];

  const health = [
    ...(snapshot.integrations.email?[{key:"email",title:"Customer email",...snapshot.integrations.email}]:[]),
    ...(snapshot.integrations.uploads?[{key:"uploads",title:"Upload scanner",...snapshot.integrations.uploads}]:[]),
    ...(snapshot.integrations.botProtection?[{key:"bot",title:"Bot protection",...snapshot.integrations.botProtection}]:[]),
    { key: "stripe", title: "Stripe", ...snapshot.integrations.stripe },
    { key: "easyPost", title: "EasyPost", ...snapshot.integrations.easyPost },
    { key: "backups", title: "Backups", ...snapshot.integrations.backups },
    { key: "failures", title: "Recent activity", ...snapshot.integrations.recentFailures },
  ];

  return <div className="owner-operations">
    <section className="operations-hero">
      <div>
        <p className="eyebrow">OPERATIONS CENTER</p>
        <h2>Daily overview</h2>
        <p>Quotes, production, payments, and service health in one place.</p>
      </div>
      <div className="operations-hero-actions">
        <span>Updated {new Date(snapshot.generatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
        <button className="button button-secondary button-small" type="button" onClick={() => void load()} disabled={loading}>{loading ? "Refreshing…" : "Refresh Dashboard"}</button>
      </div>
    </section>

    <section className="owner-panel operations-financials"><div className="operations-section-heading"><div><p className="eyebrow">PROFIT VS COST</p><h3>Your business at a glance</h3></div><button className="button button-secondary button-small" type="button" onClick={onOpenPricing}>Pricing details →</button></div><div className="operations-financial-grid">{([{label:"Active quotes · expected",value:snapshot.profitability.active},{label:"Completed · last 30 days",value:snapshot.profitability.completed}]).map(group=><article key={group.label}><strong>{group.label}</strong><div><span>Revenue<b>{money(group.value.revenueCents)}</b></span><span>Direct costs<b>{money(group.value.directCostCents)}</b></span><span className={group.value.contributionProfitCents<0?"is-negative":"profit-value"}>Contribution profit<b>{money(group.value.contributionProfitCents)}</b></span></div><small>{percent(group.value.contributionMarginBasisPoints)} margin · {group.value.uncostedCount} missing complete costing</small><div className="operations-cost-bar" aria-label="Direct cost share of revenue"><i style={{width:`${group.value.revenueCents?Math.max(0,Math.min(100,group.value.directCostCents/group.value.revenueCents*100)):0}%`}}/></div></article>)}</div><p>Active figures are estimates. Completed figures require actual cost closeout. Contribution excludes taxes and business expenses outside the entered direct costs.</p></section>

    <section className="operations-kpi-grid" aria-label="Business summary">
      {kpis.map((item) => <article className={`operations-kpi-card tone-${item.tone}`} key={item.key}>
        <span>{item.label}</span>
        <strong>{item.value}</strong>
        <small>{item.detail}</small>
      </article>)}
    </section>

    {snapshot.launchReadiness&&<details className="owner-panel launch-readiness-panel"><summary>Launch checklist · {snapshot.launchReadiness.blockedCount} blocked · {snapshot.launchReadiness.attentionCount} need attention</summary>
      <div className="launch-readiness-heading">
        <div><p className="eyebrow">LAUNCH READINESS</p><h3>{snapshot.launchReadiness.operatingMode==="live-ready"?"Production commerce checks are green.":"Guarded launch checklist"}</h3><p>{snapshot.launchReadiness.operatingMode==="live-ready"?"The configured payment and shipping integrations report production readiness.":"The website can continue operating in its current guarded/test posture while remaining live-commerce items are resolved deliberately."}</p></div>
        <div className={`launch-readiness-score mode-${snapshot.launchReadiness.operatingMode}`}><strong>{snapshot.launchReadiness.readyCount}/{snapshot.launchReadiness.items.length}</strong><span>checks ready</span><small>{snapshot.launchReadiness.blockedCount} blocked · {snapshot.launchReadiness.attentionCount} attention</small></div>
      </div>
      <div className="launch-readiness-grid">
        {snapshot.launchReadiness.items.map(item=><article className={`launch-readiness-item status-${item.status}`} key={item.id}>
          <span>{item.status==="ready"?"✓":item.status==="blocked"?"!":"•"}</span>
          <div><strong>{item.title}</strong><small>{item.category}</small><p>{item.detail}</p></div>
        </article>)}
      </div>
      <div className="launch-readiness-footer"><strong>{snapshot.launchReadiness.liveCommerceReady?"Live-commerce readiness reported":"Live-commerce activation remains intentionally guarded"}</strong><span>No launch checklist item changes Stripe or EasyPost live mode by itself.</span></div>
    </details>}

    <section className="operations-search owner-panel">
      <div className="operations-section-heading">
        <div><p className="eyebrow">GLOBAL SEARCH</p><h3>Find any customer or job</h3></div>
        <span>Request • customer • queue • invoice • tracking</span>
      </div>
      <label className="operations-search-field">
        <span className="sr-only">Search all owner records</span>
        <input
          aria-label="Search all owner records"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search request code, customer, email, phone, queue code, invoice, or tracking…"
          autoComplete="off"
        />
        {query && <button className="text-button" type="button" onClick={() => setQuery("")}>Clear</button>}
      </label>
      {query.trim() && <div className="operations-search-results">
        {searchResults.length === 0
          ? <div className="queue-empty compact"><strong>No matching owner records.</strong><span>Try a request number, name, email, queue code, invoice number, or tracking number.</span></div>
          : searchResults.map((item) => item.requestId
            ? <button key={item.id} type="button" onClick={() => onOpenRequest(item.requestId)}>
                <span><strong>{item.requestCode || item.queueCode}</strong><small>{searchMeta(item)}</small></span>
                <b>Open request →</b>
              </button>
            : <div className="operations-search-static" key={item.id}><span><strong>{item.queueCode}</strong><small>{searchMeta(item)}</small></span><b>Manual queue job</b></div>)}
      </div>}
    </section>

    <div className="operations-layout">
      <section className="owner-panel operations-attention-panel">
        <div className="operations-section-heading">
          <div><p className="eyebrow">NEEDS ATTENTION</p><h3>What to work on next</h3></div>
          <span>{snapshot.attention.length} item{snapshot.attention.length === 1 ? "" : "s"}</span>
        </div>
        <div className="operations-attention-list">
          {snapshot.attention.length === 0
            ? <div className="operations-clear-state"><strong>Nothing needs attention right now.</strong><span>New requests, payment issues, overdue work, shipping exceptions, and stale backups will appear here automatically.</span></div>
            : snapshot.attention.map((item) => item.requestId
              ? <button className={`operations-attention-item severity-${item.severity}`} type="button" key={item.id} onClick={() => onOpenRequest(item.requestId)}>
                  <span className="operations-attention-marker" aria-hidden="true"/>
                  <span className="operations-attention-copy"><span><b>{attentionLabel(item)}</b><em>{item.category}</em></span><strong>{item.title}</strong><small>{item.requestCode ? `${item.requestCode} • ` : ""}{item.detail}</small></span>
                  <span className="operations-attention-age">{ageLabel(item.ageHours)}<b>Open →</b></span>
                </button>
              : <article className={`operations-attention-item severity-${item.severity}`} key={item.id}>
                  <span className="operations-attention-marker" aria-hidden="true"/>
                  <span className="operations-attention-copy"><span><b>{attentionLabel(item)}</b><em>{item.category}</em></span><strong>{item.title}</strong><small>{item.detail}</small></span>
                  <span className="operations-attention-age">{ageLabel(item.ageHours)}</span>
                </article>)}
        </div>
      </section>

      <section className="owner-panel operations-health-panel">
        <div className="operations-section-heading">
          <div><p className="eyebrow">SYSTEM HEALTH</p><h3>Business services</h3></div>
        </div>
        <div className="operations-health-grid">
          {health.map((item) => <article className={`operations-health-card health-${item.tone}`} key={item.key}>
            <span>{item.title}</span>
            <strong>{item.label}</strong>
            <small>{item.detail}</small>
          </article>)}
        </div>
        <article className="operations-followup-card">
          <div className="operations-followup-heading"><div><span>CUSTOMER FOLLOW-UPS</span><strong>{snapshot.followUps.ownerEnabled ? "Automation enabled" : "Automation paused"}</strong></div><em className={snapshot.followUps.deploymentEnabled ? "is-on" : "is-off"}>{snapshot.followUps.deploymentEnabled ? "Deployment gate on" : "Deployment gate off"}</em></div>
          <p>{snapshot.followUps.due} due now • {snapshot.followUps.sentLast7Days} sent in 7 days • {snapshot.followUps.failed} failed</p>
          <div className="operations-followup-actions"><button className="button button-secondary button-small" type="button" disabled={Boolean(followUpBusy)} onClick={() => void previewFollowUps()}>{followUpBusy === "preview" ? "Previewing…" : "Preview Follow-ups"}</button><button className="button button-secondary button-small" type="button" disabled={Boolean(followUpBusy) || !snapshot.followUps.deploymentEnabled} onClick={() => void setFollowUpEnabled(!snapshot.followUps.ownerEnabled)}>{followUpBusy === "settings" ? "Saving…" : snapshot.followUps.ownerEnabled ? "Pause Automation" : "Resume Automation"}</button></div>
          {followUpPreview && <div className="operations-followup-preview">
            {(["due","upcoming","blocked"] as const).map((group) => <div key={group}><b>{group === "due" ? "Due now" : group === "upcoming" ? "Upcoming" : "Blocked"}</b>{followUpPreview[group].length ? followUpPreview[group].slice(0,8).map((item) => <span key={item.id}><strong>{item.requestCode}</strong> {item.type.replaceAll("-"," ")}{item.blockedReason ? ` — ${item.blockedReason}` : ""}</span>) : <span>None</span>}</div>)}
          </div>}
        </article>
      </section>
    </div>
  </div>;
}
