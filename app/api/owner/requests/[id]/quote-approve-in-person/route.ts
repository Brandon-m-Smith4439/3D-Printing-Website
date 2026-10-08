import { NextRequest, NextResponse } from "next/server";
import { requestIsOwner } from "@/lib/owner-auth";
import { sameOrigin } from "@/lib/owner-api";
import { approveQuoteInPerson, markQuoteDepositSatisfied, quoteForRequest } from "@/lib/quote-store";
import { getStoredRequest, updateStoredRequest } from "@/lib/request-store";
import { quoteDepositOutstandingCents, quoteDepositRefundDueCents, quoteNetDepositPaidCents } from "@/lib/quote-types";
import { reconcileQuoteDepositRefund } from "@/lib/quote-payment-adjustments";
import { CUSTOMER_POLICY_VERSION } from "@/lib/customer-policies";
import { notifyCustomer } from "@/lib/customer-notifications";
import { requestIpHash, writeAudit } from "@/lib/audit-log";

export async function POST(request:NextRequest,context:{params:Promise<{id:string}>}){
  if(!await requestIsOwner(request))return NextResponse.json({message:"Sign in required."},{status:401});
  if(!sameOrigin(request))return NextResponse.json({message:"Request origin was not accepted."},{status:403});
  const {id}=await context.params;const source=await getStoredRequest(id);if(!source)return NextResponse.json({message:"Request not found."},{status:404});
  if(source.source!=="owner")return NextResponse.json({message:"In-person owner approval is only available for requests created by the owner."},{status:409});
  if(source.fulfillmentMethod==="unsure"||!source.assemblyPreference||source.assemblyPreference==="unsure")return NextResponse.json({message:"Confirm the customer fulfillment and assembly choices on the request before recording approval."},{status:409});
  let quote=await quoteForRequest(source.id);if(!quote)return NextResponse.json({message:"Save the quote before recording in-person approval."},{status:409});
  quote=await approveQuoteInPerson(quote.id,source.id,CUSTOMER_POLICY_VERSION);if(!quote)return NextResponse.json({message:"This quote is not ready for in-person approval."},{status:409});

  const paidBefore=quoteNetDepositPaidCents(quote);const refundDue=quoteDepositRefundDueCents(quote);
  if(refundDue>0){
    try{const result=await reconcileQuoteDepositRefund(quote.id);quote=result.quote;}catch(error){console.error("In-person quote refund reconciliation failed",error);}
  }else if(paidBefore>0&&quoteDepositOutstandingCents(quote)===0){quote=await markQuoteDepositSatisfied(quote.id)||quote;}
  const satisfied=quote.status==="deposit-paid";
  const updated=await updateStoredRequest(source.id,{status:satisfied?"deposit-paid":"accepted",ownerTrackingStatus:satisfied?"deposit-paid":"accepted"});
  if(updated&&updated.email.trim())await notifyCustomer(updated,`Mesh Harbor 3D recorded your in-person approval for quote revision ${quote.revision}. ${satisfied?"Your deposit requirement is already satisfied.":"The 50% deposit is required before production begins."}`,{forceEmail:true,subject:`${updated.requestCode} in-person quote approval recorded`});
  await writeAudit({actor:"owner",actorId:"owner",action:"quote-approved-in-person",targetType:"quote",targetId:quote.id,summary:`Owner recorded in-person customer approval for ${source.requestCode}, quote revision ${quote.revision}.`,ipHash:requestIpHash(request)});
  return NextResponse.json({quote,message:satisfied?"In-person approval recorded; deposit requirement is satisfied.":"In-person approval recorded. Deposit is now required before production."});
}
