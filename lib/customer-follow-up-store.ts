import "server-only";
import { readCollection, readSingleton, writeCollection, writeSingleton } from "./database.ts";
import type { CustomerFollowUpRecord, CustomerFollowUpSettings, RequestFollowUpControl } from "./customer-follow-up-types.ts";

const FOLLOW_UPS = "customer-follow-ups";
const CONTROLS = "customer-follow-up-controls";
const SETTINGS = "customer-follow-up-settings";

let mutationChain = Promise.resolve();

function mutate<T>(operation: () => Promise<T>): Promise<T> {
  const next = mutationChain.then(operation, operation);
  mutationChain = next.then(() => undefined, () => undefined);
  return next;
}

function normalizeControl(requestId: string, raw?: Partial<RequestFollowUpControl> | null): RequestFollowUpControl {
  return {
    id: requestId,
    requestId,
    paused: Boolean(raw?.paused),
    waitingOnCustomer: Boolean(raw?.waitingOnCustomer),
    waitingSince: raw?.waitingSince || "",
    waitingNote: (raw?.waitingNote || "").slice(0, 300),
    updatedAt: raw?.updatedAt || "",
  };
}

export async function readFollowUps() {
  return (await readCollection<CustomerFollowUpRecord>(FOLLOW_UPS)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function followUpsForRequest(requestId: string) {
  return (await readFollowUps()).filter((item) => item.requestId === requestId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function upsertFollowUp(record: CustomerFollowUpRecord) {
  return mutate(async () => {
    const items = await readFollowUps();
    const index = items.findIndex((item) => item.id === record.id);
    const now = new Date().toISOString();
    const next: CustomerFollowUpRecord = {
      ...record,
      createdAt: index >= 0 ? items[index].createdAt : (record.createdAt || now),
      updatedAt: now,
    };
    if (index >= 0) items[index] = next; else items.push(next);
    await writeCollection(FOLLOW_UPS, items);
    return next;
  });
}

export function updateFollowUp(id: string, patch: Partial<CustomerFollowUpRecord>) {
  return mutate(async () => {
    const items = await readFollowUps();
    const index = items.findIndex((item) => item.id === id);
    if (index < 0) return null;
    items[index] = { ...items[index], ...patch, id, updatedAt: new Date().toISOString() };
    await writeCollection(FOLLOW_UPS, items);
    return items[index];
  });
}

export async function getFollowUpSettings(): Promise<CustomerFollowUpSettings> {
  const saved = await readSingleton<CustomerFollowUpSettings>(SETTINGS);
  return saved ? {
    enabled: Boolean(saved.enabled),
    updatedAt: saved.updatedAt || "",
    updatedBy: saved.updatedBy === "owner" ? "owner" : "system",
  } : { enabled: false, updatedAt: "", updatedBy: "system" };
}

export function updateFollowUpSettings(enabled: boolean, actor: "owner" | "system" = "owner") {
  return mutate(async () => {
    const next: CustomerFollowUpSettings = { enabled: Boolean(enabled), updatedAt: new Date().toISOString(), updatedBy: actor };
    await writeSingleton(SETTINGS, next);
    return next;
  });
}

export async function readFollowUpControls() {
  return (await readCollection<RequestFollowUpControl>(CONTROLS)).map((item) => normalizeControl(item.requestId || item.id, item));
}

export async function followUpControlForRequest(requestId: string) {
  const items = await readFollowUpControls();
  return items.find((item) => item.requestId === requestId) || normalizeControl(requestId);
}

export function updateFollowUpControl(requestId: string, patch: Partial<Omit<RequestFollowUpControl, "id" | "requestId" | "updatedAt">>) {
  return mutate(async () => {
    const items = await readFollowUpControls();
    const index = items.findIndex((item) => item.requestId === requestId);
    const current = index >= 0 ? items[index] : normalizeControl(requestId);
    const settingWaiting = patch.waitingOnCustomer === true && !current.waitingOnCustomer;
    if (settingWaiting && !patch.waitingSince) throw new Error("waitingSince is required when marking a request as waiting on customer.");
    const next = normalizeControl(requestId, {
      ...current,
      ...patch,
      waitingNote: patch.waitingNote !== undefined ? patch.waitingNote.slice(0, 300) : current.waitingNote,
      updatedAt: new Date().toISOString(),
    });
    if (index >= 0) items[index] = next; else items.push(next);
    await writeCollection(CONTROLS, items);
    return next;
  });
}
