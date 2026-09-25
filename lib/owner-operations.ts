import "server-only";
import { quoteDepositOutstandingCents, quoteDepositSatisfied } from "@/lib/quote-types";
import { easyPostReadinessPresentation } from "@/lib/easypost-mode";
import type {
  OwnerAttentionItem,
  OwnerAttentionSeverity,
  OwnerIntegrationHealth,
  OwnerOperationsInput,
  OwnerOperationsSnapshot,
  OwnerSearchRecord,
} from "@/lib/owner-operations-types";

const HOUR_MS = 60 * 60 * 1000;
const BUSINESS_TIME_ZONE = (process.env.BUSINESS_TIME_ZONE || "America/New_York").trim() || "America/New_York";

function businessDateKey(date: Date) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: BUSINESS_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;
    if (year && month && day) return `${year}-${month}-${day}`;
  } catch {
    // Fall back to UTC if an invalid deployment timezone is supplied.
  }
  return date.toISOString().slice(0, 10);
}

function dateMs(value: string | undefined | null) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function ageHours(value: string | undefined | null, nowMs: number) {
  const created = dateMs(value);
  return created ? Math.max(0, Math.floor((nowMs - created) / HOUR_MS)) : 0;
}

function latestBy<T>(items: T[], getDate: (item: T) => string) {
  return [...items].sort((a, b) => dateMs(getDate(b)) - dateMs(getDate(a)))[0] || null;
}

function addAttention(
  target: OwnerAttentionItem[],
  nowMs: number,
  input: Omit<OwnerAttentionItem, "ageHours">,
) {
  if (target.some((item) => item.id === input.id)) return;
  target.push({ ...input, ageHours: ageHours(input.createdAt, nowMs) });
}

function severityRank(value: OwnerAttentionSeverity) {
  return value === "urgent" ? 0 : value === "action" ? 1 : 2;
}

function buildIntegrationHealth(input: OwnerOperationsInput, nowMs: number): OwnerIntegrationHealth {
  const stripe = !input.stripe.keyConfigured
    ? { tone: "warning" as const, label: "Stripe not configured", detail: "Payment setup is incomplete." }
    : input.stripe.mode === "live" && input.stripe.productionReady
      ? { tone: "good" as const, label: "Stripe live", detail: "Live payments, HTTPS, and webhook signing are configured." }
      : input.stripe.mode === "live"
        ? { tone: "error" as const, label: "Stripe live needs attention", detail: "A live key is present, but the production payment checklist is incomplete." }
        : input.stripe.webhookConfigured
          ? { tone: "warning" as const, label: "Stripe test mode", detail: "Sandbox payments and invoicing are configured; live mode is intentionally off." }
          : { tone: "warning" as const, label: "Stripe test setup incomplete", detail: "A test key is configured, but webhook signing still needs attention." };

  const easyPost = easyPostReadinessPresentation(input.shipping.readiness);

  const latestBackup = latestBy(input.backups, (item) => item.createdAt);
  const backupAge = latestBackup ? ageHours(latestBackup.createdAt, nowMs) : Number.POSITIVE_INFINITY;
  const backups = !latestBackup
    ? { tone: "warning" as const, label: "No backup found", detail: "Create a database and private-file snapshot.", latestAt: "" }
    : backupAge > 72
      ? { tone: "error" as const, label: "Backup is stale", detail: `Latest backup is ${backupAge} hours old.`, latestAt: latestBackup.createdAt }
      : backupAge > 36
        ? { tone: "warning" as const, label: "Backup due soon", detail: `Latest backup is ${backupAge} hours old.`, latestAt: latestBackup.createdAt }
        : { tone: "good" as const, label: "Backups current", detail: `Latest snapshot is ${backupAge} hours old.`, latestAt: latestBackup.createdAt };

  const recentFailures = input.audit.filter((entry) => {
    if (ageHours(entry.createdAt, nowMs) > 72) return false;
    return /fail|error/i.test(`${entry.action} ${entry.summary}`);
  });

  return {
    stripe,
    easyPost,
    backups,
    recentFailures: recentFailures.length
      ? { tone: "warning", label: `${recentFailures.length} recent failure event${recentFailures.length === 1 ? "" : "s"}`, detail: "Review the audit log for failed business or integration actions." }
      : { tone: "good", label: "No recent failures", detail: "No failed audit actions were recorded in the last 72 hours." },
  };
}

