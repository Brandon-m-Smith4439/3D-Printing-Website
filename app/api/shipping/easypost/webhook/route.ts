import { NextRequest, NextResponse } from "next/server";
import { easyPostTrackerFromWebhook, verifyEasyPostWebhook } from "@/lib/easypost";
import { applyEasyPostTrackerEvent } from "@/lib/shipping-service";
import { writeAudit } from "@/lib/audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (rawBody.length > 1_000_000) return NextResponse.json({ message: "Webhook payload too large." }, { status: 413 });
  if (!verifyEasyPostWebhook(rawBody, request.method, request.headers)) return NextResponse.json({ message: "Invalid webhook signature." }, { status: 400 });
  let event: { id?: string; description?: string; result?: unknown };
  try { event = JSON.parse(rawBody) as { id?: string; description?: string; result?: unknown }; }
  catch { return NextResponse.json({ message: "Invalid webhook payload." }, { status: 400 }); }
  if (event.description !== "tracker.updated") return NextResponse.json({ received: true, ignored: true });
  const tracker = easyPostTrackerFromWebhook(event.result);
  if (!tracker) return NextResponse.json({ received: true, ignored: true });
  const shipment = await applyEasyPostTrackerEvent(event.id || "", tracker);
  if (shipment) {
    await writeAudit({
      actor: "system", actorId: "easypost", action: "shipment-tracking-updated", targetType: "request", targetId: shipment.requestId,
      summary: `${shipment.requestCode} tracking updated to ${shipment.status}.`, ipHash: "",
    });
  }
  return NextResponse.json({ received: true });
}
