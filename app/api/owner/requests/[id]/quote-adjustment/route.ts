import { NextRequest, NextResponse } from "next/server";
import { requestIsOwner } from "@/lib/owner-auth";
import { sameOrigin } from "@/lib/owner-api";
import { getStoredRequest, updateStoredRequest } from "@/lib/request-store";
import { quoteForRequest } from "@/lib/quote-store";
import { quoteDepositRefundDueCents } from "@/lib/quote-types";
import { reconcileQuoteDepositRefund } from "@/lib/quote-payment-adjustments";
import { notifyCustomer } from "@/lib/customer-notifications";
import { requestIpHash, writeAudit } from "@/lib/audit-log";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!requestIsOwner(request)) return NextResponse.json({ message: "Sign in required." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ message: "Request origin was not accepted." }, { status: 403 });

  const { id } = await context.params;
  const source = await getStoredRequest(id);
  if (!source) return NextResponse.json({ message: "Request not found." }, { status: 404 });
  const quote = await quoteForRequest(id);
  if (!quote) return NextResponse.json({ message: "Quote not found." }, { status: 404 });
  if (quote.status !== "approved") return NextResponse.json({ message: "The revised quote must be approved by the customer before reconciling its deposit." }, { status: 409 });

  const refundDue = quoteDepositRefundDueCents(quote);
  if (refundDue <= 0) return NextResponse.json({ message: "No deposit refund is currently due." }, { status: 409 });

  try {
    const result = await reconcileQuoteDepositRefund(quote.id);
    const updated = await updateStoredRequest(source.id, { status: result.quote.status === "deposit-paid" ? "deposit-paid" : "accepted" });
    if (updated && result.refundedCents > 0) {
      await notifyCustomer(updated, `A ${(result.refundedCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })} deposit refund for quote revision ${result.quote.revision} was ${result.pending ? "submitted" : "issued"} to the original payment method.`);
    }
    await writeAudit({
      actor: "owner",
      actorId: "owner",
      action: "deposit-refund-retried",
      targetType: "quote",
      targetId: quote.id,
      summary: `Deposit refund reconciliation retried for ${source.requestCode}; $${(result.refundedCents / 100).toFixed(2)} processed.`,
      ipHash: requestIpHash(request),
    });
    return NextResponse.json({
      quote: result.quote,
      message: result.pending
        ? "Deposit refund submitted to Stripe. Production remains blocked until Stripe confirms completion."
        : "Deposit refund completed and the revised 50% deposit requirement is satisfied.",
    });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Could not reconcile the deposit refund." }, { status: 502 });
  }
}
