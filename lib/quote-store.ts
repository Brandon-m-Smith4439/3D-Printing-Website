import "server-only";
import { randomUUID } from "node:crypto";
import { readCollection, writeCollection } from "@/lib/database";
import {
  quoteDepositRefundDueCents,
  quoteDepositSatisfied,
  quoteNetDepositPaidCents,
  type AssemblyMode,
  type QuoteFulfillmentMode,
  type QuoteHistoryEntry,
  type QuotePaymentRecord,
  type QuoteRefundRecord,
  type QuoteSnapshot,
  type ShippingAddress,
  type ShippingSelection,
  type StoredQuote,
} from "@/lib/quote-types";
import type { EasyPostRate } from "@/lib/easypost";

let mutationChain = Promise.resolve();

function normalizeShippingSelection(value: ShippingSelection | null | undefined): ShippingSelection | null {
  if (!value) return null;
  return {
    shipmentId: value.shipmentId || "",
    rateId: value.rateId || "",
    carrier: value.carrier,
    service: value.service || "",
    rateCents: Number.isFinite(value.rateCents) ? Number(value.rateCents) : 0,
    deliveryDays: Number.isFinite(value.deliveryDays) ? Number(value.deliveryDays) : null,
    deliveryDate: value.deliveryDate || "",
    address: value.address || { name:"",street1:"",street2:"",city:"",state:"",zip:"",country:"US" },
    selectedAt: value.selectedAt || "",
  };
}

function normalizeSnapshot(snapshot: QuoteSnapshot | null | undefined): QuoteSnapshot | null {
  if (!snapshot) return null;
  const raw = snapshot as QuoteSnapshot & {
    basePriceCents?: number; assemblyMode?: AssemblyMode; assemblyFeeCents?: number;
    fulfillmentMode?: QuoteFulfillmentMode; localDeliveryFeeCents?: number; packageWeightOz?: number;
    packageLengthIn?: number; packageWidthIn?: number; packageHeightIn?: number; shippingSelection?: ShippingSelection | null;
  };
  const assemblyMode: AssemblyMode = raw.assemblyMode || "not-required";
  const assemblyFeeCents = Number.isFinite(raw.assemblyFeeCents) ? Number(raw.assemblyFeeCents) : 0;
  const fulfillmentMode: QuoteFulfillmentMode = raw.fulfillmentMode || "pickup";
  const localDeliveryFeeCents = Number.isFinite(raw.localDeliveryFeeCents) ? Number(raw.localDeliveryFeeCents) : 0;
  const shippingSelection = normalizeShippingSelection(raw.shippingSelection);
  const shippingCents = shippingSelection?.rateCents || 0;
  const basePriceCents = Number.isFinite(raw.basePriceCents) ? Number(raw.basePriceCents) : Math.max(0, raw.totalCents - assemblyFeeCents - localDeliveryFeeCents - shippingCents);
  return {
    ...raw, basePriceCents, assemblyMode, assemblyFeeCents, fulfillmentMode, localDeliveryFeeCents,
    packageWeightOz: Number(raw.packageWeightOz || 0), packageLengthIn: Number(raw.packageLengthIn || 0), packageWidthIn: Number(raw.packageWidthIn || 0), packageHeightIn: Number(raw.packageHeightIn || 0),
    shippingSelection,
  };
}

