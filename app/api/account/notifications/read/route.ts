import { NextRequest, NextResponse } from "next/server";
import { customerFromRequest } from "@/lib/customer-auth";
import { markCustomerNotificationsRead } from "@/lib/customer-notifications";
import { sameOrigin } from "@/lib/owner-api";
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ message: "Request origin was not accepted." }, { status: 403 });
  const customer = await customerFromRequest(request);
  if (!customer) return NextResponse.json({ message: "Sign in required." }, { status: 401 });
  await markCustomerNotificationsRead(customer.id);
  return NextResponse.json({ message: "Notifications marked read." });
}
