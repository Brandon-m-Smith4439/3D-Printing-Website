import "server-only";
import {
  markQuoteDepositSatisfied,
  quoteById,
  quoteRefundPlan,
  recordQuoteRefund,
} from "@/lib/quote-store";
import {
  quoteDepositRefundDueCents,
  quoteDepositSatisfied,
  type StoredQuote,
} from "@/lib/quote-types";
import { createStripeRefund } from "@/lib/stripe-checkout";

export type QuoteRefundResult = {
  quote: StoredQuote;
  refundedCents: number;
  pending: boolean;
};

export async function reconcileQuoteDepositRefund(quoteId: string): Promise<QuoteRefundResult> {
  let quote = await quoteById(quoteId);
  if (!quote) throw new Error("Quote not found.");

  const refundDue = quoteDepositRefundDueCents(quote);
  if (refundDue <= 0) {
    if (quote.status === "approved" && quoteDepositSatisfied(quote)) {
      quote = await markQuoteDepositSatisfied(quote.id) || quote;
    }
    return { quote, refundedCents: 0, pending: false };
  }

  const { plan, remainingCents } = quoteRefundPlan(quote, refundDue);
  if (remainingCents > 0) {
    throw new Error("The paid deposit history is incomplete, so the refund cannot be safely reconciled automatically.");
  }

  let refundedCents = 0;
  let pending = false;
  for (const item of plan) {
    const result = await createStripeRefund({
      quoteId: quote.id,
      revision: quote.revision,
      payment: item.payment,
      amountCents: item.amountCents,
      attempt: item.attempt,
    });
    quote = await recordQuoteRefund(quote.id, {
      revision: quote.revision,
      paymentRecordId: item.payment.id,
      paymentIntentId: result.paymentIntentId,
      stripeRefundId: result.id,
      amountCents: item.amountCents,
      status: result.status,
    }) || quote;
    refundedCents += item.amountCents;
    pending = pending || result.status === "pending" || result.status === "requires_action" || result.status === "unknown";
  }

  if (quoteDepositSatisfied(quote)) {
    quote = await markQuoteDepositSatisfied(quote.id) || quote;
  }
  return { quote, refundedCents, pending };
}