export function buildOwnerOperationsSnapshot(input: OwnerOperationsInput, now = new Date()): OwnerOperationsSnapshot {
  const nowMs = now.getTime();
  const today = businessDateKey(now);
  const attention: OwnerAttentionItem[] = [];

  const quoteByRequest = new Map<string, OwnerOperationsInput["quotes"][number]>();
  for (const quote of input.quotes) {
    if (quote.status === "void") continue;
    const current = quoteByRequest.get(quote.requestId);
    if (!current || dateMs(quote.updatedAt) >= dateMs(current.updatedAt)) quoteByRequest.set(quote.requestId, quote);
  }

  const jobById = new Map(input.queue.map((job) => [job.id, job] as const));
  const jobByRequest = new Map<string, OwnerOperationsInput["queue"][number]>();
  for (const request of input.requests) {
    const pointed = request.queueJobId ? jobById.get(request.queueJobId) : null;
    if (pointed) {
      jobByRequest.set(request.id, pointed);
      continue;
    }
    const fallback = input.queue
      .filter((job) => job.sourceRequestId === request.id)
      .sort((a, b) => dateMs(b.createdAt) - dateMs(a.createdAt))[0];
    if (fallback) jobByRequest.set(request.id, fallback);
  }

  const invoiceByRequest = new Map<string, OwnerOperationsInput["invoices"][number]>();
  for (const invoice of input.invoices) {
    const current = invoiceByRequest.get(invoice.requestId);
    if (
      !current
      || dateMs(invoice.createdAt) > dateMs(current.createdAt)
      || (dateMs(invoice.createdAt) === dateMs(current.createdAt) && invoice.quoteRevision > current.quoteRevision)
    ) {
      invoiceByRequest.set(invoice.requestId, invoice);
    }
  }

  const shipmentByRequest = new Map<string, OwnerOperationsInput["shipments"][number]>();
  for (const shipment of input.shipments) {
    const current = shipmentByRequest.get(shipment.requestId);
    if (!current || dateMs(shipment.updatedAt) >= dateMs(current.updatedAt)) shipmentByRequest.set(shipment.requestId, shipment);
  }

  for (const request of input.requests) {
    const quote = quoteByRequest.get(request.id) || null;
    const job = jobByRequest.get(request.id) || null;
    const invoice = invoiceByRequest.get(request.id) || null;
    const shipment = shipmentByRequest.get(request.id) || null;
    const workflowActive = request.status !== "completed" && request.status !== "declined";

    if (request.status === "new") {
      addAttention(attention, nowMs, {
        id: `request:${request.id}:new`,
        severity: "action",
        category: "request",
        title: "New custom request",
        detail: `${request.name || "Customer"} is waiting for the first owner review.`,
        requestId: request.id,
        requestCode: request.requestCode,
        createdAt: request.createdAt,
      });
    }

    if (workflowActive && quote && (quote.status === "countered" || quote.status === "declined")) {
      addAttention(attention, nowMs, {
        id: `quote:${request.id}:${quote.status}`,
        severity: "action",
        category: "quote",
        title: quote.status === "countered" ? "Counter offer needs review" : "Customer declined the quote",
        detail: quote.status === "countered" ? "Review the customer response and revise the quote if appropriate." : "Decide whether to revise, follow up, or close the request.",
        requestId: request.id,
        requestCode: request.requestCode,
        createdAt: quote.updatedAt || quote.sentAt || request.updatedAt,
      });
    }

    if (workflowActive && quote?.status === "sent" && ageHours(quote.sentAt, nowMs) >= 72) {
      addAttention(attention, nowMs, {
        id: `quote:${request.id}:waiting-72h`,
        severity: "watch",
        category: "quote",
        title: "Quote waiting on customer",
        detail: "The sent quote has had no customer response for at least 72 hours.",
        requestId: request.id,
        requestCode: request.requestCode,
        createdAt: quote.sentAt || quote.updatedAt,
      });
    }

    if (workflowActive && quote?.status === "approved" && quoteDepositOutstandingCents(quote) > 0) {
      addAttention(attention, nowMs, {
        id: `deposit:${request.id}:outstanding`,
        severity: "action",
        category: "deposit",
        title: "Approved quote is waiting on deposit",
        detail: `Remaining required deposit: ${(quoteDepositOutstandingCents(quote) / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}.`,
        requestId: request.id,
        requestCode: request.requestCode,
        createdAt: quote.approvedAt || quote.updatedAt,
      });
    }

    if (workflowActive && quote?.status === "deposit-paid" && quoteDepositSatisfied(quote) && !job) {
      addAttention(attention, nowMs, {
        id: `deposit:${request.id}:not-queued`,
        severity: "action",
        category: "deposit",
        title: "Deposit paid — not in production",
        detail: "The current deposit requirement is satisfied, but this request has not been added to the production queue.",
        requestId: request.id,
        requestCode: request.requestCode,
        createdAt: quote.depositPaidAt || quote.updatedAt,
      });
    }

    if (workflowActive && job && !["ready", "completed"].includes(job.status) && job.estimatedReadyDate && job.estimatedReadyDate < today) {
      addAttention(attention, nowMs, {
        id: `production:${request.id}:overdue`,
        severity: "urgent",
        category: "production",
        title: "Production date is overdue",
        detail: `${job.publicCode} was estimated ready ${job.estimatedReadyDate} and is still ${job.status.replaceAll("-", " ")}.`,
        requestId: request.id,
        requestCode: request.requestCode,
        createdAt: job.updatedAt || job.createdAt,
      });
    }

    if (job?.status === "ready" && workflowActive) {
      if (!invoice) {
        addAttention(attention, nowMs, {
          id: `invoice:${request.id}:missing`,
          severity: "action",
          category: "invoice",
          title: "Ready order needs final invoice",
          detail: "Production is Ready, but no final-balance invoice is recorded.",
          requestId: request.id,
          requestCode: request.requestCode,
          createdAt: job.updatedAt || job.createdAt,
        });
      } else if (invoice.status === "open" && invoice.amountRemainingCents > 0) {
        addAttention(attention, nowMs, {
          id: `invoice:${request.id}:open`,
          severity: "action",
          category: "invoice",
          title: "Ready order is waiting on final payment",
          detail: `Remaining balance: ${(invoice.amountRemainingCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}.`,
          requestId: request.id,
          requestCode: request.requestCode,
          createdAt: invoice.sentAt || invoice.createdAt,
        });
      }
    }

    if (invoice && workflowActive && (invoice.paymentFailedAt || invoice.status === "uncollectible" || invoice.status === "void")) {
      addAttention(attention, nowMs, {
        id: `invoice:${request.id}:failed`,
        severity: "urgent",
        category: "invoice",
        title: invoice.paymentFailedAt ? "Final payment attempt failed" : "Final invoice needs owner review",
        detail: invoice.paymentFailedAt
          ? "Stripe reported a failed payment attempt on the final balance."
          : `The final invoice is ${invoice.status}; review it before fulfillment.`,
        requestId: request.id,
        requestCode: request.requestCode,
        createdAt: invoice.paymentFailedAt || invoice.updatedAt || invoice.createdAt,
      });
    }

    if (workflowActive && invoice?.status === "open" && invoice.amountRemainingCents > 0 && invoice.dueDate && invoice.dueDate < today) {
      addAttention(attention, nowMs, {
        id: `invoice:${request.id}:overdue`,
        severity: "watch",
        category: "invoice",
        title: "Final balance invoice is past due",
        detail: "The Stripe invoice due date has passed and a balance remains.",
        requestId: request.id,
        requestCode: request.requestCode,
        createdAt: invoice.dueDate,
      });
    }

    if (shipment && ["failure", "return_to_sender", "review_required"].includes(shipment.status)) {
      addAttention(attention, nowMs, {
        id: `shipping:${request.id}:${shipment.status}`,
        severity: "urgent",
        category: "shipping",
        title: shipment.status === "review_required"
          ? "Shipping rate needs owner review"
          : shipment.status === "return_to_sender"
            ? "Shipment is returning to sender"
            : "Carrier reported a shipping failure",
        detail: shipment.reviewReason || shipment.statusDetail || "Open the request and review the shipping record.",
        requestId: request.id,
        requestCode: request.requestCode,
        createdAt: shipment.updatedAt || shipment.createdAt,
      });
    }
  }

  const latestBackup = latestBy(input.backups, (item) => item.createdAt);
  if (!latestBackup || ageHours(latestBackup.createdAt, nowMs) > 36) {
    addAttention(attention, nowMs, {
      id: "backup:stale",
      severity: "watch",
      category: "backup",
      title: latestBackup ? "Backup snapshot is getting stale" : "No backup snapshot found",
      detail: latestBackup ? "The latest complete snapshot is more than 36 hours old." : "Create a database and private-file backup from Security & Backups.",
      requestId: "",
      requestCode: "",
      createdAt: latestBackup?.createdAt || now.toISOString(),
    });
  }

  for (const entry of input.audit
    .filter((item) => ageHours(item.createdAt, nowMs) <= 72 && /fail|error/i.test(`${item.action} ${item.summary}`))
    .slice(0, 5)) {
    addAttention(attention, nowMs, {
      id: `integration:${entry.id}`,
      severity: "watch",
      category: "integration",
      title: "Recent failed business action",
      detail: entry.summary,
      requestId: entry.targetType === "request" ? entry.targetId : "",
      requestCode: "",
      createdAt: entry.createdAt,
    });
  }

  const search: OwnerSearchRecord[] = input.requests.map((request) => {
    const job = jobByRequest.get(request.id);
    const invoice = invoiceByRequest.get(request.id);
    const shipment = shipmentByRequest.get(request.id);
    const values = [
      request.requestCode,
      request.name,
      request.email,
      request.phone,
      job?.publicCode || "",
      job?.publicTitle || "",
      invoice?.stripeInvoiceNumber || "",
      shipment?.trackingCode || "",
    ];
    return {
      id: request.id,
      requestId: request.id,
      requestCode: request.requestCode,
      customerName: request.name,
      email: request.email,
      phone: request.phone,
      queueCode: job?.publicCode || "",
      queueTitle: job?.publicTitle || "",
      invoiceNumber: invoice?.stripeInvoiceNumber || "",
      trackingCode: shipment?.trackingCode || "",
      haystack: values.join(" ").toLowerCase(),
    };
  });

  for (const job of input.queue.filter((item) => !item.sourceRequestId)) {
    search.push({
      id: `queue:${job.id}`,
      requestId: "",
      requestCode: "",
      customerName: job.customerName,
      email: job.customerEmail,
      phone: "",
      queueCode: job.publicCode,
      queueTitle: job.publicTitle,
      invoiceNumber: "",
      trackingCode: "",
      haystack: [job.publicCode, job.publicTitle, job.customerName, job.customerEmail].join(" ").toLowerCase(),
    });
  }

  attention.sort((a, b) => {
    const severity = severityRank(a.severity) - severityRank(b.severity);
    if (severity) return severity;
    return dateMs(a.createdAt) - dateMs(b.createdAt);
  });

  const integrations = buildIntegrationHealth(input, nowMs);
  const activeRequestIds = new Set(
    input.requests.filter((item) => !["completed", "declined"].includes(item.status)).map((item) => item.id),
  );
  const counts = {
    urgent: attention.filter((item) => item.severity === "urgent").length,
    action: attention.filter((item) => item.severity === "action").length,
    watch: attention.filter((item) => item.severity === "watch").length,
    newRequests: input.requests.filter((item) => item.status === "new").length,
    activeProduction: input.queue.filter((item) => item.status !== "completed").length,
    finalBalancesDue: [...invoiceByRequest.entries()].filter(
      ([requestId, invoice]) => activeRequestIds.has(requestId) && invoice.status === "open" && invoice.amountRemainingCents > 0,
    ).length,
    completed: input.requests.filter((item) => item.status === "completed").length,
  };

  return {
    generatedAt: now.toISOString(),
    counts,
    attention,
    search,
    integrations,
  };
}
