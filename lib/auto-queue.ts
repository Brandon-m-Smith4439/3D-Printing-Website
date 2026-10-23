import "server-only";
import { getStoredRequest, updateStoredRequest } from "@/lib/request-store";
import { createQueueJob } from "@/lib/queue-store";
import { quoteForRequest } from "@/lib/quote-store";
import { quoteDepositSatisfied } from "@/lib/quote-types";
import { notifyCustomer } from "@/lib/customer-notifications";
import { writeAudit } from "@/lib/audit-log";
import { alertOwner } from "@/lib/owner-alerts";

export function defaultQueueTitle(projectType: string) {
  return ({ display: "Display / collectible print", functional: "Functional print", replacement: "Replacement part", prototype: "Prototype print", other: "Custom 3D print" } as Record<string, string>)[projectType] || "Custom 3D print";
}

/** Auto-queue is on unless AUTO_QUEUE_ON_DEPOSIT is explicitly false. */
export function autoQueueEnabled() {
  return !/^(0|false|no|off)$/i.test((process.env.AUTO_QUEUE_ON_DEPOSIT || "").trim());
}

/**
 * Adds a deposit-paid request to the production queue exactly once.
 * Returns null (no-op) when it is not eligible or already queued.
 */
export async function queueRequestAfterDeposit(requestId: string, actor: "owner" | "system" = "system") {
  const source = await getStoredRequest(requestId);
  if (!source || source.queueJobId) return null;
  const quote = await quoteForRequest(source.id);
  if (source.status !== "deposit-paid" || !quote || quote.status !== "deposit-paid" || !quoteDepositSatisfied(quote)) return null;
  const job = await createQueueJob({
    sourceRequestId: source.id, publicTitle: defaultQueueTitle(source.projectType), customerName: source.name, customerEmail: source.email,
    fulfillmentMethod: quote.fulfillmentMode, quantity: source.quantity, estimatedReadyDate: quote.estimatedReadyDate || source.neededBy,
    imageUrl: "", publicNote: "", privateNote: "", isAnonymous: Boolean(source.isAnonymous),
  });
  const updated = await updateStoredRequest(source.id, { status: "queued", queuedAt: new Date().toISOString(), queueJobId: job.id, ...(source.source === "owner" ? { ownerTrackingStatus: "queued" as const } : {}) });
  if (updated) await notifyCustomer(updated, "Your deposit is confirmed and your print has been added to the production queue.");
  await writeAudit({ actor, actorId: actor, action: "request-queued", targetType: "request", targetId: source.id, summary: `${source.requestCode} added to production after deposit confirmation.`, ipHash: "" });
  if (actor === "system") {
    await alertOwner({
      text: `MH3D ${source.requestCode} deposit paid - queued to print (qty ${source.quantity}). Print file in your email/dashboard.`,
      email: true,
      subject: `${source.requestCode} ready to print`,
      emailBody: `Deposit received and ${source.requestCode} is in the production queue.\n\nCustomer: ${source.name}\nQuantity: ${source.quantity}\nFulfillment: ${quote.fulfillmentMode}\nReady by: ${quote.estimatedReadyDate || source.neededBy || "not set"}\n\nPrint files are attached when available, and always downloadable from the owner dashboard.`,
    });
  }
  return { job, request: updated };
}
