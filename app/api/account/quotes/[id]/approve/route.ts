import { NextRequest, NextResponse } from "next/server";
import { customerFromRequest } from "@/lib/customer-auth";
import { sameOrigin } from "@/lib/owner-api";
import { approveQuote, markQuoteDepositSatisfied, quoteById } from "@/lib/quote-store";
import { getStoredRequest, updateStoredRequest } from "@/lib/request-store";
import { notifyCustomer } from "@/lib/customer-notifications";
import { requestIpHash, writeAudit } from "@/lib/audit-log";
import { quoteDepositOutstandingCents, quoteDepositRefundDueCents, quoteNetDepositPaidCents } from "@/lib/quote-types";
import { reconcileQuoteDepositRefund } from "@/lib/quote-payment-adjustments";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const customer = await customerFromRequest(request);
  if (!customer) return NextResponse.json({ message: "Sign in required." }, { status: 401 });
  if (!customer.emailVerified) return NextResponse.json({ message: "Verify your email before accepting a quote." }, { status: 403 });
  if (!sameOrigin(request)) return NextResponse.json({ message: "Request origin was not accepted." }, { status: 403 });

  const { id } = await context.params;
  const quote = await quoteById(id);
  if (!quote || quote.customerAccountId !== customer.id) return NextResponse.json({ message: "Quote not found." }, { status: 404 });
  if (quote.status !== "sent") return NextResponse.json({ message: "This quote is not currently awaiting approval." }, { status: 409 });
  if (quote.fulfillmentMode === "shipping" && !quote.shippingSelection) return NextResponse.json({ message: "Choose a USPS, UPS, or FedEx shipping option before approving this quote." }, { status: 409 });

  const source = await getStoredRequest(quote.requestId);
  if (!source || source.customerAccountId !== customer.id) return NextResponse.json({ message: "Request not found." }, { status: 404 });

  let approved = await approveQuote(id, customer.id);
  if (!approved) return NextResponse.json({ message: "Could not approve quote." }, { status: 409 });

  const paidBefore = quoteNetDepositPaidCents(approved);
  const refundDue = quoteDepositRefundDueCents(approved);
  let refundMessage = "";
  let refundWarning = "";
  let refundPending = false;

  if (refundDue > 0) {
    try {
      const result = await reconcileQuoteDepositRefund(approved.id);
      approved = result.quote;
      refundPending = result.pending;
      refundMessage = result.refundedCents > 0
        ? ` A ${(result.refundedCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })} deposit refund was ${result.pending ? "submitted" : "issued"} to the original payment method.`
        : "";
    } catch (error) {
      refundWarning = error instanceof Error ? error.message : "The deposit refund needs owner review.";
      console.error("Revised quote refund reconciliation failed", error);
    }
  } else if (paidBefore > 0 && quoteDepositOutstandingCents(approved) === 0) {
    approved = await markQuoteDepositSatisfied(approved.id) || approved;
  }

  const outstanding = quoteDepositOutstandingCents(approved);
  const satisfied = approved.status === "deposit-paid";
  const updated = await updateStoredRequest(source.id, { status: satisfied ? "deposit-paid" : "accepted" });

  const sideEffects: Promise<unknown>[] = [
    writeAudit({
      actor: "customer",
      actorId: customer.id,
      action: "quote-approved",
      targetType: "quote",
      targetId: id,
      summary: `Customer approved quote revision ${approved.revision} for ${source.requestCode}. Current deposit credit: $${(quoteNetDepositPaidCents(approved) / 100).toFixed(2)}.`,
      ipHash: requestIpHash(request),
    }),
  ];

  if (updated) {
    const notification = satisfied
      ? `You approved quote revision ${approved.revision}. Your 50% deposit requirement is satisfied.${refundMessage}`
      : refundPending
        ? `You approved quote revision ${approved.revision}.${refundMessage} No additional payment is needed while the refund finishes processing.`
        : paidBefore > 0
          ? `You approved quote revision ${approved.revision}. An additional ${(outstanding / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })} deposit is required before production can begin.`
          : "You approved the quote and terms. The 50% deposit is now required before production can begin.";
    sideEffects.push(notifyCustomer(updated, notification, { email: false }));
  }

  const results = await Promise.allSettled(sideEffects);
  results.forEach((result) => {
    if (result.status === "rejected") console.error("Quote approval side effect failed", result.reason);
  });

  if (refundWarning) {
    return NextResponse.json({
      quote: approved,
      message: `Quote approved, but the automatic deposit refund needs owner review: ${refundWarning}`,
      refundWarning,
    });
  }
  if (satisfied) return NextResponse.json({ quote: approved, message: `Quote approved. Your deposit requirement is satisfied.${refundMessage}` });
  if (refundPending) return NextResponse.json({ quote: approved, message: `Quote approved.${refundMessage} No additional payment is needed while the refund finishes processing.` });
  return NextResponse.json({
    quote: approved,
    message: paidBefore > 0
      ? `Quote approved. Pay the additional ${(outstanding / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })} deposit to bring the upfront payment to 50%.`
      : "Quote approved. You can now pay the deposit.",
  });
}
