import "server-only";
import { readCollection, writeCollection } from "@/lib/database";
import type { HistoricalProfitRecord } from "@/lib/historical-profit-types";

const COLLECTION = "historical-profit-records";
let chain = Promise.resolve();

function mutate<T>(fn: () => Promise<T>) {
  const next = chain.then(fn, fn);
  chain = next.then(() => undefined, () => undefined);
  return next;
}

export async function readHistoricalProfitRecords() {
  return readCollection<HistoricalProfitRecord>(COLLECTION);
}

export async function historicalProfitForRequest(requestId: string) {
  return (await readHistoricalProfitRecords()).find((item) => item.requestId === requestId) || null;
}

export function saveHistoricalProfitRecord(input: Omit<HistoricalProfitRecord, "id" | "contributionProfitCents" | "contributionMarginBasisPoints" | "createdAt" | "updatedAt">) {
  return mutate(async () => {
    const items = await readHistoricalProfitRecords();
    const existingIndex = items.findIndex((item) => item.requestId === input.requestId);
    const now = new Date().toISOString();
    const revenueCents = Math.max(0, Math.round(input.revenueCents));
    const directCostCents = Math.max(0, Math.round(input.directCostCents));
    const contributionProfitCents = revenueCents - directCostCents;
    const contributionMarginBasisPoints = revenueCents > 0 ? Math.round((contributionProfitCents / revenueCents) * 10_000) : 0;
    const existing = existingIndex >= 0 ? items[existingIndex] : null;
    const record: HistoricalProfitRecord = {
      id: existing?.id || `historical-profit:${input.requestId}`,
      requestId: input.requestId,
      requestCode: input.requestCode,
      completedAt: input.completedAt,
      revenueCents,
      directCostCents,
      contributionProfitCents,
      contributionMarginBasisPoints,
      note: input.note.trim(),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    if (existingIndex >= 0) items[existingIndex] = record;
    else items.push(record);
    await writeCollection(COLLECTION, items);
    return record;
  });
}
