export type ShipmentStatus =
  | "not_created"
  | "review_required"
  | "label_created"
  | "pre_transit"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "return_to_sender"
  | "failure"
  | "unknown"
  | "refund_submitted"
  | "refunded"
  | "refund_rejected";

export type ShipmentTrackingLocation = {
  city: string;
  state: string;
  country: string;
  zip: string;
};

export type ShipmentTrackingEvent = {
  id: string;
  eventId: string;
  status: string;
  statusDetail: string;
  message: string;
  datetime: string;
  location: ShipmentTrackingLocation | null;
};

export type ShipmentRecord = {
  id: string;
  requestId: string;
  quoteId: string;
  requestCode: string;
  easyPostShipmentId: string;
  easyPostRateId: string;
  trackerId: string;
  carrier: "USPS" | "UPS" | "FedEx";
  service: string;
  customerRateCents: number;
  postageCostCents: number;
  rateDifferenceCents: number;
  trackingCode: string;
  publicTrackingUrl: string;
  labelUrl: string;
  labelPdfUrl: string;
  labelPngUrl: string;
  status: ShipmentStatus;
  statusDetail: string;
  estimatedDeliveryDate: string;
  reviewReason: string;
  proposedShipmentId: string;
  proposedRateId: string;
  proposedRateCents: number;
  refundStatus: "" | "submitted" | "refunded" | "rejected" | "not_applicable";
  purchasedAt: string;
  deliveredAt: string;
  refundedAt: string;
  createdAt: string;
  updatedAt: string;
  lastWebhookEventId: string;
  trackingEvents: ShipmentTrackingEvent[];
};
