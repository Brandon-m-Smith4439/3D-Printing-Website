import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { customerFromRequest } from "@/lib/customer-auth";
import { customerEmailInUse, findCustomerById, verifyCustomerPassword } from "@/lib/customer-store";
import { createVerificationToken } from "@/lib/customer-verification";
import { sendVerificationEmail } from "@/lib/account-email";
import { sameOrigin } from "@/lib/owner-api";
import { requestIpHash, writeAudit } from "@/lib/audit-log";

const schema = z.object({ newEmail: z.string().trim().toLowerCase().email().max(160), currentPassword: z.string().min(1).max(128) });
const attempts = new Map<string, number>();
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ message: "Request origin was not accepted." }, { status: 403 });
  const customer = await customerFromRequest(request);
  if (!customer) return NextResponse.json({ message: "Sign in required." }, { status: 401 });
  const account = await findCustomerById(customer.id);
  if (!account) return NextResponse.json({ message: "Account not found." }, { status: 404 });
  if (!account.emailVerifiedAt) return NextResponse.json({ message: "Verify your current email before changing it." }, { status: 403 });
  let body: unknown; try { body = await request.json(); } catch { return NextResponse.json({ message: "Invalid email-change request." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Enter a valid new email and your current password." }, { status: 400 });
  const last = attempts.get(account.id) || 0;
  if (Date.now() - last < 60_000) return NextResponse.json({ message: "Please wait a minute before requesting another email change." }, { status: 429 });
  if (!(await verifyCustomerPassword(account, parsed.data.currentPassword))) return NextResponse.json({ message: "Current password is incorrect." }, { status: 401 });
  if (parsed.data.newEmail === account.email) return NextResponse.json({ message: "That is already your account email." }, { status: 400 });
  if (await customerEmailInUse(parsed.data.newEmail, account.id)) return NextResponse.json({ message: "That email is already used by another account." }, { status: 409 });
  const { token } = await createVerificationToken(account.id, "change-email", parsed.data.newEmail);
  try {
    const delivery = await sendVerificationEmail({ email: parsed.data.newEmail, displayName: account.displayName, token, purpose: "change-email" });
    attempts.set(account.id, Date.now());
    await writeAudit({ actor:"customer", actorId:account.id, action:"email-change-requested", targetType:"account", targetId:account.id, summary:"Email change verification requested.", ipHash:requestIpHash(request) });
    return NextResponse.json({ message: delivery.sent ? "Verification sent to your new email. Your account email will not change until that link is opened." : "Development verification link created for the new email.", developmentUrl: delivery.developmentUrl || undefined });
  } catch (error) {
    console.error("Email-change verification failed", error);
    return NextResponse.json({ message: "Could not send the verification email." }, { status: 502 });
  }
}
