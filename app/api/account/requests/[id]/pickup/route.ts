import { NextRequest, NextResponse } from "next/server";
import { customerFromRequest } from "@/lib/customer-auth";
import { sameOrigin } from "@/lib/owner-api";
import { requestIpHash, writeAudit } from "@/lib/audit-log";
import { getStoredRequest } from "@/lib/request-store";
import { quoteForRequest } from "@/lib/quote-store";
import { readQueue } from "@/lib/queue-store";
import { finalInvoiceForRequest } from "@/lib/final-invoice-store";
import { finalInvoicePaid } from "@/lib/final-invoice-types";
import { getSiteContent } from "@/lib/site-content-store";
import { availablePickupSlots, pickupSlotId } from "@/lib/pickup-schedule";
import { activePickupForRequest, cancelPickup, readPickupAppointments, schedulePickup } from "@/lib/pickup-store";
import { pickupBookingSchema } from "@/lib/pickup-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function contextForCustomer(request: NextRequest, requestId: string) {
  const customer = await customerFromRequest(request);
  if (!customer) return { error: NextResponse.json({ message: "Sign in required." }, { status: 401 }) };
  const stored = await getStoredRequest(requestId);
  if (!stored || stored.customerAccountId !== customer.id) return { error: NextResponse.json({ message: "Request not found." }, { status: 404 }) };
  const [quote, queue, content, appointments, invoice] = await Promise.all([
    quoteForRequest(stored.id),
    readQueue(),
    getSiteContent(),
    readPickupAppointments(),
    finalInvoiceForRequest(stored.id),
  ]);
  const job = stored.queueJobId ? queue.find((item) => item.id === stored.queueJobId) || null : null;
  const appointment = appointments.find((item) => item.requestId === stored.id && item.status === "scheduled") || null;
  const eligible = Boolean(quote?.fulfillmentMode === "pickup" && job?.status === "ready");
  const configured = Boolean(content.pickup.enabled && content.pickup.street1 && content.pickup.city && content.pickup.state && content.pickup.zip);
  const slots = eligible && configured ? availablePickupSlots(content.pickup, appointments, content.businessTimeZone) : [];
  return { customer, stored, quote, job, content, appointment, invoice, eligible, configured, slots };
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const data = await contextForCustomer(request, id);
  if ("error" in data) return data.error;
  const reason = data.quote?.fulfillmentMode !== "pickup"
    ? "This order is not set for local pickup."
    : data.job?.status !== "ready"
      ? "Pickup scheduling opens when your order is marked Ready."
      : !data.configured
        ? "Pickup scheduling is temporarily unavailable while the pickup location is being confirmed."
        : "";
  return NextResponse.json({
    eligible: data.eligible && data.configured,
    reason,
    publicLocation: {
      locationName: data.content.pickup.locationName,
      publicArea: data.content.pickup.publicArea,
    },
    timeZone: data.content.businessTimeZone,
    slots: data.slots,
    appointment: data.appointment,
    finalBalancePaid: finalInvoicePaid(data.invoice),
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return NextResponse.json({ message: "Request origin was not accepted." }, { status: 403 });
  const { id } = await context.params;
  const data = await contextForCustomer(request, id);
  if ("error" in data) return data.error;
  if (!data.customer.emailVerified) return NextResponse.json({ message: "Verify your email before scheduling pickup." }, { status: 403 });
  if (!data.eligible || !data.configured || !data.quote) return NextResponse.json({ message: "Pickup scheduling is not available for this order yet." }, { status: 409 });
  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 2_000) return NextResponse.json({ message: "Pickup selection is too large." }, { status: 413 });
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ message: "Invalid pickup selection." }, { status: 400 });
  }
  const parsed = pickupBookingSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Choose a valid pickup time." }, { status: 400 });
  const slot = data.slots.find((item) => item.id === parsed.data.slotId);
  const existing = await activePickupForRequest(data.stored.id);
  const existingSlotId = existing ? pickupSlotId(existing.slotDate, existing.slotTime) : "";
  if (!slot && parsed.data.slotId !== existingSlotId) return NextResponse.json({ message: "That pickup time is no longer available. Choose another slot." }, { status: 409 });
  const selected = slot || (existing ? { date: existing.slotDate, time: existing.slotTime } : null);
  if (!selected) return NextResponse.json({ message: "Choose a valid pickup time." }, { status: 400 });

  const result = await schedulePickup({
    requestId: data.stored.id,
    quoteId: data.quote.id,
    requestCode: data.stored.requestCode,
    customerAccountId: data.customer.id,
    slotDate: selected.date,
    slotTime: selected.time,
    timeZone: data.content.businessTimeZone,
    location: {
      locationName: data.content.pickup.locationName,
      street1: data.content.pickup.street1,
      street2: data.content.pickup.street2,
      city: data.content.pickup.city,
      state: data.content.pickup.state,
      zip: data.content.pickup.zip,
      country: "US",
      instructions: data.content.pickup.instructions,
    },
  });
  if (result.conflict || !result.appointment) return NextResponse.json({ message: "That pickup time was just booked. Choose another slot." }, { status: 409 });
  await writeAudit({
    actor: "customer",
    actorId: data.customer.id,
    action: existing ? "pickup-rescheduled" : "pickup-scheduled",
    targetType: "request",
    targetId: data.stored.id,
    summary: `${data.stored.requestCode} pickup ${existing ? "rescheduled" : "scheduled"} for ${result.appointment.slotDate} at ${result.appointment.slotTime}.`,
    ipHash: requestIpHash(request),
  });
  return NextResponse.json({ appointment: result.appointment, message: existing ? "Pickup time updated." : "Pickup time scheduled." });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return NextResponse.json({ message: "Request origin was not accepted." }, { status: 403 });
  const { id } = await context.params;
  const data = await contextForCustomer(request, id);
  if ("error" in data) return data.error;
  if (!data.customer.emailVerified) return NextResponse.json({ message: "Verify your email before changing pickup." }, { status: 403 });
  const cancelled = await cancelPickup(data.stored.id, data.customer.id);
  if (!cancelled) return NextResponse.json({ message: "No scheduled pickup was found." }, { status: 404 });
  await writeAudit({
    actor: "customer",
    actorId: data.customer.id,
    action: "pickup-cancelled",
    targetType: "request",
    targetId: data.stored.id,
    summary: `${data.stored.requestCode} pickup appointment cancelled by customer.`,
    ipHash: requestIpHash(request),
  });
  return NextResponse.json({ message: "Pickup appointment cancelled." });
}
