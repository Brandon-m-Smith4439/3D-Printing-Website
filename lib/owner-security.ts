import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { readSingleton, writeSingleton } from "@/lib/database";
import { base32Encode, generateTotpSecret, verifyTotpCode } from "@/lib/owner-totp";

const COLLECTION = "owner-security";
const PENDING_TTL_MS = 15 * 60 * 1000;

export type OwnerSecurityState = {
  twoFactorEnabled: boolean;
  totpSecretCiphertext: string;
  pendingTotpSecretCiphertext: string;
  pendingTotpCreatedAt: string;
  recoveryCodeHashes: string[];
  recoveryCodesGeneratedAt: string;
  enrolledAt: string;
  lastRecoveryUsedAt: string;
  sessionGeneration: number;
  updatedAt: string;
};

function masterSecret() {
  const configured = process.env.OWNER_SESSION_SECRET || "";
  if (process.env.NODE_ENV === "production") {
    if (configured.length < 32 || configured === "replace-with-a-long-random-secret-before-production") {
      throw new Error("Owner session secret is not configured.");
    }
    return configured;
  }
  return configured || "development-only-session-secret-change-before-production";
}

function encryptionKey() {
  return createHash("sha256").update(`mesh-harbor-owner-2fa:${masterSecret()}`).digest();
}

function recoveryKey() {
  return createHash("sha256").update(`mesh-harbor-owner-recovery:${masterSecret()}`).digest();
}

function normalizeState(raw?: Partial<OwnerSecurityState> | null): OwnerSecurityState {
  return {
    twoFactorEnabled: Boolean(raw?.twoFactorEnabled),
    totpSecretCiphertext: raw?.totpSecretCiphertext || "",
    pendingTotpSecretCiphertext: raw?.pendingTotpSecretCiphertext || "",
    pendingTotpCreatedAt: raw?.pendingTotpCreatedAt || "",
    recoveryCodeHashes: Array.isArray(raw?.recoveryCodeHashes) ? raw.recoveryCodeHashes.filter((item): item is string => typeof item === "string") : [],
    recoveryCodesGeneratedAt: raw?.recoveryCodesGeneratedAt || "",
    enrolledAt: raw?.enrolledAt || "",
    lastRecoveryUsedAt: raw?.lastRecoveryUsedAt || "",
    sessionGeneration: Math.max(1, Math.floor(Number(raw?.sessionGeneration || 1))),
    updatedAt: raw?.updatedAt || "",
  };
}

export async function readOwnerSecurityState() {
  return normalizeState(await readSingleton<OwnerSecurityState>(COLLECTION));
}

async function writeOwnerSecurityState(state: OwnerSecurityState) {
  const next = { ...normalizeState(state), updatedAt: new Date().toISOString() };
  await writeSingleton(COLLECTION, next);
  return next;
}

function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

