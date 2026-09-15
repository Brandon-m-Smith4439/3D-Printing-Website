import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import type { CustomRequest } from "@/lib/request-schema";
import type { RequestAttachment, RequestStatus, StoredRequest } from "@/lib/request-types";
import { readCollection, writeCollection } from "@/lib/database";

let mutationChain = Promise.resolve();

export async function readRequests(): Promise<StoredRequest[]> {
  return readCollection<StoredRequest>("requests");
}

async function writeRequestsNow(requests: StoredRequest[]) {
  await writeCollection("requests", requests);
}

function mutate<T>(operation: () => Promise<T>): Promise<T> {
  const next = mutationChain.then(operation, operation);
  mutationChain = next.then(() => undefined, () => undefined);
  return next;
}

function makeRequestCode() {
  return `REQ-${randomBytes(3).toString("hex").toUpperCase()}`;
}

export async function createStoredRequest(
  values: CustomRequest,
  metadata: { neededBySubmitted?: string; riskFlags?: string[]; customerAccountId?: string; attachments?: RequestAttachment[] } = {},
) {
  return mutate(async () => {
    const requests = await readRequests();
    const now = new Date().toISOString();
    const stored: StoredRequest = {
      id: randomUUID(),
      requestCode: makeRequestCode(),
      status: "new",
      name: values.name,
      email: values.email,
      phone: values.phone,
      projectType: values.projectType,
      modelStatus: values.modelStatus,
      fulfillmentMethod: values.fulfillmentMethod,
      quantity: values.quantity,
      dimensions: values.dimensions,
      materialPreference: values.materialPreference,
      colorPreference: values.colorPreference,
      budget: values.budget,
      neededBy: values.neededBy,
      neededBySubmitted: metadata.neededBySubmitted || values.neededBy,
      referenceUrl: values.referenceUrl,
      description: values.description,
      imageUrl: "",
      attachments: metadata.attachments || [],
      internalNote: "",
      createdAt: now,
      updatedAt: now,
      queuedAt: "",
      queueJobId: "",
      customerAccountId: metadata.customerAccountId || "",
      riskLevel: metadata.riskFlags?.length ? "review" : "none",
      riskFlags: metadata.riskFlags || [],
    };
    requests.push(stored);
    await writeRequestsNow(requests);
    return stored;
  });
}

export async function getStoredRequest(id: string) {
  const requests = await readRequests();
  return requests.find((item) => item.id === id) || null;
}

export async function updateStoredRequest(
  id: string,
  values: Partial<Pick<StoredRequest, "status" | "imageUrl" | "internalNote" | "queuedAt" | "queueJobId">>,
) {
  return mutate(async () => {
    const requests = await readRequests();
    const index = requests.findIndex((item) => item.id === id);
    if (index < 0) return null;
    requests[index] = { ...requests[index], ...values, updatedAt: new Date().toISOString() };
    await writeRequestsNow(requests);
    return requests[index];
  });
}

export async function claimGuestRequestsByEmail(customerAccountId: string, email: string) {
  const normalized = email.trim().toLowerCase();
  if (!customerAccountId || !normalized) return 0;
  return mutate(async () => {
    const requests = await readRequests();
    let claimed = 0;
    const now = new Date().toISOString();
    for (let index = 0; index < requests.length; index++) {
      const item = requests[index];
      if (!item.customerAccountId && item.email.trim().toLowerCase() === normalized) {
        requests[index] = { ...item, customerAccountId, updatedAt: now };
        claimed += 1;
      }
    }
    if (claimed) await writeRequestsNow(requests);
    return claimed;
  });
}

export async function deleteStoredRequest(id: string) {
  return mutate(async () => {
    const requests = await readRequests();
    const filtered = requests.filter((item) => item.id !== id);
    if (filtered.length === requests.length) return false;
    await writeRequestsNow(filtered);
    return true;
  });
}

export function statusLabel(status: RequestStatus) {
  return ({
    new: "New",
    reviewing: "Reviewing",
    quoted: "Quote sent",
    accepted: "Quote accepted",
    "deposit-paid": "Deposit paid",
    declined: "Declined",
    queued: "In queue",
    completed: "Completed",
  } as const)[status];
}