function normalizeQuote(item: StoredQuote): StoredQuote {
  const assemblyMode: AssemblyMode = item.assemblyMode || "not-required";
  const assemblyFeeCents = Number.isFinite(item.assemblyFeeCents) ? item.assemblyFeeCents : 0;
  const fulfillmentMode: QuoteFulfillmentMode = item.fulfillmentMode || "pickup";
  const localDeliveryFeeCents = Number.isFinite(item.localDeliveryFeeCents) ? item.localDeliveryFeeCents : 0;
  const shippingSelection = normalizeShippingSelection(item.shippingSelection);
  const shippingCents = shippingSelection?.rateCents || 0;
  const basePriceCents = Number.isFinite(item.basePriceCents) ? item.basePriceCents : Math.max(0, item.totalCents - assemblyFeeCents - localDeliveryFeeCents - shippingCents);
  const refunds: QuoteRefundRecord[] = Array.isArray(item.refunds) ? item.refunds.map((refund) => ({
    id: refund.id || randomUUID(),
    revision: Number(refund.revision || item.revision || 1),
    paymentRecordId: refund.paymentRecordId || "",
    paymentIntentId: refund.paymentIntentId || "",
    stripeRefundId: refund.stripeRefundId || "",
    amountCents: Math.max(0, Number(refund.amountCents || 0)),
    status: refund.status || "unknown",
    createdAt: refund.createdAt || item.updatedAt || item.createdAt,
    updatedAt: refund.updatedAt || refund.createdAt || item.updatedAt || item.createdAt,
  })) : [];
  const existingPayments = Array.isArray(item.payments) ? item.payments : [];
  const payments: QuotePaymentRecord[] = existingPayments.length ? existingPayments.map((payment) => ({
    id: payment.id || randomUUID(),
    revision: Number(payment.revision || item.revision || 1),
    amountCents: Math.max(0, Number(payment.amountCents || 0)),
    checkoutSessionId: payment.checkoutSessionId || "",
    paymentIntentId: payment.paymentIntentId || "",
    paidAt: payment.paidAt || item.depositPaidAt || item.updatedAt || item.createdAt,
  })) : item.depositPaidAt ? [{
    id: `legacy-${item.id}`,
    revision: Number(item.revision || 1),
    amountCents: Math.max(0, Number(item.depositCents || 0)),
    checkoutSessionId: item.stripeCheckoutSessionId || "",
    paymentIntentId: "",
    paidAt: item.depositPaidAt,
  }] : [];
  const normalized: StoredQuote = {
    ...item, assemblyMode, assemblyFeeCents, basePriceCents, fulfillmentMode, localDeliveryFeeCents,
    packageWeightOz:Number(item.packageWeightOz||0), packageLengthIn:Number(item.packageLengthIn||0), packageWidthIn:Number(item.packageWidthIn||0), packageHeightIn:Number(item.packageHeightIn||0), shippingSelection,
    stripeCheckoutAmountCents: Number(item.stripeCheckoutAmountCents || 0), payments, refunds,
  };
  const approvalSnapshot = normalizeSnapshot(item.approvalSnapshot);
  if (Array.isArray(item.history) && item.history.length) {
    return { ...normalized, approvalSnapshot, history: item.history.map((entry) => ({ ...entry, snapshot: normalizeSnapshot(entry.snapshot) || undefined })) };
  }
  const history: QuoteHistoryEntry[] = [];
  const snapshot = quoteSnapshot(normalized);
  if (item.sentAt) history.push({ id: `${item.id}-legacy-sent`, createdAt: item.sentAt, actor: "owner", event: "sent", revision: item.revision, summary: `Quote revision ${item.revision} sent to customer.`, snapshot });
  if (item.approvedAt) history.push({ id: `${item.id}-legacy-approved`, createdAt: item.approvedAt, actor: "customer", event: "approved", revision: item.revision, summary: `Customer approved quote revision ${item.revision}.`, snapshot: approvalSnapshot || snapshot });
  if (item.depositPaidAt) history.push({ id: `${item.id}-legacy-paid`, createdAt: item.depositPaidAt, actor: "system", event: "deposit-paid", revision: item.revision, summary: `50% deposit recorded for quote revision ${item.revision}.`, snapshot });
  return { ...normalized, approvalSnapshot, history };
}
export async function readQuotes() { return (await readCollection<StoredQuote>("quotes")).map(normalizeQuote); }
async function writeQuotes(items: StoredQuote[]) { await writeCollection("quotes", items); }
function mutate<T>(operation: () => Promise<T>): Promise<T> { const next = mutationChain.then(operation, operation); mutationChain = next.then(() => undefined, () => undefined); return next; }

