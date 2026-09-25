import type { CustomerAccount } from "./customer-types.ts";
import type { FinalInvoiceRecord } from "./final-invoice-types.ts";
import type { StoredQuote } from "./quote-types.ts";
import type { StoredRequest } from "./request-types.ts";
import type { CustomerFollowUpRecord, FollowUpCandidate, FollowUpType, RequestFollowUpControl } from "./customer-follow-up-types.ts";

const HOUR_MS = 60 * 60 * 1000;
const COOLDOWN_MS = 24 * HOUR_MS;

type QuoteLike = Partial<StoredQuote> & {
  id: string; requestId: string; requestCode: string; customerAccountId: string; revision: number; status: string;
  sentAt: string; approvedAt: string; createdAt: string; updatedAt: string; depositCents: number;
  payments: Array<{ amountCents: number }>; refunds: Array<{ amountCents: number; status: string }>;
};

export type FollowUpPolicyInput = {
  now: Date;
  requests: StoredRequest[];
  quotes: StoredQuote[] | QuoteLike[];
  invoices: FinalInvoiceRecord[];
  accounts: CustomerAccount[];
  controls: RequestFollowUpControl[];
  records: CustomerFollowUpRecord[];
};

function time(value: string | undefined | null) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
function plusHours(value: string, hours: number) {
  return new Date(time(value) + hours * HOUR_MS).toISOString();
}
function currency(cents: number) {
  return (Math.max(0, Math.round(cents)) / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}
function netPaid(quote: QuoteLike) {
  const paid = (quote.payments || []).reduce((sum, item) => sum + Math.max(0, Number(item.amountCents || 0)), 0);
  const refunded = (quote.refunds || []).filter((item) => !["failed", "canceled"].includes(item.status)).reduce((sum, item) => sum + Math.max(0, Number(item.amountCents || 0)), 0);
  return Math.max(0, paid - refunded);
}
function outstandingDeposit(quote: QuoteLike) {
  return Math.max(0, Number(quote.depositCents || 0) - netPaid(quote));
}

export function followUpPriority(type: FollowUpType) {
  return type === "final-invoice" ? 0 : type === "deposit" ? 1 : type === "quote" ? 2 : 3;
}

export function followUpRecordId(input: Pick<FollowUpCandidate, "requestId" | "type" | "anchorId" | "anchorRevision" | "stage">) {
  if (input.type === "final-invoice") return `${input.requestId}:invoice:${input.anchorId}:stage${input.stage}`;
  if (input.type === "waiting-on-customer") return `${input.requestId}:waiting:${input.anchorId}:stage1`;
  return `${input.requestId}:${input.type}:${input.anchorId}:r${input.anchorRevision}:stage${input.stage}`;
}

export function effectiveFollowUpEmailAllowed(request: StoredRequest, account: CustomerAccount | null, control?: RequestFollowUpControl) {
  if (["completed", "declined"].includes(request.status)) return { allowed: false, reason: "Request is closed." };
  if (control?.paused) return { allowed: false, reason: "Automated reminders are paused for this request." };
  if (!request.customerAccountId) return { allowed: false, reason: "Request is not linked to a customer account." };
  if (!account) return { allowed: false, reason: "Linked customer account was not found." };
  if (!account.emailVerifiedAt) return { allowed: false, reason: "Customer email is not verified." };
  const wantsEmail = request.emailNotifications ?? account.preferences?.emailStatusUpdates ?? false;
  if (!wantsEmail) return { allowed: false, reason: "Customer email updates are disabled." };
  return { allowed: true, reason: "" };
}

function messageFor(type: FollowUpType, requestCode: string, amountCents = 0) {
  if (type === "quote") return {
    subject: `${requestCode} — your Mesh Harbor 3D quote is ready`,
    text: `Your Mesh Harbor 3D quote for ${requestCode} is ready for review. Sign in to your profile to approve it, decline it, or send a counter offer.`,
  };
  if (type === "deposit") return {
    subject: `${requestCode} — deposit needed to start your print`,
    text: `Your quote for ${requestCode} is approved. The remaining deposit due before production is ${currency(amountCents)}. Sign in to your Mesh Harbor 3D profile to complete the deposit.`,
  };
  if (type === "final-invoice") return {
    subject: `${requestCode} — final balance reminder`,
    text: `The final balance for ${requestCode} is ${currency(amountCents)}. Sign in to your Mesh Harbor 3D profile to review the invoice and payment link.`,
  };
  return {
    subject: `${requestCode} — we’re waiting on your reply`,
    text: `Mesh Harbor 3D is waiting on your reply for ${requestCode}. Sign in to your profile to review your request, or reply to the latest Mesh Harbor 3D message if you need help.`,
  };
}

function makeCandidate(input: {
  request: StoredRequest; type: FollowUpType; stage: 1 | 2; anchorId: string; anchorRevision: number; dueAt: string; amountCents?: number;
  allowed: { allowed: boolean; reason: string }; nowMs: number; records: CustomerFollowUpRecord[];
}): FollowUpCandidate {
  const base = {
    requestId: input.request.id,
    requestCode: input.request.requestCode,
    customerAccountId: input.request.customerAccountId || "",
    type: input.type,
    stage: input.stage,
    anchorId: input.anchorId,
    anchorRevision: input.anchorRevision,
    dueAt: input.dueAt,
  } as const;
  const id = followUpRecordId({ ...base, id: "", eligible: false, blockedReason: "", subject: "", text: "", idempotencyKey: "" });
  const content = messageFor(input.type, input.request.requestCode, input.amountCents || 0);
  const existing = input.records.find((item) => item.id === id);
  const stageOneId = input.stage === 2
    ? followUpRecordId({ ...base, stage: 1, id: "", eligible: false, blockedReason: "", subject: "", text: "", idempotencyKey: "" })
    : "";
  const stageOneSent = input.stage === 1 || input.records.some((item) => item.id === stageOneId && item.status === "sent");
  let blockedReason = "";
  if (!input.allowed.allowed) blockedReason = input.allowed.reason;
  else if (existing?.status === "sent") blockedReason = "This reminder was already sent.";
  else if (existing?.status === "canceled") blockedReason = "This reminder was canceled.";
  else if (!stageOneSent) blockedReason = "The first reminder has not been sent yet.";
  else if (time(input.dueAt) > input.nowMs) blockedReason = "Not due yet.";
  return {
    ...base,
    id,
    eligible: !blockedReason,
    blockedReason,
    subject: content.subject,
    text: content.text,
    idempotencyKey: `meshharbor:${id}`,
  };
}

export function buildFollowUpCandidates(input: FollowUpPolicyInput): FollowUpCandidate[] {
  const nowMs = input.now.getTime();
  const accountById = new Map(input.accounts.map((item) => [item.id, item]));
  const controlByRequest = new Map(input.controls.map((item) => [item.requestId, item]));
  const quoteByRequest = new Map<string, QuoteLike>();
  for (const raw of input.quotes as QuoteLike[]) {
    if (raw.status === "void") continue;
    const current = quoteByRequest.get(raw.requestId);
    if (!current || Number(raw.revision || 0) > Number(current.revision || 0) || time(raw.updatedAt) > time(current.updatedAt)) quoteByRequest.set(raw.requestId, raw);
  }
  const invoiceByRequest = new Map<string, FinalInvoiceRecord>();
  for (const invoice of input.invoices) {
    const current = invoiceByRequest.get(invoice.requestId);
    if (!current || time(invoice.createdAt) > time(current.createdAt)) invoiceByRequest.set(invoice.requestId, invoice);
  }

  const candidates: FollowUpCandidate[] = [];
  for (const request of input.requests) {
    const control = controlByRequest.get(request.id);
    const account = request.customerAccountId ? accountById.get(request.customerAccountId) || null : null;
    const allowed = effectiveFollowUpEmailAllowed(request, account, control);
    const quote = quoteByRequest.get(request.id);
    const invoice = invoiceByRequest.get(request.id);

    if (quote?.status === "sent" && quote.sentAt) {
      candidates.push(makeCandidate({ request, type: "quote", stage: 1, anchorId: quote.id, anchorRevision: quote.revision, dueAt: plusHours(quote.sentAt, 48), allowed, nowMs, records: input.records }));
      candidates.push(makeCandidate({ request, type: "quote", stage: 2, anchorId: quote.id, anchorRevision: quote.revision, dueAt: plusHours(quote.sentAt, 120), allowed, nowMs, records: input.records }));
    }
    if (quote?.status === "approved" && quote.approvedAt && outstandingDeposit(quote) > 0) {
      const amount = outstandingDeposit(quote);
      candidates.push(makeCandidate({ request, type: "deposit", stage: 1, anchorId: quote.id, anchorRevision: quote.revision, dueAt: plusHours(quote.approvedAt, 24), amountCents: amount, allowed, nowMs, records: input.records }));
      candidates.push(makeCandidate({ request, type: "deposit", stage: 2, anchorId: quote.id, anchorRevision: quote.revision, dueAt: plusHours(quote.approvedAt, 96), amountCents: amount, allowed, nowMs, records: input.records }));
    }
    if (invoice?.status === "open" && invoice.amountRemainingCents > 0 && invoice.sentAt) {
      candidates.push(makeCandidate({ request, type: "final-invoice", stage: 1, anchorId: invoice.id, anchorRevision: invoice.quoteRevision || 0, dueAt: plusHours(invoice.sentAt, 24), amountCents: invoice.amountRemainingCents, allowed, nowMs, records: input.records }));
      if (invoice.dueDate) candidates.push(makeCandidate({ request, type: "final-invoice", stage: 2, anchorId: invoice.id, anchorRevision: invoice.quoteRevision || 0, dueAt: invoice.dueDate, amountCents: invoice.amountRemainingCents, allowed, nowMs, records: input.records }));
    }
    if (control?.waitingOnCustomer && control.waitingSince) {
      candidates.push(makeCandidate({ request, type: "waiting-on-customer", stage: 1, anchorId: control.waitingSince, anchorRevision: 0, dueAt: plusHours(control.waitingSince, 72), allowed, nowMs, records: input.records }));
    }
  }

  const lastSentByRequest = new Map<string, number>();
  for (const record of input.records) {
    if (record.status !== "sent" || !record.sentAt) continue;
    lastSentByRequest.set(record.requestId, Math.max(lastSentByRequest.get(record.requestId) || 0, time(record.sentAt)));
  }
  for (const candidate of candidates) {
    const lastSent = lastSentByRequest.get(candidate.requestId) || 0;
    if (candidate.eligible && lastSent && nowMs - lastSent < COOLDOWN_MS) {
      candidate.eligible = false;
      candidate.blockedReason = "Another automated follow-up was sent within the last 24 hours.";
    }
  }

  candidates.sort((a, b) => {
    const aDue = time(a.dueAt) <= nowMs ? 0 : 1;
    const bDue = time(b.dueAt) <= nowMs ? 0 : 1;
    if (aDue !== bDue) return aDue - bDue;
    const priority = followUpPriority(a.type) - followUpPriority(b.type);
    if (priority) return priority;
    return time(a.dueAt) - time(b.dueAt) || a.stage - b.stage;
  });

  const chosen = new Set<string>();
  for (const candidate of candidates) {
    if (!candidate.eligible) continue;
    if (chosen.has(candidate.requestId)) {
      candidate.eligible = false;
      candidate.blockedReason = "A higher-priority automated follow-up is due for this request.";
    } else {
      chosen.add(candidate.requestId);
    }
  }
  return candidates;
}
