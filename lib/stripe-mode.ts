export type StripeCredentialMode = "test" | "live" | "unconfigured";
export type StripeOperationalMode = "test" | "live-locked" | "live" | "unconfigured";

export function classifyStripeCredential(key: string): StripeCredentialMode {
  const value = key.trim();
  if (/^(sk|rk)_live_/.test(value)) return "live";
  if (/^(sk|rk)_test_/.test(value)) return "test";
  return "unconfigured";
}

export function resolveStripeOperationalMode(key: string, liveEnabled: boolean): StripeOperationalMode {
  const credential = classifyStripeCredential(key);
  if (credential === "unconfigured") return "unconfigured";
  if (credential === "test") return "test";
  return liveEnabled ? "live" : "live-locked";
}

export function stripeBusinessCallsAllowed(mode: StripeOperationalMode) {
  return mode === "test" || mode === "live";
}
