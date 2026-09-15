import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { consumeVerificationToken } from "@/lib/customer-verification";
import { customerEmailInUse, findCustomerById, markCustomerEmailVerified, updateCustomerEmail } from "@/lib/customer-store";
import { sameOrigin } from "@/lib/owner-api";
import { claimGuestRequestsByEmail } from "@/lib/request-store";
import { requestIpHash, writeAudit } from "@/lib/audit-log";

export const runtime = "nodejs";
const schema = z.object({ token: z.string().min(20).max(256) });

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ message: "Request origin was not accepted." }, { status: 403 });
  let body: unknown; try { body = await request.json(); } catch { return NextResponse.json({ message: "Invalid verification request." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Verification link is invalid." }, { status: 400 });
  const consumed = await consumeVerificationToken(parsed.data.token, ["verify-email", "change-email"]);
  if (!consumed.record) {
    const message = consumed.reason === "expired" ? "This verification link has expired." : consumed.reason === "used" ? "This verification link has already been used." : "Verification link is invalid.";
    return NextResponse.json({ message }, { status: 400 });
  }
  const record = consumed.record;
  const account = await findCustomerById(record.customerId);
  if (!account) return NextResponse.json({ message: "Account no longer exists." }, { status: 404 });
  if (record.purpose === "verify-email") {
    if (account.email !== record.email) return NextResponse.json({ message: "This verification link no longer matches the account email." }, { status: 409 });
    const updated = await markCustomerEmailVerified(account.id, record.email);
    const claimed = updated ? await claimGuestRequestsByEmail(account.id, record.email) : 0;
    if(updated)await writeAudit({ actor:"customer", actorId:account.id, action:"email-verified", targetType:"account", targetId:account.id, summary:`Customer email verified${claimed ? `; ${claimed} matching guest request(s) linked after email ownership was proven` : ""}.`, ipHash:requestIpHash(request) });
    return NextResponse.json({ message: updated ? "Email verified successfully." : "Could not verify email." }, { status: updated ? 200 : 409 });
  }
  if (await customerEmailInUse(record.email, account.id)) return NextResponse.json({ message: "That email is already used by another account." }, { status: 409 });
  const updated = await updateCustomerEmail(account.id, record.email);
  const claimed = updated ? await claimGuestRequestsByEmail(account.id, record.email) : 0;
  if(updated)await writeAudit({ actor:"customer", actorId:account.id, action:"email-changed", targetType:"account", targetId:account.id, summary:`Customer email changed after verification${claimed ? `; ${claimed} matching guest request(s) linked` : ""}.`, ipHash:requestIpHash(request) });
  return NextResponse.json({ message: updated ? "New email verified and saved." : "Could not update email." }, { status: updated ? 200 : 409 });
}
