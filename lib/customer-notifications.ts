import "server-only";
import { randomUUID } from "node:crypto";
import type { CustomerNotification } from "./customer-types.ts";
import type { StoredRequest } from "./request-types.ts";
import { findCustomerById } from "./customer-store.ts";
import { readCollection, writeCollection } from "./database.ts";

let mutationChain = Promise.resolve();

async function readAll(): Promise<CustomerNotification[]> {
  return readCollection<CustomerNotification>("notifications");
}

async function writeAll(items: CustomerNotification[]) {
  await writeCollection("notifications", items);
}

function mutate<T>(operation: () => Promise<T>): Promise<T> {
  const next = mutationChain.then(operation, operation);
  mutationChain = next.then(() => undefined, () => undefined);
  return next;
}

async function maybeEmail(request: StoredRequest, message: string, subject?: string, forceEmail = false, idempotencyKey?:string) {
  const account = request.customerAccountId ? await findCustomerById(request.customerAccountId) : null;
  const wantsEmail = forceEmail || (request.emailNotifications ?? account?.preferences.emailStatusUpdates ?? false);
  const recipient = account?.emailVerifiedAt ? account.email : request.email.trim().toLowerCase();
  if (!recipient || !wantsEmail) return "skipped" as const;

  const apiKey = process.env.RESEND_API_KEY || "";
  const from = process.env.REQUEST_FROM_EMAIL || "";
  if (!apiKey || apiKey.startsWith("YOUR_") || !from || from.includes("yourdomain.com")) {
    if (process.env.NODE_ENV !== "production") console.info("Customer status notification (development):", recipient, message);
    return "unconfigured" as const;
  }

  const replyTo = (process.env.REQUEST_REPLY_TO_EMAIL || from).trim();
  const origin = (process.env.NEXT_PUBLIC_SITE_URL || (process.env.NODE_ENV === "production" ? "https://meshharbor3d.com" : "http://127.0.0.1:3000")).replace(/\/$/, "");
  const requestUrl = account?.emailVerifiedAt
    ? `${origin}/profile`
    : (await import("./guest-access.ts")).guestAccessUrl(request);
  const body = JSON.stringify({
    from, to: [recipient], reply_to: replyTo,
    subject: subject || `${request.requestCode} status update`,
    text: `Your Mesh Harbor 3D request has an update:\n\n${message}\n\nRequest: ${request.requestCode}\n\nView your request securely: ${requestUrl}\n\nIf you did not make this request, reply to this email so Mesh Harbor 3D can review it.`,
  });
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST", signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", ...(idempotencyKey ? {"Idempotency-Key": idempotencyKey} : {}) },
        body,
      });
      if (response.ok) return "sent" as const;
      if (response.status !== 429 && response.status < 500) {
        console.error("Customer status notification email failed", response.status);
        return "failed" as const;
      }
    } catch {
      // Retry transient network failures with the same payload and send key.
    }
    if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt));
  }
  console.error("Customer status notification retries exhausted");
  return "failed" as const;
}

type NotificationOptions = { email?: boolean; notificationId?: string; subject?: string; forceEmail?: boolean; emailIdempotencyKey?:string };

export async function notifyCustomer(request: StoredRequest, message: string, options: NotificationOptions = {}) {
  if (request.customerAccountId) {
    await mutate(async () => {
      const items = await readAll();
      if (options.notificationId && items.some((item) => item.id === options.notificationId)) return;
      items.push({ id: options.notificationId || randomUUID(), customerId: request.customerAccountId || "", requestId: request.id, requestCode: request.requestCode, message, createdAt: new Date().toISOString(), readAt: "" });
      await writeAll(items);
    });
  }
  const emailStatus=options.email!==false?await maybeEmail(request,message,options.subject,Boolean(options.forceEmail),options.emailIdempotencyKey||options.notificationId||`notification-${randomUUID()}`).catch(()=>{console.error("Customer notification email error");return "failed" as const;}):"skipped";
  return {emailStatus};
}

export async function notificationsForCustomer(customerId: string) {
  const items = await readAll();
  return items.filter((item) => item.customerId === customerId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function markCustomerNotificationsRead(customerId: string) {
  return mutate(async () => {
    const items = await readAll();
    const now = new Date().toISOString();
    let changed = false;
    for (const item of items) {
      if (item.customerId === customerId && !item.readAt) { item.readAt = now; changed = true; }
    }
    if (changed) await writeAll(items);
  });
}

export async function deleteNotificationsForRequest(requestId: string) {
  return mutate(async () => {
    const items = await readAll();
    const filtered = items.filter((item) => item.requestId !== requestId);
    if (filtered.length !== items.length) await writeAll(filtered);
  });
}
