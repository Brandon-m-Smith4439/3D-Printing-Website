"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  OwnerAttentionItem,
  OwnerOperationsSnapshot,
  OwnerSearchRecord,
} from "@/lib/owner-operations-types";

type Notice = { kind: "success" | "error" | "warning"; text: string } | null;

function money(cents: number) { return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(cents/100); }
function percent(basisPoints: number) { return `${(basisPoints/100).toFixed(1)}%`; }


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

  const actionableAttention = snapshot.attention.filter((item) => item.severity === "urgent" || item.severity === "action");
  const kpis = [
    { key: "attention", label: "Needs attention", value: snapshot.counts.urgent + snapshot.counts.action, detail: "Owner action requested", tone: snapshot.counts.urgent ? "urgent" : snapshot.counts.action ? "action" : "good" },
    { key: "new", label: "New requests", value: snapshot.counts.newRequests, detail: "Waiting for review", tone: snapshot.counts.newRequests ? "action" : "good" },
    { key: "production", label: "Active production", value: snapshot.counts.activeProduction, detail: "Jobs currently in progress", tone: "neutral" },
    { key: "balances", label: "Final balances", value: snapshot.counts.finalBalancesDue, detail: "Payment needed before handoff", tone: snapshot.counts.finalBalancesDue ? "watch" : "good" },
  ];



  return <div className="owner-operations">
    <section className="operations-hero">
      <div>
        <p className="eyebrow">OPERATIONS CENTER</p>
        <h2>Daily overview</h2>
        <p>See what needs your attention today, then jump into Production, Pricing, or Security for the details.</p>
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

    <section className="owner-panel operations-financials">
      <div className="operations-section-heading"><div><p className="eyebrow">COST VS PROFIT</p><h3>Current profitability</h3></div><span>Active work + completed last 30 days</span></div>
      <div className="operations-financial-grid">
        <article><strong>Active / quoted work</strong><div><span>Revenue<b>{money(snapshot.profitability.active.revenueCents)}</b></span><span>Current cost<b>{money(snapshot.profitability.active.directCostCents)}</b></span><span className={snapshot.profitability.active.contributionProfitCents<0?"is-negative":"profit-value"}>Projected profit<b>{money(snapshot.profitability.active.contributionProfitCents)}</b></span><span>Margin<b>{percent(snapshot.profitability.active.contributionMarginBasisPoints)}</b></span></div><small>{snapshot.profitability.active.uncostedCount} active request{snapshot.profitability.active.uncostedCount===1?"":"s"} still need costing.</small></article>
        <article><strong>Completed · 30 days</strong><div><span>Revenue<b>{money(snapshot.profitability.completed.revenueCents)}</b></span><span>Direct cost<b>{money(snapshot.profitability.completed.directCostCents)}</b></span><span className={snapshot.profitability.completed.contributionProfitCents<0?"is-negative":"profit-value"}>Profit<b>{money(snapshot.profitability.completed.contributionProfitCents)}</b></span><span>Margin<b>{percent(snapshot.profitability.completed.contributionMarginBasisPoints)}</b></span></div><small>{snapshot.profitability.completed.completedCount} completed request{snapshot.profitability.completed.completedCount===1?"":"s"} in this 30-day view.</small></article>
      </div>
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

    <div className="operations-layout operations-layout-single">
      <section className="owner-panel operations-attention-panel">
        <div className="operations-section-heading">
          <div><p className="eyebrow">NEEDS ATTENTION</p><h3>Orders and actions to handle</h3></div>
          <span>{actionableAttention.length} item{actionableAttention.length === 1 ? "" : "s"}</span>
        </div>
        <div className="operations-attention-list">
          {actionableAttention.length === 0
            ? <div className="operations-clear-state"><strong>No owner action is required right now.</strong><span>New requests, counter offers, deposits, overdue production, final balances, and shipping problems will appear here when you need to act.</span></div>
            : actionableAttention.map((item) => item.requestId
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
    </div>
  </div>;
}
