import "server-only";
import { randomUUID } from "node:crypto";
import type { CustomerNotification } from "./customer-types.ts";
import type { StoredRequest } from "./request-types.ts";
import { findCustomerById } from "./customer-store.ts";
import { readCollection, writeCollection } from "./database.ts";
import { guestAccessUrl } from "./guest-access.ts";

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

async function maybeEmail(request: StoredRequest, message: string, subject?: string, forceEmail = false) {
  const account = request.customerAccountId ? await findCustomerById(request.customerAccountId) : null;
  const wantsEmail = forceEmail || (request.emailNotifications ?? account?.preferences.emailStatusUpdates ?? false);
  const recipient = account?.emailVerifiedAt ? account.email : request.email.trim().toLowerCase();
  if (!recipient || !wantsEmail) return;

  const apiKey = process.env.RESEND_API_KEY || "";
  const from = process.env.REQUEST_FROM_EMAIL || "";
  if (!apiKey || apiKey.startsWith("YOUR_") || !from || from.includes("yourdomain.com")) {
    if (process.env.NODE_ENV !== "production") console.info("Customer status notification (development):", recipient, message);
    return;
  }

  const replyTo = (process.env.REQUEST_REPLY_TO_EMAIL || from).trim();
  const origin = (process.env.NEXT_PUBLIC_SITE_URL || (process.env.NODE_ENV === "production" ? "https://meshharbor3d.com" : "http://127.0.0.1:3000")).replace(/\/$/, "");
  const requestUrl = account?.emailVerifiedAt ? `${origin}/profile` : guestAccessUrl(request);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [recipient],
      reply_to: replyTo,
      subject: subject || `${request.requestCode} status update`,
      text: `Your Mesh Harbor 3D request has an update:\n\n${message}\n\nRequest: ${request.requestCode}\n\nView your request securely: ${requestUrl}\n\nIf you did not make this request, reply to this email so Mesh Harbor 3D can review it.`,
    }),
  });
  if (!response.ok) console.error("Customer status notification email failed", response.status, await response.text().catch(() => ""));
}

type NotificationOptions = { email?: boolean; notificationId?: string; subject?: string; forceEmail?: boolean };

export async function notifyCustomer(request: StoredRequest, message: string, options: NotificationOptions = {}) {
  if (request.customerAccountId) {
    await mutate(async () => {
      const items = await readAll();
      if (options.notificationId && items.some((item) => item.id === options.notificationId)) return;
      items.push({ id: options.notificationId || randomUUID(), customerId: request.customerAccountId || "", requestId: request.id, requestCode: request.requestCode, message, createdAt: new Date().toISOString(), readAt: "" });
      await writeAll(items);
    });
  }
  if (options.email !== false) await maybeEmail(request, message, options.subject, Boolean(options.forceEmail)).catch((error) => console.error("Customer notification email error", error));
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
