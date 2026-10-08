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
import { readCollection } from "@/lib/database";
import type { CustomerAccount } from "@/lib/customer-types";
import { findCustomerByEmail } from "@/lib/customer-store";
import { notifyCustomer } from "@/lib/customer-notifications";
import { effectiveFollowUpEmailAllowed } from "@/lib/customer-follow-up-policy";
import { readFollowUpControls, readFollowUps } from "@/lib/customer-follow-up-store";
import { ensureBambuCatalogSeeded, readBambuCatalog, readPricingSettings } from "@/lib/pricing-store";
import { readCostSnapshots } from "@/lib/quote-cost-store";
import { readPricingPresets } from "@/lib/pricing-preset-store";
import { readFilamentPurchaseLots } from "@/lib/bambu-purchase-store";
import { resolveMaterialCost } from "@/lib/material-cost-resolver";
import { readPickupAppointments } from "@/lib/pickup-store";
import { readHistoricalProfitRecords, saveHistoricalProfitRecord } from "@/lib/historical-profit-store";
import { ownerTrackingStatuses, ownerTrackingStatusLabels } from "@/lib/owner-tracking-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!await requestIsOwner(request)) return NextResponse.json({ message: "Sign in required." }, { status: 401 });
  void ensureDailyBackup().catch((error) => console.error("Daily backup failed", error));
  await ensureBambuCatalogSeeded();
  const [requests, quotes, shipments, finalInvoices, pickups, accounts, controls, followUpRecords, pricingSettings, pricingCatalog, costSnapshots, pricingPresets, purchaseLots, historicalProfits] = await Promise.all([readRequests(), readQuotes(), readShipments(), readFinalInvoices(), readPickupAppointments(), readCollection<CustomerAccount>("customers"), readFollowUpControls(), readFollowUps(), readPricingSettings(), readBambuCatalog(), readCostSnapshots(), readPricingPresets(), readFilamentPurchaseLots(), readHistoricalProfitRecords()]);
  requests.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const accountById = new Map(accounts.map((item) => [item.id, item]));
  const controlByRequest = new Map(controls.map((item) => [item.requestId, item]));
  const followUps = Object.fromEntries(requests.map((item) => {
    const control = controlByRequest.get(item.id) || { id:item.id, requestId:item.id, paused:false, waitingOnCustomer:false, waitingSince:"", waitingNote:"", updatedAt:"" };
    const account = item.customerAccountId ? accountById.get(item.customerAccountId) || null : null;
    const eligibility = effectiveFollowUpEmailAllowed(item, account, control);
    return [item.id, {
      control,
      emailEligible: eligibility.allowed,
      emailReason: eligibility.reason,
      emailVerified: Boolean(account?.emailVerifiedAt),
      effectiveEmailEnabled: item.customerAccountId
        ? Boolean(account && (item.emailNotifications ?? account.preferences?.emailStatusUpdates ?? false))
        : Boolean(item.email && item.emailNotifications),
      recent: followUpRecords.filter((record) => record.requestId === item.id).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0,5).map((record) => ({
        id:record.id,requestId:record.requestId,requestCode:record.requestCode,customerAccountId:record.customerAccountId,type:record.type,stage:record.stage,anchorId:record.anchorId,anchorRevision:record.anchorRevision,dueAt:record.dueAt,status:record.status,subject:record.subject,text:record.text,idempotencyKey:record.idempotencyKey,attemptCount:record.attemptCount,lastAttemptAt:record.lastAttemptAt,nextAttemptAt:record.nextAttemptAt,sentAt:record.sentAt,reason:record.reason,createdAt:record.createdAt,updatedAt:record.updatedAt
      })),
    }];
  }));
  const costing=Object.fromEntries(requests.map((item)=>[item.id,costSnapshots.filter((snapshot)=>snapshot.requestId===item.id).sort((a,b)=>b.quoteRevision-a.quoteRevision||b.updatedAt.localeCompare(a.updatedAt))]));
  const materialCosts=Object.fromEntries(pricingCatalog.map((item)=>[item.id,resolveMaterialCost(item,purchaseLots)]));
  return NextResponse.json({ requests, quotes, shipments, finalInvoices, pickups, followUps, historicalProfits, pricing:{settings:pricingSettings,catalog:pricingCatalog,materialCosts,costing,presets:pricingPresets} }, { headers: { "Cache-Control": "no-store" } });
}


