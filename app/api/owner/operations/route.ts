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
import { readCostSnapshots } from "@/lib/quote-cost-store";
import { buildOwnerProfitabilityOperations } from "@/lib/owner-profitability-operations";
import { getSiteContent } from "@/lib/site-content-store";
import { ownerSecurityStatus } from "@/lib/owner-security";
import { buildLaunchReadiness } from "@/lib/launch-readiness";
import { CUSTOMER_POLICY_VERSION } from "@/lib/customer-policies";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!await requestIsOwner(request)) {
    return NextResponse.json({ message: "Sign in required." }, { status: 401 });
  }

  const [requests, quotes, queue, invoices, shipments, audit, backups, shipping, followUpSettings, followUpRecords, followUpPreview, costSnapshots, content, security] = await Promise.all([
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
    readCostSnapshots(),
    getSiteContent(),
    ownerSecurityStatus(),
  ]);

  const now = new Date();
  const profitability = buildOwnerProfitabilityOperations({ requests, quotes, snapshots: costSnapshots, now });

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
    profitability: profitability.report,
    profitabilityAttention: profitability.attention,
  }, now);

  const launchReadiness = buildLaunchReadiness({
    stripe: stripeConfigurationSummary(),
    shipping,
    shippingOrigin: content.shippingOrigin,
    pickup: content.pickup,
    backups,
    security,
    followUps: snapshot.followUps,
    policyVersion: CUSTOMER_POLICY_VERSION,
    now,
  });

  return NextResponse.json({ snapshot: { ...snapshot, launchReadiness } }, { headers: { "Cache-Control": "no-store" } });
}
