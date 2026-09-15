import "server-only";
import { randomUUID } from "node:crypto";
import { readCollection, writeCollection } from "@/lib/database";
import type { QuoteSnapshot, StoredQuote } from "@/lib/quote-types";

let mutationChain = Promise.resolve();

export async function readQuotes() { return readCollection<StoredQuote>("quotes"); }
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
    const existing = index >= 0 ? items[index] : null;
    if (existing?.depositPaidAt) throw new Error("A paid quote cannot be edited. Create a manual adjustment instead.");
    const changed = !existing || ["totalCents","depositCents","material","dimensions","estimatedReadyDate","notes","terms"].some((key) => String((existing as unknown as Record<string, unknown>)[key]) !== String((input as unknown as Record<string, unknown>)[key]));
    const revision = existing ? existing.revision + (changed && existing.sentAt ? 1 : 0) : 1;
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
    };
    if (index >= 0) items[index] = quote; else items.push(quote);
    await writeQuotes(items); return quote;
  });
}

export async function approveQuote(id: string, customerId: string) {
  return mutate(async () => {
    const items = await readQuotes(); const index = items.findIndex((item) => item.id === id); if (index < 0) return null;
    const current = items[index];
    if (current.customerAccountId !== customerId || current.status !== "sent") return null;
    const now = new Date().toISOString();
    items[index] = { ...current, status: "approved", approvedAt: now, approvedByCustomerId: customerId, approvalSnapshot: quoteSnapshot(current), updatedAt: now };
    await writeQuotes(items); return items[index];
  });
}

export async function markQuoteCheckoutSession(id: string, sessionId: string) {
  return mutate(async () => {
    const items = await readQuotes(); const index = items.findIndex((item) => item.id === id); if (index < 0) return null;
    items[index] = { ...items[index], stripeCheckoutSessionId: sessionId, paymentProvider: "stripe", updatedAt: new Date().toISOString() };
    await writeQuotes(items); return items[index];
  });
}

export async function markQuoteDepositPaid(id: string, sessionId: string) {
  return mutate(async () => {
    const items = await readQuotes(); const index = items.findIndex((item) => item.id === id); if (index < 0) return null;
    const current = items[index];
    if (current.depositPaidAt) return current;
    if (current.stripeCheckoutSessionId && current.stripeCheckoutSessionId !== sessionId) return null;
    const now = new Date().toISOString();
    items[index] = { ...current, status: "deposit-paid", depositPaidAt: now, stripeCheckoutSessionId: sessionId, paymentProvider: "stripe", updatedAt: now };
    await writeQuotes(items); return items[index];
  });
}

export async function voidQuoteForRequest(requestId: string) {
  return mutate(async () => {
    const items = await readQuotes(); let changed = false; const now = new Date().toISOString();
    for (let i=0;i<items.length;i++) if (items[i].requestId === requestId && items[i].status !== "void" && !items[i].depositPaidAt) { items[i] = { ...items[i], status: "void", updatedAt: now }; changed = true; }
    if (changed) await writeQuotes(items);
  });
}
