import { NextRequest, NextResponse } from "next/server";
import { requestIsOwner } from "@/lib/owner-auth";
import { sameOrigin } from "@/lib/owner-api";
import { sendCompletionEmail } from "@/lib/completion-email";
import { readQueue, updateQueueJob, deleteQueueJob } from "@/lib/queue-store";
import { getStoredRequest, updateStoredRequest } from "@/lib/request-store";
import { notifyCustomer } from "@/lib/customer-notifications";
import { updateQueueJobSchema } from "@/lib/queue-types";
import { requestIpHash, writeAudit } from "@/lib/audit-log";
import { quoteForRequest } from "@/lib/quote-store";
import { autoBuyLabelIfEligible } from "@/lib/shipping-service";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!requestIsOwner(request)) {
    return NextResponse.json({ message: "Sign in required." }, { status: 401 });
  }
  if (!sameOrigin(request)) {
    return NextResponse.json({ message: "Request origin was not accepted." }, { status: 403 });
  }

  const { id } = await context.params;
  const contentType = request.headers.get("content-type") || "";
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (!contentType.includes("application/json")) {
    return NextResponse.json({ message: "Unsupported request format." }, { status: 415 });
  }
  if (contentLength > 12_000) {
    return NextResponse.json({ message: "Queue request is too large." }, { status: 413 });
  }

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 12_000) return NextResponse.json({ message: "Queue request is too large." }, { status: 413 });
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ message: "Invalid request body." }, { status: 400 });
  }

  const parsed = updateQueueJobSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Please check the queue job fields." }, { status: 400 });
  }

  const jobs = await readQueue();
  const existing = jobs.find((job) => job.id === id);
  if (!existing) return NextResponse.json({ message: "Queue job not found." }, { status: 404 });

  let emailSentAt: string | undefined;
  let emailWarning = "";
  const completing = parsed.data.status === "completed" && existing.status !== "completed";

  if (completing) {
    try {
      const result = await sendCompletionEmail({ ...existing, ...parsed.data });
      if (result.sent) emailSentAt = new Date().toISOString();
      if (result.developmentOnly) {
        emailWarning = "Development mode: completion email was logged instead of sent because Resend is not configured.";
      }
    } catch (error) {
      console.error("Completion email failed", error);
      emailWarning = "The job was marked completed, but the completion email could not be sent. The customer still has the in-app completion update.";
    }
  }

  const job = await updateQueueJob(id, parsed.data, emailSentAt);
  let shippingWarning = "";
  if (job?.sourceRequestId && parsed.data.status === "ready" && parsed.data.status !== existing.status && job.fulfillmentMethod === "shipping") {
    const autoShipping = await autoBuyLabelIfEligible(job.sourceRequestId);
    shippingWarning = autoShipping.warning;
  }
  if (job?.sourceRequestId && parsed.data.status && parsed.data.status !== existing.status) {
    const sourceBefore = await getStoredRequest(job.sourceRequestId);
    if (job.status === "completed") {
      const sourceAfter = await updateStoredRequest(job.sourceRequestId, { status: "completed" });
      if (sourceAfter) await notifyCustomer(sourceAfter, "Your print is complete.", { email: false });
    } else if (sourceBefore) {
      const labels: Record<string, string> = {
        queued: "Your print is in the production queue.",
        preparing: "Your print is being prepared and sliced for production.",
        printing: "Your print is now printing.",
        finishing: "Your print is in finishing and cleanup.",
        ready: "Your print is ready for pickup or shipping.",
        "on-hold": "Your print is currently on hold. We will update you when production resumes.",
      };
      await notifyCustomer(sourceBefore, labels[job.status] || `Your print status is now ${job.status}.`);
    }
  }
  await writeAudit({actor:"owner",actorId:"owner",action:"queue-job-updated",targetType:"queue",targetId:id,summary:`${existing.publicCode} updated${parsed.data.status ? ` to ${parsed.data.status}` : ""}.`,ipHash:requestIpHash(request)});
  return NextResponse.json({ job, emailWarning, shippingWarning });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!requestIsOwner(request)) {
    return NextResponse.json({ message: "Sign in required." }, { status: 401 });
  }
  if (!sameOrigin(request)) {
    return NextResponse.json({ message: "Request origin was not accepted." }, { status: 403 });
  }
  const { id } = await context.params;
  const jobs = await readQueue();
  const existing = jobs.find((job) => job.id === id);
  const deleted = await deleteQueueJob(id);
  if (deleted && existing?.sourceRequestId) {
    const quote = await quoteForRequest(existing.sourceRequestId);
    const restoredStatus = quote?.depositPaidAt
      ? "deposit-paid"
      : quote?.status === "approved"
        ? "accepted"
        : quote?.status === "sent"
          ? "quoted"
          : "reviewing";
    const source = await updateStoredRequest(existing.sourceRequestId, { status: restoredStatus, queueJobId: "", queuedAt: "" });
    if (source) {
      await notifyCustomer(
        source,
        quote?.depositPaidAt
          ? "Your request was removed from the active production queue. Your deposit remains recorded while production details are reviewed."
          : "Your request was removed from the active production queue and returned to review. No deposit is recorded for this request.",
      );
    }
  }
  if (deleted) await writeAudit({actor:"owner",actorId:"owner",action:"queue-job-removed",targetType:"queue",targetId:id,summary:`${existing?.publicCode || id} removed from active production queue.`,ipHash:requestIpHash(request)});
  return deleted
    ? NextResponse.json({ message: "Queue job deleted." })
    : NextResponse.json({ message: "Queue job not found." }, { status: 404 });
}
