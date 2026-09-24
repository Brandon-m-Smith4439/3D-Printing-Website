export const finalInvoiceStatuses = ["draft", "open", "paid", "uncollectible", "void"] as const;
export type FinalInvoiceStatus = (typeof finalInvoiceStatuses)[number];

export type FinalInvoiceRecord = {
  id: string;
  requestId: string;
  requestCode: string;
  quoteId: string;
  quoteRevision: number;
  customerAccountId: string;
  stripeCustomerId: string;
  stripeInvoiceId: string;
  stripeInvoiceNumber: string;
  status: FinalInvoiceStatus;
  amountDueCents: number;
  amountPaidCents: number;
  amountRemainingCents: number;
  currency: "usd";
  hostedInvoiceUrl: string;
  invoicePdfUrl: string;
  dueDate: string;
  createdAt: string;
  sentAt: string;
  paidAt: string;
  paymentFailedAt: string;
  updatedAt: string;
  lastError: string;
};

export function finalInvoicePaid(invoice: FinalInvoiceRecord | null | undefined) {
  return Boolean(invoice && invoice.status === "paid" && invoice.amountDueCents > 0 && invoice.amountRemainingCents === 0);
}
