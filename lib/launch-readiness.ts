import type { PickupSettings, ShippingOrigin } from "@/lib/site";
import type { OwnerBackupInfo, OwnerFollowUpSummary, OwnerShippingSummary, OwnerStripeSummary } from "@/lib/owner-operations-types";

export type LaunchReadinessStatus = "ready" | "attention" | "blocked";
export type LaunchReadinessItem = {
  id: string;
  title: string;
  status: LaunchReadinessStatus;
  detail: string;
  category: "site" | "security" | "payments" | "shipping" | "operations";
};
export type LaunchReadinessReport = {
  generatedAt: string;
  readyCount: number;
  attentionCount: number;
  blockedCount: number;
  liveCommerceReady: boolean;
  operatingMode: "sandbox" | "live-ready";
  items: LaunchReadinessItem[];
};

function completeAddress(value: Pick<ShippingOrigin, "street1" | "city" | "state" | "zip">) {
  return Boolean(value.street1.trim() && value.city.trim() && value.state.trim() && value.zip.trim());
}
function hoursOld(value: string, nowMs: number) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor((nowMs - parsed) / 3_600_000)) : Number.POSITIVE_INFINITY;
}
function item(id: string, title: string, status: LaunchReadinessStatus, detail: string, category: LaunchReadinessItem["category"]): LaunchReadinessItem {
  return { id, title, status, detail, category };
}

