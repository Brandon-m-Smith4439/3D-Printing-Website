import { NextRequest, NextResponse } from "next/server";
import { customerFromRequest } from "@/lib/customer-auth";
import { notificationsForCustomer } from "@/lib/customer-notifications";
import { readQueue } from "@/lib/queue-store";
import { readRequests } from "@/lib/request-store";
import { readQuotes } from "@/lib/quote-store";
import { quoteDepositOutstandingCents, quoteDepositRefundDueCents, quoteDepositRefundPending, quoteNetDepositPaidCents } from "@/lib/quote-types";
import { readShipments } from "@/lib/shipment-store";
import { readFinalInvoices } from "@/lib/final-invoice-store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const customer = await customerFromRequest(request);
  if (!customer) return NextResponse.json({ message: "Sign in required." }, { status: 401 });
  const [requests, queue, notifications, quotes, shipments, finalInvoices] = await Promise.all([readRequests(), readQueue(), notificationsForCustomer(customer.id), readQuotes(), readShipments(), readFinalInvoices()]);
  const active = queue.filter((job) => job.status !== "completed").sort((a, b) => (a.status === "printing" ? -1 : 0) - (b.status === "printing" ? -1 : 0) || a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
  const activeIndex = new Map(active.map((job, index) => [job.id, index + 1]));
  const own = requests
    .filter((item) => item.customerAccountId === customer.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((item) => {
      const job = item.queueJobId ? queue.find((candidate) => candidate.id === item.queueJobId) : null;
      const quote = quotes.find((candidate) => candidate.requestId === item.id && !["void", "draft"].includes(candidate.status)) || null;
      const shipment = shipments.find((candidate) => candidate.requestId === item.id) || null;
      const finalInvoice = finalInvoices.filter((candidate) => candidate.requestId === item.id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0] || null;
      return {
        id: item.id, requestCode: item.requestCode, status: item.status, projectType: item.projectType,
        quantity: item.quantity, neededBy: item.neededBySubmitted || item.neededBy, description: item.description,
        createdAt: item.createdAt,
        quote: quote ? {
          id: quote.id, revision: quote.revision, status: quote.status, basePriceCents: quote.basePriceCents, assemblyMode: quote.assemblyMode, assemblyFeeCents: quote.assemblyFeeCents, rushFeeCents: quote.rushFeeCents, fulfillmentMode: quote.fulfillmentMode, localDeliveryFeeCents: quote.localDeliveryFeeCents, shippingSelection: quote.shippingSelection, totalCents: quote.totalCents, depositCents: quote.depositCents,
          balanceCents: quote.balanceCents, currency: quote.currency, material: quote.material, dimensions: quote.dimensions,
          estimatedReadyDate: quote.estimatedReadyDate, notes: quote.notes, terms: quote.terms, sentAt: quote.sentAt,
          approvedAt: quote.approvedAt, depositPaidAt: quote.depositPaidAt,
          depositPaidCents: quoteNetDepositPaidCents(quote), depositOutstandingCents: quoteDepositOutstandingCents(quote),
          depositRefundDueCents: quoteDepositRefundDueCents(quote), depositRefundPending: quoteDepositRefundPending(quote),
          history: quote.history,
        } : null,
        finalInvoice: finalInvoice ? {
          id: finalInvoice.id, status: finalInvoice.status, stripeInvoiceNumber: finalInvoice.stripeInvoiceNumber,
          amountDueCents: finalInvoice.amountDueCents, amountPaidCents: finalInvoice.amountPaidCents, amountRemainingCents: finalInvoice.amountRemainingCents,
          currency: finalInvoice.currency, hostedInvoiceUrl: finalInvoice.hostedInvoiceUrl, invoicePdfUrl: finalInvoice.invoicePdfUrl,
          dueDate: finalInvoice.dueDate, sentAt: finalInvoice.sentAt, paidAt: finalInvoice.paidAt, paymentFailedAt: finalInvoice.paymentFailedAt,
        } : null,
        shipment: shipment ? {
          trackingCode: shipment.trackingCode, publicTrackingUrl: shipment.publicTrackingUrl, carrier: shipment.carrier, service: shipment.service,
          status: shipment.status, statusDetail: shipment.statusDetail, estimatedDeliveryDate: shipment.estimatedDeliveryDate,
          purchasedAt: shipment.purchasedAt, deliveredAt: shipment.deliveredAt, trackingEvents: shipment.trackingEvents,
        } : null,
        queue: job ? {
          publicCode: job.publicCode, publicTitle: job.publicTitle, status: job.status,
          position: activeIndex.get(job.id) || null, estimatedReadyDate: job.estimatedReadyDate,
          publicNote: job.publicNote, imageUrl: job.imageUrl,
        } : null,
      };
    });
  return NextResponse.json({ requests: own, notifications }, { headers: { "Cache-Control": "no-store" } });
}