function decryptSecret(value: string) {
  const [version, ivEncoded, tagEncoded, ciphertextEncoded] = value.split(".");
  if (version !== "v1" || !ivEncoded || !tagEncoded || !ciphertextEncoded) throw new Error("Owner 2FA secret could not be decrypted.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivEncoded, "base64url"));
  decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextEncoded, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function normalizeRecoveryCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function hashRecoveryCode(value: string) {
  return createHmac("sha256", recoveryKey()).update(normalizeRecoveryCode(value)).digest("hex");
}

function hashMatches(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function generateRecoveryCodes(count = 10) {
  return Array.from({ length: Math.max(1, Math.min(20, count)) }, () => {
    const body = base32Encode(randomBytes(8)).slice(0, 12);
    return `MH3D-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}`;
  });
}

export async function beginOwnerTotpEnrollment() {
  const state = await readOwnerSecurityState();
  const secret = generateTotpSecret();
  const now = new Date().toISOString();
  await writeOwnerSecurityState({
    ...state,
    pendingTotpSecretCiphertext: encryptSecret(secret),
    pendingTotpCreatedAt: now,
  });
  return { secret, createdAt: now };
}

export async function enableOwnerTotp(code: string) {
  const state = await readOwnerSecurityState();
  if (!state.pendingTotpSecretCiphertext || !state.pendingTotpCreatedAt) throw new Error("Start two-factor setup first.");
  const createdAt = Date.parse(state.pendingTotpCreatedAt);
  if (!Number.isFinite(createdAt) || Date.now() - createdAt > PENDING_TTL_MS) {
    await writeOwnerSecurityState({ ...state, pendingTotpSecretCiphertext: "", pendingTotpCreatedAt: "" });
    throw new Error("Two-factor setup expired. Start again.");
  }
  const secret = decryptSecret(state.pendingTotpSecretCiphertext);
  if (!verifyTotpCode(secret, code)) throw new Error("Authenticator code was not accepted.");
  const recoveryCodes = generateRecoveryCodes(10);
  const now = new Date().toISOString();
  const next = await writeOwnerSecurityState({
    ...state,
    twoFactorEnabled: true,
    totpSecretCiphertext: encryptSecret(secret),
    pendingTotpSecretCiphertext: "",
    pendingTotpCreatedAt: "",
    recoveryCodeHashes: recoveryCodes.map(hashRecoveryCode),
    recoveryCodesGeneratedAt: now,
    enrolledAt: now,
  });
  return { state: next, recoveryCodes };
}

export async function verifyOwnerSecondFactor(value: string) {
  const state = await readOwnerSecurityState();
  if (!state.twoFactorEnabled || !state.totpSecretCiphertext) return { ok: false as const, method: "none" as const, state };
  const secret = decryptSecret(state.totpSecretCiphertext);
  if (verifyTotpCode(secret, value)) return { ok: true as const, method: "totp" as const, state };

  const candidate = hashRecoveryCode(value);
  const index = state.recoveryCodeHashes.findIndex((stored) => hashMatches(stored, candidate));
  if (index < 0) return { ok: false as const, method: "invalid" as const, state };

  const remaining = state.recoveryCodeHashes.filter((_, itemIndex) => itemIndex !== index);
  const next = await writeOwnerSecurityState({
    ...state,
    recoveryCodeHashes: remaining,
    lastRecoveryUsedAt: new Date().toISOString(),
  });
  return { ok: true as const, method: "recovery" as const, state: next };
}

export async function regenerateOwnerRecoveryCodes(totpCode: string) {
  const state = await readOwnerSecurityState();
  if (!state.twoFactorEnabled || !state.totpSecretCiphertext) throw new Error("Two-factor authentication is not enabled.");
  const secret = decryptSecret(state.totpSecretCiphertext);
  if (!verifyTotpCode(secret, totpCode)) throw new Error("Authenticator code was not accepted.");
  const recoveryCodes = generateRecoveryCodes(10);
  const now = new Date().toISOString();
  const next = await writeOwnerSecurityState({
    ...state,
    recoveryCodeHashes: recoveryCodes.map(hashRecoveryCode),
    recoveryCodesGeneratedAt: now,
  });
  return { state: next, recoveryCodes };
}

export async function disableOwnerTotp() {
  const state = await readOwnerSecurityState();
  return writeOwnerSecurityState({
    ...state,
    twoFactorEnabled: false,
    totpSecretCiphertext: "",
    pendingTotpSecretCiphertext: "",
    pendingTotpCreatedAt: "",
    recoveryCodeHashes: [],
    recoveryCodesGeneratedAt: "",
    enrolledAt: "",
    lastRecoveryUsedAt: "",
    sessionGeneration: state.sessionGeneration + 1,
  });
}

export async function advanceOwnerSessionGeneration() {
  const state = await readOwnerSecurityState();
  return writeOwnerSecurityState({ ...state, sessionGeneration: state.sessionGeneration + 1 });
}

export async function ownerSecurityStatus() {
  const state = await readOwnerSecurityState();
  return {
    twoFactorEnabled: state.twoFactorEnabled,
    recoveryCodesRemaining: state.recoveryCodeHashes.length,
    recoveryCodesGeneratedAt: state.recoveryCodesGeneratedAt,
    enrolledAt: state.enrolledAt,
    lastRecoveryUsedAt: state.lastRecoveryUsedAt,
    sessionGeneration: state.sessionGeneration,
    pendingEnrollment: Boolean(state.pendingTotpSecretCiphertext && state.pendingTotpCreatedAt),
  };
}
