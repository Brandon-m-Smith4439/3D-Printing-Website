import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { findCustomerByEmail } from "@/lib/customer-store";
import { createVerificationToken } from "@/lib/customer-verification";
import { sendPasswordResetEmail } from "@/lib/account-email";
import { sameOrigin } from "@/lib/owner-api";
import { requestIpHash, writeAudit } from "@/lib/audit-log";

const schema = z.object({ email: z.string().trim().email().max(160) });
const buckets = new Map<string,{count:number;resetAt:number}>();
function limited(key:string){const now=Date.now();const b=buckets.get(key);if(!b||b.resetAt<=now){buckets.set(key,{count:1,resetAt:now+15*60_000});return false;}b.count++;return b.count>5;}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ message: "Request origin was not accepted." }, { status: 403 });
  const key = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  if (limited(key)) return NextResponse.json({ message: "If an eligible account exists, reset instructions will be sent shortly." });
  let body: unknown; try { body = await request.json(); } catch { return NextResponse.json({ message: "Invalid request." }, { status: 400 }); }
  const parsed = schema.safeParse(body); if (!parsed.success) return NextResponse.json({ message: "Enter a valid email address." }, { status: 400 });
  const account = await findCustomerByEmail(parsed.data.email);
  let developmentUrl = "";
  if (account?.emailVerifiedAt) {
    const { token } = await createVerificationToken(account.id, "password-reset", account.email);
    const delivery = await sendPasswordResetEmail({ email: account.email, displayName: account.displayName, token }).catch(() => ({ sent:false, developmentUrl:"" }));
    developmentUrl = process.env.NODE_ENV !== "production" ? delivery.developmentUrl : "";
    await writeAudit({ actor:"customer", actorId:account.id, action:"password-reset-requested", targetType:"customer", targetId:account.id, summary:"Password reset requested.", ipHash:requestIpHash(request) });
  }
  return NextResponse.json({ message: "If an eligible account exists, reset instructions will be sent shortly.", developmentUrl });
}
