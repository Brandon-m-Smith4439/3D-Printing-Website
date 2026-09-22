import "server-only";
import { getLiveShippingRates, buyEasyPostShipment, refundEasyPostShipment, type EasyPostTracker } from "@/lib/easypost";
import { getStoredRequest } from "@/lib/request-store";
import { quoteForRequest } from "@/lib/quote-store";
import { notifyCustomer } from "@/lib/customer-notifications";
import { applyTrackingUpdate, shipmentForRequest, upsertShipment } from "@/lib/shipment-store";
import type { ShipmentRecord, ShipmentTrackingEvent } from "@/lib/shipment-types";

function maxIncreaseCents(customerRateCents: number) {
  const fixed = Number(process.env.EASYPOST_AUTO_BUY_MAX_INCREASE_CENTS || 200);
  const percent = Number(process.env.EASYPOST_AUTO_BUY_MAX_INCREASE_PERCENT || 10);
  const fixedSafe = Number.isFinite(fixed) && fixed >= 0 ? Math.round(fixed) : 200;
  const percentSafe = Number.isFinite(percent) && percent >= 0 ? percent : 10;
  return Math.max(fixedSafe, Math.round(customerRateCents * percentSafe / 100));
}

export function easyPostAutoBuyEnabled() {
  return /^(1|true|yes|on)$/i.test((process.env.EASYPOST_AUTO_BUY_LABELS || "").trim());
}

function trackerEvents(tracker: EasyPostTracker): ShipmentTrackingEvent[] {
  return (tracker.trackingDetails || []).map((item, index) => ({
    id: `${tracker.id || tracker.trackingCode}-${item.datetime || index}-${index}`,
    eventId: "",
    status: item.status || "",
    statusDetail: item.statusDetail || "",
    message: item.message || "",
    datetime: item.datetime || "",
    location: item.location ? {
      city: item.location.city || "",
      state: item.location.state || "",
      country: item.location.country || "",
      zip: item.location.zip || "",
    } : null,
  }));
}

export async function buyLabelForRequest(requestId: string, options: { force?: boolean } = {}) {
  const request = await getStoredRequest(requestId);
  if (!request) throw new Error("Request not found.");
  const quote = await quoteForRequest(requestId);
  if (!quote) throw new Error("No active quote is attached to this request.");
  if (quote.fulfillmentMode !== "shipping" || !quote.shippingSelection) throw new Error("This order does not have customer-selected carrier shipping.");
  if (!quote.depositPaidAt) throw new Error("The customer deposit must be recorded before a shipping label can be purchased.");

  const existing = await shipmentForRequest(requestId);
  if (existing?.trackingCode && existing.refundStatus !== "refunded") {
    return { shipment: existing, purchased: false, requiresConfirmation: false };
  }

  const fresh = await getLiveShippingRates(quote, quote.shippingSelection.address);
  const matching = fresh.rates.find((rate) =>
    rate.carrier === quote.shippingSelection?.carrier &&
    rate.service.toLowerCase() === quote.shippingSelection?.service.toLowerCase(),
  );
  if (!matching) {
    const record = await upsertShipment(requestId, {
      quoteId: quote.id,
      requestCode: request.requestCode,
      carrier: quote.shippingSelection.carrier,
      service: quote.shippingSelection.service,
      customerRateCents: quote.shippingSelection.rateCents,
      status: "review_required",
      reviewReason: "The customer-selected carrier/service is no longer available at the current package details.",
      proposedShipmentId: fresh.shipmentId,
    });
    return { shipment: record, purchased: false, requiresConfirmation: true };
  }

  const difference = matching.rateCents - quote.shippingSelection.rateCents;
  const allowedIncrease = maxIncreaseCents(quote.shippingSelection.rateCents);
  if (difference > allowedIncrease && !options.force) {
    const record = await upsertShipment(requestId, {
      quoteId: quote.id,
      requestCode: request.requestCode,
      carrier: matching.carrier,
      service: matching.service,
      customerRateCents: quote.shippingSelection.rateCents,
      rateDifferenceCents: difference,
      status: "review_required",
      reviewReason: `Current postage is $${(difference / 100).toFixed(2)} higher than the customer-selected quote rate.`,
      proposedShipmentId: fresh.shipmentId,
      proposedRateId: matching.id,
      proposedRateCents: matching.rateCents,
    });
    return { shipment: record, purchased: false, requiresConfirmation: true };
  }

  const purchased = await buyEasyPostShipment(fresh.shipmentId, matching.id);
  const now = new Date().toISOString();
  const record = await upsertShipment(requestId, {
    quoteId: quote.id,
    requestCode: request.requestCode,
    easyPostShipmentId: purchased.shipmentId,
    easyPostRateId: matching.id,
    trackerId: purchased.tracker.id,
    carrier: matching.carrier,
    service: matching.service,
    customerRateCents: quote.shippingSelection.rateCents,
    postageCostCents: purchased.postageCostCents || matching.rateCents,
    rateDifferenceCents: (purchased.postageCostCents || matching.rateCents) - quote.shippingSelection.rateCents,
    trackingCode: purchased.trackingCode,
    publicTrackingUrl: purchased.tracker.publicUrl,
    labelUrl: purchased.labelUrl,
    labelPdfUrl: purchased.labelPdfUrl,
    labelPngUrl: purchased.labelPngUrl,
    status: purchased.tracker.status === "unknown" ? "label_created" : purchased.tracker.status,
    statusDetail: purchased.tracker.statusDetail,
    estimatedDeliveryDate: purchased.tracker.estimatedDeliveryDate,
    reviewReason: "",
    proposedShipmentId: "",
    proposedRateId: "",
    proposedRateCents: 0,
    refundStatus: purchased.refundStatus,
    purchasedAt: now,
    trackingEvents: trackerEvents(purchased.tracker),
  });
  await notifyCustomer(
    request,
    `Your shipping label has been created with ${record.carrier} ${record.service}. Tracking number: ${record.trackingCode}.`,
  );
  return { shipment: record, purchased: true, requiresConfirmation: false };
}

