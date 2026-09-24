import "server-only";
import { randomUUID } from "node:crypto";
import { readCollection, writeCollection } from "@/lib/database";
import type { FinalInvoiceRecord, FinalInvoiceStatus } from "@/lib/final-invoice-types";

let mutationChain = Promise.resolve();

function normalize(record: FinalInvoiceRecord): FinalInvoiceRecord {
  return {
    ...record,
    quoteRevision: Number(record.quoteRevision || 1),
    stripeCustomerId: record.stripeCustomerId || "",
    stripeInvoiceNumber: record.stripeInvoiceNumber || "",
    status: record.status || "draft",
    amountDueCents: Math.max(0, Number(record.amountDueCents || 0)),
    amountPaidCents: Math.max(0, Number(record.amountPaidCents || 0)),
    currency: "usd",
    hostedInvoiceUrl: record.hostedInvoiceUrl || "",
    invoicePdfUrl: record.invoicePdfUrl || "",
    dueDate: record.dueDate || "",
    sentAt: record.sentAt || "",
    paidAt: record.paidAt || "",
    paymentFailedAt: record.paymentFailedAt || "",
    lastError: record.lastError || "",
  };
}

function mutate<T>(operation: () => Promise<T>): Promise<T> {
  const next = mutationChain.then(operation, operation);
  mutationChain = next.then(() => undefined, () => undefined);
  return next;
}

export async function readFinalInvoices() {
  return (await readCollection<FinalInvoiceRecord>("final-invoices")).map(normalize);
}

async function writeFinalInvoices(items: FinalInvoiceRecord[]) {
  await writeCollection("final-invoices", items);
}

export async function finalInvoiceForRequest(requestId: string) {
  const items = await readFinalInvoices();
  return items
    .filter((item) => item.requestId === requestId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] || null;
}

export async function finalInvoiceByStripeId(stripeInvoiceId: string) {
  const items = await readFinalInvoices();
  return items.find((item) => item.stripeInvoiceId === stripeInvoiceId) || null;
}

export async function createFinalInvoiceRecord(input: Omit<FinalInvoiceRecord, "id" | "createdAt" | "updatedAt">) {
  return mutate(async () => {
    const items = await readFinalInvoices();
    const existing = items.find((item) => item.requestId === input.requestId && item.quoteId === input.quoteId && item.stripeInvoiceId === input.stripeInvoiceId);
    if (existing) return existing;
    const now = new Date().toISOString();
    const record: FinalInvoiceRecord = normalize({ id: randomUUID(), createdAt: now, updatedAt: now, ...input });
    items.push(record);
    await writeFinalInvoices(items);
    return record;
  });
}

export async function updateFinalInvoiceRecord(id: string, values: Partial<FinalInvoiceRecord>) {
  return mutate(async () => {
    const items = await readFinalInvoices();
    const index = items.findIndex((item) => item.id === id);
    if (index < 0) return null;
    items[index] = normalize({ ...items[index], ...values, updatedAt: new Date().toISOString() });
    await writeFinalInvoices(items);
    return items[index];
  });
}

export async function updateFinalInvoiceFromStripe(input: {
  stripeInvoiceId: string;
  status?: FinalInvoiceStatus;
  stripeInvoiceNumber?: string;
  amountDueCents?: number;
  amountPaidCents?: number;
  hostedInvoiceUrl?: string;
  invoicePdfUrl?: string;
  dueDate?: string;
  paidAt?: string;
  paymentFailedAt?: string;
  lastError?: string;
}) {
  return mutate(async () => {
    const items = await readFinalInvoices();
    const index = items.findIndex((item) => item.stripeInvoiceId === input.stripeInvoiceId);
    if (index < 0) return null;
    const current = items[index];
    items[index] = normalize({
      ...current,
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.stripeInvoiceNumber !== undefined ? { stripeInvoiceNumber: input.stripeInvoiceNumber } : {}),
      ...(input.amountDueCents !== undefined ? { amountDueCents: input.amountDueCents } : {}),
      ...(input.amountPaidCents !== undefined ? { amountPaidCents: input.amountPaidCents } : {}),
      ...(input.hostedInvoiceUrl !== undefined ? { hostedInvoiceUrl: input.hostedInvoiceUrl } : {}),
      ...(input.invoicePdfUrl !== undefined ? { invoicePdfUrl: input.invoicePdfUrl } : {}),
      ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
      ...(input.paidAt !== undefined ? { paidAt: input.paidAt } : {}),
      ...(input.paymentFailedAt !== undefined ? { paymentFailedAt: input.paymentFailedAt } : {}),
      ...(input.lastError !== undefined ? { lastError: input.lastError } : {}),
      updatedAt: new Date().toISOString(),
    });
    await writeFinalInvoices(items);
    return items[index];
  });
}
