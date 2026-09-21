import { NextRequest, NextResponse } from "next/server";
import { requestIsOwner } from "@/lib/owner-auth";
import { stripeConfigurationSummary } from "@/lib/stripe-checkout";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!requestIsOwner(request)) return NextResponse.json({ message: "Owner authentication required." }, { status: 401 });
  return NextResponse.json({ stripe: stripeConfigurationSummary() }, { headers: { "Cache-Control": "no-store" } });
}
