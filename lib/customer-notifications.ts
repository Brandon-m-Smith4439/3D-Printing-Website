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

async function maybeEmail(request: StoredRequest, message: string, subject?: string) {
  if (!request.customerAccountId) return;
  const account = await findCustomerById(request.customerAccountId);
  const wantsEmail = request.emailNotifications ?? account?.preferences.emailStatusUpdates ?? false;
  if (!account?.emailVerifiedAt || !wantsEmail) return;
  const apiKey = process.env.RESEND_API_KEY || "";
  const from = process.env.REQUEST_FROM_EMAIL || "";
  if (!apiKey || apiKey.startsWith("YOUR_") || !from || from.includes("yourdomain.com")) {
    if (process.env.NODE_ENV !== "production") console.info("Customer status notification (development):", account.email, message);
    return;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [account.email],
      subject: subject || `${request.requestCode} status update`,
      text: `Your 3D print request has an update:\n\n${message}\n\nRequest: ${request.requestCode}`,
    }),
  });
  if (!response.ok) console.error("Customer status notification email failed", response.status, await response.text().catch(() => ""));
}

type NotificationOptions = { email?: boolean; notificationId?: string; subject?: string };

export async function notifyCustomer(request: StoredRequest, message: string, options: NotificationOptions = {}) {
  if (!request.customerAccountId) return;
  await mutate(async () => {
    const items = await readAll();
    if (options.notificationId && items.some((item) => item.id === options.notificationId)) return;
    items.push({ id: options.notificationId || randomUUID(), customerId: request.customerAccountId || "", requestId: request.id, requestCode: request.requestCode, message, createdAt: new Date().toISOString(), readAt: "" });
    await writeAll(items);
  });
  if (options.email !== false) await maybeEmail(request, message, options.subject).catch((error) => console.error("Customer notification email error", error));
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