export function quoteSnapshot(quote: Pick<StoredQuote, keyof QuoteSnapshot>): QuoteSnapshot {
  return {
    revision: quote.revision,
    basePriceCents: quote.basePriceCents,
    assemblyMode: quote.assemblyMode,
    assemblyFeeCents: quote.assemblyFeeCents,
    fulfillmentMode: quote.fulfillmentMode,
    localDeliveryFeeCents: quote.localDeliveryFeeCents,
    packageWeightOz: quote.packageWeightOz,
    packageLengthIn: quote.packageLengthIn,
    packageWidthIn: quote.packageWidthIn,
    packageHeightIn: quote.packageHeightIn,
    shippingSelection: quote.shippingSelection,
    totalCents: quote.totalCents,
    depositCents: quote.depositCents,
    balanceCents: quote.balanceCents,
    currency: quote.currency,
    material: quote.material,
    dimensions: quote.dimensions,
    estimatedReadyDate: quote.estimatedReadyDate,
    notes: quote.notes,
    terms: quote.terms,
  };
}
function event(input: Omit<QuoteHistoryEntry, "id" | "createdAt">): QuoteHistoryEntry { return { id: randomUUID(), createdAt: new Date().toISOString(), ...input }; }

export async function quoteForRequest(requestId: string) { const items = await readQuotes(); return items.find((item) => item.requestId === requestId && item.status !== "void") || null; }
export async function quoteById(id: string) { const items = await readQuotes(); return items.find((item) => item.id === id) || null; }

export async function upsertQuote(input: {
  requestId: string; requestCode: string; customerAccountId: string; basePriceCents: number; assemblyMode: AssemblyMode; assemblyFeeCents: number;
  fulfillmentMode: QuoteFulfillmentMode; localDeliveryFeeCents: number; packageWeightOz:number; packageLengthIn:number; packageWidthIn:number; packageHeightIn:number;
  totalCents: number; depositCents: number; material: string; dimensions: string; estimatedReadyDate: string; notes: string; terms: string; send: boolean;
}) {
  return mutate(async () => {
    const items = await readQuotes();
    const index = items.findIndex((item) => item.requestId === input.requestId && item.status !== "void");
    const now = new Date().toISOString();
    const existing = index >= 0 ? normalizeQuote(items[index]) : null;
    const changedKeys = ["basePriceCents","assemblyMode","assemblyFeeCents","fulfillmentMode","localDeliveryFeeCents","packageWeightOz","packageLengthIn","packageWidthIn","packageHeightIn","material","dimensions","estimatedReadyDate","notes","terms"];
    const changed = !existing || changedKeys.some((key) => String((existing as unknown as Record<string, unknown>)[key]) !== String((input as unknown as Record<string, unknown>)[key]));
    const hadCustomerDecision = Boolean(existing && ["approved","countered","declined","deposit-paid"].includes(existing.status));
    const revision = existing ? existing.revision + (((changed && (existing.sentAt || hadCustomerDecision)) || (input.send && hadCustomerDecision)) ? 1 : 0) : 1;
    const preserveExistingState = Boolean(existing && !changed && !input.send);
    const status = input.send ? "sent" : preserveExistingState ? existing!.status : "draft";
    const keepShipping = Boolean(existing && !changed && existing.shippingSelection && !hadCustomerDecision);
    const shippingSelection = keepShipping ? existing!.shippingSelection : null;
    const shippingCents = shippingSelection?.rateCents || 0;
    const totalCents = input.basePriceCents + input.assemblyFeeCents + input.localDeliveryFeeCents + shippingCents;
    const depositCents = Math.round(totalCents / 2);
    const quote: StoredQuote = {
      id: existing?.id || randomUUID(), requestId: input.requestId, requestCode: input.requestCode, customerAccountId: input.customerAccountId,
      revision, basePriceCents: input.basePriceCents, assemblyMode: input.assemblyMode, assemblyFeeCents: input.assemblyFeeCents,
      fulfillmentMode: input.fulfillmentMode, localDeliveryFeeCents: input.localDeliveryFeeCents, packageWeightOz: input.packageWeightOz,
      packageLengthIn: input.packageLengthIn, packageWidthIn: input.packageWidthIn, packageHeightIn: input.packageHeightIn, shippingSelection,
      totalCents, depositCents, balanceCents: totalCents - depositCents,
      currency: "usd", material: input.material, dimensions: input.dimensions, estimatedReadyDate: input.estimatedReadyDate,
      notes: input.notes, terms: input.terms, status,
      createdAt: existing?.createdAt || now, updatedAt: now,
      sentAt: input.send ? now : preserveExistingState ? existing!.sentAt : "",
      approvedAt: preserveExistingState ? existing!.approvedAt : "",
      approvedByCustomerId: preserveExistingState ? existing!.approvedByCustomerId : "",
      approvalSnapshot: preserveExistingState ? existing!.approvalSnapshot : null,
      stripeCheckoutSessionId: preserveExistingState ? existing!.stripeCheckoutSessionId : "",
      stripeCheckoutAmountCents: preserveExistingState ? existing!.stripeCheckoutAmountCents : 0,
      depositPaidAt: existing?.depositPaidAt || "",
      paymentProvider: existing?.paymentProvider || "",
      payments: [...(existing?.payments || [])],
      refunds: [...(existing?.refunds || [])],
      history: [...(existing?.history || [])],
    };
    if (!existing || changed || input.send) quote.history.push(event({ actor:"owner", event:input.send?"sent":"draft-saved", revision, summary:input.send?`Quote revision ${revision} sent to customer.`:`Quote revision ${revision} saved as draft.`, snapshot:quoteSnapshot(quote) }));
    if (index >= 0) items[index] = quote; else items.push(quote);
    await writeQuotes(items); return quote;
  });
}

