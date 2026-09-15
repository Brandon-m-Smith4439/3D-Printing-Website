import { NextRequest, NextResponse } from "next/server";
import { clearCustomerCookie } from "@/lib/customer-auth";
import { sameOrigin } from "@/lib/owner-api";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ message: "Request origin was not accepted." }, { status: 403 });
  const response = NextResponse.json({ message: "Signed out." });
  clearCustomerCookie(response);
  return response;
}
