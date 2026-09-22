import { NextRequest, NextResponse } from "next/server";
import { requestIsOwner } from "@/lib/owner-auth";
import { readRequests } from "@/lib/request-store";
import { readQuotes } from "@/lib/quote-store";
import { readShipments } from "@/lib/shipment-store";
import { ensureDailyBackup } from "@/lib/backups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!requestIsOwner(request)) return NextResponse.json({ message: "Sign in required." }, { status: 401 });
  void ensureDailyBackup().catch((error) => console.error("Daily backup failed", error));
  const [requests, quotes, shipments] = await Promise.all([readRequests(), readQuotes(), readShipments()]);
  requests.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return NextResponse.json({ requests, quotes, shipments }, { headers: { "Cache-Control": "no-store" } });
}
