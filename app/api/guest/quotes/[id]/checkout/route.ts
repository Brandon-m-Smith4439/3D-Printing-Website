import { NextRequest, NextResponse } from "next/server";
import { guestRequestFromRequest } from "@/lib/guest-access";
import { sameOrigin } from "@/lib/owner-api";
import { markQuoteCheckoutSession, quoteById, recordQuoteDepositPayment } from "@/lib/quote-store";
import { updateStoredRequest } from "@/lib/request-store";
import { createDepositCheckout } from "@/lib/stripe-checkout";
import { requestIpHash, writeAudit } from "@/lib/audit-log";
import { notifyCustomer } from "@/lib/customer-notifications";
import { quoteDepositOutstandingCents, quoteNetDepositPaidCents } from "@/lib/quote-types";

export async function POST(request:NextRequest,context:{params:Promise<{id:string}>}){
  const guest=await guestRequestFromRequest(request);if(!guest)return NextResponse.json({message:"Open the secure request link from your email again."},{status:401});
  if(!sameOrigin(request))return NextResponse.json({message:"Request origin was not accepted."},{status:403});
  const {id}=await context.params;const quote=await quoteById(id);
  if(!quote||quote.requestId!==guest.id||quote.customerAccountId)return NextResponse.json({message:"Quote not found."},{status:404});
  if(quote.status!=="approved")return NextResponse.json({message:"Approve the quote and terms before paying the deposit."},{status:409});
  if(quote.paymentMethod==="cash")return NextResponse.json({message:"This pickup order uses a local payment method. Follow the private payment instructions from Mesh Harbor 3D instead of opening Stripe Checkout."},{status:409});
  const outstandingCents=quoteDepositOutstandingCents(quote);if(outstandingCents<=0)return NextResponse.json({message:"No additional deposit payment is due for this quote revision."},{status:409});
  const priorPaidCents=quoteNetDepositPaidCents(quote);
  const checkout=await createDepositCheckout({quote,email:guest.email,requestCode:guest.requestCode,amountCents:outstandingCents});
  await markQuoteCheckoutSession(quote.id,checkout.id,outstandingCents);
  if(process.env.NODE_ENV!=="production"&&checkout.id.startsWith("cs_dev_")){const recorded=await recordQuoteDepositPayment(quote.id,{sessionId:checkout.id,paymentIntentId:`pi_dev_${quote.id}_r${quote.revision}`,amountCents:outstandingCents,revision:quote.revision});if(recorded?.status==="deposit-paid"){const updated=await updateStoredRequest(guest.id,{status:"deposit-paid"});if(updated)await notifyCustomer(updated,"Development test: your deposit adjustment was simulated as received. This does not charge a real card.",{email:false});}}
  await writeAudit({actor:"customer",actorId:"guest-email",action:"deposit-checkout-created",targetType:"quote",targetId:quote.id,summary:`${priorPaidCents>0?"Additional deposit":"Deposit"} checkout created for guest request ${guest.requestCode}: $${(outstandingCents/100).toFixed(2)}.`,ipHash:requestIpHash(request)});
  return NextResponse.json({url:checkout.url});
}
