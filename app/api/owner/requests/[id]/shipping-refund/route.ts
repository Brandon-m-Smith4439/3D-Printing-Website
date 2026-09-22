import { NextRequest, NextResponse } from "next/server";
import { requestIsOwner } from "@/lib/owner-auth";
import { sameOrigin } from "@/lib/owner-api";
import { refundLabelForRequest } from "@/lib/shipping-service";
import { requestIpHash, writeAudit } from "@/lib/audit-log";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!requestIsOwner(request)) return NextResponse.json({ message: "Sign in required." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ message: "Request origin was not accepted." }, { status: 403 });
  const { id } = await context.params;
  try {
    const shipment = await refundLabelForRequest(id);
    await writeAudit({
      actor: "owner", actorId: "owner", action: "shipping-label-refund-requested", targetType: "request", targetId: id,
      summary: `Shipping label refund requested for ${shipment.requestCode}.`, ipHash: requestIpHash(request),
    });
    return NextResponse.json({ shipment, message: "Shipping label refund/void request submitted." });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Could not request the label refund." }, { status: 409 });
  }
}
