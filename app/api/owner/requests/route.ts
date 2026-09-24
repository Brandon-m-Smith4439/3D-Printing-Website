import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requestIsOwner } from "@/lib/owner-auth";
import { createOwnerStoredRequest, readRequests } from "@/lib/request-store";
import { readQuotes } from "@/lib/quote-store";
import { readShipments } from "@/lib/shipment-store";
import { readFinalInvoices } from "@/lib/final-invoice-store";
import { ensureDailyBackup } from "@/lib/backups";
import { sameOrigin } from "@/lib/owner-api";
import { requestIpHash, writeAudit } from "@/lib/audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!await requestIsOwner(request)) return NextResponse.json({ message: "Sign in required." }, { status: 401 });
  void ensureDailyBackup().catch((error) => console.error("Daily backup failed", error));
  const [requests, quotes, shipments, finalInvoices] = await Promise.all([readRequests(), readQuotes(), readShipments(), readFinalInvoices()]);
  requests.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return NextResponse.json({ requests, quotes, shipments, finalInvoices }, { headers: { "Cache-Control": "no-store" } });
}


const ownerRequestSchema = z.object({
  name: z.string().trim().max(80).optional().default(""),
  email: z.union([z.literal(""), z.string().trim().toLowerCase().email().max(160)]).optional().default(""),
  phone: z.string().trim().max(30).optional().default(""),
  projectType: z.enum(["display","functional","replacement","prototype","other"]).optional().default("other"),
  modelStatus: z.enum(["ready","needs-adjustment","reference-only","idea-only"]).optional().default("idea-only"),
  fulfillmentMethod: z.enum(["pickup","shipping","local-delivery","unsure"]).optional().default("unsure"),
  assemblyPreference: z.enum(["assembled","disassembled","unsure"]).optional().default("unsure"),
  quantity: z.coerce.number().int().min(1).max(500).optional().default(1),
  dimensions: z.string().trim().max(120).optional().default(""),
  materialPreference: z.enum(["no-preference","pla","petg","asa","tpu","resin","other"]).optional().default("no-preference"),
  colorPreference: z.string().trim().max(120).optional().default(""),
  budget: z.string().trim().max(80).optional().default(""),
  neededBy: z.string().trim().max(24).optional().default(""),
  description: z.string().trim().max(2500).optional().default(""),
  internalNote: z.string().trim().max(2000).optional().default(""),
});

export async function POST(request: NextRequest) {
  if (!await requestIsOwner(request)) return NextResponse.json({ message: "Sign in required." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ message: "Request origin was not accepted." }, { status: 403 });

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 20_000) return NextResponse.json({ message: "In-person request is too large." }, { status: 413 });
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ message: "Invalid request body." }, { status: 400 });
  }

  const parsed = ownerRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Please check the in-person request fields.", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 400 });

  const stored = await createOwnerStoredRequest(parsed.data);
  await writeAudit({
    actor: "owner",
    actorId: "owner",
    action: "in-person-request-created",
    targetType: "request",
    targetId: stored.id,
    summary: `${stored.requestCode} created by owner for an in-person/offline request.`,
    ipHash: requestIpHash(request),
  });
  return NextResponse.json({ request: stored, message: `${stored.requestCode} added to the request board.` }, { status: 201 });
}
