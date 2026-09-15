import "server-only";
import { randomUUID, createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { readCollection, writeCollection } from "@/lib/database";

export type AuditActor = "owner" | "customer" | "system";
export type AuditEntry = {
  id: string;
  actor: AuditActor;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  summary: string;
  ipHash: string;
  createdAt: string;
};

let mutationChain = Promise.resolve();
function hashIp(value: string) {
  const salt = process.env.AUDIT_IP_SALT || process.env.OWNER_SESSION_SECRET || "development-audit-salt";
  return createHash("sha256").update(`${salt}:${value}`).digest("hex").slice(0, 20);
}
export function requestIpHash(request?: NextRequest) {
  if (!request) return "";
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  return hashIp(ip);
}

export async function writeAudit(input: Omit<AuditEntry, "id" | "createdAt">) {
  const next = mutationChain.then(async () => {
    const items = await readCollection<AuditEntry>("audit-log");
    items.push({ ...input, id: randomUUID(), createdAt: new Date().toISOString() });
    if (items.length > 5000) items.splice(0, items.length - 5000);
    await writeCollection("audit-log", items);
  });
  mutationChain = next.then(() => undefined, () => undefined);
  return next;
}

export async function readAudit(limit = 250) {
  const items = await readCollection<AuditEntry>("audit-log");
  return items.sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0, Math.max(1, Math.min(1000, limit)));
}
