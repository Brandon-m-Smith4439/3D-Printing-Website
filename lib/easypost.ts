import "server-only";
import type { ShippingAddress, StoredQuote } from "@/lib/quote-types";
import { getSiteContent } from "@/lib/site-content-store";

const ALLOWED_CARRIERS = new Set(["USPS", "UPS", "FedEx"]);

export type EasyPostRate = {
  id: string;
  carrier: "USPS" | "UPS" | "FedEx";
  service: string;
  rateCents: number;
  deliveryDays: number | null;
  deliveryDate: string;
};

type EasyPostErrorBody = {
  error?: { message?: string; code?: string; errors?: Array<{ message?: string; field?: string }> } | string;
  message?: string;
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
  return {
    configured: easyPostConfigured(),
    mode: easyPostConfigured() ? (testMode ? "test" : "production") : "unconfigured",
    fromAddressConfigured: fromReady,
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
    if (error instanceof Error && error.name === "AbortError") throw new Error("The carrier-rate service took too long to respond. Please try again.");
    throw new Error("Could not reach the carrier-rate service. Please try again shortly.");
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
