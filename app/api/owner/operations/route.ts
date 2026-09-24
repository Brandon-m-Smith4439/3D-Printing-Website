import { NextRequest, NextResponse } from "next/server";
import { requestIsOwner } from "@/lib/owner-auth";
import { readRequests } from "@/lib/request-store";
import { readQuotes } from "@/lib/quote-store";
import { readQueue } from "@/lib/queue-store";
import { readFinalInvoices } from "@/lib/final-invoice-store";
import { readShipments } from "@/lib/shipment-store";
import { readAudit } from "@/lib/audit-log";
import { listBackups } from "@/lib/backups";
import { stripeConfigurationSummary } from "@/lib/stripe-checkout";
import { easyPostConfigurationSummary } from "@/lib/easypost";
import { buildOwnerOperationsSnapshot } from "@/lib/owner-operations";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!requestIsOwner(request)) {
    return NextResponse.json({ message: "Sign in required." }, { status: 401 });
  }

  const [requests, quotes, queue, invoices, shipments, audit, backups, shipping] = await Promise.all([
    readRequests(),
    readQuotes(),
    readQueue(),
    readFinalInvoices(),
    readShipments(),
    readAudit(300),
    listBackups(),
    easyPostConfigurationSummary(),
  ]);

  const snapshot = buildOwnerOperationsSnapshot({
    requests,
    quotes,
    queue,
    invoices,
    shipments,
    audit,
    backups,
    stripe: stripeConfigurationSummary(),
    shipping,
  });

  return NextResponse.json({ snapshot }, { headers: { "Cache-Control": "no-store" } });
}
