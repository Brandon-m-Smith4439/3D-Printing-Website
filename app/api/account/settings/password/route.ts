import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createCustomerSession, customerFromRequest, setCustomerCookie } from "@/lib/customer-auth";
import { findCustomerById, replaceCustomerPassword, verifyCustomerPassword } from "@/lib/customer-store";
import { sameOrigin } from "@/lib/owner-api";
import { requestIpHash, writeAudit } from "@/lib/audit-log";

const schema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: z.string().min(10).max(128) });
const attempts = new Map<string, { count: number; resetAt: number }>();
function tooMany(id: string) { const now=Date.now(); const current=attempts.get(id); if(!current || current.resetAt<=now){attempts.set(id,{count:1,resetAt:now+15*60_000}); return false;} current.count+=1; return current.count>6; }
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ message: "Request origin was not accepted." }, { status: 403 });
  const customer = await customerFromRequest(request);
  if (!customer) return NextResponse.json({ message: "Sign in required." }, { status: 401 });
  const account = await findCustomerById(customer.id);
  if (!account) return NextResponse.json({ message: "Account not found." }, { status: 404 });
  if (!account.emailVerifiedAt) return NextResponse.json({ message: "Verify your email before changing your password." }, { status: 403 });
  if (tooMany(account.id)) return NextResponse.json({ message: "Too many password-change attempts. Try again later." }, { status: 429 });
  let body: unknown; try { body = await request.json(); } catch { return NextResponse.json({ message: "Invalid password-change request." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "New passwords must be at least 10 characters." }, { status: 400 });
  if (!(await verifyCustomerPassword(account, parsed.data.currentPassword))) return NextResponse.json({ message: "Current password is incorrect." }, { status: 401 });
  if (await verifyCustomerPassword(account, parsed.data.newPassword)) return NextResponse.json({ message: "Choose a password different from your current password." }, { status: 400 });
  attempts.delete(account.id);
  const updated = await replaceCustomerPassword(account.id, parsed.data.newPassword);
  if (!updated) return NextResponse.json({ message: "Could not update password." }, { status: 500 });
  await writeAudit({ actor:"customer", actorId:account.id, action:"password-changed", targetType:"account", targetId:account.id, summary:"Customer password changed; previous sessions revoked.", ipHash:requestIpHash(request) });
  const response = NextResponse.json({ message: "Password changed successfully. Other signed-in sessions have been revoked." });
  setCustomerCookie(response, createCustomerSession(updated.id, updated.sessionVersion));
  return response;
}
