import { NextRequest, NextResponse } from "next/server";
import { customRequestSchema, type CustomRequest } from "@/lib/request-schema";
import { createStoredRequest } from "@/lib/request-store";
import { assessCustomRequestRisk, type RequestRiskAssessment } from "@/lib/request-risk";
import { customerFromRequest } from "@/lib/customer-auth";
import { claimCustomerUploads, validateCustomerUploadClaims } from "@/lib/customer-upload-store";

export const runtime = "nodejs";

const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 5;
const buckets = new Map<string, { count: number; resetAt: number }>();

function clientIp(request: NextRequest) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function isRateLimited(ip: string) {
  const now = Date.now();
  if (buckets.size > 5000) {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }
  const existing = buckets.get(ip);
  if (!existing || existing.resetAt <= now) {
    buckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  existing.count += 1;
  return existing.count > MAX_REQUESTS;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function configuredSecret(value?: string) {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed || trimmed === "YOUR_SECRET_KEY" || trimmed.startsWith("YOUR_")) return "";
  return trimmed;
}

async function verifyTurnstile(token: string, ip: string) {
  // The development server is intentionally frictionless for local form testing.
  // Production never uses this bypass and still requires real server-side verification.
  if (process.env.NODE_ENV !== "production") return true;

  const secret = configuredSecret(process.env.TURNSTILE_SECRET_KEY);
  if (!secret || !token) return false;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, response: token, remoteip: ip }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) return false;
    const result = (await response.json()) as { success?: boolean; hostname?: string; action?: string };
    if (!result.success || (result.action && result.action !== "custom-request")) return false;

    let expectedHost: string | null = null;
    if (process.env.NEXT_PUBLIC_SITE_URL) {
      try {
        expectedHost = new URL(process.env.NEXT_PUBLIC_SITE_URL).hostname;
      } catch {
        return false;
      }
    }
    return !expectedHost || !result.hostname || result.hostname === expectedHost;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function originAllowed(request: NextRequest) {
  const expected = process.env.NEXT_PUBLIC_SITE_URL;
  if (!expected || process.env.NODE_ENV !== "production") return true;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(expected).origin;
  } catch {
    return false;
  }
}

