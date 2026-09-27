import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requestIsOwner } from "@/lib/owner-auth";
import { sameOrigin } from "@/lib/owner-api";
import { getStoredRequest, updateStoredRequest } from "@/lib/request-store";
import { quoteForRequest, recordCashDeposit, recordCashFinalPayment } from "@/lib/quote-store";
import { quoteDepositOutstandingCents } from "@/lib/quote-types";
import { notifyCustomer } from "@/lib/customer-notifications";
import { readQueue } from "@/lib/queue-store";
import { requestIpHash, writeAudit } from "@/lib/audit-log";

const schema = z.object({ phase: z.enum(["deposit", "final"]) });

function label(value: string | null | undefined) {
  return ({
    cash: "Cash",
    zelle: "Zelle",
    "cash-app": "Cash App",
    "apple-cash": "Apple Cash",
    venmo: "Venmo",
    paypal: "PayPal",
  } as Record<string, string>)[value || ""] || "local payment";
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!await requestIsOwner(request)) return NextResponse.json({ message: "Sign in required." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ message: "Request origin was not accepted." }, { status: 403 });

  const { id } = await context.params;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Invalid payment confirmation." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Choose deposit or final payment." }, { status: 400 });

  const source = await getStoredRequest(id);
  if (!source) return NextResponse.json({ message: "Request not found." }, { status: 404 });
  const quote = await quoteForRequest(id);
  if (!quote) return NextResponse.json({ message: "Quote not found." }, { status: 404 });
  if (quote.paymentMethod !== "cash" || quote.fulfillmentMode !== "pickup" || !quote.localPaymentMethod) {
    return NextResponse.json({ message: "This order is not configured for a local pickup payment." }, { status: 409 });
  }

  if (parsed.data.phase === "deposit") {
    const amount = quoteDepositOutstandingCents(quote);
    if (quote.status !== "approved" || amount <= 0) return NextResponse.json({ message: "There is no approved local deposit waiting to be recorded." }, { status: 409 });
    const updatedQuote = await recordCashDeposit(quote.id, amount);
    if (!updatedQuote || updatedQuote.status !== "deposit-paid") return NextResponse.json({ message: "Could not record the local deposit." }, { status: 409 });
    const updatedRequest = await updateStoredRequest(source.id, { status: "deposit-paid" });
    if (updatedRequest) {
      await notifyCustomer(updatedRequest, `Your ${label(quote.localPaymentMethod)} deposit has been confirmed. Your request is ready to be scheduled into production.`);
    }
    await writeAudit({
      actor: "owner", actorId: "owner", action: "local-deposit-recorded", targetType: "quote", targetId: quote.id,
      summary: `${label(quote.localPaymentMethod)} deposit of $${(amount / 100).toFixed(2)} confirmed for ${source.requestCode}.`,
      ipHash: requestIpHash(request),
    });
    return NextResponse.json({ quote: updatedQuote, message: `${label(quote.localPaymentMethod)} deposit recorded.` });
  }

  const jobs = await readQueue();
  const job = source.queueJobId ? jobs.find((item) => item.id === source.queueJobId) : null;
  if (!job || !["ready", "completed"].includes(job.status)) {
    return NextResponse.json({ message: "Mark production Ready before recording the final local payment." }, { status: 409 });
  }
  const amount = quote.balanceCents;
  if (quote.status !== "deposit-paid" || quote.cashFinalPaidAt || amount <= 0) {
    return NextResponse.json({ message: "There is no final local balance waiting to be recorded." }, { status: 409 });
  }
  const updatedQuote = await recordCashFinalPayment(quote.id, amount);
  if (!updatedQuote?.cashFinalPaidAt) return NextResponse.json({ message: "Could not record the final local payment." }, { status: 409 });
  await notifyCustomer(source, `Your final ${label(quote.localPaymentMethod)} balance has been confirmed. Thank you — your order can now be released at pickup.`);
  await writeAudit({
    actor: "owner", actorId: "owner", action: "local-final-payment-recorded", targetType: "quote", targetId: quote.id,
    summary: `Final ${label(quote.localPaymentMethod)} balance of $${(amount / 100).toFixed(2)} confirmed for ${source.requestCode}.`,
    ipHash: requestIpHash(request),
  });
  return NextResponse.json({ quote: updatedQuote, message: `Final ${label(quote.localPaymentMethod)} balance recorded.` });
}
