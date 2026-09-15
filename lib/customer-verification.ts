import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readCollection, writeCollection } from "@/lib/database";

export type VerificationPurpose = "verify-email" | "change-email" | "password-reset";

export type VerificationRecord = {
  id: string;
  customerId: string;
  purpose: VerificationPurpose;
  email: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  usedAt: string;
};

let mutationChain = Promise.resolve();

async function readAll(): Promise<VerificationRecord[]> {
  return readCollection<VerificationRecord>("account-verification");
}

async function writeAll(items: VerificationRecord[]) {
  await writeCollection("account-verification", items);
}

function mutate<T>(operation: () => Promise<T>): Promise<T> {
  const next = mutationChain.then(operation, operation);
  mutationChain = next.then(() => undefined, () => undefined);
  return next;
}

function hashToken(token: string) { return createHash("sha256").update(token).digest("hex"); }

export async function createVerificationToken(customerId: string, purpose: VerificationPurpose, email: string, ttlMs?: number) {
  return mutate(async () => {
    const now = new Date();
    const items = (await readAll()).filter((item) => {
      if (item.usedAt) return true;
      if (new Date(item.expiresAt).getTime() <= now.getTime()) return false;
      return !(item.customerId === customerId && item.purpose === purpose);
    });
    const token = randomBytes(32).toString("base64url");
    const record: VerificationRecord = {
      id: randomUUID(),
      customerId,
      purpose,
      email: email.trim().toLowerCase(),
      tokenHash: hashToken(token),
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + (ttlMs ?? (purpose === "password-reset" ? 30 * 60_000 : 60 * 60_000))).toISOString(),
      usedAt: "",
    };
    items.push(record);
    await writeAll(items);
    return { token, record };
  });
}

export async function consumeVerificationToken(token: string, expectedPurpose?: VerificationPurpose | VerificationPurpose[]) {
  return mutate(async () => {
    const items = await readAll();
    const hash = hashToken(token);
    const index = items.findIndex((item) => item.tokenHash === hash);
    if (index < 0) return { record: null, reason: "invalid" as const };
    const record = items[index];
    if (expectedPurpose) { const allowed = Array.isArray(expectedPurpose) ? expectedPurpose : [expectedPurpose]; if (!allowed.includes(record.purpose)) return { record: null, reason: "invalid" as const }; }
    if (record.usedAt) return { record: null, reason: "used" as const };
    if (new Date(record.expiresAt).getTime() <= Date.now()) return { record: null, reason: "expired" as const };
    items[index] = { ...record, usedAt: new Date().toISOString() };
    await writeAll(items);
    return { record: items[index], reason: null };
  });
}
