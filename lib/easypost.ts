import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { ShippingAddress, StoredQuote } from "@/lib/quote-types";
import { getSiteContent } from "@/lib/site-content-store";
import type { ShipmentStatus } from "@/lib/shipment-types";

const ALLOWED_CARRIERS = new Set(["USPS", "UPS", "FedEx"]);

export type EasyPostRate = {
  id: string;
  carrier: "USPS" | "UPS" | "FedEx";
  service: string;
  rateCents: number;
  deliveryDays: number | null;
  deliveryDate: string;
};

export type EasyPostTracker = {
  id: string;
  trackingCode: string;
  status: ShipmentStatus;
  statusDetail: string;
  publicUrl: string;
  estimatedDeliveryDate: string;
  trackingDetails: Array<{
    status: string;
    statusDetail: string;
    message: string;
    datetime: string;
    location: { city: string; state: string; country: string; zip: string } | null;
  }>;
};

type EasyPostErrorBody = {
  error?: { message?: string; code?: string; errors?: Array<{ message?: string; field?: string }> } | string;
  message?: string;
};

type RawTracker = {
  id?: string;
  tracking_code?: string;
  status?: string;
  status_detail?: string;
  public_url?: string;
  est_delivery_date?: string | null;
  tracking_details?: Array<{
    status?: string;
    status_detail?: string;
    message?: string;
    datetime?: string;
    tracking_location?: { city?: string; state?: string; country?: string; zip?: string };
  }>;
};

function apiKey() { return (process.env.EASYPOST_API_KEY || "").trim(); }
export function easyPostConfigured() {
  const key = apiKey();
  return Boolean(key && /^EZ(?:TK|AK)/i.test(key) && !key.includes("YOUR_") && !key.includes("replace"));
}

function originReady(origin: { street1: string; city: string; state: string; zip: string }) {
  return Boolean(origin.street1.trim() && origin.city.trim() && origin.state.trim() && origin.zip.trim());
}

export async function easyPostConfigurationSummary() {
  const key = apiKey();
  const testMode = /^EZTK/i.test(key);
  const content = await getSiteContent();
  const fromReady = originReady(content.shippingOrigin);
  const webhookSecret = (process.env.EASYPOST_WEBHOOK_SECRET || "").trim();
  return {
    configured: easyPostConfigured(),
    mode: easyPostConfigured() ? (testMode ? "test" : "production") : "unconfigured",
    fromAddressConfigured: fromReady,
    webhookSecretConfigured: Boolean(webhookSecret && webhookSecret.length >= 16),
    autoBuyLabels: /^(1|true|yes|on)$/i.test((process.env.EASYPOST_AUTO_BUY_LABELS || "").trim()),
    originLabel: fromReady ? `${content.shippingOrigin.city}, ${content.shippingOrigin.state} ${content.shippingOrigin.zip}` : "Not configured",
  } as const;
}

function authHeader() { return `Basic ${Buffer.from(`${apiKey()}:`).toString("base64")}`; }

async function fromAddress() {
  const content = await getSiteContent();
  const origin = content.shippingOrigin;
  return {
    name: origin.name.trim() || content.name,
    street1: origin.street1.trim(),
    street2: origin.street2.trim(),
    city: origin.city.trim(),
    state: origin.state.trim().toUpperCase(),
    zip: origin.zip.trim(),
    country: (origin.country || "US").trim().toUpperCase(),
  };
}

function dollarsToCents(value: string | number) { return Math.round(Number(value) * 100); }
function normalizeCarrier(carrier: string): EasyPostRate["carrier"] | null {
  const value = carrier.toLowerCase();
  if (value.includes("usps")) return "USPS";
  if (value.includes("fedex")) return "FedEx";
  if (value === "ups" || value.includes("united parcel")) return "UPS";
  return null;
}

function normalizeTrackerStatus(value: string): ShipmentStatus {
  const normalized = value.trim().toLowerCase().replaceAll("-", "_");
  const allowed = new Set<ShipmentStatus>(["pre_transit", "in_transit", "out_for_delivery", "delivered", "return_to_sender", "failure", "unknown"]);
  return allowed.has(normalized as ShipmentStatus) ? normalized as ShipmentStatus : "unknown";
}

