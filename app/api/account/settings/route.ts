import { NextRequest, NextResponse } from "next/server";
import { customerFromRequest } from "@/lib/customer-auth";
import { findCustomerById } from "@/lib/customer-store";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const customer = await customerFromRequest(request);
  if (!customer) return NextResponse.json({ message: "Sign in required." }, { status: 401 });
  const account = await findCustomerById(customer.id);
  if (!account) return NextResponse.json({ message: "Account not found." }, { status: 404 });
  return NextResponse.json({ account: { id: account.id, displayName: account.displayName, email: account.email, emailVerified: Boolean(account.emailVerifiedAt), emailVerifiedAt: account.emailVerifiedAt, preferences: account.preferences, createdAt: account.createdAt } }, { headers: { "Cache-Control": "no-store" } });
}