const ownerRequestSchema = z.object({
  name: z.string().trim().max(80).optional().default(""),
  email: z.union([z.literal(""), z.string().trim().toLowerCase().email().max(160)]).optional().default(""),
  phone: z.string().trim().max(30).optional().default(""),
  projectType: z.enum(["display","functional","replacement","prototype","other"]).optional().default("other"),
  modelStatus: z.enum(["ready","needs-adjustment","reference-only","idea-only"]).optional().default("idea-only"),
  fulfillmentMethod: z.enum(["pickup","shipping","unsure"]).optional().default("unsure"),
  paymentPreference: z.enum(["stripe","cash","zelle","cash-app","apple-cash","venmo","paypal"]).optional().default("stripe"),
  assemblyPreference: z.enum(["assembled","disassembled","unsure"]).optional().default("unsure"),
  quantity: z.coerce.number().int().min(1).max(500).optional().default(1),
  dimensions: z.string().trim().max(120).optional().default(""),
  materialPreference: z.enum(["no-preference","pla","petg","asa","tpu","resin","other"]).optional().default("no-preference"),
  colorPreference: z.string().trim().max(120).optional().default(""),
  budget: z.string().trim().max(80).optional().default(""),
  neededBy: z.string().trim().max(24).optional().default(""),
  description: z.string().trim().max(2500).optional().default(""),
  internalNote: z.string().trim().max(2000).optional().default(""),
  status: z.enum(["new","reviewing"]).optional().default("new"),
  ownerTrackingStatus: z.enum(ownerTrackingStatuses).optional(),
  historicalCompleted: z.boolean().optional().default(false),
  completedAt: z.string().trim().max(10).refine((value)=>value===""||/^\d{4}-\d{2}-\d{2}$/.test(value),"Use a valid completion date.").optional().default(""),
  historicalRevenueCents: z.coerce.number().int().min(0).max(100_000_000).optional().default(0),
  historicalDirectCostCents: z.coerce.number().int().min(0).max(100_000_000).optional().default(0),
}).superRefine((value,ctx)=>{if(value.paymentPreference!=="stripe"&&value.fulfillmentMethod!=="pickup")ctx.addIssue({code:"custom",path:["paymentPreference"],message:"Local / manual payment is pickup-only."});if(value.historicalCompleted&&!value.completedAt)ctx.addIssue({code:"custom",path:["completedAt"],message:"Enter the date this historical request was completed."});if(value.historicalCompleted&&value.completedAt&&Date.parse(`${value.completedAt}T00:00:00.000Z`)>Date.now())ctx.addIssue({code:"custom",path:["completedAt"],message:"Historical completion date cannot be in the future."});});

export async function POST(request: NextRequest) {
  if (!await requestIsOwner(request)) return NextResponse.json({ message: "Sign in required." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ message: "Request origin was not accepted." }, { status: 403 });

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 20_000) return NextResponse.json({ message: "Owner custom request is too large." }, { status: 413 });
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ message: "Invalid request body." }, { status: 400 });
  }

  const parsed = ownerRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Please check the Owner Custom Request fields.", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 400 });

  const matchingAccount = parsed.data.email ? await findCustomerByEmail(parsed.data.email) : null;
  const historicalCompleted = parsed.data.historicalCompleted;
  const ownerTrackingStatus = historicalCompleted ? "completed" : (parsed.data.ownerTrackingStatus || parsed.data.status);
  const storedStatus = historicalCompleted || ownerTrackingStatus === "completed"
    ? "completed"
    : ownerTrackingStatus === "declined"
      ? "declined"
      : ownerTrackingStatus === "new"
        ? "new"
        : "reviewing";
  const occurredAt = historicalCompleted ? new Date(`${parsed.data.completedAt}T12:00:00.000Z`).toISOString() : undefined;
  const stored = await createOwnerStoredRequest({
    ...parsed.data,
    customerAccountId: matchingAccount?.emailVerifiedAt ? matchingAccount.id : "",
    status: storedStatus,
    ownerTrackingStatus,
    occurredAt,
  });
  if (historicalCompleted) {
    await saveHistoricalProfitRecord({
      requestId: stored.id,
      requestCode: stored.requestCode,
      completedAt: occurredAt || stored.updatedAt,
      revenueCents: parsed.data.historicalRevenueCents,
      directCostCents: parsed.data.historicalDirectCostCents,
      note: parsed.data.internalNote || "Historical custom request logged by owner.",
    });
  }
  if (stored.email && !historicalCompleted) {
    await notifyCustomer(
      stored,
      `Mesh Harbor 3D created a custom request for you. Its current tracking stage is ${ownerTrackingStatusLabels[ownerTrackingStatus]}. Use the secure request link in this email to follow updates. If you already have a verified account with this email, the request is linked to your profile; otherwise it will link automatically after you create and verify an account with the same email.`,
      { subject: `${stored.requestCode} created by Mesh Harbor 3D`, forceEmail: true, notificationId: `owner-request-created:${stored.id}` },
    ).catch((error) => console.error("Owner-created request notification failed", error));
  }
  await writeAudit({
    actor: "owner",
    actorId: "owner",
    action: historicalCompleted ? "historical-request-created" : "in-person-request-created",
    targetType: "request",
    targetId: stored.id,
    summary: historicalCompleted ? `${stored.requestCode} logged as a completed historical custom request.` : `${stored.requestCode} created by owner with tracking stage ${ownerTrackingStatusLabels[ownerTrackingStatus]}${stored.customerAccountId ? " and linked to a verified customer account" : stored.email ? " for guest/account tracking by email" : ""}.`,
    ipHash: requestIpHash(request),
  });
  const message = historicalCompleted
    ? `${stored.requestCode} logged as a completed historical request with cost and profit data.`
    : stored.customerAccountId
    ? `${stored.requestCode} added and linked to the customer account.`
    : stored.email
      ? `${stored.requestCode} added. The customer can track it by secure email link and it will link automatically after account verification with the same email.`
      : `${stored.requestCode} added to the request board.`;
  return NextResponse.json({ request: stored, message }, { status: 201 });
}