export async function selectQuoteShipping(id:string, customerId:string, rate:EasyPostRate, shipmentId:string, address:ShippingAddress) {
  return mutate(async()=>{
    const items=await readQuotes(); const index=items.findIndex((item)=>item.id===id); if(index<0)return null;
    const current=normalizeQuote(items[index]);
    if(current.customerAccountId!==customerId || current.fulfillmentMode!=="shipping" || current.status!=="sent") return null;
    const now=new Date().toISOString();
    const shippingSelection:ShippingSelection={shipmentId,rateId:rate.id,carrier:rate.carrier,service:rate.service,rateCents:rate.rateCents,deliveryDays:rate.deliveryDays,deliveryDate:rate.deliveryDate,address,selectedAt:now};
    const totalCents=current.basePriceCents+current.assemblyFeeCents+current.localDeliveryFeeCents+rate.rateCents;
    const depositCents=Math.round(totalCents/2);
    const next:StoredQuote={...current,shippingSelection,totalCents,depositCents,balanceCents:totalCents-depositCents,updatedAt:now,
      history:[...current.history,event({actor:"customer",event:"shipping-selected",revision:current.revision,summary:`Customer selected ${rate.carrier} ${rate.service} shipping for ${(rate.rateCents/100).toLocaleString("en-US",{style:"currency",currency:"USD"})}.`,snapshot:{...quoteSnapshot(current),shippingSelection,totalCents,depositCents,balanceCents:totalCents-depositCents}})]};
    items[index]=next; await writeQuotes(items); return next;
  });
}

export async function approveQuote(id: string, customerId: string) {
  return mutate(async () => {
    const items = await readQuotes(); const index = items.findIndex((item) => item.id === id); if (index < 0) return null;
    const current = normalizeQuote(items[index]);
    if (current.customerAccountId !== customerId || current.status !== "sent") return null;
    if (current.fulfillmentMode === "shipping" && !current.shippingSelection) return null;
    const now = new Date().toISOString();
    const next: StoredQuote = { ...current, status: "approved", approvedAt: now, approvedByCustomerId: customerId, approvalSnapshot: quoteSnapshot(current), updatedAt: now,
      history: [...current.history, event({ actor:"customer", event:"approved", revision:current.revision, summary:`Customer approved quote revision ${current.revision}.`, snapshot:quoteSnapshot(current) })] };
    items[index] = next; await writeQuotes(items); return next;
  });
}