export async function autoBuyLabelIfEligible(requestId: string) {
  if (!easyPostAutoBuyEnabled()) return { attempted: false, warning: "" };
  try {
    const result = await buyLabelForRequest(requestId);
    if (result.requiresConfirmation) {
      return { attempted: true, warning: result.shipment.reviewReason || "Shipping cost changed and needs owner review." };
    }
    return { attempted: true, warning: "" };
  } catch (error) {
    return { attempted: true, warning: error instanceof Error ? error.message : "Automatic shipping-label purchase failed." };
  }
}

export async function refundLabelForRequest(requestId: string) {
  const request = await getStoredRequest(requestId);
  if (!request) throw new Error("Request not found.");
  const current = await shipmentForRequest(requestId);
  if (!current?.easyPostShipmentId || !current.trackingCode) throw new Error("No purchased EasyPost label is attached to this request.");
  if (["submitted", "refunded"].includes(current.refundStatus)) return current;
  const result = await refundEasyPostShipment(current.easyPostShipmentId);
  const refundStatus = result.refundStatus || "submitted";
  const updated = await upsertShipment(requestId, {
    quoteId: current.quoteId,
    requestCode: current.requestCode,
    refundStatus,
    status: refundStatus === "refunded" ? "refunded" : refundStatus === "rejected" ? "refund_rejected" : "refund_submitted",
    refundedAt: refundStatus === "refunded" ? new Date().toISOString() : current.refundedAt,
  });
  await notifyCustomer(request, "The shipping label for your order was voided/refund requested. We will provide updated shipping information if a replacement label is created.");
  return updated;
}

function shipmentStatusMessage(shipment: ShipmentRecord) {
  const label: Record<string, string> = {
    pre_transit: "Your shipping label is created and the carrier is waiting for the package.",
    in_transit: "Your order is in transit.",
    out_for_delivery: "Your order is out for delivery.",
    delivered: "Your order was delivered.",
    return_to_sender: "The carrier is returning your order to sender. We will follow up with you.",
    failure: "The carrier reported a delivery exception. We will review the shipment.",
    unknown: "The carrier posted a tracking update.",
  };
  const tracking = shipment.publicTrackingUrl ? ` Track it here: ${shipment.publicTrackingUrl}` : shipment.trackingCode ? ` Tracking: ${shipment.trackingCode}.` : "";
  return `${label[shipment.status] || "Your shipment has an update."}${tracking}`;
}

export async function applyEasyPostTrackerEvent(eventId: string, tracker: EasyPostTracker) {
  const result = await applyTrackingUpdate({
    trackerId: tracker.id,
    trackingCode: tracker.trackingCode,
    eventId,
    status: tracker.status,
    statusDetail: tracker.statusDetail,
    publicTrackingUrl: tracker.publicUrl,
    estimatedDeliveryDate: tracker.estimatedDeliveryDate,
    events: trackerEvents(tracker),
  });
  if (!result.shipment || !result.changed) return result.shipment;
  const request = await getStoredRequest(result.shipment.requestId);
  if (request) await notifyCustomer(request, shipmentStatusMessage(result.shipment));
  return result.shipment;
}
