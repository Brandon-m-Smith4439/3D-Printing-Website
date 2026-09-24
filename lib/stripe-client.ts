import "server-only";
import Stripe from "stripe";

let cachedKey = "";
let cachedClient: Stripe | null = null;

export function stripeSecretKey() {
  return (process.env.STRIPE_SECRET_KEY || "").trim();
}

export function stripeKeyMode(): "test" | "live" | "unconfigured" {
  const key = stripeSecretKey();
  if (/^(sk|rk)_live_/.test(key)) return "live";
  if (/^(sk|rk)_test_/.test(key)) return "test";
  return "unconfigured";
}

export function stripeSdkConfigured() {
  const key = stripeSecretKey();
  return Boolean(key && !key.includes("YOUR_") && !key.includes("replace") && /^(sk|rk)_(test|live)_/.test(key));
}

export function stripeClient() {
  const key = stripeSecretKey();
  if (!stripeSdkConfigured()) throw new Error("Stripe is not configured.");
  if (!cachedClient || cachedKey !== key) {
    cachedKey = key;
    cachedClient = new Stripe(key, {
      apiVersion: "2026-08-26.dahlia",
      appInfo: { name: "Mesh Harbor 3D", version: "0.86.0" },
    });
  }
  return cachedClient;
}
