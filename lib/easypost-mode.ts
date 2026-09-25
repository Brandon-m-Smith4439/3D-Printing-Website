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

export type EasyPostWebhookSummary = { webhookFound: boolean; webhookDisabled: boolean };

export function summarizeEasyPostWebhooks(
  expectedUrl: string,
  webhooks: Array<{ url?: string | null; disabled_at?: string | null }>,
): EasyPostWebhookSummary {
  const normalizedExpected = expectedUrl.trim().replace(/\/$/, "");
  const match = webhooks.find((item) => (item.url || "").trim().replace(/\/$/, "") === normalizedExpected);
  return {
    webhookFound: Boolean(match),
    webhookDisabled: Boolean(match?.disabled_at),
  };
}

export type EasyPostReadiness =
  | "unconfigured"
  | "test-incomplete"
  | "test-ready"
  | "production-locked"
  | "production-incomplete"
  | "production-ready";

export function easyPostReadinessPresentation(readiness: EasyPostReadiness) {
  switch (readiness) {
    case "test-ready":
      return { tone: "good" as const, label: "EasyPost test ready", detail: "Rates, test labels, refunds, and tracking can be validated safely; live shipping remains off." };
    case "production-locked":
      return { tone: "warning" as const, label: "EasyPost live key locked", detail: "A production key is installed, but real rates and labels are blocked until live shipping is deliberately enabled." };
    case "production-incomplete":
      return { tone: "error" as const, label: "EasyPost live setup incomplete", detail: "Live shipping is enabled, but the ship-from address or signed webhook setup still needs attention." };
    case "production-ready":
      return { tone: "good" as const, label: "EasyPost production ready", detail: "Live shipping is enabled with the required ship-from address and signed webhook configuration." };
    case "test-incomplete":
      return { tone: "warning" as const, label: "EasyPost test setup incomplete", detail: "A test key is installed, but the ship-from address or signed webhook setup still needs attention." };
    default:
      return { tone: "warning" as const, label: "EasyPost not configured", detail: "Add the EasyPost API key before testing carrier shipping." };
  }
}

export function easyPostDiagnosticNoticeKind(input: {
  connected: boolean;
  webhookFound: boolean;
  webhookDisabled: boolean;
}): "success" | "warning" | "error" {
  if (!input.connected) return "error";
  return input.webhookFound && !input.webhookDisabled ? "success" : "warning";
}
