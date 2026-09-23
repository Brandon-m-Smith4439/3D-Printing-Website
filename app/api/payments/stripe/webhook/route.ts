import { NextRequest, NextResponse } from "next/server";
import { verifyStripeWebhook } from "@/lib/stripe-checkout";
import { quoteById, recordQuoteDepositPayment, updateQuoteRefundStatus } from "@/lib/quote-store";
import { getStoredRequest, updateStoredRequest } from "@/lib/request-store";
import { notifyCustomer } from "@/lib/customer-notifications";
import { writeAudit } from "@/lib/audit-log";

type StripeCheckoutSession = {
  id?: unknown;
  payment_intent?: unknown;
  payment_status?: unknown;
  amount_total?: unknown;
  currency?: unknown;
  metadata?: {
    quote_id?: unknown;
    quote_revision?: unknown;
    deposit_amount_cents?: unknown;
  };
};

type StripeRefund = {
  id?: unknown;
  status?: unknown;
  metadata?: { quote_id?: unknown };
};

type StripeEvent = {
  type?: unknown;
  data?: { object?: StripeCheckoutSession | StripeRefund };
};

function refundStatus(value: unknown): "pending" | "requires_action" | "succeeded" | "failed" | "canceled" | "unknown" {
  return value === "pending" || value === "requires_action" || value === "succeeded" || value === "failed" || value === "canceled" ? value : "unknown";
}

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!verifyStripeWebhook(raw, request.headers.get("stripe-signature"))) {
    return NextResponse.json({ message: "Invalid webhook signature." }, { status: 400 });
  }

  let event: StripeEvent;
  try { event = JSON.parse(raw) as StripeEvent; }
  catch { return NextResponse.json({ message: "Invalid webhook payload." }, { status: 400 }); }

  const eventType = typeof event.type === "string" ? event.type : "";

  if (eventType === "checkout.session.completed" || eventType === "checkout.session.async_payment_succeeded") {
    const session = event.data?.object as StripeCheckoutSession | undefined;
    const quoteId = session?.metadata?.quote_id;
    const sessionId = session?.id;
    const paymentStatus = session?.payment_status;
    if (typeof quoteId === "string" && typeof sessionId === "string" && (paymentStatus === "paid" || eventType === "checkout.session.async_payment_succeeded")) {
      const before = await quoteById(quoteId);
      if (!before) return NextResponse.json({ received: true, ignored: true });
      if (before.payments.some((payment) => payment.checkoutSessionId === sessionId)) {
        return NextResponse.json({ received: true, duplicate: true });
      }

      const metadataAmount = Number(session?.metadata?.deposit_amount_cents);
      const expectedAmount = Number.isFinite(metadataAmount) && metadataAmount > 0
        ? metadataAmount
        : before.stripeCheckoutSessionId === sessionId
          ? (before.stripeCheckoutAmountCents || before.depositCents)
          : 0;
      if (expectedAmount <= 0 || Number(session?.amount_total) !== expectedAmount || String(session?.currency || "").toLowerCase() !== before.currency) {
        return NextResponse.json({ message: "Payment amount did not match the stored quote payment request." }, { status: 400 });
      }

      const revisionValue = Number(session?.metadata?.quote_revision);
      const revision = Number.isFinite(revisionValue) && revisionValue > 0 ? revisionValue : before.revision;
      const paymentIntentId = typeof session?.payment_intent === "string" ? session.payment_intent : "";
      const quote = await recordQuoteDepositPayment(quoteId, {
        sessionId,
        paymentIntentId,
        amountCents: expectedAmount,
        revision,
      });

      if (quote) {
        const source = await getStoredRequest(quote.requestId);
        if (source) {
          if (quote.status === "deposit-paid") {
            const updated = await updateStoredRequest(source.id, { status: "deposit-paid" });
            if (updated) await notifyCustomer(updated, "Your deposit requirement is satisfied. Your request is ready for the owner to schedule into production.");
          } else {
            await notifyCustomer(source, "Your Stripe payment was received and applied as deposit credit. Please review the latest quote revision in your profile.", { email: false });
          }
          await writeAudit({
            actor: "system",
            actorId: "stripe",
            action: "deposit-paid",
            targetType: "quote",
            targetId: quote.id,
            summary: `Stripe recorded $${(expectedAmount / 100).toFixed(2)} toward the deposit for ${source.requestCode} revision ${revision}.`,
            ipHash: "",
          });
        }
      }
    }
  }

  if (eventType === "refund.updated" || eventType === "refund.failed") {
    const refund = event.data?.object as StripeRefund | undefined;
    const refundId = refund?.id;
    if (typeof refundId === "string") {
      const quote = await updateQuoteRefundStatus(refundId, refundStatus(refund?.status));
      if (quote) {
        const source = await getStoredRequest(quote.requestId);
        if (source) {
          if (quote.status === "deposit-paid") {
            await updateStoredRequest(source.id, { status: "deposit-paid" });
          } else if (eventType === "refund.failed") {
            await updateStoredRequest(source.id, { status: "accepted" });
            await notifyCustomer(source, "Stripe reported that a deposit refund could not be completed. Mesh Harbor 3D will review the refund and follow up.", { email: false });
          }
          await writeAudit({
            actor: "system",
            actorId: "stripe",
            action: eventType === "refund.failed" ? "deposit-refund-failed" : "deposit-refund-updated",
            targetType: "quote",
            targetId: quote.id,
            summary: `Stripe refund ${refundId} is now ${refundStatus(refund?.status)}.`,
            ipHash: "",
          });
        }
      }
    }
  }

  return NextResponse.json({ received: true });
}
