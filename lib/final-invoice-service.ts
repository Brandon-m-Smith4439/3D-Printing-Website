import "server-only";
import Stripe from "stripe";
import { findCustomerById, setStripeCustomerId } from "@/lib/customer-store";
import { finalInvoiceForRequest, createFinalInvoiceRecord, updateFinalInvoiceRecord } from "@/lib/final-invoice-store";
import type { FinalInvoiceRecord, FinalInvoiceStatus } from "@/lib/final-invoice-types";
import { getStoredRequest } from "@/lib/request-store";
import { quoteForRequest } from "@/lib/quote-store";
import { quoteDepositSatisfied, quoteNetDepositPaidCents } from "@/lib/quote-types";
import { stripeClient, stripeKeyMode, stripeSdkConfigured } from "@/lib/stripe-client";

function dueDays() {
  const configured = Number(process.env.STRIPE_FINAL_INVOICE_DUE_DAYS || 7);
  if (!Number.isFinite(configured)) return 7;
  return Math.max(1, Math.min(60, Math.round(configured)));
}

function isoFromUnix(value: number | null | undefined) {
  return value ? new Date(value * 1000).toISOString() : "";
}

function localStatus(status: unknown): FinalInvoiceStatus {
  if (status === "open" || status === "paid" || status === "uncollectible" || status === "void") return status;
  return "draft";
}

function invoicePatch(invoice: Stripe.Invoice) {
  return {
    stripeInvoiceNumber: invoice.number || "",
    status: localStatus(invoice.status),
    amountDueCents: Math.max(0, invoice.amount_due || 0),
    amountPaidCents: Math.max(0, invoice.amount_paid || 0),
    amountRemainingCents: Math.max(0, invoice.amount_remaining || 0),
    hostedInvoiceUrl: invoice.hosted_invoice_url || "",
    invoicePdfUrl: invoice.invoice_pdf || "",
    dueDate: isoFromUnix(invoice.due_date),
    paidAt: isoFromUnix(invoice.status_transitions?.paid_at),
    lastError: "",
  } as const;
}

export function finalBalanceCents(totalCents: number, depositCreditCents: number) {
  return Math.max(0, Math.round(totalCents) - Math.max(0, Math.round(depositCreditCents)));
}

async function ensureStripeCustomer(input: {
  customerAccountId: string;
  requestId: string;
  email: string;
  name: string;
  existingStripeCustomerId?: string;
}) {
  if (!stripeSdkConfigured()) {
    if (process.env.NODE_ENV === "production") throw new Error("Stripe final invoicing is not configured.");
    return input.existingStripeCustomerId || `cus_dev_${input.customerAccountId || input.requestId}`;
  }

  const stripe = stripeClient();
  const mode = stripeKeyMode();
  let account = input.customerAccountId ? await findCustomerById(input.customerAccountId) : null;
  let customerId = input.existingStripeCustomerId || (mode === "live" ? account?.stripeCustomerLiveId : account?.stripeCustomerTestId) || "";

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: input.email,
      name: input.name,
      metadata: {
        mesh_harbor_customer_id: input.customerAccountId || "",
      },
    }, {
      idempotencyKey: `mesh-harbor-customer-${mode}-${input.customerAccountId || input.requestId}`,
    });
    customerId = customer.id;
    if (account && mode !== "unconfigured") {
      account = await setStripeCustomerId(account.id, mode, customerId);
    }
  } else {
    await stripe.customers.update(customerId, {
      email: input.email,
      name: input.name,
    });
  }

  return customerId;
}

async function refreshFromStripe(record: FinalInvoiceRecord) {
  if (!stripeSdkConfigured() || record.stripeInvoiceId.startsWith("in_dev_")) return record;
  const invoice = await stripeClient().invoices.retrieve(record.stripeInvoiceId);
  return await updateFinalInvoiceRecord(record.id, invoicePatch(invoice)) || record;
}

