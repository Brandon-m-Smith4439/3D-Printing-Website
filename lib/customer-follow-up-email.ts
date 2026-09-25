import type { CustomerFollowUpRecord } from "./customer-follow-up-types.ts";
import type { StoredRequest } from "./request-types.ts";

export type FollowUpEmailResult =
  | { ok: true; emailId: string }
  | { ok: false; retryable: boolean; reason: string };

export function resendFailureKind(status: number | null, networkFailure = false): "retryable" | "permanent" {
  if (networkFailure) return "retryable";
  if (status === 429 || (status !== null && status >= 500)) return "retryable";
  return "permanent";
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function siteOrigin() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").trim().replace(/\/$/, "");
}

export async function sendFollowUpEmail(input: { request: StoredRequest; record: CustomerFollowUpRecord }): Promise<FollowUpEmailResult> {
  const { findCustomerById } = await import("./customer-store.ts");
  const account = input.request.customerAccountId ? await findCustomerById(input.request.customerAccountId) : null;
  if (!account) return { ok: false, retryable: false, reason: "Linked customer account is unavailable." };
  if (!account.emailVerifiedAt) return { ok: false, retryable: false, reason: "Customer email is not verified." };
  const wantsEmail = input.request.emailNotifications ?? account.preferences.emailStatusUpdates ?? false;
  if (!wantsEmail) return { ok: false, retryable: false, reason: "Customer email updates are disabled." };

  const apiKey = (process.env.RESEND_API_KEY || "").trim();
  const from = (process.env.REQUEST_FROM_EMAIL || "").trim();
  if (!apiKey || apiKey.startsWith("YOUR_") || !from || from.includes("yourdomain.com")) {
    return { ok: false, retryable: false, reason: "Customer email service is not configured." };
  }

  const profileUrl = `${siteOrigin()}/profile`;
  const payload = {
    from,
    to: [account.email],
    subject: input.record.subject,
    text: `${input.record.text}\n\nRequest: ${input.request.requestCode}\n\nOpen your profile: ${profileUrl}`,
  };
  const body = JSON.stringify(payload);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": input.record.idempotencyKey,
        },
        body,
        signal: controller.signal,
      });
      if (response.ok) {
        const json = await response.json().catch(() => ({})) as { id?: string };
        return { ok: true, emailId: json.id || "" };
      }
      const retryable = resendFailureKind(response.status) === "retryable";
      if (!retryable || attempt === 2) {
        return { ok: false, retryable, reason: retryable ? "Email service is temporarily unavailable." : "Email service rejected the reminder request." };
      }
    } catch {
      if (attempt === 2) return { ok: false, retryable: true, reason: "Email service could not be reached." };
    } finally {
      clearTimeout(timer);
    }
    await sleep(attempt === 0 ? 1_000 : 2_000);
  }
  return { ok: false, retryable: true, reason: "Email service could not be reached." };
}
