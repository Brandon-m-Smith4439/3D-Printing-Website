import "server-only";
import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import type { CustomerAccount, CustomerPreferences } from "@/lib/customer-types";
import { readCollection, writeCollection } from "@/lib/database";

let mutationChain = Promise.resolve();

const DEFAULT_PREFERENCES: CustomerPreferences = {
  emailStatusUpdates: false,
  showQueuePosition: true,
};

function normalizeAccount(raw: CustomerAccount): CustomerAccount {
  return {
    ...raw,
    emailVerifiedAt: raw.emailVerifiedAt || "",
    sessionVersion: Number.isInteger(raw.sessionVersion) && raw.sessionVersion > 0 ? raw.sessionVersion : 1,
    preferences: {
      ...DEFAULT_PREFERENCES,
      ...(raw.preferences || {}),
    },
  };
}

async function readAccounts(): Promise<CustomerAccount[]> {
  return (await readCollection<CustomerAccount>("customers")).map(normalizeAccount);
}

async function writeAccounts(accounts: CustomerAccount[]) {
  await writeCollection("customers", accounts);
}

function mutate<T>(operation: () => Promise<T>): Promise<T> {
  const next = mutationChain.then(operation, operation);
  mutationChain = next.then(() => undefined, () => undefined);
  return next;
}

export function normalizeCustomerEmail(email: string) { return email.trim().toLowerCase(); }

async function hashPassword(password: string, saltHex: string) {
  return new Promise<string>((resolve, reject) => {
    scryptCallback(password, Buffer.from(saltHex, "hex"), 64, (error, derivedKey) => {
      if (error) { reject(error); return; }
      resolve(Buffer.from(derivedKey).toString("hex"));
    });
  });
}

export async function createCustomerAccount(displayName: string, email: string, password: string, preferences: Partial<CustomerPreferences> = {}) {
  return mutate(async () => {
    const accounts = await readAccounts();
    const normalized = normalizeCustomerEmail(email);
    if (accounts.some((account) => account.email === normalized)) return { account: null, exists: true } as const;
    const salt = randomBytes(16).toString("hex");
    const now = new Date().toISOString();
    const account: CustomerAccount = {
      id: randomUUID(),
      email: normalized,
      displayName: displayName.trim(),
      passwordSalt: salt,
      passwordHash: await hashPassword(password, salt),
      emailVerifiedAt: "",
      sessionVersion: 1,
      preferences: { ...DEFAULT_PREFERENCES, ...preferences },
      createdAt: now,
      updatedAt: now,
    };
    accounts.push(account);
    await writeAccounts(accounts);
    return { account, exists: false } as const;
  });
}

export async function findCustomerByEmail(email: string) {
  const normalized = normalizeCustomerEmail(email);
  const accounts = await readAccounts();
  return accounts.find((account) => account.email === normalized) || null;
}

export async function findCustomerById(id: string) {
  const accounts = await readAccounts();
  return accounts.find((account) => account.id === id) || null;
}

export async function customerEmailInUse(email: string, excludeCustomerId = "") {
  const normalized = normalizeCustomerEmail(email);
  const accounts = await readAccounts();
  return accounts.some((account) => account.id !== excludeCustomerId && account.email === normalized);
}

export async function verifyCustomerPassword(account: CustomerAccount, password: string) {
  const supplied = Buffer.from(await hashPassword(password, account.passwordSalt), "hex");
  const expected = Buffer.from(account.passwordHash, "hex");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function updateCustomerProfile(
  id: string,
  values: { displayName?: string; preferences?: Partial<CustomerPreferences> },
) {
  return mutate(async () => {
    const accounts = await readAccounts();
    const index = accounts.findIndex((account) => account.id === id);
    if (index < 0) return null;
    accounts[index] = {
      ...accounts[index],
      ...(values.displayName !== undefined ? { displayName: values.displayName.trim() } : {}),
      preferences: { ...accounts[index].preferences, ...(values.preferences || {}) },
      updatedAt: new Date().toISOString(),
    };
    await writeAccounts(accounts);
    return accounts[index];
  });
}

export async function markCustomerEmailVerified(id: string, email: string) {
  return mutate(async () => {
    const accounts = await readAccounts();
    const index = accounts.findIndex((account) => account.id === id);
    if (index < 0) return null;
    if (accounts[index].email !== normalizeCustomerEmail(email)) return null;
    const now = new Date().toISOString();
    accounts[index] = { ...accounts[index], emailVerifiedAt: now, updatedAt: now };
    await writeAccounts(accounts);
    return accounts[index];
  });
}

export async function updateCustomerEmail(id: string, email: string) {
  return mutate(async () => {
    const accounts = await readAccounts();
    const index = accounts.findIndex((account) => account.id === id);
    if (index < 0) return null;
    const normalized = normalizeCustomerEmail(email);
    if (accounts.some((account) => account.id !== id && account.email === normalized)) return null;
    const now = new Date().toISOString();
    accounts[index] = { ...accounts[index], email: normalized, emailVerifiedAt: now, sessionVersion: accounts[index].sessionVersion + 1, updatedAt: now };
    await writeAccounts(accounts);
    return accounts[index];
  });
}

export async function replaceCustomerPassword(id: string, password: string) {
  return mutate(async () => {
    const accounts = await readAccounts();
    const index = accounts.findIndex((account) => account.id === id);
    if (index < 0) return null;
    const salt = randomBytes(16).toString("hex");
    accounts[index] = {
      ...accounts[index],
      passwordSalt: salt,
      passwordHash: await hashPassword(password, salt),
      sessionVersion: accounts[index].sessionVersion + 1,
      updatedAt: new Date().toISOString(),
    };
    await writeAccounts(accounts);
    return accounts[index];
  });
}
