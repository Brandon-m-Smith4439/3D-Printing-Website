import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requestIsOwner } from "@/lib/owner-auth";
import { sameOrigin } from "@/lib/owner-api";
import { buyLabelForRequest } from "@/lib/shipping-service";
import { requestIpHash, writeAudit } from "@/lib/audit-log";

export const runtime = "nodejs";
const schema = z.object({ force: z.boolean().optional().default(false) }).strict();

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!await requestIsOwner(request)) return NextResponse.json({ message: "Sign in required." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ message: "Request origin was not accepted." }, { status: 403 });
  const { id } = await context.params;
  let body: unknown = {};
  try {
    const raw = await request.text();
    if (raw.length > 2_000) return NextResponse.json({ message: "Shipping request is too large." }, { status: 413 });
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return NextResponse.json({ message: "Invalid request body." }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Invalid shipping-label request." }, { status: 400 });
  try {
    const result = await buyLabelForRequest(id, { force: parsed.data.force });
    await writeAudit({
      actor: "owner", actorId: "owner", action: result.purchased ? "shipping-label-purchased" : result.requiresConfirmation ? "shipping-label-review" : "shipping-label-existing",
      targetType: "request", targetId: id, summary: result.purchased ? `Shipping label purchased for ${result.shipment.requestCode}.` : result.shipment.reviewReason || `Shipping label already exists for ${result.shipment.requestCode}.`,
      ipHash: requestIpHash(request),
    });
    return NextResponse.json({
      shipment: result.shipment, purchased: result.purchased, requiresConfirmation: result.requiresConfirmation,
      message: result.requiresConfirmation ? result.shipment.reviewReason : result.purchased ? "Shipping label purchased and tracking created." : "This order already has a shipping label.",
    });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Could not purchase shipping label." }, { status: 409 });
  }
}
