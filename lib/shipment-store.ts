import "server-only";
import { randomUUID } from "node:crypto";
import { readCollection, writeCollection } from "@/lib/database";
import type { ShipmentRecord, ShipmentTrackingEvent } from "@/lib/shipment-types";

let mutationChain = Promise.resolve();

function normalize(item: ShipmentRecord): ShipmentRecord {
  return {
    ...item,
    trackerId: item.trackerId || "",
    publicTrackingUrl: item.publicTrackingUrl || "",
    labelUrl: item.labelUrl || "",
    labelPdfUrl: item.labelPdfUrl || "",
    labelPngUrl: item.labelPngUrl || "",
    status: item.status || "unknown",
    statusDetail: item.statusDetail || "",
    estimatedDeliveryDate: item.estimatedDeliveryDate || "",
    reviewReason: item.reviewReason || "",
    proposedShipmentId: item.proposedShipmentId || "",
    proposedRateId: item.proposedRateId || "",
    proposedRateCents: Number(item.proposedRateCents || 0),
    refundStatus: item.refundStatus || "",
    deliveredAt: item.deliveredAt || "",
    refundedAt: item.refundedAt || "",
    lastWebhookEventId: item.lastWebhookEventId || "",
    trackingEvents: Array.isArray(item.trackingEvents) ? item.trackingEvents : [],
  };
}

export async function readShipments() {
  return (await readCollection<ShipmentRecord>("shipments")).map(normalize);
}

async function writeShipments(items: ShipmentRecord[]) {
  await writeCollection("shipments", items);
}

function mutate<T>(operation: () => Promise<T>): Promise<T> {
  const next = mutationChain.then(operation, operation);
  mutationChain = next.then(() => undefined, () => undefined);
  return next;
}

export async function shipmentForRequest(requestId: string) {
  const items = await readShipments();
  return items.find((item) => item.requestId === requestId) || null;
}

export async function shipmentByTracker(trackerId: string, trackingCode = "") {
  const items = await readShipments();
  return items.find((item) => (trackerId && item.trackerId === trackerId) || (trackingCode && item.trackingCode === trackingCode)) || null;
}

export async function upsertShipment(
  requestId: string,
  values: Omit<Partial<ShipmentRecord>, "id" | "requestId" | "createdAt" | "updatedAt"> & { quoteId: string; requestCode: string },
) {
  return mutate(async () => {
    const items = await readShipments();
    const index = items.findIndex((item) => item.requestId === requestId);
    const now = new Date().toISOString();
    const existing = index >= 0 ? normalize(items[index]) : null;
    const next: ShipmentRecord = {
      id: existing?.id || randomUUID(),
      requestId,
      quoteId: values.quoteId || existing?.quoteId || "",
      requestCode: values.requestCode || existing?.requestCode || "",
      easyPostShipmentId: values.easyPostShipmentId ?? existing?.easyPostShipmentId ?? "",
      easyPostRateId: values.easyPostRateId ?? existing?.easyPostRateId ?? "",
      trackerId: values.trackerId ?? existing?.trackerId ?? "",
      carrier: values.carrier ?? existing?.carrier ?? "USPS",
      service: values.service ?? existing?.service ?? "",
      customerRateCents: Number(values.customerRateCents ?? existing?.customerRateCents ?? 0),
      postageCostCents: Number(values.postageCostCents ?? existing?.postageCostCents ?? 0),
      rateDifferenceCents: Number(values.rateDifferenceCents ?? existing?.rateDifferenceCents ?? 0),
      trackingCode: values.trackingCode ?? existing?.trackingCode ?? "",
      publicTrackingUrl: values.publicTrackingUrl ?? existing?.publicTrackingUrl ?? "",
      labelUrl: values.labelUrl ?? existing?.labelUrl ?? "",
      labelPdfUrl: values.labelPdfUrl ?? existing?.labelPdfUrl ?? "",
      labelPngUrl: values.labelPngUrl ?? existing?.labelPngUrl ?? "",
      status: values.status ?? existing?.status ?? "not_created",
      statusDetail: values.statusDetail ?? existing?.statusDetail ?? "",
      estimatedDeliveryDate: values.estimatedDeliveryDate ?? existing?.estimatedDeliveryDate ?? "",
      reviewReason: values.reviewReason ?? existing?.reviewReason ?? "",
      proposedShipmentId: values.proposedShipmentId ?? existing?.proposedShipmentId ?? "",
      proposedRateId: values.proposedRateId ?? existing?.proposedRateId ?? "",
      proposedRateCents: Number(values.proposedRateCents ?? existing?.proposedRateCents ?? 0),
      refundStatus: values.refundStatus ?? existing?.refundStatus ?? "",
      purchasedAt: values.purchasedAt ?? existing?.purchasedAt ?? "",
      deliveredAt: values.deliveredAt ?? existing?.deliveredAt ?? "",
      refundedAt: values.refundedAt ?? existing?.refundedAt ?? "",
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      lastWebhookEventId: values.lastWebhookEventId ?? existing?.lastWebhookEventId ?? "",
      trackingEvents: values.trackingEvents ?? existing?.trackingEvents ?? [],
    };
    if (index >= 0) items[index] = next;
    else items.push(next);
    await writeShipments(items);
    return next;
  });
}

export async function applyTrackingUpdate(input: {
  trackerId: string;
  trackingCode: string;
  eventId: string;
  status: ShipmentRecord["status"];
  statusDetail: string;
  publicTrackingUrl: string;
  estimatedDeliveryDate: string;
  events: ShipmentTrackingEvent[];
}) {
  return mutate(async () => {
    const items = await readShipments();
    const index = items.findIndex((item) =>
      (input.trackerId && item.trackerId === input.trackerId) ||
      (input.trackingCode && item.trackingCode === input.trackingCode),
    );
    if (index < 0) return { shipment: null, changed: false };
    const current = normalize(items[index]);
    if (input.eventId && current.lastWebhookEventId === input.eventId) return { shipment: current, changed: false };
    const now = new Date().toISOString();
    const changed = current.status !== input.status || current.statusDetail !== input.statusDetail;
    const deliveredAt = input.status === "delivered" ? current.deliveredAt || now : current.deliveredAt;
    const next: ShipmentRecord = {
      ...current,
      trackerId: input.trackerId || current.trackerId,
      trackingCode: input.trackingCode || current.trackingCode,
      status: input.status,
      statusDetail: input.statusDetail,
      publicTrackingUrl: input.publicTrackingUrl || current.publicTrackingUrl,
      estimatedDeliveryDate: input.estimatedDeliveryDate || current.estimatedDeliveryDate,
      trackingEvents: input.events.length ? input.events : current.trackingEvents,
      deliveredAt,
      lastWebhookEventId: input.eventId || current.lastWebhookEventId,
      updatedAt: now,
    };
    items[index] = next;
    await writeShipments(items);
    return { shipment: next, changed };
  });
}
