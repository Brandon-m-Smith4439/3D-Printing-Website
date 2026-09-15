import "server-only";
import { getSiteContent } from "@/lib/site-content-store";
import type { VerificationPurpose } from "@/lib/customer-verification";

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function siteOrigin() {
  const configured = (process.env.NEXT_PUBLIC_SITE_URL || "").trim();
  if (configured) return configured.replace(/\/$/, "");
  return "http://localhost:3000";
}

export async function sendVerificationEmail(input: { email: string; displayName: string; token: string; purpose: VerificationPurpose }) {
  const site = await getSiteContent();
  const url = `${siteOrigin()}/verify-email?token=${encodeURIComponent(input.token)}`;
  const apiKey = process.env.RESEND_API_KEY || "";
  const from = process.env.REQUEST_FROM_EMAIL || "";
  const configured = Boolean(apiKey && !apiKey.startsWith("YOUR_") && from && !from.includes("yourdomain.com"));
  const changing = input.purpose === "change-email";
  const subject = changing ? `Verify your new email for ${site.name}` : `Verify your email for ${site.name}`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#172033;line-height:1.6"><p style="font-size:13px;font-weight:700;letter-spacing:.08em;color:#4b78a8">${escapeHtml(site.name.toUpperCase())}</p><h1 style="font-size:26px">${changing ? "Verify your new email." : "Verify your email."}</h1><p>Hi ${escapeHtml(input.displayName)},</p><p>${changing ? "Confirm this address before it replaces the email on your customer profile." : "Confirm your email to unlock account settings and security-sensitive changes."}</p><p><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 18px;border-radius:9px;background:#267ed7;color:white;text-decoration:none;font-weight:700">Verify email</a></p><p style="font-size:13px;color:#687789">This link expires in 1 hour. If you did not request it, you can ignore this email.</p></div>`;

  if (!configured) {
    if (process.env.NODE_ENV === "production") throw new Error("Verification email delivery is not configured.");
    console.info(`Verification email (development) -> ${input.email}: ${url}`);
    return { sent: false, developmentUrl: url };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [input.email], subject, html }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Email provider rejected the verification email.");
  return { sent: true, developmentUrl: "" };
}

export async function sendPasswordResetEmail(input: { email: string; displayName: string; token: string }) {
  const site = await getSiteContent();
  const url = `${siteOrigin()}/reset-password?token=${encodeURIComponent(input.token)}`;
  const apiKey = process.env.RESEND_API_KEY || "";
  const from = process.env.REQUEST_FROM_EMAIL || "";
  const configured = Boolean(apiKey && !apiKey.startsWith("YOUR_") && from && !from.includes("yourdomain.com"));
  const subject = `Reset your ${site.name} password`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#172033;line-height:1.6"><p style="font-size:13px;font-weight:700;letter-spacing:.08em;color:#4b78a8">${escapeHtml(site.name.toUpperCase())}</p><h1 style="font-size:26px">Reset your password.</h1><p>Hi ${escapeHtml(input.displayName)},</p><p>Use the secure link below to choose a new password.</p><p><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 18px;border-radius:9px;background:#267ed7;color:white;text-decoration:none;font-weight:700">Reset password</a></p><p style="font-size:13px;color:#687789">This link expires in 30 minutes and can only be used once. If you did not request a reset, you can ignore this email.</p></div>`;

  if (!configured) {
    if (process.env.NODE_ENV === "production") throw new Error("Password reset email delivery is not configured.");
    console.info(`Password reset email (development) -> ${input.email}: ${url}`);
    return { sent: false, developmentUrl: url };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [input.email], subject, html }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Email provider rejected the password reset email.");
  return { sent: true, developmentUrl: "" };
}