export function buildLaunchReadiness(input: {
  stripe: OwnerStripeSummary;
  shipping: OwnerShippingSummary;
  shippingOrigin: ShippingOrigin;
  pickup: PickupSettings;
  backups: OwnerBackupInfo[];
  security: { twoFactorEnabled: boolean; recoveryCodesRemaining: number };
  followUps: OwnerFollowUpSummary;
  policyVersion: string;
  now?: Date;
}): LaunchReadinessReport {
  const now = input.now || new Date();
  const nowMs = now.getTime();
  const items: LaunchReadinessItem[] = [];

  items.push(input.stripe.secureOrigin
    ? item("https", "Public HTTPS origin", "ready", "The configured public site origin uses HTTPS.", "site")
    : item("https", "Public HTTPS origin", "blocked", "Set the public production site URL to HTTPS before live commerce.", "site"));

  items.push(item("policies", "Customer policies", "ready", `Terms and fulfillment policy are versioned as ${input.policyVersion} and quote approval records acceptance.`, "site"));

  items.push(input.security.twoFactorEnabled
    ? item("owner-2fa", "Owner two-factor authentication", input.security.recoveryCodesRemaining > 0 ? "ready" : "attention", input.security.recoveryCodesRemaining > 0 ? `${input.security.recoveryCodesRemaining} recovery codes remain.` : "2FA is enabled, but regenerate recovery codes before launch.", "security")
    : item("owner-2fa", "Owner two-factor authentication", "attention", "Enable owner 2FA before switching payment or shipping systems to live mode.", "security"));

  const latestBackup = [...input.backups].sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0];
  const backupAge = latestBackup ? hoursOld(latestBackup.createdAt, nowMs) : Number.POSITIVE_INFINITY;
  items.push(!latestBackup
    ? item("backups", "Verified recovery path", "blocked", "No backup snapshot is available. Create and verify one before launch.", "operations")
    : backupAge > 72
      ? item("backups", "Verified recovery path", "blocked", `Latest backup is ${backupAge} hours old. Create and verify a fresh snapshot.`, "operations")
      : backupAge > 36
        ? item("backups", "Verified recovery path", "attention", `Latest backup is ${backupAge} hours old and should be refreshed before launch.`, "operations")
        : item("backups", "Verified recovery path", "ready", `Latest backup is ${backupAge} hours old.`, "operations"));

  const pickupReady = input.pickup.enabled && completeAddress(input.pickup);
  items.push(pickupReady
    ? item("pickup", "Local pickup workflow", "ready", `Scheduling is enabled for ${input.pickup.publicArea} with a private exact address.`, "shipping")
    : item("pickup", "Local pickup workflow", "attention", "Local pickup remains disabled or its exact address is incomplete. Enable it only when the designated location is ready.", "shipping"));

  items.push(completeAddress(input.shippingOrigin) && input.shipping.fromAddressConfigured
    ? item("shipping-origin", "Shipping origin", "ready", "The private ship-from address is configured.", "shipping")
    : item("shipping-origin", "Shipping origin", "blocked", "Complete the ship-from address before carrier shipping can be launched.", "shipping"));

  const stripeReadyForSandbox = input.stripe.keyConfigured && input.stripe.webhookConfigured && input.stripe.checkoutReady;
  items.push(input.stripe.productionReady
    ? item("stripe", "Stripe payments", "ready", "Stripe reports live production readiness with the explicit live gate enabled.", "payments")
    : input.stripe.operationalMode === "live-locked"
      ? item("stripe", "Stripe payments", "attention", "A live Stripe key is configured, but STRIPE_LIVE_ENABLED is off. New real charges and final invoices remain blocked.", "payments")
      : stripeReadyForSandbox
        ? item("stripe", "Stripe payments", "attention", `Stripe is healthy in ${input.stripe.mode} mode. Live mode remains intentionally unlaunched.`, "payments")
        : item("stripe", "Stripe payments", "blocked", "Stripe key, HTTPS checkout, webhook signing, or the explicit live gate is incomplete.", "payments"));

  const easyPostReady = input.shipping.readiness === "production-ready" || input.shipping.readiness === "test-ready";
  items.push(input.shipping.readiness === "production-ready"
    ? item("easypost", "EasyPost shipping", "ready", "EasyPost reports production readiness with the live gate enabled.", "shipping")
    : easyPostReady
      ? item("easypost", "EasyPost shipping", "attention", "EasyPost is ready for controlled test workflows; production shipping remains gated.", "shipping")
      : input.shipping.readiness === "production-locked"
        ? item("easypost", "EasyPost shipping", "attention", "Production credentials are present, but the explicit live-shipping gate remains locked.", "shipping")
        : item("easypost", "EasyPost shipping", "blocked", "EasyPost credentials, ship-from address, or webhook signing is incomplete.", "shipping"));

  items.push(input.shipping.autoBuyLabels
    ? item("auto-buy", "Automatic label purchase", "attention", "Automatic label buying is enabled. Mesh Harbor policy calls for owner-reviewed label purchase before live launch.", "shipping")
    : item("auto-buy", "Automatic label purchase", "ready", "Automatic label buying is off; label purchase remains owner-controlled.", "shipping"));

  items.push(input.followUps.deploymentEnabled && input.followUps.ownerEnabled
    ? item("followups", "Customer follow-up automation", "ready", "Deployment and owner gates are enabled.", "operations")
    : item("followups", "Customer follow-up automation", "attention", "Customer follow-up automation is paused by a deployment or owner gate.", "operations"));

  const liveCommerceReady = input.stripe.productionReady && input.shipping.readiness === "production-ready" && input.stripe.secureOrigin;
  items.push(liveCommerceReady
    ? item("live-commerce", "Live commerce activation", "ready", "Payments and carrier shipping report production readiness.", "payments")
    : item("live-commerce", "Live commerce activation", "attention", "Keep Stripe and carrier shipping in guarded/test mode until a controlled live activation is explicitly approved.", "payments"));

  return {
    generatedAt: now.toISOString(),
    readyCount: items.filter((x)=>x.status==="ready").length,
    attentionCount: items.filter((x)=>x.status==="attention").length,
    blockedCount: items.filter((x)=>x.status==="blocked").length,
    liveCommerceReady,
    operatingMode: liveCommerceReady ? "live-ready" : "sandbox",
    items,
  };
}
