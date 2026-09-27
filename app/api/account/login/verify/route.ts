import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createCustomerSession, setCustomerCookie } from "@/lib/customer-auth";
import { consumeCustomerLoginChallenge } from "@/lib/customer-2fa";
import { findCustomerById } from "@/lib/customer-store";
import { claimGuestRequestsByEmail } from "@/lib/request-store";
import { sameOrigin } from "@/lib/owner-api";
import { requestIpHash, writeAudit } from "@/lib/audit-log";

const schema = z.object({
  challengeId: z.string().uuid(),
  code: z.string().trim().regex(/^\d{6}$/),
});
const attempts = new Map<string, { count: number; resetAt: number }>();

function tooMany(id: string) {
  const now = Date.now();
  const current = attempts.get(id);
  if (!current || current.resetAt <= now) {
    attempts.set(id, { count: 1, resetAt: now + 15 * 60_000 });
    return false;
  }
  current.count += 1;
  return current.count > 6;
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ message: "Request origin was not accepted." }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Invalid two-factor request." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Enter the 6-digit code from your email." }, { status: 400 });
  if (tooMany(parsed.data.challengeId)) return NextResponse.json({ message: "Too many code attempts. Sign in again to request a new code." }, { status: 429 });

  const result = await consumeCustomerLoginChallenge(parsed.data.challengeId, parsed.data.code);
  if (!result.customerId) return NextResponse.json({ message: result.reason === "expired" ? "That code expired. Sign in again to request a new one." : "That code is not valid." }, { status: 401 });
  attempts.delete(parsed.data.challengeId);

  const account = await findCustomerById(result.customerId);
  if (!account || !account.emailTwoFactorEnabled) return NextResponse.json({ message: "Account security settings changed. Sign in again." }, { status: 409 });
  const claimed = account.emailVerifiedAt ? await claimGuestRequestsByEmail(account.id, account.email) : 0;
  await writeAudit({
    actor: "customer", actorId: account.id, action: "login-2fa-verified", targetType: "customer", targetId: account.id,
    summary: `Customer signed in with email two-factor authentication${claimed ? `; ${claimed} matching guest request(s) linked` : ""}.`,
    ipHash: requestIpHash(request),
  });
  const response = NextResponse.json({ customer: { id: account.id, email: account.email, displayName: account.displayName } });
  setCustomerCookie(response, createCustomerSession(account.id, account.sessionVersion));
  return response;
}
