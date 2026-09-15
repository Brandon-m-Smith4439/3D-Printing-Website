import { NextRequest, NextResponse } from "next/server";
import { customerFromRequest } from "@/lib/customer-auth";
import { findCustomerById } from "@/lib/customer-store";
import { createVerificationToken } from "@/lib/customer-verification";
import { sendVerificationEmail } from "@/lib/account-email";
import { sameOrigin } from "@/lib/owner-api";

export const runtime = "nodejs";
const attempts = new Map<string, number>();

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ message: "Request origin was not accepted." }, { status: 403 });
  const customer = await customerFromRequest(request);
  if (!customer) return NextResponse.json({ message: "Sign in required." }, { status: 401 });
  if (customer.emailVerified) return NextResponse.json({ message: "Your email is already verified." });
  const last = attempts.get(customer.id) || 0;
  if (Date.now() - last < 60_000) return NextResponse.json({ message: "Please wait a minute before requesting another verification email." }, { status: 429 });
  const account = await findCustomerById(customer.id);
  if (!account) return NextResponse.json({ message: "Account not found." }, { status: 404 });
  const { token } = await createVerificationToken(account.id, "verify-email", account.email);
  try {
    const delivery = await sendVerificationEmail({ email: account.email, displayName: account.displayName, token, purpose: "verify-email" });
    attempts.set(customer.id, Date.now());
    return NextResponse.json({ message: delivery.sent ? "Verification email sent." : "Development verification link created.", developmentUrl: delivery.developmentUrl || undefined });
  } catch (error) {
    console.error("Verification email failed", error);
    return NextResponse.json({ message: "Verification email could not be sent right now." }, { status: 502 });
  }
}
