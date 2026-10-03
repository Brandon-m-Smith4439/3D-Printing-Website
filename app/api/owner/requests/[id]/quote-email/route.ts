import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requestIsOwner } from "@/lib/owner-auth";
import { sameOrigin } from "@/lib/owner-api";
import { getStoredRequest } from "@/lib/request-store";
import { quoteForRequest } from "@/lib/quote-store";
import { notifyCustomer } from "@/lib/customer-notifications";
import { requestIpHash, writeAudit } from "@/lib/audit-log";

// Retry delivery of the current quote without creating another revision or
// invalidating customer approval. One explicit retry is one logical send; its
// internal transport retries share an idempotency key.
export async function POST(request:NextRequest,context:{params:Promise<{id:string}>}){
  if(!await requestIsOwner(request))return NextResponse.json({message:"Sign in required."},{status:401});
  if(!sameOrigin(request))return NextResponse.json({message:"Request origin was not accepted."},{status:403});
  const {id}=await context.params;
  const [source,quote]=await Promise.all([getStoredRequest(id),quoteForRequest(id)]);
  if(!source||!quote||quote.status!=="sent")return NextResponse.json({message:"Only a current sent quote can be emailed again."},{status:409});
  const delivery=await notifyCustomer(source,`Quote revision ${quote.revision} is ready for review. ${quote.fulfillmentMode==="shipping"&&!quote.shippingSelection?"Production subtotal":"Total"}: $${(quote.totalCents/100).toFixed(2)}. Open your secure request to review the details and approve, decline, or propose a different price.`,{forceEmail:true,notificationId:`quote-${quote.id}-r${quote.revision}`,emailIdempotencyKey:`quote-retry-${randomUUID()}`,subject:`${source.requestCode} quote ready for review`});
  await writeAudit({actor:"owner",actorId:"owner",action:delivery.emailStatus==="sent"?"quote-email-retried":"quote-email-failed",targetType:"request",targetId:id,summary:`Quote email retry for ${source.requestCode}: ${delivery.emailStatus}.`,ipHash:requestIpHash(request)});
  return NextResponse.json({emailStatus:delivery.emailStatus,message:delivery.emailStatus==="sent"?"Quote email accepted by the email service. Quote revision was preserved.":"Quote remains saved, but the email could not be sent. Check the email configuration."},{status:delivery.emailStatus==="sent"?200:502});
}
