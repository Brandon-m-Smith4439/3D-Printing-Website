import { NextRequest, NextResponse } from "next/server";
import { requestIsOwner } from "@/lib/owner-auth";
import { sameOrigin } from "@/lib/owner-api";
import { readQueue } from "@/lib/queue-store";
import { getStoredRequest } from "@/lib/request-store";
import { ensureFinalInvoiceForRequest } from "@/lib/final-invoice-service";
import { notifyCustomer } from "@/lib/customer-notifications";
import { requestIpHash, writeAudit } from "@/lib/audit-log";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!requestIsOwner(request)) return NextResponse.json({ message: "Sign in required." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ message: "Request origin was not accepted." }, { status: 403 });

  const { id } = await context.params;
  const source = await getStoredRequest(id);
  if (!source) return NextResponse.json({ message: "Request not found." }, { status: 404 });

  const jobs = await readQueue();
  const job = source.queueJobId ? jobs.find((item) => item.id === source.queueJobId) : null;
  if (!job || !["ready", "completed"].includes(job.status)) {
    return NextResponse.json({ message: "Mark production Ready before sending the final balance invoice." }, { status: 409 });
  }

  try {
    const invoice = await ensureFinalInvoiceForRequest(id);
    if (invoice.status === "open" && !invoice.paidAt) {
      await notifyCustomer(
        source,
        `Your final balance invoice for ${source.requestCode} is ready. Remaining balance: ${(invoice.amountRemainingCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}.`,
        { email: false },
      );
    }
    await writeAudit({
      actor: "owner",
      actorId: "owner",
      action: "final-invoice-sent",
      targetType: "request",
      targetId: source.id,
      summary: `Final Stripe invoice ${invoice.stripeInvoiceNumber || invoice.stripeInvoiceId} is ${invoice.status} for ${source.requestCode}.`,
      ipHash: requestIpHash(request),
    });
    return NextResponse.json({
      invoice,
      message: invoice.status === "paid"
        ? "Final balance is already paid."
        : "Final balance invoice is ready and Stripe has the payment page.",
    });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Could not send the final invoice." }, { status: 502 });
  }
}