export async function respondToQuote(id:string, customerId:string, response:{action:"decline";message:string}|{action:"counter";counterTotalCents:number;message:string}) {
  return mutate(async()=>{
    const items=await readQuotes(); const index=items.findIndex(item=>item.id===id); if(index<0)return null;
    const current=normalizeQuote(items[index]); if(current.customerAccountId!==customerId||current.status!=="sent")return null;
    const now=new Date().toISOString();
    const historyEntry=response.action==="counter"
      ? event({actor:"customer",event:"counter-offer",revision:current.revision,summary:`Customer countered quote revision ${current.revision}.`,counterTotalCents:response.counterTotalCents,message:response.message,snapshot:quoteSnapshot(current)})
      : event({actor:"customer",event:"declined",revision:current.revision,summary:`Customer declined quote revision ${current.revision}.`,message:response.message,snapshot:quoteSnapshot(current)});
    const next:StoredQuote={...current,status:response.action==="counter"?"countered":"declined",updatedAt:now,history:[...current.history,historyEntry]};
    items[index]=next;await writeQuotes(items);return next;
  });
}

export async function markQuoteCheckoutSession(id: string, sessionId: string, amountCents: number) {
  return mutate(async () => {
    const items = await readQuotes(); const index = items.findIndex((item) => item.id === id); if (index < 0) return null;
    items[index] = {
      ...normalizeQuote(items[index]),
      stripeCheckoutSessionId: sessionId,
      stripeCheckoutAmountCents: Math.max(0, Math.round(amountCents)),
      paymentProvider: "stripe",
      updatedAt: new Date().toISOString(),
    };
    await writeQuotes(items); return items[index];
  });
}

export async function recordQuoteDepositPayment(id: string, input: { sessionId: string; paymentIntentId: string; amountCents: number; revision?: number }) {
  return mutate(async () => {
    const items = await readQuotes(); const index = items.findIndex((item) => item.id === id); if (index < 0) return null;
    const current = normalizeQuote(items[index]);
    const existingPayment = current.payments.find((item) => item.checkoutSessionId === input.sessionId);
    if (existingPayment) return current;
    const now = new Date().toISOString();
    const payment: QuotePaymentRecord = {
      id: randomUUID(),
      revision: input.revision || current.revision,
      amountCents: Math.max(0, Math.round(input.amountCents)),
      checkoutSessionId: input.sessionId,
      paymentIntentId: input.paymentIntentId,
      paidAt: now,
    };
    const payments = [...current.payments, payment];
    const candidate: StoredQuote = {
      ...current,
      payments,
      stripeCheckoutSessionId: input.sessionId,
      stripeCheckoutAmountCents: 0,
      paymentProvider: "stripe",
      updatedAt: now,
    };
    const satisfied = current.status === "approved" && quoteDepositSatisfied(candidate);
    const previousPaid = quoteNetDepositPaidCents(current);
    const summary = previousPaid > 0
      ? `Additional deposit of ${(payment.amountCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })} recorded for quote revision ${payment.revision}.`
      : `50% deposit recorded for quote revision ${payment.revision}.`;
    const next: StoredQuote = {
      ...candidate,
      status: satisfied ? "deposit-paid" : candidate.status,
      depositPaidAt: satisfied ? (current.depositPaidAt || now) : current.depositPaidAt,
      history: [...current.history, event({ actor:"system", event:"deposit-paid", revision:payment.revision, summary, snapshot:quoteSnapshot(current) })],
    };
    items[index]=next; await writeQuotes(items); return next;
  });
}

export function quoteRefundPlan(quote: StoredQuote, amountCents = quoteDepositRefundDueCents(quote)) {
  let remaining = Math.max(0, Math.round(amountCents));
  const plan: Array<{ payment: QuotePaymentRecord; amountCents: number; attempt: number }> = [];
  const refundsByPayment = new Map<string, number>();
  for (const refund of quote.refunds) {
    if (["failed", "canceled"].includes(refund.status)) continue;
    refundsByPayment.set(refund.paymentRecordId, (refundsByPayment.get(refund.paymentRecordId) || 0) + refund.amountCents);
  }
  for (const payment of [...quote.payments].reverse()) {
    if (remaining <= 0) break;
    const available = Math.max(0, payment.amountCents - (refundsByPayment.get(payment.id) || 0));
    if (!available) continue;
    const amount = Math.min(available, remaining);
    const failedAttempts = quote.refunds.filter((refund) =>
      refund.paymentRecordId === payment.id
      && refund.revision === quote.revision
      && refund.amountCents === amount
      && ["failed", "canceled"].includes(refund.status)
    ).length;
    plan.push({ payment, amountCents: amount, attempt: failedAttempts + 1 });
    remaining -= amount;
  }
  return { plan, remainingCents: remaining };
}

