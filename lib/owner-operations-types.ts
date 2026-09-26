import type { AuditEntry } from "@/lib/audit-log";
import type { FinalInvoiceRecord } from "@/lib/final-invoice-types";
import type { QueueJob } from "@/lib/queue-types";
import type { StoredQuote } from "@/lib/quote-types";
import type { StoredRequest } from "@/lib/request-types";
import type { ShipmentRecord } from "@/lib/shipment-types";
import type { ProfitabilityReport } from "@/lib/profitability-report";
import type { ProfitabilityAttentionItem } from "@/lib/owner-profitability-attention";
import type { LaunchReadinessReport } from "@/lib/launch-readiness";

export type OwnerAttentionSeverity = "urgent" | "action" | "watch";
export type OwnerAttentionCategory =
  | "request"
  | "quote"
  | "deposit"
  | "production"
  | "invoice"
  | "shipping"
  | "backup"
  | "integration"
  | "follow-up"
  | "profitability";

export type OwnerAttentionItem = {
  id: string;
  severity: OwnerAttentionSeverity;
  category: OwnerAttentionCategory;
  title: string;
  detail: string;
  requestId: string;
  requestCode: string;
  createdAt: string;
  ageHours: number;
};

export type OwnerSearchRecord = {
  id: string;
  requestId: string;
  requestCode: string;
  customerName: string;
  email: string;
  phone: string;
  queueCode: string;
  queueTitle: string;
  invoiceNumber: string;
  trackingCode: string;
  haystack: string;
};

export type OwnerIntegrationHealthItem = {
  tone: "good" | "warning" | "error";
  label: string;
  detail: string;
};

export type OwnerIntegrationHealth = {
  stripe: OwnerIntegrationHealthItem;
  easyPost: OwnerIntegrationHealthItem;
  backups: OwnerIntegrationHealthItem & { latestAt: string };
  recentFailures: OwnerIntegrationHealthItem;
};

export type OwnerOperationsSnapshot = {
  generatedAt: string;
  counts: {
    urgent: number;
    action: number;
    watch: number;
    newRequests: number;
    activeProduction: number;
    finalBalancesDue: number;
    followUpsDue: number;
    completed: number;
  };
  attention: OwnerAttentionItem[];
  search: OwnerSearchRecord[];
  integrations: OwnerIntegrationHealth;
  followUps: OwnerFollowUpSummary;
  profitability: ProfitabilityReport;
  launchReadiness?: LaunchReadinessReport;
};

export type OwnerBackupInfo = {
  name: string;
  createdAt: string;
  databaseBytes: number;
  includesPrivateFiles: boolean;
};

export type OwnerStripeSummary = {
  keyConfigured: boolean;
  webhookConfigured: boolean;
  mode: "test" | "live" | "unconfigured";
  siteOrigin: string;
  secureOrigin: boolean;
  checkoutReady: boolean;
  productionReady: boolean;
};

export type OwnerShippingSummary = {
  configured: boolean;
  credentialMode: "unconfigured" | "test" | "production";
  mode: "unconfigured" | "test" | "production-locked" | "production";
  liveEnabled: boolean;
  businessCallsAllowed: boolean;
  readiness: "unconfigured" | "test-incomplete" | "test-ready" | "production-locked" | "production-incomplete" | "production-ready";
  fromAddressConfigured: boolean;
  webhookSecretConfigured: boolean;
  autoBuyLabels: boolean;
};

export type OwnerFollowUpSummary = {
  deploymentEnabled: boolean;
  ownerEnabled: boolean;
  due: number;
  deferred: number;
  sentLast7Days: number;
  failed: number;
  failedRequests: Array<{ requestId: string; requestCode: string; createdAt: string; reason: string }>;
};

export type OwnerOperationsInput = {
  requests: StoredRequest[];
  quotes: StoredQuote[];
  queue: QueueJob[];
  invoices: FinalInvoiceRecord[];
  shipments: ShipmentRecord[];
  audit: AuditEntry[];
  backups: OwnerBackupInfo[];
  stripe: OwnerStripeSummary;
  shipping: OwnerShippingSummary;
  followUps: OwnerFollowUpSummary;
  profitability: ProfitabilityReport;
  profitabilityAttention: ProfitabilityAttentionItem[];
};