function normalizeTracker(raw: RawTracker | null | undefined): EasyPostTracker {
  return {
    id: raw?.id || "",
    trackingCode: raw?.tracking_code || "",
    status: normalizeTrackerStatus(raw?.status || "unknown"),
    statusDetail: raw?.status_detail || "",
    publicUrl: raw?.public_url || "",
    estimatedDeliveryDate: raw?.est_delivery_date || "",
    trackingDetails: (raw?.tracking_details || []).map((detail) => ({
      status: detail.status || "",
      statusDetail: detail.status_detail || "",
      message: detail.message || "",
      datetime: detail.datetime || "",
      location: detail.tracking_location ? {
        city: detail.tracking_location.city || "",
        state: detail.tracking_location.state || "",
        country: detail.tracking_location.country || "",
        zip: detail.tracking_location.zip || "",
      } : null,
    })),
  };
}

function errorMessage(body: EasyPostErrorBody, fallback: string) {
  if (typeof body.error === "string" && body.error.trim()) return body.error.trim();
  if (body.error && typeof body.error === "object") {
    const details = (body.error.errors || []).map((item) => item.message).filter(Boolean).join(" ");
    if (details) return details;
    if (body.error.message) return body.error.message;
  }
  return body.message || fallback;
}

async function easyPostFetch(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("The carrier service took too long to respond. Please try again.");
    throw new Error("Could not reach the carrier service. Please try again shortly.");
  } finally {
    clearTimeout(timer);
  }
}

export async function getLiveShippingRates(quote: StoredQuote, to: ShippingAddress) {
  if (!easyPostConfigured()) throw new Error("Live shipping rates are not configured yet. The owner needs to add an EasyPost API key.");
  const origin = await fromAddress();
  if (!originReady(origin)) throw new Error("Mesh Harbor 3D's ship-from address is not configured yet. The owner can set it under Owner → Site Content.");
  if (quote.fulfillmentMode !== "shipping") throw new Error("This quote is not configured for carrier shipping.");
  if (quote.packageWeightOz <= 0 || quote.packageLengthIn <= 0 || quote.packageWidthIn <= 0 || quote.packageHeightIn <= 0) throw new Error("Package weight and dimensions are required before live rates can be requested.");

  const destination = {
    ...to,
    state: to.state.trim().toUpperCase(),
    zip: to.zip.trim(),
    country: (to.country || "US").trim().toUpperCase(),
  };
  const payload = {
    shipment: {
      to_address: destination,
      from_address: origin,
      parcel: {
        weight: quote.packageWeightOz,
        length: quote.packageLengthIn,
        width: quote.packageWidthIn,
        height: quote.packageHeightIn,
      },
      options: { currency: "USD" },
    },
  };
  const response = await easyPostFetch("https://api.easypost.com/v2/shipments", {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({})) as EasyPostErrorBody & {
    id?: string;
    rates?: Array<{ id?: string; carrier?: string; service?: string; rate?: string; delivery_days?: number | null; delivery_date?: string | null }>;
  };
  if (!response.ok || !result.id) throw new Error(errorMessage(result, "EasyPost could not calculate shipping rates."));
  const rates: EasyPostRate[] = (result.rates || []).flatMap((rate) => {
    const carrier = normalizeCarrier(rate.carrier || "");
    if (!carrier || !ALLOWED_CARRIERS.has(carrier) || !rate.id || !rate.service || !rate.rate) return [];
    return [{
      id: rate.id,
      carrier,
      service: rate.service,
      rateCents: dollarsToCents(rate.rate),
      deliveryDays: Number.isFinite(rate.delivery_days) ? Number(rate.delivery_days) : null,
      deliveryDate: rate.delivery_date || "",
    }];
  }).sort((a,b)=>a.rateCents-b.rateCents);
  if (!rates.length) throw new Error("No USPS, UPS, or FedEx rates were returned for this package and destination. Verify the address and packed dimensions, then try again.");
  return { shipmentId: result.id, rates };
}

export async function verifySelectedEasyPostRate(shipmentId: string, rateId: string) {
  if (!easyPostConfigured()) throw new Error("Live shipping rates are not configured yet.");
  const response = await easyPostFetch(`https://api.easypost.com/v2/shipments/${encodeURIComponent(shipmentId)}`, {
    headers: { Authorization: authHeader(), Accept: "application/json" },
  });
  const result = await response.json().catch(() => ({})) as EasyPostErrorBody & {
    rates?: Array<{ id?: string; carrier?: string; service?: string; rate?: string; delivery_days?: number | null; delivery_date?: string | null }>;
  };
  if (!response.ok) throw new Error(errorMessage(result, "Could not verify the selected carrier rate."));
  const raw = (result.rates || []).find((item)=>item.id===rateId);
  if (!raw || !raw.id || !raw.service || !raw.rate) throw new Error("That shipping rate is no longer available. Refresh rates and choose again.");
  const carrier = normalizeCarrier(raw.carrier || "");
  if (!carrier || !ALLOWED_CARRIERS.has(carrier)) throw new Error("Only USPS, UPS, and FedEx are available for customer selection.");
  return {
    id: raw.id,
    carrier,
    service: raw.service,
    rateCents: dollarsToCents(raw.rate),
    deliveryDays: Number.isFinite(raw.delivery_days) ? Number(raw.delivery_days) : null,
    deliveryDate: raw.delivery_date || "",
  } satisfies EasyPostRate;
}

export async function buyEasyPostShipment(shipmentId: string, rateId: string) {
  if (!easyPostConfigured()) throw new Error("EasyPost label purchasing is not configured yet.");
  const response = await easyPostFetch(`https://api.easypost.com/v2/shipments/${encodeURIComponent(shipmentId)}/buy`, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ rate: { id: rateId } }),
  });
  const result = await response.json().catch(() => ({})) as EasyPostErrorBody & {
    id?: string;
    tracking_code?: string;
    selected_rate?: { rate?: string };
    postage_label?: { label_url?: string; label_pdf_url?: string; label_png_url?: string };
    tracker?: RawTracker;
    refund_status?: "submitted" | "refunded" | "rejected" | "not_applicable" | null;
  };
  if (!response.ok || !result.id || !result.tracking_code) throw new Error(errorMessage(result, "EasyPost could not purchase the shipping label."));
  const tracker = normalizeTracker(result.tracker);
  return {
    shipmentId: result.id,
    trackingCode: result.tracking_code,
    postageCostCents: result.selected_rate?.rate ? dollarsToCents(result.selected_rate.rate) : 0,
    labelUrl: result.postage_label?.label_url || "",
    labelPdfUrl: result.postage_label?.label_pdf_url || "",
    labelPngUrl: result.postage_label?.label_png_url || "",
    refundStatus: result.refund_status || "",
    tracker: { ...tracker, trackingCode: tracker.trackingCode || result.tracking_code },
  };
}