export async function recordQuoteRefund(id: string, refund: Omit<QuoteRefundRecord, "id" | "createdAt" | "updatedAt">) {
  return mutate(async () => {
    const items = await readQuotes(); const index = items.findIndex((item) => item.id === id); if (index < 0) return null;
    const current = normalizeQuote(items[index]);
    const existing = current.refunds.find((item) => item.stripeRefundId && item.stripeRefundId === refund.stripeRefundId);
    if (existing) return current;
    const now = new Date().toISOString();
    const record: QuoteRefundRecord = { id: randomUUID(), createdAt: now, updatedAt: now, ...refund };
    const next: StoredQuote = {
      ...current,
      refunds: [...current.refunds, record],
      updatedAt: now,
      history: [...current.history, event({
        actor:"system",
        event:"refund-issued",
        revision:refund.revision,
        summary:`Deposit refund of ${(refund.amountCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })} ${refund.status === "pending" ? "submitted" : "issued"} for quote revision ${refund.revision}.`,
        snapshot:quoteSnapshot(current),
      })],
    };
    items[index]=next; await writeQuotes(items); return next;
  });
}

export async function markQuoteDepositSatisfied(id: string) {
  return mutate(async () => {
    const items = await readQuotes(); const index = items.findIndex((item) => item.id === id); if (index < 0) return null;
    const current = normalizeQuote(items[index]);
    if (!quoteDepositSatisfied(current)) return current;
    const now = new Date().toISOString();
    const next: StoredQuote = {
      ...current,
      status: "deposit-paid",
      depositPaidAt: current.depositPaidAt || now,
      stripeCheckoutAmountCents: 0,
      updatedAt: now,
    };
    items[index]=next; await writeQuotes(items); return next;
  });
}

export async function updateQuoteRefundStatus(stripeRefundId: string, status: QuoteRefundRecord["status"]) {
  return mutate(async () => {
    const items = await readQuotes();
    const quoteIndex = items.findIndex((item) => normalizeQuote(item).refunds.some((refund) => refund.stripeRefundId === stripeRefundId));
    if (quoteIndex < 0) return null;
    const current = normalizeQuote(items[quoteIndex]);
    const refundIndex = current.refunds.findIndex((refund) => refund.stripeRefundId === stripeRefundId);
    if (refundIndex < 0) return null;
    const now = new Date().toISOString();
    const refunds = [...current.refunds];
    refunds[refundIndex] = { ...refunds[refundIndex], status, updatedAt: now };
    let next: StoredQuote = { ...current, refunds, updatedAt: now };
    if (["failed", "canceled"].includes(status) && quoteDepositRefundDueCents(next) > 0 && next.status === "deposit-paid") {
      next = { ...next, status: "approved" };
    } else if (next.status === "approved" && quoteDepositSatisfied(next)) {
      next = { ...next, status: "deposit-paid", depositPaidAt: next.depositPaidAt || now };
    }
    items[quoteIndex] = next;
    await writeQuotes(items);
    return next;
  });
}

export async function voidQuoteForRequest(requestId: string) {
  return mutate(async () => { const items = await readQuotes(); let changed = false; const now = new Date().toISOString(); for (let i=0;i<items.length;i++) if (items[i].requestId === requestId && items[i].status !== "void" && !items[i].depositPaidAt) { items[i] = { ...normalizeQuote(items[i]), status: "void", updatedAt: now }; changed = true; } if (changed) await writeQuotes(items); });
}
