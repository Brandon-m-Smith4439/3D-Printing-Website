export type EasyPostCredentialMode = "unconfigured" | "test" | "production";
export type EasyPostOperationalMode = "unconfigured" | "test" | "production-locked" | "production";

export function classifyEasyPostCredential(key: string): EasyPostCredentialMode {
  const normalized = key.trim();
  if (!normalized || normalized.includes("YOUR_") || normalized.toLowerCase().includes("replace")) return "unconfigured";
  if (/^EZTK/i.test(normalized)) return "test";
  if (/^EZ(?:AK|PK)/i.test(normalized)) return "production";
  return "unconfigured";
}

export function resolveEasyPostOperationalMode(key: string, liveEnabled: boolean): EasyPostOperationalMode {
  const credentialMode = classifyEasyPostCredential(key);
  if (credentialMode === "unconfigured") return "unconfigured";
  if (credentialMode === "test") return "test";
  return liveEnabled ? "production" : "production-locked";
}

export function easyPostBusinessCallsAllowed(mode: EasyPostOperationalMode) {
  return mode === "test" || mode === "production";
}
