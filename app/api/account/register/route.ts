import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createCustomerSession, setCustomerCookie } from "@/lib/customer-auth";
import { createCustomerAccount } from "@/lib/customer-store";
import { createVerificationToken } from "@/lib/customer-verification";
import { sendVerificationEmail } from "@/lib/account-email";
import { sameOrigin } from "@/lib/owner-api";
import { requestIpHash, writeAudit } from "@/lib/audit-log";

export const runtime = "nodejs";

const schema = z.object({
  displayName: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().max(160),
  password: z.string().min(10).max(128),
});

const attempts = new Map<string, { count: number; resetAt: number }>();
function ipOf(request: NextRequest) { return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown"; }
function blocked(ip: string) {
  const now = Date.now(); const current = attempts.get(ip);
  if (!current || current.resetAt <= now) { attempts.set(ip, { count: 1, resetAt: now + 15 * 60_000 }); return false; }
  current.count += 1; return current.count > 6;
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ message: "Request origin was not accepted." }, { status: 403 });
  const contentType = request.headers.get("content-type") || "";
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (!contentType.includes("application/json")) return NextResponse.json({ message: "Unsupported request format." }, { status: 415 });
  if (contentLength > 4_000) return NextResponse.json({ message: "Account request is too large." }, { status: 413 });
  const ip = ipOf(request); if (blocked(ip)) return NextResponse.json({ message: "Too many account attempts. Try again later." }, { status: 429 });
  let body: unknown; try { const raw = await request.text(); if (raw.length > 4_000) return NextResponse.json({ message: "Account request is too large." }, { status: 413 }); body = JSON.parse(raw); } catch { return NextResponse.json({ message: "Invalid request body." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Enter a valid name, email, and a password of at least 10 characters." }, { status: 400 });
  const result = await createCustomerAccount(parsed.data.displayName, parsed.data.email, parsed.data.password);
  if (result.exists || !result.account) return NextResponse.json({ message: "An account with that email already exists." }, { status: 409 });
  attempts.delete(ip);

  let verificationMessage = "Account created. Verify your email from Account Settings.";
  try {
    const { token } = await createVerificationToken(result.account.id, "verify-email", result.account.email);
    const delivery = await sendVerificationEmail({ email: result.account.email, displayName: result.account.displayName, token, purpose: "verify-email" });
    verificationMessage = delivery.sent ? "Account created. Check your email to verify the account." : "Account created. A local verification link was written to the development console.";
  } catch (error) {
    console.error("Initial verification email failed", error);
  }

  await writeAudit({actor:"customer",actorId:result.account.id,action:"account-created",targetType:"customer",targetId:result.account.id,summary:"Customer account created.",ipHash:requestIpHash(request)});
  const response = NextResponse.json({ customer: { id: result.account.id, email: result.account.email, displayName: result.account.displayName }, verificationMessage }, { status: 201 });
  setCustomerCookie(response, createCustomerSession(result.account.id, result.account.sessionVersion));
  return response;
}
