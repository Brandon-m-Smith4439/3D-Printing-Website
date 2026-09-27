import "server-only";
import { createHash, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { readCollection, writeCollection } from "@/lib/database";

type CustomerLoginChallenge = {
  id: string;
  customerId: string;
  codeHash: string;
  createdAt: string;
  expiresAt: string;
  usedAt: string;
};

let mutationChain = Promise.resolve();

async function readAll() {
  return readCollection<CustomerLoginChallenge>("customer-login-2fa");
}

async function writeAll(items: CustomerLoginChallenge[]) {
  await writeCollection("customer-login-2fa", items);
}

function mutate<T>(operation: () => Promise<T>): Promise<T> {
  const next = mutationChain.then(operation, operation);
  mutationChain = next.then(() => undefined, () => undefined);
  return next;
}

function hashCode(code: string) {
  return createHash("sha256").update(code).digest();
}

export async function createCustomerLoginChallenge(customerId: string) {
  return mutate(async () => {
    const now = new Date();
    const items = (await readAll()).filter((item) => item.usedAt || new Date(item.expiresAt).getTime() > now.getTime());
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const challenge: CustomerLoginChallenge = {
      id: randomUUID(),
      customerId,
      codeHash: hashCode(code).toString("hex"),
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 10 * 60_000).toISOString(),
      usedAt: "",
    };
    items.push(challenge);
    await writeAll(items);
    return { challengeId: challenge.id, code, expiresAt: challenge.expiresAt };
  });
}

export async function consumeCustomerLoginChallenge(challengeId: string, code: string) {
  return mutate(async () => {
    const items = await readAll();
    const index = items.findIndex((item) => item.id === challengeId);
    if (index < 0) return { customerId: "", reason: "invalid" as const };
    const current = items[index];
    if (current.usedAt) return { customerId: "", reason: "used" as const };
    if (new Date(current.expiresAt).getTime() <= Date.now()) return { customerId: "", reason: "expired" as const };
    const supplied = hashCode(code);
    const expected = Buffer.from(current.codeHash, "hex");
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return { customerId: "", reason: "invalid" as const };
    items[index] = { ...current, usedAt: new Date().toISOString() };
    await writeAll(items);
    return { customerId: current.customerId, reason: null };
  });
}