async function sendEmail(values: CustomRequest, risk: RequestRiskAssessment) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.REQUEST_TO_EMAIL;
  const from = process.env.REQUEST_FROM_EMAIL;

  const configured = Boolean(
    apiKey && !apiKey.startsWith("YOUR_") &&
    to && to !== "you@example.com" &&
    from && !from.includes("yourdomain.com")
  );

  if (!configured) {
    if (process.env.NODE_ENV === "production") throw new Error("Request delivery is not configured.");
    console.info("Custom request (development):", values);
    return;
  }

  const fields = [
    ["Name", values.name],
    ["Email", values.email],
    ["Phone", values.phone || "—"],
    ["Project type", values.projectType],
    ["3D model status", values.modelStatus],
    ["Fulfillment", values.fulfillmentMethod],
    ["Assembly preference", values.assemblyPreference === "assembled" ? "Assembled by Mesh Harbor 3D" : values.assemblyPreference === "disassembled" ? "Disassembled with assembly guide" : "Not sure yet"],
    ["Quantity", String(values.quantity)],
    ["Dimensions", values.dimensions || "—"],
    ["Material", values.materialPreference],
    ["Color", values.colorPreference || "—"],
    ["Budget", values.budget || "—"],
    ["Needed by", values.neededBy || "—"],
    ["Reference", values.referenceUrl || "—"],
    ["Attachments", values.attachments.length ? `${values.attachments.length} uploaded file(s)` : "—"],
  ];

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:700px;margin:auto;color:#172033">
      <h1 style="font-size:24px">New custom 3D print request</h1>
      ${risk.review ? `<div style="margin:12px 0 18px;padding:12px;border:1px solid #d9a441;background:#fff8e8;color:#6f4e00"><strong>Review suggested:</strong> automated screening found payment wording worth checking before replying.</div>` : ""}
      <table style="border-collapse:collapse;width:100%">
        ${fields.map(([label, value]) => `<tr><td style="padding:8px;border-bottom:1px solid #ddd;font-weight:700">${escapeHtml(label)}</td><td style="padding:8px;border-bottom:1px solid #ddd">${escapeHtml(value)}</td></tr>`).join("")}
      </table>
      <h2 style="font-size:18px;margin-top:24px">Project details</h2>
      <p style="white-space:pre-wrap;line-height:1.6">${escapeHtml(values.description)}</p>
    </div>`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      reply_to: values.email,
      subject: `${risk.review ? "[Review] " : ""}Custom print request — ${values.name.replace(/[\r\n]+/g, " ")}`,
      html,
    }),
    cache: "no-store",
  });

  if (!response.ok) throw new Error("Email provider rejected the request.");
}

export async function POST(request: NextRequest) {
  if (!originAllowed(request)) {
    return NextResponse.json({ message: "Request origin was not accepted." }, { status: 403 });
  }

  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return NextResponse.json({ message: "Unsupported request format." }, { status: 415 });
  }

  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > 20_000) {
    return NextResponse.json({ message: "Request is too large." }, { status: 413 });
  }

  const ip = clientIp(request);

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 20_000) {
      return NextResponse.json({ message: "Request is too large." }, { status: 413 });
    }
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ message: "Invalid request body." }, { status: 400 });
  }

  const parsed = customRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({
      message: "Please correct the highlighted form fields and try again.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    }, { status: 400 });
  }

  if (parsed.data.website) {
    return NextResponse.json({ message: "Request accepted." });
  }

  const customer = await customerFromRequest(request);
  if (customer && parsed.data.email.trim().toLowerCase() !== customer.email) {
    return NextResponse.json({
      message: "Use the email address attached to your signed-in profile.",
      fieldErrors: { email: ["Use the email address attached to your signed-in profile."] },
    }, { status: 400 });
  }

  const risk = assessCustomRequestRisk(parsed.data);
  if (risk.block) {
    console.warn("High-confidence scam pattern blocked on custom request", { ip });
    return NextResponse.json({
      message: "For security, custom requests cannot include instructions to forward or refund money, buy gift cards, pay third parties, use cryptocurrency transfers, or share banking/security credentials.",
    }, { status: 400 });
  }

  if (process.env.NODE_ENV === "production" && isRateLimited(ip)) {
    return NextResponse.json({ message: "Too many requests. Please try again later." }, { status: 429 });
  }

  const human = await verifyTurnstile(parsed.data.turnstileToken, ip);
  if (!human) {
    return NextResponse.json({ message: "Bot verification failed. Please refresh and try again." }, { status: 403 });
  }

  const uploadRecords = parsed.data.attachments.length ? await validateCustomerUploadClaims(parsed.data.attachments) : [];
  if (parsed.data.attachments.length && !uploadRecords) {
    return NextResponse.json({ message: "One or more attachments expired or could not be verified. Please remove them and upload again." }, { status: 400 });
  }

  let stored;
  try {
    const submittedNeededBy = typeof (body as { neededBy?: unknown })?.neededBy === "string"
      ? (body as { neededBy: string }).neededBy.trim().slice(0, 24)
      : parsed.data.neededBy;
    stored = await createStoredRequest(parsed.data, {
      neededBySubmitted: submittedNeededBy,
      riskFlags: risk.review ? risk.reasons : [],
      customerAccountId: customer?.id || "",
      attachments: (uploadRecords || []).map((item) => ({ id: item.id, originalName: item.originalName, kind: item.kind, size: item.size, scanStatus: item.scanStatus })),
    });
    if (parsed.data.attachments.length) {
      const claimed = await claimCustomerUploads(parsed.data.attachments, stored.id);
      if (!claimed) console.error("Customer attachment claim failed after request storage", stored.requestCode);
    }
  } catch (error) {
    console.error("Custom request storage failed", error);
    return NextResponse.json({ message: "The request could not be saved. Please try again shortly." }, { status: 502 });
  }

  try {
    await sendEmail(parsed.data, risk);
  } catch (error) {
    // The request is already safely stored for the owner. Do not make the customer
    // resubmit and accidentally create a duplicate just because notification failed.
    console.error("Custom request notification failed; request remains stored", error);
  }

  return NextResponse.json({ message: "Request received.", requestCode: stored.requestCode }, { status: 201 });
}
