import { z } from "zod";

export const quoteStatuses = ["draft", "sent", "countered", "approved", "declined", "deposit-paid", "void"] as const;
export type QuoteStatus = (typeof quoteStatuses)[number];

export const assemblyModes = ["assembled", "disassembled", "not-required"] as const;
export type AssemblyMode = (typeof assemblyModes)[number];

export const quoteFulfillmentModes = ["pickup", "shipping", "local-delivery"] as const;
export type QuoteFulfillmentMode = (typeof quoteFulfillmentModes)[number];

export type ShippingAddress = {
  name: string;
  street1: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
  country: string;
};

export type ShippingSelection = {
  shipmentId: string;
  rateId: string;
  carrier: "USPS" | "UPS" | "FedEx";
  service: string;
  rateCents: number;
  deliveryDays: number | null;
  deliveryDate: string;
  address: ShippingAddress;
  selectedAt: string;
};

export type QuoteSnapshot = {
  revision: number;
  basePriceCents: number;
  assemblyMode: AssemblyMode;
  assemblyFeeCents: number;
  fulfillmentMode: QuoteFulfillmentMode;
  localDeliveryFeeCents: number;
  packageWeightOz: number;
  packageLengthIn: number;
  packageWidthIn: number;
  packageHeightIn: number;
  shippingSelection: ShippingSelection | null;
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

export type QuoteHistoryEvent = "draft-saved" | "sent" | "approved" | "declined" | "counter-offer" | "shipping-selected" | "deposit-paid";
export type QuoteHistoryEntry = {
  id: string;
  createdAt: string;
  actor: "owner" | "customer" | "system";
  event: QuoteHistoryEvent;
  revision: number;
  summary: string;
  message?: string;
  counterTotalCents?: number;
  snapshot?: QuoteSnapshot;
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
  history: QuoteHistoryEntry[];
};

const cents = z.coerce.number().int().min(50).max(10_000_000);
const feeCents = z.coerce.number().int().min(0).max(2_000_000);
const optionalDate = z.string().trim().max(10).refine((value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value), "Invalid date.");
const packageDimension = z.coerce.number().min(0).max(120);
const packageWeight = z.coerce.number().min(0).max(2400);

export const ownerQuoteSchema = z.object({
  basePriceCents: cents,
  assemblyMode: z.enum(assemblyModes),
  assemblyFeeCents: feeCents,
  fulfillmentMode: z.enum(quoteFulfillmentModes),
  localDeliveryFeeCents: feeCents,
  packageWeightOz: packageWeight,
  packageLengthIn: packageDimension,
  packageWidthIn: packageDimension,
  packageHeightIn: packageDimension,
  totalCents: cents,
  depositCents: cents,
  material: z.string().trim().min(1).max(120),
  dimensions: z.string().trim().min(1).max(180),
  estimatedReadyDate: optionalDate,
  notes: z.string().trim().max(1200).default(""),
  terms: z.string().trim().min(20).max(5000),
  action: z.enum(["save", "send"]),
}).superRefine((value, ctx) => {
  if (value.assemblyMode === "assembled" && value.assemblyFeeCents < 50) {
    ctx.addIssue({ code: "custom", path: ["assemblyFeeCents"], message: "Enter an assembly labor charge for an assembled order." });
  }
  if (value.assemblyMode !== "assembled" && value.assemblyFeeCents !== 0) {
    ctx.addIssue({ code: "custom", path: ["assemblyFeeCents"], message: "Assembly labor must be $0 when the order is not assembled by Mesh Harbor 3D." });
  }
  if (value.fulfillmentMode !== "local-delivery" && value.localDeliveryFeeCents !== 0) {
    ctx.addIssue({ code: "custom", path: ["localDeliveryFeeCents"], message: "Local delivery fee must be $0 unless local delivery is selected." });
  }
  if (value.fulfillmentMode === "local-delivery" && value.localDeliveryFeeCents < 50) {
    ctx.addIssue({ code: "custom", path: ["localDeliveryFeeCents"], message: "Enter a local delivery fee." });
  }
  if (value.fulfillmentMode === "shipping") {
    if (value.packageWeightOz <= 0) ctx.addIssue({ code: "custom", path: ["packageWeightOz"], message: "Enter the packed shipment weight." });
    if (value.packageLengthIn <= 0 || value.packageWidthIn <= 0 || value.packageHeightIn <= 0) {
      ctx.addIssue({ code: "custom", path: ["packageLengthIn"], message: "Enter all packed box dimensions so live carrier rates can be calculated." });
    }
  }
  const requiredTotal = value.basePriceCents + value.assemblyFeeCents + value.localDeliveryFeeCents;
  if (value.totalCents !== requiredTotal) ctx.addIssue({ code: "custom", path: ["totalCents"], message: "The quote total does not match the current print, assembly, and delivery charges." });
  const requiredDeposit = Math.round(value.totalCents / 2);
  if (value.depositCents !== requiredDeposit) ctx.addIssue({ code: "custom", path: ["depositCents"], message: "The deposit must be exactly 50% of the current quote total." });
});

export const customerQuoteResponseSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("decline"), message: z.string().trim().max(1200).default("") }),
  z.object({ action: z.literal("counter"), counterTotalCents: cents, message: z.string().trim().min(3).max(1200) }),
]);

export const shippingAddressSchema = z.object({
  name: z.string().trim().min(1).max(120),
  street1: z.string().trim().min(3).max(120),
  street2: z.string().trim().max(120).default(""),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().regex(/^[A-Za-z]{2}$/, "Use the 2-letter state code, such as NC.").transform((value) => value.toUpperCase()),
  zip: z.string().trim().regex(/^\d{5}(?:-\d{4})?$/, "Use a 5-digit ZIP code or ZIP+4."),
  country: z.literal("US").default("US"),
});

export const shippingSelectionSchema = z.object({
  shipmentId: z.string().trim().min(1).max(120),
  rateId: z.string().trim().min(1).max(120),
});
