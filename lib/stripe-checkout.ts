import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { StoredQuote } from "@/lib/quote-types";

export function siteOrigin() {
  const configured = (process.env.NEXT_PUBLIC_SITE_URL || "").trim();
  return (configured || "http://localhost:3000").replace(/\/$/, "");
}

export function stripeConfigured() {
  const key = (process.env.STRIPE_SECRET_KEY || "").trim();
  return Boolean(key && !key.includes("YOUR_") && !key.includes("replace") && /^(sk|rk)_(test|live)_/.test(key));
}

export function stripeConfigurationSummary() {
  const key = (process.env.STRIPE_SECRET_KEY || "").trim();
  const webhookSecret = (process.env.STRIPE_WEBHOOK_SECRET || "").trim();
  const origin = siteOrigin();
  const keyConfigured = stripeConfigured();
  const webhookConfigured = Boolean(webhookSecret && webhookSecret.startsWith("whsec_") && !webhookSecret.includes("replace"));
  const mode = key.startsWith("sk_live_") || key.startsWith("rk_live_") ? "live" : key.startsWith("sk_test_") || key.startsWith("rk_test_") ? "test" : "unconfigured";
  const secureOrigin = origin.startsWith("https://");
  return {
    keyConfigured,
    webhookConfigured,
    mode,
    siteOrigin: origin,
    secureOrigin,
    webhookUrl: `${origin}/api/payments/stripe/webhook`,
    checkoutReady: keyConfigured && (process.env.NODE_ENV !== "production" || secureOrigin),
    productionReady: keyConfigured && webhookConfigured && secureOrigin && mode === "live",
  } as const;
}

export async function createDepositCheckout(input: { quote: StoredQuote; email: string; requestCode: string }) {
  const key = (process.env.STRIPE_SECRET_KEY || "").trim();
  if (!stripeConfigured()) {
    if (process.env.NODE_ENV === "production") throw new Error("Stripe deposit payments are not configured.");
    return { id: `cs_dev_${input.quote.id}`, url: `${siteOrigin()}/profile?payment=development` };
  }
  const origin = siteOrigin();
  if (process.env.NODE_ENV === "production" && !origin.startsWith("https://")) throw new Error("NEXT_PUBLIC_SITE_URL must be your public HTTPS site URL before accepting real Stripe payments.");

  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("success_url", `${origin}/profile?payment=success`);
  params.set("cancel_url", `${origin}/profile?payment=cancelled`);
  params.set("client_reference_id", input.quote.id);
  params.set("customer_email", input.email);
  params.set("line_items[0][price_data][currency]", "usd");
  params.set("line_items[0][price_data][unit_amount]", String(input.quote.depositCents));
  params.set("line_items[0][price_data][product_data][name]", `50% custom print deposit — ${input.requestCode}`);
  const assemblyDescription = input.quote.assemblyMode === "assembled"
    ? `Assembled by Mesh Harbor 3D (assembly labor ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(input.quote.assemblyFeeCents / 100)} included).`
    : input.quote.assemblyMode === "disassembled"
      ? "Ships disassembled; an assembly guide is included and final assembly may require super glue."
      : "No assembly required.";
  const fulfillmentDescription = input.quote.fulfillmentMode === "shipping" && input.quote.shippingSelection
    ? `${input.quote.shippingSelection.carrier} ${input.quote.shippingSelection.service} shipping ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(input.quote.shippingSelection.rateCents / 100)} included.`
    : input.quote.fulfillmentMode === "local-delivery"
      ? `Local delivery ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(input.quote.localDeliveryFeeCents / 100)} included.`
      : "Local pickup; no fulfillment fee.";
  params.set("line_items[0][price_data][product_data][description]", `Quote revision ${input.quote.revision}. ${assemblyDescription} ${fulfillmentDescription} Remaining balance due before shipment or at pickup/delivery handoff.`);
  params.set("line_items[0][quantity]", "1");
  params.set("metadata[quote_id]", input.quote.id);
  params.set("metadata[request_id]", input.quote.requestId);
  params.set("metadata[request_code]", input.requestCode);
  params.set("payment_intent_data[metadata][quote_id]", input.quote.id);
  params.set("payment_intent_data[metadata][request_id]", input.quote.requestId);

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded", "Idempotency-Key": `deposit-${input.quote.id}-r${input.quote.revision}` },
    body: params.toString(),
    cache: "no-store",
  });
  const result = await response.json() as { id?: string; url?: string; error?: { message?: string } };
  if (!response.ok || !result.id || !result.url) throw new Error(result.error?.message || "Stripe could not create the deposit checkout.");
  return { id: result.id, url: result.url };
}

type StripeSignaturePart = { timestamp: number; signatures: string[] };
function parseSignature(header: string): StripeSignaturePart | null {
  let timestamp = 0; const signatures: string[] = [];
  for (const part of header.split(",")) {
    const [key, value] = part.trim().split("=", 2);
    if (key === "t") timestamp = Number(value);
    if (key === "v1" && value) signatures.push(value);
  }
  return timestamp && signatures.length ? { timestamp, signatures } : null;
}

export function verifyStripeWebhook(rawBody: string, header: string | null) {
  const secret = (process.env.STRIPE_WEBHOOK_SECRET || "").trim();
  if (!secret || !header) return false;
  const parsed = parseSignature(header); if (!parsed) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - parsed.timestamp) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${parsed.timestamp}.${rawBody}`).digest("hex");
  return parsed.signatures.some((signature) => {
    const left = Buffer.from(signature); const right = Buffer.from(expected);
    return left.length === right.length && timingSafeEqual(left, right);
  });
}