export async function refundEasyPostShipment(shipmentId: string) {
  if (!easyPostConfigured()) throw new Error("EasyPost label refunds are not configured yet.");
  const response = await easyPostFetch(`https://api.easypost.com/v2/shipments/${encodeURIComponent(shipmentId)}/refund`, {
    method: "POST",
    headers: { Authorization: authHeader(), Accept: "application/json" },
  });
  const result = await response.json().catch(() => ({})) as EasyPostErrorBody & { refund_status?: "submitted" | "refunded" | "rejected" | "not_applicable" | null };
  if (!response.ok) throw new Error(errorMessage(result, "EasyPost could not submit the label refund."));
  return { refundStatus: result.refund_status || "submitted" as const };
}

export function verifyEasyPostWebhook(rawBody: string, method: string, headers: Headers) {
  const secret = (process.env.EASYPOST_WEBHOOK_SECRET || "").trim();
  if (!secret) return process.env.NODE_ENV !== "production";
  const timestamp = headers.get("x-timestamp") || "";
  const path = headers.get("x-path") || "";
  const supplied = (headers.get("x-hmac-signature-v2") || headers.get("x-hmac-signature") || "").replace(/^hmac-sha256-hex=/i, "").trim();
  if (!timestamp || !path || !supplied) return false;
  const sentAt = Date.parse(timestamp);
  if (!Number.isFinite(sentAt)) return false;
  const ageMs = Date.now() - sentAt;
  if (ageMs > 60_000 || ageMs < -30_000) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}${method.toUpperCase()}${path}${rawBody}`, "utf8").digest("hex");
  const left = Buffer.from(supplied.toLowerCase());
  const right = Buffer.from(expected.toLowerCase());
  return left.length === right.length && timingSafeEqual(left, right);
}

export function easyPostTrackerFromWebhook(value: unknown): EasyPostTracker | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as RawTracker;
  if (!raw.id && !raw.tracking_code) return null;
  return normalizeTracker(raw);
}
