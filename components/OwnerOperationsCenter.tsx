"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  OwnerAttentionItem,
  OwnerOperationsSnapshot,
  OwnerSearchRecord,
} from "@/lib/owner-operations-types";

type Notice = { kind: "success" | "error" | "warning"; text: string } | null;

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
  onNotice,
}: {
  onOpenRequest: (requestId: string) => void;
  onNotice: (notice: Notice) => void;
}) {
  const [snapshot, setSnapshot] = useState<OwnerOperationsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

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
    { key: "completed", label: "Completed", value: snapshot.counts.completed, detail: "Finished requests", tone: "neutral" },
  ];

  const health = [
    { key: "stripe", title: "Stripe", ...snapshot.integrations.stripe },
    { key: "easyPost", title: "EasyPost", ...snapshot.integrations.easyPost },
    { key: "backups", title: "Backups", ...snapshot.integrations.backups },
    { key: "failures", title: "Recent activity", ...snapshot.integrations.recentFailures },
  ];

  return <div className="owner-operations">
    <section className="operations-hero">
      <div>
        <p className="eyebrow">OPERATIONS CENTER</p>
        <h2>Everything that needs your attention.</h2>
        <p>Start here each day. Mesh Harbor is watching requests, quotes, deposits, production, final balances, shipping, backups, and integration health for you.</p>
      </div>
      <div className="operations-hero-actions">
        <span>Updated {new Date(snapshot.generatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
        <button className="button button-secondary button-small" type="button" onClick={() => void load()} disabled={loading}>{loading ? "Refreshing…" : "Refresh Dashboard"}</button>
      </div>
    </section>

    <section className="operations-kpi-grid" aria-label="Business summary">
      {kpis.map((item) => <article className={`operations-kpi-card tone-${item.tone}`} key={item.key}>
        <span>{item.label}</span>
        <strong>{item.value}</strong>
        <small>{item.detail}</small>
      </article>)}
    </section>

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
      </section>
    </div>
  </div>;
}
