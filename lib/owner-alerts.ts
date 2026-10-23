import "server-only";

/**
 * Owner alerts: short text messages (SMS) plus an optional email copy.
 *
 * SMS route, in order of preference:
 *   1. Twilio REST  — TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM, OWNER_PHONE
 *   2. Carrier email-to-SMS gateway via Resend — OWNER_SMS_GATEWAY (e.g. 9285551234@vtext.com)
 * Email copy goes to OWNER_ALERT_EMAIL (falls back to REQUEST_TO_EMAIL).
 *
 * Alerts never throw: a failed alert must not break an order flow. Failures are logged.
 */

export type OwnerAlertResult = { sms: "sent" | "skipped" | "failed"; email: "sent" | "skipped" | "failed" };

function env(name: string) { return (process.env[name] || "").trim(); }

function smsBody(text: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 600 ? `${clean.slice(0, 597)}...` : clean;
}

async function sendTwilio(text: string): Promise<"sent" | "skipped" | "failed"> {
  const sid = env("TWILIO_ACCOUNT_SID"), token = env("TWILIO_AUTH_TOKEN"), from = env("TWILIO_FROM"), to = env("OWNER_PHONE");
  if (!sid || !token || !from || !to) return "skipped";
  try {
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: from, Body: smsBody(text) }).toString(),
      cache: "no-store",
    });
    if (!response.ok) { console.error("Owner SMS (Twilio) failed", response.status); return "failed"; }
    return "sent";
  } catch { console.error("Owner SMS (Twilio) error"); return "failed"; }
}

async function sendResend(to: string, subject: string, text: string, attachments?: { filename: string; content: string }[]) {
  const apiKey = env("RESEND_API_KEY"), from = env("REQUEST_FROM_EMAIL");
  if (!apiKey || !from || !to) return "skipped" as const;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, text, ...(attachments?.length ? { attachments } : {}) }),
      cache: "no-store",
    });
    if (!response.ok) { console.error("Owner alert email failed", response.status); return "failed" as const; }
    return "sent" as const;
  } catch { console.error("Owner alert email error"); return "failed" as const; }
}

export function ownerSmsConfigured() {
  return Boolean((env("TWILIO_ACCOUNT_SID") && env("TWILIO_AUTH_TOKEN") && env("TWILIO_FROM") && env("OWNER_PHONE")) || env("OWNER_SMS_GATEWAY"));
}

export async function alertOwner(input: {
  text: string;
  subject?: string;
  email?: boolean;
  emailBody?: string;
  attachments?: { filename: string; content: string }[];
}): Promise<OwnerAlertResult> {
  let sms = await sendTwilio(input.text);
  if (sms !== "sent" && env("OWNER_SMS_GATEWAY")) {
    // Gateways render plain text; keep the subject empty-ish so carriers do not prefix noise.
    sms = await sendResend(env("OWNER_SMS_GATEWAY"), "MH3D", smsBody(input.text));
  }
  const ownerEmail = env("OWNER_ALERT_EMAIL") || env("REQUEST_TO_EMAIL");
  const email = input.email
    ? await sendResend(ownerEmail, input.subject || "Mesh Harbor 3D alert", input.emailBody || input.text, input.attachments)
    : "skipped";
  return { sms, email };
}

/** Fire-and-forget wrapper for webhook paths. */
export function alertOwnerSoon(input: Parameters<typeof alertOwner>[0]) {
  void alertOwner(input).catch(() => console.error("Owner alert dispatch error"));
}
