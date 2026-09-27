import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createCustomerSession, customerFromRequest, setCustomerCookie } from "@/lib/customer-auth";
import { findCustomerById, setCustomerEmailTwoFactor, verifyCustomerPassword } from "@/lib/customer-store";
import { sameOrigin } from "@/lib/owner-api";
import { requestIpHash, writeAudit } from "@/lib/audit-log";

const schema = z.object({
  enabled: z.boolean(),
  currentPassword: z.string().min(1).max(128),
});

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ message: "Request origin was not accepted." }, { status: 403 });
  const customer = await customerFromRequest(request);
  if (!customer) return NextResponse.json({ message: "Sign in required." }, { status: 401 });
  const account = await findCustomerById(customer.id);
  if (!account) return NextResponse.json({ message: "Account not found." }, { status: 404 });
  if (!account.emailVerifiedAt) return NextResponse.json({ message: "Verify your email before changing two-factor authentication." }, { status: 403 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Invalid security request." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Enter your current password to change two-factor authentication." }, { status: 400 });
  if (!(await verifyCustomerPassword(account, parsed.data.currentPassword))) return NextResponse.json({ message: "Current password is incorrect." }, { status: 401 });

  const updated = await setCustomerEmailTwoFactor(account.id, parsed.data.enabled);
  if (!updated) return NextResponse.json({ message: "Could not update two-factor authentication." }, { status: 500 });
  await writeAudit({
    actor: "customer", actorId: account.id, action: parsed.data.enabled ? "customer-2fa-enabled" : "customer-2fa-disabled",
    targetType: "account", targetId: account.id,
    summary: `Customer email two-factor authentication ${parsed.data.enabled ? "enabled" : "disabled"}; previous sessions revoked.`,
    ipHash: requestIpHash(request),
  });

  const response = NextResponse.json({ message: parsed.data.enabled ? "Email two-factor authentication enabled. Future sign-ins will require a 6-digit code sent to your verified email." : "Email two-factor authentication disabled.", enabled: parsed.data.enabled });
  setCustomerCookie(response, createCustomerSession(updated.id, updated.sessionVersion));
  return response;
}
