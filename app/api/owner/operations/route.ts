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
import { getFollowUpSettings, readFollowUps } from "@/lib/customer-follow-up-store";
import { previewCustomerFollowUps } from "@/lib/customer-follow-up-engine";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!await requestIsOwner(request)) {
    return NextResponse.json({ message: "Sign in required." }, { status: 401 });
  }

  const [requests, quotes, queue, invoices, shipments, audit, backups, shipping, followUpSettings, followUpRecords, followUpPreview] = await Promise.all([
    readRequests(),
    readQuotes(),
    readQueue(),
    readFinalInvoices(),
    readShipments(),
    readAudit(300),
    listBackups(),
    easyPostConfigurationSummary(),
    getFollowUpSettings(),
    readFollowUps(),
    previewCustomerFollowUps(),
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
    followUps: {
      deploymentEnabled: followUpPreview.deploymentEnabled,
      ownerEnabled: followUpSettings.enabled,
      due: followUpPreview.counts.due,
      deferred: followUpPreview.blocked.filter((item) => /24 hours|higher-priority/i.test(item.blockedReason)).length,
      sentLast7Days: followUpRecords.filter((item) => item.status === "sent" && Date.parse(item.sentAt) >= Date.now() - 7 * 86_400_000).length,
      failed: followUpRecords.filter((item) => item.status === "failed").length,
      failedRequests: followUpRecords.filter((item) => item.status === "failed" && !item.nextAttemptAt).slice(-10).map((item) => ({ requestId: item.requestId, requestCode: item.requestCode, createdAt: item.updatedAt, reason: item.reason })),
    },
  });

  return NextResponse.json({ snapshot }, { headers: { "Cache-Control": "no-store" } });
}
