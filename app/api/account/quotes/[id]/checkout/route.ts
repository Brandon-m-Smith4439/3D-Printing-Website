import { NextRequest, NextResponse } from "next/server";
import { customerFromRequest } from "@/lib/customer-auth";
import { sameOrigin } from "@/lib/owner-api";
import { markQuoteCheckoutSession, markQuoteDepositPaid, quoteById } from "@/lib/quote-store";
import { getStoredRequest, updateStoredRequest } from "@/lib/request-store";
import { createDepositCheckout } from "@/lib/stripe-checkout";
import { requestIpHash, writeAudit } from "@/lib/audit-log";
import { notifyCustomer } from "@/lib/customer-notifications";

export async function POST(request:NextRequest,context:{params:Promise<{id:string}>}){
  const customer=await customerFromRequest(request);if(!customer)return NextResponse.json({message:"Sign in required."},{status:401});
  if(!customer.emailVerified)return NextResponse.json({message:"Verify your email before paying a deposit."},{status:403});
  if(!sameOrigin(request))return NextResponse.json({message:"Request origin was not accepted."},{status:403});
  const {id}=await context.params;const quote=await quoteById(id);if(!quote||quote.customerAccountId!==customer.id)return NextResponse.json({message:"Quote not found."},{status:404});
  if(quote.status==="deposit-paid")return NextResponse.json({message:"This deposit is already paid."},{status:409});
  if(quote.status!=="approved")return NextResponse.json({message:"Approve the quote and terms before paying the deposit."},{status:409});
  const source=await getStoredRequest(quote.requestId);if(!source)return NextResponse.json({message:"Request not found."},{status:404});
  const checkout=await createDepositCheckout({quote,email:customer.email,requestCode:source.requestCode});
  await markQuoteCheckoutSession(quote.id,checkout.id);
  if (process.env.NODE_ENV !== "production" && checkout.id.startsWith("cs_dev_")) {
    await markQuoteDepositPaid(quote.id, checkout.id);
    const updated = await updateStoredRequest(source.id,{status:"deposit-paid"});
    if(updated)await notifyCustomer(updated,"Development test: your 50% deposit was simulated as received. This does not charge a real card.",{email:false});
  }
  await writeAudit({actor:"customer",actorId:customer.id,action:"deposit-checkout-created",targetType:"quote",targetId:quote.id,summary:`Deposit checkout created for ${source.requestCode}.`,ipHash:requestIpHash(request)});
  return NextResponse.json({url:checkout.url});
}