export async function ensureFinalInvoiceForRequest(requestId: string) {
  const request = await getStoredRequest(requestId);
  if (!request) throw new Error("Request not found.");

  const quote = await quoteForRequest(requestId);
  if (!quote) throw new Error("No active quote is attached to this request.");
  if (quote.status !== "deposit-paid" || !quoteDepositSatisfied(quote)) {
    throw new Error("The current quote's 50% deposit must be fully reconciled before the final invoice can be sent.");
  }
  if (!request.email.trim()) {
    throw new Error("Add a customer email before sending the final Stripe invoice.");
  }

  const balanceCents = finalBalanceCents(quote.totalCents, quoteNetDepositPaidCents(quote));
  if (balanceCents <= 0) throw new Error("No remaining balance is due for this request.");

  let existing = await finalInvoiceForRequest(requestId);
  if (existing) {
    existing = await refreshFromStripe(existing);
    if (existing.status === "paid" || existing.status === "open") return existing;
    if (existing.status === "void" || existing.status === "uncollectible") {
      throw new Error("The existing final invoice is closed in Stripe. Review it in Stripe before creating a replacement.");
    }
  }

  const stripeCustomerId = await ensureStripeCustomer({
    customerAccountId: request.customerAccountId || "",
    requestId: request.id,
    email: request.email,
    name: request.name,
    existingStripeCustomerId: existing?.stripeCustomerId,
  });

  if (!stripeSdkConfigured()) {
    const now = new Date();
    const due = new Date(now.getTime() + dueDays() * 86_400_000).toISOString();
    if (existing) {
      return await updateFinalInvoiceRecord(existing.id, {
        stripeCustomerId,
        status: "open",
        amountDueCents: balanceCents,
        amountPaidCents: 0,
        amountRemainingCents: balanceCents,
        hostedInvoiceUrl: "/profile?invoice=development",
        dueDate: due,
        sentAt: now.toISOString(),
        lastError: "",
      }) || existing;
    }
    return createFinalInvoiceRecord({
      requestId: request.id,
      requestCode: request.requestCode,
      quoteId: quote.id,
      quoteRevision: quote.revision,
      customerAccountId: request.customerAccountId || "",
      stripeCustomerId,
      stripeInvoiceId: `in_dev_${request.id}_r${quote.revision}`,
      stripeInvoiceNumber: "DEV",
      status: "open",
      amountDueCents: balanceCents,
      amountPaidCents: 0,
      amountRemainingCents: balanceCents,
      currency: "usd",
      hostedInvoiceUrl: "/profile?invoice=development",
      invoicePdfUrl: "",
      dueDate: due,
      sentAt: now.toISOString(),
      paidAt: "",
      paymentFailedAt: "",
      lastError: "",
    });
  }

  const stripe = stripeClient();
  const invoiceIdempotency = `final-invoice-${quote.id}-r${quote.revision}`;
  let stripeInvoice: Stripe.Invoice;

  if (existing?.stripeInvoiceId) {
    stripeInvoice = await stripe.invoices.retrieve(existing.stripeInvoiceId);
  } else {
    stripeInvoice = await stripe.invoices.create({
      customer: stripeCustomerId,
      collection_method: "send_invoice",
      days_until_due: dueDays(),
      auto_advance: false,
      description: `Final balance for Mesh Harbor 3D request ${request.requestCode}`,
      custom_fields: [{ name: "Request", value: request.requestCode }],
      metadata: {
        purpose: "final_balance",
        request_id: request.id,
        request_code: request.requestCode,
        quote_id: quote.id,
        quote_revision: String(quote.revision),
      },
    }, { idempotencyKey: invoiceIdempotency });

    existing = await createFinalInvoiceRecord({
      requestId: request.id,
      requestCode: request.requestCode,
      quoteId: quote.id,
      quoteRevision: quote.revision,
      customerAccountId: request.customerAccountId || "",
      stripeCustomerId,
      stripeInvoiceId: stripeInvoice.id,
      stripeInvoiceNumber: stripeInvoice.number || "",
      status: localStatus(stripeInvoice.status),
      amountDueCents: Math.max(0, stripeInvoice.amount_due || 0),
      amountPaidCents: Math.max(0, stripeInvoice.amount_paid || 0),
      amountRemainingCents: Math.max(0, stripeInvoice.amount_remaining || 0),
      currency: "usd",
      hostedInvoiceUrl: stripeInvoice.hosted_invoice_url || "",
      invoicePdfUrl: stripeInvoice.invoice_pdf || "",
      dueDate: isoFromUnix(stripeInvoice.due_date),
      sentAt: "",
      paidAt: isoFromUnix(stripeInvoice.status_transitions?.paid_at),
      paymentFailedAt: "",
      lastError: "",
    });
  }

  try {
    await stripe.invoiceItems.create({
      customer: stripeCustomerId,
      invoice: stripeInvoice.id,
      amount: balanceCents,
      currency: "usd",
      description: `Final balance — ${request.requestCode} — quote revision ${quote.revision}`,
      metadata: {
        request_id: request.id,
        quote_id: quote.id,
        purpose: "final_balance",
      },
    }, { idempotencyKey: `final-invoice-item-${quote.id}-r${quote.revision}` });

    const sent = await stripe.invoices.sendInvoice(stripeInvoice.id, {}, {
      idempotencyKey: `final-invoice-send-${quote.id}-r${quote.revision}`,
    });
    const updated = await updateFinalInvoiceRecord(existing.id, {
      ...invoicePatch(sent),
      stripeCustomerId,
      sentAt: existing.sentAt || new Date().toISOString(),
    });
    return updated || existing;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stripe could not send the final invoice.";
    await updateFinalInvoiceRecord(existing.id, { lastError: message });
    throw error;
  }
}

export async function refreshFinalInvoiceForRequest(requestId: string) {
  const existing = await finalInvoiceForRequest(requestId);
  if (!existing) return null;
  return refreshFromStripe(existing);
}
