import "server-only";
import type { ShippingAddress, StoredQuote } from "@/lib/quote-types";

const ALLOWED_CARRIERS = new Set(["USPS", "UPS", "FedEx"]);

export type EasyPostRate = {
  id: string;
  carrier: "USPS" | "UPS" | "FedEx";
  service: string;
  rateCents: number;
  deliveryDays: number | null;
  deliveryDate: string;
};

function apiKey() { return (process.env.EASYPOST_API_KEY || "").trim(); }
export function easyPostConfigured() {
  const key = apiKey();
  return Boolean(key && /^EZ(?:TK|AK)/i.test(key) && !key.includes("YOUR_") && !key.includes("replace"));
}
export function easyPostConfigurationSummary() {
  const key = apiKey();
  const testMode = /^EZTK/i.test(key);
  const fromReady = Boolean((process.env.SHIPPING_FROM_STREET1||"").trim() && (process.env.SHIPPING_FROM_CITY||"").trim() && (process.env.SHIPPING_FROM_STATE||"").trim() && (process.env.SHIPPING_FROM_ZIP||"").trim());
  return { configured: easyPostConfigured(), mode: easyPostConfigured() ? (testMode ? "test" : "production") : "unconfigured", fromAddressConfigured: fromReady } as const;
}
function authHeader() { return `Basic ${Buffer.from(`${apiKey()}:`).toString("base64")}`; }
function fromAddress() {
  return {
    name: (process.env.SHIPPING_FROM_NAME || "Mesh Harbor 3D").trim(),
    street1: (process.env.SHIPPING_FROM_STREET1 || "").trim(),
    street2: (process.env.SHIPPING_FROM_STREET2 || "").trim(),
    city: (process.env.SHIPPING_FROM_CITY || "").trim(),
    state: (process.env.SHIPPING_FROM_STATE || "").trim(),
    zip: (process.env.SHIPPING_FROM_ZIP || "").trim(),
    country: (process.env.SHIPPING_FROM_COUNTRY || "US").trim().toUpperCase(),
  };
}
function dollarsToCents(value: string | number) { return Math.round(Number(value) * 100); }
function normalizeCarrier(carrier: string): EasyPostRate["carrier"] | null {
  const value = carrier.toLowerCase();
  if (value.includes("usps")) return "USPS";
  if (value.includes("ups")) return "UPS";
  if (value.includes("fedex")) return "FedEx";
  return null;
}

export async function getLiveShippingRates(quote: StoredQuote, to: ShippingAddress) {
  if (!easyPostConfigured()) throw new Error("Live shipping rates are not configured yet.");
  const origin = fromAddress();
  if (!origin.street1 || !origin.city || !origin.state || !origin.zip) throw new Error("Mesh Harbor 3D shipping origin is not configured yet.");
  if (quote.fulfillmentMode !== "shipping") throw new Error("This quote is not configured for carrier shipping.");
  if (quote.packageWeightOz <= 0 || quote.packageLengthIn <= 0 || quote.packageWidthIn <= 0 || quote.packageHeightIn <= 0) throw new Error("Package weight and dimensions are required before live rates can be requested.");

  const payload = {
    shipment: {
      to_address: to,
      from_address: origin,
      parcel: { weight: quote.packageWeightOz, length: quote.packageLengthIn, width: quote.packageWidthIn, height: quote.packageHeightIn },
      options: { currency: "USD" },
    },
  };
  const response = await fetch("https://api.easypost.com/v2/shipments", {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const result = await response.json() as { id?: string; rates?: Array<{ id?: string; carrier?: string; service?: string; rate?: string; delivery_days?: number | null; delivery_date?: string | null }>; error?: { message?: string }; message?: string };
  if (!response.ok || !result.id) throw new Error(result.error?.message || result.message || "EasyPost could not calculate shipping rates.");
  const rates: EasyPostRate[] = (result.rates || []).flatMap((rate) => {
    const carrier = normalizeCarrier(rate.carrier || "");
    if (!carrier || !ALLOWED_CARRIERS.has(carrier) || !rate.id || !rate.service || !rate.rate) return [];
    return [{ id: rate.id, carrier, service: rate.service, rateCents: dollarsToCents(rate.rate), deliveryDays: Number.isFinite(rate.delivery_days) ? Number(rate.delivery_days) : null, deliveryDate: rate.delivery_date || "" }];
  }).sort((a,b)=>a.rateCents-b.rateCents);
  if (!rates.length) throw new Error("No USPS, UPS, or FedEx rates were returned for this package and destination.");
  return { shipmentId: result.id, rates };
}

export async function verifySelectedEasyPostRate(shipmentId: string, rateId: string) {
  if (!easyPostConfigured()) throw new Error("Live shipping rates are not configured yet.");
  const response = await fetch(`https://api.easypost.com/v2/shipments/${encodeURIComponent(shipmentId)}`, { headers: { Authorization: authHeader() }, cache: "no-store" });
  const result = await response.json() as { rates?: Array<{ id?: string; carrier?: string; service?: string; rate?: string; delivery_days?: number | null; delivery_date?: string | null }>; error?: { message?: string }; message?: string };
  if (!response.ok) throw new Error(result.error?.message || result.message || "Could not verify the selected carrier rate.");
  const raw = (result.rates || []).find((item)=>item.id===rateId);
  if (!raw || !raw.id || !raw.service || !raw.rate) throw new Error("That shipping rate is no longer available. Refresh rates and choose again.");
  const carrier = normalizeCarrier(raw.carrier || "");
  if (!carrier || !ALLOWED_CARRIERS.has(carrier)) throw new Error("Only USPS, UPS, and FedEx are available for customer selection.");
  return { id: raw.id, carrier, service: raw.service, rateCents: dollarsToCents(raw.rate), deliveryDays: Number.isFinite(raw.delivery_days) ? Number(raw.delivery_days) : null, deliveryDate: raw.delivery_date || "" } satisfies EasyPostRate;
}
