import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { deletePrivateObject, privateObjectPath, privateObjectRoot } from "@/lib/private-object-store";
import { readCollection, writeCollection } from "@/lib/database";

export type CustomerUploadKind = "image" | "model";
export type CustomerUploadRecord = {
  id: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  kind: CustomerUploadKind;
  size: number;
  scanStatus: "clean" | "development-unscanned";
  claimHash: string;
  requestId: string;
  createdAt: string;
};
export type CustomerUploadClaim = { id: string; token: string };

const OLD_UPLOAD_DIR = path.join(process.cwd(), "data", "customer-uploads");
const STORAGE_ROOT = privateObjectRoot();
const UPLOAD_DIR = path.join(STORAGE_ROOT, "customer-uploads");
let mutationChain = Promise.resolve();
let storageReady = false;

async function ensureStorage() {
  if (storageReady) return;
  await mkdir(UPLOAD_DIR, { recursive: true });
  try {
    const old = await stat(OLD_UPLOAD_DIR);
    if (old.isDirectory() && OLD_UPLOAD_DIR !== UPLOAD_DIR) { const { cp } = await import("node:fs/promises"); await cp(OLD_UPLOAD_DIR, UPLOAD_DIR, { recursive: true, force: false, errorOnExist: false }); }
  } catch { /* no legacy directory */ }
  storageReady = true;
}

async function readAll(): Promise<CustomerUploadRecord[]> {
  await ensureStorage();
  return readCollection<CustomerUploadRecord>("customer-uploads");
}
async function writeAll(items: CustomerUploadRecord[]) { await writeCollection("customer-uploads", items); }
function mutate<T>(operation: () => Promise<T>): Promise<T> { const next = mutationChain.then(operation, operation); mutationChain = next.then(() => undefined, () => undefined); return next; }
function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }

export function customerUploadPath(record: CustomerUploadRecord) { return privateObjectPath(`customer-uploads/${record.storedName}`); }
export function privateStorageRoot() { return STORAGE_ROOT; }
export function customerUploadStorageDir() { return UPLOAD_DIR; }

export async function createCustomerUpload(input: Omit<CustomerUploadRecord, "id" | "claimHash" | "requestId" | "createdAt">) {
  return mutate(async () => {
    const items = await readAll();
    const token = randomBytes(32).toString("base64url");
    const record: CustomerUploadRecord = { ...input, id: randomUUID(), claimHash: hash(token), requestId: "", createdAt: new Date().toISOString() };
    items.push(record); await writeAll(items); return { record, token };
  });
}

export async function validateCustomerUploadClaims(claims: CustomerUploadClaim[]) {
  const items = await readAll(); const found: CustomerUploadRecord[] = [];
  for (const claim of claims) {
    const item = items.find((candidate) => candidate.id === claim.id);
    if (!item || item.requestId || item.claimHash !== hash(claim.token)) return null;
    found.push(item);
  }
  return found;
}

export async function claimCustomerUploads(claims: CustomerUploadClaim[], requestId: string) {
  return mutate(async () => {
    const items = await readAll();
    for (const claim of claims) {
      const index = items.findIndex((candidate) => candidate.id === claim.id);
      if (index < 0 || items[index].requestId || items[index].claimHash !== hash(claim.token)) return false;
      items[index] = { ...items[index], requestId, claimHash: "" };
    }
    await writeAll(items); return true;
  });
}

export async function getCustomerUploadForOwner(id: string) {
  const items = await readAll(); return items.find((item) => item.id === id && Boolean(item.requestId)) || null;
}

export async function cleanupOrphanCustomerUploads(maxAgeMs = 2 * 60 * 60_000) {
  return mutate(async () => {
    const items = await readAll(); const now = Date.now(); const keep: CustomerUploadRecord[] = [];
    for (const item of items) {
      if (!item.requestId && now - new Date(item.createdAt).getTime() > maxAgeMs) await deletePrivateObject(`customer-uploads/${item.storedName}`);
      else keep.push(item);
    }
    if (keep.length !== items.length) await writeAll(keep);
  });
}

export async function deleteCustomerUploadsForRequest(requestId: string) {
  return mutate(async () => {
    const items = await readAll(); const remove = items.filter((item) => item.requestId === requestId);
    for (const item of remove) await deletePrivateObject(`customer-uploads/${item.storedName}`);
    if (remove.length) await writeAll(items.filter((item) => item.requestId !== requestId));
  });
}
