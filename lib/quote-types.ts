import { z } from "zod";

export const quoteStatuses = ["draft", "sent", "approved", "deposit-paid", "void"] as const;
export type QuoteStatus = (typeof quoteStatuses)[number];

export type QuoteSnapshot = {
  revision: number;
  totalCents: number;
  depositCents: number;
  balanceCents: number;
  currency: "usd";
  material: string;
  dimensions: string;
  estimatedReadyDate: string;
  notes: string;
  terms: string;
};

export type StoredQuote = QuoteSnapshot & {
  id: string;
  requestId: string;
  requestCode: string;
  customerAccountId: string;
  status: QuoteStatus;
  createdAt: string;
  updatedAt: string;
  sentAt: string;
  approvedAt: string;
  approvedByCustomerId: string;
  approvalSnapshot: QuoteSnapshot | null;
  stripeCheckoutSessionId: string;
  depositPaidAt: string;
  paymentProvider: "" | "stripe";
};

const cents = z.coerce.number().int().min(50).max(10_000_000);
const optionalDate = z.string().trim().max(10).refine((value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value), "Invalid date.");

export const ownerQuoteSchema = z.object({
  totalCents: cents,
  depositCents: cents,
  material: z.string().trim().min(1).max(120),
  dimensions: z.string().trim().min(1).max(180),
  estimatedReadyDate: optionalDate,
  notes: z.string().trim().max(1200).default(""),
  terms: z.string().trim().min(20).max(5000),
  action: z.enum(["save", "send"]),
}).superRefine((value, ctx) => {
  const requiredDeposit = Math.round(value.totalCents / 2);
  if (value.depositCents !== requiredDeposit) ctx.addIssue({ code: "custom", path: ["depositCents"], message: "The deposit must be exactly 50% of the total quote." });
});
