import "server-only";
import { randomUUID } from "node:crypto";
import { readCollection, writeCollection } from "@/lib/database";
import type { QuoteHistoryEntry, QuoteSnapshot, StoredQuote } from "@/lib/quote-types";

let mutationChain = Promise.resolve();

function normalizeQuote(item: StoredQuote): StoredQuote {
  if (Array.isArray(item.history) && item.history.length) return { ...item, history: item.history };
  const history: QuoteHistoryEntry[] = [];
  const snapshot = quoteSnapshot(item);
  if (item.sentAt) history.push({ id: `${item.id}-legacy-sent`, createdAt: item.sentAt, actor: "owner", event: "sent", revision: item.revision, summary: `Quote revision ${item.revision} sent to customer.`, snapshot });
  if (item.approvedAt) history.push({ id: `${item.id}-legacy-approved`, createdAt: item.approvedAt, actor: "customer", event: "approved", revision: item.revision, summary: `Customer approved quote revision ${item.revision}.`, snapshot: item.approvalSnapshot || snapshot });
  if (item.depositPaidAt) history.push({ id: `${item.id}-legacy-paid`, createdAt: item.depositPaidAt, actor: "system", event: "deposit-paid", revision: item.revision, summary: `50% deposit recorded for quote revision ${item.revision}.`, snapshot });
  return { ...item, history };
}
export async function readQuotes() { return (await readCollection<StoredQuote>("quotes")).map(normalizeQuote); }
async function writeQuotes(items: StoredQuote[]) { await writeCollection("quotes", items); }
function mutate<T>(operation: () => Promise<T>): Promise<T> { const next = mutationChain.then(operation, operation); mutationChain = next.then(() => undefined, () => undefined); return next; }

export function quoteSnapshot(quote: Pick<StoredQuote, keyof QuoteSnapshot>): QuoteSnapshot {
  return {
    revision: quote.revision,
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
function event(input: Omit<QuoteHistoryEntry, "id" | "createdAt">): QuoteHistoryEntry {
  return { id: randomUUID(), createdAt: new Date().toISOString(), ...input };
}

export async function quoteForRequest(requestId: string) {
  const items = await readQuotes();
  return items.find((item) => item.requestId === requestId && item.status !== "void") || null;
}

export async function quoteById(id: string) {
  const items = await readQuotes(); return items.find((item) => item.id === id) || null;
}

export async function upsertQuote(input: {
  requestId: string; requestCode: string; customerAccountId: string; totalCents: number; depositCents: number;
  material: string; dimensions: string; estimatedReadyDate: string; notes: string; terms: string; send: boolean;
}) {
  return mutate(async () => {
    const items = await readQuotes();
    const index = items.findIndex((item) => item.requestId === input.requestId && item.status !== "void");
    const now = new Date().toISOString();
    const existing = index >= 0 ? normalizeQuote(items[index]) : null;
    if (existing?.depositPaidAt) throw new Error("A paid quote cannot be edited. Create a manual adjustment instead.");
    const changed = !existing || ["totalCents","depositCents","material","dimensions","estimatedReadyDate","notes","terms"].some((key) => String((existing as unknown as Record<string, unknown>)[key]) !== String((input as unknown as Record<string, unknown>)[key]));
    const hadCustomerDecision = Boolean(existing && ["approved","countered","declined"].includes(existing.status));
    const revision = existing ? existing.revision + (((changed && (existing.sentAt || hadCustomerDecision)) || (input.send && hadCustomerDecision)) ? 1 : 0) : 1;
    const preserveExistingState = Boolean(existing && !changed && !input.send);
    const status = input.send ? "sent" : preserveExistingState ? existing!.status : "draft";
    const quote: StoredQuote = {
      id: existing?.id || randomUUID(), requestId: input.requestId, requestCode: input.requestCode, customerAccountId: input.customerAccountId,
      revision, totalCents: input.totalCents, depositCents: input.depositCents, balanceCents: input.totalCents - input.depositCents,
      currency: "usd", material: input.material, dimensions: input.dimensions, estimatedReadyDate: input.estimatedReadyDate,
      notes: input.notes, terms: input.terms, status,
      createdAt: existing?.createdAt || now, updatedAt: now,
      sentAt: input.send ? now : preserveExistingState ? existing!.sentAt : "",
      approvedAt: preserveExistingState ? existing!.approvedAt : "",
      approvedByCustomerId: preserveExistingState ? existing!.approvedByCustomerId : "",
      approvalSnapshot: preserveExistingState ? existing!.approvalSnapshot : null,
      stripeCheckoutSessionId: preserveExistingState ? existing!.stripeCheckoutSessionId : "",
      depositPaidAt: preserveExistingState ? existing!.depositPaidAt : "",
      paymentProvider: preserveExistingState ? existing!.paymentProvider : "",
      history: [...(existing?.history || [])],
    };
    if (!existing || changed || input.send) {
      quote.history.push(event({
        actor: "owner", event: input.send ? "sent" : "draft-saved", revision,
        summary: input.send ? `Quote revision ${revision} sent to customer.` : `Quote revision ${revision} saved as draft.`,
        snapshot: quoteSnapshot(quote),
      }));
    }
    if (index >= 0) items[index] = quote; else items.push(quote);
    await writeQuotes(items); return quote;
  });
}

export async function approveQuote(id: string, customerId: string) {
  return mutate(async () => {
    const items = await readQuotes(); const index = items.findIndex((item) => item.id === id); if (index < 0) return null;
    const current = normalizeQuote(items[index]);
    if (current.customerAccountId !== customerId || current.status !== "sent") return null;
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

export async function markQuoteCheckoutSession(id: string, sessionId: string) {
  return mutate(async () => {
    const items = await readQuotes(); const index = items.findIndex((item) => item.id === id); if (index < 0) return null;
    items[index] = { ...normalizeQuote(items[index]), stripeCheckoutSessionId: sessionId, paymentProvider: "stripe", updatedAt: new Date().toISOString() };
    await writeQuotes(items); return items[index];
  });
}

export async function markQuoteDepositPaid(id: string, sessionId: string) {
  return mutate(async () => {
    const items = await readQuotes(); const index = items.findIndex((item) => item.id === id); if (index < 0) return null;
    const current = normalizeQuote(items[index]);
    if (current.depositPaidAt) return current;
    if (current.stripeCheckoutSessionId && current.stripeCheckoutSessionId !== sessionId) return null;
    const now = new Date().toISOString();
    const next:StoredQuote={ ...current, status: "deposit-paid", depositPaidAt: now, stripeCheckoutSessionId: sessionId, paymentProvider: "stripe", updatedAt: now,
      history:[...current.history,event({actor:"system",event:"deposit-paid",revision:current.revision,summary:`50% deposit recorded for quote revision ${current.revision}.`,snapshot:quoteSnapshot(current)})] };
    items[index]=next; await writeQuotes(items); return next;
  });
}

export async function voidQuoteForRequest(requestId: string) {
  return mutate(async () => {
    const items = await readQuotes(); let changed = false; const now = new Date().toISOString();
    for (let i=0;i<items.length;i++) if (items[i].requestId === requestId && items[i].status !== "void" && !items[i].depositPaidAt) { items[i] = { ...normalizeQuote(items[i]), status: "void", updatedAt: now }; changed = true; }
    if (changed) await writeQuotes(items);
  });
}
