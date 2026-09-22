import { NextRequest, NextResponse } from "next/server";
import { verifyStripeWebhook } from "@/lib/stripe-checkout";
import { markQuoteDepositPaid, quoteById } from "@/lib/quote-store";
import { getStoredRequest, updateStoredRequest } from "@/lib/request-store";
import { notifyCustomer } from "@/lib/customer-notifications";
import { writeAudit } from "@/lib/audit-log";

type StripeCheckoutSession = {
  id?: unknown;
  payment_status?: unknown;
  amount_total?: unknown;
  currency?: unknown;
  metadata?: { quote_id?: unknown };
};
type StripeEvent = {
  type?: unknown;
  data?: { object?: StripeCheckoutSession };
};

export const runtime="nodejs";
export async function POST(request:NextRequest){
  const raw=await request.text();
  if(!verifyStripeWebhook(raw,request.headers.get("stripe-signature")))return NextResponse.json({message:"Invalid webhook signature."},{status:400});
  let event:StripeEvent;try{event=JSON.parse(raw) as StripeEvent;}catch{return NextResponse.json({message:"Invalid webhook payload."},{status:400});}
  const eventType=typeof event.type==="string"?event.type:"";
  if(eventType==="checkout.session.completed"||eventType==="checkout.session.async_payment_succeeded"){
    const session=event.data?.object;const quoteId=session?.metadata?.quote_id;const sessionId=session?.id;const paymentStatus=session?.payment_status;
    if(typeof quoteId==="string"&&typeof sessionId==="string"&&(paymentStatus==="paid"||eventType==="checkout.session.async_payment_succeeded")){
      const before=await quoteById(quoteId);
      if(before && (Number(session?.amount_total)!==before.depositCents || String(session?.currency||"").toLowerCase()!==before.currency)) return NextResponse.json({message:"Payment amount did not match the stored quote."},{status:400});
      if(!before?.depositPaidAt){const quote=await markQuoteDepositPaid(quoteId,sessionId);
      if(quote){const source=await getStoredRequest(quote.requestId);if(source){const updated=await updateStoredRequest(source.id,{status:"deposit-paid"});if(updated)await notifyCustomer(updated,"Your 50% deposit was received. Your request is now ready for the owner to schedule into production.");await writeAudit({actor:"system",actorId:"stripe",action:"deposit-paid",targetType:"quote",targetId:quote.id,summary:`Stripe confirmed the deposit for ${source.requestCode}.`,ipHash:""});}}}
    }
  }
  return NextResponse.json({received:true});
}
