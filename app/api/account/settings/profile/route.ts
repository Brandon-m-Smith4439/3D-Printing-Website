import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { customerFromRequest } from "@/lib/customer-auth";
import { findCustomerById, updateCustomerProfile } from "@/lib/customer-store";
import { sameOrigin } from "@/lib/owner-api";
import { requestIpHash, writeAudit } from "@/lib/audit-log";

const schema = z.object({ displayName: z.string().trim().min(2).max(80), emailStatusUpdates: z.boolean(), showQueuePosition: z.boolean() });
export async function PATCH(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ message: "Request origin was not accepted." }, { status: 403 });
  const customer = await customerFromRequest(request);
  if (!customer) return NextResponse.json({ message: "Sign in required." }, { status: 401 });
  const account = await findCustomerById(customer.id);
  if (!account) return NextResponse.json({ message: "Account not found." }, { status: 404 });
  if (!account.emailVerifiedAt) return NextResponse.json({ message: "Verify your email before changing account settings." }, { status: 403 });
  let body: unknown; try { body = await request.json(); } catch { return NextResponse.json({ message: "Invalid settings request." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Please check your account preferences." }, { status: 400 });
  const updated = await updateCustomerProfile(account.id, { displayName: parsed.data.displayName, preferences: { emailStatusUpdates: parsed.data.emailStatusUpdates, showQueuePosition: parsed.data.showQueuePosition } });
  await writeAudit({ actor:"customer", actorId:account.id, action:"profile-updated", targetType:"account", targetId:account.id, summary:"Customer profile preferences updated.", ipHash:requestIpHash(request) });
  return NextResponse.json({ account: updated });
}
